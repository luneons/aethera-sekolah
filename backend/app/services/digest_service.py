"""Weekly digest service.

Generate ringkasan minggu lalu untuk dikirim ke wali kelas, BK, dan
kepsek tiap Senin pagi. Konten beda per role:
  - Wali kelas: ringkasan kelasnya saja
  - BK        : kasus baru, mood agregat, intervensi minggu ini
  - Kepsek    : KPI sekolah-wide, top/bottom kelas

Pengiriman lewat WhatsApp gateway yang sudah ada (Baileys), dengan
fallback log kalau gateway tidak aktif. Email belum dipasang karena
butuh SMTP config terpisah; bisa ditambah nanti tanpa ubah signature.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    AttendanceRecord,
    DisciplineIncident,
    MoodCheckIn,
    Organization,
    PendingApproval,
    SchoolClass,
    User,
)
from app.services.discipline_service import (
    aggregate_classes,
    fetch_students_with_profile,
)
from app.services.whatsapp_service import load_wa_settings, send_whatsapp


logger = logging.getLogger(__name__)


@dataclass
class DigestPayload:
    role: str
    recipient_name: str
    recipient_phone: str | None
    title: str
    body: str
    sent: bool = False
    error: str | None = None


def _week_range(today: date | None = None) -> tuple[date, date]:
    """Range minggu lalu (Senin–Minggu sebelum hari ini)."""
    if today is None:
        today = date.today()
    this_monday = today - timedelta(days=today.weekday())
    last_monday = this_monday - timedelta(days=7)
    last_sunday = this_monday - timedelta(days=1)
    return last_monday, last_sunday


# ─── Per-Role Generators ────────────────────────────────────────────────────


async def _exec_digest_body(db: AsyncSession, org_id: int) -> str:
    """Ringkasan eksekutif minggu lalu untuk kepsek."""
    start, end = _week_range()

    # Stats kehadiran minggu lalu
    att = (
        await db.execute(
            select(
                func.sum(case((AttendanceRecord.status == "present", 1), else_=0)),
                func.sum(case((AttendanceRecord.status == "late", 1), else_=0)),
                func.sum(case((AttendanceRecord.status == "absent", 1), else_=0)),
            )
            .select_from(AttendanceRecord)
            .join(User, User.id == AttendanceRecord.user_id)
            .where(
                User.org_id == org_id,
                AttendanceRecord.attendance_date >= start,
                AttendanceRecord.attendance_date <= end,
            )
        )
    ).one()
    present, late, absent = (int(att[0] or 0), int(att[1] or 0), int(att[2] or 0))

    # Insiden minggu lalu
    incidents = (
        await db.execute(
            select(
                func.sum(case((DisciplineIncident.kind == "penalty", 1), else_=0)),
                func.sum(case((DisciplineIncident.kind == "adjustment", 1), else_=0)),
            )
            .select_from(DisciplineIncident)
            .where(
                DisciplineIncident.org_id == org_id,
                DisciplineIncident.incident_date >= start,
                DisciplineIncident.incident_date <= end,
            )
        )
    ).one()
    penalty, adjustment = (int(incidents[0] or 0), int(incidents[1] or 0))

    # Pending approvals saat ini
    pending = (
        await db.execute(
            select(func.count())
            .select_from(PendingApproval)
            .where(
                PendingApproval.org_id == org_id,
                PendingApproval.status == "pending",
            )
        )
    ).scalar_one() or 0

    # Top & bottom 3 kelas berdasarkan profile saat ini
    pool = await fetch_students_with_profile(db, org_id=org_id)
    class_rows = aggregate_classes(pool)
    top3 = class_rows[:3]
    bottom3 = class_rows[-3:][::-1] if len(class_rows) > 3 else []

    body = (
        f"📊 *Ringkasan Sekolah Mingguan*\n"
        f"Periode: {start.strftime('%d/%m')} – {end.strftime('%d/%m/%Y')}\n\n"
        f"*Kehadiran*\n"
        f"  • Hadir tepat waktu: {present}\n"
        f"  • Terlambat: {late}\n"
        f"  • Tidak hadir: {absent}\n\n"
        f"*Disiplin*\n"
        f"  • Pelanggaran tercatat: {penalty}\n"
        f"  • Apresiasi diberikan: {adjustment}\n"
        f"  • Pending persetujuan: {pending}\n\n"
    )
    if top3:
        body += "*Top 3 Kelas Minggu Ini*\n"
        for idx, c in enumerate(top3):
            body += f"  {idx+1}. {c['class_name']} (skor {c['composite_score']:.1f})\n"
        body += "\n"
    if bottom3:
        body += "*Kelas Butuh Perhatian*\n"
        for c in bottom3:
            body += f"  • {c['class_name']} (skor {c['composite_score']:.1f})\n"

    return body


async def _homeroom_digest_body(db: AsyncSession, wali: User) -> str | None:
    """Ringkasan kelas yang dipegang wali kelas."""
    if not wali.homeroom_class_id:
        return None
    cls = await db.get(SchoolClass, wali.homeroom_class_id)
    if not cls:
        return None

    start, end = _week_range()

    students = (
        await db.execute(
            select(User).where(
                User.org_id == wali.org_id,
                User.school_class_id == cls.id,
                User.role == "employee",
                User.status == "active",
            )
        )
    ).scalars().all()
    student_ids = [s.id for s in students]
    student_count = len(student_ids)

    if not student_count:
        return None

    att = (
        await db.execute(
            select(
                func.sum(case((AttendanceRecord.status == "present", 1), else_=0)),
                func.sum(case((AttendanceRecord.status == "late", 1), else_=0)),
                func.sum(case((AttendanceRecord.status == "absent", 1), else_=0)),
            )
            .select_from(AttendanceRecord)
            .where(
                AttendanceRecord.user_id.in_(student_ids),
                AttendanceRecord.attendance_date >= start,
                AttendanceRecord.attendance_date <= end,
            )
        )
    ).one()
    present, late, absent = (int(att[0] or 0), int(att[1] or 0), int(att[2] or 0))

    incidents = (
        await db.execute(
            select(
                func.sum(case((DisciplineIncident.kind == "penalty", 1), else_=0)),
                func.sum(case((DisciplineIncident.kind == "adjustment", 1), else_=0)),
            )
            .select_from(DisciplineIncident)
            .where(
                DisciplineIncident.user_id.in_(student_ids),
                DisciplineIncident.incident_date >= start,
                DisciplineIncident.incident_date <= end,
            )
        )
    ).one()
    penalty, adjustment = (int(incidents[0] or 0), int(incidents[1] or 0))

    body = (
        f"🏫 *Digest Wali Kelas {cls.name}*\n"
        f"Periode: {start.strftime('%d/%m')} – {end.strftime('%d/%m/%Y')}\n\n"
        f"*Kehadiran*\n"
        f"  • Hadir tepat waktu: {present}\n"
        f"  • Terlambat: {late}\n"
        f"  • Tidak hadir: {absent}\n\n"
        f"*Disiplin*\n"
        f"  • Pelanggaran: {penalty}\n"
        f"  • Apresiasi: {adjustment}\n\n"
        f"_Buka aplikasi Aethera untuk lihat detail per siswa._"
    )
    return body


async def _bk_digest_body(db: AsyncSession, org_id: int) -> str:
    """Ringkasan BK: kasus baru + mood + intervensi."""
    start, end = _week_range()

    new_penalties = (
        await db.execute(
            select(func.count())
            .select_from(DisciplineIncident)
            .where(
                DisciplineIncident.org_id == org_id,
                DisciplineIncident.kind == "penalty",
                DisciplineIncident.incident_date >= start,
                DisciplineIncident.incident_date <= end,
            )
        )
    ).scalar_one() or 0

    mood_rows = (
        await db.execute(
            select(MoodCheckIn.mood)
            .join(User, User.id == MoodCheckIn.user_id)
            .where(
                User.org_id == org_id,
                MoodCheckIn.checkin_date >= start,
                MoodCheckIn.checkin_date <= end,
            )
        )
    ).scalars().all()
    mood_count = len(mood_rows)
    avg_mood = sum(mood_rows) / mood_count if mood_count else 0.0
    low_mood = sum(1 for m in mood_rows if m <= 2)

    pool = await fetch_students_with_profile(db, org_id=org_id)
    critical = sum(1 for _, p in pool if p.attitude_points < 40)

    body = (
        f"🩺 *Digest Konseling*\n"
        f"Periode: {start.strftime('%d/%m')} – {end.strftime('%d/%m/%Y')}\n\n"
        f"*Aktivitas Minggu Lalu*\n"
        f"  • Pelanggaran baru: {new_penalties}\n"
        f"  • Mood check-in: {mood_count}\n"
        f"  • Rata-rata mood: {avg_mood:.2f}/5\n"
        f"  • Mood rendah (≤2): {low_mood}\n\n"
        f"*Status Saat Ini*\n"
        f"  • Siswa dengan sikap kritis (<40): {critical}\n\n"
        f"_Buka watch list untuk lihat siapa saja._"
    )
    return body


# ─── Orchestrator ───────────────────────────────────────────────────────────


async def build_digests_for_org(
    db: AsyncSession, org_id: int
) -> list[DigestPayload]:
    """Build semua digest yang perlu dikirim untuk satu organisasi.

    Return list payload — tidak langsung dikirim, supaya pemanggil
    bisa preview dulu (untuk demo) atau kirim batch.
    """
    payloads: list[DigestPayload] = []

    # Cari semua staff
    staff = (
        await db.execute(
            select(User).where(
                User.org_id == org_id,
                User.role.in_(("super_admin", "admin", "hr")),
                User.status == "active",
            )
        )
    ).scalars().all()

    # Generate body per role (only sekali per role kecuali wali kelas yang per orang)
    exec_body: str | None = None
    bk_body: str | None = None

    for staff_user in staff:
        if staff_user.role == "super_admin":
            if exec_body is None:
                exec_body = await _exec_digest_body(db, org_id)
            payloads.append(DigestPayload(
                role="super_admin",
                recipient_name=staff_user.full_name,
                recipient_phone=staff_user.phone,
                title="Ringkasan Sekolah Mingguan",
                body=exec_body,
            ))
        elif staff_user.role == "hr":
            if bk_body is None:
                bk_body = await _bk_digest_body(db, org_id)
            payloads.append(DigestPayload(
                role="hr",
                recipient_name=staff_user.full_name,
                recipient_phone=staff_user.phone,
                title="Digest Konseling Mingguan",
                body=bk_body,
            ))
        elif staff_user.role == "admin" and staff_user.homeroom_class_id:
            body = await _homeroom_digest_body(db, staff_user)
            if body:
                payloads.append(DigestPayload(
                    role="admin",
                    recipient_name=staff_user.full_name,
                    recipient_phone=staff_user.phone,
                    title="Digest Wali Kelas",
                    body=body,
                ))

    return payloads


async def send_digest_payload(
    db: AsyncSession, org_id: int, payload: DigestPayload
) -> DigestPayload:
    """Kirim satu payload via WhatsApp gateway.

    Idempotent — tidak ada side effect di luar pengiriman pesan.
    Jika gateway tidak aktif, error dilog tapi tidak raise.
    """
    settings = await load_wa_settings(db, org_id)
    if not settings or not settings.enabled:
        payload.error = "WhatsApp gateway belum diaktifkan"
        logger.warning(payload.error)
        return payload

    if not payload.recipient_phone:
        payload.error = "Penerima tidak punya nomor HP terdaftar"
        return payload

    api_url = settings.api_url or "http://localhost:3001/send"
    api_token = settings.api_token or ""

    success = await send_whatsapp(
        api_url=api_url,
        api_token=api_token,
        phone=payload.recipient_phone,
        message=payload.body,
    )
    payload.sent = success
    if not success:
        payload.error = "Gagal mengirim via WA gateway"
    return payload
