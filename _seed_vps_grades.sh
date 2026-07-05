#!/bin/bash
# Seed tugas + nilai untuk org yang ada di VPS (org_id=1)
cd /var/www/aethera/backend
source .venv/bin/activate

python << 'PYEOF'
import asyncio, random, sys
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
}

def gen_score(asg_type, idx, total):
    mean, mx, std = SCORE_PROFILE.get(asg_type, (75, 95, 8))
    bias = (total - idx - 1) * (12 / max(total - 1, 1))
    raw = random.gauss(mean + bias - 8, std)
    return round(max(40, min(mx, raw)), 1)

async def main():
    async with AsyncSessionLocal() as db:
        # Cari org yang punya siswa
        orgs = (await db.execute(select(Organization))).scalars().all()
        target_org = None
        for o in orgs:
            cnt = (await db.execute(select(User).where(User.org_id == o.id, User.role == "employee"))).scalars().all()
            if len(cnt) > 5:
                target_org = o
                print(f"Target org: {o.name!r} (id={o.id}, {len(cnt)} siswa)")
                break
        
        if not target_org:
            print("ERROR: tidak ada org dengan siswa")
            return

        kepsek = (await db.execute(select(User).where(User.org_id == target_org.id, User.role.in_(["super_admin", "admin"])).limit(1))).scalar_one_or_none()
        if not kepsek:
            print("ERROR: tidak ada admin/kepsek")
            return

        # Pastikan subjects ada
        subjects = {s.code: s for s in (await db.execute(select(Subject).where(Subject.org_id == target_org.id))).scalars().all()}
        if not subjects:
            print("Membuat subjects...")
            for code, name, desc in [
                ("MTK", "Matematika", "Aljabar, geometri"),
                ("IPA", "IPA Terpadu", "Fisika, kimia, biologi"),
                ("BIN", "Bahasa Indonesia", "Sastra dan tata bahasa"),
                ("IPS", "IPS Terpadu", "Sejarah, geografi"),
                ("BIG", "Bahasa Inggris", "English language"),
            ]:
                s = Subject(org_id=target_org.id, code=code, name=name, description=desc)
                db.add(s)
            await db.flush()
            subjects = {s.code: s for s in (await db.execute(select(Subject).where(Subject.org_id == target_org.id))).scalars().all()}

        classes = (await db.execute(select(SchoolClass).where(SchoolClass.org_id == target_org.id))).scalars().all()
        print(f"Kelas: {len(classes)}")

        random.seed(42)
        total_created = 0
        total_grades = 0

        for cls in classes:
            students = (await db.execute(
                select(User).where(User.org_id == target_org.id, User.school_class_id == cls.id, User.role == "employee", User.status == "active")
            )).scalars().all()
            if not students:
                continue

            for code, title, atype, max_s, weight, days_ago in ASSIGNMENTS_PER_CLASS:
                subj = subjects.get(code)
                if not subj:
                    continue
                full_title = f"{title} — {cls.name}"
                existing = (await db.execute(
                    select(Assignment).where(Assignment.org_id == target_org.id, Assignment.school_class_id == cls.id, Assignment.title == full_title)
                )).scalar_one_or_none()
                if existing:
                    asg = existing
                else:
                    asg = Assignment(
                        org_id=target_org.id, teacher_id=kepsek.id, subject_id=subj.id,
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
            print(f"  {cls.name}: {len(students)} siswa, GPA updated")

        await db.commit()
        print(f"\nDone: +{total_created} tugas, +{total_grades} nilai")
    await engine.dispose()

asyncio.run(main())
PYEOF

deactivate
echo "=== Selesai ==="
