"""Extended reports — laporan komprehensif lintas modul.

Disusun per kategori:
- Akademik: Nilai per kelas/mapel, GPA distribution, top/bottom performer
- Disiplin: KTS heatmap, recidivist ranking, apresiasi leaderboard
- Keuangan: Tagihan outstanding, collection rate, riwayat pembayaran
- Operasional: Pemakaian UKS, peminjaman library, kondisi inventaris
- PPDB: Statistik pendaftaran per gelombang
- Audit: Aktivitas user, login anomaly
"""
from __future__ import annotations

import csv
import io
from datetime import date, datetime, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    AdmissionApplication, AdmissionPeriod,
    Assignment, AssignmentGrade, AttendanceRecord, AuditLog,
    Bill, DisciplineIncident, DisciplineProfile, InventoryItem,
    LibraryBook, LibraryLoan, Payment, SchoolClass,
    Subject, UksMedicine, UksVisit, User,
)
from app.schemas import Envelope
from app.security import require_roles


router = APIRouter(prefix="/reports-ext", tags=["Reports - Extended"])


# ─── Helpers ────────────────────────────────────────────────────────────────


def _csv_response(rows: list[list], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    w = csv.writer(buf)
    for row in rows:
        w.writerow(row)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Akademik ──────────────────────────────────────────────────────────────


@router.get("/academic/class-performance", response_model=Envelope[list[dict]])
async def class_performance(
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    semester_start: Optional[date] = None,
):
    """Rata-rata nilai per kelas + jumlah siswa + persentase di atas KKM."""
    if semester_start is None:
        # Default 6 bulan terakhir
        semester_start = date.today() - timedelta(days=180)

    # Per kelas: avg score, jumlah siswa
    classes = (
        await db.execute(
            select(SchoolClass).where(SchoolClass.org_id == current.org_id).order_by(SchoolClass.name)
        )
    ).scalars().all()

    out = []
    for cls in classes:
        # Total siswa
        total = (
            await db.execute(
                select(func.count(User.id)).where(
                    User.school_class_id == cls.id,
                    User.role == "employee",
                    User.status == "active",
                )
            )
        ).scalar_one()

        # Avg nilai semester ini
        grade_data = (
            await db.execute(
                select(
                    func.avg(AssignmentGrade.score / Assignment.max_score * 100),
                    func.count(AssignmentGrade.id),
                )
                .join(Assignment, Assignment.id == AssignmentGrade.assignment_id)
                .join(User, User.id == AssignmentGrade.student_id)
                .where(
                    User.school_class_id == cls.id,
                    AssignmentGrade.graded_at >= datetime.combine(semester_start, datetime.min.time()),
                )
            )
        ).first()
        avg_score = float(grade_data[0]) if grade_data[0] is not None else 0
        n_grades = grade_data[1] or 0

        # Persen di atas KKM (default 75)
        above_kkm = (
            await db.execute(
                select(func.count(AssignmentGrade.id))
                .join(Assignment, Assignment.id == AssignmentGrade.assignment_id)
                .join(User, User.id == AssignmentGrade.student_id)
                .where(
                    User.school_class_id == cls.id,
                    AssignmentGrade.graded_at >= datetime.combine(semester_start, datetime.min.time()),
                    (AssignmentGrade.score / Assignment.max_score * 100) >= 75,
                )
            )
        ).scalar_one()

        # GPA rata-rata dari DisciplineProfile
        gpa = (
            await db.execute(
                select(func.avg(DisciplineProfile.gpa))
                .join(User, User.id == DisciplineProfile.user_id)
                .where(User.school_class_id == cls.id)
            )
        ).scalar_one() or 0

        out.append({
            "class_id": cls.id,
            "class_name": cls.name,
            "total_students": total,
            "avg_score": round(avg_score, 2),
            "graded_count": n_grades,
            "above_kkm_count": above_kkm,
            "above_kkm_pct": round(above_kkm / n_grades * 100, 1) if n_grades else 0,
            "avg_gpa": round(float(gpa), 2),
        })

    return Envelope(data=out)


@router.get("/academic/subject-performance", response_model=Envelope[list[dict]])
async def subject_performance(
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    semester_start: Optional[date] = None,
):
    """Rata-rata nilai per mata pelajaran."""
    if semester_start is None:
        semester_start = date.today() - timedelta(days=180)

    rows = (
        await db.execute(
            select(
                Subject.id, Subject.code, Subject.name,
                func.avg(AssignmentGrade.score / Assignment.max_score * 100).label("avg_score"),
                func.count(AssignmentGrade.id).label("n"),
                func.min(AssignmentGrade.score / Assignment.max_score * 100).label("min_score"),
                func.max(AssignmentGrade.score / Assignment.max_score * 100).label("max_score"),
            )
            .join(Assignment, Assignment.subject_id == Subject.id)
            .join(AssignmentGrade, AssignmentGrade.assignment_id == Assignment.id)
            .where(
                Subject.org_id == current.org_id,
                AssignmentGrade.graded_at >= datetime.combine(semester_start, datetime.min.time()),
            )
            .group_by(Subject.id, Subject.code, Subject.name)
            .order_by(Subject.code)
        )
    ).all()

    return Envelope(data=[
        {
            "subject_id": r.id,
            "subject_code": r.code,
            "subject_name": r.name,
            "avg_score": round(float(r.avg_score or 0), 2),
            "min_score": round(float(r.min_score or 0), 2),
            "max_score": round(float(r.max_score or 0), 2),
            "graded_count": r.n,
        }
        for r in rows
    ])


@router.get("/academic/top-students", response_model=Envelope[list[dict]])
async def top_students(
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 20,
    bottom: bool = False,
):
    """Top atau bottom siswa berdasarkan GPA."""
    order = DisciplineProfile.gpa.asc() if bottom else DisciplineProfile.gpa.desc()
    rows = (
        await db.execute(
            select(User, DisciplineProfile, SchoolClass)
            .join(DisciplineProfile, DisciplineProfile.user_id == User.id)
            .outerjoin(SchoolClass, SchoolClass.id == User.school_class_id)
            .where(
                User.org_id == current.org_id,
                User.role == "employee",
                User.status == "active",
            )
            .order_by(order)
            .limit(limit)
        )
    ).all()
    return Envelope(data=[
        {
            "student_id": user.id,
            "full_name": user.full_name,
            "employee_id": user.employee_id,
            "class_name": cls.name if cls else None,
            "gpa": round(profile.gpa, 2),
            "attitude_points": profile.attitude_points,
            "appreciation_points": profile.appreciation_points,
        }
        for user, profile, cls in rows
    ])


# ─── Disiplin ──────────────────────────────────────────────────────────────


@router.get("/discipline/incident-stats", response_model=Envelope[dict])
async def incident_stats(
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = 90,
):
    """Statistik insiden disiplin: total, by severity, by type, recidivist."""
    since = date.today() - timedelta(days=days)

    total = (
        await db.execute(
            select(func.count(DisciplineIncident.id))
            .join(User, User.id == DisciplineIncident.user_id)
            .where(
                User.org_id == current.org_id,
                DisciplineIncident.kind == "penalty",
                DisciplineIncident.incident_date >= since,
            )
        )
    ).scalar_one()

    # By severity (lookup via violation_types)
    from app.models import ViolationType
    severity_rows = (
        await db.execute(
            select(ViolationType.severity, func.count(DisciplineIncident.id))
            .join(DisciplineIncident, and_(
                DisciplineIncident.ref_code == ViolationType.code,
                DisciplineIncident.org_id == ViolationType.org_id,
            ))
            .join(User, User.id == DisciplineIncident.user_id)
            .where(
                User.org_id == current.org_id,
                DisciplineIncident.kind == "penalty",
                DisciplineIncident.incident_date >= since,
            )
            .group_by(ViolationType.severity)
        )
    ).all()

    # By incident type
    type_rows = (
        await db.execute(
            select(DisciplineIncident.ref_name, func.count(DisciplineIncident.id))
            .join(User, User.id == DisciplineIncident.user_id)
            .where(
                User.org_id == current.org_id,
                DisciplineIncident.kind == "penalty",
                DisciplineIncident.incident_date >= since,
            )
            .group_by(DisciplineIncident.ref_name)
            .order_by(func.count(DisciplineIncident.id).desc())
            .limit(10)
        )
    ).all()

    # Top 10 siswa repeat offender
    recidivist_rows = (
        await db.execute(
            select(
                User.id, User.full_name, User.employee_id,
                SchoolClass.name,
                func.count(DisciplineIncident.id).label("n"),
            )
            .join(DisciplineIncident, DisciplineIncident.user_id == User.id)
            .outerjoin(SchoolClass, SchoolClass.id == User.school_class_id)
            .where(
                User.org_id == current.org_id,
                DisciplineIncident.kind == "penalty",
                DisciplineIncident.incident_date >= since,
            )
            .group_by(User.id, User.full_name, User.employee_id, SchoolClass.name)
            .order_by(func.count(DisciplineIncident.id).desc())
            .limit(10)
        )
    ).all()

    return Envelope(data={
        "total_incidents": total,
        "by_severity": [{"severity": r[0], "count": r[1]} for r in severity_rows],
        "by_type": [{"type": r[0], "count": r[1]} for r in type_rows],
        "recidivists": [
            {
                "student_id": r[0], "full_name": r[1], "employee_id": r[2],
                "class_name": r[3], "incident_count": r[4],
            }
            for r in recidivist_rows
        ],
        "period_days": days,
    })


@router.get("/discipline/appreciation-leaderboard", response_model=Envelope[list[dict]])
async def appreciation_leaderboard(
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 20,
):
    """Top siswa dengan poin apresiasi tertinggi."""
    rows = (
        await db.execute(
            select(User, DisciplineProfile, SchoolClass)
            .join(DisciplineProfile, DisciplineProfile.user_id == User.id)
            .outerjoin(SchoolClass, SchoolClass.id == User.school_class_id)
            .where(
                User.org_id == current.org_id,
                User.role == "employee",
                DisciplineProfile.appreciation_points > 0,
            )
            .order_by(DisciplineProfile.appreciation_points.desc())
            .limit(limit)
        )
    ).all()
    return Envelope(data=[
        {
            "student_id": user.id,
            "full_name": user.full_name,
            "employee_id": user.employee_id,
            "class_name": cls.name if cls else None,
            "appreciation_points": profile.appreciation_points,
            "attitude_points": profile.attitude_points,
        }
        for user, profile, cls in rows
    ])


# ─── Keuangan ──────────────────────────────────────────────────────────────


@router.get("/finance/billing-summary", response_model=Envelope[dict])
async def billing_summary(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    period: Optional[str] = None,
):
    """Ringkasan tagihan: outstanding, collection rate, by category."""
    stmt = select(Bill).where(Bill.org_id == current.org_id)
    if period:
        stmt = stmt.where(Bill.period == period)
    bills = (await db.execute(stmt)).scalars().all()

    total_amount = sum(b.amount for b in bills)
    total_paid = sum(b.paid_amount for b in bills)
    outstanding = total_amount - total_paid
    n_total = len(bills)
    n_paid = sum(1 for b in bills if b.status == "paid")
    n_unpaid = sum(1 for b in bills if b.status == "unpaid")
    n_overdue = sum(1 for b in bills if b.status == "unpaid" and b.due_date and b.due_date < date.today())

    # Per kategori
    cat_rows = (
        await db.execute(
            select(
                Bill.category_id,
                func.sum(Bill.amount),
                func.sum(Bill.paid_amount),
                func.count(Bill.id),
            )
            .where(Bill.org_id == current.org_id)
            .group_by(Bill.category_id)
        )
    ).all()
    by_category = []
    for r in cat_rows:
        from app.models import BillCategory
        cat = await db.get(BillCategory, r[0]) if r[0] else None
        by_category.append({
            "category_id": r[0],
            "category_name": cat.name if cat else "?",
            "amount": float(r[1] or 0),
            "paid": float(r[2] or 0),
            "outstanding": float(r[1] or 0) - float(r[2] or 0),
            "count": r[3],
        })

    return Envelope(data={
        "total_amount": total_amount,
        "total_paid": total_paid,
        "outstanding": outstanding,
        "collection_rate": round(total_paid / total_amount * 100, 1) if total_amount else 0,
        "total_bills": n_total,
        "paid_bills": n_paid,
        "unpaid_bills": n_unpaid,
        "overdue_bills": n_overdue,
        "by_category": by_category,
    })


@router.get("/finance/payment-history", response_model=Envelope[list[dict]])
async def payment_history(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    limit: int = 200,
):
    """Riwayat pembayaran."""
    stmt = (
        select(Payment, Bill, User)
        .join(Bill, Bill.id == Payment.bill_id)
        .join(User, User.id == Bill.student_id)
        .where(User.org_id == current.org_id)
    )
    if from_date:
        stmt = stmt.where(Payment.paid_at >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        stmt = stmt.where(Payment.paid_at <= datetime.combine(to_date, datetime.max.time()))

    rows = (
        await db.execute(stmt.order_by(desc(Payment.paid_at)).limit(limit))
    ).all()

    return Envelope(data=[
        {
            "payment_id": p.id,
            "bill_id": p.bill_id,
            "student_name": user.full_name,
            "student_employee_id": user.employee_id,
            "amount": p.amount,
            "method": p.method,
            "reference": p.payment_ref,
            "paid_at": p.paid_at.isoformat(),
            "bill_period": bill.period,
        }
        for p, bill, user in rows
    ])


# ─── Operasional ──────────────────────────────────────────────────────────────


@router.get("/operational/uks-summary", response_model=Envelope[dict])
async def uks_summary(
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = 30,
):
    """Ringkasan kunjungan UKS."""
    since = date.today() - timedelta(days=days)
    visits = (
        await db.execute(
            select(UksVisit).where(
                UksVisit.org_id == current.org_id,
                UksVisit.visit_date >= since,
            )
        )
    ).scalars().all()

    by_outcome: dict[str, int] = {}
    by_class: dict[str, int] = {}
    for v in visits:
        by_outcome[v.outcome] = by_outcome.get(v.outcome, 0) + 1
        student = await db.get(User, v.student_id)
        if student and student.school_class_id:
            cls = await db.get(SchoolClass, student.school_class_id)
            if cls:
                by_class[cls.name] = by_class.get(cls.name, 0) + 1

    # Stok obat low/expiring
    meds = (
        await db.execute(
            select(UksMedicine).where(UksMedicine.org_id == current.org_id)
        )
    ).scalars().all()
    low_stock = [m for m in meds if m.stock <= m.low_stock_threshold]
    expiring = [
        m for m in meds
        if m.expire_date and (m.expire_date - date.today()).days <= 30
    ]

    return Envelope(data={
        "total_visits": len(visits),
        "by_outcome": by_outcome,
        "by_class": [{"class_name": k, "count": v} for k, v in sorted(by_class.items(), key=lambda x: -x[1])][:10],
        "low_stock_medicines": [
            {"name": m.name, "stock": m.stock, "threshold": m.low_stock_threshold}
            for m in low_stock
        ],
        "expiring_medicines": [
            {"name": m.name, "expire_date": m.expire_date.isoformat() if m.expire_date else None}
            for m in expiring
        ],
        "period_days": days,
    })


@router.get("/operational/library-summary", response_model=Envelope[dict])
async def library_summary(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Ringkasan perpustakaan: aktif, telat, top reader, top books."""
    today = date.today()

    total_books = (
        await db.execute(
            select(func.count(LibraryBook.id)).where(
                LibraryBook.org_id == current.org_id
            )
        )
    ).scalar_one()
    total_copies = (
        await db.execute(
            select(func.coalesce(func.sum(LibraryBook.total_copies), 0)).where(
                LibraryBook.org_id == current.org_id
            )
        )
    ).scalar_one()

    active_loans = (
        await db.execute(
            select(func.count(LibraryLoan.id))
            .join(LibraryBook, LibraryBook.id == LibraryLoan.book_id)
            .where(
                LibraryBook.org_id == current.org_id,
                LibraryLoan.status.in_(["borrowed", "overdue"]),
            )
        )
    ).scalar_one()
    overdue = (
        await db.execute(
            select(func.count(LibraryLoan.id))
            .join(LibraryBook, LibraryBook.id == LibraryLoan.book_id)
            .where(
                LibraryBook.org_id == current.org_id,
                LibraryLoan.status.in_(["borrowed", "overdue"]),
                LibraryLoan.due_date < today,
            )
        )
    ).scalar_one()

    # Top 5 buku paling sering dipinjam
    top_books_rows = (
        await db.execute(
            select(LibraryBook.title, func.count(LibraryLoan.id))
            .join(LibraryLoan, LibraryLoan.book_id == LibraryBook.id)
            .where(LibraryBook.org_id == current.org_id)
            .group_by(LibraryBook.title)
            .order_by(func.count(LibraryLoan.id).desc())
            .limit(5)
        )
    ).all()

    # Top reader
    top_reader_rows = (
        await db.execute(
            select(User.full_name, func.count(LibraryLoan.id))
            .join(LibraryLoan, LibraryLoan.student_id == User.id)
            .join(LibraryBook, LibraryBook.id == LibraryLoan.book_id)
            .where(LibraryBook.org_id == current.org_id)
            .group_by(User.full_name)
            .order_by(func.count(LibraryLoan.id).desc())
            .limit(5)
        )
    ).all()

    return Envelope(data={
        "total_books": total_books,
        "total_copies": int(total_copies),
        "active_loans": active_loans,
        "overdue": overdue,
        "top_books": [{"title": r[0], "loan_count": r[1]} for r in top_books_rows],
        "top_readers": [{"name": r[0], "loan_count": r[1]} for r in top_reader_rows],
    })


@router.get("/operational/inventory-summary", response_model=Envelope[dict])
async def inventory_summary(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Ringkasan inventaris: kondisi, kategori, total nilai."""
    items = (
        await db.execute(
            select(InventoryItem).where(InventoryItem.org_id == current.org_id)
        )
    ).scalars().all()

    by_condition: dict[str, dict] = {}
    by_category: dict[str, int] = {}
    by_location: dict[str, int] = {}
    total_value = 0.0

    for i in items:
        if i.condition not in by_condition:
            by_condition[i.condition] = {"count": 0, "qty": 0, "value": 0}
        by_condition[i.condition]["count"] += 1
        by_condition[i.condition]["qty"] += i.quantity
        if i.purchase_price:
            by_condition[i.condition]["value"] += i.purchase_price * i.quantity
            total_value += i.purchase_price * i.quantity

        cat = i.category or "Lainnya"
        by_category[cat] = by_category.get(cat, 0) + i.quantity
        if i.location:
            by_location[i.location] = by_location.get(i.location, 0) + i.quantity

    return Envelope(data={
        "total_items": len(items),
        "total_quantity": sum(i.quantity for i in items),
        "total_value": total_value,
        "by_condition": by_condition,
        "by_category": [{"category": k, "qty": v} for k, v in sorted(by_category.items(), key=lambda x: -x[1])],
        "by_location": [{"location": k, "qty": v} for k, v in sorted(by_location.items(), key=lambda x: -x[1])][:10],
    })


# ─── PPDB ──────────────────────────────────────────────────────────────


@router.get("/ppdb/period-stats", response_model=Envelope[list[dict]])
async def ppdb_period_stats(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Statistik PPDB per gelombang."""
    periods = (
        await db.execute(
            select(AdmissionPeriod)
            .where(AdmissionPeriod.org_id == current.org_id)
            .order_by(desc(AdmissionPeriod.start_at))
        )
    ).scalars().all()

    out = []
    for p in periods:
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
        conversion_rate = round(accepted / total * 100, 1) if total else 0

        out.append({
            "period_id": p.id,
            "period_name": p.name,
            "school_year": p.school_year,
            "is_active": p.is_active,
            "quota": p.quota,
            "start_at": p.start_at.isoformat(),
            "end_at": p.end_at.isoformat(),
            "total_applications": total,
            "by_status": counts,
            "conversion_rate": conversion_rate,
            "registration_fee_total": (counts.get("submitted", 0) + counts.get("reviewing", 0) + accepted) * p.registration_fee,
        })
    return Envelope(data=out)


# ─── Audit Activity ────────────────────────────────────────────────────────


@router.get("/audit/activity-summary", response_model=Envelope[dict])
async def audit_activity_summary(
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = 7,
):
    """Aktivitas audit log per hari + suspicious patterns."""
    since = datetime.utcnow() - timedelta(days=days)
    user_ids = (
        await db.execute(
            select(User.id).where(User.org_id == current.org_id)
        )
    ).scalars().all()

    if not user_ids:
        return Envelope(data={"daily": [], "by_action": [], "active_users": []})

    # Daily count
    daily_rows = (
        await db.execute(
            select(
                func.date(AuditLog.created_at).label("d"),
                func.count(AuditLog.id),
            )
            .where(
                AuditLog.user_id.in_(user_ids),
                AuditLog.created_at >= since,
            )
            .group_by(func.date(AuditLog.created_at))
            .order_by(func.date(AuditLog.created_at))
        )
    ).all()

    # Top active users
    active_rows = (
        await db.execute(
            select(User.full_name, func.count(AuditLog.id))
            .join(AuditLog, AuditLog.user_id == User.id)
            .where(
                User.org_id == current.org_id,
                AuditLog.created_at >= since,
                AuditLog.action == "LOGIN",
            )
            .group_by(User.full_name)
            .order_by(func.count(AuditLog.id).desc())
            .limit(10)
        )
    ).all()

    return Envelope(data={
        "daily": [{"date": str(r[0]), "count": r[1]} for r in daily_rows],
        "active_users": [{"name": r[0], "login_count": r[1]} for r in active_rows],
        "period_days": days,
    })


# ─── Export ──────────────────────────────────────────────────────────────


@router.get("/export/class-performance.csv")
async def export_class_performance_csv(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows: list[list] = [
        ["Kelas", "Total Siswa", "Jumlah Nilai", "Rata-Rata", "Tuntas KKM", "% Tuntas", "GPA Avg"],
    ]
    classes = (
        await db.execute(
            select(SchoolClass).where(SchoolClass.org_id == current.org_id).order_by(SchoolClass.name)
        )
    ).scalars().all()
    semester_start = date.today() - timedelta(days=180)
    for cls in classes:
        total = (
            await db.execute(
                select(func.count(User.id)).where(
                    User.school_class_id == cls.id,
                    User.role == "employee",
                    User.status == "active",
                )
            )
        ).scalar_one()
        gd = (
            await db.execute(
                select(
                    func.avg(AssignmentGrade.score / Assignment.max_score * 100),
                    func.count(AssignmentGrade.id),
                )
                .join(Assignment, Assignment.id == AssignmentGrade.assignment_id)
                .join(User, User.id == AssignmentGrade.student_id)
                .where(
                    User.school_class_id == cls.id,
                    AssignmentGrade.graded_at >= datetime.combine(semester_start, datetime.min.time()),
                )
            )
        ).first()
        avg_score = float(gd[0]) if gd[0] is not None else 0
        n = gd[1] or 0
        above = (
            await db.execute(
                select(func.count(AssignmentGrade.id))
                .join(Assignment, Assignment.id == AssignmentGrade.assignment_id)
                .join(User, User.id == AssignmentGrade.student_id)
                .where(
                    User.school_class_id == cls.id,
                    AssignmentGrade.graded_at >= datetime.combine(semester_start, datetime.min.time()),
                    (AssignmentGrade.score / Assignment.max_score * 100) >= 75,
                )
            )
        ).scalar_one()
        gpa = (
            await db.execute(
                select(func.avg(DisciplineProfile.gpa))
                .join(User, User.id == DisciplineProfile.user_id)
                .where(User.school_class_id == cls.id)
            )
        ).scalar_one() or 0
        pct = round(above / n * 100, 1) if n else 0
        rows.append([cls.name, total, n, round(avg_score, 2), above, pct, round(float(gpa), 2)])

    return _csv_response(rows, f"class_performance_{date.today()}.csv")


@router.get("/export/payment-history.csv")
async def export_payments_csv(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
):
    rows: list[list] = [
        ["Tanggal", "Siswa", "NIS", "Periode", "Jumlah", "Metode", "Referensi"],
    ]
    stmt = (
        select(Payment, Bill, User)
        .join(Bill, Bill.id == Payment.bill_id)
        .join(User, User.id == Bill.student_id)
        .where(User.org_id == current.org_id)
    )
    if from_date:
        stmt = stmt.where(Payment.paid_at >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        stmt = stmt.where(Payment.paid_at <= datetime.combine(to_date, datetime.max.time()))
    rs = (await db.execute(stmt.order_by(desc(Payment.paid_at)))).all()
    for p, bill, user in rs:
        rows.append([
            p.paid_at.strftime("%Y-%m-%d %H:%M"),
            user.full_name, user.employee_id, bill.period,
            p.amount, p.method or "-", p.payment_ref or "-",
        ])
    return _csv_response(rows, f"payments_{from_date or 'all'}_{to_date or 'all'}.csv")
