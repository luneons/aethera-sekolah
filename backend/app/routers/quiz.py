"""Quiz online endpoints — guru: kelola soal & monitor; siswa: kerjakan."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    Assignment,
    QuizAttempt,
    QuizQuestion,
    SchoolClass,
    User,
)
from app.schemas import Envelope
from app.security import get_current_user, require_roles
from app.services.notification_service import notify_user
from app.services.quiz_service import (
    apply_lock,
    auto_submit_if_finished,
    grade_attempt,
    persist_grade,
    scale_score,
    server_now,
    shuffle_questions_for,
)


router = APIRouter(prefix="/quiz", tags=["Quiz"])


# ─── Schemas ────────────────────────────────────────────────────────────────


class QuestionIn(BaseModel):
    question_type: str = Field(..., pattern="^(mcq|tf|essay)$")
    body: str = Field(..., min_length=1, max_length=2000)
    options: Optional[list[str]] = None
    correct_value: Optional[str] = None  # "0".."4" or "true"/"false"
    points: float = Field(default=1.0, ge=0.0, le=100.0)
    explanation: Optional[str] = None


class QuestionOut(QuestionIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    order_index: int


class AttemptStateOut(BaseModel):
    id: int
    assignment_id: int
    status: str
    started_at: datetime
    deadline_at: Optional[datetime] = None
    locked_until: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    focus_violations: int
    answers: dict[str, str] = {}
    raw_score: Optional[float] = None
    final_score: Optional[float] = None
    duration_minutes: Optional[int] = None
    max_focus_violations: int
    lock_duration_minutes: int


class StudentQuizQuestion(BaseModel):
    """Versi untuk siswa — TANPA correct_value & explanation supaya tidak bocor."""

    id: int
    question_type: str
    body: str
    options: Optional[list[str]] = None
    points: float
    order_index: int


class QuizPlayPayload(BaseModel):
    attempt: AttemptStateOut
    questions: list[StudentQuizQuestion]
    assignment_title: str
    duration_minutes: Optional[int] = None


class AnswerSaveIn(BaseModel):
    question_id: int
    answer: Optional[str] = None  # "0", "true", or essay text


class FocusViolationIn(BaseModel):
    reason: str = Field(default="visibility_change", max_length=80)


class ProctorStudentRow(BaseModel):
    student_id: int
    student_name: str
    nis: str
    status: str
    focus_violations: int
    locked_until: Optional[datetime] = None
    started_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    final_score: Optional[float] = None


# ─── Helpers ────────────────────────────────────────────────────────────────


async def _get_assignment_or_404(
    db: AsyncSession, assignment_id: int, current: User
) -> Assignment:
    asg = await db.get(Assignment, assignment_id)
    if not asg or asg.org_id != current.org_id:
        raise HTTPException(404, "Tugas tidak ditemukan")
    if asg.mode != "quiz":
        raise HTTPException(400, "Tugas ini bukan mode quiz online")
    return asg


def _ensure_teacher_can_manage(asg: Assignment, current: User) -> None:
    if current.role == "super_admin":
        return
    if current.role in ("admin", "hr") and asg.teacher_id == current.id:
        return
    raise HTTPException(403, "Hanya pembuat soal atau kepsek yang bisa ubah")


# ─── Manage Questions (guru) ────────────────────────────────────────────────


@router.get(
    "/assignments/{assignment_id}/questions", response_model=Envelope[list[QuestionOut]]
)
async def list_questions(
    assignment_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    asg = await _get_assignment_or_404(db, assignment_id, current)
    # Siswa di kelas itu boleh lihat (tapi dapat versi siswa). Untuk endpoint
    # ini dibatasi staff saja.
    if current.role == "employee":
        raise HTTPException(403, "Endpoint ini untuk guru")
    rows = (
        await db.execute(
            select(QuizQuestion)
            .where(QuizQuestion.assignment_id == asg.id)
            .order_by(QuizQuestion.order_index, QuizQuestion.id)
        )
    ).scalars().all()
    return {
        "success": True,
        "data": [QuestionOut.model_validate(r) for r in rows],
    }


@router.post(
    "/assignments/{assignment_id}/questions",
    response_model=Envelope[list[QuestionOut]],
)
async def replace_questions(
    assignment_id: int,
    payload: list[QuestionIn],
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Replace seluruh soal (idempotent — ganti, bukan tambah)."""
    asg = await _get_assignment_or_404(db, assignment_id, current)
    _ensure_teacher_can_manage(asg, current)

    # Cek attempt aktif — kalau sudah ada yang in_progress, tolak
    in_progress = (
        await db.execute(
            select(QuizAttempt).where(
                QuizAttempt.assignment_id == asg.id,
                QuizAttempt.status.in_(["in_progress", "locked", "unlocked_by_teacher"]),
            ).limit(1)
        )
    ).scalar_one_or_none()
    if in_progress:
        raise HTTPException(
            400,
            "Tidak bisa edit soal: ada siswa sedang mengerjakan. Tunggu submit dulu.",
        )

    # Hapus soal lama
    olds = (
        await db.execute(
            select(QuizQuestion).where(QuizQuestion.assignment_id == asg.id)
        )
    ).scalars().all()
    for q in olds:
        await db.delete(q)

    saved: list[QuizQuestion] = []
    for idx, q in enumerate(payload):
        if q.question_type == "mcq":
            if not q.options or len(q.options) < 2:
                raise HTTPException(422, f"Soal #{idx+1}: MCQ butuh minimal 2 opsi")
            if q.correct_value is None:
                raise HTTPException(422, f"Soal #{idx+1}: belum ada jawaban benar")
            try:
                ci = int(q.correct_value)
            except ValueError:
                raise HTTPException(422, f"Soal #{idx+1}: correct_value harus index angka")
            if ci < 0 or ci >= len(q.options):
                raise HTTPException(422, f"Soal #{idx+1}: index jawaban tidak valid")
        elif q.question_type == "tf":
            if (q.correct_value or "").lower() not in ("true", "false"):
                raise HTTPException(422, f"Soal #{idx+1}: jawaban TF harus 'true'/'false'")
        new_q = QuizQuestion(
            assignment_id=asg.id,
            order_index=idx,
            question_type=q.question_type,
            body=q.body,
            options=q.options,
            correct_value=q.correct_value,
            points=q.points,
            explanation=q.explanation,
        )
        db.add(new_q)
        saved.append(new_q)

    await db.flush()
    await db.commit()
    rows = (
        await db.execute(
            select(QuizQuestion)
            .where(QuizQuestion.assignment_id == asg.id)
            .order_by(QuizQuestion.order_index, QuizQuestion.id)
        )
    ).scalars().all()
    return {
        "success": True,
        "data": [QuestionOut.model_validate(r) for r in rows],
        "message": f"{len(rows)} soal disimpan",
    }


