"""Billing / SPP — manajemen tagihan sekolah & pembayaran.

Flow:
1. Sekolah bikin BillCategory (SPP, Uang Gedung, dst)
2. Bulk-generate Bill ke semua siswa untuk periode tertentu
3. Pembayaran dicatat (manual / transfer / qris). Tipe Midtrans bisa
   diintegrasikan kemudian — saat ini support "manual" untuk demo.
4. Status auto-update: paid kalau paid_amount >= amount
5. Notif push & WA ke ortu saat:
   - Tagihan baru di-issue
   - Mendekati jatuh tempo (job harian)
   - Pembayaran diterima
"""
from __future__ import annotations

import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import (
    Bill,
    BillCategory,
    Payment,
    SchoolClass,
    User,
    ParentAccount,
    ParentLink,
)
from app.schemas import Envelope, Meta
from app.security import get_current_user, require_roles
from app.services.notification_service import notify_user
from app.services import midtrans_service as midtrans


router = APIRouter(prefix="/billing", tags=["Billing / SPP"])


# ─── Schemas ────────────────────────────────────────────────────────────────


class CategoryIn(BaseModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=2, max_length=100)
    default_amount: float = Field(default=0.0, ge=0)
    recurring: str = Field(default="none", pattern="^(none|monthly|yearly)$")
    description: Optional[str] = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    default_amount: float
    recurring: str
    description: Optional[str] = None
    is_active: bool


class BillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    student_id: int
    student_name: str
    student_class: Optional[str] = None
    category_id: int
    category_name: str
    period: str
    amount: float
    paid_amount: float
    remaining: float
    due_date: Optional[date] = None
    status: str
    notes: Optional[str] = None
    created_at: datetime


class BulkGenerateIn(BaseModel):
    category_id: int
    period: str = Field(min_length=4, max_length=20)
    amount: Optional[float] = None  # null → pakai default_amount kategori
    due_date: Optional[date] = None
    target_class_ids: list[int] = Field(default_factory=list)  # kosong = semua kelas
    notes: Optional[str] = None


class PaymentIn(BaseModel):
    bill_id: int
    amount: float = Field(gt=0)
    method: str = Field(default="manual", pattern="^(cash|transfer|qris|midtrans|manual)$")
    payment_ref: Optional[str] = None
    notes: Optional[str] = None


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    bill_id: int
    amount: float
    method: str
    payment_ref: Optional[str] = None
    notes: Optional[str] = None
    paid_at: datetime


# ─── Midtrans schemas ───────────────────────────────────────────────────────


class PayOnlineIn(BaseModel):
    bill_id: int


class PayOnlineOut(BaseModel):
    token: str
    redirect_url: Optional[str] = None
    client_key: str
    is_production: bool
    order_id: str


# ─── Helpers ────────────────────────────────────────────────────────────────


async def _bill_to_out(db: AsyncSession, bill: Bill) -> BillOut:
    student = await db.get(User, bill.student_id)
    cat = await db.get(BillCategory, bill.category_id)
    cls_name = None
    if student and student.school_class_id:
        c = await db.get(SchoolClass, student.school_class_id)
        cls_name = c.name if c else None
    return BillOut(
        id=bill.id,
        student_id=bill.student_id,
        student_name=student.full_name if student else "—",
        student_class=cls_name,
        category_id=bill.category_id,
        category_name=cat.name if cat else "—",
        period=bill.period,
        amount=bill.amount,
        paid_amount=bill.paid_amount,
        remaining=max(0, bill.amount - bill.paid_amount),
        due_date=bill.due_date,
        status=bill.status,
        notes=bill.notes,
        created_at=bill.created_at,
    )


async def _notify_parents_about_bill(
    db: AsyncSession, bill: Bill, title: str, body: str
) -> None:
    """Push ke akun ortu yang link ke siswa pemilik tagihan.

    Karena ortu pakai akun terpisah (ParentAccount) — kita simpan
    history-nya ke `app_notifications` user-id siswa juga, agar siswa tahu.
    Push ke Parent Web Push subscription bisa ditambah di milestone berikutnya.
    """
    try:
        await notify_user(
            db, bill.student_id,
            title=title,
            body=body,
            category="billing",
            url="/my-bills",
        )
    except Exception:
        pass


# ─── Bill Categories ────────────────────────────────────────────────────────


