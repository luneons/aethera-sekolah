"""Rapor PDF Generator.

Generate rapor siswa per semester dalam format PDF resmi.
- Header sekolah
- Identitas siswa
- Tabel nilai per mata pelajaran (rerata, KKM, predikat)
- Rekap kehadiran (hadir, izin, sakit, alpa)
- Catatan disiplin (poin sikap, apresiasi)
- Catatan wali kelas
- TTD wali kelas + kepala sekolah
"""
from __future__ import annotations

import io
from datetime import date, datetime
from typing import Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT


PRIMARY = HexColor("#1e293b")
ACCENT = HexColor("#0ea5e9")
MUTED = HexColor("#64748b")


def _styles() -> dict:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "rapor_title",
            parent=base["Heading1"],
            fontSize=14,
            alignment=TA_CENTER,
            textColor=PRIMARY,
            spaceAfter=4,
        ),
        "subtitle": ParagraphStyle(
            "rapor_subtitle",
            parent=base["Normal"],
            fontSize=10,
            alignment=TA_CENTER,
            textColor=MUTED,
        ),
        "section": ParagraphStyle(
            "rapor_section",
            parent=base["Heading3"],
            fontSize=11,
            textColor=ACCENT,
            spaceBefore=8,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "rapor_body",
            parent=base["BodyText"],
            fontSize=10,
            leading=14,
            alignment=TA_LEFT,
        ),
        "small": ParagraphStyle(
            "rapor_small",
            parent=base["Normal"],
            fontSize=8,
            textColor=MUTED,
        ),
    }


def _predikat(percent: float) -> str:
    """Konversi nilai persen ke predikat huruf."""
    if percent >= 90:
        return "A"
    if percent >= 80:
        return "B"
    if percent >= 70:
        return "C"
    if percent >= 60:
        return "D"
    return "E"


def _deskripsi_predikat(percent: float) -> str:
    if percent >= 90:
        return "Sangat Baik"
    if percent >= 80:
        return "Baik"
    if percent >= 70:
        return "Cukup"
    if percent >= 60:
        return "Kurang"
    return "Sangat Kurang"


