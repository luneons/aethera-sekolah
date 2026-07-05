"""Seed data SIMMICO untuk demo klien.

Idempotent: jalankan kapanpun, hanya menambah data yang belum ada.

Yang di-seed:
1. Organization "SMK Aethera" (mode school) — kalau belum ada org school.
2. School classes (10 kelas).
3. 32 siswa dengan akun login (password: <nama_depan_lowercase>123).
4. Katalog 10 ViolationType + 7 AppreciationType.
5. 4-12 insiden dummy per siswa, profile auto-recalculate.
6. 3 staf demo: Kepala Sekolah, Guru BK, Wali Kelas.

Pakai:
    cd backend
    python -m app.seed_simmico
"""
from __future__ import annotations

import asyncio
import random
from datetime import date, datetime, time, timedelta

from sqlalchemy import delete, select

from app.database import AsyncSessionLocal, init_db
from app.models import (
    AppreciationType,
    AttendanceRecord,
    DisciplineIncident,
    DisciplineProfile,
    Organization,
    SchoolClass,
    User,
    UserAuth,
    ViolationType,
    WorkSchedule,
)
from app.security import hash_password
from app.services.discipline_service import recalculate_profile


# ─── Seed Catalog Definition ─────────────────────────────────────────────────

VIOLATION_DEFS = [
    ("KTS-001", "kehadiran", "Terlambat masuk sekolah", "ringan", 5, 1, 0,
     "Tiba di sekolah setelah bel masuk berbunyi."),
    ("KTS-002", "kehadiran", "Bolos jam pelajaran", "sedang", 15, 4, 2,
     "Tidak mengikuti jam pelajaran tanpa izin."),
    ("KTS-003", "kerapian", "Atribut seragam tidak lengkap", "ringan", 3, 1, 0,
     "Tidak memakai dasi/topi/badge sesuai ketentuan."),
    ("KTS-004", "kerapian", "Rambut/kuku tidak rapi", "ringan", 3, 1, 0,
     "Pelanggaran terhadap standar penampilan."),
    ("KTS-005", "etika", "Berkelahi/intimidasi", "berat", 25, 8, 4,
     "Tindakan kekerasan fisik atau verbal terhadap siswa lain."),
    ("KTS-006", "etika", "Membawa/menggunakan rokok", "berat", 30, 12, 6,
     "Membawa atau merokok di area sekolah."),
    ("KTS-007", "akademik", "Tidak mengerjakan tugas", "ringan", 5, 2, 1,
     "Lalai mengerjakan tugas yang diberikan."),
    ("KTS-008", "akademik", "Mencontek saat ujian", "berat", 20, 6, 3,
     "Pelanggaran integritas akademik saat penilaian."),
    ("KTS-009", "kedisiplinan", "Membawa HP saat KBM", "sedang", 8, 2, 0,
     "Mengaktifkan HP di luar izin saat KBM berlangsung."),
    ("KTS-010", "kedisiplinan", "Merusak fasilitas sekolah", "berat", 25, 10, 4,
     "Vandalisme atau kerusakan inventaris sekolah."),
]

APPRECIATION_DEFS = [
    ("APR-001", "Juara lomba akademik", 50, False, False,
     "Meraih juara 1/2/3 lomba tingkat sekolah ke atas."),
    ("APR-002", "Bakti sosial / volunteer", 20, False, False,
     "Aktif dalam kegiatan baksos atau pengabdian masyarakat."),
    ("APR-003", "Kepemimpinan OSIS / Ekskul", 30, False, False,
     "Berperan aktif sebagai pengurus organisasi sekolah."),
    ("APR-004", "Membantu teman / guru", 10, False, False,
     "Inisiatif positif yang dilihat oleh guru."),
    ("APR-005", "Prestasi non-akademik (seni/olahraga)", 40, False, False,
     "Juara lomba seni, olahraga, atau ketrampilan."),
    ("APR-006", "Pelunasan jam kersos", 0, True, False,
     "Penyesuaian: jam kersos telah dijalani dan diverifikasi."),
    ("APR-007", "Pelunasan jam lembur/bengkel", 0, False, True,
     "Penyesuaian: jam lembur/bengkel telah dijalani."),
]

