"""Inventaris sekolah — daftar aset + audit trail kondisi."""
from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import InventoryItem, InventoryLog, User
from app.schemas import Envelope
from app.security import get_current_user, require_roles


router = APIRouter(prefix="/inventory", tags=["Inventaris"])


VALID_CONDITIONS = ("baik", "rusak_ringan", "rusak_berat", "hilang", "dijual")


# ─── Schemas ────────────────────────────────────────────────────────────────


class ItemIn(BaseModel):
    asset_code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=255)
    category: Optional[str] = None
    location: Optional[str] = None
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = None
    quantity: int = Field(default=1, ge=1)
    condition: str = Field(default="baik")
    description: Optional[str] = None
    photo_url: Optional[str] = None
    responsible_user_id: Optional[int] = None


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    asset_code: str
    name: str
    category: Optional[str]
    location: Optional[str]
    purchase_date: Optional[date]
    purchase_price: Optional[float]
    quantity: int
    condition: str
    description: Optional[str]
    photo_url: Optional[str]
    responsible_user_id: Optional[int]
    responsible_name: Optional[str]
    last_audit_at: Optional[datetime]
    created_at: datetime


class ConditionUpdate(BaseModel):
    condition: str
    note: Optional[str] = None


class StatsOut(BaseModel):
    total_items: int
    total_quantity: int
    total_value: float
    by_condition: dict[str, int]
    by_category: list[dict]


# ─── Helpers ────────────────────────────────────────────────────────────────


async def _enrich(db: AsyncSession, i: InventoryItem) -> ItemOut:
    user = await db.get(User, i.responsible_user_id) if i.responsible_user_id else None
    return ItemOut(
        id=i.id,
        asset_code=i.asset_code,
        name=i.name,
        category=i.category,
        location=i.location,
        purchase_date=i.purchase_date,
        purchase_price=i.purchase_price,
        quantity=i.quantity,
        condition=i.condition,
        description=i.description,
        photo_url=i.photo_url,
        responsible_user_id=i.responsible_user_id,
        responsible_name=user.full_name if user else None,
        last_audit_at=i.last_audit_at,
        created_at=i.created_at,
    )


# ─── Endpoints ──────────────────────────────────────────────────────────────


@router.get("", response_model=Envelope[list[ItemOut]])
async def list_items(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Optional[str] = None,
    category: Optional[str] = None,
    condition: Optional[str] = None,
    location: Optional[str] = None,
):
    stmt = select(InventoryItem).where(InventoryItem.org_id == current.org_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(
            InventoryItem.asset_code.ilike(like),
            InventoryItem.name.ilike(like),
            InventoryItem.location.ilike(like),
        ))
    if category:
        stmt = stmt.where(InventoryItem.category == category)
    if condition:
        stmt = stmt.where(InventoryItem.condition == condition)
    if location:
        stmt = stmt.where(InventoryItem.location.ilike(f"%{location}%"))

    rows = (
        await db.execute(stmt.order_by(InventoryItem.asset_code))
    ).scalars().all()
    return Envelope(data=[await _enrich(db, r) for r in rows])