@router.get("/categories", response_model=Envelope[list[CategoryOut]])
async def list_categories(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (
        await db.execute(
            select(BillCategory)
            .where(BillCategory.org_id == current.org_id)
            .order_by(BillCategory.name)
        )
    ).scalars().all()
    return Envelope(data=[CategoryOut.model_validate(r) for r in rows])


@router.post("/categories", response_model=Envelope[CategoryOut], status_code=201)
async def create_category(
    payload: CategoryIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    existing = (
        await db.execute(
            select(BillCategory).where(
                BillCategory.org_id == current.org_id,
                BillCategory.code == payload.code,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "Kode kategori sudah ada")
    cat = BillCategory(org_id=current.org_id, **payload.model_dump())
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return Envelope(data=CategoryOut.model_validate(cat))


@router.patch("/categories/{cat_id}", response_model=Envelope[CategoryOut])
async def update_category(
    cat_id: int,
    payload: CategoryIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    cat = await db.get(BillCategory, cat_id)
    if not cat or cat.org_id != current.org_id:
        raise HTTPException(404, "Kategori tidak ditemukan")
    for k, v in payload.model_dump().items():
        setattr(cat, k, v)
    await db.commit()
    await db.refresh(cat)
    return Envelope(data=CategoryOut.model_validate(cat))


@router.delete("/categories/{cat_id}", response_model=Envelope[dict])
async def delete_category(
    cat_id: int,
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    cat = await db.get(BillCategory, cat_id)
    if not cat or cat.org_id != current.org_id:
        raise HTTPException(404, "Kategori tidak ditemukan")
    cat.is_active = False
    await db.commit()
    return Envelope(data={"ok": True}, message="Kategori dinonaktifkan")


# ─── Bills ──────────────────────────────────────────────────────────────────


@router.get("", response_model=Envelope[list[BillOut]])
async def list_bills(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    student_id: Optional[int] = None,
    school_class_id: Optional[int] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    period: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=500),
):
    """List tagihan.

    Akses:
    - Siswa: hanya tagihan dirinya
    - Wali/BK/Kepsek: full
    """
    stmt = (
        select(Bill)
        .where(Bill.org_id == current.org_id)
        .order_by(Bill.created_at.desc())
    )
    if current.role == "employee":
        stmt = stmt.where(Bill.student_id == current.id)
    elif student_id:
        stmt = stmt.where(Bill.student_id == student_id)

    if school_class_id:
        sub = select(User.id).where(User.school_class_id == school_class_id)
        stmt = stmt.where(Bill.student_id.in_(sub))

    if status_filter:
        if status_filter not in ("unpaid", "paid", "waived"):
            raise HTTPException(422, "status tidak valid")
        stmt = stmt.where(Bill.status == status_filter)

    if period:
        stmt = stmt.where(Bill.period == period)

    total = (
        await db.execute(select(func.count()).select_from(stmt.subquery()))
    ).scalar_one()

    rows = (
        await db.execute(
            stmt.offset((page - 1) * per_page).limit(per_page)
        )
    ).scalars().all()

    out = [await _bill_to_out(db, b) for b in rows]
    return Envelope(data=out, meta=Meta(page=page, per_page=per_page, total=total))


@router.post("/bulk-generate", response_model=Envelope[dict])
async def bulk_generate(
    payload: BulkGenerateIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Bulk generate Bill untuk banyak siswa sekaligus.

    Idempotent — kalau (student, category, period) sudah ada, di-skip.
    """
    cat = await db.get(BillCategory, payload.category_id)
    if not cat or cat.org_id != current.org_id:
        raise HTTPException(404, "Kategori tidak ditemukan")

    amount = payload.amount if payload.amount is not None else cat.default_amount
    if amount <= 0:
        raise HTTPException(422, "Nominal harus > 0")

    stmt = select(User).where(
        User.org_id == current.org_id,
        User.role == "employee",
        User.status == "active",
    )
    if payload.target_class_ids:
        stmt = stmt.where(User.school_class_id.in_(payload.target_class_ids))

    students = (await db.execute(stmt)).scalars().all()

    created = 0
    skipped = 0
    for s in students:
        existing = (
            await db.execute(
                select(Bill).where(
                    Bill.student_id == s.id,
                    Bill.category_id == cat.id,
                    Bill.period == payload.period,
                )
            )
        ).scalar_one_or_none()
        if existing:
            skipped += 1
            continue
        b = Bill(
            org_id=current.org_id,
            student_id=s.id,
            category_id=cat.id,
            period=payload.period,
            amount=amount,
            due_date=payload.due_date,
            notes=payload.notes,
            created_by=current.id,
        )
        db.add(b)
        created += 1
    await db.commit()

    return Envelope(
        data={"created": created, "skipped": skipped, "students_count": len(students)},
        message=f"{created} tagihan dibuat, {skipped} sudah ada sebelumnya",
    )


@router.delete("/{bill_id}", response_model=Envelope[dict])
async def waive_bill(
    bill_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    bill = await db.get(Bill, bill_id)
    if not bill or bill.org_id != current.org_id:
        raise HTTPException(404, "Tagihan tidak ditemukan")
    if bill.status == "paid":
        raise HTTPException(400, "Tagihan sudah lunas, tidak bisa di-waive")
    bill.status = "waived"
    await db.commit()
    return Envelope(data={"ok": True}, message="Tagihan dibebaskan")


# ─── Payments ───────────────────────────────────────────────────────────────


@router.get("/{bill_id}/payments", response_model=Envelope[list[PaymentOut]])
async def list_payments(
    bill_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    bill = await db.get(Bill, bill_id)
    if not bill or bill.org_id != current.org_id:
        raise HTTPException(404, "Tagihan tidak ditemukan")
    if current.role == "employee" and bill.student_id != current.id:
        raise HTTPException(403, "Bukan tagihan Anda")
    rows = (
        await db.execute(
            select(Payment)
            .where(Payment.bill_id == bill_id)
            .order_by(Payment.paid_at.desc())
        )
    ).scalars().all()
    return Envelope(data=[PaymentOut.model_validate(r) for r in rows])


@router.post("/payments", response_model=Envelope[PaymentOut], status_code=201)
async def create_payment(
    payload: PaymentIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Catat pembayaran (manual oleh staff TU).

    Auto-update Bill.paid_amount + status. Notif push siswa.
    """
    bill = await db.get(Bill, payload.bill_id)
    if not bill or bill.org_id != current.org_id:
        raise HTTPException(404, "Tagihan tidak ditemukan")
    if bill.status == "paid":
        raise HTTPException(400, "Tagihan sudah lunas")

    remaining = bill.amount - bill.paid_amount
    if payload.amount > remaining + 0.01:
        raise HTTPException(400, f"Nominal melebihi sisa tagihan ({remaining:,.0f})")

    p = Payment(
        bill_id=bill.id,
        amount=payload.amount,
        method=payload.method,
        payment_ref=payload.payment_ref,
        notes=payload.notes,
        received_by=current.id,
    )
    db.add(p)

    bill.paid_amount = bill.paid_amount + payload.amount
    if bill.paid_amount >= bill.amount - 0.01:
        bill.status = "paid"
        bill.paid_at = datetime.utcnow()

    await db.commit()
    await db.refresh(p)

    # Notif siswa
    cat = await db.get(BillCategory, bill.category_id)
    cat_name = cat.name if cat else "Tagihan"
    if bill.status == "paid":
        msg = f"LUNAS — {cat_name} ({bill.period}) sebesar Rp{int(payload.amount):,}".replace(
            ",", "."
        )
    else:
        sisa = bill.amount - bill.paid_amount
        msg = (
            f"Pembayaran diterima Rp{int(payload.amount):,}".replace(",", ".")
            + f". Sisa tagihan: Rp{int(sisa):,}".replace(",", ".")
        )
    await _notify_parents_about_bill(
        db, bill, title=f"Pembayaran {cat_name}", body=msg
    )

    return Envelope(data=PaymentOut.model_validate(p), message="Pembayaran tercatat")


@router.delete("/payments/{payment_id}", response_model=Envelope[dict])
async def void_payment(
    payment_id: int,
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Batalkan pembayaran (hanya kepsek). Bill auto-recalculate."""
    p = await db.get(Payment, payment_id)
    if not p:
        raise HTTPException(404, "Payment tidak ditemukan")
    bill = await db.get(Bill, p.bill_id)
    if not bill or bill.org_id != current.org_id:
        raise HTTPException(404, "Bill tidak ditemukan")

    bill.paid_amount = max(0, bill.paid_amount - p.amount)
    if bill.paid_amount < bill.amount - 0.01:
        bill.status = "unpaid"
        bill.paid_at = None
    await db.delete(p)
    await db.commit()
    return Envelope(data={"ok": True}, message="Pembayaran dibatalkan")


# ─── Stats ──────────────────────────────────────────────────────────────────


@router.get("/stats", response_model=Envelope[dict])
async def billing_stats(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    period: Optional[str] = None,
):
    """Ringkasan total tagihan + collection rate."""
    stmt = select(
        func.count(Bill.id),
        func.coalesce(func.sum(Bill.amount), 0),
        func.coalesce(func.sum(Bill.paid_amount), 0),
    ).where(Bill.org_id == current.org_id, Bill.status != "waived")
    if period:
        stmt = stmt.where(Bill.period == period)
    total_bills, total_amount, total_paid = (await db.execute(stmt)).one()
    paid_bills = (
        await db.execute(
            select(func.count(Bill.id)).where(
                Bill.org_id == current.org_id,
                Bill.status == "paid",
                *([Bill.period == period] if period else []),
            )
        )
    ).scalar_one() or 0
    unpaid = (
        await db.execute(
            select(func.count(Bill.id)).where(
                Bill.org_id == current.org_id,
                Bill.status == "unpaid",
                *([Bill.period == period] if period else []),
            )
        )
    ).scalar_one() or 0
    overdue = (
        await db.execute(
            select(func.count(Bill.id)).where(
                Bill.org_id == current.org_id,
                Bill.status == "unpaid",
                Bill.due_date.is_not(None),
                Bill.due_date < date.today(),
                *([Bill.period == period] if period else []),
            )
        )
    ).scalar_one() or 0

    return Envelope(data={
        "total_bills": int(total_bills or 0),
        "total_amount": float(total_amount or 0),
        "total_paid": float(total_paid or 0),
        "outstanding": float((total_amount or 0) - (total_paid or 0)),
        "paid_bills": int(paid_bills),
        "unpaid_bills": int(unpaid),
        "overdue_bills": int(overdue),
        "collection_rate": (
            round((float(total_paid) / float(total_amount)) * 100, 2)
            if total_amount and total_amount > 0
            else 0
        ),
    })


# ─── Midtrans Online Payment ─────────────────────────────────────────────────


def _gen_order_id(bill_id: int) -> str:
    """Order ID unik per attempt. Format: AETHERA-{bill_id}-{random}.

    Midtrans tolak order_id yang sama dipakai 2x, jadi kita selalu generate baru
    setiap kali user klik bayar (selama belum settle).
    """
    return f"AETHERA-{bill_id}-{secrets.token_hex(4)}"


@router.get("/midtrans/config", response_model=Envelope[dict])
async def midtrans_config(
    current: Annotated[User, Depends(get_current_user)],
):
    """Cek apakah pembayaran online aktif + client key untuk frontend."""
    return Envelope(data={
        "enabled": midtrans.is_configured(),
        "client_key": settings.MIDTRANS_CLIENT_KEY,
        "is_production": settings.MIDTRANS_IS_PRODUCTION,
    })


async def _create_snap_for_bill(db: AsyncSession, bill: Bill, payer: User) -> PayOnlineOut:
    """Shared logic: buat Snap token untuk satu bill."""
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
    order_id = _gen_order_id(bill.id)

    try:
        result = await midtrans.create_snap_transaction(
            order_id=order_id,
            gross_amount=remaining,
            customer_name=payer.full_name,
            customer_email=payer.email,
            customer_phone=payer.phone or payer.parent_phone,
            item_name=f"{cat_name} {bill.period}",
            item_id=str(bill.id),
        )
    except midtrans.MidtransError as e:
        raise HTTPException(502, str(e))

    bill.midtrans_order_id = order_id
    bill.midtrans_token = result["token"]
    bill.midtrans_redirect_url = result.get("redirect_url")
    bill.midtrans_status = "pending"
    bill.midtrans_token_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()

    return PayOnlineOut(
        token=result["token"],
        redirect_url=result.get("redirect_url"),
        client_key=settings.MIDTRANS_CLIENT_KEY,
        is_production=settings.MIDTRANS_IS_PRODUCTION,
        order_id=order_id,
    )


@router.post("/pay-online", response_model=Envelope[PayOnlineOut])
async def pay_online(
    payload: PayOnlineIn,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Siswa bayar tagihannya sendiri via Midtrans Snap.

    Return token untuk frontend buka popup snap.js.
    """
    bill = await db.get(Bill, payload.bill_id)
    if not bill or bill.org_id != current.org_id:
        raise HTTPException(404, "Tagihan tidak ditemukan")
    # Siswa hanya boleh bayar tagihan sendiri
    if current.role == "employee" and bill.student_id != current.id:
        raise HTTPException(403, "Bukan tagihan Anda")

    payer = await db.get(User, bill.student_id)
    out = await _create_snap_for_bill(db, bill, payer or current)
    return Envelope(data=out, message="Token pembayaran dibuat")


@router.post("/midtrans/webhook")
async def midtrans_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Webhook dari Midtrans saat status pembayaran berubah.

    URL ini harus didaftarkan di dashboard Midtrans:
      Settings → Configuration → Payment Notification URL
      = https://aethera.my.id/api/v1/billing/midtrans/webhook

    Tidak butuh auth user — keamanan via signature verification.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Body tidak valid")

    order_id = body.get("order_id", "")
    status_code = body.get("status_code", "")
    gross_amount = body.get("gross_amount", "")
    signature = body.get("signature_key", "")
    transaction_status = body.get("transaction_status", "")
    fraud_status = body.get("fraud_status")

    # 1. Verifikasi signature — tolak kalau palsu
    if not midtrans.verify_signature(order_id, status_code, gross_amount, signature):
        raise HTTPException(403, "Signature tidak valid")

    # 2. Cari bill berdasarkan order_id
    bill = (
        await db.execute(select(Bill).where(Bill.midtrans_order_id == order_id))
    ).scalar_one_or_none()
    if not bill:
        # Order ID tidak dikenal — balas 200 supaya Midtrans tidak retry terus
        return {"status": "ignored", "reason": "order_id tidak ditemukan"}

    # 3. Re-verify ke Midtrans API (jangan cuma percaya body)
    try:
        verified = await midtrans.fetch_transaction_status(order_id)
        transaction_status = verified.get("transaction_status", transaction_status)
        fraud_status = verified.get("fraud_status", fraud_status)
    except midtrans.MidtransError:
        pass  # fallback ke body kalau API down

    internal = midtrans.interpret_status(transaction_status, fraud_status)
    bill.midtrans_status = transaction_status

    # 4. Kalau lunas → catat Payment + update bill (idempotent)
    if internal == "paid" and bill.status != "paid":
        already = (
            await db.execute(
                select(Payment).where(Payment.payment_ref == order_id)
            )
        ).scalar_one_or_none()
        if not already:
            remaining = bill.amount - bill.paid_amount
            p = Payment(
                bill_id=bill.id,
                amount=remaining,
                method="midtrans",
                payment_ref=order_id,
                notes=f"Pembayaran online via Midtrans ({transaction_status})",
            )
            db.add(p)
            bill.paid_amount = bill.amount
            bill.status = "paid"
            bill.paid_at = datetime.now(timezone.utc).replace(tzinfo=None)

            cat = await db.get(BillCategory, bill.category_id)
            cat_name = cat.name if cat else "Tagihan"
            await _notify_parents_about_bill(
                db, bill,
                title=f"Pembayaran {cat_name} Berhasil",
                body=f"LUNAS — {cat_name} ({bill.period}) sebesar "
                     f"Rp{int(remaining):,}".replace(",", ".") + " via pembayaran online.",
            )

    await db.commit()
    return {"status": "ok", "internal_status": internal}


@router.get("/{bill_id}/payment-status", response_model=Envelope[dict])
async def check_payment_status(
    bill_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Polling status dari frontend setelah popup ditutup.

    Re-sync dari Midtrans kalau masih pending.
    """
    bill = await db.get(Bill, bill_id)
    if not bill or bill.org_id != current.org_id:
        raise HTTPException(404, "Tagihan tidak ditemukan")
    if current.role == "employee" and bill.student_id != current.id:
        raise HTTPException(403, "Bukan tagihan Anda")

    # Kalau ada order id & belum lunas, coba sync
    if bill.midtrans_order_id and bill.status != "paid" and midtrans.is_configured():
        try:
            verified = await midtrans.fetch_transaction_status(bill.midtrans_order_id)
            internal = midtrans.interpret_status(
                verified.get("transaction_status", ""),
                verified.get("fraud_status"),
            )
            bill.midtrans_status = verified.get("transaction_status")
            if internal == "paid" and bill.status != "paid":
                already = (
                    await db.execute(
                        select(Payment).where(Payment.payment_ref == bill.midtrans_order_id)
                    )
                ).scalar_one_or_none()
                if not already:
                    remaining = bill.amount - bill.paid_amount
                    db.add(Payment(
                        bill_id=bill.id, amount=remaining, method="midtrans",
                        payment_ref=bill.midtrans_order_id,
                        notes="Pembayaran online via Midtrans (verified on poll)",
                    ))
                    bill.paid_amount = bill.amount
                    bill.status = "paid"
                    bill.paid_at = datetime.now(timezone.utc).replace(tzinfo=None)
            await db.commit()
        except midtrans.MidtransError:
            pass

    return Envelope(data={
        "bill_id": bill.id,
        "status": bill.status,
        "midtrans_status": bill.midtrans_status,
        "paid_amount": bill.paid_amount,
        "remaining": max(0, bill.amount - bill.paid_amount),
    })
