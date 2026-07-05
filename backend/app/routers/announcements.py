"""Pengumuman (Announcement) — feed persistent untuk warga sekolah."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Announcement, AnnouncementRead, SchoolClass, User
from app.schemas import Envelope
from app.security import get_current_user, require_roles


router = APIRouter(prefix="/announcements", tags=["Pengumuman"])


VALID_AUDIENCES = ("all", "siswa", "guru", "ortu", "kelas")


# ─── Schemas ────────────────────────────────────────────────────────────────


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    body: str = Field(min_length=3)
    audience: str = Field(default="all")
    target_class_id: Optional[int] = None
    pinned: bool = False
    cover_url: Optional[str] = None
    publish_at: Optional[datetime] = None
    expire_at: Optional[datetime] = None


class AnnouncementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    body: str
    audience: str
    target_class_id: Optional[int] = None
    target_class_name: Optional[str] = None
    pinned: bool
    cover_url: Optional[str] = None
    publish_at: Optional[datetime] = None
    expire_at: Optional[datetime] = None
    created_by: int
    created_by_name: Optional[str] = None
    is_read: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None


# ─── Helpers ────────────────────────────────────────────────────────────────


def _audience_filter(stmt, viewer: User):
    """Filter announcement berdasarkan role + scope kelas."""
    role = viewer.role
    conds = [Announcement.audience == "all"]
    if role == "employee":
        conds.append(Announcement.audience == "siswa")
        if viewer.school_class_id:
            conds.append(
                and_(
                    Announcement.audience == "kelas",
                    Announcement.target_class_id == viewer.school_class_id,
                )
            )
    elif role in ("admin", "hr"):
        conds.append(Announcement.audience == "guru")
        if role == "admin" and viewer.homeroom_class_id:
            conds.append(
                and_(
                    Announcement.audience == "kelas",
                    Announcement.target_class_id == viewer.homeroom_class_id,
                )
            )
        elif role == "hr":
            # BK lihat semua kelas
            conds.append(Announcement.audience == "kelas")
    elif role == "super_admin":
        # Kepsek lihat semua
        return stmt
    return stmt.where(or_(*conds))


async def _enrich(
    db: AsyncSession, ann: Announcement, viewer: User
) -> AnnouncementOut:
    creator = await db.get(User, ann.created_by)
    cls_name = None
    if ann.target_class_id:
        cls = await db.get(SchoolClass, ann.target_class_id)
        cls_name = cls.name if cls else None
    is_read = bool(
        (
            await db.execute(
                select(AnnouncementRead).where(
                    AnnouncementRead.announcement_id == ann.id,
                    AnnouncementRead.user_id == viewer.id,
                )
            )
        ).scalar_one_or_none()
    )
    return AnnouncementOut(
        id=ann.id,
        title=ann.title,
        body=ann.body,
        audience=ann.audience,
        target_class_id=ann.target_class_id,
        target_class_name=cls_name,
        pinned=ann.pinned,
        cover_url=ann.cover_url,
        publish_at=ann.publish_at,
        expire_at=ann.expire_at,
        created_by=ann.created_by,
        created_by_name=creator.full_name if creator else None,
        is_read=is_read,
        created_at=ann.created_at,
        updated_at=ann.updated_at,
    )


# ─── Endpoints ──────────────────────────────────────────────────────────────


@router.get("", response_model=Envelope[list[AnnouncementOut]])
async def list_announcements(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    only_unread: bool = False,
    pinned_first: bool = True,
    limit: int = 50,
):
    now = datetime.now()
    stmt = select(Announcement).where(
        Announcement.org_id == current.org_id,
        or_(Announcement.publish_at.is_(None), Announcement.publish_at <= now),
        or_(Announcement.expire_at.is_(None), Announcement.expire_at > now),
    )
    stmt = _audience_filter(stmt, current)

    if pinned_first:
        stmt = stmt.order_by(Announcement.pinned.desc(), Announcement.created_at.desc())
    else:
        stmt = stmt.order_by(Announcement.created_at.desc())

    rows = (await db.execute(stmt.limit(limit))).scalars().all()
    out = [await _enrich(db, r, current) for r in rows]
    if only_unread:
        out = [a for a in out if not a.is_read]
    return Envelope(data=out)


@router.get("/unread-count", response_model=Envelope[dict])
async def unread_count(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Total pengumuman aktif yang belum dibaca user."""
    now = datetime.now()
    stmt = select(Announcement.id).where(
        Announcement.org_id == current.org_id,
        or_(Announcement.publish_at.is_(None), Announcement.publish_at <= now),
        or_(Announcement.expire_at.is_(None), Announcement.expire_at > now),
    )
    stmt = _audience_filter(stmt, current)
    visible_ids = list((await db.execute(stmt)).scalars().all())
    if not visible_ids:
        return Envelope(data={"count": 0})

    read_ids = (
        await db.execute(
            select(AnnouncementRead.announcement_id).where(
                AnnouncementRead.user_id == current.id,
                AnnouncementRead.announcement_id.in_(visible_ids),
            )
        )
    ).scalars().all()
    return Envelope(data={"count": len(visible_ids) - len(read_ids)})


