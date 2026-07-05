"""Importer Universal — Excel/CSV ke database siswa.

Format dukung:
- CSV (.csv) UTF-8
- XLSX (.xlsx)

Auto-detect kolom (case-insensitive, fuzzy):
  nama / name / full_name → full_name
  nis / employee_id / nomor_induk → employee_id
  email → email
  hp / phone / telepon → phone
  ortu_hp / parent_phone / hp_ortu → parent_phone
  ortu / parent_name / nama_ortu → parent_name
  kelas / class / class_name → school_class_name
  password → password (opsional, kalau kosong default 'siswa{NIS}')
"""
from __future__ import annotations

import csv
import io
import secrets
from datetime import date, datetime
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import SchoolClass, User, UserAuth
from app.schemas import Envelope
from app.security import hash_password, require_roles


router = APIRouter(prefix="/import", tags=["Bulk Import"])


# ─── Column mapping (fuzzy, lowercased) ────────────────────────────────────


COL_ALIASES: dict[str, list[str]] = {
    "full_name": ["nama", "name", "full name", "full_name", "nama_lengkap", "nama lengkap"],
    "employee_id": ["nis", "employee id", "employee_id", "nomor_induk", "nomor induk", "no_induk", "no induk"],
    "email": ["email", "e-mail", "alamat email"],
    "phone": ["hp", "phone", "telepon", "no hp", "nomor hp", "nomor_hp", "no_hp"],
    "parent_phone": ["ortu_hp", "parent_phone", "parent phone", "hp_ortu", "hp ortu", "wa ortu", "no_ortu", "ortu"],
    "parent_name": ["nama_ortu", "nama ortu", "parent_name", "parent name", "wali", "nama wali"],
    "school_class_name": ["kelas", "class", "class_name", "class name", "rombel"],
    "password": ["password", "pwd", "kata sandi"],
    "join_date": ["tanggal_masuk", "tanggal masuk", "join_date", "join date", "tahun masuk"],
}


def _lc(s: Any) -> str:
    return str(s or "").strip().lower()


def _detect_columns(header_row: list[str]) -> dict[str, int]:
    """Return mapping internal_field → column_index."""
    out: dict[str, int] = {}
    for idx, h in enumerate(header_row):
        h_lc = _lc(h)
        for field, aliases in COL_ALIASES.items():
            if h_lc in aliases and field not in out:
                out[field] = idx
    return out


# ─── Parsers ────────────────────────────────────────────────────────────────


def _parse_csv(content: bytes) -> list[list[str]]:
    text = content.decode("utf-8", errors="replace")
    return [list(row) for row in csv.reader(io.StringIO(text))]


def _parse_xlsx(content: bytes) -> list[list[str]]:
    try:
        from openpyxl import load_workbook
    except ImportError:
        raise HTTPException(500, "openpyxl belum terinstall di server")
    wb = load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    ws = wb.active
    rows: list[list[str]] = []
    for r in ws.iter_rows(values_only=True):
        rows.append(["" if v is None else str(v).strip() for v in r])
    return rows


def _parse_uploaded(file: UploadFile, content: bytes) -> list[list[str]]:
    name = (file.filename or "").lower()
    if name.endswith(".csv"):
        return _parse_csv(content)
    if name.endswith((".xlsx", ".xls")):
        return _parse_xlsx(content)
    raise HTTPException(400, "Format harus .csv atau .xlsx")


# ─── Schemas ────────────────────────────────────────────────────────────────


class PreviewRow(BaseModel):
    row_num: int
    full_name: Optional[str] = None
    employee_id: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    parent_phone: Optional[str] = None
    parent_name: Optional[str] = None
    school_class_name: Optional[str] = None
    password: Optional[str] = None
    valid: bool = False
    error: Optional[str] = None
    will_create_class: bool = False
    is_update: bool = False


