"""Chat service — keamanan, filter konten, validasi peserta.

Aturan keamanan yang di-enforce di sini:
1. Siswa hanya bisa chat dengan guru/staff (bukan sesama siswa)
2. Filter kata kasar/trigger (blacklist)
3. Rate limiting: max 10 pesan per menit per user
4. Max panjang pesan: 1000 karakter
5. Siswa yang di-mute tidak bisa kirim pesan
6. Kata trigger (bullying, kekerasan) otomatis flag pesan untuk review BK
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChatMessage, ChatMute, ChatRoom, User


# ── Blacklist & Trigger Words ────────────────────────────────────────────────

# Kata yang langsung ditolak (tidak bisa dikirim sama sekali)
BLOCKED_WORDS = {
    # Kata kasar umum (sensor)
    "anjing", "babi", "bangsat", "bajingan", "kontol", "memek", "ngentot",
    "jancok", "asu", "goblok", "tolol", "idiot", "bodoh",
    # Konten tidak pantas
    "porn", "bokep", "sex", "nude", "naked",
}

# Kata yang memicu flag untuk review BK (pesan tetap terkirim tapi di-flag)
TRIGGER_WORDS = {
    # Bullying
    "bully", "bully", "ejek", "hina", "lecehkan", "perundungan",
    # Kekerasan
    "bunuh", "pukul", "hajar", "gebuk", "ancam", "ancaman",
    # Self-harm
    "bunuh diri", "mati aja", "mati saja", "ingin mati",
    # Konten sensitif
    "narkoba", "miras", "rokok", "mabuk",
}

# Pola regex untuk deteksi lebih lanjut
PHONE_PATTERN = re.compile(r'(\+62|08)\d{8,12}')
URL_PATTERN = re.compile(r'https?://\S+|www\.\S+')


def check_content(body: str) -> tuple[bool, Optional[str], bool, Optional[str]]:
    """Validasi konten pesan.

    Return: (is_blocked, block_reason, should_flag, flag_reason)
    """
    body_lower = body.lower()

    # Cek blocked words
    for word in BLOCKED_WORDS:
        if word in body_lower:
            return True, f"Pesan mengandung kata yang tidak diperbolehkan", False, None

    # Cek URL (siswa tidak boleh kirim link)
    if URL_PATTERN.search(body):
        return True, "Pengiriman link tidak diperbolehkan", False, None

    # Cek nomor HP (mencegah sharing kontak)
    if PHONE_PATTERN.search(body):
        return True, "Pengiriman nomor telepon tidak diperbolehkan", False, None

    # Cek trigger words (flag untuk review)
    triggered = []
    for word in TRIGGER_WORDS:
        if word in body_lower:
            triggered.append(word)

    if triggered:
        return False, None, True, f"Kata sensitif terdeteksi: {', '.join(triggered[:3])}"

    return False, None, False, None


def check_content_for_staff(body: str) -> tuple[bool, Optional[str]]:
    """Validasi konten untuk guru/staff — lebih longgar, hanya cek yang paling kasar."""
    body_lower = body.lower()
    for word in list(BLOCKED_WORDS)[:8]:  # hanya kata paling kasar
        if word in body_lower:
            return True, "Pesan mengandung kata yang tidak diperbolehkan"
    return False, None


# ── Rate Limiting ────────────────────────────────────────────────────────────

# In-memory rate limit (per user_id → list of timestamps)
# Untuk production multi-instance, pindah ke Redis.
_rate_limit_store: dict[int, list[datetime]] = {}
RATE_LIMIT_MAX = 10
RATE_LIMIT_WINDOW_SEC = 60


def check_rate_limit(user_id: int) -> bool:
    """Return True kalau masih dalam batas, False kalau sudah melebihi."""
    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=RATE_LIMIT_WINDOW_SEC)

    if user_id not in _rate_limit_store:
        _rate_limit_store[user_id] = []

    # Hapus timestamps lama
    _rate_limit_store[user_id] = [
        t for t in _rate_limit_store[user_id] if t > cutoff
    ]

    if len(_rate_limit_store[user_id]) >= RATE_LIMIT_MAX:
        return False

    _rate_limit_store[user_id].append(now)
    return True


# ── Participant Validation ───────────────────────────────────────────────────


async def validate_chat_participants(
    db: AsyncSession,
    sender: User,
    recipient: User,
) -> tuple[bool, Optional[str]]:
    """Validasi apakah dua user boleh chat.

    Aturan:
    - Harus satu organisasi
    - Siswa (employee) hanya bisa chat dengan guru/staff
    - Siswa tidak bisa chat dengan sesama siswa
    """
    if sender.org_id != recipient.org_id:
        return False, "Tidak bisa chat dengan pengguna dari sekolah lain"

    if sender.role == "employee" and recipient.role == "employee":
        return False, "Siswa tidak bisa chat dengan sesama siswa"

    if recipient.status != "active":
        return False, "Pengguna tidak aktif"

    return True, None


async def get_or_create_room(
    db: AsyncSession,
    org_id: int,
    user_a_id: int,
    user_b_id: int,
) -> ChatRoom:
    """Ambil atau buat room chat antara dua user.

    Canonical order: participant_a_id < participant_b_id.
    """
    a_id = min(user_a_id, user_b_id)
    b_id = max(user_a_id, user_b_id)

    room = (
        await db.execute(
            select(ChatRoom).where(
                ChatRoom.participant_a_id == a_id,
                ChatRoom.participant_b_id == b_id,
            )
        )
    ).scalar_one_or_none()

    if room:
        return room

    room = ChatRoom(
        org_id=org_id,
        participant_a_id=a_id,
        participant_b_id=b_id,
    )
    db.add(room)
    await db.flush()
    return room


async def is_user_muted(db: AsyncSession, user_id: int) -> bool:
    """Cek apakah user sedang di-mute."""
    mute = (
        await db.execute(
            select(ChatMute).where(ChatMute.user_id == user_id)
        )
    ).scalar_one_or_none()

    if not mute:
        return False

    # Cek apakah mute sudah expired
    if mute.expires_at and mute.expires_at < datetime.utcnow():
        await db.delete(mute)
        await db.flush()
        return False

    return True


async def get_unread_count(
    db: AsyncSession, user_id: int, room_id: int, last_read_at: Optional[datetime]
) -> int:
    """Hitung pesan belum dibaca di room tertentu."""
    stmt = (
        select(func.count())
        .select_from(ChatMessage)
        .where(
            ChatMessage.room_id == room_id,
            ChatMessage.sender_id != user_id,
            ChatMessage.is_deleted == False,  # noqa: E712
        )
    )
    if last_read_at:
        stmt = stmt.where(ChatMessage.created_at > last_read_at)
    return (await db.execute(stmt)).scalar_one() or 0
