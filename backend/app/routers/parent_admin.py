"""Admin endpoint untuk manage Parent Account dari sisi sekolah.

Sekolah (kepsek/wali kelas) yang bikin akun ortu, generate password awal,
dan link ke siswa.
"""
from __future__ import annotations

import secrets
from datetime import datetime
from typing import Annotated, Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ParentAccount, ParentLink, SchoolClass, User
from app.schemas import Envelope
from app.security import get_current_user, require_roles


router = APIRouter(prefix="/parents", tags=["Parent Admin"])


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def _norm_phone(phone: str) -> str:
    p = phone.strip().replace(" ", "").replace("-", "")
    if p.startswith("+62"):
        p = "0" + p[3:]
    return p


def _gen_password(name: str) -> str:
    """Generate password gampang diingat: namaXXXX (4 digit acak)."""
    first = name.split()[0].lower() if name else "ortu"
    return f"{first}{secrets.randbelow(9000) + 1000}"


# ─── Schemas ────────────────────────────────────────────────────────────────


class ParentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    phone: str
    full_name: str
    email: Optional[str] = None
    is_active: bool
    last_login_at: Optional[datetime] = None
    children_count: int = 0
    children: list[dict] = []
    created_at: datetime


class ParentCreateIn(BaseModel):
    phone: str = Field(min_length=8, max_length=20)
    full_name: str = Field(min_length=2, max_length=255)
    email: Optional[str] = None
    student_ids: list[int] = Field(default_factory=list)
    relationship: str = Field(default="wali", pattern="^(ayah|ibu|wali)$")
    password: Optional[str] = None  # null → auto-generate


class ParentCreateOut(BaseModel):
    parent: ParentOut
    initial_password: str  # ditampilkan SEKALI ke admin agar bisa kasih ke ortu


class ParentLinkIn(BaseModel):
    student_id: int
    relationship: str = Field(default="wali", pattern="^(ayah|ibu|wali)$")


class ParentResetPasswordOut(BaseModel):
    new_password: str


class BulkLinkSiblingIn(BaseModel):
    """Link semua siswa yang punya parent_phone sama jadi 1 akun ortu."""
    pass  # body kosong


# ─── Helpers ────────────────────────────────────────────────────────────────


async def _enrich_parent(db: AsyncSession, p: ParentAccount) -> ParentOut:
    rows = (
        await db.execute(
            select(User, ParentLink)
            .join(ParentLink, ParentLink.student_id == User.id)
            .where(ParentLink.parent_id == p.id)
        )
    ).all()
    children = []
    for student, link in rows:
        cls_name = None
        if student.school_class_id:
            c = await db.get(SchoolClass, student.school_class_id)
            cls_name = c.name if c else None
        children.append({
            "student_id": student.id,
            "full_name": student.full_name,
            "employee_id": student.employee_id,
            "class_name": cls_name,
            "relationship": link.relationship,
        })
    return ParentOut(
        id=p.id,
        phone=p.phone,
        full_name=p.full_name,
        email=p.email,
        is_active=p.is_active,
        last_login_at=p.last_login_at,
        children_count=len(children),
        children=children,
        created_at=p.created_at,
    )


# ─── Endpoints ──────────────────────────────────────────────────────────────


@router.get("", response_model=Envelope[list[ParentOut]])
async def list_parents(
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Optional[str] = None,
):
    stmt = select(ParentAccount).where(ParentAccount.org_id == current.org_id).order_by(
        ParentAccount.created_at.desc()
    )
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            (ParentAccount.full_name.ilike(like)) | (ParentAccount.phone.ilike(like))
        )
    rows = (await db.execute(stmt)).scalars().all()
    out = [await _enrich_parent(db, p) for p in rows]
    return Envelope(data=out)


