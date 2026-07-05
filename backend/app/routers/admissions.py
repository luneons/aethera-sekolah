"""PPDB — Penerimaan Peserta Didik Baru Online.

Public endpoints (tanpa login) untuk calon siswa daftar.
Admin endpoints untuk kelola periode & review aplikasi.
"""
from __future__ import annotations

import secrets
from datetime import date, datetime
from pathlib import Path
from typing import Annotated, Optional

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status,
)
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import (
    AdmissionApplication, AdmissionPeriod, AuditLog, User, UserAuth,
)
from app.schemas import Envelope
from app.security import get_current_user, hash_password, require_roles
from app.services.file_security import safe_filename, validate_file
from app.services.rate_limiter import make_limiter


router = APIRouter(prefix="/admissions", tags=["PPDB"])


# Rate limit untuk public submission: 5 form per IP per jam
_limit_submit = make_limiter(5, 3600, "PPDB submission")


ADMISSIONS_DIR = Path(settings.SNAPSHOT_DIR).parent / "admissions"
ADMISSIONS_DIR.mkdir(parents=True, exist_ok=True)


# ─── Schemas ────────────────────────────────────────────────────────────────


class PeriodIn(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    school_year: str = Field(min_length=4, max_length=20)
    start_at: datetime
    end_at: datetime
    quota: Optional[int] = Field(default=None, ge=1, le=9999)
    registration_fee: float = 0
    is_active: bool = True
    description: Optional[str] = None


class PeriodOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    school_year: str
    start_at: datetime
    end_at: datetime
    quota: Optional[int]
    registration_fee: float
    is_active: bool
    description: Optional[str]
    applications_count: int = 0
    accepted_count: int = 0
    enrolled_count: int = 0
    created_at: datetime


class ApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    period_id: int
    period_name: Optional[str] = None
    registration_number: str
    full_name: str
    nisn: Optional[str]
    nik: Optional[str]
    birth_place: Optional[str]
    birth_date: Optional[date]
    gender: str
    religion: Optional[str]
    address: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    previous_school: Optional[str]
    father_name: Optional[str]
    mother_name: Optional[str]
    parent_phone: Optional[str]
    parent_occupation: Optional[str]
    photo_url: Optional[str]
    kk_url: Optional[str]
    akta_url: Optional[str]
    raport_url: Optional[str]
    status: str
    decision_note: Optional[str]
    decided_by: Optional[int]
    decided_at: Optional[datetime]
    enrolled_user_id: Optional[int]
    submitted_at: datetime


class DecisionIn(BaseModel):
    status: str = Field(pattern="^(reviewing|accepted|rejected|enrolled|cancelled)$")
    note: Optional[str] = None


class StatusCheckIn(BaseModel):
    registration_number: str
    email: EmailStr


# ─── Helpers ────────────────────────────────────────────────────────────────


def _gen_reg_number(period_id: int) -> str:
    """Format: PPDB-{period_id}-{random_alnum_8}"""
    return f"PPDB-{period_id}-{secrets.token_urlsafe(6).upper().replace('-', '').replace('_', '')[:8]}"


async def _enrich_period(db: AsyncSession, p: AdmissionPeriod) -> PeriodOut:
    rows = (
        await db.execute(
            select(AdmissionApplication.status, func.count(AdmissionApplication.id))
            .where(AdmissionApplication.period_id == p.id)
            .group_by(AdmissionApplication.status)
        )
    ).all()
    counts = {r[0]: r[1] for r in rows}
    total = sum(counts.values())
    accepted = counts.get("accepted", 0) + counts.get("enrolled", 0)
    enrolled = counts.get("enrolled", 0)
    return PeriodOut(
        id=p.id, name=p.name, school_year=p.school_year,
        start_at=p.start_at, end_at=p.end_at, quota=p.quota,
        registration_fee=p.registration_fee, is_active=p.is_active,
        description=p.description,
        applications_count=total,
        accepted_count=accepted,
        enrolled_count=enrolled,
        created_at=p.created_at,
    )


async def _enrich_app(db: AsyncSession, a: AdmissionApplication) -> ApplicationOut:
    period = await db.get(AdmissionPeriod, a.period_id)
    return ApplicationOut(
        **{f: getattr(a, f) for f in [
            "id", "period_id", "registration_number", "full_name", "nisn", "nik",
            "birth_place", "birth_date", "gender", "religion", "address", "phone",
            "email", "previous_school", "father_name", "mother_name",
            "parent_phone", "parent_occupation", "photo_url", "kk_url", "akta_url",
            "raport_url", "status", "decision_note", "decided_by", "decided_at",
            "enrolled_user_id", "submitted_at",
        ]},
        period_name=period.name if period else None,
    )


async def _save_doc(content: bytes, prefix: str, filename: str) -> Optional[str]:
    if not content:
        return None
    safe = safe_filename(filename)
    name = f"{prefix}_{secrets.token_hex(6)}_{safe}"
    (ADMISSIONS_DIR / name).write_bytes(content)
    return f"/admissions/{name}"


# ─── Public endpoints (tanpa auth) ──────────────────────────────────────────


@router.get("/periods/active", response_model=Envelope[list[PeriodOut]])
async def list_active_periods(
    db: Annotated[AsyncSession, Depends(get_db)],
    org_id: int,
):
    """Public: daftar periode PPDB aktif untuk halaman pendaftaran."""
    now = datetime.now()
    rows = (
        await db.execute(
            select(AdmissionPeriod).where(
                AdmissionPeriod.org_id == org_id,
                AdmissionPeriod.is_active == True,  # noqa: E712
                AdmissionPeriod.start_at <= now,
                AdmissionPeriod.end_at >= now,
            ).order_by(AdmissionPeriod.start_at)
        )
    ).scalars().all()
    return Envelope(data=[await _enrich_period(db, p) for p in rows])


@router.post("/apply", response_model=Envelope[dict])
async def submit_application(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    period_id: Annotated[int, Form()],
    full_name: Annotated[str, Form(min_length=2)],
    gender: Annotated[str, Form(pattern="^[LP]$")],
    nisn: Annotated[Optional[str], Form()] = None,
    nik: Annotated[Optional[str], Form()] = None,
    birth_place: Annotated[Optional[str], Form()] = None,
    birth_date: Annotated[Optional[date], Form()] = None,
    religion: Annotated[Optional[str], Form()] = None,
    address: Annotated[Optional[str], Form()] = None,
    phone: Annotated[Optional[str], Form()] = None,
    email: Annotated[Optional[EmailStr], Form()] = None,
    previous_school: Annotated[Optional[str], Form()] = None,
    father_name: Annotated[Optional[str], Form()] = None,
    mother_name: Annotated[Optional[str], Form()] = None,
    parent_phone: Annotated[Optional[str], Form()] = None,
    parent_occupation: Annotated[Optional[str], Form()] = None,
    photo: Annotated[Optional[UploadFile], File()] = None,
    kk: Annotated[Optional[UploadFile], File()] = None,
    akta: Annotated[Optional[UploadFile], File()] = None,
    raport: Annotated[Optional[UploadFile], File()] = None,
    _rl: None = Depends(_limit_submit),
):
    """Public: submit form PPDB."""
    period = await db.get(AdmissionPeriod, period_id)
    if not period or not period.is_active:
        raise HTTPException(404, "Periode tidak ditemukan atau tidak aktif")
    now = datetime.now()
    if not (period.start_at <= now <= period.end_at):
        raise HTTPException(400, "Periode pendaftaran sudah ditutup")
    if period.quota:
        accepted = (
            await db.execute(
                select(func.count(AdmissionApplication.id)).where(
                    AdmissionApplication.period_id == period_id,
                    AdmissionApplication.status.in_(["accepted", "enrolled"]),
                )
            )
        ).scalar_one()
        if accepted >= period.quota:
            raise HTTPException(400, "Kuota penuh")

    # Save doc files
    docs: dict[str, Optional[str]] = {}
    for fld, upload, cats, max_size in [
        ("photo_url", photo, ["image"], 3 * 1024 * 1024),
        ("kk_url", kk, ["image", "pdf"], 5 * 1024 * 1024),
        ("akta_url", akta, ["image", "pdf"], 5 * 1024 * 1024),
        ("raport_url", raport, ["image", "pdf"], 8 * 1024 * 1024),
    ]:
        if upload and upload.filename:
            content = await upload.read()
            ok, _, err = validate_file(
                content, allowed_categories=cats, max_size_bytes=max_size,
                declared_mime=upload.content_type,
            )
            if not ok:
                raise HTTPException(400, f"{fld}: {err}")
            docs[fld] = await _save_doc(content, fld.replace("_url", ""), upload.filename)
        else:
            docs[fld] = None

    reg_no = _gen_reg_number(period_id)
    app = AdmissionApplication(
        period_id=period_id,
        registration_number=reg_no,
        full_name=full_name.strip(),
        gender=gender,
        nisn=nisn, nik=nik, birth_place=birth_place, birth_date=birth_date,
        religion=religion, address=address, phone=phone, email=email,
        previous_school=previous_school, father_name=father_name,
        mother_name=mother_name, parent_phone=parent_phone,
        parent_occupation=parent_occupation,
        photo_url=docs["photo_url"],
        kk_url=docs["kk_url"],
        akta_url=docs["akta_url"],
        raport_url=docs["raport_url"],
        status="submitted",
    )
    db.add(app)
    await db.commit()
    await db.refresh(app)

    return Envelope(
        data={
            "registration_number": reg_no,
            "id": app.id,
            "status": "submitted",
        },
        message=f"Pendaftaran berhasil. Nomor registrasi: {reg_no}",
    )


@router.post("/check-status", response_model=Envelope[dict])
async def check_status(
    payload: StatusCheckIn,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Public: cek status pendaftaran dengan reg number + email."""
    app = (
        await db.execute(
            select(AdmissionApplication).where(
                AdmissionApplication.registration_number == payload.registration_number,
                AdmissionApplication.email == payload.email,
            )
        )
    ).scalar_one_or_none()
    if not app:
        raise HTTPException(404, "Data pendaftaran tidak ditemukan")
    period = await db.get(AdmissionPeriod, app.period_id)
    return Envelope(data={
        "registration_number": app.registration_number,
        "full_name": app.full_name,
        "period_name": period.name if period else None,
        "status": app.status,
        "decision_note": app.decision_note,
        "submitted_at": app.submitted_at.isoformat(),
    })


# ─── Admin endpoints ────────────────────────────────────────────────────────


@router.get("/periods", response_model=Envelope[list[PeriodOut]])
async def list_periods(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (
        await db.execute(
            select(AdmissionPeriod)
            .where(AdmissionPeriod.org_id == current.org_id)
            .order_by(AdmissionPeriod.start_at.desc())
        )
    ).scalars().all()
    return Envelope(data=[await _enrich_period(db, p) for p in rows])


@router.post("/periods", response_model=Envelope[PeriodOut], status_code=201)
async def create_period(
    payload: PeriodIn,
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if payload.end_at <= payload.start_at:
        raise HTTPException(422, "end_at harus setelah start_at")
    p = AdmissionPeriod(org_id=current.org_id, **payload.model_dump())
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return Envelope(data=await _enrich_period(db, p))


@router.put("/periods/{pid}", response_model=Envelope[PeriodOut])
async def update_period(
    pid: int,
    payload: PeriodIn,
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    p = await db.get(AdmissionPeriod, pid)
    if not p or p.org_id != current.org_id:
        raise HTTPException(404, "Periode tidak ditemukan")
    for k, v in payload.model_dump().items():
        setattr(p, k, v)
    await db.commit()
    await db.refresh(p)
    return Envelope(data=await _enrich_period(db, p))


@router.get("/applications", response_model=Envelope[list[ApplicationOut]])
async def list_applications(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    period_id: Optional[int] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    period_ids = (
        await db.execute(
            select(AdmissionPeriod.id).where(AdmissionPeriod.org_id == current.org_id)
        )
    ).scalars().all()
    if not period_ids:
        return Envelope(data=[])

    stmt = select(AdmissionApplication).where(
        AdmissionApplication.period_id.in_(period_ids)
    )
    if period_id:
        stmt = stmt.where(AdmissionApplication.period_id == period_id)
    if status:
        stmt = stmt.where(AdmissionApplication.status == status)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(
            AdmissionApplication.full_name.ilike(like),
            AdmissionApplication.nisn.ilike(like),
            AdmissionApplication.registration_number.ilike(like),
        ))
    rows = (
        await db.execute(stmt.order_by(AdmissionApplication.submitted_at.desc()))
    ).scalars().all()
    return Envelope(data=[await _enrich_app(db, r) for r in rows])


@router.patch("/applications/{aid}/decide", response_model=Envelope[ApplicationOut])
async def decide_application(
    aid: int,
    payload: DecisionIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    app = await db.get(AdmissionApplication, aid)
    if not app:
        raise HTTPException(404, "Aplikasi tidak ditemukan")
    period = await db.get(AdmissionPeriod, app.period_id)
    if not period or period.org_id != current.org_id:
        raise HTTPException(404, "Aplikasi tidak ditemukan")

    app.status = payload.status
    app.decision_note = payload.note
    app.decided_by = current.id
    app.decided_at = datetime.utcnow()
    db.add(AuditLog(
        user_id=current.id, action=f"PPDB_{payload.status.upper()}",
        target_type="admission_application", target_id=aid,
    ))
    await db.commit()
    await db.refresh(app)
    return Envelope(data=await _enrich_app(db, app))


@router.post("/applications/{aid}/enroll", response_model=Envelope[dict])
async def enroll_application(
    aid: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Setelah accepted, convert ke User aktif. Generate password random."""
    app = await db.get(AdmissionApplication, aid)
    if not app:
        raise HTTPException(404, "Aplikasi tidak ditemukan")
    period = await db.get(AdmissionPeriod, app.period_id)
    if not period or period.org_id != current.org_id:
        raise HTTPException(404, "Aplikasi tidak ditemukan")
    if app.status != "accepted":
        raise HTTPException(400, "Hanya bisa enroll dari status accepted")
    if app.enrolled_user_id:
        raise HTTPException(409, "Sudah di-enroll sebelumnya")

    # Generate employee_id (NIS) — pakai reg number
    employee_id = app.registration_number
    # Cek collision
    existing = (
        await db.execute(
            select(User).where(
                User.org_id == current.org_id, User.employee_id == employee_id
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"NIS {employee_id} sudah dipakai user lain")

    new_pw = secrets.token_urlsafe(8)
    new_user = User(
        org_id=current.org_id,
        employee_id=employee_id,
        full_name=app.full_name,
        email=app.email,
        phone=app.phone,
        parent_phone=app.parent_phone,
        parent_name=app.father_name or app.mother_name,
        photo_url=app.photo_url,
        role="employee",
        status="active",
        qr_token=secrets.token_urlsafe(18),
        qr_enabled=True,
    )
    db.add(new_user)
    await db.flush()
    db.add(UserAuth(user_id=new_user.id, password_hash=hash_password(new_pw)))

    app.status = "enrolled"
    app.enrolled_user_id = new_user.id
    db.add(AuditLog(
        user_id=current.id, action="PPDB_ENROLL",
        target_type="user", target_id=new_user.id,
    ))
    await db.commit()
    return Envelope(
        data={
            "user_id": new_user.id,
            "employee_id": employee_id,
            "initial_password": new_pw,
        },
        message="Calon siswa berhasil di-enroll. Berikan kredensial login ke siswa.",
    )