@router.post("/{ann_id}/read", response_model=Envelope[dict])
async def mark_read(
    ann_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ann = await db.get(Announcement, ann_id)
    if not ann or ann.org_id != current.org_id:
        raise HTTPException(404, "Pengumuman tidak ditemukan")
    existing = (
        await db.execute(
            select(AnnouncementRead).where(
                AnnouncementRead.announcement_id == ann_id,
                AnnouncementRead.user_id == current.id,
            )
        )
    ).scalar_one_or_none()
    if not existing:
        db.add(AnnouncementRead(announcement_id=ann_id, user_id=current.id))
        await db.commit()
    return Envelope(data={"ok": True})


@router.post("", response_model=Envelope[AnnouncementOut], status_code=201)
async def create_announcement(
    payload: AnnouncementIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if payload.audience not in VALID_AUDIENCES:
        raise HTTPException(422, "Audience tidak valid")
    if payload.audience == "kelas" and not payload.target_class_id:
        raise HTTPException(422, "Audience 'kelas' butuh target_class_id")
    if payload.target_class_id:
        cls = await db.get(SchoolClass, payload.target_class_id)
        if not cls or cls.org_id != current.org_id:
            raise HTTPException(404, "Kelas tidak ditemukan")
    ann = Announcement(
        org_id=current.org_id,
        created_by=current.id,
        **payload.model_dump(),
    )
    db.add(ann)
    await db.commit()
    await db.refresh(ann)

    # Notif push best-effort ke audience
    try:
        from app.services.notification_service import notify_users
        ustmt = select(User.id).where(User.org_id == current.org_id, User.status == "active")
        if payload.audience == "siswa":
            ustmt = ustmt.where(User.role == "employee")
        elif payload.audience == "guru":
            ustmt = ustmt.where(User.role.in_(["admin", "hr"]))
        elif payload.audience == "kelas" and payload.target_class_id:
            ustmt = ustmt.where(User.school_class_id == payload.target_class_id)
        target_ids = list((await db.execute(ustmt)).scalars().all())
        if target_ids:
            await notify_users(
                db, target_ids,
                title=f"📢 {payload.title}",
                body=payload.body[:200],
                url="/announcements",
                category="announcement",
            )
    except Exception:
        pass

    return Envelope(data=await _enrich(db, ann, current))


@router.put("/{ann_id}", response_model=Envelope[AnnouncementOut])
async def update_announcement(
    ann_id: int,
    payload: AnnouncementIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ann = await db.get(Announcement, ann_id)
    if not ann or ann.org_id != current.org_id:
        raise HTTPException(404, "Pengumuman tidak ditemukan")
    if current.role != "super_admin" and ann.created_by != current.id:
        raise HTTPException(403, "Hanya pembuat yang bisa edit")
    for k, v in payload.model_dump().items():
        setattr(ann, k, v)
    await db.commit()
    await db.refresh(ann)
    return Envelope(data=await _enrich(db, ann, current))


@router.delete("/{ann_id}", response_model=Envelope[dict])
async def delete_announcement(
    ann_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ann = await db.get(Announcement, ann_id)
    if not ann or ann.org_id != current.org_id:
        raise HTTPException(404, "Pengumuman tidak ditemukan")
    if current.role != "super_admin" and ann.created_by != current.id:
        raise HTTPException(403, "Hanya pembuat yang bisa hapus")
    await db.delete(ann)
    await db.commit()
    return Envelope(data={"ok": True})
