"""Acara & Kalender Sekolah — events + RSVP + ICS export."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import EventRSVP, SchoolClass, SchoolEvent, User
from app.schemas import Envelope
from app.security import get_current_user, require_roles


router = APIRouter(prefix="/events", tags=["School Events"])


VALID_CATEGORIES = ("akademik", "ujian", "libur", "rapat", "lomba", "kunjungan", "lainnya")
VALID_AUDIENCES = ("all", "siswa", "guru", "ortu", "kelas")


# ─── Schemas ────────────────────────────────────────────────────────────────


class EventIn(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    description: Optional[str] = None
    start_at: datetime
    end_at: Optional[datetime] = None
    location: Optional[str] = None
    category: str = Field(default="akademik")
    audience: str = Field(default="all")
    target_class_id: Optional[int] = None
    requires_rsvp: bool = False
    cover_url: Optional[str] = None


class RSVPIn(BaseModel):
    response: str = Field(pattern="^(yes|no|maybe)$")
    note: Optional[str] = None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    description: Optional[str] = None
    start_at: datetime
    end_at: Optional[datetime] = None
    location: Optional[str] = None
    category: str
    audience: str
    target_class_id: Optional[int] = None
    target_class_name: Optional[str] = None
    requires_rsvp: bool
    cover_url: Optional[str] = None
    created_by: int
    created_by_name: Optional[str] = None
    rsvp_yes: int = 0
    rsvp_no: int = 0
    rsvp_maybe: int = 0
    self_rsvp: Optional[str] = None
    created_at: datetime


# ─── Helpers ────────────────────────────────────────────────────────────────


async def _enrich(db: AsyncSession, ev: SchoolEvent, viewer: User) -> EventOut:
    creator = await db.get(User, ev.created_by)
    cls_name = None
    if ev.target_class_id:
        cls = await db.get(SchoolClass, ev.target_class_id)
        cls_name = cls.name if cls else None

    rsvp_rows = (
        await db.execute(
            select(EventRSVP.response, func.count(EventRSVP.id))
            .where(EventRSVP.event_id == ev.id)
            .group_by(EventRSVP.response)
        )
    ).all()
    counts = {r[0]: r[1] for r in rsvp_rows}

    self_rsvp = None
    if ev.requires_rsvp:
        my = (
            await db.execute(
                select(EventRSVP).where(
                    EventRSVP.event_id == ev.id,
                    EventRSVP.user_id == viewer.id,
                )
            )
        ).scalar_one_or_none()
        if my:
            self_rsvp = my.response

    return EventOut(
        id=ev.id,
        title=ev.title,
        description=ev.description,
        start_at=ev.start_at,
        end_at=ev.end_at,
        location=ev.location,
        category=ev.category,
        audience=ev.audience,
        target_class_id=ev.target_class_id,
        target_class_name=cls_name,
        requires_rsvp=ev.requires_rsvp,
        cover_url=ev.cover_url,
        created_by=ev.created_by,
        created_by_name=creator.full_name if creator else None,
        rsvp_yes=counts.get("yes", 0),
        rsvp_no=counts.get("no", 0),
        rsvp_maybe=counts.get("maybe", 0),
        self_rsvp=self_rsvp,
        created_at=ev.created_at,
    )


def _is_audience_match(ev: SchoolEvent, viewer: User) -> bool:
    """Check apakah viewer in audience target."""
    if ev.audience == "all":
        return True
    role = viewer.role
    if ev.audience == "siswa" and role == "employee":
        return True
    if ev.audience == "guru" and role in ("admin", "hr"):
        return True
    if ev.audience == "ortu":
        # Konten "ortu" tetap visible ke staff & siswa untuk transparansi info.
        return True
    if ev.audience == "kelas":
        if role == "employee":
            return viewer.school_class_id == ev.target_class_id
        # Wali kelas yang pegang kelas tsb selalu lihat
        if role == "admin":
            return viewer.homeroom_class_id == ev.target_class_id
        # Kepsek & BK selalu lihat semua event kelas
        if role in ("super_admin", "hr"):
            return True
        return False
    return False


# ─── Event endpoints ────────────────────────────────────────────────────────


@router.get("", response_model=Envelope[list[EventOut]])
async def list_events(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    category: Optional[str] = None,
    upcoming_only: bool = False,
):
    stmt = select(SchoolEvent).where(SchoolEvent.org_id == current.org_id)

    if upcoming_only:
        stmt = stmt.where(SchoolEvent.start_at >= datetime.now())
    if from_date:
        stmt = stmt.where(SchoolEvent.start_at >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        stmt = stmt.where(SchoolEvent.start_at <= datetime.combine(to_date, datetime.max.time()))
    if category:
        stmt = stmt.where(SchoolEvent.category == category)

    rows = (await db.execute(stmt.order_by(SchoolEvent.start_at))).scalars().all()
    visible = [r for r in rows if _is_audience_match(r, current)]

    if not visible:
        return Envelope(data=[])

    # Batch resolve untuk hindari N+1
    creator_ids = {r.created_by for r in visible}
    class_ids = {r.target_class_id for r in visible if r.target_class_id}
    event_ids = [r.id for r in visible]

    creators = {
        u.id: u for u in (
            await db.execute(select(User).where(User.id.in_(creator_ids)))
        ).scalars().all()
    }
    classes = {
        c.id: c for c in (
            await db.execute(select(SchoolClass).where(SchoolClass.id.in_(class_ids)))
        ).scalars().all()
    } if class_ids else {}
    rsvp_counts: dict[int, dict[str, int]] = {}
    for row in (await db.execute(
        select(EventRSVP.event_id, EventRSVP.response, func.count(EventRSVP.id))
        .where(EventRSVP.event_id.in_(event_ids))
        .group_by(EventRSVP.event_id, EventRSVP.response)
    )).all():
        rsvp_counts.setdefault(row[0], {})[row[1]] = row[2]
    self_rsvps = {
        r.event_id: r.response for r in (
            await db.execute(
                select(EventRSVP).where(
                    EventRSVP.event_id.in_(event_ids),
                    EventRSVP.user_id == current.id,
                )
            )
        ).scalars().all()
    }

    out: list[EventOut] = []
    for ev in visible:
        creator = creators.get(ev.created_by)
        cls = classes.get(ev.target_class_id) if ev.target_class_id else None
        counts = rsvp_counts.get(ev.id, {})
        out.append(EventOut(
            id=ev.id,
            title=ev.title,
            description=ev.description,
            start_at=ev.start_at,
            end_at=ev.end_at,
            location=ev.location,
            category=ev.category,
            audience=ev.audience,
            target_class_id=ev.target_class_id,
            target_class_name=cls.name if cls else None,
            requires_rsvp=ev.requires_rsvp,
            cover_url=ev.cover_url,
            created_by=ev.created_by,
            created_by_name=creator.full_name if creator else None,
            rsvp_yes=counts.get("yes", 0),
            rsvp_no=counts.get("no", 0),
            rsvp_maybe=counts.get("maybe", 0),
            self_rsvp=self_rsvps.get(ev.id) if ev.requires_rsvp else None,
            created_at=ev.created_at,
        ))
    return Envelope(data=out)


@router.post("", response_model=Envelope[EventOut], status_code=201)
async def create_event(
    payload: EventIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if payload.category not in VALID_CATEGORIES:
        raise HTTPException(422, "Kategori tidak valid")
    if payload.audience not in VALID_AUDIENCES:
        raise HTTPException(422, "Audience tidak valid")
    if payload.audience == "kelas" and not payload.target_class_id:
        raise HTTPException(422, "Audience 'kelas' perlu target_class_id")
    if payload.target_class_id:
        cls = await db.get(SchoolClass, payload.target_class_id)
        if not cls or cls.org_id != current.org_id:
            raise HTTPException(404, "Kelas tidak ditemukan")
    if payload.end_at and payload.end_at <= payload.start_at:
        raise HTTPException(422, "Jam selesai harus setelah jam mulai")

    ev = SchoolEvent(
        org_id=current.org_id,
        created_by=current.id,
        **payload.model_dump(),
    )
    db.add(ev)
    await db.commit()
    await db.refresh(ev)

    # Notif broadcast ke audience (best-effort)
    try:
        from app.services.notification_service import notify_users
        # Cari audience user_ids
        target_ids: list[int] = []
        ustmt = select(User.id).where(User.org_id == current.org_id, User.status == "active")
        if ev.audience == "siswa":
            ustmt = ustmt.where(User.role == "employee")
        elif ev.audience == "guru":
            ustmt = ustmt.where(User.role.in_(["admin", "hr"]))
        elif ev.audience == "kelas" and ev.target_class_id:
            ustmt = ustmt.where(User.school_class_id == ev.target_class_id)
        target_ids = list((await db.execute(ustmt)).scalars().all())
        if target_ids:
            await notify_users(
                db, target_ids,
                title=f"📅 {ev.title}",
                body=f"{ev.start_at.strftime('%d %b %Y, %H:%M')} • {ev.location or 'TBA'}",
                url="/events",
                category="event",
            )
    except Exception:
        pass

    return Envelope(data=await _enrich(db, ev, current))


@router.put("/{event_id}", response_model=Envelope[EventOut])
async def update_event(
    event_id: int,
    payload: EventIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ev = await db.get(SchoolEvent, event_id)
    if not ev or ev.org_id != current.org_id:
        raise HTTPException(404, "Acara tidak ditemukan")
    if current.role != "super_admin" and ev.created_by != current.id:
        raise HTTPException(403, "Hanya pembuat acara yang bisa edit")
    for k, v in payload.model_dump().items():
        setattr(ev, k, v)
    await db.commit()
    await db.refresh(ev)
    return Envelope(data=await _enrich(db, ev, current))


@router.delete("/{event_id}", response_model=Envelope[dict])
async def delete_event(
    event_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ev = await db.get(SchoolEvent, event_id)
    if not ev or ev.org_id != current.org_id:
        raise HTTPException(404, "Acara tidak ditemukan")
    if current.role != "super_admin" and ev.created_by != current.id:
        raise HTTPException(403, "Hanya pembuat acara yang bisa hapus")
    await db.delete(ev)
    await db.commit()
    return Envelope(data={"ok": True})


# ─── RSVP endpoints ─────────────────────────────────────────────────────────


@router.post("/{event_id}/rsvp", response_model=Envelope[EventOut])
async def rsvp_event(
    event_id: int,
    payload: RSVPIn,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ev = await db.get(SchoolEvent, event_id)
    if not ev or ev.org_id != current.org_id:
        raise HTTPException(404, "Acara tidak ditemukan")
    if not ev.requires_rsvp:
        raise HTTPException(400, "Acara ini tidak butuh RSVP")

    existing = (
        await db.execute(
            select(EventRSVP).where(
                EventRSVP.event_id == event_id,
                EventRSVP.user_id == current.id,
            )
        )
    ).scalar_one_or_none()

    if existing:
        existing.response = payload.response
        existing.note = payload.note
    else:
        db.add(EventRSVP(
            event_id=event_id,
            user_id=current.id,
            response=payload.response,
            note=payload.note,
        ))
    await db.commit()
    await db.refresh(ev)
    return Envelope(data=await _enrich(db, ev, current))


@router.get("/{event_id}/rsvps", response_model=Envelope[list[dict]])
async def list_rsvps(
    event_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ev = await db.get(SchoolEvent, event_id)
    if not ev or ev.org_id != current.org_id:
        raise HTTPException(404, "Acara tidak ditemukan")

    rows = (
        await db.execute(
            select(EventRSVP).where(EventRSVP.event_id == event_id)
        )
    ).scalars().all()
    out = []
    for r in rows:
        u = await db.get(User, r.user_id)
        out.append({
            "user_id": r.user_id,
            "name": u.full_name if u else "?",
            "role": u.role if u else None,
            "response": r.response,
            "note": r.note,
            "created_at": r.created_at.isoformat(),
        })
    return Envelope(data=out)


# ─── ICS Calendar Export ────────────────────────────────────────────────────


def _ics_escape(s: str) -> str:
    return (s or "").replace("\\", "\\\\").replace("\n", "\\n").replace(",", "\\,").replace(";", "\\;")


def _ics_dt(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


@router.get("/calendar.ics")
async def export_ics(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = 365,
):
    """Export semua event sebagai file .ics — siswa/ortu bisa subscribe ke Google Calendar."""
    rows = (
        await db.execute(
            select(SchoolEvent)
            .where(
                SchoolEvent.org_id == current.org_id,
                SchoolEvent.start_at >= datetime.now() - timedelta(days=30),
                SchoolEvent.start_at <= datetime.now() + timedelta(days=days),
            )
            .order_by(SchoolEvent.start_at)
        )
    ).scalars().all()

    visible = [r for r in rows if _is_audience_match(r, current)]

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Aethera//School Events//ID",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:Kalender Aethera",
    ]
    now_stamp = _ics_dt(datetime.now(timezone.utc))
    for ev in visible:
        end = ev.end_at or (ev.start_at + timedelta(hours=1))
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:event-{ev.id}@aethera.my.id",
            f"DTSTAMP:{now_stamp}",
            f"DTSTART:{_ics_dt(ev.start_at)}",
            f"DTEND:{_ics_dt(end)}",
            f"SUMMARY:{_ics_escape(ev.title)}",
            f"DESCRIPTION:{_ics_escape(ev.description or '')}",
            f"LOCATION:{_ics_escape(ev.location or '')}",
            f"CATEGORIES:{_ics_escape(ev.category)}",
            "END:VEVENT",
        ])
    lines.append("END:VCALENDAR")

    body = "\r\n".join(lines)
    return Response(
        content=body,
        media_type="text/calendar",
        headers={"Content-Disposition": "attachment; filename=aethera-calendar.ics"},
    )
