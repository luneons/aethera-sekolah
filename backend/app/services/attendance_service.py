"""Attendance business logic — check-in / check-out / status determination."""
from __future__ import annotations

import base64
import math
import secrets
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import (
    AttendanceRecord, AuditLog, FaceEmbedding, OrganizationGeofenceSetting, User, WorkSchedule,
)
from app.services import face_service as fs
from app.services.face_settings_service import load_default_face_settings, load_org_face_settings
from app.services.whatsapp_service import notify_attendance as wa_notify


# Default work hours when no schedule is configured (08:00 in/17:00 out, 15-min grace)
DEFAULT_CHECK_IN = time(8, 0)
DEFAULT_CHECK_OUT = time(17, 0)
DEFAULT_GRACE_MIN = 15


def _distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance between two coordinates in meters."""
    radius = 6_371_000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _check_geofence(
    latitude: Optional[float],
    longitude: Optional[float],
    accuracy: Optional[float],
    *,
    enabled: bool,
    location_name: str,
    office_latitude: Optional[float],
    office_longitude: Optional[float],
    radius_meters: int,
    max_accuracy_meters: int,
) -> tuple[Optional[dict], dict]:
    base_details = {
        "enabled": enabled,
        "location_name": location_name,
        "accuracy_meters": round(accuracy, 1) if accuracy is not None else None,
        "radius_meters": radius_meters,
        "max_accuracy_meters": max_accuracy_meters,
    }
    if not enabled:
        return None, base_details

    if office_latitude is None or office_longitude is None:
        return {
            "success": False,
            "code": "GEOFENCE_CONFIG_MISSING",
            "message": "Lokasi kantor/sekolah belum dikonfigurasi. Hubungi admin.",
            "details": base_details,
        }, base_details

    if latitude is None or longitude is None:
        return {
            "success": False,
            "code": "LOCATION_REQUIRED",
            "message": "Aktifkan izin lokasi perangkat untuk melakukan absensi.",
            "details": base_details,
        }, base_details

    if accuracy is not None and accuracy > max_accuracy_meters:
        return {
            "success": False,
            "code": "LOCATION_ACCURACY_LOW",
            "message": (
                f"Akurasi lokasi terlalu rendah ({accuracy:.0f} meter). "
                "Aktifkan precise location/GPS lalu coba lagi."
            ),
            "details": {
                **base_details,
                "accuracy_meters": round(accuracy, 1),
                "max_accuracy_meters": max_accuracy_meters,
            },
        }, base_details

    distance = _distance_meters(
        latitude,
        longitude,
        office_latitude,
        office_longitude,
    )
    pass_details = {
        **base_details,
        "distance_meters": round(distance, 1),
        "latitude": latitude,
        "longitude": longitude,
    }
    if distance > radius_meters:
        return {
            "success": False,
            "code": "OUTSIDE_GEOFENCE",
            "message": (
                f"Anda berada sekitar {distance:.0f} meter dari lokasi kantor/sekolah. "
                f"Absensi hanya bisa dilakukan dalam radius {radius_meters} meter."
            ),
            "details": {
                **pass_details,
            },
        }, pass_details

    return None, pass_details


async def _load_org_geofence_settings(db: AsyncSession, org_id: int) -> dict:
    setting = (
        await db.execute(
            select(OrganizationGeofenceSetting).where(OrganizationGeofenceSetting.org_id == org_id)
        )
    ).scalar_one_or_none()
    if setting:
        return {
            "enabled": setting.enabled,
            "location_name": setting.location_name,
            "office_latitude": setting.latitude,
            "office_longitude": setting.longitude,
            "radius_meters": setting.radius_meters,
            "max_accuracy_meters": setting.max_accuracy_meters,
        }

    return {
        "enabled": settings.GEOFENCE_ENABLED,
        "location_name": "Kantor",
        "office_latitude": settings.OFFICE_LATITUDE,
        "office_longitude": settings.OFFICE_LONGITUDE,
        "radius_meters": settings.OFFICE_RADIUS_METERS,
        "max_accuracy_meters": settings.GEOFENCE_MAX_ACCURACY_METERS,
    }


async def load_active_gallery(db: AsyncSession) -> list[tuple[int, "np.ndarray"]]:  # type: ignore[name-defined]
    """Load all active face embeddings into memory for matching.

    Only loads embeddings that match the current model version (ArcFace).
    Old pHash embeddings are skipped — users need to re-enroll.
    """
    import numpy as np  # local import to avoid double-load at startup
    rows = (
        await db.execute(
            select(FaceEmbedding).where(
                FaceEmbedding.is_active == True,  # noqa: E712
                FaceEmbedding.model_version == fs.MODEL_VERSION,
            )
        )
    ).scalars().all()

    gallery: list[tuple[int, np.ndarray]] = []
    for r in rows:
        try:
            vec = fs.deserialize_embedding(r.embedding_data)
            # Validate embedding dimension matches current model
            if vec.shape[0] == fs.EMBEDDING_DIM:
                gallery.append((r.user_id, vec))
        except Exception:
            continue
    return gallery


def _save_snapshot(image_bytes: bytes, kind: str, user_id: int) -> str:
    """Persist a snapshot file. Returns the public path."""
    name = f"{kind}_{user_id}_{datetime.now(timezone.utc):%Y%m%d_%H%M%S}_{secrets.token_hex(3)}.jpg"
    path: Path = settings.snapshot_path / name
    path.write_bytes(image_bytes)
    return f"/snapshots/{name}"


async def _get_today_record(
    db: AsyncSession, user_id: int, today: date
) -> Optional[AttendanceRecord]:
    """Query today's record with FOR UPDATE to prevent race conditions on concurrent check-ins."""
    return (
        await db.execute(
            select(AttendanceRecord)
            .where(
                AttendanceRecord.user_id == user_id,
                AttendanceRecord.attendance_date == today,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()


def _determine_status(check_in: datetime, schedule: Optional[WorkSchedule]) -> tuple[str, int]:
    """Return (status, late_minutes)."""
    if schedule:
        deadline = datetime.combine(check_in.date(), schedule.check_in_end)
        grace = schedule.grace_period
    else:
        deadline = datetime.combine(check_in.date(), DEFAULT_CHECK_IN)
        grace = DEFAULT_GRACE_MIN

    delta = check_in - deadline
    total_min = int(delta.total_seconds() // 60)
    if total_min <= grace:
        return "present", max(0, total_min)
    return "late", total_min


async def process_face_attendance(
    db: AsyncSession,
    image_b64: str,
    action: str,  # 'checkin' or 'checkout'
    camera_id: Optional[int] = None,
    ip_address: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    accuracy: Optional[float] = None,
) -> dict:
    """Match face against gallery and record attendance.

    Returns dict with success/data or error info.
    """
    if action not in ("checkin", "checkout"):
        return {"success": False, "code": "INVALID_ACTION", "message": "Aksi tidak valid"}

    # Decode + quality check
    try:
        img = fs.decode_image(image_b64)
    except ValueError as e:
        return {"success": False, "code": "DECODE_ERROR", "message": str(e)}

    face_settings = await load_default_face_settings(db)
    quality = fs.validate_quality(img, face_settings)
    if not quality.passed:
        return {
            "success": False,
            "code": "QUALITY_LOW",
            "message": "; ".join(quality.reasons),
            "details": {
                "quality_score": quality.score,
                "min_quality": face_settings["min_quality"],
                "blur": round(quality.blur, 2),
                "brightness": round(quality.brightness, 3),
            },
        }

    # Extract embedding (we already validated, but `extract_embedding` re-validates)
    try:
        probe, qscore = fs.extract_embedding(img, face_settings)
    except ValueError as e:
        return {"success": False, "code": "EMBED_ERROR", "message": str(e)}

    # Compare against gallery
    gallery = await load_active_gallery(db)
    if not gallery:
        return {
            "success": False,
            "code": "EMPTY_GALLERY",
            "message": "Belum ada wajah terdaftar di sistem",
        }

    match = fs.find_best_match(probe, gallery, threshold=face_settings["match_threshold"])
    if not match.matched or match.user_id is None:
        return {
            "success": False,
            "code": "FACE_NOT_RECOGNIZED",
            "message": "Wajah tidak ditemukan dalam database",
            "details": {
                "confidence": match.confidence,
                "similarity_score": match.score,
                "match_threshold": face_settings["match_threshold"],
            },
        }

    user = await db.get(User, match.user_id)
    if not user or user.status != "active":
        return {
            "success": False,
            "code": "USER_INACTIVE",
            "message": "Akun karyawan tidak aktif",
        }

    face_settings = await load_org_face_settings(db, user.org_id)
    if match.score < face_settings["match_threshold"]:
        return {
            "success": False,
            "code": "FACE_NOT_RECOGNIZED",
            "message": "Wajah tidak cukup cocok dengan data terdaftar",
            "details": {
                "confidence": match.confidence,
                "similarity_score": match.score,
                "match_threshold": face_settings["match_threshold"],
            },
        }

    geofence_config = await _load_org_geofence_settings(db, user.org_id)
    geofence_error, geofence_details = _check_geofence(latitude, longitude, accuracy, **geofence_config)
    if geofence_error:
        return geofence_error

    # Persist snapshot bytes (re-decode to get raw)
    raw_bytes = base64.b64decode(fs._DATA_URL_RE.sub("", image_b64).strip())

    today = datetime.now(timezone.utc).date()
    now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive untuk konsistensi DB
    record = await _get_today_record(db, user.id, today)

    if action == "checkin":
        if record and record.check_in_at:
            return {
                "success": True,
                "message": f"Sudah check-in pukul {record.check_in_at:%H:%M}",
                "data": {
                    "action": "checkin",
                    "user": {
                        "id": user.id,
                        "name": user.full_name,
                        "employee_id": user.employee_id,
                        "photo_url": user.photo_url,
                    },
                    "timestamp": record.check_in_at.isoformat(),
                    "status": record.status,
                    "late_minutes": record.late_minutes or 0,
                    "confidence": match.confidence,
                    "already_recorded": True,
                    "geofence": geofence_details,
                },
            }

        snapshot_url = _save_snapshot(raw_bytes, "in", user.id)
        # Schedule — cari jadwal yang berlaku untuk hari ini
        today_weekday = now.strftime("%a")  # Mon, Tue, Wed, Thu, Fri, Sat, Sun
        schedule = (
            await db.execute(
                select(WorkSchedule)
                .where(WorkSchedule.org_id == user.org_id)
                .order_by(WorkSchedule.id)
            )
        ).scalars().all()
        # Pilih jadwal yang work_days-nya mencakup hari ini
        active_schedule = None
        for s in schedule:
            if s.work_days and today_weekday in s.work_days:
                active_schedule = s
                break
        if not active_schedule and schedule:
            active_schedule = schedule[0]  # fallback ke jadwal pertama

        status_str, late_min = _determine_status(now, active_schedule)

        if record is None:
            record = AttendanceRecord(
                user_id=user.id,
                camera_id=camera_id,
                schedule_id=active_schedule.id if active_schedule else None,
                attendance_date=today,
            )
            db.add(record)

        record.check_in_at = now
        record.check_in_method = "face"
        record.check_in_confidence = match.confidence
        record.check_in_snapshot_url = snapshot_url
        record.status = status_str
        record.late_minutes = late_min
        if active_schedule:
            record.schedule_id = active_schedule.id

        db.add(
            AuditLog(
                user_id=user.id,
                action="CHECKIN",
                target_type="attendance",
                ip_address=ip_address,
                extra_meta={
                    "confidence": match.confidence,
                    "status": status_str,
                    "location": {
                        "latitude": latitude,
                        "longitude": longitude,
                        "accuracy": accuracy,
                    },
                },
            )
        )
        await db.commit()

        # Send WhatsApp notification to parent (fire-and-forget)
        try:
            await wa_notify(
                db, user=user, action="checkin",
                timestamp=now, status=status_str, org_id=user.org_id,
            )
        except Exception:
            pass  # Don't fail attendance on WA error

        return {
            "success": True,
            "data": {
                "action": "checkin",
                "user": {
                    "id": user.id,
                    "name": user.full_name,
                    "employee_id": user.employee_id,
                    "photo_url": user.photo_url,
                },
                "timestamp": now.isoformat(),
                "status": status_str,
                "late_minutes": late_min,
                "confidence": match.confidence,
                "geofence": geofence_details,
            },
        }

    # action == checkout
    if not record or not record.check_in_at:
        return {
            "success": False,
            "code": "NOT_CHECKED_IN",
            "message": "Belum check-in hari ini",
        }
    if record.check_out_at:
        return {
            "success": True,
            "message": f"Sudah check-out pukul {record.check_out_at:%H:%M}",
            "data": {
                "action": "checkout",
                "user": {
                    "id": user.id,
                    "name": user.full_name,
                    "employee_id": user.employee_id,
                    "photo_url": user.photo_url,
                },
                "timestamp": record.check_out_at.isoformat(),
                "work_duration_min": record.work_duration,
                "confidence": match.confidence,
                "already_recorded": True,
                "geofence": geofence_details,
            },
        }

    snapshot_url = _save_snapshot(raw_bytes, "out", user.id)
    record.check_out_at = now
    record.check_out_method = "face"
    record.check_out_confidence = match.confidence
    record.check_out_snapshot_url = snapshot_url
    record.work_duration = int((now - record.check_in_at).total_seconds() // 60)

    db.add(
        AuditLog(
            user_id=user.id,
            action="CHECKOUT",
            target_type="attendance",
            ip_address=ip_address,
            extra_meta={
                "confidence": match.confidence,
                "duration_min": record.work_duration,
                "location": {
                    "latitude": latitude,
                    "longitude": longitude,
                    "accuracy": accuracy,
                },
            },
        )
    )
    await db.commit()

    # Send WhatsApp notification to parent (fire-and-forget)
    try:
        await wa_notify(
            db, user=user, action="checkout",
            timestamp=now, status="present", org_id=user.org_id,
        )
    except Exception:
        pass

    return {
        "success": True,
        "data": {
            "action": "checkout",
            "user": {
                "id": user.id,
                "name": user.full_name,
                "employee_id": user.employee_id,
            },
            "timestamp": now.isoformat(),
            "work_duration_min": record.work_duration,
            "confidence": match.confidence,
            "geofence": geofence_details,
        },
    }
