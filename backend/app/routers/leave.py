"""Leave Request endpoints — pengajuan izin/sakit siswa."""
from __future__ import annotations

import secrets
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Annotated, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import (
    AttendanceRecord,
    LeaveRequest,
    SchoolClass,
    User,
)
from app.schemas import Envelope, Meta
from app.security import get_current_user, require_roles
from app.services.notification_service import notify_role, notify_user


router = APIRouter(prefix="/leave", tags=["Leave Requests"])


PROOFS_DIR = Path(settings.SNAPSHOT_DIR).parent / "proofs"
PROOFS_DIR.mkdir(parents=True, exist_ok=True)
MAX_PROOF_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_PROOF_TYPES = (
    "image/",
    "application/pdf",
)


# ─── Schemas ────────────────────────────────────────────────────────────────


class LeaveRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    student_id: int
    student_name: str
    student_nis: str
    student_class: Optional[str] = None
    kind: str
    start_date: date
    end_date: date
    days_count: int
    reason: str
    proof_file_url: Optional[str] = None
    proof_file_name: Optional[str] = None
    status: str
    decided_by_name: Optional[str] = None
    decided_at: Optional[datetime] = None
    decision_note: Optional[str] = None
    created_at: datetime


class DecisionIn(BaseModel):
    decision: str = Field(..., pattern="^(approve|reject)$")
    note: Optional[str] = Field(default=None, max_length=500)


# ─── Helpers ────────────────────────────────────────────────────────────────


async def _to_out(db: AsyncSession, lr: LeaveRequest) -> LeaveRequestOut:
    student = await db.get(User, lr.student_id)
    cls = (
        await db.get(SchoolClass, student.school_class_id)
        if student and student.school_class_id
        else None
    )
    decider = await db.get(User, lr.decided_by) if lr.decided_by else None
    return LeaveRequestOut(
        id=lr.id,
        student_id=lr.student_id,
        student_name=student.full_name if student else "—",
        student_nis=student.employee_id if student else "—",
        student_class=cls.name if cls else None,
        kind=lr.kind,
        start_date=lr.start_date,
        end_date=lr.end_date,
        days_count=(lr.end_date - lr.start_date).days + 1,
        reason=lr.reason,
        proof_file_url=lr.proof_file_url,
        proof_file_name=lr.proof_file_name,
        status=lr.status,
        decided_by_name=decider.full_name if decider else None,
        decided_at=lr.decided_at,
        decision_note=lr.decision_note,
        created_at=lr.created_at,
    )


def _can_approve(current: User, student: User) -> bool:
    """Wali kelas (admin yg pegang kelas siswa) / BK / kepsek boleh approve."""
    if current.role in ("super_admin", "hr"):
        return True
    if current.role == "admin":
        # Wali kelas dari siswa
        if (
            current.homeroom_class_id is not None
            and student.school_class_id == current.homeroom_class_id
        ):
            return True
    return False


# ─── Endpoint Siswa: ajukan ─────────────────────────────────────────────────


