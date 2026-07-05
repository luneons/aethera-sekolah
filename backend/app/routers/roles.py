"""Endpoint khusus per-role (kepsek, wali kelas, BK).

Mount di /v1. Endpoint utama:

  Kepsek (super_admin):
    GET  /exec/dashboard
    GET  /exec/approvals
    POST /exec/approvals/{id}/decide
    POST /exec/homeroom-assignment

  Wali Kelas (admin):
    GET  /classroom/my-class

  BK (hr):
    GET  /bk/cases
    GET  /bk/notes/{student_id}
    POST /bk/notes/{student_id}
    DELETE /bk/notes/{note_id}
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import (
    AttendanceRecord,
    AuditLog,
    BkNote,
    DisciplineIncident,
    DisciplineProfile,
    MoodCheckIn,
    PendingApproval,
    SchoolClass,
    User,
    ViolationType,
)
from app.schemas import (
    ApprovalDecision,
    BkCaseOut,
    BkNoteIn,
    BkNoteOut,
    ClassPerformanceItem,
    Envelope,
    ExecDashboardOut,
    ExecKpi,
    HomeroomAssign,
    HomeroomClassOut,
    PendingApprovalOut,
    StudentDisciplineSummary,
    TrendPointSimple,
)
from app.security import get_current_user, require_roles
from app.services.discipline_service import (
    aggregate_classes,
    fetch_students_with_profile,
    parse_badges,
)
from app.services.gamification_service import level_for_xp


# ─── Shared Helpers ──────────────────────────────────────────────────────────


def _summary_lite(user: User, profile: DisciplineProfile) -> StudentDisciplineSummary:
    """Versi lite tanpa trend & XP details — untuk list endpoint."""
    payload = StudentDisciplineSummary(
        user_id=user.id,
        full_name=user.full_name,
        employee_id=user.employee_id,
        class_name=user.school_class.name if user.school_class else None,
        grade=user.school_class.grade if user.school_class else None,
        major=user.school_class.major if user.school_class else None,
        photo_url=user.photo_url,
        gpa=round(profile.gpa, 2),
        attitude_points=profile.attitude_points,
        appreciation_points=profile.appreciation_points,
        kersos_hours_owed=profile.kersos_hours_owed,
        lembur_hours_owed=profile.lembur_hours_owed,
        avg_arrival_offset_min=round(profile.avg_arrival_offset_min, 2),
        streak_days=profile.streak_days,
        badges=parse_badges(profile),
        trend=[],
        xp_total=profile.xp_total or 0,
        level_code=profile.level_code or "pemula",
    )
    return payload


# ═══ KEPSEK / SUPER ADMIN ═══════════════════════════════════════════════════

exec_router = APIRouter(prefix="/exec", tags=["Executive"])


@exec_router.get("/dashboard", response_model=Envelope[ExecDashboardOut])
async def exec_dashboard(
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Executive overview untuk kepsek — KPI sekolah-wide + ranking kelas."""
    org_id = current.org_id
    today = date.today()

    # ── KPI numerik ──────────────────────────────────────────────────────────
    total_students = (
        await db.execute(
            select(func.count())
            .select_from(User)
            .where(User.org_id == org_id, User.role == "employee", User.status == "active")
        )
    ).scalar_one() or 0

    total_classes = (
        await db.execute(
            select(func.count())
            .select_from(SchoolClass)
            .where(SchoolClass.org_id == org_id)
        )
    ).scalar_one() or 0

    # Today attendance breakdown
    today_stats = (
        await db.execute(
            select(
                func.sum(case((AttendanceRecord.status == "present", 1), else_=0)).label("present"),
                func.sum(case((AttendanceRecord.status == "late", 1), else_=0)).label("late"),
                func.sum(case((AttendanceRecord.status == "absent", 1), else_=0)).label("absent"),
            )
            .select_from(AttendanceRecord)
            .join(User, User.id == AttendanceRecord.user_id)
            .where(
                User.org_id == org_id,
                AttendanceRecord.attendance_date == today,
            )
        )
    ).one()

    pool = await fetch_students_with_profile(db, org_id=org_id)
    avg_attitude = (
        sum(p.attitude_points for _, p in pool) / len(pool) if pool else 0.0
    )
    total_appreciation = sum(p.appreciation_points for _, p in pool)
    watchlist_count = sum(1 for _, p in pool if p.attitude_points < 60)

    pending_count = (
        await db.execute(
            select(func.count())
            .select_from(PendingApproval)
            .where(PendingApproval.org_id == org_id, PendingApproval.status == "pending")
        )
    ).scalar_one() or 0

    kpi = ExecKpi(
        total_students=total_students,
        total_classes=total_classes,
        today_present=int(today_stats.present or 0),
        today_late=int(today_stats.late or 0),
        today_absent=int(today_stats.absent or 0),
        avg_attitude=round(avg_attitude, 2),
        total_appreciation=total_appreciation,
        pending_approvals=pending_count,
        watchlist_count=watchlist_count,
    )

    # ── Ranking kelas (reuse aggregator) ────────────────────────────────────
    class_rows = aggregate_classes(pool)
    # Compute attendance % hari ini per kelas
    class_today: dict[int, float] = {}
    if class_rows:
        per_class = (
            await db.execute(
                select(
                    User.school_class_id,
                    func.count().label("total"),
                    func.sum(
                        case((AttendanceRecord.status.in_(("present", "late")), 1), else_=0)
                    ).label("hadir"),
                )
                .select_from(User)
                .join(
                    AttendanceRecord,
                    (AttendanceRecord.user_id == User.id)
                    & (AttendanceRecord.attendance_date == today),
                    isouter=True,
                )
                .where(
                    User.org_id == org_id,
                    User.role == "employee",
                    User.status == "active",
                    User.school_class_id.isnot(None),
                )
                .group_by(User.school_class_id)
            )
        ).all()
        for cls_id, total, hadir in per_class:
            class_today[cls_id] = round(((hadir or 0) / total * 100) if total else 0, 1)

    def to_perf(item: dict) -> ClassPerformanceItem:
        return ClassPerformanceItem(
            class_id=item["class_id"],
            class_name=item["class_name"],
            avg_attitude=item["avg_attitude"],
            avg_gpa=item["avg_gpa"],
            today_attendance_pct=class_today.get(item["class_id"], 0.0),
        )

    top_classes = [to_perf(c) for c in class_rows[:3]]
    bottom_classes = [to_perf(c) for c in class_rows[-3:][::-1]] if len(class_rows) > 3 else []

    # ── Weekly attendance trend (7 hari terakhir) ──────────────────────────
    trend_points: list[dict] = []
    for offset in range(6, -1, -1):
        d = today - timedelta(days=offset)
        if d.weekday() >= 5:
            continue
        stats = (
            await db.execute(
                select(
                    func.sum(case((AttendanceRecord.status == "present", 1), else_=0)),
                    func.sum(case((AttendanceRecord.status == "late", 1), else_=0)),
                    func.sum(case((AttendanceRecord.status == "absent", 1), else_=0)),
                )
                .select_from(AttendanceRecord)
                .join(User, User.id == AttendanceRecord.user_id)
                .where(
                    User.org_id == org_id,
                    AttendanceRecord.attendance_date == d,
                )
            )
        ).one()
        trend_points.append({
            "date": d.isoformat(),
            "present": int(stats[0] or 0),
            "late": int(stats[1] or 0),
            "absent": int(stats[2] or 0),
        })

    return Envelope(data=ExecDashboardOut(
        kpi=kpi,
        top_classes=top_classes,
        bottom_classes=bottom_classes,
        weekly_attendance_trend=trend_points,
    ))


