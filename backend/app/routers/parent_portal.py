"""Portal Orang Tua — login terpisah dari staff sekolah.

Auth: bcrypt password + JWT subject prefix 'parent:' agar tidak bentrok
dengan token staff biasa.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import (
    AttendanceRecord,
    AssignmentGrade,
    Assignment,
    Bill,
    BillCategory,
    DisciplineIncident,
    DisciplineProfile,
    LeaveRequest,
    ParentAccount,
    ParentLink,
    Payment,
    SchoolClass,
    User,
)
from app.schemas import Envelope
from app.services.rate_limiter import make_limiter


router = APIRouter(prefix="/parent", tags=["Parent Portal"])

parent_oauth = OAuth2PasswordBearer(tokenUrl="/v1/parent/login", auto_error=False)

_limit_parent_login = make_limiter(10, 60, "login ortu")


# ─── Helpers ────────────────────────────────────────────────────────────────


def _hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def _verify_password(pw: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(pw.encode("utf-8")[:72], hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _create_parent_token(parent_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 24
    )
    payload = {
        "sub": f"parent:{parent_id}",
        "exp": expire,
        "type": "parent_access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


async def get_current_parent(
    token: Annotated[Optional[str], Depends(parent_oauth)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ParentAccount:
    if not token:
        raise HTTPException(401, "Belum login")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        sub = payload.get("sub", "")
        if not sub.startswith("parent:"):
            raise HTTPException(401, "Token bukan untuk portal ortu")
        if payload.get("type") != "parent_access":
            raise HTTPException(401, "Token type salah")
        parent_id = int(sub.split(":", 1)[1])
    except (JWTError, ValueError, KeyError):
        raise HTTPException(401, "Token invalid atau expired")

    parent = await db.get(ParentAccount, parent_id)
    if not parent or not parent.is_active:
        raise HTTPException(401, "Akun tidak aktif")
    return parent


async def _get_linked_students(
    db: AsyncSession, parent: ParentAccount
) -> list[User]:
    rows = (
        await db.execute(
            select(User)
            .join(ParentLink, ParentLink.student_id == User.id)
            .where(ParentLink.parent_id == parent.id, User.status == "active")
            .order_by(User.full_name)
        )
    ).scalars().all()
    return list(rows)


async def _ensure_parent_owns_student(
    db: AsyncSession, parent: ParentAccount, student_id: int
) -> User:
    link = (
        await db.execute(
            select(ParentLink, User)
            .join(User, User.id == ParentLink.student_id)
            .where(
                ParentLink.parent_id == parent.id,
                ParentLink.student_id == student_id,
            )
        )
    ).first()
    if not link:
        raise HTTPException(403, "Bukan anak Anda")
    return link[1]


# ─── Schemas ────────────────────────────────────────────────────────────────


class ParentLoginIn(BaseModel):
    phone: str
    password: str


class ParentTokenOut(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    parent_id: int
    parent_name: str
    children_count: int


class ChildSummary(BaseModel):
    id: int
    full_name: str
    employee_id: str
    photo_url: Optional[str] = None
    class_name: Optional[str] = None
    relationship: str
    today_attendance_status: Optional[str] = None
    today_check_in_at: Optional[datetime] = None
    attitude_points: int = 100
    appreciation_points: int = 0
    overall_gpa: Optional[float] = None
    unpaid_bills_count: int = 0
    unpaid_total: float = 0.0


class AttendanceRow(BaseModel):
    date: date
    status: str
    check_in_at: Optional[datetime] = None
    check_out_at: Optional[datetime] = None
    late_minutes: int = 0
    notes: Optional[str] = None


class GradeRow(BaseModel):
    assignment_title: str
    subject_code: str
    subject_name: str
    teacher_name: str
    score: float
    max_score: float
    percent: float
    graded_at: Optional[datetime] = None


class IncidentRow(BaseModel):
    id: int
    kind: str
    incident_date: date
    ref_name: str
    attitude_delta: int
    appreciation_delta: int
    notes: Optional[str] = None


class BillSummary(BaseModel):
    id: int
    category_name: str
    period: str
    amount: float
    paid_amount: float
    remaining: float
    due_date: Optional[date] = None
    status: str


# ─── Endpoints ──────────────────────────────────────────────────────────────


@router.post("/login", response_model=Envelope[ParentTokenOut])
async def parent_login(
    payload: ParentLoginIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    _rl: None = Depends(_limit_parent_login),
):
    """Login orang tua pakai HP + password yang dibuat admin sekolah."""
    MAX_ATTEMPTS = 5
    LOCK_MIN = 15
    invalid_msg = "Nomor HP atau password salah"

    # Normalize phone
    phone = payload.phone.strip().replace(" ", "").replace("-", "")
    if phone.startswith("+62"):
        phone = "0" + phone[3:]

    parent = (
        await db.execute(
            select(ParentAccount).where(ParentAccount.phone == phone)
        )
    ).scalar_one_or_none()
    if not parent:
        raise HTTPException(401, invalid_msg)

    now = datetime.utcnow()
    if parent.locked_until and parent.locked_until > now:
        remaining = int((parent.locked_until - now).total_seconds() / 60) + 1
        raise HTTPException(
            429, f"Akun terkunci. Coba lagi {remaining} menit."
        )

    if not _verify_password(payload.password, parent.password_hash):
        parent.failed_attempts = (parent.failed_attempts or 0) + 1
        if parent.failed_attempts >= MAX_ATTEMPTS:
            parent.locked_until = now + timedelta(minutes=LOCK_MIN)
            await db.commit()
            raise HTTPException(
                429, f"Akun terkunci {LOCK_MIN} menit setelah {MAX_ATTEMPTS} percobaan gagal.",
            )
        await db.commit()
        raise HTTPException(401, invalid_msg)

    if not parent.is_active:
        raise HTTPException(403, "Akun dinonaktifkan")

    parent.failed_attempts = 0
    parent.locked_until = None
    parent.last_login_at = now
    await db.commit()

    children = await _get_linked_students(db, parent)
    token = _create_parent_token(parent.id)
    return Envelope(data=ParentTokenOut(
        access_token=token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 24 * 60,
        parent_id=parent.id,
        parent_name=parent.full_name,
        children_count=len(children),
    ))


@router.get("/me", response_model=Envelope[dict])
async def parent_me(
    parent: Annotated[ParentAccount, Depends(get_current_parent)],
):
    return Envelope(data={
        "id": parent.id,
        "full_name": parent.full_name,
        "phone": parent.phone,
        "email": parent.email,
    })


@router.get("/children", response_model=Envelope[list[ChildSummary]])
async def list_children(
    parent: Annotated[ParentAccount, Depends(get_current_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    students_with_link = (
        await db.execute(
            select(User, ParentLink, SchoolClass)
            .join(ParentLink, ParentLink.student_id == User.id)
            .outerjoin(SchoolClass, SchoolClass.id == User.school_class_id)
            .where(ParentLink.parent_id == parent.id, User.status == "active")
            .order_by(User.full_name)
        )
    ).all()

    today = date.today()
    out: list[ChildSummary] = []

    for student, link, cls in students_with_link:
        today_rec = (
            await db.execute(
                select(AttendanceRecord).where(
                    AttendanceRecord.user_id == student.id,
                    AttendanceRecord.attendance_date == today,
                )
            )
        ).scalar_one_or_none()

        prof = (
            await db.execute(
                select(DisciplineProfile).where(
                    DisciplineProfile.user_id == student.id
                )
            )
        ).scalar_one_or_none()

        unpaid = (
            await db.execute(
                select(
                    func.count(Bill.id),
                    func.coalesce(func.sum(Bill.amount - Bill.paid_amount), 0),
                ).where(
                    Bill.student_id == student.id,
                    Bill.status == "unpaid",
                )
            )
        ).one()

        out.append(ChildSummary(
            id=student.id,
            full_name=student.full_name,
            employee_id=student.employee_id,
            photo_url=student.photo_url,
            class_name=cls.name if cls else None,
            relationship=link.relationship,
            today_attendance_status=today_rec.status if today_rec else None,
            today_check_in_at=today_rec.check_in_at if today_rec else None,
            attitude_points=prof.attitude_points if prof else 100,
            appreciation_points=prof.appreciation_points if prof else 0,
            overall_gpa=prof.gpa if prof else None,
            unpaid_bills_count=int(unpaid[0] or 0),
            unpaid_total=float(unpaid[1] or 0),
        ))

    return Envelope(data=out)


@router.get("/children/{student_id}/attendance", response_model=Envelope[list[AttendanceRow]])
async def child_attendance(
    student_id: int,
    parent: Annotated[ParentAccount, Depends(get_current_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = 30,
):
    await _ensure_parent_owns_student(db, parent, student_id)
    cutoff = date.today() - timedelta(days=days)
    rows = (
        await db.execute(
            select(AttendanceRecord)
            .where(
                AttendanceRecord.user_id == student_id,
                AttendanceRecord.attendance_date >= cutoff,
            )
            .order_by(AttendanceRecord.attendance_date.desc())
        )
    ).scalars().all()
    return Envelope(data=[
        AttendanceRow(
            date=r.attendance_date,
            status=r.status,
            check_in_at=r.check_in_at,
            check_out_at=r.check_out_at,
            late_minutes=r.late_minutes or 0,
            notes=r.notes,
        )
        for r in rows
    ])


@router.get("/children/{student_id}/grades", response_model=Envelope[list[GradeRow]])
async def child_grades(
    student_id: int,
    parent: Annotated[ParentAccount, Depends(get_current_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from app.models import Subject

    await _ensure_parent_owns_student(db, parent, student_id)
    rows = (
        await db.execute(
            select(AssignmentGrade, Assignment, Subject, User)
            .join(Assignment, Assignment.id == AssignmentGrade.assignment_id)
            .join(Subject, Subject.id == Assignment.subject_id)
            .join(User, User.id == Assignment.teacher_id)
            .where(AssignmentGrade.student_id == student_id)
            .order_by(AssignmentGrade.graded_at.desc())
        )
    ).all()
    return Envelope(data=[
        GradeRow(
            assignment_title=asg.title,
            subject_code=subj.code,
            subject_name=subj.name,
            teacher_name=teacher.full_name,
            score=float(grade.score),
            max_score=float(asg.max_score),
            percent=round((grade.score / asg.max_score * 100) if asg.max_score else 0, 2),
            graded_at=grade.graded_at,
        )
        for grade, asg, subj, teacher in rows
    ])


@router.get("/children/{student_id}/incidents", response_model=Envelope[list[IncidentRow]])
async def child_incidents(
    student_id: int,
    parent: Annotated[ParentAccount, Depends(get_current_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = 90,
):
    await _ensure_parent_owns_student(db, parent, student_id)
    cutoff = date.today() - timedelta(days=days)
    rows = (
        await db.execute(
            select(DisciplineIncident)
            .where(
                DisciplineIncident.user_id == student_id,
                DisciplineIncident.incident_date >= cutoff,
            )
            .order_by(DisciplineIncident.incident_date.desc())
        )
    ).scalars().all()
    return Envelope(data=[
        IncidentRow(
            id=i.id,
            kind=i.kind,
            incident_date=i.incident_date,
            ref_name=i.ref_name,
            attitude_delta=i.attitude_delta,
            appreciation_delta=i.appreciation_delta,
            notes=i.notes,
        )
        for i in rows
    ])


@router.get("/children/{student_id}/bills", response_model=Envelope[list[BillSummary]])
async def child_bills(
    student_id: int,
    parent: Annotated[ParentAccount, Depends(get_current_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _ensure_parent_owns_student(db, parent, student_id)
    rows = (
        await db.execute(
            select(Bill, BillCategory)
            .join(BillCategory, BillCategory.id == Bill.category_id)
            .where(Bill.student_id == student_id)
            .order_by(Bill.due_date.desc(), Bill.created_at.desc())
        )
    ).all()
    out: list[BillSummary] = []
    for bill, cat in rows:
        remaining = max(0, bill.amount - bill.paid_amount)
        out.append(BillSummary(
            id=bill.id,
            category_name=cat.name,
            period=bill.period,
            amount=bill.amount,
            paid_amount=bill.paid_amount,
            remaining=remaining,
            due_date=bill.due_date,
            status=bill.status,
        ))
    return Envelope(data=out)


@router.get("/billing/midtrans-config", response_model=Envelope[dict])
async def parent_midtrans_config(
    parent: Annotated[ParentAccount, Depends(get_current_parent)],
):
    """Cek apakah pembayaran online aktif + client key untuk frontend ortu."""
    from app.services import midtrans_service as midtrans
    return Envelope(data={
        "enabled": midtrans.is_configured(),
        "client_key": settings.MIDTRANS_CLIENT_KEY,
        "is_production": settings.MIDTRANS_IS_PRODUCTION,
    })


@router.post("/bills/{bill_id}/pay-online", response_model=Envelope[dict])
async def parent_pay_online(
    bill_id: int,
    parent: Annotated[ParentAccount, Depends(get_current_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Ortu bayar tagihan anak via Midtrans Snap."""
    import secrets
    from datetime import timezone as _tz
    from app.services import midtrans_service as midtrans

    bill = await db.get(Bill, bill_id)
    if not bill:
        raise HTTPException(404, "Tagihan tidak ditemukan")
    # Pastikan ortu pegang siswa pemilik tagihan ini
    student = await _ensure_parent_owns_student(db, parent, bill.student_id)

    if not midtrans.is_configured():
        raise HTTPException(503, "Pembayaran online belum diaktifkan sekolah")
    if bill.status == "paid":
        raise HTTPException(400, "Tagihan sudah lunas")
    if bill.status == "waived":
        raise HTTPException(400, "Tagihan sudah dibebaskan")

    remaining = int(round(bill.amount - bill.paid_amount))
    if remaining <= 0:
        raise HTTPException(400, "Tidak ada sisa tagihan")

    cat = await db.get(BillCategory, bill.category_id)
    cat_name = cat.name if cat else "Tagihan Sekolah"
    order_id = f"AETHERA-{bill.id}-{secrets.token_hex(4)}"

    try:
        result = await midtrans.create_snap_transaction(
            order_id=order_id,
            gross_amount=remaining,
            customer_name=parent.full_name or student.full_name,
            customer_email=parent.email,
            customer_phone=parent.phone,
            item_name=f"{cat_name} {bill.period}",
            item_id=str(bill.id),
        )
    except midtrans.MidtransError as e:
        raise HTTPException(502, str(e))

    bill.midtrans_order_id = order_id
    bill.midtrans_token = result["token"]
    bill.midtrans_redirect_url = result.get("redirect_url")
    bill.midtrans_status = "pending"
    bill.midtrans_token_at = datetime.now(_tz.utc).replace(tzinfo=None)
    await db.commit()

    return Envelope(data={
        "token": result["token"],
        "redirect_url": result.get("redirect_url"),
        "client_key": settings.MIDTRANS_CLIENT_KEY,
        "is_production": settings.MIDTRANS_IS_PRODUCTION,
        "order_id": order_id,
    }, message="Token pembayaran dibuat")


