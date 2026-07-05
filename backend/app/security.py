"""JWT, password hashing, and auth dependencies."""
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional
import secrets

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import TokenBlacklist, User


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/v1/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    """Hash a password with bcrypt (truncates to 72 bytes per bcrypt spec)."""
    pwd = password.encode("utf-8")[:72]
    return bcrypt.hashpw(pwd, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8")[:72], hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _new_jti() -> str:
    return secrets.token_urlsafe(16)


def _create_token(
    subject: str,
    expires_delta: timedelta,
    token_type: str,
    *,
    extra_claims: Optional[dict] = None,
) -> tuple[str, str, datetime]:
    """Return (encoded_token, jti, expires_at)."""
    now = datetime.now(timezone.utc)
    expire = now + expires_delta
    jti = _new_jti()
    payload = {
        "sub": subject,
        "exp": expire,
        "iat": now,
        "type": token_type,
        "jti": jti,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256"), jti, expire


def create_access_token(user_id: int) -> str:
    token, _, _ = _create_token(
        str(user_id),
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "access",
    )
    return token


def create_refresh_token(user_id: int) -> str:
    token, _, _ = _create_token(
        str(user_id),
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        "refresh",
    )
    return token


def create_2fa_challenge_token(user_id: int) -> str:
    """Short-lived token (5 menit) yang dikirim ke client setelah password OK
    tapi sebelum TOTP. Hanya bisa untuk endpoint /auth/login-2fa."""
    token, _, _ = _create_token(
        str(user_id),
        timedelta(minutes=5),
        "2fa_challenge",
    )
    return token


def decode_token(token: str, expected_type: str = "access") -> int:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") != expected_type:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token type")
        return int(payload["sub"])
    except (JWTError, ValueError, KeyError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")


def decode_token_full(token: str, expected_type: str = "access") -> dict:
    """Return full payload dict (sub, jti, exp). Raise 401 kalau invalid."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") != expected_type:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token type")
        return payload
    except (JWTError, ValueError, KeyError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")


async def _is_revoked(db: AsyncSession, jti: str) -> bool:
    if not jti:
        return False
    row = (
        await db.execute(
            select(TokenBlacklist).where(TokenBlacklist.jti == jti)
        )
    ).scalar_one_or_none()
    return row is not None


async def get_current_user(
    token: Annotated[Optional[str], Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_token_full(token, "access")
    jti = payload.get("jti", "")
    if await _is_revoked(db, jti):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token sudah di-logout")
    user_id = int(payload["sub"])
    user = await db.get(User, user_id)
    if not user or user.status != "active":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    return user


def require_roles(*roles: str):
    async def checker(current: Annotated[User, Depends(get_current_user)]) -> User:
        if current.role not in roles:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, f"Requires role: {', '.join(roles)}"
            )
        return current

    return checker



def homeroom_scope_filter(current: User) -> tuple[bool, int | None]:
    """Apakah user ini wali kelas yang harus di-scope ke kelasnya?

    Return (should_scope, class_id_or_None). Wali kelas (role=admin)
    dengan homeroom_class_id terisi otomatis di-scope ke kelas itu.
    Kepsek/HR/super_admin selalu lihat semua.

    Pakai di endpoint list (users, attendance records, discipline students)
    untuk auto-narrow data tanpa frontend perlu tahu logikanya.
    """
    if current.role == "admin" and current.homeroom_class_id:
        return True, current.homeroom_class_id
    return False, None
