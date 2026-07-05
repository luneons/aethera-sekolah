"""Face enrollment endpoints."""
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, update, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import AuditLog, FaceEmbedding, FaceTestLog, User
from app.schemas import (
    EnrollRequest, EnrollResponse, Envelope, FaceTestRequest, FaceTestResponse, FaceTestUser,
    Meta,
)
from app.security import get_current_user, require_roles
from app.services import face_service as fs
from app.services.attendance_service import load_active_gallery
from app.services.face_settings_service import load_org_face_settings


router = APIRouter(prefix="/face", tags=["Face Enrollment"])


async def _load_org_gallery_except_user(
    db: AsyncSession,
    org_id: int,
    excluded_user_id: int,
) -> list[tuple[int, Any]]:
    result = await db.execute(
        select(FaceEmbedding)
        .join(User, User.id == FaceEmbedding.user_id)
        .where(
            User.org_id == org_id,
            FaceEmbedding.user_id != excluded_user_id,
            FaceEmbedding.is_active == True,  # noqa: E712
        )
    )
    gallery = []
    for row in result.scalars().all():
        try:
            gallery.append((row.user_id, fs.deserialize_embedding(row.embedding_data)))
        except Exception:
            continue
    return gallery


@router.post("/test", response_model=Envelope[FaceTestResponse])
async def test_face(
    payload: FaceTestRequest,
    request: Request,
    current: Annotated[User, Depends(require_roles("admin", "hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Recognize a face for testing only. Does not create attendance records."""
    ip_address = request.headers.get("x-forwarded-for", request.client.host if request.client else None)
    user_agent = request.headers.get("user-agent", "")

    face_settings = await load_org_face_settings(db, current.org_id)
    try:
        img = fs.decode_image(payload.image)
        emb, quality_score = fs.extract_embedding(img, face_settings)
    except ValueError as e:
        # Log failed attempt
        db.add(FaceTestLog(
            tested_by=current.id,
            matched=False,
            confidence=0.0,
            quality_score=0.0,
            ip_address=ip_address,
            user_agent=user_agent[:500] if user_agent else None,
            error_message=str(e)[:500],
        ))
        await db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    gallery = await load_active_gallery(db)
    if not gallery:
        db.add(FaceTestLog(
            tested_by=current.id,
            matched=False,
            confidence=0.0,
            quality_score=round(quality_score, 3),
            ip_address=ip_address,
            user_agent=user_agent[:500] if user_agent else None,
            error_message="Belum ada wajah terdaftar di sistem",
        ))
        await db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Belum ada wajah terdaftar di sistem")

    match = fs.find_best_match(emb, gallery, threshold=face_settings["match_threshold"])
    if not match.matched or match.user_id is None:
        db.add(FaceTestLog(
            tested_by=current.id,
            matched=False,
            confidence=round(match.confidence, 3),
            quality_score=round(quality_score, 3),
            ip_address=ip_address,
            user_agent=user_agent[:500] if user_agent else None,
        ))
        await db.commit()
        return Envelope(
            data=FaceTestResponse(
                matched=False,
                confidence=round(match.confidence, 3),
                quality_score=round(quality_score, 3),
            ),
            message="Wajah tidak cocok dengan data terdaftar",
        )

    result = await db.execute(
        select(User)
        .where(User.id == match.user_id, User.org_id == current.org_id)
        .options(selectinload(User.department))
    )
    user = result.scalar_one_or_none()
    if not user or user.status != "active":
        db.add(FaceTestLog(
            tested_by=current.id,
            matched_user_id=match.user_id,
            matched=False,
            confidence=round(match.confidence, 3),
            quality_score=round(quality_score, 3),
            ip_address=ip_address,
            user_agent=user_agent[:500] if user_agent else None,
            error_message="Akun tidak aktif atau beda organisasi",
        ))
        await db.commit()
        return Envelope(
            data=FaceTestResponse(
                matched=False,
                confidence=round(match.confidence, 3),
                quality_score=round(quality_score, 3),
            ),
            message="Wajah cocok, tetapi akun tidak aktif atau beda organisasi",
        )

    # Log successful match
    db.add(FaceTestLog(
        tested_by=current.id,
        matched_user_id=user.id,
        matched=True,
        confidence=round(match.confidence, 3),
        quality_score=round(quality_score, 3),
        ip_address=ip_address,
        user_agent=user_agent[:500] if user_agent else None,
    ))
    await db.commit()

    return Envelope(
        data=FaceTestResponse(
            matched=True,
            confidence=round(match.confidence, 3),
            quality_score=round(quality_score, 3),
            user=FaceTestUser(
                id=user.id,
                full_name=user.full_name,
                employee_id=user.employee_id,
                role=user.role,
                status=user.status,
                department_name=user.department.name if user.department else None,
                photo_url=user.photo_url,
            ),
        ),
        message="Wajah berhasil dikenali",
    )


@router.post("/enroll", response_model=Envelope[EnrollResponse])
async def enroll_face(
    payload: EnrollRequest,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # Employee hanya bisa enroll diri sendiri, admin/hr bisa enroll siapapun
    if current.role == "employee" and payload.user_id != current.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya bisa mendaftarkan wajah sendiri")
    user = await db.get(User, payload.user_id)
    if not user or user.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User tidak ditemukan")

    face_settings = await load_org_face_settings(db, current.org_id)
    min_frames = int(face_settings["min_enrollment_frames"])
    images = []
    rejected: list[dict] = []
    for idx, b64 in enumerate(payload.images):
        try:
            img = fs.decode_image(b64)
            report = fs.validate_quality(img, face_settings)
            if not report.passed:
                rejected.append(
                    {
                        "index": idx,
                        "reason": "; ".join(report.reasons) or "Kualitas foto tidak memadai",
                    }
                )
                continue
            images.append(img)
        except ValueError as e:
            rejected.append({"index": idx, "reason": str(e)})

    if len(images) < min_frames:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Minimal {min_frames} foto valid dibutuhkan untuk enrollment",
        )

    # Liveness across frames
    live_ok, live_reason = fs.liveness_check(
        images,
        enabled=bool(face_settings["liveness_enabled"]),
        min_delta=float(face_settings["liveness_min_delta"]),
    )
    if not live_ok:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Gagal liveness check: {live_reason}",
        )

    embeddings = []
    qualities = []
    for idx, img in enumerate(images):
        try:
            emb, q = fs.extract_embedding(img, face_settings)
            embeddings.append(emb)
            qualities.append(q)
        except ValueError as e:
            rejected.append({"index": idx, "reason": str(e)})

    if len(embeddings) < min_frames:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Foto valid tidak cukup setelah validasi kualitas",
        )

    # Average → single template (consolidates angles)
    template = fs.average_embeddings(embeddings)
    avg_quality = sum(qualities) / len(qualities)

    duplicate_gallery = await _load_org_gallery_except_user(db, current.org_id, user.id)
    duplicate_match = fs.find_best_match(
        template,
        duplicate_gallery,
        threshold=face_settings["duplicate_threshold"],
    )
    if duplicate_match.matched and duplicate_match.user_id is not None:
        duplicate_user = await db.get(User, duplicate_match.user_id)
        duplicate_name = duplicate_user.full_name if duplicate_user else "karyawan lain"
        duplicate_employee_id = duplicate_user.employee_id if duplicate_user else "-"
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "code": "DUPLICATE_FACE",
                "message": (
                    "Wajah ini sudah terdaftar untuk "
                    f"{duplicate_name} ({duplicate_employee_id}). "
                    "Jika ini orang berbeda, naikkan Duplicate Threshold di menu Organisasi."
                ),
                "details": {
                    "duplicate_user_id": duplicate_match.user_id,
                    "duplicate_name": duplicate_name,
                    "duplicate_employee_id": duplicate_employee_id,
                    "confidence": round(duplicate_match.confidence, 3),
                    "similarity_score": round(duplicate_match.score, 3),
                    "duplicate_threshold": face_settings["duplicate_threshold"],
                },
            },
        )

    # Deactivate any existing embeddings for this user
    await db.execute(
        update(FaceEmbedding)
        .where(FaceEmbedding.user_id == user.id)
        .values(is_active=False)
    )

    db.add(
        FaceEmbedding(
            user_id=user.id,
            embedding_data=fs.serialize_embedding(template),
            model_version=fs.MODEL_VERSION,
            quality_score=avg_quality,
            is_active=True,
            enrolled_by=current.id,
        )
    )
    db.add(
        AuditLog(
            user_id=current.id, action="ENROLL_FACE",
            target_type="user", target_id=user.id,
            extra_meta={"frames": len(embeddings), "quality": avg_quality},
        )
    )
    await db.commit()

    return Envelope(
        data=EnrollResponse(
            user_id=user.id,
            embeddings_count=len(embeddings),
            quality_avg=round(avg_quality, 3),
            accepted=len(embeddings),
            rejected=rejected,
        ),
        message="Wajah berhasil didaftarkan",
    )


