"""Auth endpoints — login (with 2FA support), refresh, logout, me."""
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models import AuditLog, TokenBlacklist, User, UserAuth
from app.schemas import (
    Envelope, LoginRequest, RefreshRequest, TokenResponse, UserOut,
)
from app.security import (
    create_2fa_challenge_token, create_access_token, create_refresh_token,
    decode_token, decode_token_full, get_current_user, oauth2_scheme,
    verify_password,
)
from app.services.rate_limiter import make_limiter
from app.services.two_factor import consume_recovery_code, verify_totp

router = APIRouter(prefix="/auth", tags=["Auth"])

# Rate-limit login attempts per IP: 10 attempts/menit
_limit_login = make_limiter(10, 60, "login")


# Brute-force protection thresholds
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


# ─── Schemas ────────────────────────────────────────────────────────────────


class LoginResponseData(BaseModel):
    """Data shape buat login. Kalau 2FA aktif, balik challenge token saja.
    Kalau tidak, balik access+refresh langsung."""
    requires_2fa: bool = False
    challenge_token: Optional[str] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None
    user_id: Optional[int] = None


class Login2FARequest(BaseModel):
    challenge_token: str
    code: str = Field(min_length=4, max_length=12)
    use_recovery: bool = False


# ─── Helpers ────────────────────────────────────────────────────────────────


def _user_to_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        employee_id=user.employee_id,
        full_name=user.full_name,
        email=user.email,
        phone=user.phone,
        parent_phone=user.parent_phone,
        parent_name=user.parent_name,
        photo_url=user.photo_url,
        role=user.role,
        status=user.status,
        department=user.department,
        join_date=user.join_date,
        has_face_enrolled=any(e.is_active for e in (user.face_embeddings or [])),
        created_at=user.created_at,
    )


def _success_response(user_id: int) -> LoginResponseData:
    return LoginResponseData(
        requires_2fa=False,
        access_token=create_access_token(user_id),
        refresh_token=create_refresh_token(user_id),
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user_id,
    )


# ─── Endpoints ──────────────────────────────────────────────────────────────


@router.post("/login", response_model=Envelope[LoginResponseData])
async def login(
    payload: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    _rl: None = Depends(_limit_login),
):
    result = await db.execute(
        select(User).where(User.email == payload.email).options(selectinload(User.auth))
    )
    user = result.scalar_one_or_none()

    invalid_msg = "Email atau password salah"
    if not user or not user.auth:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, invalid_msg)

    auth = user.auth
    now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive, konsisten dengan DB

    if auth.locked_until and auth.locked_until > now:
        remaining = int((auth.locked_until - now).total_seconds() / 60) + 1
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Akun terkunci karena percobaan login berlebih. Coba lagi {remaining} menit.",
        )

    if not verify_password(payload.password, auth.password_hash or ""):
        auth.failed_attempts = (auth.failed_attempts or 0) + 1
        if auth.failed_attempts >= MAX_FAILED_ATTEMPTS:
            auth.locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
            db.add(AuditLog(user_id=user.id, action="LOGIN_LOCKED"))
            await db.commit()
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Akun terkunci {LOCKOUT_MINUTES} menit setelah {MAX_FAILED_ATTEMPTS} percobaan gagal.",
            )
        db.add(AuditLog(user_id=user.id, action="LOGIN_FAILED"))
        await db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, invalid_msg)

    if user.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Akun tidak aktif")

    # Reset counter setelah password OK
    auth.failed_attempts = 0
    auth.locked_until = None

    # 2FA aktif → minta TOTP
    if auth.totp_enabled and auth.totp_secret:
        await db.commit()
        return Envelope(
            data=LoginResponseData(
                requires_2fa=True,
                challenge_token=create_2fa_challenge_token(user.id),
                user_id=user.id,
            ),
            message="Masukkan kode 2FA untuk lanjut",
        )

    auth.last_login_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(AuditLog(user_id=user.id, action="LOGIN"))
    await db.commit()

    return Envelope(data=_success_response(user.id), message="Login berhasil")


@router.post("/login-2fa", response_model=Envelope[LoginResponseData])
async def login_2fa(
    payload: Login2FARequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    _rl: None = Depends(_limit_login),
):
    """Lanjutan login: verify TOTP (atau recovery code)."""
    user_id = decode_token(payload.challenge_token, "2fa_challenge")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(401, "Invalid challenge token")
    auth = (
        await db.execute(select(UserAuth).where(UserAuth.user_id == user.id))
    ).scalar_one_or_none()
    if not auth or not auth.totp_enabled:
        raise HTTPException(400, "2FA tidak aktif untuk akun ini")

    valid = False
    if payload.use_recovery:
        ok, remaining = consume_recovery_code(payload.code, auth.recovery_codes_json or [])
        if ok:
            valid = True
            auth.recovery_codes_json = remaining
            db.add(AuditLog(user_id=user.id, action="2FA_RECOVERY_USED"))
    else:
        valid = verify_totp(auth.totp_secret or "", payload.code)

    if not valid:
        db.add(AuditLog(user_id=user.id, action="2FA_FAILED"))
        await db.commit()
        raise HTTPException(401, "Kode 2FA salah atau sudah dipakai")

    auth.last_login_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(AuditLog(user_id=user.id, action="LOGIN_2FA"))
    await db.commit()

    return Envelope(data=_success_response(user.id), message="Login berhasil")


@router.post("/refresh", response_model=Envelope[TokenResponse])
async def refresh(
    payload: RefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    payload_dict = decode_token_full(payload.refresh_token, "refresh")
    jti = payload_dict.get("jti", "")
    # Cek revoked (refresh juga di-track)
    if jti:
        row = (
            await db.execute(
                select(TokenBlacklist).where(TokenBlacklist.jti == jti)
            )
        ).scalar_one_or_none()
        if row:
            raise HTTPException(401, "Refresh token sudah di-revoke")
    user_id = int(payload_dict["sub"])
    return Envelope(
        data=TokenResponse(
            access_token=create_access_token(user_id),
            refresh_token=create_refresh_token(user_id),
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
    )


@router.post("/logout", response_model=Envelope[dict])
async def logout(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    token: Annotated[Optional[str], Depends(oauth2_scheme)],
):
    """Logout — revoke token via blacklist supaya gak bisa dipakai lagi."""
    if token:
        try:
            payload = decode_token_full(token, "access")
            jti = payload.get("jti", "")
            exp = payload.get("exp")
            if jti and exp:
                expires_at = datetime.fromtimestamp(int(exp), tz=timezone.utc).replace(tzinfo=None)
                # Idempotent insert (kalau sudah ada, skip)
                existing = (
                    await db.execute(
                        select(TokenBlacklist).where(TokenBlacklist.jti == jti)
                    )
                ).scalar_one_or_none()
                if not existing:
                    db.add(TokenBlacklist(
                        jti=jti, user_id=current.id, expires_at=expires_at,
                        reason="logout",
                    ))
                    db.add(AuditLog(user_id=current.id, action="LOGOUT"))
                    await db.commit()
        except Exception:
            # Tidak boleh fail logout
            pass
    return Envelope(data={"ok": True}, message="Logout berhasil")


@router.get("/me", response_model=Envelope[UserOut])
async def me(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(User)
        .where(User.id == current.id)
        .options(
            selectinload(User.department),
            selectinload(User.school_class),
            selectinload(User.face_embeddings),
        )
    )
    user = result.scalar_one()
    return Envelope(data=_user_to_out(user))
