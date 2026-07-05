"""Attendance endpoints — check-in/out, today list, override."""
from datetime import date, datetime, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.config import settings
from app.models import AttendanceRecord, AuditLog, Department, OrganizationGeofenceSetting, User
from app.schemas import (
    AttendanceImageRequest, AttendanceOverrideRequest, AttendanceRecordOut,
    AttendanceResponse, AttendanceUserBrief, Envelope, Meta,
)
from app.security import get_current_user, homeroom_scope_filter, require_roles
from app.services.attendance_service import process_face_attendance
from app.services.rate_limiter import limit_kiosk


router = APIRouter(prefix="/attendance", tags=["Attendance"])


@router.get("/geofence-info", response_model=Envelope[dict])
async def public_geofence_info(db: Annotated[AsyncSession, Depends(get_db)]):
    """Public geofence reference for the scan page."""
    setting = (
        await db.execute(
            select(OrganizationGeofenceSetting)
            .order_by(OrganizationGeofenceSetting.enabled.desc(), OrganizationGeofenceSetting.updated_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if setting:
        return Envelope(
            data={
                "enabled": setting.enabled,
                "location_name": setting.location_name,
                "latitude": setting.latitude,
                "longitude": setting.longitude,
                "radius_meters": setting.radius_meters,
                "max_accuracy_meters": setting.max_accuracy_meters,
            }
        )
    return Envelope(
        data={
            "enabled": settings.GEOFENCE_ENABLED,
            "location_name": "Kantor",
            "latitude": settings.OFFICE_LATITUDE,
            "longitude": settings.OFFICE_LONGITUDE,
            "radius_meters": settings.OFFICE_RADIUS_METERS,
            "max_accuracy_meters": settings.GEOFENCE_MAX_ACCURACY_METERS,
        }
    )


def _attendance_response(data: dict) -> AttendanceResponse:
    payload = dict(data)
    user = AttendanceUserBrief(**payload.pop("user"))
    return AttendanceResponse(**payload, user=user)


def _attendance_error_response(result: dict) -> JSONResponse:
    return JSONResponse(
        status_code=200,
        content={
            "success": False,
            "data": None,
            "message": result.get("message", "Absensi ditolak"),
            "error": {
                "code": result.get("code"),
                "message": result.get("message", "Absensi ditolak"),
                "details": result.get("details"),
            },
        },
    )


def _record_to_out(rec: AttendanceRecord, user: Optional[User] = None) -> AttendanceRecordOut:
    u = user or rec.user
    return AttendanceRecordOut(
        id=rec.id,
        user_id=rec.user_id,
        user_name=u.full_name if u else None,
        employee_id=u.employee_id if u else None,
        department_name=u.department.name if u and u.department else None,
        attendance_date=rec.attendance_date,
        check_in_at=rec.check_in_at,
        check_out_at=rec.check_out_at,
        status=rec.status,
        late_minutes=rec.late_minutes or 0,
        work_duration=rec.work_duration,
        check_in_snapshot_url=rec.check_in_snapshot_url,
        check_out_snapshot_url=rec.check_out_snapshot_url,
    )


@router.post("/checkin", response_model=Envelope[AttendanceResponse])
async def checkin(
    payload: AttendanceImageRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    _rl: None = Depends(limit_kiosk),
):
    """Check-in via face — does not require user auth (kiosk mode)."""
    result = await process_face_attendance(
        db, payload.image, "checkin",
        camera_id=payload.camera_id,
        ip_address=request.client.host if request.client else None,
        latitude=payload.latitude,
        longitude=payload.longitude,
        accuracy=payload.accuracy,
    )
    if not result["success"]:
        return _attendance_error_response(result)
    return Envelope(
        data=_attendance_response(result["data"]),
        message=result.get("message", "Check-in berhasil"),
    )


@router.post("/checkout", response_model=Envelope[AttendanceResponse])
async def checkout(
    payload: AttendanceImageRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    _rl: None = Depends(limit_kiosk),
):
    result = await process_face_attendance(
        db, payload.image, "checkout",
        camera_id=payload.camera_id,
        ip_address=request.client.host if request.client else None,
        latitude=payload.latitude,
        longitude=payload.longitude,
        accuracy=payload.accuracy,
    )
    if not result["success"]:
        return _attendance_error_response(result)
    return Envelope(
        data=_attendance_response(result["data"]),
        message=result.get("message", "Check-out berhasil"),
    )


@router.get("/today", response_model=Envelope[list[AttendanceRecordOut]])
async def today_attendance(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    today = date.today()
    rows = (
        await db.execute(
            select(AttendanceRecord)
            .join(User, User.id == AttendanceRecord.user_id)
            .where(
                AttendanceRecord.attendance_date == today,
                User.org_id == current.org_id,
            )
            .options(selectinload(AttendanceRecord.user).selectinload(User.department))
            .order_by(AttendanceRecord.check_in_at.desc())
        )
    ).scalars().all()
    return Envelope(data=[_record_to_out(r) for r in rows])


@router.get("/records", response_model=Envelope[list[AttendanceRecordOut]])
async def list_records(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    department_id: Optional[int] = None,
    show_all: bool = Query(False, description="Wali kelas: true untuk lihat seluruh sekolah"),
):
    # Employees can only see their own
    if current.role == "employee":
        user_id = current.id

    stmt = (
        select(AttendanceRecord)
        .join(User, User.id == AttendanceRecord.user_id)
        .where(User.org_id == current.org_id)
        .options(selectinload(AttendanceRecord.user).selectinload(User.department))
        .order_by(AttendanceRecord.attendance_date.desc(), AttendanceRecord.check_in_at.desc())
    )
    # Auto-scope: wali kelas hanya lihat record siswanya kecuali minta show_all
    scope_active, class_id = homeroom_scope_filter(current)
    if scope_active and not show_all:
        stmt = stmt.where(User.school_class_id == class_id)
    if user_id:
        stmt = stmt.where(AttendanceRecord.user_id == user_id)
    if date_from:
        stmt = stmt.where(AttendanceRecord.attendance_date >= date_from)
    if date_to:
        stmt = stmt.where(AttendanceRecord.attendance_date <= date_to)
    if status_filter:
        stmt = stmt.where(AttendanceRecord.status == status_filter)
    if department_id:
        stmt = stmt.where(User.department_id == department_id)

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
    rows = (
        await db.execute(stmt.offset((page - 1) * per_page).limit(per_page))
    ).scalars().all()

    return Envelope(
        data=[_record_to_out(r) for r in rows],
        meta=Meta(page=page, per_page=per_page, total=total),
    )


@router.patch("/{record_id}/override", response_model=Envelope[AttendanceRecordOut])
async def override_record(
    record_id: int,
    payload: AttendanceOverrideRequest,
    current: Annotated[User, Depends(require_roles("admin", "hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rec = await db.get(AttendanceRecord, record_id)
    if not rec:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Record tidak ditemukan")

    user = await db.get(User, rec.user_id)
    if not user or user.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Record tidak ditemukan")

    data = payload.model_dump(exclude_unset=True)
    for field, val in data.items():
        setattr(rec, field, val)

    if "check_in_at" in data and "check_out_at" not in data and rec.check_out_at and rec.check_in_at:
        rec.work_duration = int((rec.check_out_at - rec.check_in_at).total_seconds() // 60)
    if "check_out_at" in data and rec.check_in_at and rec.check_out_at:
        rec.work_duration = int((rec.check_out_at - rec.check_in_at).total_seconds() // 60)
        rec.check_out_method = rec.check_out_method or "override"
    if "check_in_at" in data:
        rec.check_in_method = rec.check_in_method or "override"

    db.add(
        AuditLog(
            user_id=current.id, action="EDIT_ATTENDANCE",
            target_type="attendance", target_id=rec.id,
            extra_meta=data,
        )
    )
    await db.commit()
    await db.refresh(rec, ["user"])
    user = await db.get(User, rec.user_id, options=[selectinload(User.department)])
    return Envelope(data=_record_to_out(rec, user), message="Record diperbarui")


# --- Portal: Absensi Saya (untuk employee) -----------------------------------


@router.get("/my/summary", response_model=Envelope[dict])
async def my_attendance_summary(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    year: int = Query(default_factory=lambda: date.today().year),
    month: int = Query(default_factory=lambda: date.today().month, ge=1, le=12),
):
    """Ringkasan kehadiran bulan ini untuk user yang sedang login."""
    from sqlalchemy import case
    start = date(year, month, 1)
    end = date(year + (month // 12), (month % 12) + 1, 1) - timedelta(days=1)

    rows = (
        await db.execute(
            select(
                func.sum(case((AttendanceRecord.status == "present", 1), else_=0)).label("present"),
                func.sum(case((AttendanceRecord.status == "late", 1), else_=0)).label("late"),
                func.sum(case((AttendanceRecord.status == "excused", 1), else_=0)).label("excused"),
                func.sum(case((AttendanceRecord.status == "absent", 1), else_=0)).label("absent"),
                func.sum(AttendanceRecord.late_minutes).label("total_late_min"),
                func.sum(AttendanceRecord.work_duration).label("total_work_min"),
            )
            .where(
                AttendanceRecord.user_id == current.id,
                AttendanceRecord.attendance_date >= start,
                AttendanceRecord.attendance_date <= end,
            )
        )
    ).one()

    # Hari ini
    today = date.today()
    today_rec = (
        await db.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.user_id == current.id,
                AttendanceRecord.attendance_date == today,
            )
        )
    ).scalar_one_or_none()

    return Envelope(data={
        "period": f"{year}-{month:02d}",
        "present": int(rows.present or 0),
        "late": int(rows.late or 0),
        "excused": int(rows.excused or 0),
        "absent": int(rows.absent or 0),
        "total_late_minutes": int(rows.total_late_min or 0),
        "total_work_minutes": int(rows.total_work_min or 0),
        "today": {
            "status": today_rec.status if today_rec else None,
            "check_in_at": today_rec.check_in_at.isoformat() if today_rec and today_rec.check_in_at else None,
            "check_out_at": today_rec.check_out_at.isoformat() if today_rec and today_rec.check_out_at else None,
            "late_minutes": today_rec.late_minutes if today_rec else 0,
        },
    })


@router.get("/my/records", response_model=Envelope[list[AttendanceRecordOut]])
async def my_attendance_records(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
):
    """Riwayat kehadiran untuk user yang sedang login."""
    stmt = (
        select(AttendanceRecord)
        .where(AttendanceRecord.user_id == current.id)
        .order_by(AttendanceRecord.attendance_date.desc())
    )
    if date_from:
        stmt = stmt.where(AttendanceRecord.attendance_date >= date_from)
    if date_to:
        stmt = stmt.where(AttendanceRecord.attendance_date <= date_to)
    if status_filter:
        stmt = stmt.where(AttendanceRecord.status == status_filter)

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
    rows = (
        await db.execute(stmt.offset((page - 1) * per_page).limit(per_page))
    ).scalars().all()

    return Envelope(
        data=[AttendanceRecordOut.model_validate(r) for r in rows],
        meta=Meta(page=page, per_page=per_page, total=total),
    )


# --- Admin: Mark Absent Job --------------------------------------------------


@router.post("/mark-absent", response_model=Envelope[dict])
async def trigger_mark_absent(
    current: Annotated[User, Depends(require_roles("admin", "hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    target_date: Optional[date] = Query(None, description="Tanggal yang diproses (default: hari ini)"),
):
    """
    Tandai semua user yang belum hadir sebagai absent.
    Biasanya dipanggil otomatis via cron jam 23:00, atau manual oleh admin.
    """
    from app.services.absent_job import mark_absent_for_org
    process_date = target_date or date.today()
    count = await mark_absent_for_org(db, current.org_id, process_date)
    return Envelope(
        data={"date": process_date.isoformat(), "marked_absent": count},
        message=f"{count} user ditandai absent untuk {process_date}",
    )
