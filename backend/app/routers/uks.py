"""UKS / Klinik Sekolah — catat kunjungan siswa + stok obat."""
from __future__ import annotations

from datetime import date, datetime, time
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    SchoolClass, UksMedicine, UksVisit, User,
)
from app.schemas import Envelope
from app.security import get_current_user, require_roles


router = APIRouter(prefix="/uks", tags=["UKS"])


# ─── Schemas ────────────────────────────────────────────────────────────────


class VisitIn(BaseModel):
    student_id: int
    visit_date: date
    arrival_time: time
    departure_time: Optional[time] = None
    complaint: str = Field(min_length=3)
    diagnosis: Optional[str] = None
    treatment: Optional[str] = None
    medicines_json: Optional[list[dict]] = None
    body_temp: Optional[float] = Field(default=None, ge=30, le=45)
    blood_pressure: Optional[str] = Field(default=None, max_length=20)
    outcome: str = Field(default="kembali_kelas")
    notify_parent: bool = False
    notes: Optional[str] = None


class VisitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    student_id: int
    student_name: str
    student_class: Optional[str]
    visit_date: date
    arrival_time: time
    departure_time: Optional[time]
    complaint: str
    diagnosis: Optional[str]
    treatment: Optional[str]
    medicines_json: Optional[list]
    body_temp: Optional[float]
    blood_pressure: Optional[str]
    outcome: str
    notify_parent: bool
    handled_by: int
    handled_by_name: Optional[str]
    notes: Optional[str]
    created_at: datetime


class MedicineIn(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=255)
    category: Optional[str] = None
    unit: str = Field(default="butir", max_length=20)
    stock: int = Field(default=0, ge=0)
    low_stock_threshold: int = Field(default=10, ge=0, le=999)
    expire_date: Optional[date] = None
    notes: Optional[str] = None


class MedicineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    category: Optional[str]
    unit: str
    stock: int
    low_stock_threshold: int
    expire_date: Optional[date]
    is_low_stock: bool = False
    is_expiring_soon: bool = False
    notes: Optional[str]


class StockAdjust(BaseModel):
    delta: int = Field(description="Positif = tambah, negatif = kurang")
    reason: Optional[str] = None


class StatsOut(BaseModel):
    visits_today: int
    visits_this_week: int
    visits_this_month: int
    low_stock_count: int
    expiring_soon_count: int
    top_complaints: list[dict]


# ─── Helpers ────────────────────────────────────────────────────────────────


async def _enrich_visit(db: AsyncSession, v: UksVisit) -> VisitOut:
    student = await db.get(User, v.student_id)
    handler = await db.get(User, v.handled_by) if v.handled_by else None
    cls_name = None
    if student and student.school_class_id:
        cls = await db.get(SchoolClass, student.school_class_id)
        cls_name = cls.name if cls else None
    return VisitOut(
        id=v.id,
        student_id=v.student_id,
        student_name=student.full_name if student else "?",
        student_class=cls_name,
        visit_date=v.visit_date,
        arrival_time=v.arrival_time,
        departure_time=v.departure_time,
        complaint=v.complaint,
        diagnosis=v.diagnosis,
        treatment=v.treatment,
        medicines_json=v.medicines_json if isinstance(v.medicines_json, list) else None,
        body_temp=v.body_temp,
        blood_pressure=v.blood_pressure,
        outcome=v.outcome,
        notify_parent=v.notify_parent,
        handled_by=v.handled_by,
        handled_by_name=handler.full_name if handler else None,
        notes=v.notes,
        created_at=v.created_at,
    )


def _enrich_medicine(m: UksMedicine) -> MedicineOut:
    today = date.today()
    is_low = m.stock <= m.low_stock_threshold
    is_exp = m.expire_date and (m.expire_date - today).days <= 30
    return MedicineOut(
        id=m.id, code=m.code, name=m.name, category=m.category,
        unit=m.unit, stock=m.stock,
        low_stock_threshold=m.low_stock_threshold,
        expire_date=m.expire_date,
        is_low_stock=is_low,
        is_expiring_soon=bool(is_exp),
        notes=m.notes,
    )


