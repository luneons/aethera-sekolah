"""Discipline & gamification services (SIMMICO module).

Mengurus:
- Hitung ulang ringkasan profil siswa berdasarkan list insiden.
- Tetapkan badge visual sesuai threshold.
- Build leaderboard untuk 3 kategori (gpa, punctuality, appreciation).
- Build trend mingguan dari insiden (untuk chart).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    AttendanceRecord,
    DisciplineIncident,
    DisciplineProfile,
    SchoolClass,
    User,
)


BADGE_RULES = (
    ("perfect_attendance", lambda p: p.streak_days >= 30),
    ("top_scorer", lambda p: p.gpa >= 90),
    ("social_hero", lambda p: p.appreciation_points >= 100),
    ("early_bird", lambda p: p.avg_arrival_offset_min <= -10),
    ("rising_star", lambda p: p.attitude_points >= 95 and p.gpa >= 85),
    ("comeback_kid", lambda p: 90 <= p.attitude_points < 100 and p.appreciation_points >= 60),
)


async def get_or_create_profile(
    db: AsyncSession, user_id: int, *, default_gpa: float = 80.0
) -> DisciplineProfile:
    profile = (
        await db.execute(select(DisciplineProfile).where(DisciplineProfile.user_id == user_id))
    ).scalar_one_or_none()
    if profile:
        return profile
    profile = DisciplineProfile(
        user_id=user_id,
        gpa=default_gpa,
        attitude_points=100,
        appreciation_points=0,
        kersos_hours_owed=0,
        lembur_hours_owed=0,
        avg_arrival_offset_min=0.0,
        streak_days=0,
        badges_json="",
    )
    db.add(profile)
    await db.flush()
    return profile


def compute_badges(profile: DisciplineProfile) -> list[str]:
    return [code for code, predicate in BADGE_RULES if predicate(profile)]


def parse_badges(profile: DisciplineProfile) -> list[str]:
    if not profile.badges_json:
        return []
    return [b.strip() for b in profile.badges_json.split(",") if b.strip()]


async def recalculate_profile(db: AsyncSession, user_id: int) -> DisciplineProfile:
    """Hitung ulang profil dari semua insiden + data attendance.

    GPA dianggap "starting baseline" yang ditentukan saat seed atau
    update manual. Yang dihitung dinamis: poin sikap, apresiasi,
    hutang jam, rata-rata offset kedatangan, streak.
    """
    profile = await get_or_create_profile(db, user_id)

    incidents = (
        await db.execute(
            select(DisciplineIncident)
            .where(DisciplineIncident.user_id == user_id)
            .order_by(DisciplineIncident.incident_date)
        )
    ).scalars().all()

    attitude = 100
    appreciation = 0
    kersos_owed = 0
    lembur_owed = 0
    for inc in incidents:
        attitude += inc.attitude_delta
        appreciation += inc.appreciation_delta
        kersos_owed += inc.kersos_delta
        lembur_owed += inc.lembur_delta

    # Bound values
    attitude = max(0, min(100, attitude))
    appreciation = max(0, appreciation)
    kersos_owed = max(0, kersos_owed)
    lembur_owed = max(0, lembur_owed)

    # Hitung dari attendance (30 hari terakhir): rata-rata offset, streak
    today = date.today()
    cutoff = today - timedelta(days=30)
    att_rows = (
        await db.execute(
            select(AttendanceRecord)
            .where(
                AttendanceRecord.user_id == user_id,
                AttendanceRecord.attendance_date >= cutoff,
            )
            .order_by(AttendanceRecord.attendance_date.desc())
        )
    ).scalars().all()

    offsets = []
    streak = 0
    streak_locked = False
    for r in att_rows:
        if r.check_in_at and r.attendance_date.weekday() < 5:
            scheduled_in = datetime.combine(r.attendance_date, datetime.min.time()).replace(hour=7)
            offset_min = int((r.check_in_at - scheduled_in).total_seconds() // 60)
            offsets.append(offset_min)
            if r.status == "present" and not streak_locked:
                streak += 1
            else:
                streak_locked = True
        else:
            streak_locked = True

    profile.attitude_points = attitude
    profile.appreciation_points = appreciation
    profile.kersos_hours_owed = kersos_owed
    profile.lembur_hours_owed = lembur_owed
    profile.avg_arrival_offset_min = (sum(offsets) / len(offsets)) if offsets else 0.0
    profile.streak_days = streak
    profile.badges_json = ",".join(compute_badges(profile))
    profile.updated_at = datetime.utcnow()
    await db.flush()
    return profile


async def build_trend(
    db: AsyncSession, user_id: int, weeks: int = 6
) -> list[dict]:
    """Trend per minggu untuk chart (attitude & appreciation).

    Mulai dari poin baseline 100 / 0, jalankan kumulatif berdasarkan
    insiden, lalu sample tiap minggu mundur.
    """
    incidents = (
        await db.execute(
            select(DisciplineIncident)
            .where(DisciplineIncident.user_id == user_id)
            .order_by(DisciplineIncident.incident_date)
        )
    ).scalars().all()

    today = date.today()
    starts = [today - timedelta(days=7 * (weeks - i - 1)) for i in range(weeks)]

    points: list[dict] = []
    for idx, week_end in enumerate(starts):
        attitude = 100
        appreciation = 0
        for inc in incidents:
            if inc.incident_date <= week_end:
                attitude += inc.attitude_delta
                appreciation += inc.appreciation_delta
        attitude = max(0, min(100, attitude))
        appreciation = max(0, appreciation)
        label = "Now" if idx == weeks - 1 else f"M-{weeks - idx - 1}"
        points.append({"week": label, "attitude": attitude, "appreciation": appreciation})
    return points


async def apply_incident(
    db: AsyncSession, incident: DisciplineIncident
) -> DisciplineProfile:
    """Persist incident dan refresh profile."""
    db.add(incident)
    await db.flush()
    return await recalculate_profile(db, incident.user_id)


# ─── Leaderboard query helpers ──────────────────────────────────────────────


async def fetch_students_with_profile(
    db: AsyncSession, *, org_id: int, class_filter: str | None = None
) -> list[tuple[User, DisciplineProfile]]:
    stmt = (
        select(User, DisciplineProfile)
        .join(DisciplineProfile, DisciplineProfile.user_id == User.id)
        .where(User.org_id == org_id, User.role == "employee", User.status == "active")
        .options(selectinload(User.school_class))
    )
    if class_filter:
        stmt = stmt.join(SchoolClass, SchoolClass.id == User.school_class_id).where(
            SchoolClass.name == class_filter
        )
    rows = (await db.execute(stmt)).all()
    return [(u, p) for u, p in rows]


def sort_leaderboard(
    pool: list[tuple[User, DisciplineProfile]],
    category: str,
    limit: int = 10,
) -> list[dict]:
    if category == "gpa":
        ordered = sorted(pool, key=lambda x: x[1].gpa, reverse=True)
        label = "Rata-Rata Nilai"
        getter = lambda u, p: p.gpa
    elif category == "punctuality":
        ordered = sorted(
            pool,
            key=lambda x: (x[1].avg_arrival_offset_min, -x[1].streak_days),
        )
        label = "Menit Lebih Awal (Rata-rata)"
        getter = lambda u, p: -p.avg_arrival_offset_min
    else:  # appreciation
        ordered = sorted(pool, key=lambda x: x[1].appreciation_points, reverse=True)
        label = "Poin Apresiasi"
        getter = lambda u, p: p.appreciation_points

    out: list[dict] = []
    for idx, (user, profile) in enumerate(ordered[:limit]):
        out.append({
            "rank": idx + 1,
            "student_id": user.id,
            "full_name": user.full_name,
            "class_name": user.school_class.name if user.school_class else None,
            "photo_url": user.photo_url,
            "badges": parse_badges(profile),
            "primary_value": float(getter(user, profile)),
            "primary_label": label,
        })
    return out



# ─── Class Leaderboard ──────────────────────────────────────────────────────


def aggregate_classes(
    pool: list[tuple[User, DisciplineProfile]],
) -> list[dict]:
    """Aggregate per kelas dari pool (student, profile).

    Skor komposit dirancang supaya kelas dengan siswa-siswa yang
    konsisten bagus akan unggul:
      - GPA rata-rata        bobot 30%
      - Sikap rata-rata      bobot 30%
      - Apresiasi rata-rata  bobot 20%  (dinormalisasi)
      - Ketepatan rata-rata  bobot 20%  (semakin negatif = lebih awal)
    """
    grouped: dict[int, dict] = defaultdict(
        lambda: {
            "class_id": 0,
            "class_name": "—",
            "grade": None,
            "major": None,
            "homeroom_teacher": None,
            "students": [],
        }
    )

    for user, profile in pool:
        if not user.school_class:
            continue
        cls = user.school_class
        bucket = grouped[cls.id]
        bucket["class_id"] = cls.id
        bucket["class_name"] = cls.name
        bucket["grade"] = cls.grade
        bucket["major"] = cls.major
        bucket["homeroom_teacher"] = cls.homeroom_teacher
        bucket["students"].append((user, profile))

    out: list[dict] = []
    for entry in grouped.values():
        students = entry["students"]
        if not students:
            continue
        n = len(students)
        avg_gpa = sum(p.gpa for _, p in students) / n
        avg_attitude = sum(p.attitude_points for _, p in students) / n
        total_apr = sum(p.appreciation_points for _, p in students)
        avg_apr = total_apr / n
        avg_punc = sum(p.avg_arrival_offset_min for _, p in students) / n

        # Normalisasi (clamp 0..100):
        # - apresiasi: 50 pt rata-rata = 100, dipotong 2x
        # - punctuality: -10 menit (lebih awal) = 100, +10 menit = 0
        apr_norm = max(0.0, min(100.0, avg_apr * 2))
        punc_norm = max(0.0, min(100.0, 50.0 - avg_punc * 5))

        composite = (
            avg_gpa * 0.30
            + avg_attitude * 0.30
            + apr_norm * 0.20
            + punc_norm * 0.20
        )

        # Top student dalam kelas ini berdasarkan skor individu sederhana
        top = max(
            students,
            key=lambda sp: sp[1].gpa * 0.4
            + sp[1].attitude_points * 0.4
            + sp[1].appreciation_points * 0.2,
        )
        out.append({
            "class_id": entry["class_id"],
            "class_name": entry["class_name"],
            "grade": entry["grade"],
            "major": entry["major"],
            "homeroom_teacher": entry["homeroom_teacher"],
            "student_count": n,
            "avg_gpa": round(avg_gpa, 2),
            "avg_attitude": round(avg_attitude, 2),
            "total_appreciation": total_apr,
            "avg_punctuality_min": round(avg_punc, 2),
            "composite_score": round(composite, 2),
            "top_student": top[0].full_name,
            "top_student_id": top[0].id,
        })

    out.sort(key=lambda x: x["composite_score"], reverse=True)
    for idx, item in enumerate(out):
        item["rank"] = idx + 1
    return out
