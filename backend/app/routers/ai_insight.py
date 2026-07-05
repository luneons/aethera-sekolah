"""AI Insight endpoints — KPI summary powered by OpenRouter (Nemotron free)."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AiInsight, SchoolClass, User
from app.schemas import Envelope
from app.security import get_current_user, require_roles
from app.services.ai_insight_service import (
    get_class_insight,
    get_school_insight,
    get_student_insight,
)


router = APIRouter(prefix="/ai-insight", tags=["AI Insight"])


class InsightOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    scope: str
    scope_id: Optional[int] = None
    insight_type: str
    summary: str
    items: list[str]
    severity: str
    generated_at: datetime
    expires_at: Optional[datetime] = None
    source: str = "ai"  # 'ai' atau 'fallback'


def _to_out(ins: AiInsight) -> InsightOut:
    items_raw = ins.items_json or []
    items = items_raw if isinstance(items_raw, list) else []
    return InsightOut(
        id=ins.id,
        scope=ins.scope,
        scope_id=ins.scope_id,
        insight_type=ins.insight_type,
        summary=ins.summary,
        items=[str(x) for x in items],
        severity=ins.severity,
        generated_at=ins.generated_at,
        expires_at=ins.expires_at,
    )


@router.get("/school", response_model=Envelope[InsightOut])
async def school_insight(
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    refresh: bool = False,
):
    ins = await get_school_insight(db, current.org_id, force_refresh=refresh)
    return Envelope(data=_to_out(ins))


@router.get("/class/{class_id}", response_model=Envelope[InsightOut])
async def class_insight(
    class_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    refresh: bool = False,
):
    cls = await db.get(SchoolClass, class_id)
    if not cls or cls.org_id != current.org_id:
        raise HTTPException(404, "Kelas tidak ditemukan")
    ins = await get_class_insight(db, current.org_id, class_id, force_refresh=refresh)
    return Envelope(data=_to_out(ins))


@router.get("/student/{student_id}", response_model=Envelope[InsightOut])
async def student_insight(
    student_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    refresh: bool = False,
):
    student = await db.get(User, student_id)
    if not student or student.org_id != current.org_id:
        raise HTTPException(404, "Siswa tidak ditemukan")
    ins = await get_student_insight(db, current.org_id, student_id, force_refresh=refresh)
    return Envelope(data=_to_out(ins))


@router.get("/my-status", response_model=Envelope[InsightOut])
async def my_insight(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    refresh: bool = False,
):
    """Siswa lihat insight diri sendiri (gaya self-reflection)."""
    if current.role != "employee":
        raise HTTPException(403, "Endpoint khusus siswa")
    ins = await get_student_insight(db, current.org_id, current.id, force_refresh=refresh)
    return Envelope(data=_to_out(ins))
