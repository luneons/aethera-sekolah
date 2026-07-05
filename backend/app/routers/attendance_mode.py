"""Attendance mode management — kepsek atur metode absensi global & per-siswa.

Endpoints:
- GET  /attendance-mode/        → setting global org
- PUT  /attendance-mode/        → update mode global (super_admin only)
- GET  /attendance-mode/students → list siswa + status QR access
- POST /attendance-mode/qr/bulk → bulk enable/disable QR per siswa
- POST /attendance-mode/qr/regenerate/{user_id} → regenerate QR token per siswa
- POST /attendance-mode/qr/regenerate-all → regenerate semua QR di kelas/org
- GET  /attendance-mode/qr/{user_id}/png → download QR sebagai PNG
- GET  /attendance-mode/qr/print/class/{class_id} → cetak semua QR satu kelas (HTML)

QR check-in/out:
- POST /attendance/checkin-qr  → scan QR token
- POST /attendance/checkout-qr → scan QR token

CSV import:
- POST /attendance/import-csv/preview → preview CSV
- POST /attendance/import-csv/commit  → commit CSV
- GET  /attendance/import-csv/template → download CSV template
"""
from __future__ import annotations

import csv
import io
import secrets
from datetime import date, datetime, time
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import (
    AttendanceRecord, AuditLog, OrganizationAttendanceSetting,
    SchoolClass, User, WorkSchedule,
)
from app.schemas import Envelope
from app.security import get_current_user, require_roles


