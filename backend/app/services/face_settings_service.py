"""Per-organization face sensitivity settings."""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import OrganizationFaceSetting


DEFAULT_FACE_SETTINGS: dict[str, Any] = {
    "match_threshold": settings.FACE_MATCH_THRESHOLD,
    "duplicate_threshold": 0.60,
    "min_quality": settings.FACE_MIN_QUALITY,
    "min_enrollment_frames": 3,
    "blur_threshold": 30.0,
    "min_brightness": 0.15,
    "max_brightness": 0.95,
    "min_variance": 220.0,
    "min_center_variance": 120.0,
    "min_rgb_spread": 8.0,
    "min_skin_ratio": 0.045,
    "liveness_enabled": True,
    "liveness_min_delta": 0.6,
}


def to_face_settings_dict(setting: Optional[OrganizationFaceSetting]) -> dict[str, Any]:
    values = DEFAULT_FACE_SETTINGS.copy()
    if not setting:
        return values
    for key in values:
        value = getattr(setting, key, None)
        if value is not None:
            values[key] = value
    return values


async def load_org_face_settings(db: AsyncSession, org_id: int) -> dict[str, Any]:
    setting = (
        await db.execute(
            select(OrganizationFaceSetting).where(OrganizationFaceSetting.org_id == org_id)
        )
    ).scalar_one_or_none()
    return to_face_settings_dict(setting)


async def load_default_face_settings(db: AsyncSession) -> dict[str, Any]:
    """Load the first configured org setting for public kiosk scans.

    Public scan happens before the user is recognized, so we cannot know the org
    yet. This app currently runs as a single tenant in dev; using the first saved
    org setting makes the admin menu immediately affect kiosk matching.
    """
    setting = (
        await db.execute(
            select(OrganizationFaceSetting).order_by(OrganizationFaceSetting.updated_at.desc())
        )
    ).scalars().first()
    return to_face_settings_dict(setting)
