"""AI Insight service — call OpenRouter (gratis Nemotron) untuk analisis sekolah.

Pattern:
- Build prompt dari KPI sekolah / kelas / siswa (data sudah agregat).
- Call `https://openrouter.ai/api/v1/chat/completions` dengan model free.
- Parse JSON output → simpan di table `ai_insights` dengan TTL 6 jam.
- Endpoint hanya hit cache, kalau expired refresh background.

Defensive:
- Kalau `OPENROUTER_API_KEY` kosong → fallback ke rule-based summary
  (tanpa AI, tetap dapat insight dasar).
- Kalau OpenRouter error/timeout → tetap kasih cache lama / fallback.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta
from typing import Any, Optional

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import (
    AiInsight,
    AssignmentGrade,
    Assignment,
    AttendanceRecord,
    DisciplineIncident,
    DisciplineProfile,
    Organization,
    SchoolClass,
    User,
)


logger = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
CACHE_TTL_HOURS = 6


# ─── Cache helpers ──────────────────────────────────────────────────────────


async def _get_cached(
    db: AsyncSession,
    org_id: int,
    scope: str,
    scope_id: Optional[int],
    insight_type: str,
) -> Optional[AiInsight]:
    stmt = select(AiInsight).where(
        AiInsight.org_id == org_id,
        AiInsight.scope == scope,
        AiInsight.insight_type == insight_type,
    )
    if scope_id is None:
        stmt = stmt.where(AiInsight.scope_id.is_(None))
    else:
        stmt = stmt.where(AiInsight.scope_id == scope_id)
    row = (await db.execute(stmt.order_by(AiInsight.generated_at.desc()).limit(1))).scalar_one_or_none()
    if not row:
        return None
    if row.expires_at and row.expires_at < datetime.now():
        return None
    return row


async def _save(
    db: AsyncSession,
    org_id: int,
    scope: str,
    scope_id: Optional[int],
    insight_type: str,
    summary: str,
    items: list[str],
    severity: str = "info",
) -> AiInsight:
    insight = AiInsight(
        org_id=org_id,
        scope=scope,
        scope_id=scope_id,
        insight_type=insight_type,
        summary=summary,
        items_json=items,
        severity=severity,
        expires_at=datetime.now() + timedelta(hours=CACHE_TTL_HOURS),
    )
    db.add(insight)
    await db.commit()
    await db.refresh(insight)
    return insight


# ─── OpenRouter API call ────────────────────────────────────────────────────


async def _call_openrouter(prompt: str, system: Optional[str] = None) -> Optional[str]:
    """Call OpenRouter chat completion. Returns raw text or None on failure."""
    if not settings.OPENROUTER_API_KEY:
        logger.info("OPENROUTER_API_KEY not set — fallback to rule-based")
        return None

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.OPENROUTER_REFERER,
        "X-Title": settings.OPENROUTER_APP_NAME,
    }
    payload = {
        "model": settings.OPENROUTER_MODEL,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 2000,
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(OPENROUTER_URL, json=payload, headers=headers)
            if resp.status_code != 200:
                logger.warning("OpenRouter %s: %s", resp.status_code, resp.text[:300])
                return None
            data = resp.json()
            content = data["choices"][0]["message"].get("content")
            if not content:
                logger.warning("OpenRouter empty content. Reasoning-only? %s", data["choices"][0]["message"].get("reasoning", "")[:200])
                return None
            return content
    except Exception as exc:
        logger.warning("OpenRouter call failed: %s", exc)
        return None


def _parse_ai_response(raw: str) -> tuple[str, list[str], str]:
    """Parse raw LLM output. Format harapan: JSON {summary, items, severity}.
    Fallback: split by newline jika bukan JSON valid.
    """
    if not raw:
        return "Tidak ada data", [], "info"

    # Coba ekstrak JSON dari blok code
    text = raw.strip()
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in text:
        text = text.split("```", 1)[1].split("```", 1)[0].strip()

    try:
        obj = json.loads(text)
        summary = str(obj.get("summary", ""))[:500]
        items_raw = obj.get("items", [])
        items = [str(x)[:300] for x in items_raw if x][:8]
        severity = obj.get("severity", "info")
        if severity not in ("info", "warning", "critical"):
            severity = "info"
        return summary, items, severity
    except (json.JSONDecodeError, ValueError, AttributeError):
        # Fallback: ambil baris pertama sebagai summary, rest sebagai bullet
        lines = [ln.strip("-• \t") for ln in raw.strip().split("\n") if ln.strip()]
        if not lines:
            return "Belum cukup data", [], "info"
        summary = lines[0][:500]
        items = lines[1:9]
        return summary, items, "info"


# ─── Data gathering ─────────────────────────────────────────────────────────


async def _gather_school_kpi(db: AsyncSession, org_id: int) -> dict:
    """KPI sekolah-level untuk feed AI."""
    today = date.today()
    week_start = today - timedelta(days=7)

    total_students = (
        await db.execute(
            select(func.count(User.id)).where(
                User.org_id == org_id, User.role == "employee", User.status == "active"
            )
        )
    ).scalar_one()

    # Attendance minggu ini
    att_rows = (
        await db.execute(
            select(AttendanceRecord.status, func.count(AttendanceRecord.id))
            .join(User, User.id == AttendanceRecord.user_id)
            .where(
                User.org_id == org_id,
                User.role == "employee",
                AttendanceRecord.attendance_date >= week_start,
            )
            .group_by(AttendanceRecord.status)
        )
    ).all()
    att_dict = {r[0]: r[1] for r in att_rows}
    total_att = sum(att_dict.values()) or 1
    present_pct = (att_dict.get("present", 0) + att_dict.get("late", 0)) / total_att * 100

    # KTS minggu ini
    kts_count = (
        await db.execute(
            select(func.count(DisciplineIncident.id))
            .join(User, User.id == DisciplineIncident.user_id)
            .where(
                User.org_id == org_id,
                DisciplineIncident.kind == "penalty",
                DisciplineIncident.incident_date >= week_start,
            )
        )
    ).scalar_one()

    apresiasi_count = (
        await db.execute(
            select(func.count(DisciplineIncident.id))
            .join(User, User.id == DisciplineIncident.user_id)
            .where(
                User.org_id == org_id,
                DisciplineIncident.kind == "adjustment",
                DisciplineIncident.appreciation_delta > 0,
                DisciplineIncident.incident_date >= week_start,
            )
        )
    ).scalar_one()

    # GPA rata-rata
    avg_gpa = (
        await db.execute(
            select(func.avg(DisciplineProfile.gpa))
            .join(User, User.id == DisciplineProfile.user_id)
            .where(User.org_id == org_id, User.role == "employee")
        )
    ).scalar_one() or 0

    # Watchlist (poin sikap < 70)
    watchlist = (
        await db.execute(
            select(func.count(DisciplineProfile.id))
            .join(User, User.id == DisciplineProfile.user_id)
            .where(
                User.org_id == org_id,
                User.role == "employee",
                DisciplineProfile.attitude_points < 70,
            )
        )
    ).scalar_one()

    return {
        "total_students": total_students,
        "attendance_pct_week": round(present_pct, 1),
        "absent_count": att_dict.get("absent", 0),
        "late_count": att_dict.get("late", 0),
        "kts_week": kts_count,
        "apresiasi_week": apresiasi_count,
        "avg_gpa": round(float(avg_gpa), 1),
        "watchlist_size": watchlist,
    }


async def _gather_class_kpi(db: AsyncSession, class_id: int) -> dict:
    cls = await db.get(SchoolClass, class_id)
    if not cls:
        return {}

    today = date.today()
    week_start = today - timedelta(days=7)

    total_students = (
        await db.execute(
            select(func.count(User.id)).where(
                User.school_class_id == class_id,
                User.role == "employee",
                User.status == "active",
            )
        )
    ).scalar_one()

    # GPA rata-rata
    avg_gpa = (
        await db.execute(
            select(func.avg(DisciplineProfile.gpa))
            .join(User, User.id == DisciplineProfile.user_id)
            .where(User.school_class_id == class_id)
        )
    ).scalar_one() or 0

    # KTS
    kts = (
        await db.execute(
            select(func.count(DisciplineIncident.id))
            .join(User, User.id == DisciplineIncident.user_id)
            .where(
                User.school_class_id == class_id,
                DisciplineIncident.kind == "penalty",
                DisciplineIncident.incident_date >= week_start,
            )
        )
    ).scalar_one()

    # Absent
    absent = (
        await db.execute(
            select(func.count(AttendanceRecord.id))
            .join(User, User.id == AttendanceRecord.user_id)
            .where(
                User.school_class_id == class_id,
                AttendanceRecord.status == "absent",
                AttendanceRecord.attendance_date >= week_start,
            )
        )
    ).scalar_one()

    return {
        "class_name": cls.name,
        "total_students": total_students,
        "avg_gpa": round(float(avg_gpa), 1),
        "kts_week": kts,
        "absent_week": absent,
    }


async def _gather_student_kpi(db: AsyncSession, student_id: int) -> dict:
    student = await db.get(User, student_id)
    if not student:
        return {}

    today = date.today()
    month_start = today.replace(day=1)

    profile = (
        await db.execute(
            select(DisciplineProfile).where(DisciplineProfile.user_id == student_id)
        )
    ).scalar_one_or_none()

    # Att month
    att_rows = (
        await db.execute(
            select(AttendanceRecord.status, func.count(AttendanceRecord.id))
            .where(
                AttendanceRecord.user_id == student_id,
                AttendanceRecord.attendance_date >= month_start,
            )
            .group_by(AttendanceRecord.status)
        )
    ).all()
    att = {r[0]: r[1] for r in att_rows}

    # KTS bulan ini
    kts = (
        await db.execute(
            select(func.count(DisciplineIncident.id)).where(
                DisciplineIncident.user_id == student_id,
                DisciplineIncident.kind == "penalty",
                DisciplineIncident.incident_date >= month_start,
            )
        )
    ).scalar_one()

    # Avg score 3 tugas terakhir
    last_grades = (
        await db.execute(
            select(AssignmentGrade.score, Assignment.max_score)
            .join(Assignment, Assignment.id == AssignmentGrade.assignment_id)
            .where(AssignmentGrade.student_id == student_id)
            .order_by(AssignmentGrade.graded_at.desc())
            .limit(5)
        )
    ).all()
    if last_grades:
        avg_pct = sum((g[0] / g[1] * 100) if g[1] else 0 for g in last_grades) / len(last_grades)
    else:
        avg_pct = 0

    return {
        "name": student.full_name,
        "gpa": profile.gpa if profile else 0,
        "attitude_points": profile.attitude_points if profile else 100,
        "appreciation_points": profile.appreciation_points if profile else 0,
        "absent_month": att.get("absent", 0),
        "late_month": att.get("late", 0),
        "present_month": att.get("present", 0),
        "kts_month": kts,
        "recent_avg_score": round(avg_pct, 1),
        "graded_count": len(last_grades),
    }


# ─── Insight builders ───────────────────────────────────────────────────────


SCHOOL_PROMPT = """Anda adalah asisten kepala sekolah yang ahli analisis data pendidikan.
Berdasarkan KPI berikut, berikan ringkasan eksekutif singkat (1 paragraf, max 4 kalimat) dan 3-5 insight tajam dalam Bahasa Indonesia santai-profesional.

