"""School schedule (jam masuk/pulang) management endpoints.

Fitur:
- GET  /schedule/         → list semua jadwal org
- POST /schedule/         → buat jadwal baru
- GET  /schedule/active   → jadwal aktif saat ini (untuk kiosk/scan page)
- GET  /schedule/{id}     → detail jadwal
- PUT  /schedule/{id}     → update jadwal
- DELETE /schedule/{id}   → hapus jadwal
- POST /schedule/{id}/activate → set sebagai jadwal aktif
"""
from datetime import time
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AuditLog, Organization, WorkSchedule
from app.schemas import Envelope
from app.security import get_current_user, require_roles
from app.models import User

router = APIRouter(prefix="/schedule", tags=["Schedule"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ScheduleIn(BaseModel):
    name: str
    check_in_start: str   # "HH:MM"
    check_in_end: str     # "HH:MM" — batas toleransi terlambat
    check_out_start: str  # "HH:MM" — jam pulang minimum
    grace_period: int = 0  # menit toleransi setelah check_in_end sebelum dianggap terlambat
    work_days: str = "1,2,3,4,5"  # 1=Senin … 7=Minggu, comma-joined

    @field_validator("check_in_start", "check_in_end", "check_out_start")
    @classmethod
    def validate_time_format(cls, v: str) -> str:
        try:
            h, m = v.split(":")
            assert 0 <= int(h) <= 23 and 0 <= int(m) <= 59
        except Exception:
            raise ValueError(f"Format waktu harus HH:MM, dapat: {v!r}")
        return v


class ScheduleOut(BaseModel):
    id: int
    org_id: int
    name: str
    check_in_start: str
    check_in_end: str
    check_out_start: str
    grace_period: int
    work_days: Optional[str]
    is_active: bool

    model_config = {"from_attributes": True}


def _to_str(t: time) -> str:
    return t.strftime("%H:%M")


def _to_time(s: str) -> time:
    h, m = s.split(":")
    return time(int(h), int(m))


def _schedule_out(s: WorkSchedule) -> ScheduleOut:
    return ScheduleOut(
        id=s.id,
        org_id=s.org_id,
        name=s.name,
        check_in_start=_to_str(s.check_in_start),
        check_in_end=_to_str(s.check_in_end),
        check_out_start=_to_str(s.check_out_start),
        grace_period=s.grace_period or 0,
        work_days=s.work_days,
        is_active=getattr(s, "is_active", False),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/active", response_model=Envelope[Optional[ScheduleOut]])
async def get_active_schedule(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Public endpoint — dipakai kiosk scan untuk tahu jam masuk/pulang."""
    row = (
        await db.execute(
            select(WorkSchedule)
            .where(WorkSchedule.is_active == True)  # noqa: E712
            .order_by(WorkSchedule.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return Envelope(data=_schedule_out(row) if row else None)


@router.get("/", response_model=Envelope[list[ScheduleOut]])
async def list_schedules(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (
        await db.execute(
            select(WorkSchedule)
            .where(WorkSchedule.org_id == current.org_id)
            .order_by(WorkSchedule.is_active.desc(), WorkSchedule.id.asc())
        )
    ).scalars().all()
    return Envelope(data=[_schedule_out(r) for r in rows])


@router.post("/", response_model=Envelope[ScheduleOut], status_code=status.HTTP_201_CREATED)
async def create_schedule(
    payload: ScheduleIn,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    s = WorkSchedule(
        org_id=current.org_id,
        name=payload.name,
        check_in_start=_to_time(payload.check_in_start),
        check_in_end=_to_time(payload.check_in_end),
        check_out_start=_to_time(payload.check_out_start),
        grace_period=payload.grace_period,
        work_days=payload.work_days,
        is_active=False,
    )
    db.add(s)
    db.add(AuditLog(
        user_id=current.id, action="CREATE_SCHEDULE",
        target_type="schedule", extra_meta={"name": payload.name},
    ))
    await db.commit()
    await db.refresh(s)
    return Envelope(data=_schedule_out(s), message="Jadwal berhasil dibuat")


@router.get("/{schedule_id}", response_model=Envelope[ScheduleOut])
async def get_schedule(
    schedule_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    s = await db.get(WorkSchedule, schedule_id)
    if not s or s.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jadwal tidak ditemukan")
    return Envelope(data=_schedule_out(s))


@router.put("/{schedule_id}", response_model=Envelope[ScheduleOut])
async def update_schedule(
    schedule_id: int,
    payload: ScheduleIn,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    s = await db.get(WorkSchedule, schedule_id)
    if not s or s.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jadwal tidak ditemukan")

    s.name = payload.name
    s.check_in_start = _to_time(payload.check_in_start)
    s.check_in_end = _to_time(payload.check_in_end)
    s.check_out_start = _to_time(payload.check_out_start)
    s.grace_period = payload.grace_period
    s.work_days = payload.work_days

    db.add(AuditLog(
        user_id=current.id, action="UPDATE_SCHEDULE",
        target_type="schedule", target_id=s.id,
        extra_meta={"name": payload.name},
    ))
    await db.commit()
    await db.refresh(s)
    return Envelope(data=_schedule_out(s), message="Jadwal diperbarui")


@router.post("/{schedule_id}/activate", response_model=Envelope[ScheduleOut])
async def activate_schedule(
    schedule_id: int,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Set jadwal ini sebagai aktif, nonaktifkan yang lain di org yang sama."""
    target = await db.get(WorkSchedule, schedule_id)
    if not target or target.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jadwal tidak ditemukan")

    # Nonaktifkan semua jadwal lain di org ini
    all_schedules = (
        await db.execute(
            select(WorkSchedule).where(WorkSchedule.org_id == current.org_id)
        )
    ).scalars().all()
    for s in all_schedules:
        s.is_active = (s.id == schedule_id)

    db.add(AuditLog(
        user_id=current.id, action="ACTIVATE_SCHEDULE",
        target_type="schedule", target_id=schedule_id,
        extra_meta={"name": target.name},
    ))
    await db.commit()
    await db.refresh(target)
    return Envelope(data=_schedule_out(target), message=f"Jadwal '{target.name}' diaktifkan")


@router.delete("/{schedule_id}", response_model=Envelope[dict])
async def delete_schedule(
    schedule_id: int,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    s = await db.get(WorkSchedule, schedule_id)
    if not s or s.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jadwal tidak ditemukan")
    if s.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tidak bisa hapus jadwal yang sedang aktif")

    db.add(AuditLog(
        user_id=current.id, action="DELETE_SCHEDULE",
        target_type="schedule", target_id=s.id,
        extra_meta={"name": s.name},
    ))
    await db.delete(s)
    await db.commit()
    return Envelope(data={"deleted": schedule_id}, message="Jadwal dihapus")