@exec_router.get("/approvals", response_model=Envelope[list[PendingApprovalOut]])
async def list_approvals(
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: Optional[str] = None,
):
    rows = (
        await db.execute(
            select(
                PendingApproval,
                User.full_name.label("student_name"),
                SchoolClass.name.label("class_name"),
            )
            .join(User, User.id == PendingApproval.student_id)
            .join(SchoolClass, SchoolClass.id == User.school_class_id, isouter=True)
            .where(PendingApproval.org_id == current.org_id)
            .order_by(PendingApproval.created_at.desc())
        )
    ).all()

    # Fetch requester names in one go
    requester_ids = list({r.PendingApproval.requester_id for r in rows})
    decision_ids = [r.PendingApproval.decision_by for r in rows if r.PendingApproval.decision_by]
    user_ids = list(set(requester_ids + decision_ids))
    user_map: dict[int, str] = {}
    if user_ids:
        urows = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
        user_map = {u.id: u.full_name for u in urows}

    out: list[PendingApprovalOut] = []
    for r in rows:
        ap = r.PendingApproval
        if status_filter and ap.status != status_filter:
            continue
        out.append(PendingApprovalOut(
            id=ap.id,
            student_id=ap.student_id,
            student_name=r.student_name,
            student_class=r.class_name,
            requester_id=ap.requester_id,
            requester_name=user_map.get(ap.requester_id, "—"),
            violation_code=ap.violation_code,
            violation_name=ap.violation_name,
            severity=ap.severity,
            attitude_penalty=ap.attitude_penalty,
            kersos_hours=ap.kersos_hours,
            lembur_hours=ap.lembur_hours,
            incident_date=ap.incident_date,
            notes=ap.notes,
            status=ap.status,
            decision_at=ap.decision_at,
            decision_by_name=user_map.get(ap.decision_by) if ap.decision_by else None,
            decision_reason=ap.decision_reason,
            created_at=ap.created_at,
        ))
    return Envelope(data=out)


