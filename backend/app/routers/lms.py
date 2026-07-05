"""LMS endpoints — Subjects, Materials, Assignments, Grades.

Routing:
  /v1/subjects                 GET, POST, PATCH, DELETE
  /v1/teaching-assignments     GET, POST, DELETE
  /v1/materials                GET, POST (upload), DELETE
  /v1/assignments              GET, POST, PATCH, DELETE
  /v1/assignments/{id}/grades  GET, POST (manual list), PATCH (single)
  /v1/assignments/{id}/grades/import-preview   POST (CSV/XLSX)
  /v1/assignments/{id}/grades/import-commit    POST (apply preview)
  /v1/assignments/{id}/grades/template         GET (download CSV template)

  /v1/lms/me/assignments       GET (siswa: tugas saya + nilai)
  /v1/lms/me/materials         GET (siswa: materi kelasku)

Scoping:
  - admin (wali kelas) : default lihat & assign hanya ke kelas yang dia ampu
  - hr / super_admin   : lihat semua di org
  - employee (siswa)   : lihat tugas/materi di kelasnya saja
"""
from __future__ import annotations

import csv
import io
import logging
import secrets
from datetime import date, datetime
from pathlib import Path
from typing import Annotated, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import (
    Assignment,
    AssignmentGrade,
    LessonMaterial,
    SchoolClass,
    Subject,
    TeachingAssignment,
    User,
)
from app.schemas import (
    AssignmentIn,
    AssignmentOut,
    CsvCommitOut,
    CsvPreviewOut,
    CsvPreviewRow,
    Envelope,
    GradeBulkIn,
    GradeIn,
    GradeOut,
    LessonMaterialOut,
    StudentAssignmentOut,
    StudentMaterialOut,
    SubjectIn,
    SubjectOut,
    TeachingAssignmentIn,
    TeachingAssignmentOut,
)
from app.security import get_current_user, require_roles
from app.services.lms_service import (
    parse_csv,
    parse_xlsx,
    recompute_gpa_for_student,
    resolve_students_by_nis,
)


logger = logging.getLogger(__name__)


# ─── Helpers ────────────────────────────────────────────────────────────────

LESSONS_DIR = Path("./storage/lessons")
LESSONS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_MIME_PREFIXES = ("application/", "image/", "video/", "audio/", "text/")
ALLOWED_GRADE_EXTS = {".csv", ".xlsx", ".xls"}
MAX_MATERIAL_SIZE = 50 * 1024 * 1024  # 50MB
MAX_GRADE_SIZE = 5 * 1024 * 1024  # 5MB


async def _ensure_teacher_can_grade(
    db: AsyncSession, current: User, assignment: Assignment
) -> None:
    """Cek apakah user boleh grade tugas tertentu."""
    if current.role in ("super_admin", "hr"):
        return
    if assignment.teacher_id == current.id:
        return
    raise HTTPException(
        status.HTTP_403_FORBIDDEN,
        "Hanya guru pengampu atau admin yang bisa input nilai",
    )


# ═══ SUBJECTS ═══════════════════════════════════════════════════════════════

subjects_router = APIRouter(prefix="/subjects", tags=["LMS - Subjects"])


