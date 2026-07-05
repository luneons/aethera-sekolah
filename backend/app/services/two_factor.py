"""Two-Factor Authentication (TOTP) service.

Pakai pyotp untuk generate & verify TOTP code yang kompatibel dengan
Google Authenticator / Authy / Microsoft Authenticator / 1Password.

Recovery codes: 10 kode random 8-char yang di-hash bcrypt. Bisa dipakai
sekali untuk login darurat kalau HP TOTP hilang.
"""
from __future__ import annotations

import io
import secrets
from typing import Optional

import bcrypt
import pyotp
import qrcode

from app.config import settings


def generate_secret() -> str:
    """Generate base32 TOTP secret. Disimpan di UserAuth.totp_secret."""
    return pyotp.random_base32()


def generate_qr_uri(secret: str, account_name: str, issuer: Optional[str] = None) -> str:
    """Generate otpauth:// URI untuk di-scan oleh app authenticator."""
    issuer = issuer or settings.APP_NAME
    return pyotp.totp.TOTP(secret).provisioning_uri(
        name=account_name, issuer_name=issuer
    )


def generate_qr_png(uri: str) -> bytes:
    """Render URI jadi QR code PNG bytes (untuk ditampilkan di frontend)."""
    qr = qrcode.QRCode(box_size=8, border=2)
    qr.add_data(uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def verify_totp(secret: str, code: str) -> bool:
    """Verify 6-digit TOTP code. Allow ±1 step (30s) drift."""
    if not secret or not code:
        return False
    try:
        totp = pyotp.TOTP(secret)
        return totp.verify(code.strip().replace(" ", ""), valid_window=1)
    except Exception:
        return False


def generate_recovery_codes(count: int = 10) -> tuple[list[str], list[str]]:
    """Return (plaintext codes, hashed codes). Plaintext ditampilkan ke user
    1x saja saat enable 2FA. Hashed disimpan di DB."""
    plaintext: list[str] = []
    hashed: list[str] = []
    for _ in range(count):
        # 8-char alphanumeric (uppercase)
        code = "-".join(
            "".join(secrets.choice("ABCDEFGHJKMNPQRSTUVWXYZ23456789") for _ in range(4))
            for _ in range(2)
        )
        plaintext.append(code)
        hashed.append(
            bcrypt.hashpw(code.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        )
    return plaintext, hashed


def consume_recovery_code(code: str, hashed_codes: list[str]) -> tuple[bool, list[str]]:
    """Cek apakah code cocok dengan salah satu hash. Kalau cocok, return (True, sisa hash)."""
    if not code or not hashed_codes:
        return False, hashed_codes
    code_norm = code.strip().upper().replace(" ", "")
    remaining: list[str] = []
    matched = False
    for h in hashed_codes:
        if not matched:
            try:
                if bcrypt.checkpw(code_norm.encode("utf-8"), h.encode("utf-8")):
                    matched = True
                    continue  # consume — drop dari list
            except Exception:
                pass
        remaining.append(h)
    return matched, remaining
