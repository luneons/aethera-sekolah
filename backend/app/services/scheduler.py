"""In-process scheduler untuk digest mingguan.

Pakai APScheduler AsyncIOScheduler yang start saat lifespan app.
Job tunggal: tiap Senin 06:00 Asia/Jakarta, kirim digest ke semua org.

Untuk produksi multi-instance, sebaiknya pindah ke external job runner
(systemd timer atau cloud scheduler) supaya tidak duplicate fire.
Untuk single-instance VPS yang sekarang, pendekatan ini cukup.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import AttendanceRecord, Organization, User
from app.services.digest_service import (
    build_digests_for_org,
    send_digest_payload,
)
from app.services.notification_service import notify_user


logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def run_weekly_digest_for_all() -> None:
    """Job: kirim digest ke semua organisasi yang aktif."""
    async with AsyncSessionLocal() as db:
        orgs = (
            await db.execute(select(Organization).where(Organization.is_active == True))  # noqa: E712
        ).scalars().all()

        for org in orgs:
            try:
                payloads = await build_digests_for_org(db, org.id)
                for p in payloads:
                    await send_digest_payload(db, org.id, p)
                logger.info(
                    f"Weekly digest org={org.id} ({org.name}): "
                    f"{sum(1 for p in payloads if p.sent)}/{len(payloads)} sent"
                )
            except Exception as exc:
                logger.exception(f"Weekly digest gagal untuk org {org.id}: {exc}")


async def notify_late_students() -> None:
    """Job harian: cek siswa belum check-in pagi → kirim push.

    Berjalan jam 07:30 hari kerja. Sederhana — cek siswa aktif yang
    hari ini belum punya AttendanceRecord, lalu kirim 1 notif per orang.
    """
    today = date.today()
    if today.weekday() >= 5:  # Sabtu/Minggu skip
        return

    async with AsyncSessionLocal() as db:
        # Semua siswa aktif
        students = (
            await db.execute(
                select(User).where(
                    User.role == "employee",
                    User.status == "active",
                )
            )
        ).scalars().all()
        if not students:
            return

        # Siapa yang sudah absen hari ini
        attended_ids = set(
            (
                await db.execute(
                    select(AttendanceRecord.user_id).where(
                        AttendanceRecord.attendance_date == today
                    )
                )
            ).scalars().all()
        )

        sent = 0
        for s in students:
            if s.id in attended_ids:
                continue
            try:
                await notify_user(
                    db, s.id,
                    title="Belum absen hari ini",
                    body="Sudah jam masuk. Yuk segera scan wajah di sekolah.",
                    category="attendance_reminder",
                    url="/absen",
                    commit=False,
                )
                sent += 1
            except Exception as exc:  # noqa: BLE001
                logger.exception(f"notify_late siswa {s.id}: {exc}")
        try:
            await db.commit()
        except Exception:
            await db.rollback()
        logger.info(f"notify_late_students: {sent} siswa di-reminder ({today})")


async def mark_library_overdue() -> None:
    """Job harian: flip loan dengan due_date lewat → status=overdue."""
    from app.models import LibraryLoan

    async with AsyncSessionLocal() as db:
        today = date.today()
        loans = (
            await db.execute(
                select(LibraryLoan).where(
                    LibraryLoan.status == "borrowed",
                    LibraryLoan.due_date < today,
                )
            )
        ).scalars().all()
        for loan in loans:
            loan.status = "overdue"
        await db.commit()
        if loans:
            logger.info(f"mark_library_overdue: {len(loans)} loan ditandai overdue")


async def remind_upcoming_events() -> None:
    """Job harian: kirim reminder H-1 untuk event dengan requires_rsvp atau audience targeted.

    Reminder ringan ke siswa/guru/ortu sesuai audience event.
    """
    from app.models import (
        EventRSVP, ParentLink, SchoolClass, SchoolEvent, User,
    )
    from app.services.notification_service import notify_users

    async with AsyncSessionLocal() as db:
        now = datetime.now()
        tomorrow_start = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow_end = tomorrow_start + timedelta(days=1)
        events = (
            await db.execute(
                select(SchoolEvent).where(
                    SchoolEvent.start_at >= tomorrow_start,
                    SchoolEvent.start_at < tomorrow_end,
                )
            )
        ).scalars().all()

        for ev in events:
            # Resolve target user_ids per audience
            ustmt = select(User.id).where(User.org_id == ev.org_id, User.status == "active")
            if ev.audience == "siswa":
                ustmt = ustmt.where(User.role == "employee")
            elif ev.audience == "guru":
                ustmt = ustmt.where(User.role.in_(["admin", "hr"]))
            elif ev.audience == "kelas" and ev.target_class_id:
                ustmt = ustmt.where(User.school_class_id == ev.target_class_id)
            elif ev.audience == "ortu":
                # Skip — ortu pakai channel terpisah, tidak perlu push staff
                continue
            target_ids = list((await db.execute(ustmt)).scalars().all())
            if not target_ids:
                continue
            try:
                await notify_users(
                    db, target_ids,
                    title=f"⏰ Besok: {ev.title}",
                    body=f"{ev.start_at.strftime('%d %b %Y, %H:%M')} • {ev.location or 'TBA'}",
                    url="/events",
                    category="event_reminder",
                )
            except Exception:
                logger.exception("Failed remind event %s", ev.id)
        if events:
            logger.info(f"remind_upcoming_events: {len(events)} event diingatkan")


async def cleanup_token_blacklist() -> None:
    """Job mingguan: hapus blacklist entry yang token-nya sudah expire.

    Tidak perlu nyimpan blacklist selamanya — token JWT yang sudah expired
    secara natural di-reject oleh decode_token, jadi entry-nya bisa dibuang.
    """
    from app.models import TokenBlacklist
    from sqlalchemy import delete as sql_delete

    async with AsyncSessionLocal() as db:
        now = datetime.now()
        result = await db.execute(
            sql_delete(TokenBlacklist).where(TokenBlacklist.expires_at < now)
        )
        await db.commit()
        deleted = result.rowcount or 0
        if deleted:
            logger.info(f"cleanup_token_blacklist: {deleted} token kadaluarsa dihapus")


def start_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    sched = AsyncIOScheduler(timezone="Asia/Jakarta")
    # Setiap Senin (day_of_week=0) jam 06:00
    sched.add_job(
        run_weekly_digest_for_all,
        trigger=CronTrigger(day_of_week="mon", hour=6, minute=0),
        id="weekly_digest",
        replace_existing=True,
        misfire_grace_time=60 * 60,  # 1 jam grace kalau VPS sempat off
    )
    # Reminder absen — Senin–Jumat 07:30 Asia/Jakarta
    sched.add_job(
        notify_late_students,
        trigger=CronTrigger(day_of_week="mon-fri", hour=7, minute=30),
        id="late_attendance_reminder",
        replace_existing=True,
        misfire_grace_time=30 * 60,
    )
    # Mark loans overdue — setiap hari 00:05
    sched.add_job(
        mark_library_overdue,
        trigger=CronTrigger(hour=0, minute=5),
        id="library_overdue_mark",
        replace_existing=True,
        misfire_grace_time=60 * 60,
    )
    # Reminder event H-1 — setiap hari 18:00
    sched.add_job(
        remind_upcoming_events,
        trigger=CronTrigger(hour=18, minute=0),
        id="event_reminder",
        replace_existing=True,
        misfire_grace_time=60 * 60,
    )
    # Cleanup token blacklist — tiap Minggu 03:00
    sched.add_job(
        cleanup_token_blacklist,
        trigger=CronTrigger(day_of_week="sun", hour=3, minute=0),
        id="token_blacklist_cleanup",
        replace_existing=True,
        misfire_grace_time=2 * 60 * 60,
    )
    sched.start()
    _scheduler = sched
    logger.info(
        "APScheduler started — 5 jobs: digest, late-reminder, library-overdue, event-reminder, token-cleanup"
    )
    return sched


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("APScheduler stopped")
