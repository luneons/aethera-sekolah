"""Discipline & gamification endpoints (SIMMICO module).

Endpoint utama:
- GET  /v1/discipline/violations               katalog jenis pelanggaran
- GET  /v1/discipline/appreciations            katalog jenis apresiasi
- GET  /v1/discipline/students                 daftar siswa + ringkasan profil
- GET  /v1/discipline/students/{id}            detail status siswa
- GET  /v1/discipline/students/{id}/incidents  ledger insiden
- POST /v1/discipline/incidents/penalty        lapor KTS (auto-apply hukuman)
- POST /v1/discipline/incidents/adjustment     apresiasi / pelunasan jam
- GET  /v1/discipline/leaderboard              papan peringkat (3 kategori)
- GET  /v1/discipline/me                       profil status siswa sendiri
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import (
    AppreciationType,
    DisciplineIncident,
    DisciplineProfile,
    MoodCheckIn,
    SchoolClass,
    User,
    ViolationType,
)
from app.schemas import (
    AppreciationTypeOut,
    ClassLeaderboardEntry,
    DailyRecapOut,
    Envelope,
    IncidentCreateAdjustment,
    IncidentCreatePenalty,
    IncidentOut,
    LeaderboardEntryOut,
    LevelInfo,
    MoodAggregateOut,
    MoodCheckInRequest,
    QuestOut,
    StudentDisciplineSummary,
    TrendPointSimple,
    ViolationTypeOut,
    XpStatus,
)
from app.security import get_current_user, homeroom_scope_filter, require_roles
from app.services.discipline_service import (
    aggregate_classes,
    apply_incident,
    build_trend,
    fetch_students_with_profile,
    get_or_create_profile,
    parse_badges,
    sort_leaderboard,
)
from app.services.gamification_service import (
    LEVELS,
    build_daily_recap,
    build_weekly_quests,
    compute_xp,
    level_for_xp,
    refresh_xp_cache,
)


router = APIRouter(prefix="/discipline", tags=["Discipline"])


# ─── Catalog ─────────────────────────────────────────────────────────────────


@router.get("/violations", response_model=Envelope[list[ViolationTypeOut]])
async def list_violations(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (
        await db.execute(
            select(ViolationType)
            .where(ViolationType.org_id == current.org_id, ViolationType.is_active == True)  # noqa: E712
            .order_by(ViolationType.code)
        )
    ).scalars().all()
    return Envelope(data=[ViolationTypeOut.model_validate(r) for r in rows])


@router.get("/appreciations", response_model=Envelope[list[AppreciationTypeOut]])
async def list_appreciations(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (
        await db.execute(
            select(AppreciationType)
            .where(AppreciationType.org_id == current.org_id, AppreciationType.is_active == True)  # noqa: E712
            .order_by(AppreciationType.code)
        )
    ).scalars().all()
    return Envelope(data=[AppreciationTypeOut.model_validate(r) for r in rows])


# ─── Students ────────────────────────────────────────────────────────────────


def _summary_from(
    user: User,
    profile: DisciplineProfile,
    *,
    with_trend: list | None = None,
    with_xp: bool = False,
) -> StudentDisciplineSummary:
    payload = StudentDisciplineSummary(
        user_id=user.id,
        full_name=user.full_name,
        employee_id=user.employee_id,
        class_name=user.school_class.name if user.school_class else None,
        grade=user.school_class.grade if user.school_class else None,
        major=user.school_class.major if user.school_class else None,
        photo_url=user.photo_url,
        gpa=round(profile.gpa, 2),
        attitude_points=profile.attitude_points,
        appreciation_points=profile.appreciation_points,
        kersos_hours_owed=profile.kersos_hours_owed,
        lembur_hours_owed=profile.lembur_hours_owed,
        avg_arrival_offset_min=round(profile.avg_arrival_offset_min, 2),
        streak_days=profile.streak_days,
        badges=parse_badges(profile),
        trend=[TrendPointSimple(**p) for p in (with_trend or [])],
    )
    if with_xp:
        xp = profile.xp_total or 0
        current, nxt, progress = level_for_xp(xp)
        payload.xp_total = xp
        payload.level_code = current.code
        payload.level_title = current.title
        payload.level_color = current.color
        if nxt:
            payload.next_level_code = nxt.code
            payload.next_level_title = nxt.title
            payload.xp_to_next = max(0, nxt.min_xp - xp)
        payload.progress_percent = round(progress * 100, 1)
    return payload


@router.get("/students", response_model=Envelope[list[StudentDisciplineSummary]])
async def list_students(
    current: Annotated[User, Depends(require_roles("admin", "hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    class_name: Optional[str] = Query(None, description="Filter kelas, e.g. '11 IPA 1'"),
    q: Optional[str] = Query(None, description="Search nama/NIS"),
    show_all: bool = Query(False, description="Wali kelas: true untuk lihat seluruh sekolah"),
):
    # Auto-scope: wali kelas default lihat siswa kelasnya saja
    scope_active, scope_class_id = homeroom_scope_filter(current)
    effective_class_filter = class_name
    if scope_active and not show_all and not class_name:
        # Convert ID ke nama untuk dipakai fetch helper
        from app.models import SchoolClass as _SchoolClass
        kelas = await db.get(_SchoolClass, scope_class_id)
        if kelas:
            effective_class_filter = kelas.name

    pool = await fetch_students_with_profile(
        db, org_id=current.org_id, class_filter=effective_class_filter
    )
    if q:
        ql = q.lower()
        pool = [
            (u, p)
            for u, p in pool
            if ql in u.full_name.lower() or ql in u.employee_id.lower()
        ]
    return Envelope(data=[_summary_from(u, p) for u, p in pool])


@router.get("/students/{student_id}", response_model=Envelope[StudentDisciplineSummary])
async def get_student_status(
    student_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # Siswa boleh lihat dirinya sendiri; admin/hr boleh lihat siapa saja di org-nya
    if current.role == "employee" and current.id != student_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tidak boleh lihat data siswa lain")

    user = (
        await db.execute(
            select(User)
            .where(User.id == student_id, User.org_id == current.org_id)
            .options(selectinload(User.school_class))
        )
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Siswa tidak ditemukan")

    profile = await get_or_create_profile(db, user.id)
    await refresh_xp_cache(db, user.id)
    await db.refresh(profile)
    trend = await build_trend(db, user.id, weeks=6)
    await db.commit()
    return Envelope(data=_summary_from(user, profile, with_trend=trend, with_xp=True))


@router.get("/me", response_model=Envelope[StudentDisciplineSummary])
async def my_discipline_status(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Endpoint khusus siswa untuk lihat status disiplinnya sendiri."""
    user = (
        await db.execute(
            select(User).where(User.id == current.id).options(selectinload(User.school_class))
        )
    ).scalar_one()
    profile = await get_or_create_profile(db, user.id)
    await refresh_xp_cache(db, user.id)
    await db.refresh(profile)
    trend = await build_trend(db, user.id, weeks=6)
    await db.commit()
    return Envelope(data=_summary_from(user, profile, with_trend=trend, with_xp=True))


