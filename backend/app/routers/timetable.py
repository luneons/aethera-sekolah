"""Jadwal Pelajaran (Timetable) — matrix kelas × hari × jam."""
from __future__ import annotations

from datetime import date, time, datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    SchoolClass,
    Subject,
    TimetableSlot,
    User,
)
from app.schemas import Envelope
from app.security import get_current_user, require_roles


router = APIRouter(prefix="/timetable", tags=["Timetable"])


DAY_NAMES = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]


# ─── Schemas ────────────────────────────────────────────────────────────────


class SlotIn(BaseModel):
    school_class_id: int
    day_of_week: int = Field(ge=0, le=5)
    period_index: int = Field(ge=1, le=12)
    start_time: time
    end_time: time
    subject_id: Optional[int] = None
    teacher_id: Optional[int] = None
    room: Optional[str] = None
    notes: Optional[str] = None


class SlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    school_class_id: int
    school_class_name: Optional[str] = None
    day_of_week: int
    day_name: str
    period_index: int
    start_time: time
    end_time: time
    subject_id: Optional[int] = None
    subject_code: Optional[str] = None
    subject_name: Optional[str] = None
    teacher_id: Optional[int] = None
    teacher_name: Optional[str] = None
    room: Optional[str] = None
    notes: Optional[str] = None
    has_conflict: bool = False
    conflict_with: Optional[str] = None


# ─── Helpers ────────────────────────────────────────────────────────────────


async def _enrich(db: AsyncSession, slot: TimetableSlot) -> SlotOut:
    cls = await db.get(SchoolClass, slot.school_class_id)
    subj = await db.get(Subject, slot.subject_id) if slot.subject_id else None
    teacher = await db.get(User, slot.teacher_id) if slot.teacher_id else None
    return SlotOut(
        id=slot.id,
        school_class_id=slot.school_class_id,
        school_class_name=cls.name if cls else None,
        day_of_week=slot.day_of_week,
        day_name=DAY_NAMES[slot.day_of_week] if 0 <= slot.day_of_week <= 5 else f"Hari{slot.day_of_week}",
        period_index=slot.period_index,
        start_time=slot.start_time,
        end_time=slot.end_time,
        subject_id=slot.subject_id,
        subject_code=subj.code if subj else None,
        subject_name=subj.name if subj else None,
        teacher_id=slot.teacher_id,
        teacher_name=teacher.full_name if teacher else None,
        room=slot.room,
        notes=slot.notes,
    )


async def _detect_teacher_conflict(
    db: AsyncSession, slot_data: SlotIn, exclude_id: Optional[int] = None
) -> Optional[TimetableSlot]:
    """Cari slot lain yang ngebrok teacher di waktu sama."""
    if not slot_data.teacher_id:
        return None
    stmt = select(TimetableSlot).where(
        TimetableSlot.teacher_id == slot_data.teacher_id,
        TimetableSlot.day_of_week == slot_data.day_of_week,
        TimetableSlot.period_index == slot_data.period_index,
    )
    if exclude_id:
        stmt = stmt.where(TimetableSlot.id != exclude_id)
    return (await db.execute(stmt)).scalar_one_or_none()


# ─── Endpoints ──────────────────────────────────────────────────────────────


