"""Gamification engine: XP, level, quest, daily recap.

Layer ini sengaja stateless di luar database (kecuali XP cache di
DisciplineProfile). Quest dan recap dihitung on-demand dari attendance
+ insiden — tidak butuh tabel quest baru karena semua input sudah
ada. Ini juga berarti rule bisa di-tweak tanpa migrasi DB.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AttendanceRecord,
    DisciplineIncident,
    DisciplineProfile,
    User,
)


# ── XP & Level System ──────────────────────────────────────────────────────

# Sumber XP. Sengaja sederhana — bisa di-tune lewat config nanti.
XP_PER_PRESENT = 10           # Hadir tepat waktu
XP_PER_EARLY = 5              # Bonus tambahan kalau datang >= 5 menit lebih awal
XP_PER_LATE = 2               # Tetap kasih sedikit (datang lebih baik daripada tidak)
XP_PER_APPRECIATION = 15      # Kena apresiasi
XP_STREAK_BONUS_PER_DAY = 1   # Per hari dalam streak aktif


@dataclass(frozen=True)
class Level:
    code: str
    title: str
    min_xp: int
    color: str  # tailwind classes hint


LEVELS: tuple[Level, ...] = (
    Level("pemula", "Pemula", 0, "bg-slate-500/20 text-slate-300 border-slate-500/40"),
    Level("rajin", "Rajin", 200, "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"),
    Level("konsisten", "Konsisten", 600, "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"),
    Level("teladan", "Teladan", 1200, "bg-violet-500/20 text-violet-300 border-violet-500/40"),
    Level("master", "Master Disiplin", 2400, "bg-amber-500/20 text-amber-300 border-amber-500/40"),
    Level("legend", "Legendaris", 4000, "bg-rose-500/20 text-rose-300 border-rose-500/40"),
)


def level_for_xp(xp: int) -> tuple[Level, Level | None, float]:
    """Return (level_now, next_level_or_none, progress_0_to_1)."""
    current = LEVELS[0]
    nxt: Level | None = None
    for idx, lvl in enumerate(LEVELS):
        if xp >= lvl.min_xp:
            current = lvl
            nxt = LEVELS[idx + 1] if idx + 1 < len(LEVELS) else None
        else:
            break

    if nxt is None:
        return current, None, 1.0
    span = nxt.min_xp - current.min_xp
    progress = max(0.0, min(1.0, (xp - current.min_xp) / span)) if span > 0 else 1.0
    return current, nxt, progress


async def compute_xp(db: AsyncSession, user_id: int, *, days: int = 60) -> int:
    """Hitung XP total dari riwayat 60 hari terakhir.

    Bobot:
        - Hadir tepat waktu : XP_PER_PRESENT
        - Bonus datang awal : XP_PER_EARLY (kalau offset <= -5 menit)
        - Telat             : XP_PER_LATE
        - Apresiasi         : XP_PER_APPRECIATION per insiden
        - Streak bonus      : XP_STREAK_BONUS_PER_DAY per hari aktif
    """
    cutoff = date.today() - timedelta(days=days)

    att_rows = (
        await db.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.user_id == user_id,
                AttendanceRecord.attendance_date >= cutoff,
            )
        )
    ).scalars().all()

    xp = 0
    for r in att_rows:
        if r.status == "present":
            xp += XP_PER_PRESENT
            if r.check_in_at:
                # Ambil offset relatif jam 7 (asumsi default), bonus kalau awal.
                ref = datetime.combine(r.attendance_date, datetime.min.time()).replace(hour=7)
                offset_min = (r.check_in_at - ref).total_seconds() / 60
                if offset_min <= -5:
                    xp += XP_PER_EARLY
        elif r.status == "late":
            xp += XP_PER_LATE

    apresiasi_count = (
        await db.execute(
            select(DisciplineIncident).where(
                DisciplineIncident.user_id == user_id,
                DisciplineIncident.kind == "adjustment",
                DisciplineIncident.appreciation_delta > 0,
                DisciplineIncident.incident_date >= cutoff,
            )
        )
    ).scalars().all()
    xp += len(apresiasi_count) * XP_PER_APPRECIATION

    # Streak bonus dihitung dari profile (sudah di-recalc oleh discipline_service)
    profile = (
        await db.execute(
            select(DisciplineProfile).where(DisciplineProfile.user_id == user_id)
        )
    ).scalar_one_or_none()
    if profile:
        xp += profile.streak_days * XP_STREAK_BONUS_PER_DAY

    return max(0, xp)


# ── Quest Engine ───────────────────────────────────────────────────────────

@dataclass
class Quest:
    code: str
    title: str
    description: str
    icon: str          # lucide icon name (frontend mapping)
    progress: int      # nilai sekarang
    target: int
    reward_xp: int
    completed: bool

    @property
    def percent(self) -> float:
        if self.target == 0:
            return 1.0
        return min(1.0, self.progress / self.target)


async def build_weekly_quests(db: AsyncSession, user_id: int) -> list[Quest]:
    """Hitung progres 4 quest mingguan dari Senin minggu berjalan.

    Quest sengaja generic & deterministic — tidak butuh tabel khusus.
    """
    today = date.today()
    monday = today - timedelta(days=today.weekday())  # Senin minggu ini

    att = (
        await db.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.user_id == user_id,
                AttendanceRecord.attendance_date >= monday,
                AttendanceRecord.attendance_date <= today,
            )
        )
    ).scalars().all()

    present_count = sum(1 for r in att if r.status == "present")
    early_count = 0
    for r in att:
        if r.check_in_at and r.status in ("present", "late"):
            ref = datetime.combine(r.attendance_date, datetime.min.time()).replace(hour=6, minute=45)
            if r.check_in_at <= ref:
                early_count += 1

    apresiasi_this_week = (
        await db.execute(
            select(DisciplineIncident).where(
                DisciplineIncident.user_id == user_id,
                DisciplineIncident.kind == "adjustment",
                DisciplineIncident.appreciation_delta > 0,
                DisciplineIncident.incident_date >= monday,
            )
        )
    ).scalars().all()

    no_penalty_this_week = (
        await db.execute(
            select(DisciplineIncident).where(
                DisciplineIncident.user_id == user_id,
                DisciplineIncident.kind == "penalty",
                DisciplineIncident.incident_date >= monday,
            )
        )
    ).scalars().all()
    days_clean = (today - monday).days + 1
    clean_progress = days_clean if not no_penalty_this_week else 0

    quests = [
        Quest(
            code="weekly_attendance",
            title="Hadir 5 Hari",
            description="Hadir di sekolah Senin–Jumat minggu ini",
            icon="calendar-check",
            progress=min(present_count, 5),
            target=5,
            reward_xp=50,
            completed=present_count >= 5,
        ),
        Quest(
            code="weekly_early_bird",
            title="Datang Subuh 3x",
            description="Datang sebelum 06:45 sebanyak 3 kali",
            icon="sunrise",
            progress=min(early_count, 3),
            target=3,
            reward_xp=40,
            completed=early_count >= 3,
        ),
        Quest(
            code="weekly_appreciation",
            title="Dapat Apresiasi",
            description="Dapat 1 poin apresiasi dari guru minggu ini",
            icon="heart-handshake",
            progress=min(len(apresiasi_this_week), 1),
            target=1,
            reward_xp=60,
            completed=len(apresiasi_this_week) >= 1,
        ),
        Quest(
            code="weekly_no_penalty",
            title="Bersih Senin–Jumat",
            description="Tidak ada catatan pelanggaran sepanjang minggu",
            icon="shield-check",
            progress=clean_progress,
            target=5,
            reward_xp=80,
            completed=clean_progress >= 5,
        ),
    ]
    return quests


# ── Daily Recap ────────────────────────────────────────────────────────────

@dataclass
class DailyRecap:
    today_status: str | None       # 'present' | 'late' | 'absent' | None
    arrival_offset_min: int | None # negatif = lebih awal
    class_rank_today: int | None   # peringkat datang di kelas hari ini
    class_size_today: int | None
    streak_days: int
    days_to_next_badge: int | None
    next_badge_code: str | None
    headline: str                  # kalimat sapaan unggulan untuk display


async def build_daily_recap(
    db: AsyncSession, user: User
) -> DailyRecap:
    """Mini-Wrapped harian. Headline-nya yang dipakai TTS di kiosk.

    Strategi: kalkulasi dari data yang sudah ada — ga butuh tabel baru.
    """
    today = date.today()

    profile = (
        await db.execute(
            select(DisciplineProfile).where(DisciplineProfile.user_id == user.id)
        )
    ).scalar_one_or_none()

    today_rec = (
        await db.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.user_id == user.id,
                AttendanceRecord.attendance_date == today,
            )
        )
    ).scalar_one_or_none()

    arrival_offset = None
    today_status = today_rec.status if today_rec else None
    if today_rec and today_rec.check_in_at:
        ref = datetime.combine(today, datetime.min.time()).replace(hour=7)
        arrival_offset = int((today_rec.check_in_at - ref).total_seconds() // 60)

    # Peringkat datang di kelas hari ini (siapa lebih dulu masuk)
    rank_today: int | None = None
    class_size: int | None = None
    if today_rec and today_rec.check_in_at and user.school_class_id:
        peers_today = (
            await db.execute(
                select(AttendanceRecord, User)
                .join(User, User.id == AttendanceRecord.user_id)
                .where(
                    AttendanceRecord.attendance_date == today,
                    AttendanceRecord.check_in_at.isnot(None),
                    User.school_class_id == user.school_class_id,
                )
                .order_by(AttendanceRecord.check_in_at)
            )
        ).all()
        all_class_size = (
            await db.execute(
                select(User).where(
                    User.school_class_id == user.school_class_id,
                    User.role == "employee",
                    User.status == "active",
                )
            )
        ).scalars().all()
        class_size = len(all_class_size)
        for idx, (rec, _u) in enumerate(peers_today):
            if rec.user_id == user.id:
                rank_today = idx + 1
                break

    # Days to next badge — pakai streak progress menuju 30 (perfect_attendance)
    streak = profile.streak_days if profile else 0
    days_to_next: int | None = None
    next_badge: str | None = None
    if streak < 30:
        days_to_next = 30 - streak
        next_badge = "perfect_attendance"

    # Headline untuk TTS
    name_first = user.full_name.split()[0]
    if today_status == "present" and arrival_offset is not None and arrival_offset <= -5:
        headline = (
            f"Selamat pagi {name_first}, kamu hadir {abs(arrival_offset)} menit lebih awal hari ini. Keren!"
        )
    elif today_status == "present":
        headline = f"Selamat pagi {name_first}, kamu hadir tepat waktu hari ini."
    elif today_status == "late":
        headline = f"Selamat pagi {name_first}, hari ini kamu tercatat terlambat. Besok lebih semangat ya."
    else:
        # Belum absen — saat dipanggil di kiosk, biasanya status sudah ke-set.
        headline = f"Selamat datang {name_first}."

    if rank_today and rank_today <= 3:
        headline += f" Kamu siswa ke-{rank_today} yang masuk di {user.school_class.name}." if user.school_class else ""

    return DailyRecap(
        today_status=today_status,
        arrival_offset_min=arrival_offset,
        class_rank_today=rank_today,
        class_size_today=class_size,
        streak_days=streak,
        days_to_next_badge=days_to_next,
        next_badge_code=next_badge,
        headline=headline,
    )


# ── Persist ────────────────────────────────────────────────────────────────


async def refresh_xp_cache(db: AsyncSession, user_id: int) -> tuple[int, str]:
    """Hitung XP & simpan ke profile cache. Return (xp, level_code)."""
    xp = await compute_xp(db, user_id)
    lvl, _, _ = level_for_xp(xp)
    profile = (
        await db.execute(
            select(DisciplineProfile).where(DisciplineProfile.user_id == user_id)
        )
    ).scalar_one_or_none()
    if profile:
        profile.xp_total = xp
        profile.level_code = lvl.code
        await db.flush()
    return xp, lvl.code