router = APIRouter(prefix="/attendance-mode", tags=["Attendance Mode"])
qr_router = APIRouter(prefix="/attendance", tags=["Attendance QR & CSV"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class AttendanceModeOut(BaseModel):
    mode: str
    qr_default_enabled: bool
    qr_rotation_days: int

    model_config = {"from_attributes": True}


class AttendanceModeIn(BaseModel):
    mode: str = Field(..., pattern="^(face|qr|mixed|manual)$")
    qr_default_enabled: bool = True
    qr_rotation_days: int = 0


class StudentQrItem(BaseModel):
    user_id: int
    full_name: str
    employee_id: str
    school_class_id: Optional[int]
    school_class_name: Optional[str]
    qr_enabled: bool
    has_qr_token: bool


class BulkQrPayload(BaseModel):
    user_ids: list[int]
    enabled: bool


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _ensure_setting(db: AsyncSession, org_id: int) -> OrganizationAttendanceSetting:
    s = (
        await db.execute(
            select(OrganizationAttendanceSetting).where(
                OrganizationAttendanceSetting.org_id == org_id
            )
        )
    ).scalar_one_or_none()
    if not s:
        s = OrganizationAttendanceSetting(org_id=org_id, mode="face", qr_default_enabled=True)
        db.add(s)
        await db.commit()
        await db.refresh(s)
    return s


def _generate_qr_token() -> str:
    """24-char URL-safe random token. Cryptographically secure."""
    return secrets.token_urlsafe(18)  # ~24 chars


# ─── Mode endpoints ───────────────────────────────────────────────────────────

@router.get("/", response_model=Envelope[AttendanceModeOut])
async def get_mode(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    s = await _ensure_setting(db, current.org_id)
    return Envelope(data=AttendanceModeOut.model_validate(s))


@router.put("/", response_model=Envelope[AttendanceModeOut])
async def update_mode(
    payload: AttendanceModeIn,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    s = await _ensure_setting(db, current.org_id)
    old_mode = s.mode
    s.mode = payload.mode
    s.qr_default_enabled = payload.qr_default_enabled
    s.qr_rotation_days = payload.qr_rotation_days
    db.add(AuditLog(
        user_id=current.id, action="UPDATE_ATTENDANCE_MODE",
        target_type="org_setting",
        extra_meta={"old": old_mode, "new": payload.mode},
    ))
    await db.commit()
    await db.refresh(s)
    return Envelope(data=AttendanceModeOut.model_validate(s), message="Mode absensi diperbarui")


# ─── QR per-student access management ─────────────────────────────────────────

@router.get("/students", response_model=Envelope[list[StudentQrItem]])
async def list_students_qr(
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    class_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None, description="Filter role: employee, admin, hr, super_admin (default: semua)"),
):
    """List user dengan status QR + kelasnya (untuk page settings).

    Default: tampilkan semua role kecuali super_admin sendiri.
    Pakai ?role=employee untuk hanya siswa, ?role=admin untuk guru/staff.
    """
    stmt = (
        select(User)
        .where(User.org_id == current.org_id)
        .options(selectinload(User.school_class))
        .order_by(User.role.asc(), User.full_name.asc())
    )
    if role:
        stmt = stmt.where(User.role == role)
    if class_id:
        stmt = stmt.where(User.school_class_id == class_id)
    if search:
        from sqlalchemy import or_
        like = f"%{search}%"
        stmt = stmt.where(or_(User.full_name.ilike(like), User.employee_id.ilike(like)))

    rows = (await db.execute(stmt)).scalars().all()
    items = [
        StudentQrItem(
            user_id=u.id,
            full_name=u.full_name,
            employee_id=u.employee_id,
            school_class_id=u.school_class_id,
            school_class_name=(
                u.school_class.name if u.school_class
                else (
                    "Guru" if u.role == "admin"
                    else "Staff TU" if u.role == "hr"
                    else "Kepala Sekolah" if u.role == "super_admin"
                    else None
                )
            ),
            qr_enabled=u.qr_enabled,
            has_qr_token=bool(u.qr_token),
        )
        for u in rows
    ]
    return Envelope(data=items)


@router.post("/qr/bulk", response_model=Envelope[dict])
async def bulk_qr_toggle(
    payload: BulkQrPayload,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Bulk enable/disable QR access untuk daftar user_ids."""
    if not payload.user_ids:
        raise HTTPException(400, "user_ids tidak boleh kosong")
    res = await db.execute(
        update(User)
        .where(
            User.id.in_(payload.user_ids),
            User.org_id == current.org_id,
        )
        .values(qr_enabled=payload.enabled)
    )
    db.add(AuditLog(
        user_id=current.id, action="BULK_QR_TOGGLE",
        target_type="user",
        extra_meta={"count": res.rowcount, "enabled": payload.enabled},
    ))
    await db.commit()
    return Envelope(
        data={"updated": res.rowcount},
        message=f"{res.rowcount} siswa di-{'aktifkan' if payload.enabled else 'nonaktifkan'} QR",
    )


@router.post("/qr/regenerate/{user_id}", response_model=Envelope[dict])
async def regenerate_qr(
    user_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    u = await db.get(User, user_id)
    if not u or u.org_id != current.org_id:
        raise HTTPException(404, "Siswa tidak ditemukan")
    u.qr_token = _generate_qr_token()
    db.add(AuditLog(
        user_id=current.id, action="REGENERATE_QR",
        target_type="user", target_id=user_id,
    ))
    await db.commit()
    return Envelope(
        data={"user_id": u.id, "qr_token": u.qr_token},
        message="QR token baru dibuat",
    )


@router.post("/qr/regenerate-all", response_model=Envelope[dict])
async def regenerate_all_qr(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    class_id: Optional[int] = Query(None, description="Kalau diisi, hanya regen kelas ini"),
    role: Optional[str] = Query(None, description="Filter role spesifik (default: semua)"),
):
    """Regenerate QR untuk semua user di org / di satu kelas / role tertentu.

    Tanpa filter: semua user dapat token baru (siswa, guru, staff, kepsek).
    """
    stmt = select(User).where(User.org_id == current.org_id)
    if role:
        stmt = stmt.where(User.role == role)
    if class_id:
        stmt = stmt.where(User.school_class_id == class_id)

    users = (await db.execute(stmt)).scalars().all()
    for u in users:
        u.qr_token = _generate_qr_token()

    db.add(AuditLog(
        user_id=current.id, action="REGENERATE_ALL_QR",
        target_type="user",
        extra_meta={"count": len(users), "class_id": class_id, "role": role},
    ))
    await db.commit()
    return Envelope(
        data={"regenerated": len(users)},
        message=f"{len(users)} QR token diperbarui",
    )


@router.get("/qr/{user_id}/png")
async def get_qr_png(
    user_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Render QR sebagai PNG (untuk dicetak / didistribusikan)."""
    import qrcode
    u = await db.get(User, user_id)
    if not u or u.org_id != current.org_id:
        raise HTTPException(404, "Siswa tidak ditemukan")
    if not u.qr_token:
        u.qr_token = _generate_qr_token()
        await db.commit()

    qr = qrcode.QRCode(box_size=10, border=2)
    qr.add_data(f"AETHERA:{u.qr_token}")
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={
            "Content-Disposition": f'inline; filename="qr_{u.employee_id}.png"',
        },
    )


@router.get("/qr/print/class/{class_id}", response_class=HTMLResponse)
async def print_class_qr(
    class_id: int,
    current: Annotated[User, Depends(require_roles("super_admin", "admin", "hr"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Cetak HTML semua QR satu kelas (4 per baris, A4 friendly)."""
    import qrcode

    cls = await db.get(SchoolClass, class_id)
    if not cls or cls.org_id != current.org_id:
        raise HTTPException(404, "Kelas tidak ditemukan")

    students = (
        await db.execute(
            select(User)
            .where(
                User.org_id == current.org_id,
                User.school_class_id == class_id,
                User.role == "employee",
            )
            .order_by(User.full_name.asc())
        )
    ).scalars().all()

    # Generate token kalau belum ada
    for u in students:
        if not u.qr_token:
            u.qr_token = _generate_qr_token()
    await db.commit()

    # Render QR ke base64 PNG
    import base64
    cards = []
    for u in students:
        qr = qrcode.QRCode(box_size=4, border=1)
        qr.add_data(f"AETHERA:{u.qr_token}")
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()
        cards.append(f"""
        <div class="card">
            <img src="data:image/png;base64,{b64}" alt="QR" />
            <div class="name">{u.full_name}</div>
            <div class="nis">{u.employee_id}</div>
            <div class="cls">{cls.name}</div>
        </div>
        """)

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>QR Absensi {cls.name}</title>
        <style>
            * {{ box-sizing: border-box; }}
            body {{ font-family: -apple-system, sans-serif; margin: 12mm; }}
            h1 {{ font-size: 18px; margin: 0 0 12px 0; }}
            .grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 8mm; }}
            .card {{
                border: 1px solid #ccc; border-radius: 6px; padding: 4mm;
                text-align: center; page-break-inside: avoid;
            }}
            .card img {{ width: 100%; height: auto; }}
            .name {{ font-weight: 600; font-size: 11px; margin-top: 4px; }}
            .nis {{ font-family: monospace; font-size: 10px; color: #666; }}
            .cls {{ font-size: 10px; color: #888; }}
            .toolbar {{ position: sticky; top: 0; background: #fff; padding: 8px 0;
                       border-bottom: 1px solid #eee; margin-bottom: 12px; }}
            .toolbar button {{
                padding: 8px 16px; background: #f97316; color: #fff;
                border: 0; border-radius: 6px; cursor: pointer;
                font-weight: 600; font-size: 14px;
            }}
            @media print {{
                .toolbar {{ display: none; }}
                body {{ margin: 8mm; }}
            }}
        </style>
    </head>
    <body>
        <div class="toolbar">
            <button onclick="window.print()">🖨️ Cetak</button>
            <span style="margin-left:12px;color:#666;font-size:13px;">
                {len(students)} kartu • Kelas {cls.name}
            </span>
        </div>
        <h1>Kartu Absensi QR — {cls.name}</h1>
        <div class="grid">
            {"".join(cards)}
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html)


# ─── QR check-in / check-out ──────────────────────────────────────────────────

class QrCheckRequest(BaseModel):
    qr_token: str  # bisa "AETHERA:xxxxx" atau langsung "xxxxx"


def _strip_prefix(t: str) -> str:
    return t.replace("AETHERA:", "").strip() if t else ""


def _determine_status(check_in: datetime, schedule: Optional[WorkSchedule]) -> tuple[str, int]:
    if schedule:
        deadline = datetime.combine(check_in.date(), schedule.check_in_end)
        grace = schedule.grace_period
    else:
        deadline = datetime.combine(check_in.date(), time(8, 0))
        grace = 15
    delta = check_in - deadline
    total_min = int(delta.total_seconds() // 60)
    if total_min <= grace:
        return "present", max(0, total_min)
    return "late", total_min


@qr_router.post("/checkin-qr", response_model=Envelope[dict])
async def checkin_qr(
    payload: QrCheckRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    token = _strip_prefix(payload.qr_token)
    if not token:
        raise HTTPException(400, "QR token kosong")

    u = (
        await db.execute(select(User).where(User.qr_token == token))
    ).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "QR tidak dikenali")
    if u.status != "active":
        raise HTTPException(403, "Akun tidak aktif")

    # Cek apakah org mengizinkan QR
    setting = await _ensure_setting(db, u.org_id)
    if setting.mode == "face":
        raise HTTPException(403, "Sekolah hanya menerima absensi via wajah")
    if setting.mode == "manual":
        raise HTTPException(403, "Sekolah pakai mode manual, tidak bisa QR")
    if not u.qr_enabled:
        raise HTTPException(403, "Akses QR siswa ini dinonaktifkan")

    today = date.today()
    now = datetime.now()
    rec = (
        await db.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.user_id == u.id,
                AttendanceRecord.attendance_date == today,
            )
        )
    ).scalar_one_or_none()

    if rec and rec.check_in_at:
        return Envelope(
            data={
                "user": {"id": u.id, "name": u.full_name, "employee_id": u.employee_id},
                "timestamp": rec.check_in_at.isoformat(),
                "status": rec.status,
                "already_recorded": True,
            },
            message=f"Sudah absen pukul {rec.check_in_at:%H:%M}",
        )

    # Pilih jadwal aktif
    schedule = (
        await db.execute(
            select(WorkSchedule)
            .where(WorkSchedule.org_id == u.org_id, WorkSchedule.is_active == True)  # noqa: E712
            .limit(1)
        )
    ).scalar_one_or_none()
    status_str, late_min = _determine_status(now, schedule)

    if rec is None:
        rec = AttendanceRecord(
            user_id=u.id,
            attendance_date=today,
            schedule_id=schedule.id if schedule else None,
        )
        db.add(rec)

    rec.check_in_at = now
    rec.check_in_method = "manual"  # QR dianggap manual (bukan face)
    rec.status = status_str
    rec.late_minutes = late_min
    if schedule:
        rec.schedule_id = schedule.id

    db.add(AuditLog(
        user_id=u.id, action="CHECKIN_QR",
        target_type="attendance",
        ip_address=request.client.host if request.client else None,
        extra_meta={"status": status_str},
    ))
    await db.commit()

    return Envelope(
        data={
            "user": {
                "id": u.id, "name": u.full_name, "employee_id": u.employee_id,
                "photo_url": u.photo_url,
            },
            "timestamp": now.isoformat(),
            "status": status_str,
            "late_minutes": late_min,
        },
        message="Absen masuk berhasil",
    )


@qr_router.post("/checkout-qr", response_model=Envelope[dict])
async def checkout_qr(
    payload: QrCheckRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    token = _strip_prefix(payload.qr_token)
    if not token:
        raise HTTPException(400, "QR token kosong")

    u = (
        await db.execute(select(User).where(User.qr_token == token))
    ).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "QR tidak dikenali")

    setting = await _ensure_setting(db, u.org_id)
    if setting.mode in ("face", "manual"):
        raise HTTPException(403, "QR tidak diizinkan di mode ini")
    if not u.qr_enabled:
        raise HTTPException(403, "Akses QR siswa ini dinonaktifkan")

    today = date.today()
    now = datetime.now()
    rec = (
        await db.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.user_id == u.id,
                AttendanceRecord.attendance_date == today,
            )
        )
    ).scalar_one_or_none()
    if not rec or not rec.check_in_at:
        raise HTTPException(400, "Belum check-in hari ini")
    if rec.check_out_at:
        return Envelope(
            data={
                "user": {"id": u.id, "name": u.full_name, "employee_id": u.employee_id},
                "timestamp": rec.check_out_at.isoformat(),
                "already_recorded": True,
            },
            message=f"Sudah check-out pukul {rec.check_out_at:%H:%M}",
        )

    rec.check_out_at = now
    rec.check_out_method = "manual"
    rec.work_duration = int((now - rec.check_in_at).total_seconds() // 60)

    db.add(AuditLog(
        user_id=u.id, action="CHECKOUT_QR",
        target_type="attendance",
        ip_address=request.client.host if request.client else None,
        extra_meta={"duration_min": rec.work_duration},
    ))
    await db.commit()
    return Envelope(
        data={
            "user": {"id": u.id, "name": u.full_name, "employee_id": u.employee_id},
            "timestamp": now.isoformat(),
            "work_duration_min": rec.work_duration,
        },
        message="Absen pulang berhasil",
    )


# ─── CSV bulk import attendance ───────────────────────────────────────────────


@qr_router.get("/import-csv/template")
async def csv_template():
    """Download CSV template untuk bulk attendance."""
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["NIS", "Tanggal", "Status", "Jam_Masuk", "Jam_Pulang", "Catatan"])
    w.writerow(["20240099", "2026-05-28", "present", "07:15", "14:00", "Hadir tepat waktu"])
    w.writerow(["20240100", "2026-05-28", "late", "07:45", "14:00", "Terlambat 15 menit"])
    w.writerow(["20240101", "2026-05-28", "absent", "", "", "Tanpa keterangan"])
    w.writerow(["20240102", "2026-05-28", "excused", "", "", "Sakit (surat dokter)"])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="template_absensi.csv"'},
    )


class CsvPreviewRow(BaseModel):
    row_num: int
    nis: Optional[str] = None
    tanggal: Optional[str] = None
    status: Optional[str] = None
    jam_masuk: Optional[str] = None
    jam_pulang: Optional[str] = None
    catatan: Optional[str] = None
    matched_name: Optional[str] = None
    valid: bool = False
    error: Optional[str] = None
    will_overwrite: bool = False


class CsvPreviewOut(BaseModel):
    total_rows: int
    valid_rows: int
    invalid_rows: int
    will_create: int
    will_overwrite: int
    rows: list[CsvPreviewRow]


VALID_STATUSES = {"present", "late", "absent", "excused", "holiday"}
COL_MAP = {
    "nis": ["nis", "employee_id", "no_induk", "id"],
    "tanggal": ["tanggal", "date", "tgl"],
    "status": ["status", "kondisi"],
    "jam_masuk": ["jam_masuk", "check_in", "masuk"],
    "jam_pulang": ["jam_pulang", "check_out", "pulang"],
    "catatan": ["catatan", "notes", "keterangan"],
}


def _detect_csv_cols(header: list[str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for idx, h in enumerate(header):
        h_lc = (h or "").strip().lower().replace(" ", "_")
        for key, aliases in COL_MAP.items():
            if h_lc in aliases and key not in out:
                out[key] = idx
    return out


async def _build_csv_preview(
    db: AsyncSession, org_id: int, file: UploadFile
) -> tuple[CsvPreviewOut, list[dict]]:
    content = await file.read()
    if not content:
        raise HTTPException(400, "File kosong")
    try:
        text = content.decode("utf-8", errors="replace")
    except Exception:
        raise HTTPException(400, "File harus UTF-8 encoded")
    rows = list(csv.reader(io.StringIO(text)))
    if len(rows) < 2:
        raise HTTPException(400, "File kosong atau tidak ada header")

    header = rows[0]
    cols = _detect_csv_cols(header)
    required = {"nis", "tanggal", "status"}
    missing = required - set(cols.keys())
    if missing:
        raise HTTPException(
            400,
            f"Kolom wajib hilang: {', '.join(missing)}. "
            f"Header dideteksi: {list(cols.keys())}",
        )

    # Lookup NIS → user
    nis_set = set()
    for row in rows[1:]:
        idx = cols.get("nis")
        if idx is not None and idx < len(row):
            nis = (row[idx] or "").strip()
            if nis:
                nis_set.add(nis)

    users_by_nis = {
        u.employee_id: u for u in (
            await db.execute(
                select(User).where(
                    User.org_id == org_id,
                    User.employee_id.in_(list(nis_set)),
                )
            )
        ).scalars().all()
    }

    # Existing attendance lookup
    existing_keys: set[tuple[int, date]] = set()
    if users_by_nis:
        ids = [u.id for u in users_by_nis.values()]
        existing = (
            await db.execute(
                select(AttendanceRecord.user_id, AttendanceRecord.attendance_date)
                .where(AttendanceRecord.user_id.in_(ids))
            )
        ).all()
        existing_keys = {(uid, d) for uid, d in existing}

    parsed_rows: list[CsvPreviewRow] = []
    raw_data: list[dict] = []

    def cell(row: list[str], key: str) -> str:
        idx = cols.get(key)
        if idx is None or idx >= len(row):
            return ""
        return (row[idx] or "").strip()

    for i, row in enumerate(rows[1:], start=2):
        if not any(c.strip() for c in row):
            continue
        nis = cell(row, "nis")
        tgl = cell(row, "tanggal")
        st = cell(row, "status").lower()
        jm = cell(row, "jam_masuk")
        jp = cell(row, "jam_pulang")
        cat = cell(row, "catatan") or None

        if not nis or not tgl or not st:
            parsed_rows.append(CsvPreviewRow(
                row_num=i, nis=nis or None, tanggal=tgl or None, status=st or None,
                error="NIS / Tanggal / Status kosong",
            ))
            continue

        if st not in VALID_STATUSES:
            parsed_rows.append(CsvPreviewRow(
                row_num=i, nis=nis, tanggal=tgl, status=st,
                error=f"Status tidak valid (harus: {', '.join(sorted(VALID_STATUSES))})",
            ))
            continue

        # Parse tanggal
        try:
            d = date.fromisoformat(tgl)
        except ValueError:
            parsed_rows.append(CsvPreviewRow(
                row_num=i, nis=nis, tanggal=tgl, status=st,
                error="Format tanggal harus YYYY-MM-DD",
            ))
            continue

        u = users_by_nis.get(nis)
        if not u:
            parsed_rows.append(CsvPreviewRow(
                row_num=i, nis=nis, tanggal=tgl, status=st,
                error=f"NIS tidak ditemukan",
            ))
            continue

        # Parse jam (optional)
        jm_t: Optional[time] = None
        jp_t: Optional[time] = None
        if jm:
            try:
                h, m = jm.split(":")
                jm_t = time(int(h), int(m))
            except Exception:
                parsed_rows.append(CsvPreviewRow(
                    row_num=i, nis=nis, tanggal=tgl, status=st,
                    error="Format jam_masuk harus HH:MM",
                ))
                continue
        if jp:
            try:
                h, m = jp.split(":")
                jp_t = time(int(h), int(m))
            except Exception:
                parsed_rows.append(CsvPreviewRow(
                    row_num=i, nis=nis, tanggal=tgl, status=st,
                    error="Format jam_pulang harus HH:MM",
                ))
                continue

        will_overwrite = (u.id, d) in existing_keys
        parsed_rows.append(CsvPreviewRow(
            row_num=i, nis=nis, tanggal=tgl, status=st,
            jam_masuk=jm or None, jam_pulang=jp or None, catatan=cat,
            matched_name=u.full_name,
            valid=True, will_overwrite=will_overwrite,
        ))
        raw_data.append({
            "user_id": u.id, "date": d, "status": st,
            "jam_masuk": jm_t, "jam_pulang": jp_t, "notes": cat,
        })

    valid = sum(1 for r in parsed_rows if r.valid)
    return CsvPreviewOut(
        total_rows=len(parsed_rows),
        valid_rows=valid,
        invalid_rows=len(parsed_rows) - valid,
        will_create=sum(1 for r in parsed_rows if r.valid and not r.will_overwrite),
        will_overwrite=sum(1 for r in parsed_rows if r.valid and r.will_overwrite),
        rows=parsed_rows[:300],
    ), raw_data


@qr_router.post("/import-csv/preview", response_model=Envelope[CsvPreviewOut])
async def csv_preview(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    preview, _ = await _build_csv_preview(db, current.org_id, file)
    return Envelope(data=preview)


class CsvCommitOut(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: list[str]


@qr_router.post("/import-csv/commit", response_model=Envelope[CsvCommitOut])
async def csv_commit(
    current: Annotated[User, Depends(require_roles("super_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    overwrite: bool = Query(True, description="Overwrite jika sudah ada record"),
):
    preview, raw_data = await _build_csv_preview(db, current.org_id, file)
    created = updated = skipped = 0
    errors: list[str] = []

    for row in raw_data:
        try:
            existing = (
                await db.execute(
                    select(AttendanceRecord).where(
                        AttendanceRecord.user_id == row["user_id"],
                        AttendanceRecord.attendance_date == row["date"],
                    )
                )
            ).scalar_one_or_none()

            ci_dt = datetime.combine(row["date"], row["jam_masuk"]) if row["jam_masuk"] else None
            co_dt = datetime.combine(row["date"], row["jam_pulang"]) if row["jam_pulang"] else None

            late_min = 0
            if ci_dt:
                deadline = datetime.combine(row["date"], time(8, 0))
                delta = ci_dt - deadline
                late_min = max(0, int(delta.total_seconds() // 60))

            if existing:
                if not overwrite:
                    skipped += 1
                    continue
                existing.status = row["status"]
                if ci_dt:
                    existing.check_in_at = ci_dt
                    existing.check_in_method = "override"
                if co_dt:
                    existing.check_out_at = co_dt
                    existing.check_out_method = "override"
                if ci_dt and co_dt:
                    existing.work_duration = int((co_dt - ci_dt).total_seconds() // 60)
                if row["status"] == "late":
                    existing.late_minutes = late_min if late_min else (existing.late_minutes or 1)
                if row["notes"]:
                    existing.notes = row["notes"]
                updated += 1
            else:
                rec = AttendanceRecord(
                    user_id=row["user_id"],
                    attendance_date=row["date"],
                    status=row["status"],
                    check_in_at=ci_dt,
                    check_in_method="override" if ci_dt else "manual",
                    check_out_at=co_dt,
                    check_out_method="override" if co_dt else None,
                    work_duration=int((co_dt - ci_dt).total_seconds() // 60) if (ci_dt and co_dt) else None,
                    late_minutes=late_min if row["status"] == "late" else 0,
                    notes=row["notes"],
                )
                db.add(rec)
                created += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Row {row.get('user_id')}: {exc}")
            skipped += 1

    db.add(AuditLog(
        user_id=current.id, action="IMPORT_ATTENDANCE_CSV",
        target_type="attendance",
        extra_meta={"created": created, "updated": updated, "skipped": skipped},
    ))
    await db.commit()

    return Envelope(
        data=CsvCommitOut(
            created=created, updated=updated, skipped=skipped,
            errors=errors[:50],
        ),
        message=f"{created} record baru, {updated} diupdate, {skipped} dilewati",
    )