@router.post("", response_model=Envelope[ItemOut], status_code=201)
async def create_item(
    payload: ItemIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if payload.condition not in VALID_CONDITIONS:
        raise HTTPException(422, "Kondisi tidak valid")
    existing = (
        await db.execute(
            select(InventoryItem).where(
                InventoryItem.org_id == current.org_id,
                InventoryItem.asset_code == payload.asset_code,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Kode aset sudah dipakai")

    item = InventoryItem(org_id=current.org_id, **payload.model_dump())
    db.add(item)
    await db.flush()
    db.add(InventoryLog(
        item_id=item.id,
        action="create",
        note=f"Aset baru: {item.name}",
        actor_id=current.id,
    ))
    await db.commit()
    await db.refresh(item)
    return Envelope(data=await _enrich(db, item))


@router.put("/{iid}", response_model=Envelope[ItemOut])
async def update_item(
    iid: int,
    payload: ItemIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    item = await db.get(InventoryItem, iid)
    if not item or item.org_id != current.org_id:
        raise HTTPException(404, "Aset tidak ditemukan")
    if payload.condition not in VALID_CONDITIONS:
        raise HTTPException(422, "Kondisi tidak valid")

    old_condition = item.condition
    old_location = item.location

    for k, v in payload.model_dump().items():
        setattr(item, k, v)

    if old_condition != payload.condition:
        db.add(InventoryLog(
            item_id=item.id,
            action="condition_change",
            note=f"{old_condition} → {payload.condition}",
            actor_id=current.id,
        ))
    if old_location != payload.location:
        db.add(InventoryLog(
            item_id=item.id,
            action="move",
            note=f"{old_location or '-'} → {payload.location or '-'}",
            actor_id=current.id,
        ))
    await db.commit()
    await db.refresh(item)
    return Envelope(data=await _enrich(db, item))


@router.patch("/{iid}/condition", response_model=Envelope[ItemOut])
async def update_condition(
    iid: int,
    payload: ConditionUpdate,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if payload.condition not in VALID_CONDITIONS:
        raise HTTPException(422, "Kondisi tidak valid")
    item = await db.get(InventoryItem, iid)
    if not item or item.org_id != current.org_id:
        raise HTTPException(404, "Aset tidak ditemukan")
    if item.condition == payload.condition:
        return Envelope(data=await _enrich(db, item), message="Tidak ada perubahan")

    old = item.condition
    item.condition = payload.condition
    db.add(InventoryLog(
        item_id=item.id,
        action="condition_change",
        note=f"{old} → {payload.condition}" + (f" • {payload.note}" if payload.note else ""),
        actor_id=current.id,
    ))
    await db.commit()
    await db.refresh(item)
    return Envelope(data=await _enrich(db, item))


@router.post("/{iid}/audit", response_model=Envelope[ItemOut])
async def stocktake_audit(
    iid: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Tandai aset sudah di-stocktake (last_audit_at = now)."""
    item = await db.get(InventoryItem, iid)
    if not item or item.org_id != current.org_id:
        raise HTTPException(404, "Aset tidak ditemukan")
    item.last_audit_at = datetime.utcnow()
    db.add(InventoryLog(
        item_id=item.id,
        action="audit",
        note=f"Stocktake confirmed",
        actor_id=current.id,
    ))
    await db.commit()
    await db.refresh(item)
    return Envelope(data=await _enrich(db, item))


@router.delete("/{iid}", response_model=Envelope[dict])
async def delete_item(
    iid: int,
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    item = await db.get(InventoryItem, iid)
    if not item or item.org_id != current.org_id:
        raise HTTPException(404, "Aset tidak ditemukan")
    await db.delete(item)
    await db.commit()
    return Envelope(data={"ok": True})


@router.get("/{iid}/logs", response_model=Envelope[list[dict]])
async def item_logs(
    iid: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 50,
):
    item = await db.get(InventoryItem, iid)
    if not item or item.org_id != current.org_id:
        raise HTTPException(404, "Aset tidak ditemukan")
    logs = (
        await db.execute(
            select(InventoryLog)
            .where(InventoryLog.item_id == iid)
            .order_by(desc(InventoryLog.created_at))
            .limit(limit)
        )
    ).scalars().all()
    out = []
    for l in logs:
        actor = await db.get(User, l.actor_id)
        out.append({
            "id": l.id,
            "action": l.action,
            "note": l.note,
            "actor_name": actor.full_name if actor else None,
            "created_at": l.created_at.isoformat(),
        })
    return Envelope(data=out)


@router.get("/stats", response_model=Envelope[StatsOut])
async def stats(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (
        await db.execute(
            select(InventoryItem).where(InventoryItem.org_id == current.org_id)
        )
    ).scalars().all()

    total_items = len(rows)
    total_qty = sum(r.quantity for r in rows)
    total_value = sum((r.purchase_price or 0) * r.quantity for r in rows)

    by_condition: dict[str, int] = {}
    by_category: dict[str, int] = {}
    for r in rows:
        by_condition[r.condition] = by_condition.get(r.condition, 0) + r.quantity
        cat = r.category or "Lainnya"
        by_category[cat] = by_category.get(cat, 0) + r.quantity

    return Envelope(data=StatsOut(
        total_items=total_items,
        total_quantity=total_qty,
        total_value=total_value,
        by_condition=by_condition,
        by_category=[{"category": k, "count": v} for k, v in sorted(by_category.items(), key=lambda x: -x[1])],
    ))
