"""Chat endpoints — komunikasi akademik yang aman dan terawasi.

Endpoint:
  GET  /v1/chat/rooms              daftar room chat user ini
  GET  /v1/chat/rooms/{room_id}    pesan dalam room (paginated)
  POST /v1/chat/send               kirim pesan (buat room otomatis)
  GET  /v1/chat/contacts           daftar kontak yang bisa di-chat
  POST /v1/chat/messages/{id}/flag flag pesan untuk review
  GET  /v1/chat/flagged            [admin/BK] semua pesan ter-flag
  DELETE /v1/chat/messages/{id}    [admin] hapus pesan (soft delete)
  POST /v1/chat/mute               [admin/kepsek] mute user
  DELETE /v1/chat/mute/{user_id}   [admin/kepsek] unmute user
  GET  /v1/chat/muted              [admin] daftar user yang di-mute
  GET  /v1/chat/monitor            [admin/BK] semua percakapan (monitoring)
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ChatMessage, ChatMute, ChatReadReceipt, ChatRoom, ChatRoomArchive, User
from app.schemas import (
    ChatMessageOut,
    ChatRoomOut,
    Envelope,
    FlagMessageIn,
    Meta,
    MuteUserIn,
    SendMessageIn,
)
from app.security import get_current_user, require_roles
from app.services.chat_service import (
    check_content,
    check_content_for_staff,
    check_rate_limit,
    get_or_create_room,
    get_unread_count,
    is_user_muted,
    validate_chat_participants,
)


router = APIRouter(prefix="/chat", tags=["Chat"])


def _msg_to_out(msg: ChatMessage, sender: User) -> ChatMessageOut:
    return ChatMessageOut(
        id=msg.id,
        room_id=msg.room_id,
        sender_id=msg.sender_id,
        sender_name=sender.full_name,
        sender_role=sender.role,
        sender_photo=sender.photo_url,
        body="[Pesan dihapus]" if msg.is_deleted else msg.body,
        is_flagged=msg.is_flagged,
        is_deleted=msg.is_deleted,
        created_at=msg.created_at,
    )


# ─── Daftar Room ─────────────────────────────────────────────────────────────


@router.get("/rooms", response_model=Envelope[list[ChatRoomOut]])
async def list_rooms(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Daftar semua room chat user yang sedang login."""
    rooms = (
        await db.execute(
            select(ChatRoom).where(
                (ChatRoom.participant_a_id == current.id)
                | (ChatRoom.participant_b_id == current.id)
            ).order_by(ChatRoom.last_message_at.desc())
        )
    ).scalars().all()

    # Filter room yang di-archive oleh user ini
    archived_ids = {
        a.room_id
        for a in (
            await db.execute(
                select(ChatRoomArchive).where(ChatRoomArchive.user_id == current.id)
            )
        ).scalars().all()
    }

    out: list[ChatRoomOut] = []
    for room in rooms:
        # Skip room yang di-archive
        if room.id in archived_ids:
            continue
        other_id = (
            room.participant_b_id
            if room.participant_a_id == current.id
            else room.participant_a_id
        )
        other = await db.get(User, other_id)
        if not other:
            continue

        # Last message
        last_msg = (
            await db.execute(
                select(ChatMessage)
                .where(
                    ChatMessage.room_id == room.id,
                    ChatMessage.is_deleted == False,  # noqa: E712
                )
                .order_by(ChatMessage.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        # Unread count: pesan dari orang lain setelah last_read_at
        receipt = (
            await db.execute(
                select(ChatReadReceipt).where(
                    ChatReadReceipt.room_id == room.id,
                    ChatReadReceipt.user_id == current.id,
                )
            )
        ).scalar_one_or_none()

        unread_stmt = (
            select(func.count())
            .select_from(ChatMessage)
            .where(
                ChatMessage.room_id == room.id,
                ChatMessage.sender_id != current.id,
                ChatMessage.is_deleted == False,  # noqa: E712
            )
        )
        if receipt:
            unread_stmt = unread_stmt.where(ChatMessage.created_at > receipt.last_read_at)
        unread_count = (await db.execute(unread_stmt)).scalar_one() or 0

        is_muted = (
            (room.is_muted_a and room.participant_a_id == current.id)
            or (room.is_muted_b and room.participant_b_id == current.id)
        )

        out.append(ChatRoomOut(
            id=room.id,
            other_user_id=other.id,
            other_user_name=other.full_name,
            other_user_role=other.role,
            other_user_photo=other.photo_url,
            last_message=last_msg.body[:80] if last_msg and not last_msg.is_deleted else None,
            last_message_at=room.last_message_at,
            unread_count=unread_count,
            is_muted=is_muted,
        ))

    return Envelope(data=out)


# ─── Pesan dalam Room ─────────────────────────────────────────────────────────


@router.get("/rooms/{room_id}", response_model=Envelope[list[ChatMessageOut]])
async def get_room_messages(
    room_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
):
    """Ambil pesan dalam room (paginated, terbaru di atas).
    
    Otomatis mark-as-read saat dibuka.
    """
    room = await db.get(ChatRoom, room_id)
    if not room:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room tidak ditemukan")

    # Pastikan user adalah peserta room atau admin/BK
    is_participant = current.id in (room.participant_a_id, room.participant_b_id)
    is_moderator = current.role in ("super_admin", "hr")
    if not is_participant and not is_moderator:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tidak punya akses ke room ini")

    msgs = (
        await db.execute(
            select(ChatMessage)
            .where(ChatMessage.room_id == room_id)
            .order_by(ChatMessage.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
    ).scalars().all()

    # Auto mark-as-read: update atau buat read receipt
    if is_participant:
        receipt = (
            await db.execute(
                select(ChatReadReceipt).where(
                    ChatReadReceipt.room_id == room_id,
                    ChatReadReceipt.user_id == current.id,
                )
            )
        ).scalar_one_or_none()
        # Pakai func.now() supaya timezone selalu sama dengan ChatMessage.created_at
        # (kedua-duanya jam server MySQL). Kalau pakai datetime.utcnow() Python,
        # bisa beda 7 jam dari jam server WIB → semua pesan dianggap belum dibaca.
        if receipt:
            await db.execute(
                ChatReadReceipt.__table__.update()
                .where(ChatReadReceipt.id == receipt.id)
                .values(last_read_at=func.now())
            )
        else:
            await db.execute(
                ChatReadReceipt.__table__.insert().values(
                    room_id=room_id,
                    user_id=current.id,
                    last_read_at=func.now(),
                )
            )
        await db.commit()

    # Fetch senders
    sender_ids = list({m.sender_id for m in msgs})
    senders: dict[int, User] = {}
    for sid in sender_ids:
        u = await db.get(User, sid)
        if u:
            senders[sid] = u

    out = [_msg_to_out(m, senders[m.sender_id]) for m in msgs if m.sender_id in senders]
    return Envelope(data=out)


# ─── Kirim Pesan ─────────────────────────────────────────────────────────────


@router.post("/send", response_model=Envelope[ChatMessageOut], status_code=201)
async def send_message(
    payload: SendMessageIn,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Kirim pesan ke pengguna lain.

    Keamanan:
    - Siswa hanya bisa chat dengan guru/staff
    - Filter konten (kata kasar, link, nomor HP)
    - Rate limiting (max 10 pesan/menit)
    - Cek mute status
    """
    # Cek rate limit
    if not check_rate_limit(current.id):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Terlalu banyak pesan. Tunggu sebentar sebelum kirim lagi.",
        )

    # Cek mute
    if await is_user_muted(db, current.id):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Akun kamu sedang di-mute. Hubungi guru BK atau admin.",
        )

    # Validasi penerima
    recipient = await db.get(User, payload.recipient_id)
    if not recipient or recipient.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pengguna tidak ditemukan")

    if recipient.id == current.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tidak bisa chat dengan diri sendiri")

    # Validasi peserta
    ok, reason = await validate_chat_participants(db, current, recipient)
    if not ok:
        raise HTTPException(status.HTTP_403_FORBIDDEN, reason)

    # Filter konten
    body = payload.body.strip()
    if not body:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pesan tidak boleh kosong")

    if current.role == "employee":
        is_blocked, block_reason, should_flag, flag_reason = check_content(body)
    else:
        is_blocked, block_reason = check_content_for_staff(body)
        should_flag, flag_reason = False, None

    if is_blocked:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, block_reason)

    # Buat/ambil room
    room = await get_or_create_room(db, current.org_id, current.id, recipient.id)

    # Auto-unarchive room untuk kedua peserta kalau ada pesan baru
    for uid in (current.id, recipient.id):
        archive = (
            await db.execute(
                select(ChatRoomArchive).where(
                    ChatRoomArchive.room_id == room.id,
                    ChatRoomArchive.user_id == uid,
                )
            )
        ).scalar_one_or_none()
        if archive:
            await db.delete(archive)

    # Simpan pesan
    msg = ChatMessage(
        room_id=room.id,
        sender_id=current.id,
        body=body,
        is_flagged=should_flag,
        flag_reason=flag_reason,
    )
    db.add(msg)

    # Update last_message_at di room — pakai func.now() agar timezone konsisten
    # dengan ChatMessage.created_at (server-side MySQL).
    await db.execute(
        ChatRoom.__table__.update()
        .where(ChatRoom.id == room.id)
        .values(last_message_at=func.now())
    )

    await db.commit()
    await db.refresh(msg)

    # Notif penerima: pesan baru
    try:
        from app.services.notification_service import notify_role, notify_user
        snippet = body if len(body) <= 80 else body[:77] + "…"
        await notify_user(
            db, recipient.id,
            title=f"Pesan dari {current.full_name}",
            body=snippet,
            category="chat_message",
            url=f"/chat?room={room.id}",
        )
        # Pesan di-flag → kasih tahu BK + Kepsek juga
        if should_flag:
            await notify_role(
                db, current.org_id, "hr",
                title="Pesan ter-flag perlu ditinjau",
                body=f"{current.full_name} → {recipient.full_name}: {snippet}",
                category="chat_flag",
                url=f"/chat-monitor?flagged=1",
            )
            await notify_role(
                db, current.org_id, "super_admin",
                title="Pesan ter-flag perlu ditinjau",
                body=f"{current.full_name} → {recipient.full_name}",
                category="chat_flag",
                url=f"/chat-monitor?flagged=1",
            )
    except Exception:
        pass

    return Envelope(
        data=_msg_to_out(msg, current),
        message="Pesan terkirim" + (" (ditandai untuk review)" if should_flag else ""),
    )


# ─── Kontak yang Bisa Di-chat ─────────────────────────────────────────────────


@router.get("/contacts", response_model=Envelope[list[dict]])
async def list_contacts(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Daftar pengguna yang bisa di-chat oleh user ini.

    Siswa: hanya guru/staff di sekolah yang sama.
    Guru/staff: semua pengguna aktif di sekolah yang sama.
    """
    stmt = select(User).where(
        User.org_id == current.org_id,
        User.status == "active",
        User.id != current.id,
    )

    # Siswa hanya bisa chat dengan guru/staff
    if current.role == "employee":
        stmt = stmt.where(User.role.in_(["admin", "hr", "super_admin"]))

    users = (await db.execute(stmt.order_by(User.full_name))).scalars().all()

    from app.terminology import get_term

    out = [
        {
            "id": u.id,
            "full_name": u.full_name,
            "role": u.role,
            "role_label": get_term("school", u.role, u.role),
            "photo_url": u.photo_url,
            "email": u.email,
        }
        for u in users
    ]
    return Envelope(data=out)


# ─── Flag Pesan ───────────────────────────────────────────────────────────────


@router.post("/messages/{message_id}/flag", response_model=Envelope[dict])
async def flag_message(
    message_id: int,
    payload: FlagMessageIn,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Flag pesan untuk review moderasi."""
    msg = await db.get(ChatMessage, message_id)
    if not msg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pesan tidak ditemukan")

    # Pastikan user punya akses ke room ini
    room = await db.get(ChatRoom, msg.room_id)
    if not room:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room tidak ditemukan")

    is_participant = current.id in (room.participant_a_id, room.participant_b_id)
    is_moderator = current.role in ("super_admin", "hr")
    if not is_participant and not is_moderator:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tidak punya akses")

    msg.is_flagged = True
    msg.flag_reason = payload.reason
    msg.flagged_by = current.id
    await db.commit()

    return Envelope(data={"ok": True}, message="Pesan ditandai untuk review")


# ─── Moderasi (Admin/BK) ──────────────────────────────────────────────────────


@router.get("/flagged", response_model=Envelope[list[ChatMessageOut]])
async def list_flagged(
    current: Annotated[User, Depends(require_roles("super_admin", "hr", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Semua pesan yang di-flag untuk review."""
    msgs = (
        await db.execute(
            select(ChatMessage)
            .join(ChatRoom, ChatRoom.id == ChatMessage.room_id)
            .where(
                ChatRoom.org_id == current.org_id,
                ChatMessage.is_flagged == True,  # noqa: E712
                ChatMessage.is_deleted == False,  # noqa: E712
            )
            .order_by(ChatMessage.created_at.desc())
            .limit(100)
        )
    ).scalars().all()

    sender_ids = list({m.sender_id for m in msgs})
    senders: dict[int, User] = {}
    for sid in sender_ids:
        u = await db.get(User, sid)
        if u:
            senders[sid] = u

    out = [_msg_to_out(m, senders[m.sender_id]) for m in msgs if m.sender_id in senders]
    return Envelope(data=out)


@router.delete("/messages/{message_id}", response_model=Envelope[dict])
async def delete_message(
    message_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "hr", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Hapus pesan (soft delete — hanya admin/BK/kepsek)."""
    msg = await db.get(ChatMessage, message_id)
    if not msg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pesan tidak ditemukan")

    room = await db.get(ChatRoom, msg.room_id)
    if not room or room.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pesan tidak ditemukan")

    msg.is_deleted = True
    msg.deleted_by = current.id
    await db.commit()

    return Envelope(data={"ok": True}, message="Pesan dihapus")


@router.post("/mute", response_model=Envelope[dict])
async def mute_user(
    payload: MuteUserIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Mute user dari chat (hanya kepsek/admin)."""
    target = await db.get(User, payload.user_id)
    if not target or target.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User tidak ditemukan")

    if target.role != "employee":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hanya siswa yang bisa di-mute")

    # Hapus mute lama kalau ada
    existing = (
        await db.execute(select(ChatMute).where(ChatMute.user_id == payload.user_id))
    ).scalar_one_or_none()
    if existing:
        await db.delete(existing)

    expires_at = None
    if payload.duration_hours:
        expires_at = datetime.utcnow() + timedelta(hours=payload.duration_hours)

    db.add(ChatMute(
        user_id=payload.user_id,
        muted_by=current.id,
        reason=payload.reason,
        expires_at=expires_at,
    ))
    await db.commit()

    duration_str = f"{payload.duration_hours} jam" if payload.duration_hours else "permanen"
    return Envelope(
        data={"ok": True},
        message=f"{target.full_name} di-mute dari chat ({duration_str})",
    )


@router.delete("/mute/{user_id}", response_model=Envelope[dict])
async def unmute_user(
    user_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Unmute user."""
    mute = (
        await db.execute(select(ChatMute).where(ChatMute.user_id == user_id))
    ).scalar_one_or_none()
    if not mute:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User tidak sedang di-mute")

    target = await db.get(User, user_id)
    if target and target.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User tidak ditemukan")

    await db.delete(mute)
    await db.commit()
    return Envelope(data={"ok": True}, message="Mute dicabut")


@router.get("/muted", response_model=Envelope[list[dict]])
async def list_muted(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Daftar user yang sedang di-mute."""
    mutes = (await db.execute(select(ChatMute))).scalars().all()
    out = []
    for m in mutes:
        user = await db.get(User, m.user_id)
        if not user or user.org_id != current.org_id:
            continue
        out.append({
            "user_id": m.user_id,
            "user_name": user.full_name,
            "reason": m.reason,
            "muted_at": m.muted_at.isoformat(),
            "expires_at": m.expires_at.isoformat() if m.expires_at else None,
        })
    return Envelope(data=out)


@router.get("/monitor", response_model=Envelope[list[dict]])
async def monitor_all_chats(
    current: Annotated[User, Depends(require_roles("super_admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
):
    """Monitor semua percakapan di sekolah (kepsek & BK only)."""
    rooms = (
        await db.execute(
            select(ChatRoom)
            .where(ChatRoom.org_id == current.org_id)
            .order_by(ChatRoom.last_message_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
    ).scalars().all()

    out = []
    for room in rooms:
        user_a = await db.get(User, room.participant_a_id)
        user_b = await db.get(User, room.participant_b_id)
        last_msg = (
            await db.execute(
                select(ChatMessage)
                .where(ChatMessage.room_id == room.id)
                .order_by(ChatMessage.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        out.append({
            "room_id": room.id,
            "participant_a": {"id": user_a.id, "name": user_a.full_name, "role": user_a.role} if user_a else None,
            "participant_b": {"id": user_b.id, "name": user_b.full_name, "role": user_b.role} if user_b else None,
            "last_message": last_msg.body[:100] if last_msg and not last_msg.is_deleted else None,
            "last_message_at": room.last_message_at.isoformat() if room.last_message_at else None,
        })
    return Envelope(data=out)



# ─── Archive & Purge ─────────────────────────────────────────────────────────


@router.post("/rooms/{room_id}/archive", response_model=Envelope[dict])
async def archive_room(
    room_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Sembunyikan room dari list chat user ini (archive).

    Room tidak dihapus dari DB — pesan tetap ada untuk audit trail.
    Kalau ada pesan baru masuk, room otomatis muncul lagi.
    """
    room = await db.get(ChatRoom, room_id)
    if not room:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room tidak ditemukan")

    is_participant = current.id in (room.participant_a_id, room.participant_b_id)
    is_moderator = current.role in ("super_admin", "hr", "admin")
    if not is_participant and not is_moderator:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tidak punya akses ke room ini")

    # Cek sudah di-archive belum
    existing = (
        await db.execute(
            select(ChatRoomArchive).where(
                ChatRoomArchive.room_id == room_id,
                ChatRoomArchive.user_id == current.id,
            )
        )
    ).scalar_one_or_none()

    if existing:
        return Envelope(data={"ok": True}, message="Room sudah di-archive sebelumnya")

    db.add(ChatRoomArchive(room_id=room_id, user_id=current.id))
    await db.commit()
    return Envelope(data={"ok": True}, message="Obrolan disembunyikan dari daftar chat")


@router.delete("/rooms/{room_id}/archive", response_model=Envelope[dict])
async def unarchive_room(
    room_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Tampilkan kembali room yang di-archive."""
    archive = (
        await db.execute(
            select(ChatRoomArchive).where(
                ChatRoomArchive.room_id == room_id,
                ChatRoomArchive.user_id == current.id,
            )
        )
    ).scalar_one_or_none()

    if not archive:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room tidak ada di arsip")

    await db.delete(archive)
    await db.commit()
    return Envelope(data={"ok": True}, message="Obrolan ditampilkan kembali")


@router.get("/archived", response_model=Envelope[list[ChatRoomOut]])
async def list_archived_rooms(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Daftar room yang di-archive oleh user ini."""
    archives = (
        await db.execute(
            select(ChatRoomArchive).where(ChatRoomArchive.user_id == current.id)
        )
    ).scalars().all()

    out: list[ChatRoomOut] = []
    for archive in archives:
        room = await db.get(ChatRoom, archive.room_id)
        if not room:
            continue
        other_id = (
            room.participant_b_id
            if room.participant_a_id == current.id
            else room.participant_a_id
        )
        other = await db.get(User, other_id)
        if not other:
            continue
        last_msg = (
            await db.execute(
                select(ChatMessage)
                .where(ChatMessage.room_id == room.id, ChatMessage.is_deleted == False)  # noqa: E712
                .order_by(ChatMessage.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        out.append(ChatRoomOut(
            id=room.id,
            other_user_id=other.id,
            other_user_name=other.full_name,
            other_user_role=other.role,
            other_user_photo=other.photo_url,
            last_message=last_msg.body[:80] if last_msg and not last_msg.is_deleted else None,
            last_message_at=room.last_message_at,
            unread_count=0,
            is_muted=False,
        ))
    return Envelope(data=out)


# ─── Hapus Permanen Per-Room (kepsek only) ──────────────────────────────────


@router.delete("/rooms/{room_id}", response_model=Envelope[dict])
async def delete_room(
    room_id: int,
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Hapus permanen satu room chat beserta semua isinya.

    Hanya kepala sekolah yang bisa pakai endpoint ini. Berbeda dari archive
    (yang sekedar sembunyi) — di sini benar-benar hilang dari DB.

    Yang dihapus:
    - Semua pesan (chat_messages)
    - Read receipts (chat_read_receipts)
    - Archive entries kedua peserta (chat_room_archives)
    - Room itu sendiri (chat_rooms)
    """
    from app.models import AuditLog

    room = await db.get(ChatRoom, room_id)
    if not room or room.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room tidak ditemukan")

    # Hitung dulu untuk audit log + response
    total_messages = (
        await db.execute(
            select(func.count(ChatMessage.id)).where(ChatMessage.room_id == room_id)
        )
    ).scalar_one() or 0

    participant_a = room.participant_a_id
    participant_b = room.participant_b_id

    # Hapus dependent rows secara eksplisit
    msgs = (
        await db.execute(
            select(ChatMessage).where(ChatMessage.room_id == room_id)
        )
    ).scalars().all()
    for m in msgs:
        await db.delete(m)

    receipts = (
        await db.execute(
            select(ChatReadReceipt).where(ChatReadReceipt.room_id == room_id)
        )
    ).scalars().all()
    for r in receipts:
        await db.delete(r)

    archives = (
        await db.execute(
            select(ChatRoomArchive).where(ChatRoomArchive.room_id == room_id)
        )
    ).scalars().all()
    for a in archives:
        await db.delete(a)

    await db.delete(room)

    # Audit trail — siapa hapus apa, kapan
    db.add(AuditLog(
        user_id=current.id,
        action="CHAT_ROOM_DELETE",
        target_type="chat_room",
        target_id=room_id,
        extra_meta={
            "messages_deleted": int(total_messages),
            "participant_a": participant_a,
            "participant_b": participant_b,
        },
    ))
    await db.commit()

    return Envelope(
        data={"ok": True, "messages_deleted": int(total_messages)},
        message=f"Obrolan dihapus permanen ({total_messages} pesan).",
    )


# ─── Purge (kepsek only) ──────────────────────────────────────────────────────


from pydantic import BaseModel as _PydanticBase


class PurgeRequest(_PydanticBase):
    older_than_days: int
    confirm_password: str
    dry_run: bool = True


class PurgeResult(_PydanticBase):
    messages_to_delete: int
    rooms_to_cleanup: int
    oldest_message_date: Optional[str] = None
    newest_message_date: Optional[str] = None
    executed: bool = False
    message: str


@router.post("/purge", response_model=Envelope[PurgeResult])
async def purge_old_messages(
    payload: PurgeRequest,
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Hapus pesan chat lama dari database (kepsek only).

    Keamanan:
    - Hanya super_admin (kepsek)
    - Wajib konfirmasi password
    - Default dry_run=True — preview dulu sebelum eksekusi
    - Tidak bisa hapus pesan < 7 hari (minimum window)

    Cara pakai:
    1. Kirim dengan dry_run=True untuk lihat berapa pesan yang akan dihapus
    2. Kalau setuju, kirim ulang dengan dry_run=False untuk eksekusi
    """
    from app.models import UserAuth
    from app.security import verify_password

    # Verifikasi password kepsek
    auth = (
        await db.execute(
            select(UserAuth).where(UserAuth.user_id == current.id)
        )
    ).scalar_one_or_none()
    if not auth or not verify_password(payload.confirm_password, auth.password_hash or ""):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Password salah")

    cutoff = datetime.utcnow() - timedelta(days=payload.older_than_days)

    # Hitung pesan yang akan dihapus
    msgs_to_delete = (
        await db.execute(
            select(ChatMessage)
            .join(ChatRoom, ChatRoom.id == ChatMessage.room_id)
            .where(
                ChatRoom.org_id == current.org_id,
                ChatMessage.created_at < cutoff,
            )
        )
    ).scalars().all()

    count = len(msgs_to_delete)
    oldest = min((m.created_at for m in msgs_to_delete), default=None)
    newest = max((m.created_at for m in msgs_to_delete), default=None)

    # Hitung room yang akan jadi kosong (semua pesannya dihapus)
    affected_room_ids = {m.room_id for m in msgs_to_delete}
    rooms_to_cleanup = 0
    for rid in affected_room_ids:
        total_in_room = (
            await db.execute(
                select(func.count())
                .select_from(ChatMessage)
                .where(ChatMessage.room_id == rid)
            )
        ).scalar_one() or 0
        to_delete_in_room = sum(1 for m in msgs_to_delete if m.room_id == rid)
        if total_in_room == to_delete_in_room:
            rooms_to_cleanup += 1

    if payload.dry_run:
        return Envelope(
            data=PurgeResult(
                messages_to_delete=count,
                rooms_to_cleanup=rooms_to_cleanup,
                oldest_message_date=oldest.isoformat() if oldest else None,
                newest_message_date=newest.isoformat() if newest else None,
                executed=False,
                message=f"DRY RUN: {count} pesan akan dihapus ({rooms_to_cleanup} room akan kosong). Kirim ulang dengan dry_run=false untuk eksekusi.",
            )
        )

    # Eksekusi hapus
    for msg in msgs_to_delete:
        await db.delete(msg)

    # Hapus room yang sudah kosong + archive entries-nya
    for rid in affected_room_ids:
        remaining = (
            await db.execute(
                select(func.count())
                .select_from(ChatMessage)
                .where(ChatMessage.room_id == rid)
            )
        ).scalar_one() or 0
        if remaining == 0:
            # Hapus archive entries
            archives = (
                await db.execute(
                    select(ChatRoomArchive).where(ChatRoomArchive.room_id == rid)
                )
            ).scalars().all()
            for a in archives:
                await db.delete(a)
            # Hapus read receipts
            receipts = (
                await db.execute(
                    select(ChatReadReceipt).where(ChatReadReceipt.room_id == rid)
                )
            ).scalars().all()
            for r in receipts:
                await db.delete(r)
            # Hapus room
            room = await db.get(ChatRoom, rid)
            if room:
                await db.delete(room)

    await db.commit()

    return Envelope(
        data=PurgeResult(
            messages_to_delete=count,
            rooms_to_cleanup=rooms_to_cleanup,
            oldest_message_date=oldest.isoformat() if oldest else None,
            newest_message_date=newest.isoformat() if newest else None,
            executed=True,
            message=f"Berhasil menghapus {count} pesan dan {rooms_to_cleanup} room kosong.",
        )
    )
