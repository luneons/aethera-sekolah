"""Audit log viewer — kepsek bisa lihat aktivitas sensitif user."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AuditLog, User
from app.schemas import Envelope
from app.security import require_roles


router = APIRouter(prefix="/audit-log", tags=["Audit Log"])


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: Optional[int]
    user_name: Optional[str]
    action: str
    target_type: Optional[str]
    target_id: Optional[int]
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime


class AuditStatsOut(BaseModel):
    total_events_30d: int
    by_action: list[dict]
    failed_logins_24h: int
    suspicious_users: list[dict]  # user dengan banyak failed login


@router.get("", response_model=Envelope[list[AuditLogOut]])
async def list_audit_logs(
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    limit: int = 200,
):
    """List audit log. Hanya kepsek (super_admin) yang bisa akses."""
    # Cari user di org yang sama
    user_ids = (
        await db.execute(
            select(User.id).where(User.org_id == current.org_id)
        )
    ).scalars().all()
    if not user_ids:
        return Envelope(data=[])

    stmt = select(AuditLog).where(AuditLog.user_id.in_(user_ids))
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if from_date:
        stmt = stmt.where(
            AuditLog.created_at >= datetime.combine(from_date, datetime.min.time())
        )
    if to_date:
        stmt = stmt.where(
            AuditLog.created_at <= datetime.combine(to_date, datetime.max.time())
        )

    rows = (
        await db.execute(stmt.order_by(desc(AuditLog.created_at)).limit(limit))
    ).scalars().all()

    out: list[AuditLogOut] = []
    for r in rows:
        u = await db.get(User, r.user_id) if r.user_id else None
        out.append(AuditLogOut(
            id=r.id,
            user_id=r.user_id,
            user_name=u.full_name if u else None,
            action=r.action,
            target_type=r.target_type,
            target_id=r.target_id,
            ip_address=r.ip_address,
            user_agent=r.user_agent[:120] if r.user_agent else None,
            created_at=r.created_at,
        ))
    return Envelope(data=out)


@router.get("/stats", response_model=Envelope[AuditStatsOut])
async def stats(
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    user_ids = (
        await db.execute(
            select(User.id).where(User.org_id == current.org_id)
        )
    ).scalars().all()
    if not user_ids:
        return Envelope(data=AuditStatsOut(
            total_events_30d=0, by_action=[], failed_logins_24h=0, suspicious_users=[]
        ))

    cutoff_30d = datetime.utcnow() - timedelta(days=30)
    cutoff_24h = datetime.utcnow() - timedelta(days=1)

    total_30d = (
        await db.execute(
            select(func.count(AuditLog.id)).where(
                AuditLog.user_id.in_(user_ids),
                AuditLog.created_at >= cutoff_30d,
            )
        )
    ).scalar_one()

    by_action_rows = (
        await db.execute(
            select(AuditLog.action, func.count(AuditLog.id))
            .where(
                AuditLog.user_id.in_(user_ids),
                AuditLog.created_at >= cutoff_30d,
            )
            .group_by(AuditLog.action)
            .order_by(func.count(AuditLog.id).desc())
            .limit(10)
        )
    ).all()
    by_action = [{"action": r[0], "count": r[1]} for r in by_action_rows]

    failed_24h = (
        await db.execute(
            select(func.count(AuditLog.id)).where(
                AuditLog.user_id.in_(user_ids),
                AuditLog.action.in_(["LOGIN_FAILED", "LOGIN_LOCKED", "2FA_FAILED"]),
                AuditLog.created_at >= cutoff_24h,
            )
        )
    ).scalar_one()

    # Top failed login users (suspicious)
    suspicious_rows = (
        await db.execute(
            select(AuditLog.user_id, func.count(AuditLog.id))
            .where(
                AuditLog.user_id.in_(user_ids),
                AuditLog.action.in_(["LOGIN_FAILED", "2FA_FAILED"]),
                AuditLog.created_at >= cutoff_30d,
            )
            .group_by(AuditLog.user_id)
            .having(func.count(AuditLog.id) >= 5)
            .order_by(func.count(AuditLog.id).desc())
            .limit(10)
        )
    ).all()
    suspicious = []
    for r in suspicious_rows:
        u = await db.get(User, r[0])
        suspicious.append({
            "user_id": r[0],
            "user_name": u.full_name if u else "?",
            "failed_count": r[1],
        })

    return Envelope(data=AuditStatsOut(
        total_events_30d=total_30d,
        by_action=by_action,
        failed_logins_24h=failed_24h,
        suspicious_users=suspicious,
    ))