def build_rapor_pdf(
    *,
    org_name: str,
    org_address: Optional[str],
    npsn: Optional[str],
    student_name: str,
    student_employee_id: str,
    student_class: Optional[str],
    semester: str,  # "Ganjil 2025/2026" misalnya
    grades_per_subject: list[dict],  # [{subject, code, average, kkm, predikat, deskripsi}]
    attendance: dict,  # {hadir, izin, sakit, alpa, total_hari}
    discipline: dict,  # {attitude_points, appreciation_points, kts_count}
    wali_kelas_name: Optional[str] = None,
    kepsek_name: Optional[str] = None,
    catatan_wali_kelas: Optional[str] = None,
    issued_date: Optional[date] = None,
) -> bytes:
    issued_date = issued_date or date.today()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.8 * cm,
        title=f"Rapor {student_name} — {semester}",
    )
    styles = _styles()
    story: list = []

    # Header
    story.append(Paragraph(f"<b>{org_name.upper()}</b>", styles["title"]))
    if org_address:
        story.append(Paragraph(org_address, styles["subtitle"]))
    if npsn:
        story.append(Paragraph(f"NPSN: {npsn}", styles["subtitle"]))
    story.append(Spacer(1, 8))
    story.append(Paragraph(f"<b>LAPORAN HASIL BELAJAR</b>", styles["title"]))
    story.append(Paragraph(f"Semester {semester}", styles["subtitle"]))
    story.append(Spacer(1, 14))

    # Identitas siswa
    identity_data = [
        ["Nama", ":", student_name],
        ["NIS", ":", student_employee_id],
        ["Kelas", ":", student_class or "-"],
        ["Semester", ":", semester],
    ]
    identity_table = Table(identity_data, colWidths=[3 * cm, 0.4 * cm, 12 * cm])
    identity_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(identity_table)
    story.append(Spacer(1, 14))

    # Nilai
    story.append(Paragraph("A. Nilai Akademik", styles["section"]))
    grade_header = ["No", "Mata Pelajaran", "KKM", "Nilai", "Predikat", "Deskripsi"]
    grade_rows = [grade_header]
    for i, g in enumerate(grades_per_subject, 1):
        avg = g.get("average", 0)
        grade_rows.append([
            str(i),
            f"{g.get('subject', '?')} ({g.get('code', '')})",
            str(int(g.get("kkm", 75))),
            f"{avg:.1f}",
            _predikat(avg),
            _deskripsi_predikat(avg),
        ])
    if not grades_per_subject:
        grade_rows.append(["-", "Belum ada nilai tercatat", "-", "-", "-", "-"])

    grade_table = Table(grade_rows, colWidths=[1 * cm, 6 * cm, 1.5 * cm, 1.8 * cm, 2 * cm, 4.5 * cm])
    grade_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("TEXTCOLOR", (0, 0), (-1, 0), HexColor("#ffffff")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.4, MUTED),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (4, -1), "CENTER"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#ffffff"), HexColor("#f8fafc")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(grade_table)

    # Rerata GPA
    if grades_per_subject:
        gpa = sum(g.get("average", 0) for g in grades_per_subject) / len(grades_per_subject)
        story.append(Spacer(1, 6))
        story.append(Paragraph(
            f"<b>Rata-rata Nilai:</b> {gpa:.2f} ({_predikat(gpa)} – {_deskripsi_predikat(gpa)})",
            styles["body"],
        ))
    story.append(Spacer(1, 14))

    # Kehadiran
    story.append(Paragraph("B. Kehadiran", styles["section"]))
    att_header = ["Hadir", "Izin", "Sakit", "Alpa", "Total Hari Efektif"]
    att_row = [
        str(attendance.get("hadir", 0)),
        str(attendance.get("izin", 0)),
        str(attendance.get("sakit", 0)),
        str(attendance.get("alpa", 0)),
        str(attendance.get("total_hari", 0)),
    ]
    att_table = Table([att_header, att_row], colWidths=[3.4 * cm] * 5)
    att_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("TEXTCOLOR", (0, 0), (-1, 0), HexColor("#ffffff")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.4, MUTED),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(att_table)
    story.append(Spacer(1, 14))

    # Disiplin
    story.append(Paragraph("C. Sikap & Disiplin", styles["section"]))
    disc_data = [
        ["Poin Sikap", ":", f"{discipline.get('attitude_points', 100)}/100"],
        ["Poin Apresiasi", ":", f"{discipline.get('appreciation_points', 0)}"],
        ["Pelanggaran (KTS)", ":", f"{discipline.get('kts_count', 0)} insiden"],
    ]
    disc_table = Table(disc_data, colWidths=[4 * cm, 0.4 * cm, 11 * cm])
    disc_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(disc_table)
    story.append(Spacer(1, 14))

    # Catatan wali kelas
    if catatan_wali_kelas:
        story.append(Paragraph("D. Catatan Wali Kelas", styles["section"]))
        story.append(Paragraph(catatan_wali_kelas, styles["body"]))
        story.append(Spacer(1, 18))

    # TTD section
    issued_str = issued_date.strftime("%d %B %Y")
    ttd_data = [
        ["Mengetahui,", "", f"{(org_address or '').split(',')[0] or 'Sekolah'}, {issued_str}"],
        ["Kepala Sekolah", "", "Wali Kelas"],
        ["", "", ""],
        ["", "", ""],
        ["", "", ""],
        [
            f"({kepsek_name or '_______________________'})",
            "",
            f"({wali_kelas_name or '_______________________'})",
        ],
    ]
    ttd_table = Table(ttd_data, colWidths=[6 * cm, 3 * cm, 6 * cm])
    ttd_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (2, -1), "CENTER"),
    ]))
    story.append(ttd_table)

    doc.build(story)
    return buf.getvalue()
