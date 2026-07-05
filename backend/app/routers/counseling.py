"""Booking Konsultasi BK — slot, booking, anonim, private note BK."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import CounselingBooking, CounselingSlot, User
from app.schemas import Envelope
from app.security import get_current_user, require_roles


router = APIRouter(prefix="/counseling", tags=["Counseling"])


# ─── Schemas ────────────────────────────────────────────────────────────────


class SlotIn(BaseModel):
    slot_date: date
    start_time: time
    end_time: time
    is_blocked: bool = False
    note: Optional[str] = None


class BulkSlotIn(BaseModel):
    """Generate slot batch — misal 9-12 setiap 30 menit, hari Senin-Jumat 7 hari ke depan."""
    days: int = Field(default=7, ge=1, le=31)
    start_hour: int = Field(default=9, ge=0, le=22)
    end_hour: int = Field(default=15, ge=1, le=23)
    duration_minutes: int = Field(default=30, ge=15, le=120)
    skip_weekends: bool = True


class SlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    counselor_id: int
    counselor_name: Optional[str] = None
    slot_date: date
    start_time: time
    end_time: time
    is_blocked: bool
    is_booked: bool = False
    note: Optional[str] = None


class BookingIn(BaseModel):
    counselor_id: Optional[int] = None  # null → auto-pick BK pertama di org
    slot_id: Optional[int] = None  # null → walk-in
    booking_date: date
    start_time: time
    end_time: time
    topic: str = Field(min_length=3, max_length=255)
    is_anonymous: bool = False
    student_note: Optional[str] = None


class BookingDecision(BaseModel):
    status: str = Field(pattern="^(approved|rejected|completed|cancelled)$")
    counselor_note: Optional[str] = None


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    student_id: int  # Hidden untuk role siswa lain
    student_name: str  # "Anonim" kalau is_anonymous & viewer bukan BK
    student_class: Optional[str] = None
    counselor_id: int
    counselor_name: Optional[str] = None
    slot_id: Optional[int] = None
    booking_date: date
    start_time: time
    end_time: time
    topic: str
    is_anonymous: bool
    status: str
    student_note: Optional[str] = None
    counselor_note: Optional[str] = None  # Hanya tampil kalau viewer = BK atau owner
    created_at: datetime


# ─── Helpers ────────────────────────────────────────────────────────────────


async def _enrich_slot(
    db: AsyncSession, slot: CounselingSlot
) -> SlotOut:
    counselor = await db.get(User, slot.counselor_id)
    booking = (
        await db.execute(
            select(CounselingBooking).where(
                CounselingBooking.slot_id == slot.id,
                CounselingBooking.status.in_(["pending", "approved"]),
            )
        )
    ).scalar_one_or_none()
    return SlotOut(
        id=slot.id,
        counselor_id=slot.counselor_id,
        counselor_name=counselor.full_name if counselor else None,
        slot_date=slot.slot_date,
        start_time=slot.start_time,
        end_time=slot.end_time,
        is_blocked=slot.is_blocked,
        is_booked=booking is not None,
        note=slot.note,
    )


async def _enrich_booking(
    db: AsyncSession, b: CounselingBooking, viewer: User
) -> BookingOut:
    counselor = await db.get(User, b.counselor_id)
    student = await db.get(User, b.student_id)
    is_bk_or_owner = viewer.id == b.counselor_id or viewer.role in ("super_admin", "hr")
    is_self = viewer.id == b.student_id

    # Privacy logic:
    if b.is_anonymous and not (is_bk_or_owner or is_self):
        student_name = "Anonim"
        student_class = None
    else:
        student_name = student.full_name if student else "?"
        student_class = None
        if student and student.school_class_id:
            from app.models import SchoolClass
            cls = await db.get(SchoolClass, student.school_class_id)
            student_class = cls.name if cls else None

    counselor_note = None
    if is_bk_or_owner or is_self:
        counselor_note = b.counselor_note

    return BookingOut(
        id=b.id,
        student_id=b.student_id if (is_bk_or_owner or is_self) else 0,
        student_name=student_name,
        student_class=student_class,
        counselor_id=b.counselor_id,
        counselor_name=counselor.full_name if counselor else None,
        slot_id=b.slot_id,
        booking_date=b.booking_date,
        start_time=b.start_time,
        end_time=b.end_time,
        topic=b.topic,
        is_anonymous=b.is_anonymous,
        status=b.status,
        student_note=b.student_note,
        counselor_note=counselor_note,
        created_at=b.created_at,
    )


async def _resolve_counselor(
    db: AsyncSession, current: User, requested_id: Optional[int]
) -> int:
    """Resolve counselor_id. Default: BK pertama di org."""
    if requested_id:
        u = await db.get(User, requested_id)
        if not u or u.org_id != current.org_id:
            raise HTTPException(404, "Konselor tidak ditemukan")
        if u.role != "hr":
            raise HTTPException(400, "User bukan BK")
        return requested_id
    # Auto: BK pertama
    bk = (
        await db.execute(
            select(User).where(
                User.org_id == current.org_id,
                User.role == "hr",
                User.status == "active",
            ).limit(1)
        )
    ).scalar_one_or_none()
    if not bk:
        raise HTTPException(404, "Belum ada BK di sekolah")
    return bk.id


# ─── Slot endpoints ─────────────────────────────────────────────────────────


@router.get("/slots", response_model=Envelope[list[SlotOut]])
async def list_slots(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    counselor_id: Optional[int] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    available_only: bool = False,
):
    stmt = select(CounselingSlot)
    # Scope: siswa lihat semua BK di org
    bk_ids_in_org = (
        await db.execute(
            select(User.id).where(User.org_id == current.org_id, User.role == "hr")
        )
    ).scalars().all()
    if not bk_ids_in_org:
        return Envelope(data=[])
    stmt = stmt.where(CounselingSlot.counselor_id.in_(bk_ids_in_org))

    if counselor_id:
        stmt = stmt.where(CounselingSlot.counselor_id == counselor_id)
    if from_date:
        stmt = stmt.where(CounselingSlot.slot_date >= from_date)
    else:
        stmt = stmt.where(CounselingSlot.slot_date >= date.today())
    if to_date:
        stmt = stmt.where(CounselingSlot.slot_date <= to_date)

    rows = (
        await db.execute(
            stmt.order_by(CounselingSlot.slot_date, CounselingSlot.start_time)
        )
    ).scalars().all()

    out = [await _enrich_slot(db, s) for s in rows]
    if available_only:
        out = [s for s in out if not s.is_blocked and not s.is_booked]
    return Envelope(data=out)


@router.post("/slots", response_model=Envelope[SlotOut], status_code=201)
async def create_slot(
    payload: SlotIn,
    current: Annotated[User, Depends(require_roles("hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if payload.start_time >= payload.end_time:
        raise HTTPException(422, "Jam mulai harus < jam selesai")
    counselor_id = current.id if current.role == "hr" else (
        await _resolve_counselor(db, current, None)
    )
    slot = CounselingSlot(
        counselor_id=counselor_id,
        slot_date=payload.slot_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        is_blocked=payload.is_blocked,
        note=payload.note,
    )
    db.add(slot)
    await db.commit()
    await db.refresh(slot)
    return Envelope(data=await _enrich_slot(db, slot))


@router.post("/slots/bulk", response_model=Envelope[dict])
async def bulk_generate_slots(
    payload: BulkSlotIn,
    current: Annotated[User, Depends(require_roles("hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Bulk generate slot. BK biasanya buka jam 9-15 setiap 30 menit, weekday only."""
    if payload.start_hour >= payload.end_hour:
        raise HTTPException(422, "start_hour harus < end_hour")
    counselor_id = current.id if current.role == "hr" else (
        await _resolve_counselor(db, current, None)
    )

    today = date.today()
    created = 0
    skipped = 0
    for day_offset in range(payload.days):
        d = today + timedelta(days=day_offset)
        if payload.skip_weekends and d.weekday() >= 5:
            continue
        # Generate slot per duration
        cur_minutes = payload.start_hour * 60
        end_minutes = payload.end_hour * 60
        while cur_minutes + payload.duration_minutes <= end_minutes:
            sh, sm = divmod(cur_minutes, 60)
            eh, em = divmod(cur_minutes + payload.duration_minutes, 60)
            st = time(sh, sm)
            et = time(eh, em)

            # Cek duplicate
            existing = (
                await db.execute(
                    select(CounselingSlot).where(
                        CounselingSlot.counselor_id == counselor_id,
                        CounselingSlot.slot_date == d,
                        CounselingSlot.start_time == st,
                    )
                )
            ).scalar_one_or_none()
            if existing:
                skipped += 1
            else:
                db.add(CounselingSlot(
                    counselor_id=counselor_id,
                    slot_date=d,
                    start_time=st,
                    end_time=et,
                ))
                created += 1
            cur_minutes += payload.duration_minutes

    await db.commit()
    return Envelope(data={"created": created, "skipped": skipped})


