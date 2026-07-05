"""Letter / Surat Otomatis — generator PDF resmi sekolah.

Pakai reportlab. Layout sederhana: header sekolah, nomor surat, isi
template, footer TTD kepsek.
"""
from __future__ import annotations

import io
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER, TA_RIGHT


def format_id_date(d: date) -> str:
    months = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember",
    ]
    return f"{d.day} {months[d.month - 1]} {d.year}"


def gen_serial(letter_type: str, seq: int) -> str:
    code_map = {
        "keterangan_aktif": "SKA",
        "kelakuan_baik": "SKB",
        "panggilan_ortu": "SPO",
        "sehat_jasmani": "SKJ",
        "rekomendasi": "SRK",
    }
    code = code_map.get(letter_type, "SRT")
    today = date.today()
    return f"{seq:04d}/{code}/{today.strftime('%m/%Y')}"


def build_letter_pdf(
    *,
    org_name: str,
    org_address: Optional[str],
    org_logo_path: Optional[Path],
    letter_type: str,
    serial_number: str,
    issue_date: date,
    student_name: str,
    student_nis: str,
    student_class: Optional[str],
    student_birthplace: Optional[str] = None,
    student_birthdate: Optional[date] = None,
    body_paragraphs: list[str],
    purpose: Optional[str],
    issuer_name: str,
    issuer_position: str,
) -> bytes:
    """Render PDF, return bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=2.5 * cm,
        rightMargin=2.5 * cm,
        topMargin=2.0 * cm,
        bottomMargin=2.0 * cm,
        title=f"Surat {serial_number}",
    )

    styles = getSampleStyleSheet()
    style_h1 = ParagraphStyle(
        "h1", parent=styles["Heading1"], fontSize=14, alignment=TA_CENTER,
        spaceAfter=4, textColor=HexColor("#0a1520"),
    )
    style_addr = ParagraphStyle(
        "addr", parent=styles["Normal"], fontSize=9, alignment=TA_CENTER,
        textColor=HexColor("#5a6a7a"), spaceAfter=2,
    )
    style_title = ParagraphStyle(
        "title", parent=styles["Heading2"], fontSize=12, alignment=TA_CENTER,
        spaceBefore=18, spaceAfter=6, fontName="Helvetica-Bold",
    )
    style_body = ParagraphStyle(
        "body", parent=styles["Normal"], fontSize=11, leading=16,
        alignment=TA_JUSTIFY, spaceAfter=10,
    )
    style_meta = ParagraphStyle(
        "meta", parent=styles["Normal"], fontSize=10, leading=14,
    )
    style_sign = ParagraphStyle(
        "sign", parent=styles["Normal"], fontSize=11, leading=14,
        alignment=TA_RIGHT,
    )

    story: list = []

    # Header sekolah
    story.append(Paragraph(org_name.upper(), style_h1))
    if org_address:
        story.append(Paragraph(org_address, style_addr))
    # Garis pemisah double-line
    line = Table([[""]], colWidths=[doc.width])
    line.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 1.5, HexColor("#0a1520")),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, HexColor("#0a1520")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(line)

    # Nomor + tanggal
    story.append(Spacer(1, 0.5 * cm))
    title_map = {
        "keterangan_aktif": "SURAT KETERANGAN SISWA AKTIF",
        "kelakuan_baik": "SURAT KETERANGAN BERKELAKUAN BAIK",
        "panggilan_ortu": "SURAT PANGGILAN ORANG TUA / WALI",
        "sehat_jasmani": "SURAT KETERANGAN SEHAT JASMANI",
        "rekomendasi": "SURAT REKOMENDASI",
    }
    story.append(Paragraph(title_map.get(letter_type, "SURAT KETERANGAN"), style_title))
    story.append(Paragraph(f"Nomor: {serial_number}", style_meta))
    story.append(Spacer(1, 0.4 * cm))

    # Pembuka
    story.append(Paragraph(
        "Yang bertanda tangan di bawah ini, kepala sekolah dari "
        f"{org_name}, dengan ini menerangkan bahwa:",
        style_body,
    ))

    # Data siswa (table)
    info_rows = [
        ["Nama", ":", student_name],
        ["NIS", ":", student_nis],
    ]
    if student_class:
        info_rows.append(["Kelas", ":", student_class])
    if student_birthplace and student_birthdate:
        info_rows.append([
            "TTL", ":",
            f"{student_birthplace}, {format_id_date(student_birthdate)}",
        ])
    info_table = Table(info_rows, colWidths=[3.5 * cm, 0.5 * cm, doc.width - 4 * cm])
    info_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.4 * cm))

    # Body paragraf
    for p in body_paragraphs:
        story.append(Paragraph(p, style_body))

    # Tujuan
    if purpose:
        story.append(Paragraph(
            f"Surat ini dibuat untuk keperluan: <b>{purpose}</b>.", style_body
        ))

    # Penutup
    story.append(Paragraph(
        "Demikian surat keterangan ini dibuat dengan sebenarnya. "
        "Kepada pihak yang berkepentingan harap menggunakan sebagaimana mestinya.",
        style_body,
    ))

    # TTD kepsek
    story.append(Spacer(1, 1 * cm))
    issued_at_text = format_id_date(issue_date)
    sign_block = Table(
        [
            ["", f"{issued_at_text}"],
            ["", issuer_position],
            ["", ""],
            ["", ""],
            ["", f"<u>{issuer_name}</u>"],
        ],
        colWidths=[doc.width * 0.55, doc.width * 0.45],
    )
    sign_block.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("ALIGN", (1, 0), (1, -1), "LEFT"),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(sign_block)

    doc.build(story)
    return buf.getvalue()


def build_body_for(letter_type: str, ctx: dict) -> tuple[list[str], dict]:
    """Generate body & data extra berdasarkan tipe surat.

    `ctx` punya: gpa, attitude_points, appreciation_points, attendance_pct,
    last_incident_summary, dll.
    """
    if letter_type == "keterangan_aktif":
        return [
            f"Adalah benar siswa yang namanya tersebut di atas adalah peserta didik "
            f"yang masih aktif belajar di sekolah ini pada tahun ajaran "
            f"{ctx.get('school_year', '—')}."
        ], {}

    if letter_type == "kelakuan_baik":
        att = ctx.get("attitude_points", 100)
        gpa = ctx.get("gpa")
        gpa_text = f" dengan rata-rata akademik <b>{gpa:.2f}</b>" if gpa else ""
        return [
            f"Adalah benar siswa tersebut adalah peserta didik di sekolah ini "
            f"selama menjadi siswa berkelakuan <b>baik</b>, tidak pernah melakukan "
            f"pelanggaran berat, dan memiliki poin sikap <b>{att}/100</b>{gpa_text}."
        ], {"attitude_points": att, "gpa": gpa}

    if letter_type == "panggilan_ortu":
        last = ctx.get("last_incident_summary") or "perkembangan akademik dan sikap siswa"
        meeting = ctx.get("meeting_date") or "secepatnya"
        return [
            f"Sehubungan dengan {last}, dengan ini kami mengundang orang tua/wali "
            f"siswa tersebut untuk hadir di sekolah pada <b>{meeting}</b>."
        ], {}

    if letter_type == "sehat_jasmani":
        return [
            "Adalah benar siswa tersebut dalam kondisi sehat jasmani dan tidak "
            "berhalangan untuk mengikuti kegiatan akademik dan ekstrakurikuler."
        ], {}

    if letter_type == "rekomendasi":
        return [
            "Adalah benar siswa tersebut adalah peserta didik teladan di sekolah "
            "ini dengan prestasi akademik dan sikap yang baik. "
            "Kami merekomendasikan yang bersangkutan untuk diterima di institusi yang dituju."
        ], {}

    return ["Surat keterangan."], {}
