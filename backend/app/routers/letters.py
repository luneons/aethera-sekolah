"""Letter / Surat Otomatis endpoint."""
from __future__ import annotations

import secrets
from datetime import date, datetime
from pathlib import Path
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
import io
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import (
    AttendanceRecord,
    DisciplineIncident,
    DisciplineProfile,
    LetterIssue,
    Organization,
    SchoolClass,
    User,
)
from app.schemas import Envelope
from app.security import get_current_user, require_roles
from app.services.letter_service import (
    build_body_for,
    build_letter_pdf,
    format_id_date,
    gen_serial,
)


router = APIRouter(prefix="/letters", tags=["Letters"])


LETTER_DIR = Path(settings.SNAPSHOT_DIR).parent / "letters"
LETTER_DIR.mkdir(parents=True, exist_ok=True)


VALID_LETTER_TYPES = (
    "keterangan_aktif",
    "kelakuan_baik",
    "panggilan_ortu",
    "sehat_jasmani",
    "rekomendasi",
)


# ─── Schemas ────────────────────────────────────────────────────────────────


class LetterIssueIn(BaseModel):
    letter_type: str = Field(..., pattern="^(keterangan_aktif|kelakuan_baik|panggilan_ortu|sehat_jasmani|rekomendasi)$")
    student_id: int
    purpose: Optional[str] = Field(default=None, max_length=300)
    school_year: Optional[str] = Field(default=None, max_length=20)
    meeting_date: Optional[str] = None  # untuk panggilan ortu


class LetterIssueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    letter_type: str
    student_id: int
    student_name: str
    serial_number: str
    purpose: Optional[str] = None
    file_url: Optional[str] = None
    issued_by_name: Optional[str] = None
    issued_at: datetime


# ─── Helpers ────────────────────────────────────────────────────────────────