@exec_router.post("/approvals/{approval_id}/decide", response_model=Envelope[PendingApprovalOut])
async def decide_approval(
    approval_id: int,
    payload: ApprovalDecision,
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Kepsek setujui / tolak permohonan KTS berat."""
    from app.services.discipline_service import apply_incident

    ap = (
        await db.execute(
            select(PendingApproval).where(
                PendingApproval.id == approval_id,
                PendingApproval.org_id == current.org_id,
            )
        )
    ).scalar_one_or_none()
    if not ap:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Permohonan tidak ditemukan")
    if ap.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Permohonan sudah diputuskan")

    ap.status = "approved" if payload.decision == "approve" else "rejected"
    ap.decision_by = current.id
    ap.decision_reason = payload.reason
    ap.decision_at = datetime.utcnow()

    if ap.status == "approved":
        # Apply ke ledger seperti report_penalty biasa
        inc = DisciplineIncident(
            org_id=ap.org_id,
            user_id=ap.student_id,
            reporter_id=ap.requester_id,
            kind="penalty",
            incident_date=ap.incident_date,
            ref_code=ap.violation_code,
            ref_name=ap.violation_name,
            attitude_delta=-abs(ap.attitude_penalty),
            kersos_delta=ap.kersos_hours,
            lembur_delta=ap.lembur_hours,
            appreciation_delta=0,
            notes=ap.notes,
        )
        await apply_incident(db, inc)

    db.add(AuditLog(
        user_id=current.id,
        action=f"APPROVAL_{ap.status.upper()}",
        target_type="approval",
        target_id=ap.id,
        extra_meta={"reason": payload.reason},
    ))
    await db.commit()

    # Notif: kasih tahu requester (guru/BK pelapor) + siswa kalau approved
    try:
        from app.services.notification_service import notify_user
        verdict = "disetujui" if ap.status == "approved" else "ditolak"
        await notify_user(
            db, ap.requester_id,
            title=f"Laporan KTS {verdict}",
            body=f"{ap.violation_name} untuk siswa #{ap.student_id} {verdict} oleh kepala sekolah",
            category="approval_decision",
            url="/approvals",
        )
        if ap.status == "approved":
            await notify_user(
                db, ap.student_id,
                title="Pelanggaran berat tercatat",
                body=f"{ap.violation_name} (-{ap.attitude_penalty} poin sikap)",
                category="discipline_penalty",
                url="/my-status",
            )
    except Exception:
        pass

    # Reload with names
    student = await db.get(User, ap.student_id, options=[selectinload(User.school_class)])
    requester = await db.get(User, ap.requester_id)
    decision_by_user = await db.get(User, current.id)

    return Envelope(
        data=PendingApprovalOut(
            id=ap.id,
            student_id=ap.student_id,
            student_name=student.full_name if student else "—",
            student_class=student.school_class.name if student and student.school_class else None,
            requester_id=ap.requester_id,
            requester_name=requester.full_name if requester else "—",
            violation_code=ap.violation_code,
            violation_name=ap.violation_name,
            severity=ap.severity,
            attitude_penalty=ap.attitude_penalty,
            kersos_hours=ap.kersos_hours,
            lembur_hours=ap.lembur_hours,
            incident_date=ap.incident_date,
            notes=ap.notes,
            status=ap.status,
            decision_at=ap.decision_at,
            decision_by_name=decision_by_user.full_name if decision_by_user else None,
            decision_reason=ap.decision_reason,
            created_at=ap.created_at,
        ),
        message=f"Permohonan {ap.status}",
    )


@exec_router.post("/homeroom-assignment", response_model=Envelope[dict])
async def assign_homeroom(
    payload: HomeroomAssign,
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Set wali kelas. Hanya kepsek yang boleh."""
    user = await db.get(User, payload.user_id)
    if not user or user.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User tidak ditemukan")
    if user.role != "admin":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hanya role 'admin' yang dapat jadi wali kelas")

    if payload.homeroom_class_id is not None:
        cls = await db.get(SchoolClass, payload.homeroom_class_id)
        if not cls or cls.org_id != current.org_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Kelas tidak ditemukan")

    user.homeroom_class_id = payload.homeroom_class_id
    db.add(AuditLog(
        user_id=current.id,
        action="ASSIGN_HOMEROOM",
        target_type="user",
        target_id=user.id,
        extra_meta={"class_id": payload.homeroom_class_id},
    ))
    await db.commit()
    return Envelope(
        data={"user_id": user.id, "homeroom_class_id": user.homeroom_class_id},
        message="Wali kelas diperbarui",
    )


# ═══ WALI KELAS / ADMIN ═════════════════════════════════════════════════════

classroom_router = APIRouter(prefix="/classroom", tags=["Classroom"])


@classroom_router.get("/my-class", response_model=Envelope[Optional[HomeroomClassOut]])
async def my_homeroom_class(
    current: Annotated[User, Depends(require_roles("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Detail kelas yang dipegang wali kelas yang sedang login."""
    if not current.homeroom_class_id:
        return Envelope(
            data=None,
            message="Belum diberi tugas wali kelas. Hubungi kepala sekolah.",
        )

    cls = await db.get(SchoolClass, current.homeroom_class_id)
    if not cls or cls.org_id != current.org_id:
        return Envelope(data=None, message="Kelas tidak ditemukan")

    # Siswa di kelas ini
    students_with_profile = (
        await db.execute(
            select(User, DisciplineProfile)
            .join(DisciplineProfile, DisciplineProfile.user_id == User.id, isouter=True)
            .where(
                User.org_id == current.org_id,
                User.school_class_id == cls.id,
                User.role == "employee",
                User.status == "active",
            )
            .options(selectinload(User.school_class))
        )
    ).all()

    today = date.today()
    student_ids = [u.id for u, _ in students_with_profile]
    today_stats = {"present": 0, "late": 0, "absent": 0, "checked_in": set()}

    if student_ids:
        rows = (
            await db.execute(
                select(AttendanceRecord).where(
                    AttendanceRecord.user_id.in_(student_ids),
                    AttendanceRecord.attendance_date == today,
                )
            )
        ).scalars().all()
        for r in rows:
            today_stats["checked_in"].add(r.user_id)
            if r.status in today_stats:
                today_stats[r.status] += 1

    not_yet = len(student_ids) - len(today_stats["checked_in"])

    avg_att = sum(p.attitude_points for _, p in students_with_profile if p) / len(students_with_profile) if students_with_profile else 0
    avg_gpa = sum(p.gpa for _, p in students_with_profile if p) / len(students_with_profile) if students_with_profile else 0

    # composite simple = 50% attitude + 50% gpa
    composite = round((avg_att + avg_gpa) / 2, 2)

    student_summaries = [
        _summary_lite(u, p)
        for u, p in students_with_profile
        if p is not None
    ]
    student_summaries.sort(key=lambda s: (s.attitude_points, -s.gpa))

    return Envelope(data=HomeroomClassOut(
        class_id=cls.id,
        class_name=cls.name,
        grade=cls.grade,
        major=cls.major,
        student_count=len(student_ids),
        today_present=today_stats["present"],
        today_late=today_stats["late"],
        today_absent=today_stats["absent"],
        not_yet_checked_in=not_yet,
        avg_attitude=round(avg_att, 2),
        avg_gpa=round(avg_gpa, 2),
        composite_score=composite,
        students=student_summaries,
    ))


# ═══ GURU BK / HR ═══════════════════════════════════════════════════════════

bk_router = APIRouter(prefix="/bk", tags=["BK"])


def _compute_risk_score(
    profile: DisciplineProfile,
    *,
    pending_notes_count: int,
    today_mood: Optional[int],
    late_count_recent: int = 0,
) -> int:
    """Risk 0–100. Threshold-based, transparent."""
    score = 0
    # Sikap rendah
    if profile.attitude_points < 40:
        score += 40
    elif profile.attitude_points < 60:
        score += 25
    elif profile.attitude_points < 80:
        score += 10
    # Mood low (ke siswa yang baru cek mood; signal tipis)
    if today_mood is not None:
        if today_mood == 1:
            score += 25
        elif today_mood == 2:
            score += 15
    # Telat berulang
    score += min(20, late_count_recent * 5)
    # Catatan menumpuk
    if pending_notes_count >= 3:
        score += 10
    return min(100, score)


@bk_router.get("/cases", response_model=Envelope[list[BkCaseOut]])
async def bk_cases(
    current: Annotated[User, Depends(require_roles("hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Triage list untuk BK — siswa yang butuh perhatian, di-rank by risk."""
    pool = await fetch_students_with_profile(db, org_id=current.org_id)
    today = date.today()

    cases: list[BkCaseOut] = []
    cutoff = today - timedelta(days=7)

    for user, profile in pool:
        # Skip yang sehat
        if profile.attitude_points >= 80 and profile.kersos_hours_owed == 0 and profile.lembur_hours_owed == 0:
            continue

        notes_count = (
            await db.execute(
                select(func.count())
                .select_from(BkNote)
                .where(BkNote.student_id == user.id)
            )
        ).scalar_one() or 0

        last_note_at = (
            await db.execute(
                select(BkNote.created_at)
                .where(BkNote.student_id == user.id)
                .order_by(BkNote.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        mood = (
            await db.execute(
                select(MoodCheckIn.mood).where(
                    MoodCheckIn.user_id == user.id,
                    MoodCheckIn.checkin_date == today,
                )
            )
        ).scalar_one_or_none()

        late_count = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .where(
                    AttendanceRecord.user_id == user.id,
                    AttendanceRecord.attendance_date >= cutoff,
                    AttendanceRecord.status == "late",
                )
            )
        ).scalar_one() or 0

        risk = _compute_risk_score(
            profile,
            pending_notes_count=notes_count,
            today_mood=mood,
            late_count_recent=late_count,
        )

        if risk < 10:
            continue

        cases.append(BkCaseOut(
            student=_summary_lite(user, profile),
            pending_notes_count=notes_count,
            last_note_at=last_note_at,
            today_mood=mood,
            risk_score=risk,
        ))

    cases.sort(key=lambda c: c.risk_score, reverse=True)
    return Envelope(data=cases)


@bk_router.get("/notes/{student_id}", response_model=Envelope[list[BkNoteOut]])
async def list_bk_notes(
    student_id: int,
    current: Annotated[User, Depends(require_roles("hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (
        await db.execute(
            select(BkNote, User.full_name.label("author_name"))
            .join(User, User.id == BkNote.author_id, isouter=True)
            .where(BkNote.student_id == student_id)
            .order_by(BkNote.pinned.desc(), BkNote.created_at.desc())
        )
    ).all()
    out = [
        BkNoteOut(
            id=n.id,
            student_id=n.student_id,
            author_id=n.author_id,
            author_name=author_name,
            pinned=n.pinned,
            body=n.body,
            created_at=n.created_at,
            updated_at=n.updated_at,
        )
        for n, author_name in rows
    ]
    return Envelope(data=out)


@bk_router.post("/notes/{student_id}", response_model=Envelope[BkNoteOut], status_code=201)
async def add_bk_note(
    student_id: int,
    payload: BkNoteIn,
    current: Annotated[User, Depends(require_roles("hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    student = await db.get(User, student_id)
    if not student or student.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Siswa tidak ditemukan")

    note = BkNote(
        student_id=student_id,
        author_id=current.id,
        body=payload.body.strip(),
        pinned=payload.pinned,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return Envelope(data=BkNoteOut(
        id=note.id,
        student_id=note.student_id,
        author_id=note.author_id,
        author_name=current.full_name,
        pinned=note.pinned,
        body=note.body,
        created_at=note.created_at,
        updated_at=note.updated_at,
    ), message="Catatan ditambahkan")


@bk_router.delete("/notes/{note_id}", response_model=Envelope[dict])
async def delete_bk_note(
    note_id: int,
    current: Annotated[User, Depends(require_roles("hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    note = await db.get(BkNote, note_id)
    if not note:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Catatan tidak ditemukan")
    student = await db.get(User, note.student_id)
    if student and student.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Catatan tidak ditemukan")
    await db.delete(note)
    await db.commit()
    return Envelope(data={"ok": True}, message="Catatan dihapus")



# ═══ WEEKLY DIGEST (kepsek-only manual trigger) ════════════════════════════

from app.services.digest_service import (
    build_digests_for_org,
    send_digest_payload,
)


digest_router = APIRouter(prefix="/digest", tags=["Digest"])


class DigestPreviewItem:
    pass  # Pydantic Out type defined inline below


from pydantic import BaseModel as _BaseModel


class DigestPreviewOut(_BaseModel):
    role: str
    recipient_name: str
    recipient_phone: Optional[str] = None
    title: str
    body: str


@digest_router.get("/preview", response_model=Envelope[list[DigestPreviewOut]])
async def preview_digests(
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Preview digest yang akan dikirim minggu ini.

    Aman — tidak benar-benar mengirim. Dipakai kepsek untuk lihat dulu
    konten digest sebelum kirim manual.
    """
    payloads = await build_digests_for_org(db, current.org_id)
    return Envelope(
        data=[
            DigestPreviewOut(
                role=p.role,
                recipient_name=p.recipient_name,
                recipient_phone=p.recipient_phone,
                title=p.title,
                body=p.body,
            )
            for p in payloads
        ]
    )


class DigestSendResultOut(_BaseModel):
    role: str
    recipient_name: str
    sent: bool
    error: Optional[str] = None


@digest_router.post("/send-now", response_model=Envelope[list[DigestSendResultOut]])
async def send_digest_now(
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Kirim digest minggu ini ke semua staff sekarang.

    Dipakai untuk demo / kirim ulang saat scheduler skip karena offline.
    """
    payloads = await build_digests_for_org(db, current.org_id)
    results = []
    for p in payloads:
        result = await send_digest_payload(db, current.org_id, p)
        results.append(DigestSendResultOut(
            role=result.role,
            recipient_name=result.recipient_name,
            sent=result.sent,
            error=result.error,
        ))
    return Envelope(
        data=results,
        message=f"Digest diproses untuk {len(results)} penerima",
    )



# ═══ EXECUTIVE HEATMAP ═════════════════════════════════════════════════════


class HeatmapCell(_BaseModel):
    """Satu sel di heatmap (hari × jam)."""
    day_of_week: int  # 0=Senin, 6=Minggu
    day_label: str
    hour: int
    late_count: int
    incident_count: int


class HeatmapOut(_BaseModel):
    period_start: date
    period_end: date
    grid: list[HeatmapCell]
    peak_late_day: Optional[str] = None
    peak_late_hour: Optional[int] = None
    peak_incident_day: Optional[str] = None


@exec_router.get("/heatmap", response_model=Envelope[HeatmapOut])
async def exec_heatmap(
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = 30,
):
    """Heatmap pola disiplin: jam paling banyak telat & hari paling banyak insiden."""
    end = date.today()
    start = end - timedelta(days=days - 1)

    DAY_LABELS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]

    # Late count per (day_of_week, hour) — dari attendance dengan status 'late'
    late_rows = (
        await db.execute(
            select(AttendanceRecord)
            .join(User, User.id == AttendanceRecord.user_id)
            .where(
                User.org_id == current.org_id,
                AttendanceRecord.status == "late",
                AttendanceRecord.attendance_date >= start,
                AttendanceRecord.attendance_date <= end,
                AttendanceRecord.check_in_at.isnot(None),
            )
        )
    ).scalars().all()

    # Incident count per day_of_week — dari discipline_incidents
    incident_rows = (
        await db.execute(
            select(DisciplineIncident).where(
                DisciplineIncident.org_id == current.org_id,
                DisciplineIncident.kind == "penalty",
                DisciplineIncident.incident_date >= start,
                DisciplineIncident.incident_date <= end,
            )
        )
    ).scalars().all()

    # Bucket
    bucket: dict[tuple[int, int], dict] = {}
    incident_per_day: dict[int, int] = {}

    for r in late_rows:
        if not r.check_in_at:
            continue
        dow = r.check_in_at.weekday()
        hour = r.check_in_at.hour
        key = (dow, hour)
        bucket.setdefault(key, {"late": 0, "incident": 0})
        bucket[key]["late"] += 1

    for r in incident_rows:
        dow = r.incident_date.weekday()
        incident_per_day[dow] = incident_per_day.get(dow, 0) + 1
        # Sebar ke jam 7-14 untuk visualisasi (jam sekolah umum)
        for hr in range(7, 15):
            key = (dow, hr)
            bucket.setdefault(key, {"late": 0, "incident": 0})
        # Tetap simpan total per hari di jam 0 supaya sum konsisten
        # (UI kita pakai per_day_total terpisah)

    # Build grid lengkap (5 hari Senin-Jumat × 6 jam 6-12)
    grid: list[HeatmapCell] = []
    for dow in range(5):  # Senin sampai Jumat
        for hour in range(6, 13):
            stat = bucket.get((dow, hour), {"late": 0, "incident": 0})
            grid.append(HeatmapCell(
                day_of_week=dow,
                day_label=DAY_LABELS[dow],
                hour=hour,
                late_count=stat["late"],
                incident_count=stat["incident"],
            ))

    # Peak detection
    peak_late_cell = max(grid, key=lambda c: c.late_count) if grid else None
    peak_late_day = peak_late_cell.day_label if peak_late_cell and peak_late_cell.late_count else None
    peak_late_hour = peak_late_cell.hour if peak_late_cell and peak_late_cell.late_count else None

    peak_inc_dow = max(incident_per_day.items(), key=lambda x: x[1])[0] if incident_per_day else None
    peak_inc_day = DAY_LABELS[peak_inc_dow] if peak_inc_dow is not None else None

    return Envelope(data=HeatmapOut(
        period_start=start,
        period_end=end,
        grid=grid,
        peak_late_day=peak_late_day,
        peak_late_hour=peak_late_hour,
        peak_incident_day=peak_inc_day,
    ))



# ═══ DASHBOARD EXTRAS — VISUALISASI TAMBAHAN ═══════════════════════════════


class CategoryCount(_BaseModel):
    label: str
    count: int


class WeeklyAttendancePoint(_BaseModel):
    week_start: date
    week_label: str
    present: int
    late: int
    absent: int


class SubjectAvgItem(_BaseModel):
    subject_code: str
    subject_name: str
    avg_score: float
    submissions: int


class ExecExtrasOut(_BaseModel):
    violation_breakdown: list[CategoryCount]
    severity_breakdown: list[CategoryCount]
    weekly_attendance: list[WeeklyAttendancePoint]


@exec_router.get("/dashboard-extras", response_model=Envelope[ExecExtrasOut])
async def exec_dashboard_extras(
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Visualisasi tambahan untuk dashboard kepsek."""
    from app.models import ViolationType
    org_id = current.org_id

    # Violation breakdown: top 5 jenis KTS yang paling sering dilaporkan (90 hari)
    cutoff = date.today() - timedelta(days=90)
    violation_rows = (
        await db.execute(
            select(
                DisciplineIncident.ref_name,
                func.count(DisciplineIncident.id).label("cnt"),
            )
            .where(
                DisciplineIncident.org_id == org_id,
                DisciplineIncident.kind == "penalty",
                DisciplineIncident.incident_date >= cutoff,
            )
            .group_by(DisciplineIncident.ref_name)
            .order_by(func.count(DisciplineIncident.id).desc())
            .limit(5)
        )
    ).all()
    violation_breakdown = [
        CategoryCount(label=r[0], count=int(r[1])) for r in violation_rows
    ]

    # Severity breakdown: berapa banyak ringan/sedang/berat
    sev_rows = (
        await db.execute(
            select(
                ViolationType.severity,
                func.count(DisciplineIncident.id).label("cnt"),
            )
            .join(
                ViolationType,
                (ViolationType.code == DisciplineIncident.ref_code)
                & (ViolationType.org_id == org_id),
            )
            .where(
                DisciplineIncident.org_id == org_id,
                DisciplineIncident.kind == "penalty",
                DisciplineIncident.incident_date >= cutoff,
            )
            .group_by(ViolationType.severity)
        )
    ).all()
    severity_breakdown = [
        CategoryCount(label=r[0].capitalize(), count=int(r[1])) for r in sev_rows
    ]

    # Weekly attendance: 6 minggu terakhir
    weekly: list[WeeklyAttendancePoint] = []
    today = date.today()
    this_monday = today - timedelta(days=today.weekday())
    for i in range(5, -1, -1):
        week_start = this_monday - timedelta(days=7 * i)
        week_end = week_start + timedelta(days=6)
        stats = (
            await db.execute(
                select(
                    func.sum(case((AttendanceRecord.status == "present", 1), else_=0)),
                    func.sum(case((AttendanceRecord.status == "late", 1), else_=0)),
                    func.sum(case((AttendanceRecord.status == "absent", 1), else_=0)),
                )
                .select_from(AttendanceRecord)
                .join(User, User.id == AttendanceRecord.user_id)
                .where(
                    User.org_id == org_id,
                    AttendanceRecord.attendance_date >= week_start,
                    AttendanceRecord.attendance_date <= week_end,
                )
            )
        ).one()
        weekly.append(WeeklyAttendancePoint(
            week_start=week_start,
            week_label=f"M-{i}" if i > 0 else "Now",
            present=int(stats[0] or 0),
            late=int(stats[1] or 0),
            absent=int(stats[2] or 0),
        ))

    return Envelope(data=ExecExtrasOut(
        violation_breakdown=violation_breakdown,
        severity_breakdown=severity_breakdown,
        weekly_attendance=weekly,
    ))


class HomeroomExtrasOut(_BaseModel):
    weekly_attendance: list[WeeklyAttendancePoint]
    subject_avg: list[SubjectAvgItem]
    attitude_distribution: list[CategoryCount]


@classroom_router.get("/my-class/extras", response_model=Envelope[Optional[HomeroomExtrasOut]])
async def my_class_extras(
    current: Annotated[User, Depends(require_roles("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Visualisasi tambahan untuk dashboard wali kelas."""
    if not current.homeroom_class_id:
        return Envelope(data=None)

    from app.models import Assignment, AssignmentGrade, Subject
    class_id = current.homeroom_class_id

    student_ids = (
        await db.execute(
            select(User.id).where(
                User.school_class_id == class_id,
                User.role == "employee",
                User.status == "active",
            )
        )
    ).scalars().all()

    if not student_ids:
        return Envelope(data=HomeroomExtrasOut(
            weekly_attendance=[], subject_avg=[], attitude_distribution=[]
        ))

    # Weekly attendance kelas (6 minggu)
    weekly: list[WeeklyAttendancePoint] = []
    today = date.today()
    this_monday = today - timedelta(days=today.weekday())
    for i in range(5, -1, -1):
        week_start = this_monday - timedelta(days=7 * i)
        week_end = week_start + timedelta(days=6)
        stats = (
            await db.execute(
                select(
                    func.sum(case((AttendanceRecord.status == "present", 1), else_=0)),
                    func.sum(case((AttendanceRecord.status == "late", 1), else_=0)),
                    func.sum(case((AttendanceRecord.status == "absent", 1), else_=0)),
                )
                .select_from(AttendanceRecord)
                .where(
                    AttendanceRecord.user_id.in_(student_ids),
                    AttendanceRecord.attendance_date >= week_start,
                    AttendanceRecord.attendance_date <= week_end,
                )
            )
        ).one()
        weekly.append(WeeklyAttendancePoint(
            week_start=week_start,
            week_label=f"M-{i}" if i > 0 else "Now",
            present=int(stats[0] or 0),
            late=int(stats[1] or 0),
            absent=int(stats[2] or 0),
        ))

    # Subject avg (rata-rata nilai per mapel di kelas)
    subj_rows = (
        await db.execute(
            select(
                Subject.code,
                Subject.name,
                func.avg(AssignmentGrade.score / Assignment.max_score * 100).label("avg"),
                func.count(AssignmentGrade.id).label("cnt"),
            )
            .select_from(AssignmentGrade)
            .join(Assignment, Assignment.id == AssignmentGrade.assignment_id)
            .join(Subject, Subject.id == Assignment.subject_id)
            .where(AssignmentGrade.student_id.in_(student_ids))
            .group_by(Subject.code, Subject.name)
            .order_by(func.avg(AssignmentGrade.score / Assignment.max_score * 100).desc())
            .limit(8)
        )
    ).all()
    subject_avg = [
        SubjectAvgItem(
            subject_code=r[0], subject_name=r[1],
            avg_score=round(float(r[2] or 0), 1),
            submissions=int(r[3]),
        )
        for r in subj_rows
    ]

    # Attitude distribution (sehat ≥80, sedang 60-79, kritis <60)
    profiles = (
        await db.execute(
            select(DisciplineProfile).where(DisciplineProfile.user_id.in_(student_ids))
        )
    ).scalars().all()
    sehat = sum(1 for p in profiles if p.attitude_points >= 80)
    sedang = sum(1 for p in profiles if 60 <= p.attitude_points < 80)
    kritis = sum(1 for p in profiles if p.attitude_points < 60)
    attitude_distribution = [
        CategoryCount(label="Sehat (≥80)", count=sehat),
        CategoryCount(label="Sedang (60-79)", count=sedang),
        CategoryCount(label="Kritis (<60)", count=kritis),
    ]

    return Envelope(data=HomeroomExtrasOut(
        weekly_attendance=weekly,
        subject_avg=subject_avg,
        attitude_distribution=attitude_distribution,
    ))


class BkExtrasOut(_BaseModel):
    cases_trend: list[CategoryCount]  # label = week, count = new penalties
    category_breakdown: list[CategoryCount]
    mood_trend: list[CategoryCount]  # label = day, count = avg mood × 10


@bk_router.get("/extras", response_model=Envelope[BkExtrasOut])
async def bk_extras(
    current: Annotated[User, Depends(require_roles("hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Visualisasi untuk dashboard BK."""
    org_id = current.org_id
    today = date.today()
    this_monday = today - timedelta(days=today.weekday())

    # Cases trend per week (8 minggu)
    cases_trend: list[CategoryCount] = []
    for i in range(7, -1, -1):
        ws = this_monday - timedelta(days=7 * i)
        we = ws + timedelta(days=6)
        cnt = (
            await db.execute(
                select(func.count())
                .select_from(DisciplineIncident)
                .where(
                    DisciplineIncident.org_id == org_id,
                    DisciplineIncident.kind == "penalty",
                    DisciplineIncident.incident_date >= ws,
                    DisciplineIncident.incident_date <= we,
                )
            )
        ).scalar_one() or 0
        cases_trend.append(CategoryCount(
            label=f"M-{i}" if i > 0 else "Now",
            count=int(cnt),
        ))

    # Category breakdown (kategori pelanggaran 30 hari)
    cutoff = today - timedelta(days=30)
    from app.models import ViolationType
    cat_rows = (
        await db.execute(
            select(
                ViolationType.category,
                func.count(DisciplineIncident.id),
            )
            .join(
                ViolationType,
                (ViolationType.code == DisciplineIncident.ref_code)
                & (ViolationType.org_id == org_id),
            )
            .where(
                DisciplineIncident.org_id == org_id,
                DisciplineIncident.kind == "penalty",
                DisciplineIncident.incident_date >= cutoff,
            )
            .group_by(ViolationType.category)
            .order_by(func.count(DisciplineIncident.id).desc())
        )
    ).all()
    category_breakdown = [
        CategoryCount(label=r[0].capitalize(), count=int(r[1])) for r in cat_rows
    ]

    # Mood trend per day (7 hari)
    mood_trend: list[CategoryCount] = []
    days_id = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        moods = (
            await db.execute(
                select(MoodCheckIn.mood)
                .join(User, User.id == MoodCheckIn.user_id)
                .where(
                    User.org_id == org_id,
                    MoodCheckIn.checkin_date == d,
                )
            )
        ).scalars().all()
        avg = round(sum(moods) / len(moods) * 10, 1) if moods else 0  # × 10 untuk skala chart
        mood_trend.append(CategoryCount(
            label=days_id[d.weekday()],
            count=int(avg),
        ))

    return Envelope(data=BkExtrasOut(
        cases_trend=cases_trend,
        category_breakdown=category_breakdown,
        mood_trend=mood_trend,
    ))