CLASS_DEFS = [
    ("10 IPA 1", "10", "IPA", "Bu Sari (Wali Kelas)"),
    ("10 IPA 2", "10", "IPA", "Pak Hadi (Wali Kelas)"),
    ("10 IPS 1", "10", "IPS", "Bu Lina (Wali Kelas)"),
    ("11 IPA 1", "11", "IPA", "Pak Doni (Wali Kelas)"),
    ("11 IPA 2", "11", "IPA", "Bu Ratna (Wali Kelas)"),
    ("11 IPS 1", "11", "IPS", "Pak Wawan (Wali Kelas)"),
    ("11 RPL 1", "11", "RPL", "Pak Bayu (Wali Kelas)"),
    ("12 IPA 1", "12", "IPA", "Bu Maya (Wali Kelas)"),
    ("12 IPS 1", "12", "IPS", "Pak Reza (Wali Kelas)"),
    ("12 TKJ 1", "12", "TKJ", "Bu Dini (Wali Kelas)"),
]

FIRST_NAMES = [
    "Aisyah", "Bagas", "Citra", "Dimas", "Elin", "Farhan", "Gita", "Hafiz",
    "Indah", "Joko", "Kirana", "Luthfi", "Maya", "Nabil", "Olivia", "Putra",
    "Qonita", "Rizki", "Sasha", "Tegar", "Umar", "Vina", "Wisnu", "Xena",
    "Yusuf", "Zahra", "Adit", "Bilqis", "Candra", "Dewi", "Eka", "Firman",
]
LAST_NAMES = [
    "Pratama", "Wijaya", "Saputra", "Anggraini", "Hidayat", "Maulana",
    "Nugraha", "Permata", "Lestari", "Setiawan", "Kusuma", "Putri",
    "Rahman", "Halim", "Santoso",
]


async def ensure_org(db) -> Organization:
    """Ambil org school existing atau buat baru."""
    org = (
        await db.execute(
            select(Organization).where(Organization.organization_mode == "school")
        )
    ).scalar_one_or_none()
    if org:
        return org

    org = Organization(
        name="SMK Aethera Demo",
        slug="smk-aethera",
        organization_mode="school",
        timezone="Asia/Jakarta",
    )
    db.add(org)
    await db.flush()
    print(f"  + Organization '{org.name}' (mode=school) dibuat")
    return org


async def ensure_classes(db, org_id: int) -> dict[str, SchoolClass]:
    existing = {
        c.name: c
        for c in (
            await db.execute(select(SchoolClass).where(SchoolClass.org_id == org_id))
        ).scalars().all()
    }
    out = dict(existing)
    for name, grade, major, teacher in CLASS_DEFS:
        if name in existing:
            continue
        kelas = SchoolClass(
            org_id=org_id,
            name=name,
            grade=grade,
            major=major,
            homeroom_teacher=teacher,
        )
        db.add(kelas)
        await db.flush()
        out[name] = kelas
        print(f"  + Kelas {name}")
    return out


async def ensure_violations(db, org_id: int) -> list[ViolationType]:
    existing_codes = {
        c
        for c in (
            await db.execute(
                select(ViolationType.code).where(ViolationType.org_id == org_id)
            )
        ).scalars().all()
    }
    created = 0
    for code, cat, name, sev, att, kers, lemb, desc in VIOLATION_DEFS:
        if code in existing_codes:
            continue
        db.add(ViolationType(
            org_id=org_id, code=code, category=cat, name=name, severity=sev,
            attitude_penalty=att, kersos_hours=kers, lembur_hours=lemb,
            description=desc,
        ))
        created += 1
    if created:
        await db.flush()
        print(f"  + {created} ViolationType")

    return (
        await db.execute(select(ViolationType).where(ViolationType.org_id == org_id))
    ).scalars().all()


async def ensure_appreciations(db, org_id: int) -> list[AppreciationType]:
    existing_codes = {
        c
        for c in (
            await db.execute(
                select(AppreciationType.code).where(AppreciationType.org_id == org_id)
            )
        ).scalars().all()
    }
    created = 0
    for code, name, pts, payoff_k, payoff_l, desc in APPRECIATION_DEFS:
        if code in existing_codes:
            continue
        db.add(AppreciationType(
            org_id=org_id, code=code, name=name,
            appreciation_points=pts,
            is_payoff_kersos=payoff_k, is_payoff_lembur=payoff_l,
            description=desc,
        ))
        created += 1
    if created:
        await db.flush()
        print(f"  + {created} AppreciationType")

    return (
        await db.execute(select(AppreciationType).where(AppreciationType.org_id == org_id))
    ).scalars().all()


async def ensure_schedule(db, org_id: int) -> WorkSchedule:
    sched = (
        await db.execute(select(WorkSchedule).where(WorkSchedule.org_id == org_id))
    ).scalar_one_or_none()
    if sched:
        return sched
    sched = WorkSchedule(
        org_id=org_id,
        name="Jadwal Sekolah Reguler",
        check_in_start=time(6, 30),
        check_in_end=time(7, 30),
        check_out_start=time(14, 0),
        grace_period=15,
        work_days="Mon,Tue,Wed,Thu,Fri",
    )
    db.add(sched)
    await db.flush()
    print("  + Schedule sekolah reguler")
    return sched


