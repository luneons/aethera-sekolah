"""Absensi per mata pelajaran.

Use case:
- Guru buka kelas → daftar siswa muncul → guru centang hadir/sakit/izin/alpa.
- Bisa bulk-mark "semua hadir" lalu adjust per siswa.
- Auto-resolve from leave request: kalau siswa lagi ada izin/sakit yang approved,
  status di-prefill ke 'sick' atau 'permit'.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    LeaveRequest, SchoolClass, SubjectAttendance, Subject, TimetableSlot, User,
)
from app.schemas import Envelope
from app.security import get_current_user, require_roles


router = APIRouter(prefix="/subject-attendance", tags=["Subject Attendance"])


# ─── Schemas ────────────────────────────────────────────────────────────────


VALID_STATUSES = ("present", "late", "absent", "sick", "permit", "leave")


class StudentAttRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    student_id: int
    full_name: str
    employee_id: str
    photo_url: Optional[str] = None
    status: str
    note: Optional[str] = None
    record_id: Optional[int] = None  # null kalau belum direkam


class SessionRosterOut(BaseModel):
    slot_id: int
    subject_name: str
    teacher_name: Optional[str]
    school_class_name: str
    session_date: date
    period_index: int
    students: list[StudentAttRow]


class MarkOne(BaseModel):
    student_id: int
    status: str = Field(pattern="^(present|late|absent|sick|permit|leave)$")
    note: Optional[str] = None


class BulkMarkIn(BaseModel):
    slot_id: int
    session_date: date
    rows: list[MarkOne]


class StudentSummaryOut(BaseModel):
    subject_id: int
    subject_code: str
    subject_name: str
    total_sessions: int
    present: int
    late: int
    absent: int
    sick: int
    permit: int
    leave: int
    attendance_rate: float  # 0–100


# ─── Helpers ────────────────────────────────────────────────────────────────


async def _check_slot_access(
    db: AsyncSession, current: User, slot: TimetableSlot
) -> None:
    if slot.org_id != current.org_id:
        raise HTTPException(404, "Slot tidak ditemukan")
    if current.role == "admin" and slot.teacher_id != current.id and current.homeroom_class_id != slot.school_class_id:
        raise HTTPException(403, "Bukan guru atau wali kelas slot ini")
    # super_admin & hr lolos


# ─── Endpoints ──────────────────────────────────────────────────────────────


@router.get("/session/{slot_id}", response_model=Envelope[SessionRosterOut])
async def get_session_roster(
    slot_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    session_date: Optional[date] = None,
):
    """Roster untuk 1 sesi mapel: daftar siswa kelas + status absen."""
    slot = await db.get(TimetableSlot, slot_id)
    if not slot:
        raise HTTPException(404, "Slot tidak ditemukan")
    await _check_slot_access(db, current, slot)
    sess_date = session_date or date.today()

    cls = await db.get(SchoolClass, slot.school_class_id)
    subject = await db.get(Subject, slot.subject_id) if slot.subject_id else None
    teacher = await db.get(User, slot.teacher_id) if slot.teacher_id else None

    students = (
        await db.execute(
            select(User).where(
                User.school_class_id == slot.school_class_id,
                User.role == "employee",
                User.status == "active",
            ).order_by(User.full_name)
        )
    ).scalars().all()

    if not students:
        return Envelope(data=SessionRosterOut(
            slot_id=slot.id,
            subject_name=subject.name if subject else "?",
            teacher_name=teacher.full_name if teacher else None,
            school_class_name=cls.name if cls else "?",
            session_date=sess_date,
            period_index=slot.period_index,
            students=[],
        ))

    # Existing records
    existing = (
        await db.execute(
            select(SubjectAttendance).where(
                SubjectAttendance.timetable_slot_id == slot_id,
                SubjectAttendance.session_date == sess_date,
                SubjectAttendance.student_id.in_([s.id for s in students]),
            )
        )
    ).scalars().all()
    existing_map = {r.student_id: r for r in existing}

    # Approved leave requests in date range — prefill status
    leave_rows = (
        await db.execute(
            select(LeaveRequest).where(
                LeaveRequest.student_id.in_([s.id for s in students]),
                LeaveRequest.status == "approved",
                LeaveRequest.start_date <= sess_date,
                LeaveRequest.end_date >= sess_date,
            )
        )
    ).scalars().all()
    leave_map = {r.student_id: r for r in leave_rows}

    rows: list[StudentAttRow] = []
    for s in students:
        rec = existing_map.get(s.id)
        if rec:
            status_v = rec.status
            note_v = rec.note
            rid = rec.id
        else:
            # Prefill dari leave request
            lr = leave_map.get(s.id)
            if lr:
                status_v = "sick" if lr.kind == "sakit" else "permit"
                note_v = f"Otomatis: izin {lr.kind}"
            else:
                status_v = "present"
                note_v = None
            rid = None
        rows.append(StudentAttRow(
            student_id=s.id,
            full_name=s.full_name,
            employee_id=s.employee_id,
            photo_url=s.photo_url,
            status=status_v,
            note=note_v,
            record_id=rid,
        ))

    return Envelope(data=SessionRosterOut(
        slot_id=slot.id,
        subject_name=subject.name if subject else "?",
        teacher_name=teacher.full_name if teacher else None,
        school_class_name=cls.name if cls else "?",
        session_date=sess_date,
        period_index=slot.period_index,
        students=rows,
    ))


@router.post("/bulk-mark", response_model=Envelope[dict])
async def bulk_mark(
    payload: BulkMarkIn,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Guru bulk-mark roster sesi mapel."""
    slot = await db.get(TimetableSlot, payload.slot_id)
    if not slot:
        raise HTTPException(404, "Slot tidak ditemukan")
    await _check_slot_access(db, current, slot)
    if current.role not in ("super_admin", "admin", "hr"):
        raise HTTPException(403, "Tidak punya akses input absensi mapel")

    # Validate that all students belong to the class
    student_ids = [r.student_id for r in payload.rows]
    valid_students = (
        await db.execute(
            select(User.id).where(
                User.id.in_(student_ids),
                User.school_class_id == slot.school_class_id,
            )
        )
    ).scalars().all()
    valid_set = set(valid_students)

    saved = 0
    skipped = 0
    for row in payload.rows:
        if row.student_id not in valid_set:
            skipped += 1
            continue
        existing = (
            await db.execute(
                select(SubjectAttendance).where(
                    SubjectAttendance.timetable_slot_id == payload.slot_id,
                    SubjectAttendance.session_date == payload.session_date,
                    SubjectAttendance.student_id == row.student_id,
                )
            )
        ).scalar_one_or_none()
        if existing:
            existing.status = row.status
            existing.note = row.note
            existing.recorded_by = current.id
        else:
            db.add(SubjectAttendance(
                student_id=row.student_id,
                timetable_slot_id=payload.slot_id,
                session_date=payload.session_date,
                status=row.status,
                note=row.note,
                recorded_by=current.id,
            ))
        saved += 1
    await db.commit()
    return Envelope(data={"saved": saved, "skipped": skipped})