Severity: 'info' (positif/normal), 'warning' (perlu perhatian), 'critical' (urgent).

KPI:
{kpi_json}

Format jawaban (HARUS JSON valid, tidak boleh ada teks lain):
{{
  "summary": "<paragraf ringkasan>",
  "items": ["<insight 1>", "<insight 2>", ...],
  "severity": "info|warning|critical"
}}"""


CLASS_PROMPT = """Anda asisten wali kelas. Berdasarkan KPI kelas berikut, beri analisis singkat untuk wali kelas.

KPI kelas:
{kpi_json}

Format JSON:
{{"summary": "<paragraf>", "items": ["<insight>", ...], "severity": "info|warning|critical"}}"""


STUDENT_PROMPT = """Anda guru BK yang bijak. Analisis data siswa berikut. Fokus risiko & rekomendasi intervensi singkat.

Data siswa:
{kpi_json}

Format JSON:
{{"summary": "<analisis 2-3 kalimat>", "items": ["<rekomendasi>", ...], "severity": "info|warning|critical"}}"""


def _fallback_school(kpi: dict) -> tuple[str, list[str], str]:
    """Rule-based summary kalau OpenRouter mati."""
    parts = []
    items = []
    severity = "info"

    att = kpi.get("attendance_pct_week", 0)
    if att >= 95:
        parts.append(f"Kehadiran sekolah minggu ini sangat baik ({att}%).")
    elif att >= 85:
        parts.append(f"Kehadiran sekolah {att}% — masih wajar tapi bisa ditingkatkan.")
    else:
        parts.append(f"Kehadiran sekolah hanya {att}% — perlu perhatian khusus.")
        severity = "warning"
        items.append(f"Tingkat kehadiran rendah, {kpi.get('absent_count', 0)} siswa absen pekan ini")

    kts = kpi.get("kts_week", 0)
    if kts > 10:
        items.append(f"{kts} kasus KTS pekan ini — di atas rata-rata, evaluasi pola insiden")
        severity = "warning"
    elif kts > 0:
        items.append(f"{kts} kasus KTS pekan ini, masih dalam batas wajar")

    apresiasi = kpi.get("apresiasi_week", 0)
    if apresiasi > 0:
        items.append(f"{apresiasi} apresiasi diberikan pekan ini — pertahankan momentum positif")

    watchlist = kpi.get("watchlist_size", 0)
    if watchlist > 5:
        items.append(f"{watchlist} siswa masuk watch list (poin sikap <70) — koordinasi BK & wali kelas")
        severity = "critical" if watchlist > 15 else "warning"

    avg_gpa = kpi.get("avg_gpa", 0)
    if avg_gpa >= 80:
        items.append(f"Rerata GPA sekolah {avg_gpa} — performa akademik solid")
    elif avg_gpa < 70:
        items.append(f"Rerata GPA {avg_gpa} — pertimbangkan intervensi remedial")
        severity = "warning"

    if not items:
        items = ["Data sudah masuk normal tanpa anomali signifikan"]

    return " ".join(parts) or "Ringkasan KPI tersedia.", items, severity


def _fallback_class(kpi: dict) -> tuple[str, list[str], str]:
    items = []
    severity = "info"
    if kpi.get("kts_week", 0) > 3:
        items.append(f"{kpi['kts_week']} KTS minggu ini di kelas {kpi.get('class_name')}")
        severity = "warning"
    if kpi.get("absent_week", 0) > 5:
        items.append(f"{kpi['absent_week']} hari absen pekan ini")
    avg = kpi.get("avg_gpa", 0)
    if avg < 70:
        items.append(f"GPA rerata kelas {avg} — perlu remedial")
        severity = "warning"
    elif avg >= 85:
        items.append(f"GPA rerata kelas {avg} — sangat baik")
    if not items:
        items.append("Kondisi kelas dalam batas normal")
    summary = f"Kelas {kpi.get('class_name', '?')} dengan {kpi.get('total_students', 0)} siswa, GPA rerata {avg}"
    return summary, items, severity


def _fallback_student(kpi: dict) -> tuple[str, list[str], str]:
    items = []
    severity = "info"
    if kpi.get("attitude_points", 100) < 70:
        items.append("Poin sikap di bawah ambang — pertimbangkan konseling")
        severity = "warning"
    if kpi.get("kts_month", 0) > 2:
        items.append(f"{kpi['kts_month']} KTS bulan ini — eskalasi ke wali kelas")
        severity = "warning"
    if kpi.get("absent_month", 0) > 3:
        items.append(f"{kpi['absent_month']} hari absen — cek alasan dengan ortu")
    if kpi.get("recent_avg_score", 0) < 60 and kpi.get("graded_count", 0) > 0:
        items.append(f"Rerata nilai {kpi['recent_avg_score']} — risiko akademik")
        severity = "warning"
    if kpi.get("appreciation_points", 0) > 50:
        items.append("Poin apresiasi tinggi — tunjukkan engagement positif")
    if not items:
        items.append("Status siswa dalam batas normal")
    return f"Analisis {kpi.get('name', 'siswa')} — GPA {kpi.get('gpa', 0)}, sikap {kpi.get('attitude_points', 100)}", items, severity


# ─── Public API ─────────────────────────────────────────────────────────────


async def get_school_insight(
    db: AsyncSession, org_id: int, force_refresh: bool = False
) -> AiInsight:
    if not force_refresh:
        cached = await _get_cached(db, org_id, "school", None, "kpi_summary")
        if cached:
            return cached

    kpi = await _gather_school_kpi(db, org_id)
    raw = await _call_openrouter(
        SCHOOL_PROMPT.format(kpi_json=json.dumps(kpi, indent=2, ensure_ascii=False))
    )
    if raw:
        summary, items, severity = _parse_ai_response(raw)
    else:
        summary, items, severity = _fallback_school(kpi)

    return await _save(db, org_id, "school", None, "kpi_summary", summary, items, severity)


async def get_class_insight(
    db: AsyncSession, org_id: int, class_id: int, force_refresh: bool = False
) -> AiInsight:
    if not force_refresh:
        cached = await _get_cached(db, org_id, "class", class_id, "kpi_summary")
        if cached:
            return cached

    kpi = await _gather_class_kpi(db, class_id)
    raw = await _call_openrouter(
        CLASS_PROMPT.format(kpi_json=json.dumps(kpi, indent=2, ensure_ascii=False))
    )
    if raw:
        summary, items, severity = _parse_ai_response(raw)
    else:
        summary, items, severity = _fallback_class(kpi)

    return await _save(db, org_id, "class", class_id, "kpi_summary", summary, items, severity)


async def get_student_insight(
    db: AsyncSession, org_id: int, student_id: int, force_refresh: bool = False
) -> AiInsight:
    if not force_refresh:
        cached = await _get_cached(db, org_id, "student", student_id, "risk_summary")
        if cached:
            return cached

    kpi = await _gather_student_kpi(db, student_id)
    raw = await _call_openrouter(
        STUDENT_PROMPT.format(kpi_json=json.dumps(kpi, indent=2, ensure_ascii=False))
    )
    if raw:
        summary, items, severity = _parse_ai_response(raw)
    else:
        summary, items, severity = _fallback_student(kpi)

    return await _save(db, org_id, "student", student_id, "risk_summary", summary, items, severity)
