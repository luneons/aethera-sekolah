"""Perpustakaan Digital — manajemen buku, peminjaman, denda."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import LibraryBook, LibraryLoan, SchoolClass, User
from app.schemas import Envelope
from app.security import get_current_user, require_roles


router = APIRouter(prefix="/library", tags=["Library"])


DEFAULT_LOAN_DAYS = 7
FINE_PER_DAY = 1000.0  # Rp 1.000 per hari telat


# ─── Schemas ────────────────────────────────────────────────────────────────


class BookIn(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    isbn: Optional[str] = None
    title: str = Field(min_length=2, max_length=255)
    author: Optional[str] = None
    publisher: Optional[str] = None
    year: Optional[int] = Field(default=None, ge=1900, le=2100)
    category: Optional[str] = None
    cover_url: Optional[str] = None
    description: Optional[str] = None
    total_copies: int = Field(default=1, ge=1, le=999)
    is_active: bool = True


class BookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    isbn: Optional[str] = None
    title: str
    author: Optional[str] = None
    publisher: Optional[str] = None
    year: Optional[int] = None
    category: Optional[str] = None
    cover_url: Optional[str] = None
    description: Optional[str] = None
    total_copies: int
    available_copies: int
    is_active: bool


class LoanIn(BaseModel):
    book_id: int
    student_id: int
    loan_date: Optional[date] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None


class LoanReturnIn(BaseModel):
    return_date: Optional[date] = None
    book_lost: bool = False
    notes: Optional[str] = None


class LoanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    book_id: int
    book_title: str
    book_code: str
    student_id: int
    student_name: str
    student_class: Optional[str] = None
    loan_date: date
    due_date: date
    return_date: Optional[date] = None
    days_overdue: int = 0
    status: str
    fine_amount: float
    notes: Optional[str] = None


# ─── Helpers ────────────────────────────────────────────────────────────────


async def _enrich_loan(db: AsyncSession, loan: LibraryLoan) -> LoanOut:
    book = await db.get(LibraryBook, loan.book_id)
    student = await db.get(User, loan.student_id)
    cls_name = None
    if student and student.school_class_id:
        cls = await db.get(SchoolClass, student.school_class_id)
        cls_name = cls.name if cls else None

    days_overdue = 0
    if loan.status in ("borrowed", "overdue"):
        if date.today() > loan.due_date:
            days_overdue = (date.today() - loan.due_date).days

    return LoanOut(
        id=loan.id,
        book_id=loan.book_id,
        book_title=book.title if book else "?",
        book_code=book.code if book else "?",
        student_id=loan.student_id,
        student_name=student.full_name if student else "?",
        student_class=cls_name,
        loan_date=loan.loan_date,
        due_date=loan.due_date,
        return_date=loan.return_date,
        days_overdue=days_overdue,
        status=loan.status,
        fine_amount=loan.fine_amount,
        notes=loan.notes,
    )


# ─── Book endpoints ─────────────────────────────────────────────────────────


@router.get("/books", response_model=Envelope[list[BookOut]])
async def list_books(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Optional[str] = None,
    category: Optional[str] = None,
    available_only: bool = False,
):
    stmt = select(LibraryBook).where(LibraryBook.org_id == current.org_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(
            LibraryBook.title.ilike(like),
            LibraryBook.author.ilike(like),
            LibraryBook.code.ilike(like),
            LibraryBook.isbn.ilike(like),
        ))
    if category:
        stmt = stmt.where(LibraryBook.category == category)
    if available_only:
        stmt = stmt.where(LibraryBook.available_copies > 0, LibraryBook.is_active == True)  # noqa: E712
    rows = (await db.execute(stmt.order_by(LibraryBook.title))).scalars().all()
    return Envelope(data=[BookOut.model_validate(b) for b in rows])


@router.get("/books/categories", response_model=Envelope[list[str]])
async def list_categories(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (
        await db.execute(
            select(LibraryBook.category)
            .where(
                LibraryBook.org_id == current.org_id,
                LibraryBook.category.is_not(None),
            )
            .distinct()
        )
    ).scalars().all()
    return Envelope(data=sorted([r for r in rows if r]))


@router.post("/books", response_model=Envelope[BookOut], status_code=201)
async def create_book(
    payload: BookIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    existing = (
        await db.execute(
            select(LibraryBook).where(
                LibraryBook.org_id == current.org_id,
                LibraryBook.code == payload.code,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Kode buku sudah dipakai")

    book = LibraryBook(
        org_id=current.org_id,
        available_copies=payload.total_copies,
        **payload.model_dump(),
    )
    db.add(book)
    await db.commit()
    await db.refresh(book)
    return Envelope(data=BookOut.model_validate(book))


@router.put("/books/{book_id}", response_model=Envelope[BookOut])
async def update_book(
    book_id: int,
    payload: BookIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    book = await db.get(LibraryBook, book_id)
    if not book or book.org_id != current.org_id:
        raise HTTPException(404, "Buku tidak ditemukan")

    # Recompute available_copies kalau total berubah
    diff = payload.total_copies - book.total_copies
    book.available_copies = max(0, book.available_copies + diff)
    for k, v in payload.model_dump().items():
        setattr(book, k, v)
    await db.commit()
    await db.refresh(book)
    return Envelope(data=BookOut.model_validate(book))


@router.delete("/books/{book_id}", response_model=Envelope[dict])
async def delete_book(
    book_id: int,
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    book = await db.get(LibraryBook, book_id)
    if not book or book.org_id != current.org_id:
        raise HTTPException(404, "Buku tidak ditemukan")

    # Cek peminjaman aktif
    active = (
        await db.execute(
            select(func.count(LibraryLoan.id)).where(
                LibraryLoan.book_id == book_id,
                LibraryLoan.status.in_(["borrowed", "overdue"]),
            )
        )
    ).scalar_one()
    if active > 0:
        raise HTTPException(400, f"Masih ada {active} peminjaman aktif untuk buku ini")

    await db.delete(book)
    await db.commit()
    return Envelope(data={"ok": True})


# ─── Loan endpoints ─────────────────────────────────────────────────────────


@router.post("/loans", response_model=Envelope[LoanOut], status_code=201)
async def create_loan(
    payload: LoanIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    book = await db.get(LibraryBook, payload.book_id)
    if not book or book.org_id != current.org_id:
        raise HTTPException(404, "Buku tidak ditemukan")
    if book.available_copies < 1:
        raise HTTPException(400, "Stok buku habis")
    student = await db.get(User, payload.student_id)
    if not student or student.org_id != current.org_id:
        raise HTTPException(404, "Siswa tidak ditemukan")

    loan_date = payload.loan_date or date.today()
    due_date = payload.due_date or (loan_date + timedelta(days=DEFAULT_LOAN_DAYS))
    if due_date <= loan_date:
        raise HTTPException(422, "Tanggal kembali harus setelah tanggal pinjam")

    loan = LibraryLoan(
        book_id=payload.book_id,
        student_id=payload.student_id,
        loan_date=loan_date,
        due_date=due_date,
        status="borrowed",
        librarian_id=current.id,
        notes=payload.notes,
    )
    book.available_copies -= 1
    db.add(loan)
    await db.commit()
    await db.refresh(loan)

    # Notif siswa
    try:
        from app.services.notification_service import notify_user
        await notify_user(
            db, payload.student_id,
            title="Peminjaman Buku",
            body=f"\"{book.title}\". Kembalikan paling lambat {due_date.strftime('%d %b %Y')}",
            url="/library",
            category="library",
        )
    except Exception:
        pass

    return Envelope(data=await _enrich_loan(db, loan))


@router.patch("/loans/{loan_id}/return", response_model=Envelope[LoanOut])
async def return_loan(
    loan_id: int,
    payload: LoanReturnIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    loan = await db.get(LibraryLoan, loan_id)
    if not loan:
        raise HTTPException(404, "Peminjaman tidak ditemukan")
    book = await db.get(LibraryBook, loan.book_id)
    if not book or book.org_id != current.org_id:
        raise HTTPException(404, "Peminjaman tidak ditemukan")
    if loan.status not in ("borrowed", "overdue"):
        raise HTTPException(400, "Buku sudah dikembalikan / hilang")

    return_date = payload.return_date or date.today()
    if payload.book_lost:
        loan.status = "lost"
        loan.fine_amount = 50000.0  # default denda buku hilang
    else:
        loan.return_date = return_date
        loan.status = "returned"
        # Hitung denda telat
        if return_date > loan.due_date:
            days = (return_date - loan.due_date).days
            loan.fine_amount = days * FINE_PER_DAY
        # Restore stok
        book.available_copies += 1

    if payload.notes:
        loan.notes = (loan.notes or "") + f"\n[return] {payload.notes}"

    await db.commit()
    await db.refresh(loan)
    return Envelope(data=await _enrich_loan(db, loan))


@router.get("/loans", response_model=Envelope[list[LoanOut]])
async def list_loans(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: Optional[str] = None,
    student_id: Optional[int] = None,
    overdue_only: bool = False,
):
    stmt = (
        select(LibraryLoan)
        .join(LibraryBook, LibraryBook.id == LibraryLoan.book_id)
        .where(LibraryBook.org_id == current.org_id)
    )
    if current.role == "employee":
        stmt = stmt.where(LibraryLoan.student_id == current.id)
    elif student_id:
        stmt = stmt.where(LibraryLoan.student_id == student_id)
    if status:
        stmt = stmt.where(LibraryLoan.status == status)
    if overdue_only:
        stmt = stmt.where(
            LibraryLoan.status.in_(["borrowed", "overdue"]),
            LibraryLoan.due_date < date.today(),
        )

    rows = (
        await db.execute(stmt.order_by(LibraryLoan.loan_date.desc()))
    ).scalars().all()

    # Compute "overdue" status virtually for the response (jangan commit di GET — anti-pattern).
    # Background scheduler task akan persist status overdue secara periodic.
    today = date.today()
    out: list[LoanOut] = []
    for loan in rows:
        if loan.status == "borrowed" and loan.due_date < today:
            # Mutate in-memory only, tidak commit
            loan.status = "overdue"
        out.append(await _enrich_loan(db, loan))

    return Envelope(data=out)


@router.get("/stats", response_model=Envelope[dict])
async def library_stats(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Stats untuk dashboard: total buku, peminjaman aktif, telat, top reader."""
    total_books = (
        await db.execute(
            select(func.count(LibraryBook.id)).where(
                LibraryBook.org_id == current.org_id,
                LibraryBook.is_active == True,  # noqa: E712
            )
        )
    ).scalar_one()
    total_copies_q = (
        await db.execute(
            select(func.coalesce(func.sum(LibraryBook.total_copies), 0)).where(
                LibraryBook.org_id == current.org_id
            )
        )
    ).scalar_one()
    available_q = (
        await db.execute(
            select(func.coalesce(func.sum(LibraryBook.available_copies), 0)).where(
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
                LibraryLoan.due_date < date.today(),
            )
        )
    ).scalar_one()

    # Top readers
    top_rows = (
        await db.execute(
            select(
                LibraryLoan.student_id,
                func.count(LibraryLoan.id).label("cnt"),
            )
            .join(LibraryBook, LibraryBook.id == LibraryLoan.book_id)
            .where(LibraryBook.org_id == current.org_id)
            .group_by(LibraryLoan.student_id)
            .order_by(func.count(LibraryLoan.id).desc())
            .limit(10)
        )
    ).all()
    top_readers = []
    for row in top_rows:
        st = await db.get(User, row.student_id)
        if st:
            top_readers.append({
                "student_id": row.student_id,
                "name": st.full_name,
                "loan_count": row.cnt,
            })

    return Envelope(data={
        "total_books": total_books,
        "total_copies": int(total_copies_q),
        "available_copies": int(available_q),
        "active_loans": active_loans,
        "overdue": overdue,
        "top_readers": top_readers,
    })