@router.get("/student/{student_id}/summary", response_model=Envelope[list[StudentSummaryOut]])
async def student_summary(
    student_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
):
    """Rekap kehadiran per mapel untuk 1 siswa.

    Akses: siswa sendiri, wali kelas, BK, kepsek.
    """
    student = await db.get(User, student_id)
    if not student or student.org_id != current.org_id:
        raise HTTPException(404, "Siswa tidak ditemukan")
    if current.role == "employee" and current.id != student_id:
        raise HTTPException(403, "Hanya bisa lihat absensi sendiri")
    if current.role == "admin" and current.homeroom_class_id != student.school_class_id:
        raise HTTPException(403, "Bukan wali kelas siswa ini")

    stmt = (
        select(
            Subject.id,
            Subject.code,
            Subject.name,
            SubjectAttendance.status,
            func.count(SubjectAttendance.id).label("n"),
        )
        .join(TimetableSlot, TimetableSlot.id == SubjectAttendance.timetable_slot_id)
        .join(Subject, Subject.id == TimetableSlot.subject_id)
        .where(SubjectAttendance.student_id == student_id)
    )
    if from_date:
        stmt = stmt.where(SubjectAttendance.session_date >= from_date)
    if to_date:
        stmt = stmt.where(SubjectAttendance.session_date <= to_date)
    stmt = stmt.group_by(Subject.id, Subject.code, Subject.name, SubjectAttendance.status)
    rows = (await db.execute(stmt)).all()

    # Aggregate per subject
    agg: dict[int, dict] = {}
    for row in rows:
        sid = row[0]
        if sid not in agg:
            agg[sid] = {
                "subject_id": sid,
                "subject_code": row[1],
                "subject_name": row[2],
                "present": 0, "late": 0, "absent": 0,
                "sick": 0, "permit": 0, "leave": 0,
            }
        agg[sid][row[3]] = row[4]

    out: list[StudentSummaryOut] = []
    for s in agg.values():
        total = sum(s[k] for k in ("present", "late", "absent", "sick", "permit", "leave"))
        present_total = s["present"] + s["late"]
        rate = (present_total / total * 100) if total else 0
        out.append(StudentSummaryOut(
            **s, total_sessions=total, attendance_rate=round(rate, 1),
        ))
    return Envelope(data=sorted(out, key=lambda x: x.subject_code))