async def _gather_context(
    db: AsyncSession, student: User, payload: LetterIssueIn
) -> dict:
    """Kumpulkan data dinamis untuk template surat."""
    ctx: dict = {
        "school_year": payload.school_year,
        "purpose": payload.purpose,
    }

    profile = (
        await db.execute(
            select(DisciplineProfile).where(DisciplineProfile.user_id == student.id)
        )
    ).scalar_one_or_none()
    if profile:
        ctx["gpa"] = profile.gpa
        ctx["attitude_points"] = profile.attitude_points
        ctx["appreciation_points"] = profile.appreciation_points

    if payload.letter_type == "panggilan_ortu":
        ctx["meeting_date"] = payload.meeting_date or "secepatnya"
        # Cari KTS terbaru
        last = (
            await db.execute(
                select(DisciplineIncident)
                .where(
                    DisciplineIncident.user_id == student.id,
                    DisciplineIncident.kind == "penalty",
                )
                .order_by(DisciplineIncident.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if last:
            ctx["last_incident_summary"] = (
                f"insiden {last.ref_name} pada {format_id_date(last.incident_date)}"
            )

    return ctx


# ─── Endpoints ──────────────────────────────────────────────────────────────


@router.get("/types", response_model=Envelope[list[dict]])
async def list_types(
    current: Annotated[User, Depends(get_current_user)],
):
    return Envelope(data=[
        {"value": "keterangan_aktif", "label": "Surat Keterangan Aktif", "for": "Pendaftaran beasiswa, KIP, persyaratan luar"},
        {"value": "kelakuan_baik", "label": "Surat Kelakuan Baik", "for": "Pendaftaran sekolah lanjutan, lomba, beasiswa"},
        {"value": "panggilan_ortu", "label": "Surat Panggilan Orang Tua", "for": "Tindak lanjut KTS / kasus disiplin"},
        {"value": "sehat_jasmani", "label": "Surat Keterangan Sehat Jasmani", "for": "Mengikuti lomba / ekskul fisik"},
        {"value": "rekomendasi", "label": "Surat Rekomendasi", "for": "Pendaftaran sekolah / institusi lanjutan"},
    ])


@router.get("", response_model=Envelope[list[LetterIssueOut]])
async def list_letters(
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    student_id: Optional[int] = None,
    letter_type: Optional[str] = None,
):
    stmt = (
        select(LetterIssue)
        .where(LetterIssue.org_id == current.org_id)
        .order_by(LetterIssue.issued_at.desc())
    )
    if student_id:
        stmt = stmt.where(LetterIssue.student_id == student_id)
    if letter_type:
        stmt = stmt.where(LetterIssue.letter_type == letter_type)

    rows = (await db.execute(stmt.limit(200))).scalars().all()
    out: list[LetterIssueOut] = []
    for r in rows:
        student = await db.get(User, r.student_id)
        issuer = await db.get(User, r.issued_by)
        out.append(LetterIssueOut(
            id=r.id,
            letter_type=r.letter_type,
            student_id=r.student_id,
            student_name=student.full_name if student else "—",
            serial_number=r.serial_number,
            purpose=r.purpose,
            file_url=r.file_url,
            issued_by_name=issuer.full_name if issuer else None,
            issued_at=r.issued_at,
        ))
    return Envelope(data=out)


@router.post("/issue", response_model=Envelope[LetterIssueOut])
async def issue_letter(
    payload: LetterIssueIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Generate surat baru untuk siswa, simpan PDF + audit trail."""
    student = await db.get(User, payload.student_id)
    if not student or student.org_id != current.org_id:
        raise HTTPException(404, "Siswa tidak ditemukan")
    if student.role != "employee":
        raise HTTPException(400, "Hanya untuk akun siswa")

    org = await db.get(Organization, current.org_id)
    if not org:
        raise HTTPException(500, "Organisasi tidak ditemukan")

    # Counter berdasarkan tahun + tipe
    today = date.today()
    seq_count = (
        await db.execute(
            select(func.count(LetterIssue.id)).where(
                LetterIssue.org_id == current.org_id,
                func.date_format(LetterIssue.issued_at, "%Y") == str(today.year),
            )
        )
    ).scalar_one() or 0
    serial = gen_serial(payload.letter_type, int(seq_count) + 1)

    # Build context + body
    ctx = await _gather_context(db, student, payload)
    body_paragraphs, extra = build_body_for(payload.letter_type, ctx)

    cls = (
        await db.get(SchoolClass, student.school_class_id)
        if student.school_class_id else None
    )

    # Resolve issuer = kepala sekolah (super_admin pertama)
    kepsek = (
        await db.execute(
            select(User).where(
                User.org_id == current.org_id,
                User.role == "super_admin",
                User.status == "active",
            ).limit(1)
        )
    ).scalar_one_or_none()
    issuer_name = kepsek.full_name if kepsek else current.full_name
    issuer_position = "Kepala Sekolah" if kepsek else "Penanggung Jawab"

    pdf_bytes = build_letter_pdf(
        org_name=org.name,
        org_address=None,
        org_logo_path=None,
        letter_type=payload.letter_type,
        serial_number=serial,
        issue_date=today,
        student_name=student.full_name,
        student_nis=student.employee_id,
        student_class=cls.name if cls else None,
        body_paragraphs=body_paragraphs,
        purpose=payload.purpose,
        issuer_name=issuer_name,
        issuer_position=issuer_position,
    )

    file_name = f"letter_{payload.letter_type}_{student.employee_id}_{secrets.token_hex(4)}.pdf"
    file_path = LETTER_DIR / file_name
    file_path.write_bytes(pdf_bytes)

    issue = LetterIssue(
        org_id=current.org_id,
        letter_type=payload.letter_type,
        student_id=student.id,
        issued_by=current.id,
        serial_number=serial,
        purpose=payload.purpose,
        file_url=f"/letters-files/{file_name}",
        extra_data=extra,
    )
    db.add(issue)
    await db.commit()
    await db.refresh(issue)

    return Envelope(data=LetterIssueOut(
        id=issue.id,
        letter_type=issue.letter_type,
        student_id=issue.student_id,
        student_name=student.full_name,
        serial_number=issue.serial_number,
        purpose=issue.purpose,
        file_url=issue.file_url,
        issued_by_name=current.full_name,
        issued_at=issue.issued_at,
    ), message=f"Surat {serial} berhasil diterbitkan")


@router.get("/{letter_id}/download")
async def download_letter(
    letter_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    issue = await db.get(LetterIssue, letter_id)
    if not issue or issue.org_id != current.org_id:
        raise HTTPException(404, "Surat tidak ditemukan")

    # Akses: kepsek/wali/BK + siswa pemilik
    if current.role == "employee" and current.id != issue.student_id:
        raise HTTPException(403, "Bukan surat Anda")

    if not issue.file_url:
        raise HTTPException(404, "File tidak tersedia")
    file_path = LETTER_DIR / Path(issue.file_url).name
    if not file_path.exists():
        raise HTTPException(404, "File tidak ditemukan di server")

    return StreamingResponse(
        io.BytesIO(file_path.read_bytes()),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{file_path.name}"',
        },
    )