async def ensure_staff(db, org_id: int) -> dict[str, User]:
    """Buat akun staff demo (admin/HR)."""
    targets = [
        ("admin@smk-aethera.id", "admin123", "Kepala Sekolah Aethera",
         "STAF-001", "super_admin"),
        ("bk@smk-aethera.id", "bk123", "Bu Ratna (Guru BK)",
         "STAF-002", "hr"),
        ("wali@smk-aethera.id", "wali123", "Pak Hadi (Wali Kelas)",
         "STAF-003", "admin"),
    ]
    out: dict[str, User] = {}
    for email, password, name, emp_id, role in targets:
        existing = (
            await db.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if existing:
            out[role] = existing
            continue
        user = User(
            org_id=org_id, employee_id=emp_id, full_name=name, email=email,
            role=role, status="active", join_date=date(2023, 7, 15),
        )
        db.add(user)
        await db.flush()
        db.add(UserAuth(user_id=user.id, password_hash=hash_password(password)))
        out[role] = user
        print(f"  + Staff {role}: {email} / {password}")
    return out


async def ensure_students(db, org_id: int, classes: dict[str, SchoolClass]) -> list[User]:
    """Bikin 32 siswa siap login. Kalau sudah ada, skip."""
    existing = (
        await db.execute(
            select(User).where(
                User.org_id == org_id,
                User.role == "employee",
                User.employee_id.like("2024%"),
            )
        )
    ).scalars().all()
    if len(existing) >= 32:
        print(f"  · {len(existing)} siswa sudah ada — skip")
        return list(existing)

    rng = random.Random(42)  # deterministic
    class_keys = list(classes.keys())
    used_first = set()
    students: list[User] = list(existing)

    target_count = 32
    for i in range(len(existing), target_count):
        # Pastikan unique-ish
        first = rng.choice(FIRST_NAMES)
        last = rng.choice(LAST_NAMES)
        full_name = f"{first} {last}"
        nis = f"2024{i+1:04d}"
        cls_name = class_keys[i % len(class_keys)]
        kelas = classes[cls_name]

        # Email = first.lowercase + nis (jadi konsisten gampang dipake demo)
        email = f"{first.lower()}.{nis}@siswa.aethera.id"
        password = f"{first.lower()}123"

        # Skip duplicate email kalau ada (jarang, tapi defensive)
        existing_email = (
            await db.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if existing_email:
            email = f"{first.lower()}.{nis}.{i}@siswa.aethera.id"

        user = User(
            org_id=org_id,
            school_class_id=kelas.id,
            employee_id=nis,
            full_name=full_name,
            email=email,
            phone=f"08{rng.randint(1000000000, 1999999999)}",
            parent_phone=f"08{rng.randint(2000000000, 2999999999)}",
            parent_name=f"Bpk/Ibu Wali {last}",
            role="employee",
            status="active",
            join_date=date(2024, 7, 15),
        )
        db.add(user)
        await db.flush()
        db.add(UserAuth(user_id=user.id, password_hash=hash_password(password)))

        # Profile awal (GPA random 70–98)
        gpa = round(70 + rng.random() * 28, 1)
        db.add(DisciplineProfile(
            user_id=user.id,
            gpa=gpa,
            attitude_points=100,
            appreciation_points=0,
        ))

        students.append(user)
        used_first.add(first)
        if (i + 1) % 8 == 0:
            print(f"  + {i+1}/{target_count} siswa")

    await db.flush()
    print(f"  + Total siswa: {len(students)}")
    return students


async def seed_attendance_history(
    db, students: list[User], schedule_id: int, days: int = 21
) -> None:
    """Bikin riwayat absensi 21 hari supaya tren chart ada datanya."""
    today = date.today()
    rng = random.Random(7)
    created = 0
    for offset in range(1, days + 1):
        d = today - timedelta(days=offset)
        if d.weekday() >= 5:  # weekend
            continue
        for student in students:
            # Cek dulu, jangan duplikat
            existing = (
                await db.execute(
                    select(AttendanceRecord).where(
                        AttendanceRecord.user_id == student.id,
                        AttendanceRecord.attendance_date == d,
                    )
                )
            ).scalar_one_or_none()
            if existing:
                continue

            r = rng.random()
            # 75% hadir tepat, 15% telat, 8% absen, 2% izin
            if r < 0.75:
                check_in_min = rng.randint(-30, 0)  # datang lebih awal
                ci = datetime.combine(d, time(7, 0)) + timedelta(minutes=check_in_min)
                co = datetime.combine(d, time(14, 0)) + timedelta(minutes=rng.randint(-10, 30))
                status = "present"
                late = 0
            elif r < 0.90:
                late = rng.randint(5, 35)
                ci = datetime.combine(d, time(7, 30)) + timedelta(minutes=late)
                co = datetime.combine(d, time(14, 0)) + timedelta(minutes=rng.randint(0, 20))
                status = "late"
            elif r < 0.98:
                ci = None
                co = None
                status = "absent"
                late = 0
            else:
                ci = None
                co = None
                status = "excused"
                late = 0

            db.add(AttendanceRecord(
                user_id=student.id,
                schedule_id=schedule_id,
                attendance_date=d,
                check_in_at=ci,
                check_out_at=co,
                check_in_method="face" if ci else "manual",
                status=status,
                late_minutes=late,
                work_duration=int((co - ci).total_seconds() // 60) if ci and co else None,
            ))
            created += 1
    if created:
        await db.flush()
        print(f"  + {created} record kehadiran historis")


async def seed_incidents(
    db,
    students: list[User],
    violations,
    appreciations,
    reporter_id: int,
) -> None:
    """Bikin 4-12 insiden per siswa untuk demo data leaderboard."""
    rng = random.Random(99)
    created = 0
    for student in students:
        # Kalau sudah ada insiden, skip
        existing = (
            await db.execute(
                select(DisciplineIncident).where(DisciplineIncident.user_id == student.id).limit(1)
            )
        ).scalar_one_or_none()
        if existing:
            continue

        n = rng.randint(4, 12)
        for _ in range(n):
            days_ago = rng.randint(0, 80)
            d = date.today() - timedelta(days=days_ago)
            is_penalty = rng.random() < 0.65
            if is_penalty:
                v = rng.choice(violations)
                db.add(DisciplineIncident(
                    org_id=student.org_id,
                    user_id=student.id,
                    reporter_id=reporter_id,
                    kind="penalty",
                    incident_date=d,
                    ref_code=v.code,
                    ref_name=v.name,
                    attitude_delta=-abs(v.attitude_penalty),
                    kersos_delta=v.kersos_hours,
                    lembur_delta=v.lembur_hours,
                    appreciation_delta=0,
                ))
            else:
                a = rng.choice(appreciations)
                kersos_delta = -rng.randint(1, 3) if a.is_payoff_kersos else 0
                lembur_delta = -rng.randint(1, 3) if a.is_payoff_lembur else 0
                db.add(DisciplineIncident(
                    org_id=student.org_id,
                    user_id=student.id,
                    reporter_id=reporter_id,
                    kind="adjustment",
                    incident_date=d,
                    ref_code=a.code,
                    ref_name=a.name,
                    attitude_delta=0,
                    kersos_delta=kersos_delta,
                    lembur_delta=lembur_delta,
                    appreciation_delta=a.appreciation_points,
                ))
            created += 1
    if created:
        await db.flush()
        print(f"  + {created} insiden disiplin")


async def recalc_all(db, students: list[User]) -> None:
    """Hitung ulang semua profile setelah seed insiden."""
    for s in students:
        await recalculate_profile(db, s.id)
    print(f"  ~ Recalculated {len(students)} discipline profiles")


async def run() -> None:
    await init_db()
    async with AsyncSessionLocal() as db:
        print("\n=== SIMMICO Seed ===\n")

        org = await ensure_org(db)
        classes = await ensure_classes(db, org.id)
        violations = await ensure_violations(db, org.id)
        appreciations = await ensure_appreciations(db, org.id)
        schedule = await ensure_schedule(db, org.id)
        staff = await ensure_staff(db, org.id)
        students = await ensure_students(db, org.id, classes)

        # Reporter = admin / wali kelas
        reporter = staff.get("admin") or staff.get("hr") or staff.get("super_admin")
        if reporter:
            await seed_incidents(db, students, violations, appreciations, reporter.id)

        await seed_attendance_history(db, students, schedule.id)
        await recalc_all(db, students)

        await db.commit()

        print("\n=== Selesai ===")
        print("\nLogin:")
        print("  ADMIN / KEPSEK : admin@smk-aethera.id / admin123")
        print("  GURU BK        : bk@smk-aethera.id    / bk123")
        print("  WALI KELAS     : wali@smk-aethera.id  / wali123")
        if students:
            sample = students[0]
            sample_first = sample.full_name.split()[0].lower()
            print(f"  SISWA contoh   : {sample.email} / {sample_first}123")
        print()


if __name__ == "__main__":
    asyncio.run(run())