# ─── Quiz Player (siswa) ────────────────────────────────────────────────────


def _attempt_to_state(a: QuizAttempt, asg: Assignment) -> AttemptStateOut:
    # Datetime di DB disimpan sebagai server-local (Asia/Jakarta). Kita kasih
    # tag tzinfo Jakarta supaya frontend bisa parse jadi epoch yang benar
    # via toISOString() (akan jadi UTC otomatis).
    JKT = timezone(timedelta(hours=7))

    def _to_iso(d):
        if d is None:
            return None
        if d.tzinfo is None:
            return d.replace(tzinfo=JKT)
        return d

    return AttemptStateOut(
        id=a.id,
        assignment_id=a.assignment_id,
        status=a.status,
        started_at=_to_iso(a.started_at),
        deadline_at=_to_iso(a.deadline_at),
        locked_until=_to_iso(a.locked_until),
        submitted_at=_to_iso(a.submitted_at),
        focus_violations=a.focus_violations,
        answers={str(k): str(v) for k, v in (a.answers_json or {}).items()},
        raw_score=a.raw_score,
        final_score=a.final_score,
        duration_minutes=asg.duration_minutes,
        max_focus_violations=asg.max_focus_violations,
        lock_duration_minutes=asg.lock_duration_minutes,
    )


