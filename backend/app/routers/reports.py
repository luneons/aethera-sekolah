"""Reports & analytics endpoints."""
import csv
import io
from datetime import date, datetime, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AttendanceRecord, User
from app.schemas import DailySummary, Envelope, StatsToday, TrendPoint
from app.security import get_current_user, require_roles


router = APIRouter(prefix="/reports", tags=["Reports"])


async def _count_status(db: AsyncSession, org_id: int, day: date, status_value: str) -> int:
    return (
        await db.execute(
            select(func.count(AttendanceRecord.id))
            .join(User, User.id == AttendanceRecord.user_id)
            .where(
                User.org_id == org_id,
                AttendanceRecord.attendance_date == day,
                AttendanceRecord.status == status_value,
            )
        )
    ).scalar() or 0


@router.get("/stats/today", response_model=Envelope[StatsToday])
async def stats_today(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    today = date.today()
    yesterday = today - timedelta(days=1)

    total_employees = (
        await db.execute(
            select(func.count(User.id)).where(
                User.org_id == current.org_id, User.status == "active"
            )
        )
    ).scalar() or 0

    present_today = await _count_status(db, current.org_id, today, "present")
    late_today = await _count_status(db, current.org_id, today, "late")
    present_y = await _count_status(db, current.org_id, yesterday, "present")
    late_y = await _count_status(db, current.org_id, yesterday, "late")

    attended_today = present_today + late_today
    absent_today = max(0, total_employees - attended_today)
    absent_y = max(0, total_employees - (present_y + late_y))

    def pct(now_v: int, prev_v: int) -> float:
        if prev_v == 0:
            return 0.0 if now_v == 0 else 100.0
        return round(((now_v - prev_v) / prev_v) * 100, 1)

    return Envelope(
        data=StatsToday(
            total_employees=total_employees,
            present=present_today,
            late=late_today,
            absent=absent_today,
            delta_present=pct(present_today, present_y),
            delta_late=pct(late_today, late_y),
            delta_absent=pct(absent_today, absent_y),
        )
    )


@router.get("/daily", response_model=Envelope[DailySummary])
async def daily_report(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    target: date = Query(default_factory=date.today, alias="date"),
):
    total = (
        await db.execute(
            select(func.count(User.id)).where(
                User.org_id == current.org_id, User.status == "active"
            )
        )
    ).scalar() or 0
    present = await _count_status(db, current.org_id, target, "present")
    late = await _count_status(db, current.org_id, target, "late")
    excused = await _count_status(db, current.org_id, target, "excused")
    attended = present + late + excused
    absent = max(0, total - attended)

    return Envelope(
        data=DailySummary(
            date=target,
            total_employees=total,
            present=present,
            late=late,
            absent=absent,
            on_leave=excused,
        )
    )


@router.get("/trend", response_model=Envelope[list[TrendPoint]])
async def attendance_trend(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(7, ge=1, le=90),
):
    today = date.today()
    start = today - timedelta(days=days - 1)

    total = (
        await db.execute(
            select(func.count(User.id)).where(
                User.org_id == current.org_id, User.status == "active"
            )
        )
    ).scalar() or 0

    rows = (
        await db.execute(
            select(
                AttendanceRecord.attendance_date.label("d"),
                func.sum(case((AttendanceRecord.status == "present", 1), else_=0)).label("p"),
                func.sum(case((AttendanceRecord.status == "late", 1), else_=0)).label("l"),
            )
            .join(User, User.id == AttendanceRecord.user_id)
            .where(
                User.org_id == current.org_id,
                AttendanceRecord.attendance_date >= start,
                AttendanceRecord.attendance_date <= today,
            )
            .group_by(AttendanceRecord.attendance_date)
        )
    ).all()

    by_date: dict[date, dict] = {r.d: {"present": int(r.p or 0), "late": int(r.l or 0)} for r in rows}
    points: list[TrendPoint] = []
    for i in range(days):
        d = start + timedelta(days=i)
        bucket = by_date.get(d, {"present": 0, "late": 0})
        absent = max(0, total - bucket["present"] - bucket["late"])
        points.append(
            TrendPoint(date=d, present=bucket["present"], late=bucket["late"], absent=absent)
        )
    return Envelope(data=points)


@router.get("/sync-feed", response_model=Envelope[dict])
async def sync_feed(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(8, ge=1, le=50),
):
    """Live data feed untuk widget "Live Sync" di dashboard.

    Return:
      - stats: counter hadir/telat hari ini, total siswa, bytes ke-process
      - recent_events: daftar attendance terakhir, untuk stream log

    Refresh interval di frontend: 5-15 detik. Endpoint ringan supaya
    aman di-poll sering.
    """
    today = date.today()

    total_students = (
        await db.execute(
            select(func.count(User.id)).where(
                User.org_id == current.org_id,
                User.status == "active",
                User.role == "employee",
            )
        )
    ).scalar() or 0

    present_today = await _count_status(db, current.org_id, today, "present")
    late_today = await _count_status(db, current.org_id, today, "late")
    synced_today = present_today + late_today

    # Total snapshot bytes (estimate: avg 80KB per snapshot × jumlah record hari ini × 2 untuk in+out)
    bytes_processed = synced_today * 2 * 80 * 1024

    # Recent events untuk stream log
    # Catatan: MySQL ga support NULLS LAST jadi kita filter dulu records yang punya check_in
    recent = (
        await db.execute(
            select(AttendanceRecord, User)
            .join(User, User.id == AttendanceRecord.user_id)
            .where(
                User.org_id == current.org_id,
                AttendanceRecord.attendance_date == today,
                AttendanceRecord.check_in_at.isnot(None),
            )
            .order_by(AttendanceRecord.check_in_at.desc())
            .limit(limit)
        )
    ).all()

    events = []
    for rec, user in recent:
        # Tampilkan sebagai log: "✓ Check-in 06:42 → Hafiz P. (10 IPA 1)"
        check_time = rec.check_out_at or rec.check_in_at
        if not check_time:
            continue
        action = "Check-out" if rec.check_out_at else "Check-in"
        time_str = check_time.strftime("%H:%M")
        # Initials biar log ringkas
        first = user.full_name.split()[0]
        last_initial = user.full_name.split()[-1][:1] if len(user.full_name.split()) > 1 else ""
        short_name = f"{first} {last_initial}." if last_initial else first
        prefix = "✓" if rec.status != "absent" else "✗"
        suffix = " (telat)" if rec.status == "late" else ""
        events.append({
            "id": rec.id,
            "time": time_str,
            "action": action,
            "user_id": user.id,
            "user_name": short_name,
            "status": rec.status,
            "label": f"{prefix} {action} {time_str} → {short_name}{suffix}",
        })

    return Envelope(data={
        "stats": {
            "total_students": total_students,
            "present_today": present_today,
            "late_today": late_today,
            "synced_records": synced_today,
            "bytes_processed": bytes_processed,
        },
        "recent_events": events,
        "server_time": datetime.now().isoformat(),
    })


@router.get("/monthly")
async def monthly_report(
    current: Annotated[User, Depends(require_roles("admin", "hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    year: int = Query(default_factory=lambda: date.today().year),
    month: int = Query(default_factory=lambda: date.today().month, ge=1, le=12),
):
    start = date(year, month, 1)
    end = date(year + (month // 12), (month % 12) + 1, 1) - timedelta(days=1)

    rows = (
        await db.execute(
            select(
                User.id, User.full_name, User.employee_id,
                func.sum(case((AttendanceRecord.status == "present", 1), else_=0)).label("present"),
                func.sum(case((AttendanceRecord.status == "late", 1), else_=0)).label("late"),
                func.sum(case((AttendanceRecord.status == "excused", 1), else_=0)).label("excused"),
                func.sum(case((AttendanceRecord.status == "absent", 1), else_=0)).label("absent"),
                func.sum(AttendanceRecord.late_minutes).label("total_late_min"),
            )
            .outerjoin(
                AttendanceRecord,
                (AttendanceRecord.user_id == User.id)
                & (AttendanceRecord.attendance_date >= start)
                & (AttendanceRecord.attendance_date <= end),
            )
            .where(User.org_id == current.org_id, User.status == "active")
            .group_by(User.id, User.full_name, User.employee_id)
            .order_by(User.full_name)
        )
    ).all()

    summary = [
        {
            "user_id": r.id,
            "full_name": r.full_name,
            "employee_id": r.employee_id,
            "present": int(r.present or 0),
            "late": int(r.late or 0),
            "excused": int(r.excused or 0),
            "absent": int(r.absent or 0),
            "total_late_minutes": int(r.total_late_min or 0),
        }
        for r in rows
    ]
    return Envelope(data={"period": f"{year}-{month:02d}", "summary": summary})


@router.get("/export")
async def export_csv(
    current: Annotated[User, Depends(require_roles("admin", "hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    date_from: date = Query(..., alias="from"),
    date_to: date = Query(..., alias="to"),
):
    rows = (
        await db.execute(
            select(AttendanceRecord, User)
            .join(User, User.id == AttendanceRecord.user_id)
            .where(
                User.org_id == current.org_id,
                AttendanceRecord.attendance_date >= date_from,
                AttendanceRecord.attendance_date <= date_to,
            )
            .order_by(AttendanceRecord.attendance_date, User.full_name)
        )
    ).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["Tanggal", "NIP", "Nama", "Check-in", "Check-out", "Status", "Terlambat (menit)", "Durasi (menit)"]
    )
    for rec, user in rows:
        writer.writerow(
            [
                rec.attendance_date.isoformat(),
                user.employee_id,
                user.full_name,
                rec.check_in_at.strftime("%H:%M:%S") if rec.check_in_at else "",
                rec.check_out_at.strftime("%H:%M:%S") if rec.check_out_at else "",
                rec.status,
                rec.late_minutes or 0,
                rec.work_duration or 0,
            ]
        )

    buffer.seek(0)
    filename = f"attendance_{date_from}_{date_to}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
