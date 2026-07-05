"""Seed contoh kehadiran realistic untuk SEMUA siswa.

Tujuan: bikin grafik kehadiran (tren mingguan, donut, dll) ada isinya.

Generate kehadiran untuk 60 hari kerja (Senin–Jumat) terakhir, dengan
distribusi:
  - 80% hadir tepat waktu
  - 12% terlambat (5–25 menit)
  - 6% tidak hadir
  - 2% izin

Tiap siswa punya "personality" — siswa rajin lebih sering hadir,
siswa yang sering bermasalah lebih sering telat/absen. Bias ini
membuat data konsisten dengan poin sikap yang sudah ada.

Idempotent: kalau sudah ada record di tanggal tertentu, di-skip.

Jalankan:
  cd backend
  .venv\\Scripts\\python.exe _seed_attendance_demo.py
"""
import asyncio
import random
import sys
from datetime import date, datetime, time, timedelta

from sqlalchemy import select

from app.database import AsyncSessionLocal, engine
from app.models import (
    AttendanceRecord,
    DisciplineProfile,
    Organization,
    User,
    WorkSchedule,
)
from app.services.discipline_service import recalculate_profile


# Konfigurasi window seed
DAYS_BACK = 60                    # 60 hari ke belakang
INCLUDE_TODAY = False             # Hari ini di-skip (biar tidak conflict scan real)
SKIP_WEEKEND = True               # Sabtu, Minggu skip


# Distribusi default
PROBA_DEFAULT = {
    "present": 0.80,
    "late": 0.12,
    "absent": 0.06,
    "excused": 0.02,
}


def get_personality_profile(student_id: int) -> dict:
    """Bias per siswa berdasarkan ID (deterministic)."""
    rng = random.Random(student_id * 991)
    archetype = rng.choice([
        "rajin",       # 90% hadir tepat waktu
        "rajin",       # boost rajin
        "biasa",       # default
        "biasa",
        "biasa",
        "telat",       # 25% telat
        "bolos",       # 15% absen
    ])
    if archetype == "rajin":
        return {"present": 0.92, "late": 0.05, "absent": 0.02, "excused": 0.01}
    if archetype == "telat":
        return {"present": 0.65, "late": 0.25, "absent": 0.07, "excused": 0.03}
    if archetype == "bolos":
        return {"present": 0.62, "late": 0.13, "absent": 0.20, "excused": 0.05}
    return PROBA_DEFAULT.copy()


def pick_status(rng: random.Random, profile: dict) -> str:
    """Pilih status berdasarkan distribusi probability."""
    r = rng.random()
    cumulative = 0.0
    for status, prob in profile.items():
        cumulative += prob
        if r <= cumulative:
            return status
    return "present"


async def main():
    async with AsyncSessionLocal() as db:
        org = (await db.execute(select(Organization))).scalar_one()

        # Cari schedule default (untuk reference jam masuk)
        schedule = (
            await db.execute(
                select(WorkSchedule).where(WorkSchedule.org_id == org.id).limit(1)
            )
        ).scalar_one_or_none()

        check_in_ref = (
            datetime.combine(date.today(), schedule.check_in_end).time()
            if schedule
            else time(7, 30)
        )
        # Reference time = batas akhir on-time (07:30 default sekolah)
        ref_minutes = check_in_ref.hour * 60 + check_in_ref.minute

        students = (
            await db.execute(
                select(User).where(
                    User.org_id == org.id,
                    User.role == "employee",
                    User.status == "active",
                )
            )
        ).scalars().all()

        if not students:
            print("ERROR: Tidak ada siswa aktif.")
            return

        print(f"\n=== Seed Kehadiran ===")
        print(f"Total siswa: {len(students)}")
        print(f"Window: {DAYS_BACK} hari ke belakang (Senin-Jumat)")
        print()

        today = date.today()
        days_to_seed: list[date] = []
        for offset in range(1, DAYS_BACK + 1):
            d = today - timedelta(days=offset)
            if SKIP_WEEKEND and d.weekday() >= 5:
                continue
            days_to_seed.append(d)
        if INCLUDE_TODAY and today.weekday() < 5:
            days_to_seed.insert(0, today)

        print(f"Hari kerja yang di-seed: {len(days_to_seed)}")
        print()

        created = 0
        skipped = 0

        for student in students:
            profile = get_personality_profile(student.id)
            rng = random.Random(student.id * 13 + 7)

            for day in days_to_seed:
                # Skip kalau record sudah ada
                existing = (
                    await db.execute(
                        select(AttendanceRecord).where(
                            AttendanceRecord.user_id == student.id,
                            AttendanceRecord.attendance_date == day,
                        )
                    )
                ).scalar_one_or_none()
                if existing:
                    skipped += 1
                    continue

                status = pick_status(rng, profile)

                # Generate timestamps berdasarkan status
                if status == "present":
                    # Datang 5–15 menit sebelum batas
                    early_min = rng.randint(5, 25)
                    ci_minute = ref_minutes - early_min
                    ci = datetime.combine(day, time(ci_minute // 60, ci_minute % 60))
                    co_offset = rng.randint(-15, 30)
                    co_minute = (14 * 60) + co_offset
                    co = datetime.combine(day, time(co_minute // 60, co_minute % 60))
                    late_min = 0
                elif status == "late":
                    # Datang 5–25 menit setelah batas
                    late_min = rng.randint(5, 30)
                    ci_minute = ref_minutes + late_min
                    ci = datetime.combine(day, time(ci_minute // 60, ci_minute % 60))
                    co_offset = rng.randint(-10, 20)
                    co_minute = (14 * 60) + co_offset
                    co = datetime.combine(day, time(co_minute // 60, co_minute % 60))
                elif status == "excused":
                    ci = None
                    co = None
                    late_min = 0
                else:  # absent
                    ci = None
                    co = None
                    late_min = 0

                duration = None
                if ci and co:
                    duration = int((co - ci).total_seconds() // 60)

                record = AttendanceRecord(
                    user_id=student.id,
                    schedule_id=schedule.id if schedule else None,
                    attendance_date=day,
                    check_in_at=ci,
                    check_out_at=co,
                    check_in_method="face" if ci else "manual",
                    check_out_method="face" if co else None,
                    status=status,
                    late_minutes=late_min,
                    work_duration=duration,
                )
                db.add(record)
                created += 1

            # Commit batch per student supaya ga overflow memory
            await db.flush()

        print(f"  + {created} record dibuat")
        print(f"  . {skipped} skip (sudah ada)")

        # Recompute streak & avg_arrival semua siswa biar profile up-to-date
        print(f"\n  ~ Recomputing discipline profiles...")
        for s in students:
            await recalculate_profile(db, s.id)
        print(f"  ~ Done {len(students)} profiles")

        await db.commit()

        # Summary stats
        total_records = (
            await db.execute(
                select(AttendanceRecord)
                .join(User, User.id == AttendanceRecord.user_id)
                .where(User.org_id == org.id)
            )
        ).all()
        statuses = {"present": 0, "late": 0, "absent": 0, "excused": 0}
        for (rec,) in total_records:
            statuses[rec.status] = statuses.get(rec.status, 0) + 1

        print(f"\n=== Ringkasan Database ===")
        for k, v in statuses.items():
            print(f"  {k:<10}: {v}")
        print(f"  total     : {sum(statuses.values())}")
        print()

    await engine.dispose()


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
