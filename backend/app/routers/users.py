"""Users CRUD endpoints."""
import secrets
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import AttendanceRecord, AuditLog, SchoolClass, User, UserAuth
from app.schemas import (
    AttendanceRecordOut, Envelope, Meta, UserCreate, UserOut, UserUpdate,
)
from app.security import get_current_user, hash_password, homeroom_scope_filter, require_roles
from app.services.rate_limiter import make_limiter

router = APIRouter(prefix="/users", tags=["Users"])

# Rate limiter untuk change-password: 5 percobaan/menit per IP
_limit_change_pw = make_limiter(5, 60, "change-password")


def _to_out(user: User) -> UserOut:
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
        school_class=user.school_class,
        homeroom_class=user.homeroom_class,
        homeroom_class_id=user.homeroom_class_id,
        join_date=user.join_date,
        has_face_enrolled=any(e.is_active for e in (user.face_embeddings or [])),
        created_at=user.created_at,
    )


@router.get("", response_model=Envelope[list[UserOut]])
async def list_users(
    current: Annotated[User, Depends(require_roles("admin", "hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    q: Optional[str] = None,
    department_id: Optional[int] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    show_all: bool = Query(False, description="Wali kelas: true untuk lihat seluruh sekolah"),
):
    stmt = (
        select(User)
        .where(User.org_id == current.org_id)
        .options(
            selectinload(User.department),
            selectinload(User.school_class),
            selectinload(User.homeroom_class),
            selectinload(User.face_embeddings),
        )
        .order_by(User.full_name)
    )
    # Auto-scope: wali kelas hanya lihat siswanya kecuali minta show_all
    scope_active, class_id = homeroom_scope_filter(current)
    if scope_active and not show_all:
        stmt = stmt.where(
            (User.school_class_id == class_id) | (User.id == current.id)
        )
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            func.lower(User.full_name).like(like) | func.lower(User.employee_id).like(like)
        )
    if department_id is not None:
        stmt = stmt.where(User.department_id == department_id)
    if status_filter:
        stmt = stmt.where(User.status == status_filter)

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
    stmt = stmt.offset((page - 1) * per_page).limit(per_page)

    rows = (await db.execute(stmt)).scalars().all()
    return Envelope(
        data=[_to_out(u) for u in rows],
        meta=Meta(page=page, per_page=per_page, total=total),
    )


@router.post("", response_model=Envelope[UserOut], status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    current: Annotated[User, Depends(require_roles("admin", "hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # School mode (default & only mode): parent_phone wajib untuk siswa
    if payload.role == "employee":
        if not payload.parent_phone or not payload.parent_phone.strip():
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Nomor HP Orang Tua/Wali wajib diisi untuk siswa",
            )

    exists = (
        await db.execute(
            select(User).where(
                User.org_id == current.org_id, User.employee_id == payload.employee_id
            )
        )
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "NIS sudah digunakan")

    if payload.email:
        email_used = (
            await db.execute(select(User).where(User.email == payload.email))
        ).scalar_one_or_none()
        if email_used:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email sudah digunakan")

    user = User(
        org_id=current.org_id,
        employee_id=payload.employee_id,
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
        parent_phone=payload.parent_phone,
        parent_name=payload.parent_name,
        department_id=payload.department_id,
        school_class_id=payload.school_class_id,
        role=payload.role,
        join_date=payload.join_date,
        qr_token=secrets.token_urlsafe(18),
        qr_enabled=True,
    )
    db.add(user)
    await db.flush()

    user.auth = UserAuth(user_id=user.id, password_hash=hash_password(payload.password))
    db.add(
        AuditLog(
            user_id=current.id, action="CREATE_USER",
            target_type="user", target_id=user.id,
        )
    )
    await db.commit()
    # Re-fetch dengan semua relasi untuk menghindari lazy load error
    result = await db.execute(
        select(User).where(User.id == user.id).options(
            selectinload(User.department),
            selectinload(User.school_class),
            selectinload(User.face_embeddings),
        )
    )
    user = result.scalar_one()
    return Envelope(data=_to_out(user), message="Siswa berhasil didaftarkan")


@router.get("/{user_id}", response_model=Envelope[UserOut])
async def get_user(
    user_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if current.role == "employee" and current.id != user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Forbidden")
    result = await db.execute(
        select(User).where(User.id == user_id).options(
            selectinload(User.department), selectinload(User.school_class), selectinload(User.face_embeddings)
        )
    )
    user = result.scalar_one_or_none()
    if not user or user.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User tidak ditemukan")
    return Envelope(data=_to_out(user))


@router.patch("/{user_id}", response_model=Envelope[UserOut])
async def update_user(
    user_id: int,
    payload: UserUpdate,
    current: Annotated[User, Depends(require_roles("admin", "hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    user = await db.get(User, user_id)
    if not user or user.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User tidak ditemukan")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.add(
        AuditLog(
            user_id=current.id, action="UPDATE_USER",
            target_type="user", target_id=user.id,
        )
    )
    await db.commit()
    result = await db.execute(
        select(User).where(User.id == user_id).options(
            selectinload(User.department),
            selectinload(User.school_class),
            selectinload(User.face_embeddings),
        )
    )
    user = result.scalar_one()
    return Envelope(data=_to_out(user), message="Data karyawan diperbarui")


@router.delete("/{user_id}", response_model=Envelope[dict])
async def deactivate_user(
    user_id: int,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    user = await db.get(User, user_id)
    if not user or user.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User tidak ditemukan")
    user.status = "inactive"
    db.add(
        AuditLog(
            user_id=current.id, action="DEACTIVATE_USER",
            target_type="user", target_id=user.id,
        )
    )
    await db.commit()
    return Envelope(data={"ok": True}, message="Karyawan dinonaktifkan")


# --- Password Management ----------------------------------------------------

from pydantic import BaseModel as _PydanticBase


class ResetPasswordRequest(_PydanticBase):
    new_password: str = ""


class ChangePasswordRequest(_PydanticBase):
    current_password: str = ""
    new_password: str = ""


@router.post("/{user_id}/reset-password", response_model=Envelope[dict])
async def reset_password(
    user_id: int,
    payload: ResetPasswordRequest,
    current: Annotated[User, Depends(require_roles("admin", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Admin reset password user lain."""
    if len(payload.new_password) < 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password minimal 8 karakter")
    user = await db.get(User, user_id)
    if not user or user.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User tidak ditemukan")
    auth = (
        await db.execute(select(UserAuth).where(UserAuth.user_id == user_id))
    ).scalar_one_or_none()
    if not auth:
        auth = UserAuth(user_id=user_id)
        db.add(auth)
    auth.password_hash = hash_password(payload.new_password)
    auth.failed_attempts = 0
    auth.locked_until = None
    db.add(AuditLog(
        user_id=current.id, action="RESET_PASSWORD",
        target_type="user", target_id=user_id,
    ))
    await db.commit()
    return Envelope(data={"ok": True}, message="Password berhasil direset")


@router.post("/me/change-password", response_model=Envelope[dict])
async def change_own_password(
    payload: ChangePasswordRequest,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    _rl: None = Depends(_limit_change_pw),
):
    """User ganti password sendiri."""
    from app.security import verify_password
    if len(payload.new_password) < 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password baru minimal 8 karakter")
    auth = (
        await db.execute(select(UserAuth).where(UserAuth.user_id == current.id))
    ).scalar_one_or_none()
    if not auth or not verify_password(payload.current_password, auth.password_hash or ""):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password lama salah")
    auth.password_hash = hash_password(payload.new_password)
    db.add(AuditLog(
        user_id=current.id, action="CHANGE_PASSWORD",
        target_type="user", target_id=current.id,
    ))
    await db.commit()
    return Envelope(data={"ok": True}, message="Password berhasil diubah")


# --- Profile Management (self-service) --------------------------------------


class UpdateProfileRequest(_PydanticBase):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    parent_phone: Optional[str] = None
    parent_name: Optional[str] = None


@router.patch("/me/profile", response_model=Envelope[UserOut])
async def update_own_profile(
    payload: UpdateProfileRequest,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """User update profil sendiri (nama, telepon, dll)."""
    user = await db.get(User, current.id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User tidak ditemukan")

    if payload.full_name is not None and payload.full_name.strip():
        user.full_name = payload.full_name.strip()
    if payload.phone is not None:
        user.phone = payload.phone or None
    if payload.parent_phone is not None:
        user.parent_phone = payload.parent_phone or None
    if payload.parent_name is not None:
        user.parent_name = payload.parent_name or None

    db.add(AuditLog(
        user_id=current.id, action="UPDATE_PROFILE",
        target_type="user", target_id=current.id,
    ))
    await db.commit()
    await db.refresh(user, ["department", "school_class", "face_embeddings"])
    return Envelope(data=_to_out(user), message="Profil berhasil diperbarui")


@router.post("/me/photo", response_model=Envelope[dict])
async def upload_profile_photo(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    """Upload foto profil user."""
    from pathlib import Path
    import secrets
    from app.services.file_security import validate_file, safe_filename

    # Baca file
    content = await file.read()
    ok, detected, err = validate_file(
        content,
        allowed_categories=["image"],
        max_size_bytes=5 * 1024 * 1024,  # 5MB
        declared_mime=file.content_type,
    )
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, err or "File tidak valid")

    # Simpan ke storage/photos/ pakai detected MIME (bukan dari header)
    ext_map = {
        "image/jpeg": "jpg", "image/png": "png",
        "image/webp": "webp", "image/gif": "gif",
    }
    ext = ext_map.get(detected or "image/jpeg", "jpg")
    filename = f"profile_{current.id}_{secrets.token_hex(6)}.{ext}"
    photos_dir = Path("./storage/photos")
    photos_dir.mkdir(parents=True, exist_ok=True)
    photo_path = photos_dir / filename
    photo_path.write_bytes(content)

    # Update user
    user = await db.get(User, current.id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User tidak ditemukan")

    # Hapus foto lama jika ada
    if user.photo_url and user.photo_url.startswith("/photos/"):
        old_path = Path("./storage") / user.photo_url.lstrip("/")
        if old_path.exists():
            old_path.unlink(missing_ok=True)

    user.photo_url = f"/photos/{filename}"
    await db.commit()

    return Envelope(data={"photo_url": user.photo_url}, message="Foto profil berhasil diupload")


@router.get("/{user_id}/attendance", response_model=Envelope[list[AttendanceRecordOut]])
async def user_attendance(
    user_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
):
    if current.role == "employee" and current.id != user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Forbidden")

    # Fix IDOR: pastikan user yang diminta ada di org yang sama
    target_user = await db.get(User, user_id)
    if not target_user or target_user.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User tidak ditemukan")

    stmt = (
        select(AttendanceRecord)
        .where(AttendanceRecord.user_id == user_id)
        .order_by(AttendanceRecord.attendance_date.desc())
    )
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
    rows = (
        await db.execute(stmt.offset((page - 1) * per_page).limit(per_page))
    ).scalars().all()

    return Envelope(
        data=[AttendanceRecordOut.model_validate(r) for r in rows],
        meta=Meta(page=page, per_page=per_page, total=total),
    )
