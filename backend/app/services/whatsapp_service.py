"""WhatsApp notification service.

Sends attendance notifications to parent/guardian phone numbers
via the local Baileys WA Gateway (wa-gateway service).

Features:
- Message queue with delay handled by the gateway
- Dynamic template variables for message variation
- Random greeting/closing variation to avoid spam detection
"""
from __future__ import annotations

import logging
import random
from datetime import datetime
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Organization, OrganizationWhatsappSetting, User

logger = logging.getLogger(__name__)

# Default gateway URL (local Baileys gateway)
DEFAULT_GATEWAY_URL = "http://localhost:3001/send"

# Greeting variations to make messages look unique
GREETINGS = [
    "Assalamualaikum",
    "Assalamualaikum Wr. Wb.",
    "Selamat pagi",
    "Yth. Bapak/Ibu",
    "Halo Bapak/Ibu",
]

CLOSINGS = [
    "Terima kasih. 🙏",
    "Terima kasih atas perhatiannya.",
    "Demikian informasi dari kami.",
    "Salam hormat.",
    "Wassalamualaikum.",
]


async def load_wa_settings(db: AsyncSession, org_id: int) -> Optional[OrganizationWhatsappSetting]:
    """Load WhatsApp settings for an organization."""
    result = await db.execute(
        select(OrganizationWhatsappSetting).where(
            OrganizationWhatsappSetting.org_id == org_id
        )
    )
    return result.scalar_one_or_none()


def _format_message(
    template: str,
    *,
    nama: str,
    aksi: str,
    tanggal: str,
    waktu: str,
    lokasi: str,
    status: str,
    organisasi: str,
) -> str:
    """Format the message template with attendance data + random variation."""
    # Pick random greeting and closing
    greeting = random.choice(GREETINGS)
    closing = random.choice(CLOSINGS)

    return (
        template
        .replace("{salam}", greeting)
        .replace("{nama}", nama)
        .replace("{aksi}", aksi)
        .replace("{tanggal}", tanggal)
        .replace("{waktu}", waktu)
        .replace("{lokasi}", lokasi)
        .replace("{status}", status)
        .replace("{organisasi}", organisasi)
        .replace("{penutup}", closing)
    )


async def send_whatsapp(
    api_url: str,
    api_token: str,
    phone: str,
    message: str,
) -> bool:
    """Send a WhatsApp message via the gateway.

    Supports two modes:
    1. Local Baileys gateway (POST /send with JSON body)
    2. External API like Fonnte (POST with Authorization header + form data)

    Auto-detects based on URL containing 'localhost' or '127.0.0.1'.
    """
    is_local = "localhost" in api_url or "127.0.0.1" in api_url

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if is_local:
                # Local Baileys gateway - JSON body
                response = await client.post(
                    api_url,
                    json={
                        "target": phone,
                        "message": message,
                    },
                )
            else:
                # External API (Fonnte-style) - form data + auth header
                response = await client.post(
                    api_url,
                    headers={"Authorization": api_token},
                    data={
                        "target": phone,
                        "message": message,
                    },
                )

            if response.status_code == 200:
                data = response.json()
                if data.get("success", True):
                    logger.info(f"WA queued for {phone[:6]}***")
                    return True
                else:
                    logger.warning(f"WA gateway rejected: {data.get('error', 'unknown')}")
                    return False
            else:
                logger.warning(
                    f"WA send failed: status={response.status_code}, body={response.text[:200]}"
                )
                return False
    except httpx.ConnectError:
        logger.error(f"WA gateway not reachable at {api_url}")
        return False
    except Exception as e:
        logger.error(f"WA send error to {phone[:6]}***: {e}")
        return False


async def notify_attendance(
    db: AsyncSession,
    *,
    user: User,
    action: str,  # 'checkin' or 'checkout'
    timestamp: datetime,
    status: str,
    org_id: int,
) -> Optional[bool]:
    """Send WhatsApp notification to parent after attendance.

    Returns True if sent, False if failed, None if not applicable (disabled/no phone).
    """
    # Check if user has parent phone
    if not user.parent_phone:
        return None

    # Load WA settings
    wa_settings = await load_wa_settings(db, org_id)
    if not wa_settings or not wa_settings.enabled:
        return None

    # Check if this action type should notify
    if action == "checkin" and not wa_settings.notify_checkin:
        return None
    if action == "checkout" and not wa_settings.notify_checkout:
        return None

    # Check API config
    api_url = wa_settings.api_url or DEFAULT_GATEWAY_URL
    api_token = wa_settings.api_token or ""

    # Load organization name
    org = await db.get(Organization, org_id)
    org_name = org.name if org else "Sekolah"

    # Format message with variation
    aksi_text = "Check-in (Masuk)" if action == "checkin" else "Check-out (Pulang)"
    status_map = {
        "present": "Hadir Tepat Waktu ✅",
        "late": "Hadir (Terlambat) ⚠️",
        "absent": "Tidak Hadir ❌",
    }
    status_text = status_map.get(status, status.capitalize())

    # Indonesian day/month names
    days_id = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
    months_id = [
        "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember",
    ]
    day_name = days_id[timestamp.weekday()]
    tanggal_text = f"{day_name}, {timestamp.day} {months_id[timestamp.month]} {timestamp.year}"
    waktu_text = timestamp.strftime("%H:%M WIB")

    message = _format_message(
        wa_settings.message_template,
        nama=user.full_name,
        aksi=aksi_text,
        tanggal=tanggal_text,
        waktu=waktu_text,
        lokasi=org_name,
        status=status_text,
        organisasi=org_name,
    )

    # Send via gateway
    return await send_whatsapp(
        api_url=api_url,
        api_token=api_token,
        phone=user.parent_phone,
        message=message,
    )
