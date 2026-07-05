"""Seed contoh nilai untuk kelas 10 IPA 1 — alur lengkap nilai siswa.

Jalankan: python _seed_grades_demo.py

Yang akan dibuat:
1. Pastikan kepsek jadi pengampu sementara (untuk demo)
2. 5 tugas untuk kelas 10 IPA 1 dari 3 mata pelajaran:
   - MTK : Tugas Bab 1 + UTS
   - IPA : Kuis Praktikum + Ulangan Bab 2
   - BIN : Tugas Karangan Pengalaman
3. Nilai untuk SEMUA siswa di kelas (realistic distribution: ada
   yang excellent, ada yang struggle)
4. Recompute GPA otomatis — leaderboard "Nilai Terbaik" akan refresh

Idempotent: kalau dijalankan ulang, data lama tidak ke-duplicate
karena cek title+kelas, dan grades di-overwrite.
"""
import asyncio
import random
import sys
from datetime import date, datetime, timedelta

from sqlalchemy import select

from app.database import AsyncSessionLocal, engine
from app.models import (
    Assignment,
    AssignmentGrade,
    Organization,
    SchoolClass,
    Subject,
    User,
)
from app.services.lms_service import recompute_gpa_for_student


# Definisi tugas — mirror data realistic sekolah indonesia.
# Format: (subject_code, title, type, max_score, weight, days_ago, description)
ASSIGNMENTS_DEF = [
    (
        "MTK", "Tugas Bab 1 — Bilangan & Operasi", "tugas",
        100, 1.0, 21,
        "Latihan soal hal 24-28. Kumpulkan tertulis di buku tugas.",
    ),
    (
        "MTK", "UTS Matematika Semester Genap", "uts",
        100, 2.0, 7,
        "Materi Bab 1-3 (Bilangan, Aljabar, Persamaan Linear). 90 menit.",
    ),
    (
        "IPA", "Kuis Praktikum Mikroskop", "kuis",
        100, 1.0, 14,
        "Pengenalan bagian-bagian mikroskop dan cara penggunaannya.",
    ),
    (
        "IPA", "Ulangan Bab 2 — Klasifikasi Makhluk Hidup", "ulangan",
        100, 1.5, 5,
        "Soal pilihan ganda + esai. Materi 5 kingdom + tata nama Latin.",
    ),
    (
        "BIN", "Tugas Karangan: Pengalaman Liburan", "tugas",
        100, 1.0, 10,
        "Karangan deskriptif min 300 kata. Submit di Google Form.",
    ),
]


# Distribusi nilai per tugas berbeda — bikin realistic:
# - Tugas mudah (Bab 1, Karangan): mostly 75-95
# - Ulangan/UTS: spread lebih lebar 50-95
# - Kuis: medium 65-90
SCORE_PROFILE = {
    "tugas": (75, 95, 7),       # mean, max, std
    "kuis": (70, 90, 10),
    "ulangan": (65, 92, 12),
    "uts": (60, 95, 14),
    "uas": (60, 95, 14),
}


def realistic_score(asg_type: str, student_idx: int, total_students: int) -> float:
    """Generate nilai yang konsisten per siswa (siswa tertentu cenderung
    lebih bagus dari yang lain — biar GPA reflective).
    """
    mean, max_s, std = SCORE_PROFILE.get(asg_type, (75, 95, 8))
    # Bias per-student: siswa #1 paling tinggi, terakhir paling rendah
    bias = (total_students - student_idx - 1) * (15 / max(total_students - 1, 1))
    raw = random.gauss(mean + bias - 10, std)
    score = max(40, min(max_s, raw))
    # Kembalikan dengan max 1 desimal
    return round(score, 1)