@router.get("", response_model=Envelope[list[SlotOut]])
async def list_slots(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    school_class_id: Optional[int] = None,
    teacher_id: Optional[int] = None,
):
    """List slot. Filter optional per kelas atau per guru.

    Akses:
    - Siswa: hanya jadwal kelasnya sendiri
    - Guru/Wali/BK/Kepsek: free filter
    """
    stmt = select(TimetableSlot).where(TimetableSlot.org_id == current.org_id)

    if current.role == "employee":
        if not current.school_class_id:
            return Envelope(data=[])
        stmt = stmt.where(TimetableSlot.school_class_id == current.school_class_id)
    elif school_class_id:
        stmt = stmt.where(TimetableSlot.school_class_id == school_class_id)

    if teacher_id:
        stmt = stmt.where(TimetableSlot.teacher_id == teacher_id)

    rows = (
        await db.execute(stmt.order_by(TimetableSlot.day_of_week, TimetableSlot.period_index))
    ).scalars().all()

    out = []
    # Detect conflict in batch
    teacher_slots: dict[tuple[int, int, int], list[TimetableSlot]] = {}
    if not teacher_id:
        # Build conflict map dari semua data milik org
        all_slots = (
            await db.execute(
                select(TimetableSlot).where(TimetableSlot.org_id == current.org_id)
            )
        ).scalars().all()
        for s in all_slots:
            if s.teacher_id:
                k = (s.teacher_id, s.day_of_week, s.period_index)
                teacher_slots.setdefault(k, []).append(s)

    for slot in rows:
        item = await _enrich(db, slot)
        if slot.teacher_id:
            k = (slot.teacher_id, slot.day_of_week, slot.period_index)
            collision = teacher_slots.get(k, [])
            others = [s for s in collision if s.id != slot.id]
            if others:
                item.has_conflict = True
                conflict_cls = await db.get(SchoolClass, others[0].school_class_id)
                item.conflict_with = conflict_cls.name if conflict_cls else f"Slot #{others[0].id}"
        out.append(item)

    return Envelope(data=out)


@router.post("/slots", response_model=Envelope[SlotOut], status_code=201)
async def create_slot(
    payload: SlotIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    cls = await db.get(SchoolClass, payload.school_class_id)
    if not cls or cls.org_id != current.org_id:
        raise HTTPException(404, "Kelas tidak ditemukan")
    if payload.subject_id:
        subj = await db.get(Subject, payload.subject_id)
        if not subj or subj.org_id != current.org_id:
            raise HTTPException(404, "Mata pelajaran tidak ditemukan")
    if payload.teacher_id:
        teacher = await db.get(User, payload.teacher_id)
        if not teacher or teacher.org_id != current.org_id:
            raise HTTPException(404, "Guru tidak ditemukan")
    if payload.start_time >= payload.end_time:
        raise HTTPException(422, "Jam mulai harus < jam selesai")

    # Check existing slot at this position (idempotent: replace)
    existing = (
        await db.execute(
            select(TimetableSlot).where(
                TimetableSlot.school_class_id == payload.school_class_id,
                TimetableSlot.day_of_week == payload.day_of_week,
                TimetableSlot.period_index == payload.period_index,
            )
        )
    ).scalar_one_or_none()

    if existing:
        for k, v in payload.model_dump().items():
            setattr(existing, k, v)
        slot = existing
    else:
        slot = TimetableSlot(org_id=current.org_id, **payload.model_dump())
        db.add(slot)
    await db.commit()
    await db.refresh(slot)
    return Envelope(data=await _enrich(db, slot))


@router.delete("/slots/{slot_id}", response_model=Envelope[dict])
async def delete_slot(
    slot_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    slot = await db.get(TimetableSlot, slot_id)
    if not slot or slot.org_id != current.org_id:
        raise HTTPException(404, "Slot tidak ditemukan")
    await db.delete(slot)
    await db.commit()
    return Envelope(data={"ok": True})


@router.get("/grid", response_model=Envelope[dict])
async def grid_view(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    school_class_id: int,
):
    """Format grid untuk render UI: 6 hari × 10 jam = matrix."""
    cls = await db.get(SchoolClass, school_class_id)
    if not cls or cls.org_id != current.org_id:
        raise HTTPException(404, "Kelas tidak ditemukan")

    slots = (
        await db.execute(
            select(TimetableSlot)
            .where(TimetableSlot.school_class_id == school_class_id)
            .order_by(TimetableSlot.day_of_week, TimetableSlot.period_index)
        )
    ).scalars().all()

    grid: dict[int, dict[int, SlotOut]] = {}
    for s in slots:
        grid.setdefault(s.day_of_week, {})[s.period_index] = await _enrich(db, s)

    return Envelope(data={
        "class_id": school_class_id,
        "class_name": cls.name,
        "days": [{"index": i, "name": DAY_NAMES[i]} for i in range(6)],
        "max_period": max([s.period_index for s in slots], default=8),
        "grid": {
            str(d): {str(p): s.model_dump(mode="json") for p, s in periods.items()}
            for d, periods in grid.items()
        },
    })