@router.post("", response_model=Envelope[ParentCreateOut], status_code=201)
async def create_parent(
    payload: ParentCreateIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    phone = _norm_phone(payload.phone)
    existing = (
        await db.execute(
            select(ParentAccount).where(
                ParentAccount.org_id == current.org_id,
                ParentAccount.phone == phone,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(400, f"Sudah ada akun ortu dengan HP {phone}")

    # Validasi student_ids
    valid_students: list[User] = []
    for sid in payload.student_ids:
        s = await db.get(User, sid)
        if not s or s.org_id != current.org_id or s.role != "employee":
            raise HTTPException(404, f"Siswa ID {sid} tidak valid")
        valid_students.append(s)

    initial = payload.password or _gen_password(payload.full_name)

    parent = ParentAccount(
        org_id=current.org_id,
        phone=phone,
        full_name=payload.full_name.strip(),
        email=payload.email,
        password_hash=_hash(initial),
        is_active=True,
    )
    db.add(parent)
    await db.flush()

    for s in valid_students:
        db.add(ParentLink(
            parent_id=parent.id,
            student_id=s.id,
            relationship=payload.relationship,
            is_primary=True,
            created_by=current.id,
        ))

    await db.commit()
    await db.refresh(parent)

    return Envelope(
        data=ParentCreateOut(
            parent=await _enrich_parent(db, parent),
            initial_password=initial,
        ),
        message=f"Akun ortu {parent.full_name} dibuat",
    )


@router.post("/{parent_id}/link", response_model=Envelope[ParentOut])
async def add_link(
    parent_id: int,
    payload: ParentLinkIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    parent = await db.get(ParentAccount, parent_id)
    if not parent or parent.org_id != current.org_id:
        raise HTTPException(404, "Akun ortu tidak ditemukan")
    student = await db.get(User, payload.student_id)
    if not student or student.org_id != current.org_id or student.role != "employee":
        raise HTTPException(404, "Siswa tidak ditemukan")

    existing = (
        await db.execute(
            select(ParentLink).where(
                ParentLink.parent_id == parent_id,
                ParentLink.student_id == payload.student_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "Siswa sudah ter-link")

    db.add(ParentLink(
        parent_id=parent_id,
        student_id=payload.student_id,
        relationship=payload.relationship,
        is_primary=True,
        created_by=current.id,
    ))
    await db.commit()
    return Envelope(data=await _enrich_parent(db, parent), message="Anak ditambahkan")


@router.delete("/{parent_id}/link/{student_id}", response_model=Envelope[ParentOut])
async def remove_link(
    parent_id: int,
    student_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    parent = await db.get(ParentAccount, parent_id)
    if not parent or parent.org_id != current.org_id:
        raise HTTPException(404, "Akun ortu tidak ditemukan")
    link = (
        await db.execute(
            select(ParentLink).where(
                ParentLink.parent_id == parent_id,
                ParentLink.student_id == student_id,
            )
        )
    ).scalar_one_or_none()
    if not link:
        raise HTTPException(404, "Link tidak ditemukan")
    await db.delete(link)
    await db.commit()
    return Envelope(data=await _enrich_parent(db, parent))


@router.post("/{parent_id}/reset-password", response_model=Envelope[ParentResetPasswordOut])
async def reset_password(
    parent_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    parent = await db.get(ParentAccount, parent_id)
    if not parent or parent.org_id != current.org_id:
        raise HTTPException(404, "Akun ortu tidak ditemukan")
    new_pw = _gen_password(parent.full_name)
    parent.password_hash = _hash(new_pw)
    await db.commit()
    return Envelope(
        data=ParentResetPasswordOut(new_password=new_pw),
        message="Password baru di-generate. Sampaikan ke ortu via WA / SMS.",
    )


@router.patch("/{parent_id}/toggle-active", response_model=Envelope[ParentOut])
async def toggle_active(
    parent_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    parent = await db.get(ParentAccount, parent_id)
    if not parent or parent.org_id != current.org_id:
        raise HTTPException(404, "Akun ortu tidak ditemukan")
    parent.is_active = not parent.is_active
    await db.commit()
    await db.refresh(parent)
    return Envelope(data=await _enrich_parent(db, parent))


@router.delete("/{parent_id}", response_model=Envelope[dict])
async def delete_parent(
    parent_id: int,
    current: Annotated[User, Depends(require_roles("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    parent = await db.get(ParentAccount, parent_id)
    if not parent or parent.org_id != current.org_id:
        raise HTTPException(404, "Akun ortu tidak ditemukan")
    await db.delete(parent)
    await db.commit()
    return Envelope(data={"ok": True}, message="Akun ortu dihapus")


@router.post("/auto-create", response_model=Envelope[dict])
async def auto_create_from_students(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Auto-bikin akun ortu untuk semua siswa yang punya `parent_phone` di profil.

    Sangat berguna saat onboarding sekolah baru — sekolah cuma perlu
    impor data siswa lengkap dengan no HP ortu, tinggal trigger ini sekali.

    Strategi:
    - Group siswa berdasar parent_phone (norm) — kakak-adik di-link ke 1 ortu
    - Generate password default per ortu, kembalikan list ke admin
    """
    # Ambil semua siswa di org dengan parent_phone non-null
    students = (
        await db.execute(
            select(User).where(
                User.org_id == current.org_id,
                User.role == "employee",
                User.status == "active",
                User.parent_phone.isnot(None),
            )
        )
    ).scalars().all()

    by_phone: dict[str, list[User]] = {}
    for s in students:
        if not s.parent_phone:
            continue
        ph = _norm_phone(s.parent_phone)
        if len(ph) < 8:
            continue
        by_phone.setdefault(ph, []).append(s)

    created: list[dict] = []
    skipped = 0
    for phone, kids in by_phone.items():
        existing = (
            await db.execute(
                select(ParentAccount).where(
                    ParentAccount.org_id == current.org_id,
                    ParentAccount.phone == phone,
                )
            )
        ).scalar_one_or_none()

        if existing:
            # Tambah link untuk anak-anak yang belum ter-link
            new_links = 0
            for s in kids:
                lk = (
                    await db.execute(
                        select(ParentLink).where(
                            ParentLink.parent_id == existing.id,
                            ParentLink.student_id == s.id,
                        )
                    )
                ).scalar_one_or_none()
                if not lk:
                    db.add(ParentLink(
                        parent_id=existing.id,
                        student_id=s.id,
                        relationship="wali",
                        is_primary=True,
                        created_by=current.id,
                    ))
                    new_links += 1
            if new_links > 0:
                created.append({
                    "phone": phone,
                    "name": existing.full_name,
                    "password": "(akun sudah ada — link saja)",
                    "children_added": new_links,
                })
            else:
                skipped += 1
            continue

        # Akun baru
        first_kid = kids[0]
        parent_name = first_kid.parent_name or f"Wali {first_kid.full_name.split()[-1]}"
        pw = _gen_password(parent_name)
        parent = ParentAccount(
            org_id=current.org_id,
            phone=phone,
            full_name=parent_name,
            password_hash=_hash(pw),
            is_active=True,
        )
        db.add(parent)
        await db.flush()

        for s in kids:
            db.add(ParentLink(
                parent_id=parent.id,
                student_id=s.id,
                relationship="wali",
                is_primary=True,
                created_by=current.id,
            ))

        created.append({
            "phone": phone,
            "name": parent_name,
            "password": pw,
            "children": [k.full_name for k in kids],
        })

    await db.commit()
    return Envelope(
        data={"created": created, "skipped": skipped, "total_processed": len(by_phone)},
        message=f"{len(created)} akun ortu di-generate. {skipped} sudah ada.",
    )