@router.post("", response_model=Envelope[LeaveRequestOut], status_code=201)
async def create_leave_request(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    kind: Annotated[str, Form()] = "izin",
    start_date: Annotated[date, Form()] = ...,
    end_date: Annotated[date, Form()] = ...,
    reason: Annotated[str, Form()] = ...,
    proof: Optional[UploadFile] = File(default=None),
):
    """Siswa ajukan izin/sakit. Wali kelas + BK akan dapat notifikasi."""
    if current.role != "employee":
        raise HTTPException(403, "Hanya siswa yang bisa mengajukan izin")

    if kind not in ("sakit", "izin", "lainnya"):
        raise HTTPException(422, "kind harus salah satu: sakit | izin | lainnya")

    if end_date < start_date:
        raise HTTPException(422, "Tanggal selesai harus >= tanggal mulai")

    if (end_date - start_date).days > 30:
        raise HTTPException(422, "Maksimal 30 hari per pengajuan")

    if not reason or len(reason.strip()) < 5:
        raise HTTPException(422, "Alasan minimal 5 karakter")

    # Cek tidak overlap dengan pengajuan pending/approved lain
    overlap = (
        await db.execute(
            select(LeaveRequest).where(
                LeaveRequest.student_id == current.id,
                LeaveRequest.status.in_(["pending", "approved"]),
                LeaveRequest.start_date <= end_date,
                LeaveRequest.end_date >= start_date,
            )
        )
    ).scalar_one_or_none()
    if overlap:
        raise HTTPException(
            400,
            f"Sudah ada pengajuan {overlap.status} di range tanggal yang overlap "
            f"({overlap.start_date} s/d {overlap.end_date}).",
        )

    # Upload bukti kalau ada
    proof_url = None
    proof_name = None
    proof_mime = None
    if proof and proof.filename:
        from app.services.file_security import validate_file, safe_filename
        content = await proof.read()
        ok, detected, err = validate_file(
            content,
            allowed_categories=["image", "pdf"],
            max_size_bytes=MAX_PROOF_SIZE,
            declared_mime=proof.content_type,
        )
        if not ok:
            raise HTTPException(400, err or "Bukti tidak valid")
        safe_name = safe_filename(proof.filename)
        stored = f"leave_{current.id}_{secrets.token_hex(6)}_{safe_name}"
        path = PROOFS_DIR / stored
        path.write_bytes(content)
        proof_url = f"/proofs/{stored}"
        proof_name = safe_name
        proof_mime = detected

    lr = LeaveRequest(
        org_id=current.org_id,
        student_id=current.id,
        kind=kind,
        start_date=start_date,
        end_date=end_date,
        reason=reason.strip(),
        proof_file_url=proof_url,
        proof_file_name=proof_name,
        proof_file_mime=proof_mime,
        status="pending",
    )
    db.add(lr)
    await db.commit()
    await db.refresh(lr)

    # Notif ke wali kelas siswa + BK + kepsek
    try:
        days = (end_date - start_date).days + 1
        title = f"Pengajuan {kind.upper()}: {current.full_name}"
        body = (
            f"{start_date.strftime('%d %b')} s/d {end_date.strftime('%d %b %Y')} "
            f"({days} hari). Alasan: {reason[:80]}"
        )
        # Wali kelas yang pegang kelas siswa
        if current.school_class_id:
            wali = (
                await db.execute(
                    select(User).where(
                        User.role == "admin",
                        User.homeroom_class_id == current.school_class_id,
                        User.status == "active",
                    )
                )
            ).scalars().all()
            for w in wali:
                await notify_user(
                    db, w.id,
                    title=title,
                    body=body,
                    category="leave_request",
                    url="/leave",
                )
        # BK + kepsek
        await notify_role(
            db, current.org_id, "hr",
            title=title, body=body, category="leave_request", url="/leave",
        )
        await notify_role(
            db, current.org_id, "super_admin",
            title=title, body=body, category="leave_request", url="/leave",
        )
    except Exception:
        pass

    return Envelope(
        data=await _to_out(db, lr),
        message="Pengajuan terkirim. Tunggu persetujuan wali kelas atau BK.",
    )


# ─── Endpoint List ──────────────────────────────────────────────────────────