async def main():
    async with AsyncSessionLocal() as db:
        org = (await db.execute(select(Organization))).scalar_one()
        kepsek = (
            await db.execute(
                select(User).where(
                    User.org_id == org.id,
                    User.role == "super_admin",
                )
            )
        ).scalar_one_or_none()
        if not kepsek:
            print("ERROR: Kepsek tidak ditemukan. Jalankan seed_simmico.py dulu.")
            return

        target_class = (
            await db.execute(
                select(SchoolClass).where(
                    SchoolClass.org_id == org.id,
                    SchoolClass.name == "10 IPA 1",
                )
            )
        ).scalar_one_or_none()
        if not target_class:
            print("ERROR: Kelas '10 IPA 1' tidak ditemukan.")
            return

        students = (
            await db.execute(
                select(User).where(
                    User.org_id == org.id,
                    User.school_class_id == target_class.id,
                    User.role == "employee",
                    User.status == "active",
                ).order_by(User.full_name)
            )
        ).scalars().all()

        if not students:
            print(f"ERROR: Tidak ada siswa di {target_class.name}.")
            return

        print(f"\n=== Seed Nilai Kelas {target_class.name} ===")
        print(f"Total siswa: {len(students)}")
        for s in students:
            print(f"  - {s.full_name} ({s.employee_id})")
        print()

        random.seed(42)  # deterministic

        # 1. Buat assignments
        created_count = 0
        skipped_count = 0
        all_assignments = []

        for code, title, atype, max_s, weight, days_ago, desc in ASSIGNMENTS_DEF:
            subject = (
                await db.execute(
                    select(Subject).where(
                        Subject.org_id == org.id, Subject.code == code
                    )
                )
            ).scalar_one_or_none()
            if not subject:
                print(f"  ! Subject {code} tidak ada — skip")
                continue

            # Cek duplicate by title + kelas
            existing = (
                await db.execute(
                    select(Assignment).where(
                        Assignment.org_id == org.id,
                        Assignment.school_class_id == target_class.id,
                        Assignment.title == title,
                    )
                )
            ).scalar_one_or_none()
            if existing:
                all_assignments.append(existing)
                skipped_count += 1
                print(f"  · {title} [exists, skip]")
                continue

            asg = Assignment(
                org_id=org.id,
                teacher_id=kepsek.id,  # kepsek temp, demo
                subject_id=subject.id,
                school_class_id=target_class.id,
                title=title,
                description=desc,
                assignment_type=atype,
                max_score=max_s,
                weight=weight,
                due_date=date.today() - timedelta(days=days_ago),
                is_published=True,
            )
            db.add(asg)
            await db.flush()
            all_assignments.append(asg)
            created_count += 1
            print(f"  + {title} ({atype}, max {max_s}, ×{weight})")

        print(f"\n  Tugas: +{created_count} baru, {skipped_count} skip")

        # 2. Buat nilai untuk semua siswa × semua tugas
        grades_created = 0
        grades_updated = 0

        for asg in all_assignments:
            for idx, student in enumerate(students):
                score = realistic_score(asg.assignment_type, idx, len(students))

                existing_grade = (
                    await db.execute(
                        select(AssignmentGrade).where(
                            AssignmentGrade.assignment_id == asg.id,
                            AssignmentGrade.student_id == student.id,
                        )
                    )
                ).scalar_one_or_none()

                if existing_grade:
                    existing_grade.score = score
                    existing_grade.source = "manual"
                    existing_grade.graded_by = kepsek.id
                    grades_updated += 1
                else:
                    db.add(AssignmentGrade(
                        assignment_id=asg.id,
                        student_id=student.id,
                        score=score,
                        source="manual",
                        graded_by=kepsek.id,
                    ))
                    grades_created += 1

        await db.flush()
        print(f"  Nilai: +{grades_created} baru, {grades_updated} update")

        # 3. Recompute GPA semua siswa
        print(f"\n  ~ Recomputing GPA...")
        for student in students:
            new_gpa = await recompute_gpa_for_student(db, student.id)
            print(f"    {student.full_name}: GPA = {new_gpa:.2f}")

        await db.commit()

        print("\n=== Selesai ===")
        print(f"\n5 Tugas dibuat untuk kelas {target_class.name}:")
        for code, title, atype, max_s, weight, _, _ in ASSIGNMENTS_DEF:
            print(f"  · [{code}] {title} ({atype}, ×{weight})")
        print()
        print("Cek hasilnya di:")
        print("  - Login kepsek (admin@smk-aethera.id) → Pembelajaran > Nilai Siswa")
        print("    Pilih kelas '10 IPA 1' untuk lihat matrix")
        print("  - Login siswa Hafiz → Tugas Saya — lihat semua tugas + nilainya")
        print("  - Login kepsek → Papan Peringkat — kategori 'Nilai Terbaik' update")
        print()

    await engine.dispose()


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
