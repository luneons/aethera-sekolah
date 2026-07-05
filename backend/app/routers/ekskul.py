"""Ekstrakurikuler — daftar ekskul, pendaftaran siswa, prestasi tim.

Akses:
- Kepsek/Wali Kelas: CRUD ekskul, approve/reject pendaftaran, input prestasi.
- BK: monitor + input prestasi (auto-bonus poin apresiasi).
- Siswa: lihat list, daftar, lihat ekskulnya sendiri.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    DisciplineProfile,
    Extracurricular,
    ExtracurricularAchievement,
    ExtracurricularEnrollment,
    User,
)
from app.schemas import Envelope
from app.security import get_current_user, require_roles


router = APIRouter(prefix="/ekskul", tags=["Ekstrakurikuler"])


# ─── Schemas ────────────────────────────────────────────────────────────────


class EkskulIn(BaseModel):
    code: str = Field(min_length=2, max_length=20)
    name: str = Field(min_length=2, max_length=100)
    description: Optional[str] = None
    coach_id: Optional[int] = None
    schedule_text: Optional[str] = None
    location: Optional[str] = None
    quota: Optional[int] = Field(default=None, ge=1, le=999)
    is_active: bool = True


class EkskulOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    description: Optional[str] = None
    coach_id: Optional[int] = None
    coach_name: Optional[str] = None
    schedule_text: Optional[str] = None
    location: Optional[str] = None
    quota: Optional[int] = None
    is_active: bool
    enrolled_count: int = 0
    pending_count: int = 0
    approved_count: int = 0
    is_self_enrolled: bool = False
    self_enrollment_status: Optional[str] = None


class EnrollmentIn(BaseModel):
    student_id: Optional[int] = None  # admin assign; siswa pakai diri sendiri
    ekskul_id: int


class EnrollmentDecision(BaseModel):
    status: str = Field(pattern="^(approved|rejected)$")


class EnrollmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ekskul_id: int
    ekskul_name: str
    student_id: int
    student_name: str
    status: str
    enrolled_at: datetime
    decided_by: Optional[int] = None


class AchievementIn(BaseModel):
    ekskul_id: int
    title: str = Field(min_length=3, max_length=255)
    description: Optional[str] = None
    achievement_date: date
    level: str = Field(default="sekolah", pattern="^(sekolah|kecamatan|kabupaten|provinsi|nasional|internasional)$")
    rank: Optional[str] = None
    appreciation_points: int = Field(default=10, ge=0, le=200)
    photo_url: Optional[str] = None
    member_student_ids: list[int] = Field(default_factory=list)


class AchievementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ekskul_id: int
    ekskul_name: str
    title: str
    description: Optional[str] = None
    achievement_date: date
    level: str
    rank: Optional[str] = None
    appreciation_points: int
    photo_url: Optional[str] = None
    member_count: int = 0
    member_names: list[str] = Field(default_factory=list)
    created_at: datetime


# ─── Helpers ────────────────────────────────────────────────────────────────


async def _enrich_ekskul(
    db: AsyncSession, ek: Extracurricular, current_student_id: Optional[int] = None
) -> EkskulOut:
    coach = await db.get(User, ek.coach_id) if ek.coach_id else None
    rows = (
        await db.execute(
            select(ExtracurricularEnrollment).where(
                ExtracurricularEnrollment.ekskul_id == ek.id
            )
        )
    ).scalars().all()
    pending = sum(1 for r in rows if r.status == "pending")
    approved = sum(1 for r in rows if r.status == "approved")

    self_status = None
    if current_student_id is not None:
        for r in rows:
            if r.student_id == current_student_id:
                self_status = r.status
                break

    return EkskulOut(
        id=ek.id,
        code=ek.code,
        name=ek.name,
        description=ek.description,
        coach_id=ek.coach_id,
        coach_name=coach.full_name if coach else None,
        schedule_text=ek.schedule_text,
        location=ek.location,
        quota=ek.quota,
        is_active=ek.is_active,
        enrolled_count=len(rows),
        pending_count=pending,
        approved_count=approved,
        is_self_enrolled=self_status is not None,
        self_enrollment_status=self_status,
    )


async def _enrich_enrollment(
    db: AsyncSession, en: ExtracurricularEnrollment
) -> EnrollmentOut:
    ek = await db.get(Extracurricular, en.ekskul_id)
    student = await db.get(User, en.student_id)
    return EnrollmentOut(
        id=en.id,
        ekskul_id=en.ekskul_id,
        ekskul_name=ek.name if ek else "?",
        student_id=en.student_id,
        student_name=student.full_name if student else "?",
        status=en.status,
        enrolled_at=en.enrolled_at,
        decided_by=en.decided_by,
    )


# ─── Ekskul CRUD ────────────────────────────────────────────────────────────


@router.get("", response_model=Envelope[list[EkskulOut]])
async def list_ekskul(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    only_active: bool = True,
):
    stmt = select(Extracurricular).where(Extracurricular.org_id == current.org_id)
    if only_active:
        stmt = stmt.where(Extracurricular.is_active == True)  # noqa: E712
    rows = (await db.execute(stmt.order_by(Extracurricular.name))).scalars().all()

    self_id = current.id if current.role == "employee" else None
    return Envelope(data=[await _enrich_ekskul(db, r, self_id) for r in rows])


@router.post("", response_model=Envelope[EkskulOut], status_code=201)
async def create_ekskul(
    payload: EkskulIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # Cek duplicate code
    existing = (
        await db.execute(
            select(Extracurricular).where(
                Extracurricular.org_id == current.org_id,
                Extracurricular.code == payload.code,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Kode ekskul sudah dipakai")

    ek = Extracurricular(org_id=current.org_id, **payload.model_dump())
    db.add(ek)
    await db.commit()
    await db.refresh(ek)
    return Envelope(data=await _enrich_ekskul(db, ek))


@router.put("/{ekskul_id}", response_model=Envelope[EkskulOut])
async def update_ekskul(
    ekskul_id: int,
    payload: EkskulIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ek = await db.get(Extracurricular, ekskul_id)
    if not ek or ek.org_id != current.org_id:
        raise HTTPException(404, "Ekskul tidak ditemukan")
    for k, v in payload.model_dump().items():
        setattr(ek, k, v)
    await db.commit()
    await db.refresh(ek)
    return Envelope(data=await _enrich_ekskul(db, ek))


@router.delete("/{ekskul_id}", response_model=Envelope[dict])
async def delete_ekskul(
    ekskul_id: int,
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ek = await db.get(Extracurricular, ekskul_id)
    if not ek or ek.org_id != current.org_id:
        raise HTTPException(404, "Ekskul tidak ditemukan")
    await db.delete(ek)
    await db.commit()
    return Envelope(data={"ok": True})


# ─── Enrollment ─────────────────────────────────────────────────────────────


@router.post("/enroll", response_model=Envelope[EnrollmentOut], status_code=201)
async def enroll(
    payload: EnrollmentIn,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Siswa daftar ekskul. Bisa juga admin daftarin siswa lain."""
    student_id = payload.student_id or current.id
    if current.role == "employee" and payload.student_id and payload.student_id != current.id:
        raise HTTPException(403, "Siswa hanya bisa daftar untuk diri sendiri")

    ek = await db.get(Extracurricular, payload.ekskul_id)
    if not ek or ek.org_id != current.org_id:
        raise HTTPException(404, "Ekskul tidak ditemukan")
    if not ek.is_active:
        raise HTTPException(400, "Ekskul tidak aktif")

    student = await db.get(User, student_id)
    if not student or student.org_id != current.org_id:
        raise HTTPException(404, "Siswa tidak ditemukan")

    # Cek duplicate
    existing = (
        await db.execute(
            select(ExtracurricularEnrollment).where(
                ExtracurricularEnrollment.ekskul_id == payload.ekskul_id,
                ExtracurricularEnrollment.student_id == student_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        if existing.status == "left":
            existing.status = "pending"
            await db.commit()
            await db.refresh(existing)
            return Envelope(data=await _enrich_enrollment(db, existing))
        raise HTTPException(409, "Sudah terdaftar")

    # Cek quota
    if ek.quota:
        approved = (
            await db.execute(
                select(func.count(ExtracurricularEnrollment.id)).where(
                    ExtracurricularEnrollment.ekskul_id == payload.ekskul_id,
                    ExtracurricularEnrollment.status == "approved",
                )
            )
        ).scalar_one()
        if approved >= ek.quota:
            raise HTTPException(400, f"Kuota penuh ({approved}/{ek.quota})")

    initial_status = "pending" if current.role == "employee" else "approved"
    en = ExtracurricularEnrollment(
        ekskul_id=payload.ekskul_id,
        student_id=student_id,
        status=initial_status,
        decided_by=current.id if initial_status == "approved" else None,
    )
    db.add(en)
    await db.commit()
    await db.refresh(en)
    return Envelope(data=await _enrich_enrollment(db, en))


@router.get("/enrollments", response_model=Envelope[list[EnrollmentOut]])
async def list_enrollments(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    ekskul_id: Optional[int] = None,
    status: Optional[str] = None,
    student_id: Optional[int] = None,
):
    """List enrollment. Default: filter ke org via ekskul join."""
    stmt = (
        select(ExtracurricularEnrollment)
        .join(Extracurricular, Extracurricular.id == ExtracurricularEnrollment.ekskul_id)
        .where(Extracurricular.org_id == current.org_id)
    )
    if ekskul_id:
        stmt = stmt.where(ExtracurricularEnrollment.ekskul_id == ekskul_id)
    if status:
        stmt = stmt.where(ExtracurricularEnrollment.status == status)
    if student_id:
        stmt = stmt.where(ExtracurricularEnrollment.student_id == student_id)
    elif current.role == "employee":
        stmt = stmt.where(ExtracurricularEnrollment.student_id == current.id)

    rows = (await db.execute(stmt.order_by(ExtracurricularEnrollment.enrolled_at.desc()))).scalars().all()
    return Envelope(data=[await _enrich_enrollment(db, r) for r in rows])


@router.patch("/enrollments/{enroll_id}", response_model=Envelope[EnrollmentOut])
async def decide_enrollment(
    enroll_id: int,
    payload: EnrollmentDecision,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    en = await db.get(ExtracurricularEnrollment, enroll_id)
    if not en:
        raise HTTPException(404, "Enrollment tidak ditemukan")
    ek = await db.get(Extracurricular, en.ekskul_id)
    if not ek or ek.org_id != current.org_id:
        raise HTTPException(404, "Ekskul tidak ditemukan")

    en.status = payload.status
    en.decided_by = current.id
    await db.commit()
    await db.refresh(en)
    return Envelope(data=await _enrich_enrollment(db, en))


@router.delete("/enrollments/{enroll_id}", response_model=Envelope[dict])
async def cancel_enrollment(
    enroll_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    en = await db.get(ExtracurricularEnrollment, enroll_id)
    if not en:
        raise HTTPException(404, "Enrollment tidak ditemukan")
    ek = await db.get(Extracurricular, en.ekskul_id)
    if not ek or ek.org_id != current.org_id:
        raise HTTPException(404, "Ekskul tidak ditemukan")

    if current.role == "employee" and en.student_id != current.id:
        raise HTTPException(403, "Hanya bisa cancel diri sendiri")

    if current.role == "employee":
        en.status = "left"
        await db.commit()
        return Envelope(data={"ok": True, "marked_left": True})
    else:
        await db.delete(en)
        await db.commit()
        return Envelope(data={"ok": True, "deleted": True})


# ─── Achievements ───────────────────────────────────────────────────────────


@router.post("/achievements", response_model=Envelope[AchievementOut], status_code=201)
async def add_achievement(
    payload: AchievementIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ek = await db.get(Extracurricular, payload.ekskul_id)
    if not ek or ek.org_id != current.org_id:
        raise HTTPException(404, "Ekskul tidak ditemukan")

    # Validate member ids
    member_ids = list(set(payload.member_student_ids))
    if member_ids:
        rows = (
            await db.execute(
                select(User.id, User.full_name).where(
                    User.id.in_(member_ids),
                    User.org_id == current.org_id,
                )
            )
        ).all()
        valid_ids = [r.id for r in rows]
    else:
        valid_ids = []

    ach = ExtracurricularAchievement(
        ekskul_id=payload.ekskul_id,
        title=payload.title,
        description=payload.description,
        achievement_date=payload.achievement_date,
        level=payload.level,
        rank=payload.rank,
        appreciation_points=payload.appreciation_points,
        photo_url=payload.photo_url,
        members_json=valid_ids,
    )
    db.add(ach)

    # Auto-bonus poin apresiasi ke setiap member
    if valid_ids and payload.appreciation_points > 0:
        for sid in valid_ids:
            profile = (
                await db.execute(
                    select(DisciplineProfile).where(DisciplineProfile.user_id == sid)
                )
            ).scalar_one_or_none()
            if profile:
                profile.appreciation_points += payload.appreciation_points

    await db.commit()
    await db.refresh(ach)

    member_names = []
    if valid_ids:
        nrows = (
            await db.execute(
                select(User.full_name).where(User.id.in_(valid_ids))
            )
        ).scalars().all()
        member_names = list(nrows)

    return Envelope(data=AchievementOut(
        id=ach.id,
        ekskul_id=ach.ekskul_id,
        ekskul_name=ek.name,
        title=ach.title,
        description=ach.description,
        achievement_date=ach.achievement_date,
        level=ach.level,
        rank=ach.rank,
        appreciation_points=ach.appreciation_points,
        photo_url=ach.photo_url,
        member_count=len(valid_ids),
        member_names=member_names,
        created_at=ach.created_at,
    ))


@router.get("/achievements", response_model=Envelope[list[AchievementOut]])
async def list_achievements(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    ekskul_id: Optional[int] = None,
    limit: int = 50,
):
    stmt = (
        select(ExtracurricularAchievement)
        .join(Extracurricular, Extracurricular.id == ExtracurricularAchievement.ekskul_id)
        .where(Extracurricular.org_id == current.org_id)
    )
    if ekskul_id:
        stmt = stmt.where(ExtracurricularAchievement.ekskul_id == ekskul_id)
    rows = (
        await db.execute(
            stmt.order_by(ExtracurricularAchievement.achievement_date.desc()).limit(limit)
        )
    ).scalars().all()

    out: list[AchievementOut] = []
    for ach in rows:
        ek = await db.get(Extracurricular, ach.ekskul_id)
        members = ach.members_json or []
        member_names: list[str] = []
        if isinstance(members, list) and members:
            nrows = (
                await db.execute(
                    select(User.full_name).where(User.id.in_(members))
                )
            ).scalars().all()
            member_names = list(nrows)

        out.append(AchievementOut(
            id=ach.id,
            ekskul_id=ach.ekskul_id,
            ekskul_name=ek.name if ek else "?",
            title=ach.title,
            description=ach.description,
            achievement_date=ach.achievement_date,
            level=ach.level,
            rank=ach.rank,
            appreciation_points=ach.appreciation_points,
            photo_url=ach.photo_url,
            member_count=len(members) if isinstance(members, list) else 0,
            member_names=member_names,
            created_at=ach.created_at,
        ))
    return Envelope(data=out)


@router.delete("/achievements/{ach_id}", response_model=Envelope[dict])
async def delete_achievement(
    ach_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ach = await db.get(ExtracurricularAchievement, ach_id)
    if not ach:
        raise HTTPException(404, "Prestasi tidak ditemukan")
    ek = await db.get(Extracurricular, ach.ekskul_id)
    if not ek or ek.org_id != current.org_id:
        raise HTTPException(404, "Prestasi tidak ditemukan")
    await db.delete(ach)
    await db.commit()
    return Envelope(data={"ok": True})
