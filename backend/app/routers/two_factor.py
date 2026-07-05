"""Two-Factor Authentication (TOTP) endpoints.

Flow setup:
1. POST /2fa/setup-init → generate secret + QR. Belum aktif.
2. POST /2fa/setup-verify dengan code dari authenticator → aktifkan 2FA.
3. Setelah aktif, login flow akan minta code TOTP setelah password OK.

Flow disable:
- POST /2fa/disable dengan password sekarang → matiin 2FA.

Recovery:
- POST /2fa/recovery-regenerate → regenerate 10 recovery code (invalidate yang lama).
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AuditLog, User, UserAuth
from app.schemas import Envelope
from app.security import get_current_user, verify_password
from app.services.two_factor import (
    consume_recovery_code,
    generate_qr_png,
    generate_qr_uri,
    generate_recovery_codes,
    generate_secret,
    verify_totp,
)


router = APIRouter(prefix="/2fa", tags=["Two-Factor Auth"])


class SetupInitOut(BaseModel):
    secret: str
    qr_uri: str
    qr_png_url: str  # data: URL untuk display di frontend


class SetupVerifyIn(BaseModel):
    code: str = Field(min_length=6, max_length=10)


class DisableIn(BaseModel):
    password: str
    code: str | None = None  # TOTP atau recovery code


class StatusOut(BaseModel):
    enabled: bool
    has_recovery_codes: bool
    recovery_codes_remaining: int


@router.get("/status", response_model=Envelope[StatusOut])
async def status_(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    auth = (
        await db.execute(select(UserAuth).where(UserAuth.user_id == current.id))
    ).scalar_one_or_none()
    if not auth:
        return Envelope(data=StatusOut(enabled=False, has_recovery_codes=False, recovery_codes_remaining=0))
    codes = auth.recovery_codes_json if isinstance(auth.recovery_codes_json, list) else []
    return Envelope(data=StatusOut(
        enabled=auth.totp_enabled,
        has_recovery_codes=bool(codes),
        recovery_codes_remaining=len(codes),
    ))


@router.post("/setup-init", response_model=Envelope[SetupInitOut])
async def setup_init(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Step 1: generate secret + QR. Belum aktifkan."""
    auth = (
        await db.execute(select(UserAuth).where(UserAuth.user_id == current.id))
    ).scalar_one_or_none()
    if not auth:
        raise HTTPException(404, "User auth tidak ditemukan")
    if auth.totp_enabled:
        raise HTTPException(400, "2FA sudah aktif. Disable dulu kalau mau setup ulang.")

    secret = generate_secret()
    auth.totp_secret = secret  # simpan tapi belum aktif
    auth.totp_enabled = False
    await db.commit()

    uri = generate_qr_uri(secret, account_name=current.email or current.full_name)
    png = generate_qr_png(uri)
    import base64
    data_url = "data:image/png;base64," + base64.b64encode(png).decode("ascii")

    return Envelope(data=SetupInitOut(secret=secret, qr_uri=uri, qr_png_url=data_url))


@router.post("/setup-verify", response_model=Envelope[dict])
async def setup_verify(
    payload: SetupVerifyIn,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Step 2: user ketik code dari authenticator → enable 2FA."""
    auth = (
        await db.execute(select(UserAuth).where(UserAuth.user_id == current.id))
    ).scalar_one_or_none()
    if not auth or not auth.totp_secret:
        raise HTTPException(400, "Setup 2FA belum di-init. Panggil /2fa/setup-init dulu.")
    if not verify_totp(auth.totp_secret, payload.code):
        raise HTTPException(401, "Kode TOTP tidak valid")

    # Generate recovery codes
    plaintext, hashed = generate_recovery_codes(count=10)
    auth.totp_enabled = True
    auth.recovery_codes_json = hashed
    db.add(AuditLog(user_id=current.id, action="2FA_ENABLE"))
    await db.commit()

    return Envelope(
        data={
            "enabled": True,
            "recovery_codes": plaintext,  # tampilkan SEKALI di UI
        },
        message="2FA aktif. Simpan recovery codes di tempat aman — tidak akan ditampilkan lagi.",
    )


@router.post("/disable", response_model=Envelope[dict])
async def disable(
    payload: DisableIn,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Disable 2FA. Wajib password + (TOTP atau recovery)."""
    auth = (
        await db.execute(select(UserAuth).where(UserAuth.user_id == current.id))
    ).scalar_one_or_none()
    if not auth:
        raise HTTPException(404, "User auth tidak ditemukan")
    if not auth.totp_enabled:
        raise HTTPException(400, "2FA belum aktif")
    if not verify_password(payload.password, auth.password_hash or ""):
        raise HTTPException(401, "Password salah")

    # Wajib code (TOTP atau recovery) untuk safety
    valid_code = False
    if payload.code:
        if verify_totp(auth.totp_secret or "", payload.code):
            valid_code = True
        else:
            ok, remaining = consume_recovery_code(
                payload.code, auth.recovery_codes_json or []
            )
            if ok:
                valid_code = True
                auth.recovery_codes_json = remaining
    if not valid_code:
        raise HTTPException(401, "Kode TOTP/recovery tidak valid")

    auth.totp_enabled = False
    auth.totp_secret = None
    auth.recovery_codes_json = None
    db.add(AuditLog(user_id=current.id, action="2FA_DISABLE"))
    await db.commit()
    return Envelope(data={"enabled": False}, message="2FA dimatikan")


@router.post("/recovery-regenerate", response_model=Envelope[dict])
async def regenerate_recovery(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Regenerate 10 recovery code baru. Yang lama langsung invalid."""
    auth = (
        await db.execute(select(UserAuth).where(UserAuth.user_id == current.id))
    ).scalar_one_or_none()
    if not auth or not auth.totp_enabled:
        raise HTTPException(400, "2FA belum aktif")

    plaintext, hashed = generate_recovery_codes(count=10)
    auth.recovery_codes_json = hashed
    db.add(AuditLog(user_id=current.id, action="2FA_RECOVERY_REGEN"))
    await db.commit()
    return Envelope(
        data={"recovery_codes": plaintext},
        message="Recovery codes baru. Simpan di tempat aman.",
    )