@router.delete("/slots/{slot_id}", response_model=Envelope[dict])
async def delete_slot(
    slot_id: int,
    current: Annotated[User, Depends(require_roles("hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    slot = await db.get(CounselingSlot, slot_id)
    if not slot:
        raise HTTPException(404, "Slot tidak ditemukan")
    counselor = await db.get(User, slot.counselor_id)
    if not counselor or counselor.org_id != current.org_id:
        raise HTTPException(404, "Slot tidak ditemukan")
    if current.role == "hr" and slot.counselor_id != current.id:
        raise HTTPException(403, "Hanya pemilik slot yang bisa hapus")

    # Reject existing bookings
    bookings = (
        await db.execute(
            select(CounselingBooking).where(
                CounselingBooking.slot_id == slot_id,
                CounselingBooking.status.in_(["pending", "approved"]),
            )
        )
    ).scalars().all()
    for b in bookings:
        b.status = "cancelled"

    await db.delete(slot)
    await db.commit()
    return Envelope(data={"ok": True})


# ─── Booking endpoints ──────────────────────────────────────────────────────


@router.post("/bookings", response_model=Envelope[BookingOut], status_code=201)
async def create_booking(
    payload: BookingIn,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    counselor_id = await _resolve_counselor(db, current, payload.counselor_id)

    if payload.slot_id:
        slot = await db.get(CounselingSlot, payload.slot_id)
        if not slot:
            raise HTTPException(404, "Slot tidak ditemukan")
        if slot.is_blocked:
            raise HTTPException(400, "Slot di-blok")
        # Cek belum dipakai
        booked = (
            await db.execute(
                select(CounselingBooking).where(
                    CounselingBooking.slot_id == payload.slot_id,
                    CounselingBooking.status.in_(["pending", "approved"]),
                )
            )
        ).scalar_one_or_none()
        if booked:
            raise HTTPException(409, "Slot sudah dibooking")
        counselor_id = slot.counselor_id
        booking_date = slot.slot_date
        start_time = slot.start_time
        end_time = slot.end_time
    else:
        booking_date = payload.booking_date
        start_time = payload.start_time
        end_time = payload.end_time

    if start_time >= end_time:
        raise HTTPException(422, "Jam mulai harus < jam selesai")

    b = CounselingBooking(
        student_id=current.id,
        counselor_id=counselor_id,
        slot_id=payload.slot_id,
        booking_date=booking_date,
        start_time=start_time,
        end_time=end_time,
        topic=payload.topic,
        is_anonymous=payload.is_anonymous,
        student_note=payload.student_note,
        status="pending",
    )
    db.add(b)
    await db.commit()
    await db.refresh(b)

    # Notif ke BK
    try:
        from app.services.notification_service import notify_user
        await notify_user(
            db, counselor_id,
            title="Booking Konsultasi Baru",
            body=f"Topik: {payload.topic}",
            url="/counseling",
            category="counseling",
        )
    except Exception:
        pass

    return Envelope(data=await _enrich_booking(db, b, current))


@router.get("/bookings", response_model=Envelope[list[BookingOut]])
async def list_bookings(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: Optional[str] = None,
    upcoming_only: bool = False,
):
    stmt = select(CounselingBooking)
    if current.role == "employee":
        stmt = stmt.where(CounselingBooking.student_id == current.id)
    elif current.role == "hr":
        stmt = stmt.where(CounselingBooking.counselor_id == current.id)
    else:
        # super_admin/admin: all in org
        bk_ids = (
            await db.execute(
                select(User.id).where(User.org_id == current.org_id, User.role == "hr")
            )
        ).scalars().all()
        if bk_ids:
            stmt = stmt.where(CounselingBooking.counselor_id.in_(bk_ids))

    if status:
        stmt = stmt.where(CounselingBooking.status == status)
    if upcoming_only:
        stmt = stmt.where(CounselingBooking.booking_date >= date.today())

    rows = (
        await db.execute(
            stmt.order_by(CounselingBooking.booking_date.desc(), CounselingBooking.start_time)
        )
    ).scalars().all()
    return Envelope(data=[await _enrich_booking(db, b, current) for b in rows])


@router.patch("/bookings/{booking_id}", response_model=Envelope[BookingOut])
async def decide_booking(
    booking_id: int,
    payload: BookingDecision,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    b = await db.get(CounselingBooking, booking_id)
    if not b:
        raise HTTPException(404, "Booking tidak ditemukan")

    is_owner_bk = current.role == "hr" and b.counselor_id == current.id
    is_admin = current.role in ("super_admin",)
    is_student_self = current.role == "employee" and b.student_id == current.id

    # Siswa: hanya boleh cancel
    if is_student_self:
        if payload.status != "cancelled":
            raise HTTPException(403, "Siswa hanya bisa cancel")
        if b.status not in ("pending", "approved"):
            raise HTTPException(400, "Booking sudah final")
    elif not (is_owner_bk or is_admin):
        raise HTTPException(403, "Tidak ada akses")

    b.status = payload.status
    if payload.counselor_note is not None and (is_owner_bk or is_admin):
        b.counselor_note = payload.counselor_note

    await db.commit()
    await db.refresh(b)

    # Notif ke siswa kalau status berubah selain cancel-by-self
    if not is_student_self:
        try:
            from app.services.notification_service import notify_user
            status_label = {
                "approved": "disetujui",
                "rejected": "ditolak",
                "completed": "selesai",
                "cancelled": "dibatalkan",
            }.get(payload.status, payload.status)
            await notify_user(
                db, b.student_id,
                title=f"Booking BK {status_label}",
                body=f"Topik: {b.topic}",
                url="/counseling",
                category="counseling",
            )
        except Exception:
            pass

    return Envelope(data=await _enrich_booking(db, b, current))


@router.get("/stats", response_model=Envelope[dict])
async def stats(
    current: Annotated[User, Depends(require_roles("hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Statistik untuk dashboard BK."""
    bk_ids = (
        await db.execute(
            select(User.id).where(User.org_id == current.org_id, User.role == "hr")
        )
    ).scalars().all()
    if not bk_ids:
        return Envelope(data={"pending": 0, "today": 0, "this_week": 0, "completed_total": 0})

    today = date.today()
    week_end = today + timedelta(days=7)

    pending = (
        await db.execute(
            select(func.count(CounselingBooking.id)).where(
                CounselingBooking.counselor_id.in_(bk_ids),
                CounselingBooking.status == "pending",
            )
        )
    ).scalar_one()
    today_n = (
        await db.execute(
            select(func.count(CounselingBooking.id)).where(
                CounselingBooking.counselor_id.in_(bk_ids),
                CounselingBooking.booking_date == today,
                CounselingBooking.status == "approved",
            )
        )
    ).scalar_one()
    week = (
        await db.execute(
            select(func.count(CounselingBooking.id)).where(
                CounselingBooking.counselor_id.in_(bk_ids),
                CounselingBooking.booking_date.between(today, week_end),
                CounselingBooking.status == "approved",
            )
        )
    ).scalar_one()
    completed = (
        await db.execute(
            select(func.count(CounselingBooking.id)).where(
                CounselingBooking.counselor_id.in_(bk_ids),
                CounselingBooking.status == "completed",
            )
        )
    ).scalar_one()

    return Envelope(data={
        "pending": pending,
        "today": today_n,
        "this_week": week,
        "completed_total": completed,
    })
