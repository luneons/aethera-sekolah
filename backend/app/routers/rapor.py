"""Rapor PDF endpoint — generate & download per siswa per semester."""
from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
import io
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    Assignment,
    AssignmentGrade,
    AttendanceRecord,
    DisciplineIncident,
    DisciplineProfile,
    Organization,
    SchoolClass,
    Subject,
    User,
)
from app.schemas import Envelope
from app.security import get_current_user, require_roles
from app.services.rapor_service import build_rapor_pdf


router = APIRouter(prefix="/rapor", tags=["Rapor"])


# ─── Helpers ────────────────────────────────────────────────────────────────


def _semester_label(semester: str, school_year: str) -> str:
    s = "Ganjil" if semester.lower().startswith("ganjil") else "Genap"
    return f"{s} {school_year}"


def _semester_date_range(semester: str, school_year: str) -> tuple[date, date]:
    """Range tanggal untuk semester. Default kalender Indonesia:
    - Ganjil: Juli tahun depan – Desember tahun ini
    - Genap: Januari – Juni tahun ini
    """
    try:
        # school_year format "2025/2026"
        y1, y2 = school_year.split("/")
        y1, y2 = int(y1), int(y2)
    except (ValueError, AttributeError):
        # Default ke tahun ini
        today = date.today()
        y1, y2 = today.year, today.year + 1

    if semester.lower().startswith("ganjil"):
        return date(y1, 7, 1), date(y1, 12, 31)
    else:
        return date(y2, 1, 1), date(y2, 6, 30)


async def _gather_rapor_data(
    db: AsyncSession,
    student: User,
    semester: str,
    school_year: str,
) -> dict:
    """Kumpulkan semua data rapor."""
    start_date, end_date = _semester_date_range(semester, school_year)

    # Nilai per mapel (rerata weighted by `weight`)
    grade_rows = (
        await db.execute(
            select(
                Subject.id,
                Subject.code,
                Subject.name,
                func.sum(AssignmentGrade.score / Assignment.max_score * 100 * Assignment.weight)
                    .label("total_weighted"),
                func.sum(Assignment.weight).label("total_weight"),
                func.count(AssignmentGrade.id).label("n_grades"),
            )
            .join(Assignment, Assignment.id == AssignmentGrade.assignment_id)
            .join(Subject, Subject.id == Assignment.subject_id)
            .where(
                AssignmentGrade.student_id == student.id,
                AssignmentGrade.graded_at >= datetime.combine(start_date, datetime.min.time()),
                AssignmentGrade.graded_at <= datetime.combine(end_date, datetime.max.time()),
            )
            .group_by(Subject.id, Subject.code, Subject.name)
            .order_by(Subject.code)
        )
    ).all()

    grades_per_subject = []
    for row in grade_rows:
        avg = float(row.total_weighted / row.total_weight) if row.total_weight else 0
        grades_per_subject.append({
            "code": row.code,
            "subject": row.name,
            "average": avg,
            "kkm": 75,  # default; later bisa dari setting per-mapel
            "n": row.n_grades,
        })

    # Kehadiran
    att_rows = (
        await db.execute(
            select(AttendanceRecord.status, func.count(AttendanceRecord.id))
            .where(
                AttendanceRecord.user_id == student.id,
                AttendanceRecord.attendance_date >= start_date,
                AttendanceRecord.attendance_date <= end_date,
            )
            .group_by(AttendanceRecord.status)
        )
    ).all()
    att = {r[0]: r[1] for r in att_rows}
    attendance = {
        "hadir": att.get("present", 0) + att.get("late", 0),
        "izin": att.get("leave", 0) + att.get("permit", 0),
        "sakit": att.get("sick", 0),
        "alpa": att.get("absent", 0),
        "total_hari": sum(att.values()),
    }

    # Disiplin
    profile = (
        await db.execute(
            select(DisciplineProfile).where(DisciplineProfile.user_id == student.id)
        )
    ).scalar_one_or_none()
    kts = (
        await db.execute(
            select(func.count(DisciplineIncident.id)).where(
                DisciplineIncident.user_id == student.id,
                DisciplineIncident.kind == "penalty",
                DisciplineIncident.incident_date >= start_date,
                DisciplineIncident.incident_date <= end_date,
            )
        )
    ).scalar_one()
    discipline = {
        "attitude_points": profile.attitude_points if profile else 100,
        "appreciation_points": profile.appreciation_points if profile else 0,
        "kts_count": int(kts),
    }

    return {
        "grades": grades_per_subject,
        "attendance": attendance,
        "discipline": discipline,
    }