class PreviewOut(BaseModel):
    detected_columns: dict[str, int]
    total_rows: int
    valid_rows: int
    invalid_rows: int
    new_classes: list[str]
    will_create: int
    will_update: int
    rows: list[PreviewRow]


class CommitOut(BaseModel):
    created: int
    updated: int
    classes_created: int
    skipped: int
    errors: list[str]


# ─── Logic ──────────────────────────────────────────────────────────────────


async def _build_preview(
    db: AsyncSession, org_id: int, file: UploadFile
) -> tuple[PreviewOut, list[dict]]:
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(400, "File terlalu besar. Maksimal 10MB.")
    rows = _parse_uploaded(file, content)
    if not rows or len(rows) < 2:
        raise HTTPException(400, "File kosong atau tidak ada header")

    header = rows[0]
    cols = _detect_columns(header)
    if "full_name" not in cols or "employee_id" not in cols:
        raise HTTPException(
            400,
            "Kolom 'nama' dan 'NIS' wajib ada di header. Detected: "
            + ", ".join(cols.keys()),
        )

    # Existing data lookup
    existing_by_nis = {
        u.employee_id: u for u in (
            await db.execute(
                select(User).where(User.org_id == org_id)
            )
        ).scalars().all()
    }
    classes_by_name = {
        c.name.lower(): c for c in (
            await db.execute(
                select(SchoolClass).where(SchoolClass.org_id == org_id)
            )
        ).scalars().all()
    }

    new_class_names: set[str] = set()
    parsed: list[PreviewRow] = []
    raw_data: list[dict] = []

    def cell(row: list[str], field: str) -> str:
        idx = cols.get(field)
        if idx is None or idx >= len(row):
            return ""
        return (row[idx] or "").strip()

    for i, row in enumerate(rows[1:], start=2):  # row_num human-readable (header=1)
        if not any(c.strip() for c in row):
            continue  # skip empty rows
        nama = cell(row, "full_name")
        nis = cell(row, "employee_id")
        if not nama or not nis:
            parsed.append(PreviewRow(
                row_num=i, full_name=nama or None, employee_id=nis or None,
                error="Nama atau NIS kosong",
            ))
            continue

        email = cell(row, "email") or None
        phone = cell(row, "phone") or None
        p_phone = cell(row, "parent_phone") or None
        p_name = cell(row, "parent_name") or None
        cls_name = cell(row, "school_class_name") or None
        pw_raw = cell(row, "password") or None

        will_create_class = False
        if cls_name and cls_name.lower() not in classes_by_name:
            will_create_class = True
            new_class_names.add(cls_name)

        is_update = nis in existing_by_nis

        pr = PreviewRow(
            row_num=i,
            full_name=nama,
            employee_id=nis,
            email=email,
            phone=phone,
            parent_phone=p_phone,
            parent_name=p_name,
            school_class_name=cls_name,
            password=pw_raw,
            valid=True,
            will_create_class=will_create_class,
            is_update=is_update,
        )
        parsed.append(pr)
        raw_data.append({
            "nama": nama, "nis": nis, "email": email, "phone": phone,
            "parent_phone": p_phone, "parent_name": p_name,
            "class_name": cls_name, "password": pw_raw,
        })

    valid_count = sum(1 for r in parsed if r.valid)
    return PreviewOut(
        detected_columns=cols,
        total_rows=len(parsed),
        valid_rows=valid_count,
        invalid_rows=len(parsed) - valid_count,
        new_classes=sorted(new_class_names),
        will_create=sum(1 for r in parsed if r.valid and not r.is_update),
        will_update=sum(1 for r in parsed if r.valid and r.is_update),
        rows=parsed[:200],  # limit preview size
    ), raw_data


# ─── Endpoints ──────────────────────────────────────────────────────────────