@subjects_router.get("", response_model=Envelope[list[SubjectOut]])
async def list_subjects(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (
        await db.execute(
            select(Subject)
            .where(Subject.org_id == current.org_id, Subject.is_active == True)  # noqa: E712
            .order_by(Subject.code)
        )
    ).scalars().all()
    return Envelope(data=[SubjectOut.model_validate(r) for r in rows])


@subjects_router.post("", response_model=Envelope[SubjectOut], status_code=201)
async def create_subject(
    payload: SubjectIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    existing = (
        await db.execute(
            select(Subject).where(
                Subject.org_id == current.org_id,
                Subject.code == payload.code,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Kode mata pelajaran {payload.code} sudah ada")
    subj = Subject(org_id=current.org_id, **payload.model_dump())
    db.add(subj)
    await db.commit()
    await db.refresh(subj)
    return Envelope(data=SubjectOut.model_validate(subj), message="Mata pelajaran ditambahkan")


@subjects_router.patch("/{subject_id}", response_model=Envelope[SubjectOut])
async def update_subject(
    subject_id: int,
    payload: SubjectIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    subj = await db.get(Subject, subject_id)
    if not subj or subj.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mata pelajaran tidak ditemukan")
    for field, val in payload.model_dump().items():
        setattr(subj, field, val)
    await db.commit()
    await db.refresh(subj)
    return Envelope(data=SubjectOut.model_validate(subj), message="Mata pelajaran diperbarui")


@subjects_router.delete("/{subject_id}", response_model=Envelope[dict])
async def delete_subject(
    subject_id: int,
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    subj = await db.get(Subject, subject_id)
    if not subj or subj.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mata pelajaran tidak ditemukan")
    subj.is_active = False  # soft delete
    await db.commit()
    return Envelope(data={"ok": True}, message="Mata pelajaran dinonaktifkan")


# ═══ TEACHING ASSIGNMENTS ═══════════════════════════════════════════════════

teaching_router = APIRouter(prefix="/teaching-assignments", tags=["LMS - Teaching"])


@teaching_router.get("", response_model=Envelope[list[TeachingAssignmentOut]])
async def list_teaching(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    teacher_id: Optional[int] = None,
):
    stmt = (
        select(TeachingAssignment, User, Subject, SchoolClass)
        .join(User, User.id == TeachingAssignment.teacher_id)
        .join(Subject, Subject.id == TeachingAssignment.subject_id)
        .join(SchoolClass, SchoolClass.id == TeachingAssignment.school_class_id)
        .where(User.org_id == current.org_id)
    )
    if teacher_id:
        stmt = stmt.where(TeachingAssignment.teacher_id == teacher_id)
    rows = (await db.execute(stmt)).all()
    out = [
        TeachingAssignmentOut(
            id=ta.id,
            teacher_id=teacher.id,
            teacher_name=teacher.full_name,
            subject_id=subj.id,
            subject_name=subj.name,
            subject_code=subj.code,
            school_class_id=cls.id,
            school_class_name=cls.name,
        )
        for ta, teacher, subj, cls in rows
    ]
    return Envelope(data=out)


@teaching_router.post("", response_model=Envelope[TeachingAssignmentOut], status_code=201)
async def create_teaching(
    payload: TeachingAssignmentIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    teacher = await db.get(User, payload.teacher_id)
    subj = await db.get(Subject, payload.subject_id)
    cls = await db.get(SchoolClass, payload.school_class_id)
    if not teacher or teacher.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Guru tidak ditemukan")
    if not subj or subj.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mata pelajaran tidak ditemukan")
    if not cls or cls.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kelas tidak ditemukan")
    if teacher.role not in ("admin", "hr", "super_admin"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Target user bukan guru")

    existing = (
        await db.execute(
            select(TeachingAssignment).where(
                TeachingAssignment.teacher_id == payload.teacher_id,
                TeachingAssignment.subject_id == payload.subject_id,
                TeachingAssignment.school_class_id == payload.school_class_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Penugasan ini sudah ada")

    ta = TeachingAssignment(**payload.model_dump())
    db.add(ta)
    await db.commit()
    await db.refresh(ta)
    return Envelope(
        data=TeachingAssignmentOut(
            id=ta.id,
            teacher_id=teacher.id,
            teacher_name=teacher.full_name,
            subject_id=subj.id,
            subject_name=subj.name,
            subject_code=subj.code,
            school_class_id=cls.id,
            school_class_name=cls.name,
        ),
        message="Penugasan mengajar dibuat",
    )


@teaching_router.delete("/{ta_id}", response_model=Envelope[dict])
async def delete_teaching(
    ta_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ta = await db.get(TeachingAssignment, ta_id)
    if not ta:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Penugasan tidak ditemukan")
    teacher = await db.get(User, ta.teacher_id)
    if teacher and teacher.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Penugasan tidak ditemukan")
    await db.delete(ta)
    await db.commit()
    return Envelope(data={"ok": True}, message="Penugasan dihapus")


# ═══ MATERIALS ══════════════════════════════════════════════════════════════

materials_router = APIRouter(prefix="/materials", tags=["LMS - Materials"])


def _material_to_out(
    m: LessonMaterial,
    *,
    teacher: User | None = None,
    subj: Subject | None = None,
    cls: SchoolClass | None = None,
) -> LessonMaterialOut:
    return LessonMaterialOut(
        id=m.id,
        teacher_id=m.teacher_id,
        teacher_name=teacher.full_name if teacher else None,
        subject_id=m.subject_id,
        subject_name=subj.name if subj else None,
        school_class_id=m.school_class_id,
        school_class_name=cls.name if cls else None,
        title=m.title,
        description=m.description,
        file_url=m.file_url,
        file_name=m.file_name,
        file_size=m.file_size,
        file_mime=m.file_mime,
        is_published=m.is_published,
        created_at=m.created_at,
    )


@materials_router.get("", response_model=Envelope[list[LessonMaterialOut]])
async def list_materials(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    subject_id: Optional[int] = None,
    school_class_id: Optional[int] = None,
):
    stmt = (
        select(LessonMaterial, User, Subject, SchoolClass)
        .join(User, User.id == LessonMaterial.teacher_id)
        .join(Subject, Subject.id == LessonMaterial.subject_id)
        .join(SchoolClass, SchoolClass.id == LessonMaterial.school_class_id, isouter=True)
        .where(LessonMaterial.org_id == current.org_id)
        .order_by(LessonMaterial.created_at.desc())
    )
    # Guru hanya lihat materi sendiri kecuali admin/super_admin
    if current.role == "admin":
        stmt = stmt.where(LessonMaterial.teacher_id == current.id)
    if subject_id:
        stmt = stmt.where(LessonMaterial.subject_id == subject_id)
    if school_class_id:
        stmt = stmt.where(LessonMaterial.school_class_id == school_class_id)

    rows = (await db.execute(stmt)).all()
    return Envelope(data=[_material_to_out(m, teacher=t, subj=s, cls=c) for m, t, s, c in rows])


@materials_router.post("", response_model=Envelope[LessonMaterialOut], status_code=201)
async def upload_material(
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    title: Annotated[str, Form()],
    subject_id: Annotated[int, Form()],
    school_class_id: Annotated[Optional[int], Form()] = None,
    description: Annotated[Optional[str], Form()] = None,
    file: UploadFile = File(...),
):
    subj = await db.get(Subject, subject_id)
    if not subj or subj.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mata pelajaran tidak ditemukan")
    if school_class_id:
        cls = await db.get(SchoolClass, school_class_id)
        if not cls or cls.org_id != current.org_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Kelas tidak ditemukan")

    if not file.content_type or not any(
        file.content_type.startswith(p) for p in ALLOWED_MIME_PREFIXES
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tipe file tidak diizinkan")

    content = await file.read()
    if len(content) > MAX_MATERIAL_SIZE:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Ukuran file maksimal {MAX_MATERIAL_SIZE // (1024*1024)}MB",
        )

    safe_name = (file.filename or "material").replace("/", "_").replace("\\", "_")
    stored = f"lesson_{current.id}_{secrets.token_hex(6)}_{safe_name}"
    path = LESSONS_DIR / stored
    path.write_bytes(content)

    m = LessonMaterial(
        org_id=current.org_id,
        teacher_id=current.id,
        subject_id=subject_id,
        school_class_id=school_class_id,
        title=title,
        description=description,
        file_url=f"/lessons/{stored}",
        file_name=safe_name,
        file_size=len(content),
        file_mime=file.content_type,
    )
    db.add(m)
    await db.commit()
    await db.refresh(m)

    cls = await db.get(SchoolClass, school_class_id) if school_class_id else None
    # Notif siswa kelas terkait
    try:
        from app.services.notification_service import notify_class
        if school_class_id:
            await notify_class(
                db, school_class_id,
                title=f"Materi baru: {subj.name}",
                body=title[:140],
                category="lms_material",
                url="/my-materials",
            )
    except Exception:
        pass
    return Envelope(
        data=_material_to_out(m, teacher=current, subj=subj, cls=cls),
        message="Materi berhasil diunggah",
    )


@materials_router.delete("/{material_id}", response_model=Envelope[dict])
async def delete_material(
    material_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    m = await db.get(LessonMaterial, material_id)
    if not m or m.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Materi tidak ditemukan")
    if current.role not in ("super_admin",) and m.teacher_id != current.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya pemilik materi yang bisa menghapus")

    # Hapus fisik
    if m.file_url and m.file_url.startswith("/lessons/"):
        f = Path("./storage") / m.file_url.lstrip("/")
        if f.exists():
            f.unlink(missing_ok=True)

    await db.delete(m)
    await db.commit()
    return Envelope(data={"ok": True}, message="Materi dihapus")


# ═══ ASSIGNMENTS ════════════════════════════════════════════════════════════

assignments_router = APIRouter(prefix="/assignments", tags=["LMS - Assignments"])


async def _assignment_with_meta(
    db: AsyncSession, asg: Assignment
) -> AssignmentOut:
    teacher = await db.get(User, asg.teacher_id)
    subj = await db.get(Subject, asg.subject_id)
    cls = await db.get(SchoolClass, asg.school_class_id)

    student_count = (
        await db.execute(
            select(func.count())
            .select_from(User)
            .where(
                User.school_class_id == asg.school_class_id,
                User.role == "employee",
                User.status == "active",
            )
        )
    ).scalar_one() or 0

    grade_stats = (
        await db.execute(
            select(func.count(), func.avg(AssignmentGrade.score)).where(
                AssignmentGrade.assignment_id == asg.id
            )
        )
    ).one()
    graded_count = int(grade_stats[0] or 0)
    avg_score = float(grade_stats[1]) if grade_stats[1] is not None else None

    return AssignmentOut(
        id=asg.id,
        teacher_id=asg.teacher_id,
        teacher_name=teacher.full_name if teacher else None,
        subject_id=asg.subject_id,
        subject_name=subj.name if subj else None,
        subject_code=subj.code if subj else None,
        school_class_id=asg.school_class_id,
        school_class_name=cls.name if cls else None,
        title=asg.title,
        description=asg.description,
        assignment_type=asg.assignment_type,
        max_score=asg.max_score,
        weight=asg.weight,
        due_date=asg.due_date,
        is_published=asg.is_published,
        graded_count=graded_count,
        student_count=student_count,
        avg_score=round(avg_score, 2) if avg_score is not None else None,
        created_at=asg.created_at,
        mode=asg.mode,
        duration_minutes=asg.duration_minutes,
        max_focus_violations=asg.max_focus_violations,
        lock_duration_minutes=asg.lock_duration_minutes,
        shuffle_questions=asg.shuffle_questions,
        show_score_immediately=asg.show_score_immediately,
        open_at=asg.open_at,
        close_at=asg.close_at,
    )


@assignments_router.get("", response_model=Envelope[list[AssignmentOut]])
async def list_assignments(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    school_class_id: Optional[int] = None,
    subject_id: Optional[int] = None,
    mine_only: bool = Query(True, description="Untuk admin: hanya tugas yang saya buat"),
):
    stmt = (
        select(Assignment).where(Assignment.org_id == current.org_id)
        .order_by(Assignment.created_at.desc())
    )
    if school_class_id:
        stmt = stmt.where(Assignment.school_class_id == school_class_id)
    if subject_id:
        stmt = stmt.where(Assignment.subject_id == subject_id)
    if current.role == "admin" and mine_only:
        stmt = stmt.where(Assignment.teacher_id == current.id)

    rows = (await db.execute(stmt)).scalars().all()
    out = [await _assignment_with_meta(db, a) for a in rows]
    return Envelope(data=out)


@assignments_router.get("/{assignment_id}", response_model=Envelope[AssignmentOut])
async def get_assignment(
    assignment_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    asg = await db.get(Assignment, assignment_id)
    if not asg or asg.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tugas tidak ditemukan")
    return Envelope(data=await _assignment_with_meta(db, asg))


@assignments_router.post("", response_model=Envelope[AssignmentOut], status_code=201)
async def create_assignment(
    payload: AssignmentIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    subj = await db.get(Subject, payload.subject_id)
    cls = await db.get(SchoolClass, payload.school_class_id)
    if not subj or subj.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mata pelajaran tidak ditemukan")
    if not cls or cls.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kelas tidak ditemukan")

    # Quiz online: paksa unpublish dulu — siswa baru bisa lihat & dapat notif
    # setelah guru tambah soal lalu klik Publish.
    payload_dict = payload.model_dump()
    is_quiz = payload_dict.get("mode") == "quiz"
    if is_quiz:
        payload_dict["is_published"] = False

    asg = Assignment(
        org_id=current.org_id,
        teacher_id=current.id,
        **payload_dict,
    )
    db.add(asg)
    await db.commit()
    await db.refresh(asg)
    # Notif siswa kelas tersebut — hanya untuk tugas manual yang langsung publish.
    # Quiz online tidak kirim notif di sini (akan dikirim saat publish).
    try:
        from app.services.notification_service import notify_class
        if asg.is_published and not is_quiz:
            due_text = f", deadline {asg.due_date.strftime('%d %b %Y')}" if asg.due_date else ""
            await notify_class(
                db, asg.school_class_id,
                title=f"Tugas baru: {subj.name}",
                body=f"{asg.title}{due_text}",
                category="lms_assignment",
                url="/my-assignments",
            )
    except Exception:
        pass
    return Envelope(
        data=await _assignment_with_meta(db, asg),
        message=(
            f"Quiz '{asg.title}' dibuat sebagai DRAFT. Tambahkan soal lalu klik Publish."
            if is_quiz
            else f"Tugas '{asg.title}' berhasil dibuat"
        ),
    )


@assignments_router.patch("/{assignment_id}", response_model=Envelope[AssignmentOut])
async def update_assignment(
    assignment_id: int,
    payload: AssignmentIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    asg = await db.get(Assignment, assignment_id)
    if not asg or asg.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tugas tidak ditemukan")
    if current.role == "admin" and asg.teacher_id != current.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya pembuat yang bisa edit")

    for field, val in payload.model_dump().items():
        setattr(asg, field, val)
    await db.commit()
    await db.refresh(asg)
    return Envelope(data=await _assignment_with_meta(db, asg), message="Tugas diperbarui")


@assignments_router.delete("/{assignment_id}", response_model=Envelope[dict])
async def delete_assignment(
    assignment_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    asg = await db.get(Assignment, assignment_id)
    if not asg or asg.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tugas tidak ditemukan")
    if current.role == "admin" and asg.teacher_id != current.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya pembuat yang bisa hapus")

    # Track student IDs untuk recompute GPA
    student_ids = (
        await db.execute(
            select(AssignmentGrade.student_id).where(
                AssignmentGrade.assignment_id == assignment_id
            )
        )
    ).scalars().all()

    await db.delete(asg)
    await db.commit()

    # Recompute GPA untuk siswa yang punya nilai di tugas ini
    for sid in student_ids:
        await recompute_gpa_for_student(db, sid)
    if student_ids:
        await db.commit()

    return Envelope(data={"ok": True}, message="Tugas dihapus")


# ─── Grades (per-assignment) ───────────────────────────────────────────────


@assignments_router.get(
    "/{assignment_id}/grades", response_model=Envelope[list[GradeOut]]
)
async def list_grades(
    assignment_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    asg = await db.get(Assignment, assignment_id)
    if not asg or asg.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tugas tidak ditemukan")

    if current.role == "employee":
        # Siswa hanya boleh lihat nilainya sendiri
        rows = (
            await db.execute(
                select(AssignmentGrade, User)
                .join(User, User.id == AssignmentGrade.student_id)
                .where(
                    AssignmentGrade.assignment_id == assignment_id,
                    AssignmentGrade.student_id == current.id,
                )
            )
        ).all()
    else:
        rows = (
            await db.execute(
                select(AssignmentGrade, User)
                .join(User, User.id == AssignmentGrade.student_id)
                .where(AssignmentGrade.assignment_id == assignment_id)
                .order_by(User.full_name)
            )
        ).all()

    out = [
        GradeOut(
            id=g.id,
            assignment_id=g.assignment_id,
            student_id=g.student_id,
            student_name=u.full_name,
            student_nis=u.employee_id,
            score=g.score,
            max_score=asg.max_score,
            note=g.note,
            source=g.source,
            graded_at=g.graded_at,
        )
        for g, u in rows
    ]
    return Envelope(data=out)


@assignments_router.post(
    "/{assignment_id}/grades", response_model=Envelope[CsvCommitOut]
)
async def save_grades_bulk(
    assignment_id: int,
    payload: GradeBulkIn,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Simpan banyak nilai sekaligus (manual entry).

    Idempotent — kalau (assignment_id, student_id) sudah ada, di-update.
    """
    asg = await db.get(Assignment, assignment_id)
    if not asg or asg.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tugas tidak ditemukan")
    await _ensure_teacher_can_grade(db, current, asg)

    saved = 0
    skipped = 0
    errors: list[str] = []
    affected_students: set[int] = set()

    for entry in payload.grades:
        student = await db.get(User, entry.student_id)
        if not student or student.school_class_id != asg.school_class_id:
            skipped += 1
            errors.append(f"Siswa ID {entry.student_id} tidak ada di kelas tugas ini")
            continue
        if entry.score < 0 or entry.score > asg.max_score:
            skipped += 1
            errors.append(
                f"Nilai {entry.score} di luar range 0..{asg.max_score} (siswa {student.full_name})"
            )
            continue

        existing = (
            await db.execute(
                select(AssignmentGrade).where(
                    AssignmentGrade.assignment_id == assignment_id,
                    AssignmentGrade.student_id == entry.student_id,
                )
            )
        ).scalar_one_or_none()
        if existing:
            existing.score = entry.score
            existing.note = entry.note
            existing.source = "manual"
            existing.graded_by = current.id
            existing.updated_at = datetime.utcnow()
        else:
            db.add(AssignmentGrade(
                assignment_id=assignment_id,
                student_id=entry.student_id,
                score=entry.score,
                note=entry.note,
                source="manual",
                graded_by=current.id,
            ))
        saved += 1
        affected_students.add(entry.student_id)

    await db.flush()
    for sid in affected_students:
        await recompute_gpa_for_student(db, sid)
    await db.commit()

    # Notif siswa: nilai keluar
    try:
        from app.services.notification_service import notify_user
        for sid in affected_students:
            await notify_user(
                db, sid,
                title=f"Nilai sudah keluar: {asg.title}",
                body=f"Cek detail nilai di Tugas Saya",
                category="lms_grade",
                url="/my-assignments",
            )
    except Exception:
        pass

    return Envelope(
        data=CsvCommitOut(saved=saved, skipped=skipped, errors=errors[:20]),
        message=f"{saved} nilai disimpan, {skipped} dilewati",
    )


# ─── Import CSV/XLSX ────────────────────────────────────────────────────────


def _parse_uploaded(file: UploadFile, content: bytes):
    """Parse file based on extension."""
    name = (file.filename or "").lower()
    if name.endswith(".csv"):
        return parse_csv(content), "csv_upload"
    if name.endswith((".xlsx", ".xls")):
        return parse_xlsx(content), "xlsx_upload"
    raise HTTPException(
        status.HTTP_400_BAD_REQUEST,
        f"Format file tidak didukung. Hanya .csv, .xlsx, .xls",
    )


@assignments_router.post(
    "/{assignment_id}/grades/import-preview",
    response_model=Envelope[CsvPreviewOut],
)
async def import_grades_preview(
    assignment_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    """Preview nilai dari CSV/XLSX sebelum apply.

    Tidak menyimpan apa-apa. Validasi: NIS harus ada di kelas target,
    nilai harus dalam range 0..max_score.
    """
    asg = await db.get(Assignment, assignment_id)
    if not asg or asg.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tugas tidak ditemukan")
    await _ensure_teacher_can_grade(db, current, asg)

    content = await file.read()
    if len(content) > MAX_GRADE_SIZE:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Ukuran file maksimal {MAX_GRADE_SIZE // (1024*1024)}MB",
        )
    parsed, _source = _parse_uploaded(file, content)

    nis_list = [p.nis for p in parsed if p.nis]
    student_map = await resolve_students_by_nis(
        db, org_id=current.org_id, school_class_id=asg.school_class_id, nis_list=nis_list
    )

    rows: list[CsvPreviewRow] = []
    valid_count = 0
    invalid_count = 0
    for p in parsed:
        row = CsvPreviewRow(
            row_num=p.row_num,
            nis=p.nis,
            nama=p.nama,
            nilai=p.nilai,
            catatan=p.catatan,
        )
        # Validate
        if not p.nis:
            row.error = "NIS kosong"
        elif p.nilai is None:
            row.error = "Nilai kosong atau tidak numerik"
        elif p.nilai < 0 or p.nilai > asg.max_score:
            row.error = f"Nilai di luar range 0..{asg.max_score}"
        elif p.nis not in student_map:
            row.error = f"NIS {p.nis} bukan siswa di kelas {asg.school_class_id}"
        else:
            student = student_map[p.nis]
            row.student_id = student.id
            row.student_name_db = student.full_name
            row.valid = True
            valid_count += 1
            # Warning kalau nama beda (tetap valid)
            if p.nama and p.nama.strip().lower() != student.full_name.lower():
                row.error = f"⚠️ Nama berbeda dari DB: '{student.full_name}'"

        if not row.valid:
            invalid_count += 1
        rows.append(row)

    return Envelope(
        data=CsvPreviewOut(
            total_rows=len(rows),
            valid_rows=valid_count,
            invalid_rows=invalid_count,
            rows=rows,
        ),
        message=f"Preview: {valid_count} valid, {invalid_count} invalid dari total {len(rows)} baris",
    )


@assignments_router.post(
    "/{assignment_id}/grades/import-commit",
    response_model=Envelope[CsvCommitOut],
)
async def import_grades_commit(
    assignment_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    """Apply nilai dari CSV/XLSX. Hanya baris valid yang disimpan."""
    asg = await db.get(Assignment, assignment_id)
    if not asg or asg.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tugas tidak ditemukan")
    await _ensure_teacher_can_grade(db, current, asg)

    content = await file.read()
    if len(content) > MAX_GRADE_SIZE:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Ukuran file maksimal {MAX_GRADE_SIZE // (1024*1024)}MB",
        )
    parsed, source = _parse_uploaded(file, content)

    nis_list = [p.nis for p in parsed if p.nis]
    student_map = await resolve_students_by_nis(
        db, org_id=current.org_id, school_class_id=asg.school_class_id, nis_list=nis_list
    )

    saved = 0
    skipped = 0
    errors: list[str] = []
    affected_students: set[int] = set()

    for p in parsed:
        if not p.nis or p.nilai is None:
            skipped += 1
            continue
        if p.nilai < 0 or p.nilai > asg.max_score:
            skipped += 1
            errors.append(f"Baris {p.row_num}: nilai {p.nilai} di luar range")
            continue
        student = student_map.get(p.nis)
        if not student:
            skipped += 1
            errors.append(f"Baris {p.row_num}: NIS {p.nis} tidak ditemukan di kelas")
            continue

        existing = (
            await db.execute(
                select(AssignmentGrade).where(
                    AssignmentGrade.assignment_id == assignment_id,
                    AssignmentGrade.student_id == student.id,
                )
            )
        ).scalar_one_or_none()
        if existing:
            existing.score = p.nilai
            existing.note = p.catatan
            existing.source = source
            existing.graded_by = current.id
            existing.updated_at = datetime.utcnow()
        else:
            db.add(AssignmentGrade(
                assignment_id=assignment_id,
                student_id=student.id,
                score=p.nilai,
                note=p.catatan,
                source=source,
                graded_by=current.id,
            ))
        saved += 1
        affected_students.add(student.id)

    await db.flush()
    for sid in affected_students:
        await recompute_gpa_for_student(db, sid)
    await db.commit()

    try:
        from app.services.notification_service import notify_user
        for sid in affected_students:
            await notify_user(
                db, sid,
                title=f"Nilai sudah keluar: {asg.title}",
                body=f"Nilaimu sudah dirilis oleh guru. Cek di Tugas Saya.",
                category="lms_grade",
                url="/my-assignments",
            )
    except Exception:
        pass

    return Envelope(
        data=CsvCommitOut(saved=saved, skipped=skipped, errors=errors[:20]),
        message=f"{saved} nilai diimpor, {skipped} dilewati",
    )


@assignments_router.get("/{assignment_id}/grades/template")
async def grades_template(
    assignment_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Download CSV template berisi daftar siswa di kelas target.

    Guru tinggal isi kolom 'nilai', save, lalu upload.
    """
    asg = await db.get(Assignment, assignment_id)
    if not asg or asg.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tugas tidak ditemukan")

    students = (
        await db.execute(
            select(User).where(
                User.school_class_id == asg.school_class_id,
                User.role == "employee",
                User.status == "active",
            ).order_by(User.full_name)
        )
    ).scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["nis", "nama", "nilai", "catatan"])
    for s in students:
        writer.writerow([s.employee_id, s.full_name, "", ""])

    buf.seek(0)
    filename = f"template_{asg.title.replace(' ', '_')}.csv"
    return StreamingResponse(
        iter([buf.getvalue().encode("utf-8-sig")]),  # BOM untuk Excel
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ═══ STUDENT VIEWS ══════════════════════════════════════════════════════════

student_router = APIRouter(prefix="/lms/me", tags=["LMS - Student"])


@student_router.get("/assignments", response_model=Envelope[list[StudentAssignmentOut]])
async def my_assignments(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Daftar tugas untuk siswa yang sedang login + nilai-nya."""
    if current.role != "employee":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Khusus siswa")
    if not current.school_class_id:
        return Envelope(data=[])

    rows = (
        await db.execute(
            select(Assignment, Subject, User, AssignmentGrade)
            .join(Subject, Subject.id == Assignment.subject_id)
            .join(User, User.id == Assignment.teacher_id)
            .join(
                AssignmentGrade,
                (AssignmentGrade.assignment_id == Assignment.id)
                & (AssignmentGrade.student_id == current.id),
                isouter=True,
            )
            .where(
                Assignment.org_id == current.org_id,
                Assignment.school_class_id == current.school_class_id,
                Assignment.is_published == True,  # noqa: E712
            )
            .order_by(Assignment.created_at.desc())
        )
    ).all()

    out: list[StudentAssignmentOut] = []
    for asg, subj, teacher, grade in rows:
        out.append(StudentAssignmentOut(
            id=asg.id,
            title=asg.title,
            description=asg.description,
            assignment_type=asg.assignment_type,
            subject_name=subj.name,
            subject_code=subj.code,
            teacher_name=teacher.full_name,
            max_score=asg.max_score,
            weight=asg.weight,
            due_date=asg.due_date,
            my_score=grade.score if grade else None,
            my_note=grade.note if grade else None,
            graded_at=grade.graded_at if grade else None,
            created_at=asg.created_at,
            mode=asg.mode,
            duration_minutes=asg.duration_minutes,
        ))
    return Envelope(data=out)


@student_router.get("/materials", response_model=Envelope[list[StudentMaterialOut]])
async def my_materials(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Daftar materi untuk siswa yang sedang login."""
    if current.role != "employee":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Khusus siswa")
    if not current.school_class_id:
        return Envelope(data=[])

    rows = (
        await db.execute(
            select(LessonMaterial, Subject, User)
            .join(Subject, Subject.id == LessonMaterial.subject_id)
            .join(User, User.id == LessonMaterial.teacher_id)
            .where(
                LessonMaterial.org_id == current.org_id,
                LessonMaterial.is_published == True,  # noqa: E712
                # Materi yang ditujukan ke kelas ini, atau global (school_class_id null)
                (LessonMaterial.school_class_id == current.school_class_id)
                | (LessonMaterial.school_class_id.is_(None)),
            )
            .order_by(LessonMaterial.created_at.desc())
        )
    ).all()

    out = [
        StudentMaterialOut(
            id=m.id,
            title=m.title,
            description=m.description,
            subject_name=subj.name,
            subject_code=subj.code,
            teacher_name=teacher.full_name,
            file_url=m.file_url,
            file_name=m.file_name,
            file_size=m.file_size,
            file_mime=m.file_mime,
            created_at=m.created_at,
        )
        for m, subj, teacher in rows
    ]
    return Envelope(data=out)



# ═══ GRADEBOOK (matrix siswa × tugas) ════════════════════════════════════

gradebook_router = APIRouter(prefix="/lms/gradebook", tags=["LMS - Gradebook"])


@gradebook_router.get("", response_model=Envelope[dict])
async def gradebook(
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    school_class_id: Optional[int] = None,
    subject_id: Optional[int] = None,
):
    """Matrix nilai: siswa × tugas, untuk guru/wali kelas/kepsek.

    Auto-scope: wali kelas (admin) default lihat kelasnya.
    Return:
      {
        "class_name": str,
        "students": [{id, nis, name, ...}],
        "assignments": [{id, title, max_score, weight, ...}],
        "grades": {[student_id]: {[assignment_id]: {score, source}}},
        "stats": {
          "students_count": int,
          "assignments_count": int,
          "graded_total": int,
          "ungraded_total": int,
          "class_avg_per_assignment": {[assignment_id]: float | null}
        }
      }
    """
    # Auto-scope wali kelas
    if current.role == "admin" and current.homeroom_class_id and not school_class_id:
        school_class_id = current.homeroom_class_id

    if not school_class_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Pilih kelas dulu untuk melihat gradebook",
        )

    cls = await db.get(SchoolClass, school_class_id)
    if not cls or cls.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kelas tidak ditemukan")

    # Siswa di kelas ini
    students = (
        await db.execute(
            select(User).where(
                User.org_id == current.org_id,
                User.school_class_id == school_class_id,
                User.role == "employee",
                User.status == "active",
            ).order_by(User.full_name)
        )
    ).scalars().all()

    # Assignments untuk kelas ini (filter optional by subject)
    asg_stmt = (
        select(Assignment, Subject)
        .join(Subject, Subject.id == Assignment.subject_id)
        .where(
            Assignment.org_id == current.org_id,
            Assignment.school_class_id == school_class_id,
            Assignment.is_published == True,  # noqa: E712
        )
        .order_by(Assignment.created_at.desc())
    )
    if subject_id:
        asg_stmt = asg_stmt.where(Assignment.subject_id == subject_id)

    asg_rows = (await db.execute(asg_stmt)).all()

    # Grades semua sekaligus
    grades_map: dict[int, dict[int, dict]] = {s.id: {} for s in students}
    if asg_rows:
        asg_ids = [a.id for a, _ in asg_rows]
        student_ids = [s.id for s in students]
        if asg_ids and student_ids:
            grade_rows = (
                await db.execute(
                    select(AssignmentGrade).where(
                        AssignmentGrade.assignment_id.in_(asg_ids),
                        AssignmentGrade.student_id.in_(student_ids),
                    )
                )
            ).scalars().all()
            for g in grade_rows:
                grades_map.setdefault(g.student_id, {})[g.assignment_id] = {
                    "score": g.score,
                    "note": g.note,
                    "source": g.source,
                }

    # Class average per assignment
    class_avg: dict[int, Optional[float]] = {}
    graded_total = 0
    ungraded_total = 0
    student_total_count = len(students)

    for asg, _subj in asg_rows:
        scores = [
            grades_map[s.id].get(asg.id, {}).get("score")
            for s in students
            if grades_map.get(s.id, {}).get(asg.id) is not None
        ]
        if scores:
            class_avg[asg.id] = round(sum(scores) / len(scores), 2)
        else:
            class_avg[asg.id] = None
        graded_total += len(scores)
        ungraded_total += student_total_count - len(scores)

    return Envelope(data={
        "class_id": cls.id,
        "class_name": cls.name,
        "grade": cls.grade,
        "major": cls.major,
        "students": [
            {
                "id": s.id,
                "nis": s.employee_id,
                "name": s.full_name,
                "photo_url": s.photo_url,
            }
            for s in students
        ],
        "assignments": [
            {
                "id": a.id,
                "title": a.title,
                "subject_code": subj.code,
                "subject_name": subj.name,
                "assignment_type": a.assignment_type,
                "max_score": a.max_score,
                "weight": a.weight,
                "due_date": a.due_date.isoformat() if a.due_date else None,
            }
            for a, subj in asg_rows
        ],
        "grades": grades_map,
        "stats": {
            "students_count": student_total_count,
            "assignments_count": len(asg_rows),
            "graded_total": graded_total,
            "ungraded_total": ungraded_total,
            "class_avg_per_assignment": class_avg,
        },
    })



# ═══ DETAIL NILAI PER SISWA ═════════════════════════════════════════════════


@gradebook_router.get("/student/{student_id}", response_model=Envelope[dict])
async def student_grade_detail(
    student_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Rapor lengkap satu siswa: semua tugas + nilainya, dipecah per mata pelajaran.

    Akses:
    - super_admin / hr  : semua siswa di org
    - admin (wali)      : hanya siswa di kelas yang dia ampu (homeroom_class)
    - employee (siswa)  : hanya rapor dirinya sendiri

    Output: ringkasan kelas + breakdown per mata pelajaran + list tugas.
    """
    student = await db.get(User, student_id)
    if not student or student.org_id != current.org_id:
        raise HTTPException(404, "Siswa tidak ditemukan")
    if student.role != "employee":
        raise HTTPException(400, "Hanya untuk akun siswa")

    # Akses kontrol
    if current.role == "employee" and current.id != student_id:
        raise HTTPException(403, "Tidak boleh lihat rapor siswa lain")
    if current.role == "admin":
        # wali kelas hanya boleh siswa kelas yg dia pegang, kecuali super_admin/hr
        if (
            current.homeroom_class_id is None
            or student.school_class_id != current.homeroom_class_id
        ):
            # pengampu juga boleh — tapi cek lewat teaching_assignments terlalu mahal,
            # jadi izinkan kalau dia mengajar di kelas siswa
            ta_match = (
                await db.execute(
                    select(TeachingAssignment).where(
                        TeachingAssignment.teacher_id == current.id,
                        TeachingAssignment.school_class_id == student.school_class_id,
                    ).limit(1)
                )
            ).scalar_one_or_none()
            if not ta_match:
                raise HTTPException(403, "Bukan wali kelas / pengampu siswa ini")

    # Kelas
    cls = (
        await db.get(SchoolClass, student.school_class_id)
        if student.school_class_id
        else None
    )

    # Ambil semua tugas yang ditujukan untuk kelas siswa, plus nilainya
    rows = (
        await db.execute(
            select(Assignment, Subject, User, AssignmentGrade)
            .join(Subject, Subject.id == Assignment.subject_id)
            .join(User, User.id == Assignment.teacher_id)
            .outerjoin(
                AssignmentGrade,
                (AssignmentGrade.assignment_id == Assignment.id)
                & (AssignmentGrade.student_id == student.id),
            )
            .where(
                Assignment.org_id == current.org_id,
                Assignment.school_class_id == student.school_class_id,
                Assignment.is_published == True,  # noqa: E712
            )
            .order_by(Subject.code, Assignment.created_at.desc())
        )
    ).all()

    # Aggregate per subject
    by_subject: dict[int, dict] = {}
    all_assignments: list[dict] = []
    total_weighted = 0.0
    total_weight = 0.0

    for asg, subj, teacher, grade in rows:
        score = float(grade.score) if grade else None
        max_score = float(asg.max_score)
        pct = (score / max_score * 100) if (score is not None and max_score > 0) else None
        weight = float(asg.weight or 1.0)

        item = {
            "assignment_id": asg.id,
            "title": asg.title,
            "assignment_type": asg.assignment_type,
            "subject_id": subj.id,
            "subject_code": subj.code,
            "subject_name": subj.name,
            "teacher_name": teacher.full_name,
            "max_score": max_score,
            "weight": weight,
            "due_date": asg.due_date.isoformat() if asg.due_date else None,
            "mode": asg.mode,
            "score": score,
            "percent": round(pct, 2) if pct is not None else None,
            "note": grade.note if grade else None,
            "graded_at": grade.graded_at.isoformat() if grade and grade.graded_at else None,
            "is_graded": score is not None,
        }
        all_assignments.append(item)

        if subj.id not in by_subject:
            by_subject[subj.id] = {
                "subject_id": subj.id,
                "subject_code": subj.code,
                "subject_name": subj.name,
                "teacher_name": teacher.full_name,
                "assignments_count": 0,
                "graded_count": 0,
                "weighted_sum": 0.0,
                "total_weight": 0.0,
            }
        s = by_subject[subj.id]
        s["assignments_count"] += 1
        if score is not None and max_score > 0:
            s["graded_count"] += 1
            s["weighted_sum"] += pct * weight  # type: ignore[operator]
            s["total_weight"] += weight
            total_weighted += pct * weight  # type: ignore[operator]
            total_weight += weight

    subjects_summary = []
    for sid, s in by_subject.items():
        avg = s["weighted_sum"] / s["total_weight"] if s["total_weight"] > 0 else None
        subjects_summary.append({
            "subject_id": s["subject_id"],
            "subject_code": s["subject_code"],
            "subject_name": s["subject_name"],
            "teacher_name": s["teacher_name"],
            "assignments_count": s["assignments_count"],
            "graded_count": s["graded_count"],
            "average": round(avg, 2) if avg is not None else None,
        })
    subjects_summary.sort(key=lambda x: x["subject_code"])

    overall_gpa = (total_weighted / total_weight) if total_weight > 0 else None

    # Cari peringkat di kelas (berdasarkan GPA cache di discipline_profiles)
    rank_info = None
    try:
        from app.models import DisciplineProfile

        my_profile = (
            await db.execute(
                select(DisciplineProfile).where(DisciplineProfile.user_id == student.id)
            )
        ).scalar_one_or_none()
        if my_profile and student.school_class_id:
            class_profiles = (
                await db.execute(
                    select(DisciplineProfile, User)
                    .join(User, User.id == DisciplineProfile.user_id)
                    .where(
                        User.school_class_id == student.school_class_id,
                        User.role == "employee",
                        User.status == "active",
                    )
                )
            ).all()
            sorted_p = sorted(
                class_profiles, key=lambda r: r[0].gpa or 0, reverse=True
            )
            rank = next(
                (i + 1 for i, (p, u) in enumerate(sorted_p) if u.id == student.id),
                None,
            )
            rank_info = {
                "rank": rank,
                "class_size": len(sorted_p),
                "cached_gpa": my_profile.gpa,
            }
    except Exception:
        pass

    return Envelope(data={
        "student": {
            "id": student.id,
            "full_name": student.full_name,
            "employee_id": student.employee_id,
            "photo_url": student.photo_url,
            "class_id": student.school_class_id,
            "class_name": cls.name if cls else None,
        },
        "summary": {
            "overall_gpa": round(overall_gpa, 2) if overall_gpa is not None else None,
            "subjects_count": len(subjects_summary),
            "assignments_count": len(all_assignments),
            "graded_count": sum(1 for a in all_assignments if a["is_graded"]),
            "ungraded_count": sum(1 for a in all_assignments if not a["is_graded"]),
            "rank_in_class": rank_info,
        },
        "subjects": subjects_summary,
        "assignments": all_assignments,
    })