# ─── Visit endpoints ────────────────────────────────────────────────────────


@router.post("/visits", response_model=Envelope[VisitOut], status_code=201)
async def create_visit(
    payload: VisitIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    student = await db.get(User, payload.student_id)
    if not student or student.org_id != current.org_id:
        raise HTTPException(404, "Siswa tidak ditemukan")

    visit = UksVisit(
        org_id=current.org_id,
        handled_by=current.id,
        **payload.model_dump(),
    )
    db.add(visit)
    await db.commit()
    await db.refresh(visit)

    # Notif ortu kalau diset
    if payload.notify_parent:
        try:
            from sqlalchemy.orm import selectinload
            from app.models import ParentAccount, ParentLink
            # Cari ortu siswa
            parents = (
                await db.execute(
                    select(ParentAccount)
                    .join(ParentLink, ParentLink.parent_id == ParentAccount.id)
                    .where(ParentLink.student_id == student.id)
                )
            ).scalars().all()
            # Push WA gateway / direct notif via _whatsapp service kalau ada
            # Untuk sekarang skip, fokus ke audit trail
        except Exception:
            pass

    # Auto-decrement medicine stock
    if isinstance(payload.medicines_json, list):
        for entry in payload.medicines_json:
            try:
                code = entry.get("code") or entry.get("name")
                qty = int(entry.get("qty", 0))
                if not code or qty <= 0:
                    continue
                med = (
                    await db.execute(
                        select(UksMedicine).where(
                            UksMedicine.org_id == current.org_id,
                            or_(UksMedicine.code == code, UksMedicine.name == code),
                        )
                    )
                ).scalar_one_or_none()
                if med and med.stock >= qty:
                    med.stock -= qty
            except Exception:
                continue
        await db.commit()

    return Envelope(data=await _enrich_visit(db, visit))


@router.get("/visits", response_model=Envelope[list[VisitOut]])
async def list_visits(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    student_id: Optional[int] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    limit: int = 100,
):
    stmt = select(UksVisit).where(UksVisit.org_id == current.org_id)
    if student_id:
        stmt = stmt.where(UksVisit.student_id == student_id)
    if current.role == "employee":
        # Siswa hanya lihat catatan kunjungan sendiri
        stmt = stmt.where(UksVisit.student_id == current.id)
    if from_date:
        stmt = stmt.where(UksVisit.visit_date >= from_date)
    if to_date:
        stmt = stmt.where(UksVisit.visit_date <= to_date)

    rows = (
        await db.execute(stmt.order_by(desc(UksVisit.visit_date), desc(UksVisit.arrival_time)).limit(limit))
    ).scalars().all()
    return Envelope(data=[await _enrich_visit(db, r) for r in rows])


@router.put("/visits/{vid}", response_model=Envelope[VisitOut])
async def update_visit(
    vid: int,
    payload: VisitIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    v = await db.get(UksVisit, vid)
    if not v or v.org_id != current.org_id:
        raise HTTPException(404, "Visit tidak ditemukan")
    for k, val in payload.model_dump().items():
        setattr(v, k, val)
    await db.commit()
    await db.refresh(v)
    return Envelope(data=await _enrich_visit(db, v))


@router.delete("/visits/{vid}", response_model=Envelope[dict])
async def delete_visit(
    vid: int,
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    v = await db.get(UksVisit, vid)
    if not v or v.org_id != current.org_id:
        raise HTTPException(404, "Visit tidak ditemukan")
    await db.delete(v)
    await db.commit()
    return Envelope(data={"ok": True})


# ─── Medicine endpoints ─────────────────────────────────────────────────────


@router.get("/medicines", response_model=Envelope[list[MedicineOut]])
async def list_medicines(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Optional[str] = None,
    low_stock_only: bool = False,
):
    stmt = select(UksMedicine).where(UksMedicine.org_id == current.org_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(
            UksMedicine.name.ilike(like),
            UksMedicine.code.ilike(like),
            UksMedicine.category.ilike(like),
        ))
    rows = (await db.execute(stmt.order_by(UksMedicine.name))).scalars().all()
    out = [_enrich_medicine(m) for m in rows]
    if low_stock_only:
        out = [m for m in out if m.is_low_stock]
    return Envelope(data=out)


@router.post("/medicines", response_model=Envelope[MedicineOut], status_code=201)
async def create_medicine(
    payload: MedicineIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    existing = (
        await db.execute(
            select(UksMedicine).where(
                UksMedicine.org_id == current.org_id,
                UksMedicine.code == payload.code,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Kode obat sudah dipakai")
    m = UksMedicine(org_id=current.org_id, **payload.model_dump())
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return Envelope(data=_enrich_medicine(m))


@router.put("/medicines/{mid}", response_model=Envelope[MedicineOut])
async def update_medicine(
    mid: int,
    payload: MedicineIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    m = await db.get(UksMedicine, mid)
    if not m or m.org_id != current.org_id:
        raise HTTPException(404, "Obat tidak ditemukan")
    for k, v in payload.model_dump().items():
        setattr(m, k, v)
    await db.commit()
    await db.refresh(m)
    return Envelope(data=_enrich_medicine(m))


@router.post("/medicines/{mid}/adjust-stock", response_model=Envelope[MedicineOut])
async def adjust_stock(
    mid: int,
    payload: StockAdjust,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    m = await db.get(UksMedicine, mid)
    if not m or m.org_id != current.org_id:
        raise HTTPException(404, "Obat tidak ditemukan")
    new_stock = m.stock + payload.delta
    if new_stock < 0:
        raise HTTPException(400, f"Stok tidak cukup (sekarang {m.stock})")
    m.stock = new_stock
    await db.commit()
    await db.refresh(m)
    return Envelope(data=_enrich_medicine(m))


@router.delete("/medicines/{mid}", response_model=Envelope[dict])
async def delete_medicine(
    mid: int,
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    m = await db.get(UksMedicine, mid)
    if not m or m.org_id != current.org_id:
        raise HTTPException(404, "Obat tidak ditemukan")
    await db.delete(m)
    await db.commit()
    return Envelope(data={"ok": True})


# ─── Stats ──────────────────────────────────────────────────────────────────


@router.get("/stats", response_model=Envelope[StatsOut])
async def stats(
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    today = date.today()
    week_start = today - __import__("datetime").timedelta(days=7)
    month_start = today.replace(day=1)

    visits_today = (
        await db.execute(
            select(func.count(UksVisit.id)).where(
                UksVisit.org_id == current.org_id,
                UksVisit.visit_date == today,
            )
        )
    ).scalar_one()
    visits_week = (
        await db.execute(
            select(func.count(UksVisit.id)).where(
                UksVisit.org_id == current.org_id,
                UksVisit.visit_date >= week_start,
            )
        )
    ).scalar_one()
    visits_month = (
        await db.execute(
            select(func.count(UksVisit.id)).where(
                UksVisit.org_id == current.org_id,
                UksVisit.visit_date >= month_start,
            )
        )
    ).scalar_one()

    meds = (
        await db.execute(
            select(UksMedicine).where(UksMedicine.org_id == current.org_id)
        )
    ).scalars().all()
    low = [m for m in meds if m.stock <= m.low_stock_threshold]
    expiring = [
        m for m in meds
        if m.expire_date and (m.expire_date - today).days <= 30
    ]

    # Top complaints (basic: group by exact text 30 hari)
    complaint_rows = (
        await db.execute(
            select(UksVisit.complaint, func.count(UksVisit.id))
            .where(
                UksVisit.org_id == current.org_id,
                UksVisit.visit_date >= month_start,
            )
            .group_by(UksVisit.complaint)
            .order_by(func.count(UksVisit.id).desc())
            .limit(5)
        )
    ).all()
    top_complaints = [
        {"complaint": r[0][:100], "count": r[1]} for r in complaint_rows
    ]

    return Envelope(data=StatsOut(
        visits_today=visits_today,
        visits_this_week=visits_week,
        visits_this_month=visits_month,
        low_stock_count=len(low),
        expiring_soon_count=len(expiring),
        top_complaints=top_complaints,
    ))
