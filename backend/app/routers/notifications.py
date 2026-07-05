"""Notifications endpoints — Web Push subscription, history, broadcast.

GET    /v1/notifications/vapid-public-key   public key untuk frontend
POST   /v1/notifications/subscribe          register browser/device
DELETE /v1/notifications/subscribe          unsubscribe (by endpoint)
GET    /v1/notifications                    history user (paginated)
GET    /v1/notifications/unread-count       cepat untuk badge bell
POST   /v1/notifications/{id}/read          mark satu sebagai dibaca
POST   /v1/notifications/read-all           mark semua sebagai dibaca
DELETE /v1/notifications/{id}               hapus dari history
POST   /v1/notifications/broadcast          [super_admin] broadcast org
POST   /v1/notifications/test               [super_admin] kirim test ke diri sendiri
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import AppNotification, PushSubscription, SchoolClass, User
from app.schemas import Envelope, Meta
from app.security import get_current_user, require_roles
from app.services.notification_service import (
    broadcast_org,
    notify_user,
)


router = APIRouter(prefix="/notifications", tags=["Notifications"])


# ─── Schemas (lokal) ─────────────────────────────────────────────────────────


class SubscribeKeys(BaseModel):
    p256dh: str
    auth: str


class SubscribeIn(BaseModel):
    endpoint: str = Field(..., max_length=500)
    keys: SubscribeKeys
    user_agent: Optional[str] = Field(default=None, max_length=255)


class UnsubscribeIn(BaseModel):
    endpoint: str = Field(..., max_length=500)


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    category: str
    title: str
    body: Optional[str] = None
    url: Optional[str] = None
    icon: Optional[str] = None
    is_read: bool
    delivered_push: bool
    created_at: datetime
    read_at: Optional[datetime] = None


class BroadcastIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=1000)
    target: str = Field(default="all")  # all | role | class
    target_role: Optional[str] = None   # super_admin/admin/hr/employee
    target_class_id: Optional[int] = None
    url: Optional[str] = Field(default=None, max_length=255)


# ─── Public key ──────────────────────────────────────────────────────────────


@router.get("/vapid-public-key", response_model=Envelope[dict])
async def vapid_public_key():
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(503, "VAPID belum dikonfigurasi di server")
    return {"success": True, "data": {"key": settings.VAPID_PUBLIC_KEY}}


# ─── Subscribe / Unsubscribe ────────────────────────────────────────────────


@router.post("/subscribe", response_model=Envelope[dict])
async def subscribe(
    payload: SubscribeIn,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Register endpoint Web Push untuk device ini.

    Idempotent: kalau endpoint sudah ada, update keys + user_id.
    """
    existing = (
        await db.execute(
            select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint)
        )
    ).scalar_one_or_none()

    if existing:
        existing.user_id = current.id
        existing.p256dh = payload.keys.p256dh
        existing.auth = payload.keys.auth
        existing.user_agent = (payload.user_agent or "")[:255] or existing.user_agent
        existing.last_used_at = datetime.utcnow()
    else:
        sub = PushSubscription(
            user_id=current.id,
            endpoint=payload.endpoint,
            p256dh=payload.keys.p256dh,
            auth=payload.keys.auth,
            user_agent=(payload.user_agent or "")[:255] or None,
        )
        db.add(sub)

    await db.commit()
    return {"success": True, "data": {"ok": True}}


@router.delete("/subscribe", response_model=Envelope[dict])
async def unsubscribe(
    payload: UnsubscribeIn,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == payload.endpoint,
            PushSubscription.user_id == current.id,
        )
    )
    await db.commit()
    return {"success": True, "data": {"ok": True}}


# ─── History ────────────────────────────────────────────────────────────────