@router.get("", response_model=Envelope[list[LeaveRequestOut]])
async def list_leave_requests(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """List pengajuan izin.

    - Siswa: hanya pengajuan dirinya
    - Wali kelas: pengajuan siswa kelas yang dia pegang
    - BK/kepsek: semua pengajuan di org
    """
    stmt = select(LeaveRequest).where(LeaveRequest.org_id == current.org_id)

    if current.role == "employee":
        stmt = stmt.where(LeaveRequest.student_id == current.id)
    elif current.role == "admin":
        if not current.homeroom_class_id:
            return Envelope(data=[], meta=Meta(page=page, per_page=per_page, total=0))
        # Filter siswa di kelas yang dia pegang
        student_ids_q = select(User.id).where(
            User.school_class_id == current.homeroom_class_id,
            User.role == "employee",
        )
        stmt = stmt.where(LeaveRequest.student_id.in_(student_ids_q))
    # super_admin & hr: semua

    if status_filter:
        if status_filter not in ("pending", "approved", "rejected", "cancelled"):
            raise HTTPException(422, "status filter tidak valid")
        stmt = stmt.where(LeaveRequest.status == status_filter)

    total = (
        await db.execute(select(func.count()).select_from(stmt.subquery()))
    ).scalar_one()

    rows = (
        await db.execute(
            stmt.order_by(LeaveRequest.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
    ).scalars().all()

    out = [await _to_out(db, lr) for lr in rows]
    return Envelope(data=out, meta=Meta(page=page, per_page=per_page, total=total))


@router.get("/pending-count", response_model=Envelope[dict])
async def pending_count(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Jumlah pengajuan pending yang user ini perlu putuskan."""
    if current.role == "employee":
        return {"success": True, "data": {"count": 0}}

    stmt = select(func.count(LeaveRequest.id)).where(
        LeaveRequest.org_id == current.org_id,
        LeaveRequest.status == "pending",
    )
    if current.role == "admin":
        if not current.homeroom_class_id:
            return {"success": True, "data": {"count": 0}}
        student_ids_q = select(User.id).where(
            User.school_class_id == current.homeroom_class_id,
            User.role == "employee",
        )
        stmt = stmt.where(LeaveRequest.student_id.in_(student_ids_q))

    total = (await db.execute(stmt)).scalar_one() or 0
    return {"success": True, "data": {"count": int(total)}}


# ─── Decision ───────────────────────────────────────────────────────────────


@router.post("/{leave_id}/decide", response_model=Envelope[LeaveRequestOut])
async def decide(
    leave_id: int,
    payload: DecisionIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    lr = await db.get(LeaveRequest, leave_id)
    if not lr or lr.org_id != current.org_id:
        raise HTTPException(404, "Pengajuan tidak ditemukan")
    if lr.status != "pending":
        raise HTTPException(400, f"Pengajuan sudah {lr.status}")

    student = await db.get(User, lr.student_id)
    if not student:
        raise HTTPException(404, "Siswa tidak ditemukan")

    if not _can_approve(current, student):
        raise HTTPException(
            403,
            "Hanya wali kelas siswa, guru BK, atau kepala sekolah yang boleh memutuskan.",
        )

    new_status = "approved" if payload.decision == "approve" else "rejected"
    lr.status = new_status
    lr.decided_by = current.id
    lr.decided_at = datetime.utcnow()
    lr.decision_note = payload.note

    # Kalau approved → auto-update attendance jadi excused untuk range tanggal
    affected_dates = 0
    if new_status == "approved":
        cur = lr.start_date
        while cur <= lr.end_date:
            # Skip Sabtu/Minggu
            if cur.weekday() < 5:
                rec = (
                    await db.execute(
                        select(AttendanceRecord).where(
                            AttendanceRecord.user_id == lr.student_id,
                            AttendanceRecord.attendance_date == cur,
                        )
                    )
                ).scalar_one_or_none()
                note = f"Izin/sakit (#{lr.id}): {lr.reason[:120]}"
                if rec:
                    # Override status absen jadi excused
                    rec.status = "excused"
                    rec.notes = note
                else:
                    db.add(
                        AttendanceRecord(
                            user_id=lr.student_id,
                            attendance_date=cur,
                            status="excused",
                            notes=note,
                            check_in_method="manual",
                        )
                    )
                affected_dates += 1
            cur = cur + timedelta(days=1)

    await db.commit()
    await db.refresh(lr)

    # Notif ke siswa
    try:
        verdict = "disetujui" if new_status == "approved" else "ditolak"
        await notify_user(
            db, lr.student_id,
            title=f"Pengajuan {lr.kind} {verdict}",
            body=(
                f"{lr.start_date.strftime('%d %b')} - {lr.end_date.strftime('%d %b %Y')} "
                f"oleh {current.full_name}."
                + (f" Catatan: {payload.note}" if payload.note else "")
            ),
            category="leave_decision",
            url="/leave",
        )
    except Exception:
        pass

    return Envelope(
        data=await _to_out(db, lr),
        message=(
            f"Pengajuan {new_status}"
            + (f" — {affected_dates} hari kehadiran di-mark excused." if new_status == "approved" else "")
        ),
    )


@router.post("/{leave_id}/cancel", response_model=Envelope[LeaveRequestOut])
async def cancel(
    leave_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Siswa batalin pengajuannya sendiri (hanya saat status pending)."""
    lr = await db.get(LeaveRequest, leave_id)
    if not lr:
        raise HTTPException(404, "Pengajuan tidak ditemukan")
    if lr.student_id != current.id:
        raise HTTPException(403, "Hanya pemilik pengajuan yang bisa batalin")
    if lr.status != "pending":
        raise HTTPException(400, "Hanya pengajuan pending yang bisa dibatalin")

    lr.status = "cancelled"
    lr.decided_at = datetime.utcnow()
    await db.commit()
    await db.refresh(lr)
    return Envelope(data=await _to_out(db, lr), message="Pengajuan dibatalkan")
