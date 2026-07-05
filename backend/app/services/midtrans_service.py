"""Midtrans Snap payment gateway integration.

Flow:
1. create_snap_transaction() — minta Snap token ke Midtrans untuk satu Bill.
   Frontend pakai token ini buka popup pembayaran (snap.js).
2. User bayar (VA / QRIS / e-wallet / kartu).
3. Midtrans kirim webhook (HTTP notification) ke /v1/billing/midtrans/webhook.
4. verify_signature() validasi keaslian webhook.
5. map_transaction_status() tentukan apakah sudah lunas.

Dokumentasi: https://docs.midtrans.com/docs/snap-snap-integration-guide

Catatan keamanan:
- SERVER_KEY tidak boleh bocor ke frontend. Hanya CLIENT_KEY yang public.
- Signature webhook = SHA512(order_id + status_code + gross_amount + server_key).
- Selalu re-verify status ke Midtrans API kalau ragu (jangan percaya body webhook mentah).
"""
from __future__ import annotations

import base64
import hashlib
from typing import Any, Optional

import httpx

from app.config import settings


class MidtransError(Exception):
    """Raised kalau request ke Midtrans gagal atau config belum lengkap."""


def is_configured() -> bool:
    return bool(settings.MIDTRANS_SERVER_KEY and settings.MIDTRANS_CLIENT_KEY)


def _auth_header() -> dict[str, str]:
    """Midtrans pakai HTTP Basic Auth: server_key sebagai username, password kosong."""
    token = base64.b64encode(f"{settings.MIDTRANS_SERVER_KEY}:".encode()).decode()
    return {
        "Authorization": f"Basic {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


async def create_snap_transaction(
    *,
    order_id: str,
    gross_amount: int,
    customer_name: str,
    customer_email: Optional[str],
    customer_phone: Optional[str],
    item_name: str,
    item_id: str,
) -> dict[str, Any]:
    """Buat transaksi Snap, return {token, redirect_url}.

    gross_amount harus integer (Rupiah tidak ada desimal).
    """
    if not is_configured():
        raise MidtransError("Midtrans belum dikonfigurasi. Set MIDTRANS_SERVER_KEY & CLIENT_KEY.")

    payload = {
        "transaction_details": {
            "order_id": order_id,
            "gross_amount": gross_amount,
        },
        "item_details": [
            {
                "id": item_id,
                "price": gross_amount,
                "quantity": 1,
                "name": item_name[:50],  # Midtrans batasi 50 char
            }
        ],
        "customer_details": {
            "first_name": customer_name[:50],
            "email": customer_email or "noemail@aethera.my.id",
            "phone": customer_phone or "",
        },
        "callbacks": {
            "finish": settings.MIDTRANS_FINISH_URL,
        },
        # Expiry 24 jam
        "expiry": {
            "unit": "hours",
            "duration": 24,
        },
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            r = await client.post(
                settings.midtrans_snap_base,
                json=payload,
                headers=_auth_header(),
            )
        except httpx.HTTPError as e:
            raise MidtransError(f"Gagal menghubungi Midtrans: {e}")

    if r.status_code not in (200, 201):
        raise MidtransError(f"Midtrans menolak transaksi ({r.status_code}): {r.text}")

    data = r.json()
    if "token" not in data:
        raise MidtransError(f"Response Midtrans tidak valid: {data}")
    return {
        "token": data["token"],
        "redirect_url": data.get("redirect_url"),
    }


def verify_signature(
    order_id: str,
    status_code: str,
    gross_amount: str,
    signature_key: str,
) -> bool:
    """Validasi signature webhook Midtrans.

    signature = SHA512(order_id + status_code + gross_amount + server_key)
    """
    raw = f"{order_id}{status_code}{gross_amount}{settings.MIDTRANS_SERVER_KEY}"
    expected = hashlib.sha512(raw.encode()).hexdigest()
    return expected == signature_key


async def fetch_transaction_status(order_id: str) -> dict[str, Any]:
    """Re-verify status transaksi langsung ke Midtrans API (server-to-server).

    Dipakai untuk memastikan keaslian — jangan hanya percaya body webhook.
    """
    if not is_configured():
        raise MidtransError("Midtrans belum dikonfigurasi.")

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            r = await client.get(
                f"{settings.midtrans_api_base}/{order_id}/status",
                headers=_auth_header(),
            )
        except httpx.HTTPError as e:
            raise MidtransError(f"Gagal cek status: {e}")

    return r.json()


def interpret_status(transaction_status: str, fraud_status: Optional[str] = None) -> str:
    """Map status Midtrans → status internal kita.

    Returns: 'paid' | 'pending' | 'failed' | 'challenge'

    Referensi: https://docs.midtrans.com/docs/https-notification-webhooks
    - capture + accept     → paid (kartu kredit)
    - capture + challenge  → challenge (perlu review manual)
    - settlement           → paid (VA/QRIS/ewallet)
    - pending              → pending
    - deny/cancel/expire   → failed
    """
    if transaction_status in ("capture",):
        if fraud_status == "accept":
            return "paid"
        if fraud_status == "challenge":
            return "challenge"
        return "failed"
    if transaction_status == "settlement":
        return "paid"
    if transaction_status == "pending":
        return "pending"
    if transaction_status in ("deny", "cancel", "expire", "failure"):
        return "failed"
    return "pending"