@router.get("", response_model=Envelope[list[NotificationOut]])
async def list_notifications(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
    category: Optional[str] = None,
    only_unread: bool = False,
):
    q = select(AppNotification).where(AppNotification.user_id == current.id)
    if category:
        q = q.where(AppNotification.category == category)
    if only_unread:
        q = q.where(AppNotification.is_read.is_(False))

    total = (
        await db.execute(select(func.count()).select_from(q.subquery()))
    ).scalar_one()

    rows = (
        await db.execute(
            q.order_by(AppNotification.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
    ).scalars().all()

    return {
        "success": True,
        "data": [NotificationOut.model_validate(r) for r in rows],
        "meta": Meta(page=page, per_page=per_page, total=total),
    }


@router.get("/unread-count", response_model=Envelope[dict])
async def unread_count(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    total = (
        await db.execute(
            select(func.count()).where(
                AppNotification.user_id == current.id,
                AppNotification.is_read.is_(False),
            )
        )
    ).scalar_one()
    return {"success": True, "data": {"unread": int(total)}}


@router.post("/{notif_id}/read", response_model=Envelope[dict])
async def mark_read(
    notif_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    n = await db.get(AppNotification, notif_id)
    if not n or n.user_id != current.id:
        raise HTTPException(404, "Notifikasi tidak ditemukan")
    if not n.is_read:
        # Pakai func.now() agar timezone selalu sama dengan created_at (server MySQL).
        await db.execute(
            update(AppNotification)
            .where(AppNotification.id == n.id)
            .values(is_read=True, read_at=func.now())
        )
        await db.commit()
    return {"success": True, "data": {"ok": True}}


@router.post("/read-all", response_model=Envelope[dict])
async def mark_all_read(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await db.execute(
        update(AppNotification)
        .where(
            AppNotification.user_id == current.id,
            AppNotification.is_read.is_(False),
        )
        .values(is_read=True, read_at=func.now())
    )
    await db.commit()
    return {"success": True, "data": {"ok": True}}


@router.delete("/{notif_id}", response_model=Envelope[dict])
async def delete_notif(
    notif_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    n = await db.get(AppNotification, notif_id)
    if not n or n.user_id != current.id:
        raise HTTPException(404, "Notifikasi tidak ditemukan")
    await db.delete(n)
    await db.commit()
    return {"success": True, "data": {"ok": True}}


# ─── Broadcast (kepsek) ─────────────────────────────────────────────────────


@router.post("/broadcast", response_model=Envelope[dict])
async def broadcast(
    payload: BroadcastIn,
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Hanya kepsek (super_admin). Bisa target semua, role, atau kelas."""
    target_role: Optional[str] = None
    target_class_id: Optional[int] = None

    target = (payload.target or "all").lower()
    if target == "role":
        if payload.target_role not in {"super_admin", "admin", "hr", "employee"}:
            raise HTTPException(422, "target_role tidak valid")
        target_role = payload.target_role
    elif target == "class":
        if not payload.target_class_id:
            raise HTTPException(422, "target_class_id wajib diisi untuk target=class")
        cls = await db.get(SchoolClass, payload.target_class_id)
        if not cls or cls.org_id != current.org_id:
            raise HTTPException(404, "Kelas tidak ditemukan")
        target_class_id = payload.target_class_id
    elif target != "all":
        raise HTTPException(422, "target harus salah satu: all|role|class")

    sent = await broadcast_org(
        db,
        current.org_id,
        title=payload.title,
        body=payload.body,
        category="broadcast",
        url=payload.url or "/notifications",
        target_role=target_role,
        target_class_id=target_class_id,
        exclude_user_id=current.id,
    )
    return {"success": True, "data": {"recipients": sent}}


@router.post("/test", response_model=Envelope[dict])
async def test_notification(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Kirim notifikasi tes ke diri sendiri — buat verifikasi setup."""
    await notify_user(
        db,
        current.id,
        title="Notifikasi Aethera aktif",
        body=f"Halo {current.full_name}, kalau pesan ini muncul di HP/desktop, push sudah berfungsi.",
        category="system",
        url="/notifications",
    )
    return {"success": True, "data": {"ok": True}}
