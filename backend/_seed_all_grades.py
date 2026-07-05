"""Seed tugas + nilai untuk SEMUA kelas.

Tiap kelas dapat 4-5 tugas dari mapel yang relevan.
Nilai di-generate realistic per siswa.
Idempotent: skip kalau tugas sudah ada.
"""
import asyncio
import random
import sys
from datetime import date, timedelta

from sqlalchemy import select

from app.database import AsyncSessionLocal, engine
from app.models import Assignment, AssignmentGrade, Organization, SchoolClass, Subject, User
from app.services.lms_service import recompute_gpa_for_student

ASSIGNMENTS_PER_CLASS = [
    ("MTK", "Tugas Harian Matematika", "tugas", 100, 1.0, 20),
    ("IPA", "Ulangan IPA Bab 1", "ulangan", 100, 1.5, 15),
    ("BIN", "Tugas Karangan", "tugas", 100, 1.0, 12),
    ("IPS", "Kuis IPS", "kuis", 100, 1.0, 8),
    ("BIG", "Ulangan Bahasa Inggris", "ulangan", 100, 1.5, 5),
]

SCORE_PROFILE = {
    "tugas": (78, 95, 7),
    "kuis": (72, 90, 10),
    "ulangan": (65, 92, 12),
    "uts": (60, 95, 14),
    "uas": (60, 95, 14),
}

def gen_score(asg_type, student_idx, total):
    mean, mx, std = SCORE_PROFILE.get(asg_type, (75, 95, 8))
    bias = (total - student_idx - 1) * (12 / max(total - 1, 1))
    raw = random.gauss(mean + bias - 8, std)
    return round(max(40, min(mx, raw)), 1)

async def main():
    async with AsyncSessionLocal() as db:
        org = (await db.execute(select(Organization))).scalar_one()
        kepsek = (await db.execute(select(User).where(User.org_id == org.id, User.role == "super_admin"))).scalar_one_or_none()
        if not kepsek:
            print("ERROR: kepsek tidak ada"); return

        classes = (await db.execute(select(SchoolClass).where(SchoolClass.org_id == org.id))).scalars().all()
        subjects = {s.code: s for s in (await db.execute(select(Subject).where(Subject.org_id == org.id))).scalars().all()}

        total_created = 0
        total_grades = 0
        random.seed(99)

        for cls in classes:
            students = (await db.execute(
                select(User).where(User.org_id == org.id, User.school_class_id == cls.id, User.role == "employee", User.status == "active")
            )).scalars().all()
            if not students:
                continue

            print(f"\n{cls.name} ({len(students)} siswa)")
            for code, title, atype, max_s, weight, days_ago in ASSIGNMENTS_PER_CLASS:
                subj = subjects.get(code)
                if not subj:
                    continue
                full_title = f"{title} — {cls.name}"
                existing = (await db.execute(
                    select(Assignment).where(Assignment.org_id == org.id, Assignment.school_class_id == cls.id, Assignment.title == full_title)
                )).scalar_one_or_none()
                if existing:
                    asg = existing
                else:
                    asg = Assignment(
                        org_id=org.id, teacher_id=kepsek.id, subject_id=subj.id,
                        school_class_id=cls.id, title=full_title, assignment_type=atype,
                        max_score=max_s, weight=weight,
                        due_date=date.today() - timedelta(days=days_ago), is_published=True,
                    )
                    db.add(asg)
                    await db.flush()
                    total_created += 1

                for idx, student in enumerate(students):
                    ex = (await db.execute(
                        select(AssignmentGrade).where(AssignmentGrade.assignment_id == asg.id, AssignmentGrade.student_id == student.id)
                    )).scalar_one_or_none()
                    score = gen_score(atype, idx, len(students))
                    if ex:
                        ex.score = score
                    else:
                        db.add(AssignmentGrade(assignment_id=asg.id, student_id=student.id, score=score, source="manual", graded_by=kepsek.id))
                        total_grades += 1

            await db.flush()
            for s in students:
                gpa = await recompute_gpa_for_student(db, s.id)
                print(f"  {s.full_name}: GPA={gpa:.1f}")

        await db.commit()
        print(f"\nDone: +{total_created} tugas, +{total_grades} nilai")
    await engine.dispose()

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
