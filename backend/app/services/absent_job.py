"""
Absent marking job — tandai semua user yang belum check-in sebagai 'absent'.

Cara pakai:
  1. Panggil manual via API: POST /v1/attendance/mark-absent
  2. Atau setup cron di VPS:
     0 23 * * 1-5 cd /var/www/aethera/backend && .venv/bin/python -m app.services.absent_job

Logika:
  - Ambil semua user aktif di setiap org
  - Cek apakah hari ini adalah hari kerja (berdasarkan WorkSchedule)
  - Jika user belum punya attendance record hari ini → buat record dengan status 'absent'
  - Jika sudah ada record (hadir/terlambat/izin) → skip
"""
from __future__ import annotations

import asyncio
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import AttendanceRecord, Holiday, Organization, User, WorkSchedule


async def mark_absent_for_org(db: AsyncSession, org_id: int, target_date: date) -> int:
    """
    Tandai semua user aktif yang belum hadir sebagai absent.
    Returns: jumlah record absent yang dibuat.
    """
    # Cek apakah hari ini hari libur
    holiday = (
        await db.execute(
            select(Holiday).where(
                Holiday.date == target_date,
                (Holiday.org_id == org_id) | (Holiday.org_id.is_(None)),
            )
        )
    ).scalar_one_or_none()
    if holiday:
        return 0  # Hari libur, skip

    # Cek apakah hari ini hari kerja berdasarkan jadwal
    today_weekday = target_date.strftime("%a")  # Mon, Tue, Wed, Thu, Fri
    schedules = (
        await db.execute(
            select(WorkSchedule).where(WorkSchedule.org_id == org_id)
        )
    ).scalars().all()

    is_work_day = False
    if schedules:
        for s in schedules:
            if s.work_days and today_weekday in s.work_days:
                is_work_day = True
                break
        if not is_work_day:
            return 0  # Bukan hari kerja
    else:
        # Tidak ada jadwal → default Senin-Jumat
        if target_date.weekday() >= 5:  # Sabtu=5, Minggu=6
            return 0

    # Ambil semua user aktif di org ini
    users = (
        await db.execute(
            select(User).where(
                User.org_id == org_id,
                User.status == "active",
                User.role == "employee",  # Hanya employee, bukan admin/hr
            )
        )
    ).scalars().all()

    count = 0
    for user in users:
        # Cek apakah sudah ada record hari ini
        existing = (
            await db.execute(
                select(AttendanceRecord).where(
                    AttendanceRecord.user_id == user.id,
                    AttendanceRecord.attendance_date == target_date,
                )
            )
        ).scalar_one_or_none()

        if existing is None:
            # Buat record absent
            record = AttendanceRecord(
                user_id=user.id,
                attendance_date=target_date,
                status="absent",
                late_minutes=0,
                check_in_method="face",  # default, tidak dipakai untuk absent
            )
            db.add(record)
            count += 1

    if count > 0:
        await db.commit()

    return count


async def run_absent_job(target_date: date | None = None) -> dict:
    """
    Jalankan job absent marking untuk semua organisasi.
    target_date: tanggal yang akan diproses (default: hari ini)
    """
    if target_date is None:
        target_date = date.today()

    results = {}
    async with AsyncSessionLocal() as db:
        orgs = (await db.execute(select(Organization).where(Organization.is_active == True))).scalars().all()  # noqa: E712
        for org in orgs:
            count = await mark_absent_for_org(db, org.id, target_date)
            results[org.name] = count
            if count > 0:
                print(f"[AbsentJob] {org.name}: {count} user ditandai absent ({target_date})")

    return results


if __name__ == "__main__":
    # Jalankan langsung: python -m app.services.absent_job
    import sys
    target = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else date.today()
    print(f"[AbsentJob] Menjalankan untuk tanggal: {target}")
    results = asyncio.run(run_absent_job(target))
    total = sum(results.values())
    print(f"[AbsentJob] Selesai. Total absent: {total}")
    for org, count in results.items():
        print(f"  {org}: {count}")