@router.get(
    "/students/{student_id}/incidents",
    response_model=Envelope[list[IncidentOut]],
)
async def list_incidents(
    student_id: int,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if current.role == "employee" and current.id != student_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tidak boleh lihat data siswa lain")

    rows = (
        await db.execute(
            select(DisciplineIncident, User.full_name)
            .join(User, User.id == DisciplineIncident.reporter_id, isouter=True)
            .where(DisciplineIncident.user_id == student_id)
            .order_by(DisciplineIncident.incident_date.desc(), DisciplineIncident.id.desc())
        )
    ).all()

    out = [
        IncidentOut(
            id=inc.id,
            student_id=inc.user_id,
            kind=inc.kind,
            date=datetime.combine(inc.incident_date, datetime.min.time()),
            reporter=reporter_name or "—",
            ref_code=inc.ref_code,
            ref_name=inc.ref_name,
            attitude_delta=inc.attitude_delta,
            kersos_delta=inc.kersos_delta,
            lembur_delta=inc.lembur_delta,
            appreciation_delta=inc.appreciation_delta,
            notes=inc.notes,
        )
        for inc, reporter_name in rows
    ]
    return Envelope(data=out)


# ─── Lapor KTS (Penalty) ─────────────────────────────────────────────────────


@router.post("/incidents/penalty", response_model=Envelope[IncidentOut], status_code=201)
async def report_penalty(
    payload: IncidentCreatePenalty,
    current: Annotated[User, Depends(require_roles("admin", "hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Lapor pelanggaran (KTS).

    Untuk severity 'berat': masuk antrian persetujuan kepsek dulu (pending_approvals),
    insiden tidak langsung apply. Kalau ringan/sedang: langsung apply.
    Pengecualian: kepsek (super_admin) sendiri yang melapor → langsung apply.
    """
    student = await db.get(User, payload.student_id)
    if not student or student.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Siswa tidak ditemukan")
    if student.role != "employee":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Target bukan siswa")

    violation = (
        await db.execute(
            select(ViolationType).where(
                ViolationType.org_id == current.org_id,
                ViolationType.code == payload.violation_code,
                ViolationType.is_active == True,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not violation:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jenis pelanggaran tidak ditemukan")

    # Workflow: severity berat butuh approval, kecuali pelapornya kepsek sendiri
    needs_approval = violation.severity == "berat" and current.role != "super_admin"

    if needs_approval:
        from app.models import PendingApproval

        ap = PendingApproval(
            org_id=current.org_id,
            student_id=student.id,
            requester_id=current.id,
            violation_code=violation.code,
            violation_name=violation.name,
            severity=violation.severity,
            attitude_penalty=violation.attitude_penalty,
            kersos_hours=violation.kersos_hours,
            lembur_hours=violation.lembur_hours,
            incident_date=payload.incident_date or date.today(),
            notes=payload.notes,
        )
        db.add(ap)
        await db.commit()
        await db.refresh(ap)
        # Notif kepsek: ada KTS berat untuk approval
        try:
            from app.services.notification_service import notify_role
            await notify_role(
                db, current.org_id, "super_admin",
                title="Persetujuan KTS berat menunggu",
                body=f"{current.full_name} melaporkan {violation.name} untuk {student.full_name}",
                category="approval_pending",
                url="/approvals",
            )
        except Exception:
            pass
        return Envelope(
            data=IncidentOut(
                id=ap.id,
                student_id=ap.student_id,
                kind="penalty",
                date=datetime.combine(ap.incident_date, datetime.min.time()),
                reporter=current.full_name,
                ref_code=ap.violation_code,
                ref_name=ap.violation_name,
                attitude_delta=-abs(ap.attitude_penalty),
                kersos_delta=ap.kersos_hours,
                lembur_delta=ap.lembur_hours,
                appreciation_delta=0,
                notes=ap.notes,
            ),
            message=(
                f"KTS {violation.code} kategori BERAT — masuk antrian persetujuan kepala sekolah."
            ),
        )

    inc = DisciplineIncident(
        org_id=current.org_id,
        user_id=student.id,
        reporter_id=current.id,
        kind="penalty",
        incident_date=payload.incident_date or date.today(),
        ref_code=violation.code,
        ref_name=violation.name,
        attitude_delta=-abs(violation.attitude_penalty),
        kersos_delta=violation.kersos_hours,
        lembur_delta=violation.lembur_hours,
        appreciation_delta=0,
        notes=payload.notes,
    )
    await apply_incident(db, inc)
    await db.commit()
    # Notif siswa: poin sikap turun
    try:
        from app.services.notification_service import notify_user
        await notify_user(
            db, student.id,
            title="Pelanggaran tercatat",
            body=(
                f"{violation.name} (-{abs(violation.attitude_penalty)} poin sikap"
                + (f", +{violation.kersos_hours} jam kersos" if violation.kersos_hours else "")
                + (f", +{violation.lembur_hours} jam lembur" if violation.lembur_hours else "")
                + ")"
            ),
            category="discipline_penalty",
            url="/my-status",
        )
    except Exception:
        pass
    return Envelope(
        data=IncidentOut(
            id=inc.id,
            student_id=inc.user_id,
            kind=inc.kind,
            date=datetime.combine(inc.incident_date, datetime.min.time()),
            reporter=current.full_name,
            ref_code=inc.ref_code,
            ref_name=inc.ref_name,
            attitude_delta=inc.attitude_delta,
            kersos_delta=inc.kersos_delta,
            lembur_delta=inc.lembur_delta,
            appreciation_delta=inc.appreciation_delta,
            notes=inc.notes,
        ),
        message=f"KTS {violation.code} tercatat untuk {student.full_name}",
    )


@router.post("/incidents/adjustment", response_model=Envelope[IncidentOut], status_code=201)
async def report_adjustment(
    payload: IncidentCreateAdjustment,
    current: Annotated[User, Depends(require_roles("admin", "hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Tambah apresiasi atau pelunasan jam kersos/lembur."""
    student = await db.get(User, payload.student_id)
    if not student or student.org_id != current.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Siswa tidak ditemukan")

    apr = (
        await db.execute(
            select(AppreciationType).where(
                AppreciationType.org_id == current.org_id,
                AppreciationType.code == payload.appreciation_code,
                AppreciationType.is_active == True,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not apr:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jenis apresiasi tidak ditemukan")

    kersos_delta = 0
    lembur_delta = 0
    if apr.is_payoff_kersos:
        hours = max(1, payload.payoff_hours or 1)
        kersos_delta = -hours
    if apr.is_payoff_lembur:
        hours = max(1, payload.payoff_hours or 1)
        lembur_delta = -hours

    appreciation_delta = apr.appreciation_points + (payload.extra_points or 0)

    inc = DisciplineIncident(
        org_id=current.org_id,
        user_id=student.id,
        reporter_id=current.id,
        kind="adjustment",
        incident_date=payload.incident_date or date.today(),
        ref_code=apr.code,
        ref_name=apr.name,
        attitude_delta=0,
        kersos_delta=kersos_delta,
        lembur_delta=lembur_delta,
        appreciation_delta=appreciation_delta,
        notes=payload.notes,
    )
    await apply_incident(db, inc)
    await db.commit()
    try:
        from app.services.notification_service import notify_user
        if appreciation_delta > 0:
            body = f"{apr.name} (+{appreciation_delta} poin apresiasi)"
        else:
            paid = abs(kersos_delta + lembur_delta)
            body = f"{apr.name} (pelunasan {paid} jam)"
        await notify_user(
            db, student.id,
            title="Apresiasi diterima!",
            body=body,
            category="discipline_appreciation",
            url="/my-status",
        )
    except Exception:
        pass
    return Envelope(
        data=IncidentOut(
            id=inc.id,
            student_id=inc.user_id,
            kind=inc.kind,
            date=datetime.combine(inc.incident_date, datetime.min.time()),
            reporter=current.full_name,
            ref_code=inc.ref_code,
            ref_name=inc.ref_name,
            attitude_delta=inc.attitude_delta,
            kersos_delta=inc.kersos_delta,
            lembur_delta=inc.lembur_delta,
            appreciation_delta=inc.appreciation_delta,
            notes=inc.notes,
        ),
        message=f"Apresiasi {apr.code} tercatat",
    )


# ─── Leaderboard ─────────────────────────────────────────────────────────────


@router.get("/leaderboard", response_model=Envelope[list[LeaderboardEntryOut]])
async def leaderboard(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    category: str = Query("gpa", pattern="^(gpa|punctuality|appreciation)$"),
    class_name: Optional[str] = Query(None),
    limit: int = Query(10, ge=3, le=50),
):
    pool = await fetch_students_with_profile(
        db, org_id=current.org_id, class_filter=class_name
    )
    entries = sort_leaderboard(pool, category, limit=limit)
    return Envelope(data=[LeaderboardEntryOut(**e) for e in entries])


@router.get("/classes", response_model=Envelope[list[str]])
async def list_class_names(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Daftar nama kelas (untuk filter)."""
    rows = (
        await db.execute(
            select(SchoolClass.name)
            .where(SchoolClass.org_id == current.org_id)
            .order_by(SchoolClass.grade, SchoolClass.name)
        )
    ).scalars().all()
    return Envelope(data=list(rows))


@router.get("/leaderboard/classes", response_model=Envelope[list[ClassLeaderboardEntry]])
async def class_leaderboard(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Peringkat kelas berdasarkan agregasi performa siswa-siswanya.

    Skor komposit:
        30% rata-rata GPA
        30% rata-rata poin sikap
        20% apresiasi (rata-rata, dinormalisasi 0..100)
        20% ketepatan waktu (rata-rata kedatangan, dinormalisasi)

    Kelas dengan siswa-siswa yang konsisten unggul akan menempati
    posisi atas — mendorong kompetisi sehat antar wali kelas.
    """
    pool = await fetch_students_with_profile(db, org_id=current.org_id)
    rows = aggregate_classes(pool)
    return Envelope(data=[ClassLeaderboardEntry(**r) for r in rows])



# ─── Gamification ────────────────────────────────────────────────────────────


@router.get("/me/quests", response_model=Envelope[list[QuestOut]])
async def my_weekly_quests(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """4 quest mingguan untuk siswa yang sedang login."""
    quests = await build_weekly_quests(db, current.id)
    return Envelope(
        data=[
            QuestOut(
                code=q.code,
                title=q.title,
                description=q.description,
                icon=q.icon,
                progress=q.progress,
                target=q.target,
                reward_xp=q.reward_xp,
                completed=q.completed,
                percent=round(q.percent * 100, 1),
            )
            for q in quests
        ]
    )


@router.get("/me/recap", response_model=Envelope[DailyRecapOut])
async def my_daily_recap(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Mini-Wrapped harian untuk siswa yang sedang login."""
    user = (
        await db.execute(
            select(User).where(User.id == current.id).options(selectinload(User.school_class))
        )
    ).scalar_one()
    recap = await build_daily_recap(db, user)
    return Envelope(
        data=DailyRecapOut(
            today_status=recap.today_status,
            arrival_offset_min=recap.arrival_offset_min,
            class_rank_today=recap.class_rank_today,
            class_size_today=recap.class_size_today,
            streak_days=recap.streak_days,
            days_to_next_badge=recap.days_to_next_badge,
            next_badge_code=recap.next_badge_code,
            headline=recap.headline,
        )
    )


@router.get("/voice-greeting/{user_id}", response_model=Envelope[dict])
async def voice_greeting_text(
    user_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Generate teks sapaan TTS untuk siswa setelah scan wajah berhasil.

    PUBLIC (tidak butuh auth) — dipanggil dari kiosk page yang juga public.
    Hanya kembalikan teks; pengucapannya dilakukan di browser via Web Speech API.
    """
    user = (
        await db.execute(
            select(User).where(User.id == user_id).options(selectinload(User.school_class))
        )
    ).scalar_one_or_none()
    if not user:
        return Envelope(data={"text": "Selamat datang"})

    recap = await build_daily_recap(db, user)
    return Envelope(data={
        "text": recap.headline,
        "name": user.full_name.split()[0],
        "streak_days": recap.streak_days,
        "arrival_offset_min": recap.arrival_offset_min,
        "class_rank_today": recap.class_rank_today,
    })


# ─── Mood Check-in ──────────────────────────────────────────────────────────


@router.post("/me/mood", response_model=Envelope[dict], status_code=201)
async def post_my_mood(
    payload: MoodCheckInRequest,
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Mood check-in 1-tap dari siswa. Idempotent per hari."""
    today = date.today()
    existing = (
        await db.execute(
            select(MoodCheckIn).where(
                MoodCheckIn.user_id == current.id,
                MoodCheckIn.checkin_date == today,
            )
        )
    ).scalar_one_or_none()
    if existing:
        existing.mood = payload.mood
        existing.note = payload.note
    else:
        db.add(MoodCheckIn(
            user_id=current.id,
            checkin_date=today,
            mood=payload.mood,
            note=payload.note,
        ))
    await db.commit()
    return Envelope(data={"ok": True}, message="Mood tercatat")


@router.get("/me/mood/today", response_model=Envelope[Optional[dict]])
async def get_my_mood_today(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    today = date.today()
    rec = (
        await db.execute(
            select(MoodCheckIn).where(
                MoodCheckIn.user_id == current.id,
                MoodCheckIn.checkin_date == today,
            )
        )
    ).scalar_one_or_none()
    if not rec:
        return Envelope(data=None)
    return Envelope(data={"mood": rec.mood, "note": rec.note})


@router.get("/mood/aggregate", response_model=Envelope[MoodAggregateOut])
async def mood_aggregate(
    current: Annotated[User, Depends(require_roles("admin", "hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(7, ge=1, le=90),
    class_name: Optional[str] = None,
):
    """Agregat mood untuk guru BK. Privasi siswa terjaga (no individual data)."""
    end = date.today()
    start = end - timedelta(days=days - 1)

    stmt = (
        select(MoodCheckIn)
        .join(User, User.id == MoodCheckIn.user_id)
        .where(
            User.org_id == current.org_id,
            MoodCheckIn.checkin_date >= start,
            MoodCheckIn.checkin_date <= end,
        )
    )
    if class_name:
        stmt = stmt.join(SchoolClass, SchoolClass.id == User.school_class_id).where(
            SchoolClass.name == class_name
        )
    rows = (await db.execute(stmt)).scalars().all()

    total = len(rows)
    avg = sum(r.mood for r in rows) / total if total else 0.0
    distribution = {str(i): 0 for i in range(1, 6)}
    for r in rows:
        distribution[str(r.mood)] += 1

    return Envelope(data=MoodAggregateOut(
        period_start=start,
        period_end=end,
        total_checkins=total,
        avg_mood=round(avg, 2),
        distribution=distribution,
    ))


# ─── Early Warning Watch List ───────────────────────────────────────────────


@router.get("/watchlist", response_model=Envelope[list[StudentDisciplineSummary]])
async def watchlist(
    current: Annotated[User, Depends(require_roles("admin", "hr", "super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    threshold_attitude: int = Query(60, ge=0, le=100),
    threshold_late_count: int = Query(3, ge=1, le=20),
    days: int = Query(7, ge=1, le=60),
):
    """Daftar siswa yang perlu perhatian: poin sikap rendah atau telat berulang.

    Dipakai guru BK / wali kelas sebagai early warning dashboard.
    """
    from app.models import AttendanceRecord  # local import to avoid clutter at top

    pool = await fetch_students_with_profile(db, org_id=current.org_id)

    cutoff = date.today() - timedelta(days=days)
    watch: list[tuple[User, DisciplineProfile, int]] = []

    for user, profile in pool:
        late_count = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .where(
                    AttendanceRecord.user_id == user.id,
                    AttendanceRecord.attendance_date >= cutoff,
                    AttendanceRecord.status == "late",
                )
            )
        ).scalar_one() or 0

        if profile.attitude_points < threshold_attitude or late_count >= threshold_late_count:
            watch.append((user, profile, late_count))

    # Urutkan: yang sikap-nya paling rendah dulu, lalu yang paling sering telat
    watch.sort(key=lambda x: (x[1].attitude_points, -x[2]))

    return Envelope(
        data=[_summary_from(u, p, with_xp=False) for u, p, _ in watch]
    )



# ─── Student Dashboard Extras ────────────────────────────────────────────────


@router.get("/me/extras", response_model=Envelope[dict])
async def my_dashboard_extras(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Visualisasi tambahan untuk dashboard siswa.

    Return:
      - attendance_pie: distribusi kehadiran 30 hari (hadir/telat/absen/izin)
      - subject_progress: progres rata-rata nilai per mapel
      - weekly_xp: XP per minggu (4 minggu terakhir, dari attendance & apresiasi)
      - rank_in_class: posisi siswa ini di kelasnya per kategori
    """
    if current.role != "employee":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Khusus siswa")

    today = date.today()

    # Attendance pie 30 hari
    cutoff_att = today - timedelta(days=30)
    from app.models import AttendanceRecord
    att_stats = (
        await db.execute(
            select(
                func.sum(case((AttendanceRecord.status == "present", 1), else_=0)),
                func.sum(case((AttendanceRecord.status == "late", 1), else_=0)),
                func.sum(case((AttendanceRecord.status == "absent", 1), else_=0)),
                func.sum(case((AttendanceRecord.status == "excused", 1), else_=0)),
            )
            .select_from(AttendanceRecord)
            .where(
                AttendanceRecord.user_id == current.id,
                AttendanceRecord.attendance_date >= cutoff_att,
            )
        )
    ).one()
    attendance_pie = [
        {"label": "Hadir", "count": int(att_stats[0] or 0)},
        {"label": "Telat", "count": int(att_stats[1] or 0)},
        {"label": "Absen", "count": int(att_stats[2] or 0)},
        {"label": "Izin", "count": int(att_stats[3] or 0)},
    ]

    # Subject progress
    from app.models import Assignment, AssignmentGrade, Subject
    subj_rows = (
        await db.execute(
            select(
                Subject.code,
                Subject.name,
                func.avg(AssignmentGrade.score / Assignment.max_score * 100).label("avg"),
                func.count(AssignmentGrade.id).label("cnt"),
            )
            .select_from(AssignmentGrade)
            .join(Assignment, Assignment.id == AssignmentGrade.assignment_id)
            .join(Subject, Subject.id == Assignment.subject_id)
            .where(AssignmentGrade.student_id == current.id)
            .group_by(Subject.code, Subject.name)
            .order_by(func.avg(AssignmentGrade.score / Assignment.max_score * 100).desc())
        )
    ).all()
    subject_progress = [
        {
            "subject_code": r[0],
            "subject_name": r[1],
            "avg_score": round(float(r[2] or 0), 1),
            "submissions": int(r[3]),
        }
        for r in subj_rows
    ]

    # Weekly XP (4 minggu — sederhana: hadir tepat * 10 + apresiasi * 15)
    weekly_xp: list[dict] = []
    this_monday = today - timedelta(days=today.weekday())
    for i in range(3, -1, -1):
        ws = this_monday - timedelta(days=7 * i)
        we = ws + timedelta(days=6)
        present_count = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .where(
                    AttendanceRecord.user_id == current.id,
                    AttendanceRecord.attendance_date >= ws,
                    AttendanceRecord.attendance_date <= we,
                    AttendanceRecord.status == "present",
                )
            )
        ).scalar_one() or 0
        late_count = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceRecord)
                .where(
                    AttendanceRecord.user_id == current.id,
                    AttendanceRecord.attendance_date >= ws,
                    AttendanceRecord.attendance_date <= we,
                    AttendanceRecord.status == "late",
                )
            )
        ).scalar_one() or 0
        apr_count = (
            await db.execute(
                select(func.count())
                .select_from(DisciplineIncident)
                .where(
                    DisciplineIncident.user_id == current.id,
                    DisciplineIncident.kind == "adjustment",
                    DisciplineIncident.appreciation_delta > 0,
                    DisciplineIncident.incident_date >= ws,
                    DisciplineIncident.incident_date <= we,
                )
            )
        ).scalar_one() or 0
        xp = present_count * 10 + late_count * 2 + apr_count * 15
        weekly_xp.append({
            "week_label": f"M-{i}" if i > 0 else "Now",
            "xp": xp,
        })

    # Rank in class (untuk 3 kategori)
    rank_in_class = {"gpa": None, "attitude": None, "appreciation": None, "class_size": 0}
    if current.school_class_id:
        peers = (
            await db.execute(
                select(User, DisciplineProfile)
                .join(DisciplineProfile, DisciplineProfile.user_id == User.id, isouter=True)
                .where(
                    User.school_class_id == current.school_class_id,
                    User.role == "employee",
                    User.status == "active",
                )
            )
        ).all()
        rank_in_class["class_size"] = len(peers)

        def rank_by(getter):
            sorted_pool = sorted(
                [(u, p) for u, p in peers if p is not None],
                key=lambda x: getter(x[1]),
                reverse=True,
            )
            for idx, (u, _) in enumerate(sorted_pool):
                if u.id == current.id:
                    return idx + 1
            return None

        rank_in_class["gpa"] = rank_by(lambda p: p.gpa)
        rank_in_class["attitude"] = rank_by(lambda p: p.attitude_points)
        rank_in_class["appreciation"] = rank_by(lambda p: p.appreciation_points)

    return Envelope(data={
        "attendance_pie": attendance_pie,
        "subject_progress": subject_progress,
        "weekly_xp": weekly_xp,
        "rank_in_class": rank_in_class,
    })