@router.post(
    "/assignments/{assignment_id}/start", response_model=Envelope[QuizPlayPayload]
)
async def start_attempt(
    assignment_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    asg = await _get_assignment_or_404(db, assignment_id, current)
    if current.role != "employee":
        raise HTTPException(403, "Hanya siswa yang bisa mulai quiz")
    if current.school_class_id != asg.school_class_id:
        raise HTTPException(403, "Quiz ini bukan untuk kelasmu")
    if not asg.is_published:
        raise HTTPException(400, "Quiz belum dipublish oleh guru")

    # Pastikan ada minimal 1 soal sebelum siswa boleh start
    qcount = (
        await db.execute(
            select(func.count(QuizQuestion.id)).where(
                QuizQuestion.assignment_id == asg.id
            )
        )
    ).scalar_one() or 0
    if qcount == 0:
        raise HTTPException(400, "Soal belum dibuat — hubungi guru")

    now = await server_now(db)
    if asg.open_at and now < asg.open_at:
        raise HTTPException(400, f"Quiz baru bisa dimulai pada {asg.open_at.isoformat()}")
    if asg.close_at and now > asg.close_at:
        raise HTTPException(400, "Quiz sudah ditutup")

    attempt = (
        await db.execute(
            select(QuizAttempt).where(
                QuizAttempt.assignment_id == asg.id,
                QuizAttempt.student_id == current.id,
            )
        )
    ).scalar_one_or_none()

    if attempt is None:
        deadline = (
            now + timedelta(minutes=asg.duration_minutes)
            if asg.duration_minutes
            else None
        )
        attempt = QuizAttempt(
            assignment_id=asg.id,
            student_id=current.id,
            status="in_progress",
            started_at=now,
            deadline_at=deadline,
            answers_json={},
        )
        db.add(attempt)
        await db.flush()
    else:
        if attempt.status in ("submitted", "auto_submitted"):
            # Sudah selesai, balikin state-nya
            pass
        elif attempt.status == "locked":
            # Cek apakah lock sudah expire → lanjut
            if attempt.locked_until and now >= attempt.locked_until:
                attempt.status = "in_progress"

    await db.commit()
    await db.refresh(attempt)

    # Timeout check — kalau deadline lewat dan masih in_progress, auto-submit
    submitted = await auto_submit_if_finished(db, attempt, asg)
    if submitted:
        await db.commit()

    questions = await shuffle_questions_for(db, asg, attempt)
    return {
        "success": True,
        "data": QuizPlayPayload(
            attempt=_attempt_to_state(attempt, asg),
            questions=[
                StudentQuizQuestion(
                    id=q.id,
                    question_type=q.question_type,
                    body=q.body,
                    options=q.options,
                    points=q.points,
                    order_index=q.order_index,
                )
                for q in questions
            ],
            assignment_title=asg.title,
            duration_minutes=asg.duration_minutes,
        ),
    }


def _ensure_attempt_active(attempt: QuizAttempt) -> None:
    if attempt.status in ("submitted", "auto_submitted"):
        raise HTTPException(400, "Quiz sudah disubmit")
    # locked check: bandingkan dengan naive datetime sekarang di server tz.
    # Karena attempt.locked_until disimpan tanpa tz, dan kita tidak tahu
    # tz-nya tanpa query DB, biarkan check ini sebagai best-effort.
    if attempt.status == "locked" and attempt.locked_until:
        now_naive = datetime.now()  # local server time = JKT
        if now_naive < attempt.locked_until:
            raise HTTPException(
                423,
                f"Akun masih terkunci sampai {attempt.locked_until.isoformat()}. "
                "Hubungi guru untuk unlock.",
            )


@router.post(
    "/assignments/{assignment_id}/answer", response_model=Envelope[AttemptStateOut]
)
async def save_answer(
    assignment_id: int,
    payload: AnswerSaveIn,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    asg = await _get_assignment_or_404(db, assignment_id, current)
    if current.role != "employee":
        raise HTTPException(403, "Hanya siswa")
    attempt = (
        await db.execute(
            select(QuizAttempt).where(
                QuizAttempt.assignment_id == asg.id,
                QuizAttempt.student_id == current.id,
            )
        )
    ).scalar_one_or_none()
    if not attempt:
        raise HTTPException(404, "Belum mulai quiz")
    _ensure_attempt_active(attempt)

    answers = dict(attempt.answers_json or {})
    answers[str(payload.question_id)] = payload.answer or ""
    attempt.answers_json = answers
    await db.commit()
    await db.refresh(attempt)
    return {"success": True, "data": _attempt_to_state(attempt, asg)}


@router.post(
    "/assignments/{assignment_id}/submit", response_model=Envelope[AttemptStateOut]
)
async def submit_attempt(
    assignment_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    asg = await _get_assignment_or_404(db, assignment_id, current)
    if current.role != "employee":
        raise HTTPException(403, "Hanya siswa")
    attempt = (
        await db.execute(
            select(QuizAttempt).where(
                QuizAttempt.assignment_id == asg.id,
                QuizAttempt.student_id == current.id,
            )
        )
    ).scalar_one_or_none()
    if not attempt:
        raise HTTPException(404, "Belum mulai quiz")
    if attempt.status in ("submitted", "auto_submitted"):
        return {"success": True, "data": _attempt_to_state(attempt, asg), "message": "Sudah disubmit"}

    questions = (
        await db.execute(
            select(QuizQuestion).where(QuizQuestion.assignment_id == asg.id)
        )
    ).scalars().all()
    raw, total = grade_attempt(list(questions), attempt.answers_json or {})
    attempt.raw_score = raw
    attempt.final_score = scale_score(raw, total, asg.max_score)
    attempt.status = "submitted"
    attempt.submitted_at = await server_now(db)
    await persist_grade(db, asg, attempt)
    await db.commit()
    await db.refresh(attempt)

    return {
        "success": True,
        "data": _attempt_to_state(attempt, asg),
        "message": f"Quiz disubmit. Skor: {attempt.final_score}",
    }


@router.post(
    "/assignments/{assignment_id}/violation",
    response_model=Envelope[AttemptStateOut],
)
async def report_violation(
    assignment_id: int,
    payload: FocusViolationIn,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Siswa lapor saat keluar dari layar / lose focus.

    Tiap lapor + 1 violation. Kalau melebihi `max_focus_violations`, attempt
    di-lock + notif guru.
    """
    asg = await _get_assignment_or_404(db, assignment_id, current)
    if current.role != "employee":
        raise HTTPException(403, "Hanya siswa")

    attempt = (
        await db.execute(
            select(QuizAttempt).where(
                QuizAttempt.assignment_id == asg.id,
                QuizAttempt.student_id == current.id,
            )
        )
    ).scalar_one_or_none()
    if not attempt:
        raise HTTPException(404, "Belum mulai quiz")
    if attempt.status in ("submitted", "auto_submitted"):
        return {"success": True, "data": _attempt_to_state(attempt, asg)}

    attempt.focus_violations = (attempt.focus_violations or 0) + 1

    if attempt.focus_violations > asg.max_focus_violations:
        await apply_lock(db, attempt, asg.lock_duration_minutes)
        await db.commit()
        # Notif ke guru — pakai notify_user
        try:
            await notify_user(
                db,
                asg.teacher_id,
                title=f"Siswa terkunci: {current.full_name}",
                body=(
                    f"{current.full_name} keluar dari layar quiz '{asg.title}' "
                    f"({attempt.focus_violations}× violation). "
                    f"Locked {asg.lock_duration_minutes} menit. "
                    "Buka /quiz/proctor untuk unlock."
                ),
                category="quiz_lock",
                url=f"/assignments/{asg.id}/proctor",
            )
        except Exception:
            pass
    else:
        await db.commit()

    await db.refresh(attempt)
    return {
        "success": True,
        "data": _attempt_to_state(attempt, asg),
        "message": (
            f"Pelanggaran ke-{attempt.focus_violations}. "
            f"Sisa toleransi: {max(0, asg.max_focus_violations - attempt.focus_violations)}"
        ),
    }


# ─── Proctor View (guru) ────────────────────────────────────────────────────


@router.get(
    "/assignments/{assignment_id}/proctor",
    response_model=Envelope[list[ProctorStudentRow]],
)
async def proctor_view(
    assignment_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Daftar siswa kelas + status quiz mereka."""
    asg = await _get_assignment_or_404(db, assignment_id, current)
    _ensure_teacher_can_manage(asg, current)

    students = (
        await db.execute(
            select(User).where(
                User.school_class_id == asg.school_class_id,
                User.role == "employee",
                User.status == "active",
            ).order_by(User.full_name)
        )
    ).scalars().all()
    attempts = (
        await db.execute(
            select(QuizAttempt).where(QuizAttempt.assignment_id == asg.id)
        )
    ).scalars().all()
    by_student = {a.student_id: a for a in attempts}

    rows: list[ProctorStudentRow] = []
    for s in students:
        a = by_student.get(s.id)
        rows.append(
            ProctorStudentRow(
                student_id=s.id,
                student_name=s.full_name,
                nis=s.employee_id,
                status=a.status if a else "not_started",
                focus_violations=a.focus_violations if a else 0,
                locked_until=a.locked_until if a else None,
                started_at=a.started_at if a else None,
                submitted_at=a.submitted_at if a else None,
                final_score=a.final_score if a else None,
            )
        )
    return {"success": True, "data": rows}


@router.post(
    "/assignments/{assignment_id}/unlock/{student_id}",
    response_model=Envelope[ProctorStudentRow],
)
async def unlock_student(
    assignment_id: int,
    student_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    asg = await _get_assignment_or_404(db, assignment_id, current)
    _ensure_teacher_can_manage(asg, current)

    attempt = (
        await db.execute(
            select(QuizAttempt).where(
                QuizAttempt.assignment_id == asg.id,
                QuizAttempt.student_id == student_id,
            )
        )
    ).scalar_one_or_none()
    if not attempt:
        raise HTTPException(404, "Siswa belum mulai quiz")

    if attempt.status not in ("locked", "unlocked_by_teacher"):
        raise HTTPException(400, f"Status saat ini '{attempt.status}', tidak perlu unlock")

    attempt.status = "unlocked_by_teacher"
    attempt.locked_until = None
    attempt.last_unlocked_by = current.id
    attempt.last_unlocked_at = await server_now(db)
    await db.commit()
    await db.refresh(attempt)

    student = await db.get(User, student_id)
    # Notif siswa: kamu sudah di-unlock
    try:
        await notify_user(
            db,
            student_id,
            title="Quiz dibuka kembali",
            body=f"Guru telah membuka kunci quiz '{asg.title}'. Lanjutkan pengerjaan.",
            category="quiz_unlock",
            url=f"/quiz/{asg.id}",
        )
    except Exception:
        pass

    return {
        "success": True,
        "data": ProctorStudentRow(
            student_id=student_id,
            student_name=student.full_name if student else "—",
            nis=student.employee_id if student else "—",
            status=attempt.status,
            focus_violations=attempt.focus_violations,
            locked_until=attempt.locked_until,
            started_at=attempt.started_at,
            submitted_at=attempt.submitted_at,
            final_score=attempt.final_score,
        ),
        "message": f"{student.full_name if student else 'Siswa'} di-unlock",
    }



# ─── Publish / Unpublish (guru) ──────────────────────────────────────────────


@router.post(
    "/assignments/{assignment_id}/publish",
    response_model=Envelope[dict],
)
async def publish_quiz(
    assignment_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Aktifkan quiz: siswa baru bisa lihat & dapat notifikasi setelah ini.

    Validasi:
    - Wajib ada minimal 1 soal
    - Total bobot soal harus > 0
    """
    from app.models import Subject
    from app.services.notification_service import notify_class

    asg = await _get_assignment_or_404(db, assignment_id, current)
    _ensure_teacher_can_manage(asg, current)

    questions = (
        await db.execute(
            select(QuizQuestion).where(QuizQuestion.assignment_id == asg.id)
        )
    ).scalars().all()

    if len(questions) == 0:
        raise HTTPException(400, "Tambahkan minimal 1 soal sebelum publish")

    total_points = sum((q.points or 0) for q in questions)
    if total_points <= 0:
        raise HTTPException(400, "Total bobot soal harus > 0")

    if asg.is_published:
        return {
            "success": True,
            "data": {"is_published": True},
            "message": "Quiz sudah ter-publish sebelumnya",
        }

    asg.is_published = True
    await db.commit()

    # Notif siswa kelas tersebut
    try:
        subj = await db.get(Subject, asg.subject_id)
        due_text = (
            f", deadline {asg.due_date.strftime('%d %b %Y')}"
            if asg.due_date
            else ""
        )
        durasi = f" · {asg.duration_minutes} menit" if asg.duration_minutes else ""
        await notify_class(
            db,
            asg.school_class_id,
            title=f"Quiz baru: {subj.name if subj else 'Mapel'}",
            body=f"{asg.title}{durasi}{due_text}",
            category="lms_assignment",
            url="/my-assignments",
        )
    except Exception:
        pass

    return {
        "success": True,
        "data": {"is_published": True, "questions": len(questions)},
        "message": f"Quiz '{asg.title}' aktif. {len(questions)} soal tersedia untuk siswa.",
    }


@router.post(
    "/assignments/{assignment_id}/unpublish",
    response_model=Envelope[dict],
)
async def unpublish_quiz(
    assignment_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Sembunyikan quiz dari siswa.

    Berguna kalau guru mau revisi soal setelah sempat publish. Catat:
    siswa yang sudah memulai attempt tetap bisa lanjut, tapi yang belum
    start tidak akan melihat quiz lagi.
    """
    asg = await _get_assignment_or_404(db, assignment_id, current)
    _ensure_teacher_can_manage(asg, current)

    if not asg.is_published:
        return {
            "success": True,
            "data": {"is_published": False},
            "message": "Quiz sudah dalam keadaan draft",
        }

    asg.is_published = False
    await db.commit()
    return {
        "success": True,
        "data": {"is_published": False},
        "message": f"Quiz '{asg.title}' diset ke DRAFT. Siswa baru tidak akan melihatnya.",
    }