@router.delete("/enroll/{user_id}", response_model=Envelope[dict])
async def delete_face(
    user_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # Employee hanya bisa hapus wajah sendiri
    if current.role == "employee" and user_id != current.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya bisa menghapus data wajah sendiri")
    user = await db.get(User, user_id)
    if not user or user.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User tidak ditemukan")
    await db.execute(
        update(FaceEmbedding).where(FaceEmbedding.user_id == user_id).values(is_active=False)
    )
    db.add(
        AuditLog(
            user_id=current.id, action="DELETE_FACE",
            target_type="user", target_id=user_id,
        )
    )
    await db.commit()
    return Envelope(data={"ok": True}, message="Data wajah dihapus")


@router.get("/enroll/{user_id}/status", response_model=Envelope[dict])
async def enrollment_status(
    user_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if current.role == "employee" and current.id != user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Forbidden")
    result = await db.execute(
        select(FaceEmbedding).where(
            FaceEmbedding.user_id == user_id, FaceEmbedding.is_active == True  # noqa: E712
        )
    )
    emb = result.scalar_one_or_none()
    return Envelope(
        data={
            "enrolled": emb is not None,
            "model_version": emb.model_version if emb else None,
            "quality_score": emb.quality_score if emb else None,
            "enrolled_at": emb.enrolled_at.isoformat() if emb else None,
        }
    )


@router.get("/test/history", response_model=Envelope[list[dict]])
async def face_test_history(
    current: Annotated[User, Depends(require_roles("admin", "hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = 1,
    per_page: int = 20,
):
    """Get face test history logs."""
    offset = (page - 1) * per_page

    # Count total
    total_q = await db.execute(
        select(sa_func.count(FaceTestLog.id))
        .join(User, User.id == FaceTestLog.tested_by)
        .where(User.org_id == current.org_id)
    )
    total = total_q.scalar() or 0

    # Fetch logs with tester and matched user info
    rows = (
        await db.execute(
            select(FaceTestLog)
            .join(User, User.id == FaceTestLog.tested_by)
            .where(User.org_id == current.org_id)
            .options(
                selectinload(FaceTestLog.tester),
                selectinload(FaceTestLog.matched_user),
            )
            .order_by(FaceTestLog.created_at.desc())
            .offset(offset)
            .limit(per_page)
        )
    ).scalars().all()

    data = []
    for log in rows:
        data.append({
            "id": log.id,
            "tested_by": {
                "id": log.tester.id,
                "full_name": log.tester.full_name,
                "employee_id": log.tester.employee_id,
            },
            "matched": log.matched,
            "matched_user": {
                "id": log.matched_user.id,
                "full_name": log.matched_user.full_name,
                "employee_id": log.matched_user.employee_id,
            } if log.matched_user else None,
            "confidence": log.confidence,
            "quality_score": log.quality_score,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "error_message": log.error_message,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        })

    return Envelope(
        data=data,
        meta=Meta(page=page, per_page=per_page, total=total),
    )