# ─── Endpoints ──────────────────────────────────────────────────────────────


@router.get("/student/{student_id}")
async def download_rapor(
    student_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    semester: str = "Ganjil",
    school_year: str = "2025/2026",
    catatan: Optional[str] = None,
):
    """Generate & download rapor PDF.

    Akses:
    - Siswa: hanya rapor diri sendiri
    - Wali kelas: kelas yang ia pegang
    - BK/Kepsek: semua siswa di org
    """
    student = await db.get(User, student_id)
    if not student or student.org_id != current.org_id or student.role != "employee":
        raise HTTPException(404, "Siswa tidak ditemukan")

    if current.role == "employee" and current.id != student_id:
        raise HTTPException(403, "Hanya bisa lihat rapor sendiri")
    if current.role == "admin" and current.homeroom_class_id != student.school_class_id:
        # Wali kelas hanya boleh kelasnya
        raise HTTPException(403, "Bukan wali kelas siswa ini")

    # Data sekolah
    org = await db.get(Organization, current.org_id)
    cls = (
        await db.get(SchoolClass, student.school_class_id)
        if student.school_class_id else None
    )

    # Wali kelas siswa
    wali_kelas_name = None
    if cls:
        wali = (
            await db.execute(
                select(User).where(User.homeroom_class_id == cls.id, User.role == "admin").limit(1)
            )
        ).scalar_one_or_none()
        wali_kelas_name = wali.full_name if wali else None

    # Kepsek
    kepsek = (
        await db.execute(
            select(User).where(
                User.org_id == current.org_id, User.role == "super_admin"
            ).limit(1)
        )
    ).scalar_one_or_none()

    data = await _gather_rapor_data(db, student, semester, school_year)

    pdf_bytes = build_rapor_pdf(
        org_name=org.name if org else "Sekolah",
        org_address=getattr(org, "address", None),
        npsn=getattr(org, "npsn", None),
        student_name=student.full_name,
        student_employee_id=student.employee_id,
        student_class=cls.name if cls else None,
        semester=_semester_label(semester, school_year),
        grades_per_subject=data["grades"],
        attendance=data["attendance"],
        discipline=data["discipline"],
        wali_kelas_name=wali_kelas_name,
        kepsek_name=kepsek.full_name if kepsek else None,
        catatan_wali_kelas=catatan,
    )

    filename = f"Rapor_{student.full_name.replace(' ', '_')}_{semester}_{school_year.replace('/', '-')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/preview/{student_id}", response_model=Envelope[dict])
async def rapor_preview(
    student_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    semester: str = "Ganjil",
    school_year: str = "2025/2026",
):
    """Preview data rapor dalam JSON (untuk frontend tampilkan sebelum print)."""
    student = await db.get(User, student_id)
    if not student or student.org_id != current.org_id or student.role != "employee":
        raise HTTPException(404, "Siswa tidak ditemukan")
    if current.role == "employee" and current.id != student_id:
        raise HTTPException(403, "Hanya bisa lihat rapor sendiri")
    if current.role == "admin" and current.homeroom_class_id != student.school_class_id:
        raise HTTPException(403, "Bukan wali kelas siswa ini")

    cls = (
        await db.get(SchoolClass, student.school_class_id)
        if student.school_class_id else None
    )
    data = await _gather_rapor_data(db, student, semester, school_year)
    return Envelope(data={
        "student": {
            "id": student.id,
            "name": student.full_name,
            "employee_id": student.employee_id,
            "class_name": cls.name if cls else None,
        },
        "semester": _semester_label(semester, school_year),
        **data,
    })