@router.post("/students/preview", response_model=Envelope[PreviewOut])
async def preview_students(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    """Preview hasil import sebelum commit. Tidak menyimpan apapun."""
    preview, _ = await _build_preview(db, current.org_id, file)
    return Envelope(data=preview)


@router.post("/students/commit", response_model=Envelope[CommitOut])
async def commit_students(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    auto_create_class: bool = True,
    update_existing: bool = True,
):
    """Eksekusi import. Hanya baris valid yang diproses."""
    preview, raw_data = await _build_preview(db, current.org_id, file)

    # Auto create classes
    classes_by_name = {
        c.name.lower(): c for c in (
            await db.execute(
                select(SchoolClass).where(SchoolClass.org_id == current.org_id)
            )
        ).scalars().all()
    }

    classes_created = 0
    if auto_create_class:
        for new_name in preview.new_classes:
            if new_name.lower() in classes_by_name:
                continue
            # Parse grade dari nama (mis. "10 IPA 1" → grade=10, major=IPA)
            parts = new_name.split()
            grade = parts[0] if parts and parts[0].isdigit() else None
            major = parts[1] if len(parts) > 1 else None
            cls = SchoolClass(
                org_id=current.org_id,
                name=new_name,
                grade=grade,
                major=major,
            )
            db.add(cls)
            await db.flush()
            classes_by_name[new_name.lower()] = cls
            classes_created += 1

    existing_by_nis = {
        u.employee_id: u for u in (
            await db.execute(
                select(User).where(User.org_id == current.org_id)
            )
        ).scalars().all()
    }

    created = 0
    updated = 0
    skipped = 0
    errors: list[str] = []

    for row in raw_data:
        try:
            nis = row["nis"]
            cls_name = row.get("class_name")
            cls_obj = classes_by_name.get(cls_name.lower()) if cls_name else None

            if nis in existing_by_nis:
                if not update_existing:
                    skipped += 1
                    continue
                u = existing_by_nis[nis]
                u.full_name = row["nama"]
                u.email = row.get("email") or u.email
                u.phone = row.get("phone") or u.phone
                u.parent_phone = row.get("parent_phone") or u.parent_phone
                u.parent_name = row.get("parent_name") or u.parent_name
                if cls_obj:
                    u.school_class_id = cls_obj.id
                updated += 1
            else:
                # Create new student
                # Generate email kalau kosong
                first = row["nama"].split()[0].lower()
                email = row.get("email") or f"{first}.{nis}@siswa.aethera.id"

                u = User(
                    org_id=current.org_id,
                    employee_id=nis,
                    full_name=row["nama"],
                    email=email,
                    phone=row.get("phone"),
                    parent_phone=row.get("parent_phone"),
                    parent_name=row.get("parent_name"),
                    role="employee",
                    status="active",
                    school_class_id=cls_obj.id if cls_obj else None,
                    join_date=date.today(),
                    qr_token=secrets.token_urlsafe(18),
                    qr_enabled=True,
                )
                db.add(u)
                await db.flush()

                pw = row.get("password") or f"{first}{nis[-4:] if len(nis) >= 4 else nis}"
                db.add(UserAuth(user_id=u.id, password_hash=hash_password(pw)))
                created += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{row.get('nis', '?')}: {exc}")
            skipped += 1

    await db.commit()

    return Envelope(
        data=CommitOut(
            created=created,
            updated=updated,
            classes_created=classes_created,
            skipped=skipped,
            errors=errors[:50],
        ),
        message=(
            f"{created} siswa baru, {updated} diupdate, {classes_created} kelas baru, "
            f"{skipped} dilewati"
        ),
    )


@router.get("/students/template")
async def download_template():
    """Download CSV template kosong dengan header yang dikenali."""
    from fastapi.responses import Response

    headers = ["Nama", "NIS", "Email", "HP", "Parent_Phone", "Nama_Ortu", "Kelas", "Password"]
    sample = [
        "Andi Pratama", "20240099", "andi.20240099@siswa.aethera.id",
        "081234567890", "082198765432", "Bpk Pratama", "10 IPA 1", "andi9099"
    ]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(headers)
    w.writerow(sample)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="template_siswa.csv"'},
    )
