"""LMS service: parsing nilai dari CSV/XLSX & integrasi GPA.

Format input file (header tidak case-sensitive):
    Kolom A : nis     (wajib)
    Kolom B : nama    (untuk verifikasi visual)
    Kolom C : nilai   (numerik, 0..max_score)
    Kolom D : catatan (opsional)

Header bisa pakai:
    Indonesia : 'nis', 'nama', 'nilai', 'catatan'
    English   : 'student_id', 'name', 'score', 'note'
    Atau dilewati (baris pertama langsung data) — sistem auto-detect.
"""
from __future__ import annotations

import csv
import io
import logging
from dataclasses import dataclass
from typing import Iterable

from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Assignment,
    AssignmentGrade,
    DisciplineProfile,
    User,
)


logger = logging.getLogger(__name__)


HEADER_NIS = {"nis", "student_id", "studentid", "id_siswa", "nomor_induk"}
HEADER_NAMA = {"nama", "name", "full_name", "fullname", "nama_siswa"}
HEADER_NILAI = {"nilai", "score", "skor", "value", "nilai_akhir"}
HEADER_CATATAN = {"catatan", "note", "notes", "keterangan", "remark"}


@dataclass
class ParsedRow:
    row_num: int
    nis: str | None
    nama: str | None
    nilai: float | None
    catatan: str | None
    raw: list  # original cells, for debugging


def _detect_header(first_row: list[str]) -> tuple[bool, dict[str, int]]:
    """Auto-detect apakah baris pertama header.

    Return (has_header, column_map). column_map = {'nis': 0, 'nama': 1, ...}
    """
    if not first_row:
        return False, {0: "nis", 1: "nama", 2: "nilai", 3: "catatan"}

    # Normalisasi: trim + lowercase + ganti space dengan underscore
    normalized = [
        str(c).strip().lower().replace(" ", "_") if c is not None else ""
        for c in first_row
    ]

    has_text_header = any(
        c in HEADER_NIS or c in HEADER_NAMA or c in HEADER_NILAI for c in normalized
    )
    if not has_text_header:
        return False, {0: "nis", 1: "nama", 2: "nilai", 3: "catatan"}

    column_map: dict[int, str] = {}
    for idx, c in enumerate(normalized):
        if c in HEADER_NIS:
            column_map[idx] = "nis"
        elif c in HEADER_NAMA:
            column_map[idx] = "nama"
        elif c in HEADER_NILAI:
            column_map[idx] = "nilai"
        elif c in HEADER_CATATAN:
            column_map[idx] = "catatan"

    # Default fallback kalau header partial
    for idx in range(4):
        if idx not in column_map:
            default_field = ["nis", "nama", "nilai", "catatan"][idx]
            if default_field not in column_map.values():
                column_map[idx] = default_field

    return True, column_map


def _row_to_parsed(
    row_num: int, cells: list, column_map: dict[int, str]
) -> ParsedRow:
    out: dict = {"nis": None, "nama": None, "nilai": None, "catatan": None}
    for idx, val in enumerate(cells):
        field = column_map.get(idx)
        if not field:
            continue
        if val is None:
            continue
        s = str(val).strip()
        if not s:
            continue
        if field == "nilai":
            try:
                # Support 85,5 (Indonesian) atau 85.5
                out["nilai"] = float(s.replace(",", "."))
            except ValueError:
                out["nilai"] = None
        else:
            out[field] = s

    return ParsedRow(
        row_num=row_num,
        nis=out["nis"],
        nama=out["nama"],
        nilai=out["nilai"],
        catatan=out["catatan"],
        raw=list(cells),
    )


def parse_csv(content: bytes) -> list[ParsedRow]:
    text = content.decode("utf-8-sig", errors="replace")  # handle BOM
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return []

    has_header, col_map = _detect_header(rows[0])
    start_idx = 1 if has_header else 0
    out: list[ParsedRow] = []
    for i, row in enumerate(rows[start_idx:], start=start_idx + 1):
        # Skip baris kosong total
        if not any(c.strip() for c in row if c is not None):
            continue
        out.append(_row_to_parsed(i, row, col_map))
    return out


def parse_xlsx(content: bytes) -> list[ParsedRow]:
    wb = load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)

    first_row: list | None = None
    out: list[ParsedRow] = []
    row_num = 0
    for row in rows_iter:
        row_num += 1
        cells = list(row)
        if first_row is None:
            first_row = [str(c) if c is not None else "" for c in cells]
            has_header, col_map = _detect_header(first_row)
            if has_header:
                continue
            # Tidak ada header: parse baris pertama sebagai data
            if any(c is not None and str(c).strip() for c in cells):
                out.append(_row_to_parsed(row_num, cells, col_map))
            continue
        # Skip baris kosong
        if not any(c is not None and str(c).strip() for c in cells):
            continue
        out.append(_row_to_parsed(row_num, cells, col_map))

    wb.close()
    return out


# ── Validasi & Resolve siswa ────────────────────────────────────────────────


async def resolve_students_by_nis(
    db: AsyncSession, *, org_id: int, school_class_id: int, nis_list: Iterable[str]
) -> dict[str, User]:
    """Cari semua siswa di kelas target by NIS. Return map nis -> User."""
    nis_clean = list({n.strip() for n in nis_list if n})
    if not nis_clean:
        return {}
    rows = (
        await db.execute(
            select(User).where(
                User.org_id == org_id,
                User.school_class_id == school_class_id,
                User.role == "employee",
                User.employee_id.in_(nis_clean),
            )
        )
    ).scalars().all()
    return {u.employee_id: u for u in rows}


# ── Integrasi GPA ───────────────────────────────────────────────────────────


async def recompute_gpa_for_student(db: AsyncSession, student_id: int) -> float:
    """Hitung ulang GPA dari semua AssignmentGrade siswa ini.

    Formula: weighted average (score / max_score * 100, di-bobot dengan
    Assignment.weight). Hasil 0..100, di-update ke discipline_profiles.gpa.

    Catatan: hanya menghitung dari assignment_grades. GPA awal dari seed
    akan ter-overwrite begitu siswa punya satu nilai. Untuk demo, ini OK
    karena nilai masuk = leaderboard GPA mulai akurat.
    """
    rows = (
        await db.execute(
            select(AssignmentGrade, Assignment)
            .join(Assignment, Assignment.id == AssignmentGrade.assignment_id)
            .where(AssignmentGrade.student_id == student_id)
        )
    ).all()

    if not rows:
        return 0.0

    total_weighted = 0.0
    total_weight = 0.0
    for grade, asg in rows:
        # Normalisasi ke 0..100 berbasis max_score
        if asg.max_score <= 0:
            continue
        normalized = max(0.0, min(100.0, (grade.score / asg.max_score) * 100))
        total_weighted += normalized * asg.weight
        total_weight += asg.weight

    if total_weight <= 0:
        return 0.0

    gpa = round(total_weighted / total_weight, 2)

    profile = (
        await db.execute(
            select(DisciplineProfile).where(DisciplineProfile.user_id == student_id)
        )
    ).scalar_one_or_none()
    if profile:
        profile.gpa = gpa
        await db.flush()

    return gpa