# ─── Pengajuan Izin via Portal Ortu ─────────────────────────────────────────


class ParentLeaveIn(BaseModel):
    student_id: int
    kind: str = Field(default="izin", pattern="^(sakit|izin|lainnya)$")
    start_date: date
    end_date: date
    reason: str = Field(min_length=5, max_length=1000)


@router.post("/leave", response_model=Envelope[dict])
async def parent_create_leave(
    payload: ParentLeaveIn,
    parent: Annotated[ParentAccount, Depends(get_current_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Ortu ajukan izin atas nama anak."""
    student = await _ensure_parent_owns_student(db, parent, payload.student_id)
    if payload.end_date < payload.start_date:
        raise HTTPException(422, "Tanggal selesai harus >= mulai")

    overlap = (
        await db.execute(
            select(LeaveRequest).where(
                LeaveRequest.student_id == student.id,
                LeaveRequest.status.in_(["pending", "approved"]),
                LeaveRequest.start_date <= payload.end_date,
                LeaveRequest.end_date >= payload.start_date,
            )
        )
    ).scalar_one_or_none()
    if overlap:
        raise HTTPException(400, "Sudah ada pengajuan overlap di tanggal yang sama")

    lr = LeaveRequest(
        org_id=student.org_id,
        student_id=student.id,
        kind=payload.kind,
        start_date=payload.start_date,
        end_date=payload.end_date,
        reason=f"[Diajukan oleh ortu: {parent.full_name}] {payload.reason.strip()}",
        status="pending",
    )
    db.add(lr)
    await db.commit()
    await db.refresh(lr)

    # Notif ke wali kelas + BK + kepsek
    try:
        from app.services.notification_service import notify_role, notify_user
        days = (payload.end_date - payload.start_date).days + 1
        title = f"Pengajuan {payload.kind.upper()} dari ortu: {student.full_name}"
        body = (
            f"{payload.start_date.strftime('%d %b')} s/d {payload.end_date.strftime('%d %b %Y')} "
            f"({days} hari). Diajukan oleh {parent.full_name}."
        )
        if student.school_class_id:
            wali = (
                await db.execute(
                    select(User).where(
                        User.role == "admin",
                        User.homeroom_class_id == student.school_class_id,
                        User.status == "active",
                    )
                )
            ).scalars().all()
            for w in wali:
                await notify_user(
                    db, w.id, title=title, body=body,
                    category="leave_request", url="/leave",
                )
        await notify_role(
            db, student.org_id, "hr",
            title=title, body=body, category="leave_request", url="/leave",
        )
    except Exception:
        pass

    return Envelope(data={"id": lr.id}, message="Pengajuan terkirim ke wali kelas / BK")
