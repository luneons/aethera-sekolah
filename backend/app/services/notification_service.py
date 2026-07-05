"""Notification service — Web Push + history persistence.

Pattern:
- Tiap kali aplikasi mau notif user, panggil `notify_user(...)`.
- Service ini akan:
  1. Insert row ke `app_notifications` (history in-app).
  2. Loop semua subscription user → kirim Web Push payload.
  3. Bersihkan subscription yang 410/404 (browser sudah unsubscribe).

Helper-helper `notify_role`, `notify_class`, `broadcast_org` dibangun
di atas `notify_user` agar dampak audit jelas (satu row per user).

Best-effort: kalau push gateway error (jaringan VPS bermasalah), kita
tetap simpan history-nya supaya bell-icon di TopBar tetap update saat
user buka aplikasi.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from typing import Iterable, Optional

from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import AppNotification, PushSubscription, SchoolClass, User


logger = logging.getLogger(__name__)


# ─── Internals ──────────────────────────────────────────────────────────────


def _vapid_claims() -> dict[str, str]:
    return {"sub": settings.VAPID_SUBJECT or "mailto:admin@aethera.my.id"}


def _send_one(sub: PushSubscription, payload: dict) -> tuple[bool, Optional[int]]:
    """Sync Web Push call. Returns (ok, status_code_if_dead)."""
    if not settings.VAPID_PRIVATE_KEY:
        logger.warning("VAPID_PRIVATE_KEY belum di-set, push diskip")
        return False, None
    try:
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims=_vapid_claims(),
            ttl=86400,
        )
        return True, None
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        # 404/410 = subscription expired/unsubscribed — hapus dari DB.
        if status in (404, 410):
            return False, status
        logger.warning(f"Push gagal endpoint={sub.endpoint[:60]} status={status}: {exc}")
        return False, None
    except Exception as exc:  # noqa: BLE001
        logger.exception(f"Push error: {exc}")
        return False, None


# ─── Public API ─────────────────────────────────────────────────────────────


async def notify_user(
    db: AsyncSession,
    user_id: int,
    *,
    title: str,
    body: str,
    category: str = "system",
    url: Optional[str] = None,
    icon: Optional[str] = None,
    persist: bool = True,
    commit: bool = True,
) -> AppNotification | None:
    """Kirim push + simpan history ke 1 user.

    `commit=False` berguna saat dipanggil di tengah transaksi caller
    (mis. dari endpoint yang sudah pegang db session) — caller commit
    sendiri di akhir.
    """
    notif: AppNotification | None = None
    if persist:
        notif = AppNotification(
            user_id=user_id,
            category=category,
            title=title[:200],
            body=body,
            url=url,
            icon=icon,
            is_read=False,
            delivered_push=False,
        )
        db.add(notif)
        await db.flush()

    subs = (
        await db.execute(
            select(PushSubscription).where(PushSubscription.user_id == user_id)
        )
    ).scalars().all()

    if subs:
        payload = {
            "title": title,
            "body": body,
            "url": url or "/notifications",
            "icon": icon or "/icons/icon-192.png",
            "category": category,
            "ts": datetime.utcnow().isoformat(),
        }
        loop = asyncio.get_running_loop()
        results = await asyncio.gather(
            *[loop.run_in_executor(None, _send_one, s, payload) for s in subs]
        )
        any_ok = False
        dead_ids: list[int] = []
        for sub, (ok, dead_status) in zip(subs, results):
            if ok:
                any_ok = True
                sub.last_used_at = datetime.utcnow()
            elif dead_status in (404, 410):
                dead_ids.append(sub.id)
        if dead_ids:
            await db.execute(
                delete(PushSubscription).where(PushSubscription.id.in_(dead_ids))
            )
        if notif is not None and any_ok:
            notif.delivered_push = True

    if commit:
        await db.commit()
    return notif


async def notify_users(
    db: AsyncSession,
    user_ids: Iterable[int],
    *,
    title: str,
    body: str,
    category: str = "system",
    url: Optional[str] = None,
    icon: Optional[str] = None,
) -> int:
    sent = 0
    for uid in user_ids:
        try:
            await notify_user(
                db, uid,
                title=title, body=body, category=category, url=url, icon=icon,
                commit=False,
            )
            sent += 1
        except Exception as exc:  # noqa: BLE001
            logger.exception(f"notify_users gagal uid={uid}: {exc}")
    await db.commit()
    return sent


async def notify_role(
    db: AsyncSession,
    org_id: int,
    role: str,
    *,
    title: str,
    body: str,
    category: str = "system",
    url: Optional[str] = None,
    icon: Optional[str] = None,
    exclude_user_id: Optional[int] = None,
) -> int:
    rows = (
        await db.execute(
            select(User.id).where(
                User.org_id == org_id,
                User.role == role,
                User.status == "active",
            )
        )
    ).scalars().all()
    ids = [r for r in rows if r != exclude_user_id]
    return await notify_users(
        db, ids,
        title=title, body=body, category=category, url=url, icon=icon,
    )


async def notify_class(
    db: AsyncSession,
    school_class_id: int,
    *,
    title: str,
    body: str,
    category: str = "system",
    url: Optional[str] = None,
    icon: Optional[str] = None,
) -> int:
    rows = (
        await db.execute(
            select(User.id).where(
                User.school_class_id == school_class_id,
                User.role == "employee",
                User.status == "active",
            )
        )
    ).scalars().all()
    return await notify_users(
        db, rows,
        title=title, body=body, category=category, url=url, icon=icon,
    )


async def broadcast_org(
    db: AsyncSession,
    org_id: int,
    *,
    title: str,
    body: str,
    category: str = "broadcast",
    url: Optional[str] = None,
    icon: Optional[str] = None,
    target_role: Optional[str] = None,
    target_class_id: Optional[int] = None,
    exclude_user_id: Optional[int] = None,
) -> int:
    """Broadcast multi-target.

    Kombinasi filter:
    - target_class_id ≠ None → hanya siswa kelas itu
    - target_role ≠ None  → hanya user dengan role tsb
    - keduanya None       → seluruh user aktif di org
    """
    q = select(User.id).where(User.org_id == org_id, User.status == "active")
    if target_class_id is not None:
        # Either student of that class OR homeroom teacher
        q = q.where(
            (User.school_class_id == target_class_id)
            | (User.homeroom_class_id == target_class_id)
        )
    if target_role is not None:
        q = q.where(User.role == target_role)
    rows = (await db.execute(q)).scalars().all()
    ids = [r for r in rows if r != exclude_user_id]
    return await notify_users(
        db, ids,
        title=title, body=body, category=category, url=url, icon=icon,
    )


def safe_fire_and_forget(coro) -> None:
    """Schedule a notification task without awaiting.

    Dipakai dari endpoint sinkron-handler-pasif yang gak boleh delay
    response cuma karena push lambat. Errors di-log doang.
    """
    async def _wrapper():
        try:
            await coro
        except Exception as exc:  # noqa: BLE001
            logger.exception(f"fire_and_forget notif gagal: {exc}")

    try:
        asyncio.get_event_loop().create_task(_wrapper())
    except RuntimeError:
        # No running loop; ignore (tests / cli)
        pass
