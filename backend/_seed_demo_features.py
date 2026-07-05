"""Seed demo data untuk 6 fitur baru: timetable, ekskul, counseling, library, events, ai_insight.

Idempotent: skip kalau sudah ada.
"""
import asyncio
import random
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import (
    Extracurricular,
    LibraryBook,
    SchoolClass,
    SchoolEvent,
    Subject,
    TimetableSlot,
    User,
)


async def seed_timetable(db: AsyncSession, org_id: int):
    classes = (await db.execute(select(SchoolClass).where(SchoolClass.org_id == org_id))).scalars().all()
    subjects = (await db.execute(select(Subject).where(Subject.org_id == org_id))).scalars().all()
    teachers = (await db.execute(select(User).where(User.org_id == org_id, User.role == "admin"))).scalars().all()

    if not classes or not subjects or not teachers:
        print("[timetable] skip — perlu kelas, subject, atau guru")
        return

    existing_count = (await db.execute(select(TimetableSlot).limit(1))).scalar_one_or_none()
    if existing_count:
        print("[timetable] skip — sudah ada")
        return

    schedule = [
        (time(7, 0), time(7, 45)),
        (time(7, 45), time(8, 30)),
        (time(8, 30), time(9, 15)),
        (time(9, 30), time(10, 15)),
        (time(10, 15), time(11, 0)),
        (time(11, 0), time(11, 45)),
        (time(13, 0), time(13, 45)),
        (time(13, 45), time(14, 30)),
    ]
    created = 0
    for cls in classes[:3]:  # only 3 first kelas for demo
        for day in range(5):  # Senin-Jumat
            for period_idx, (st, et) in enumerate(schedule[:6], start=1):
                subj = random.choice(subjects)
                teacher = random.choice(teachers)
                db.add(TimetableSlot(
                    org_id=org_id,
                    school_class_id=cls.id,
                    day_of_week=day,
                    period_index=period_idx,
                    start_time=st,
                    end_time=et,
                    subject_id=subj.id,
                    teacher_id=teacher.id,
                    room=f"R-{cls.id:02d}{period_idx}",
                ))
                created += 1
    await db.commit()
    print(f"[timetable] {created} slot dibuat")


async def seed_ekskul(db: AsyncSession, org_id: int):
    existing = (await db.execute(select(Extracurricular).where(Extracurricular.org_id == org_id))).scalars().first()
    if existing:
        print("[ekskul] skip — sudah ada")
        return

    teachers = (await db.execute(select(User).where(User.org_id == org_id, User.role.in_(["admin", "hr"])))).scalars().all()
    coach_id = teachers[0].id if teachers else None

    samples = [
        ("PRMK", "Pramuka", "Belajar kemandirian, kepemimpinan, dan kebangsaan", "Sabtu 14:00-16:00", "Lapangan", 40),
        ("BSKT", "Basket", "Tim basket sekolah, latihan rutin & turnamen", "Selasa & Kamis 15:30-17:30", "GOR", 20),
        ("PSKB", "Paskibra", "Paskibra sekolah - latihan baris berbaris", "Jumat 15:00-17:00", "Lapangan Upacara", 30),
        ("ENGC", "English Club", "Conversation, debate, public speaking", "Rabu 15:00-16:30", "Lab Bahasa", 25),
        ("ROBT", "Robotika", "Klub robotika & coding", "Sabtu 09:00-12:00", "Lab Komputer", 15),
        ("VOLY", "Voli", "Tim voli putra-putri", "Senin & Rabu 15:30-17:30", "Lapangan Voli", 24),
        ("MUSC", "Musik", "Band sekolah & musik tradisional", "Jumat 13:00-15:00", "Aula", 20),
        ("KARY", "Karya Ilmiah", "Penelitian & lomba KIR", "Kamis 14:30-16:30", "Lab IPA", 15),
    ]
    for code, name, desc, sched, loc, quota in samples:
        db.add(Extracurricular(
            org_id=org_id,
            code=code,
            name=name,
            description=desc,
            coach_id=coach_id,
            schedule_text=sched,
            location=loc,
            quota=quota,
            is_active=True,
        ))
    await db.commit()
    print(f"[ekskul] {len(samples)} ekskul dibuat")


async def seed_library(db: AsyncSession, org_id: int):
    existing = (await db.execute(select(LibraryBook).where(LibraryBook.org_id == org_id))).scalars().first()
    if existing:
        print("[library] skip — sudah ada")
        return

    samples = [
        ("LIB-001", "9789794336847", "Laskar Pelangi", "Andrea Hirata", "Bentang", 2005, "Fiksi", 5),
        ("LIB-002", "9786020385822", "Bumi Manusia", "Pramoedya Ananta Toer", "Hasta Mitra", 1980, "Fiksi", 3),
        ("LIB-003", "9786020339986", "Filosofi Teras", "Henry Manampiring", "Kompas", 2018, "Filsafat", 4),
        ("LIB-004", "9786024817602", "Atomic Habits", "James Clear", "Gramedia", 2018, "Pengembangan Diri", 6),
        ("LIB-005", "9786020385815", "Sapiens", "Yuval Noah Harari", "Gramedia", 2014, "Sejarah", 4),
        ("LIB-006", "9789794338871", "Sang Pemimpi", "Andrea Hirata", "Bentang", 2006, "Fiksi", 3),
        ("LIB-007", "9786020628677", "Algoritma & Pemrograman", "Rinaldi Munir", "Informatika", 2020, "Komputer", 5),
        ("LIB-008", "9786029481389", "Fisika Dasar", "Halliday", "Erlangga", 2019, "Sains", 8),
        ("LIB-009", "9786024624323", "Matematika SMA Kelas X", "Sukino", "Erlangga", 2020, "Matematika", 10),
        ("LIB-010", "9786027702226", "Kimia Untuk SMA", "Michael Purba", "Erlangga", 2019, "Sains", 8),
        ("LIB-011", "9786022502982", "Sejarah Indonesia", "Sardiman", "Yudhistira", 2018, "Sejarah", 6),
        ("LIB-012", "9786022914808", "Biologi Campbell", "Neil A. Campbell", "Erlangga", 2019, "Sains", 4),
        ("LIB-013", "9786020522463", "The 7 Habits of Highly Effective Teens", "Sean Covey", "Bentang", 2010, "Pengembangan Diri", 5),
        ("LIB-014", "9786022914815", "Bahasa Inggris untuk SMA", "John Smith", "Erlangga", 2020, "Bahasa", 7),
        ("LIB-015", "9786020385839", "Cantik Itu Luka", "Eka Kurniawan", "Gramedia", 2002, "Fiksi", 3),
    ]
    for code, isbn, title, author, pub, year, cat, copies in samples:
        db.add(LibraryBook(
            org_id=org_id,
            code=code,
            isbn=isbn,
            title=title,
            author=author,
            publisher=pub,
            year=year,
            category=cat,
            total_copies=copies,
            available_copies=copies,
            is_active=True,
        ))
    await db.commit()
    print(f"[library] {len(samples)} buku dibuat")


async def seed_events(db: AsyncSession, org_id: int):
    existing = (await db.execute(select(SchoolEvent).where(SchoolEvent.org_id == org_id))).scalars().first()
    if existing:
        print("[events] skip — sudah ada")
        return

    kepsek = (await db.execute(
        select(User).where(User.org_id == org_id, User.role == "super_admin").limit(1)
    )).scalar_one_or_none()
    if not kepsek:
        print("[events] skip — perlu kepsek")
        return

    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    samples = [
        ("Upacara Bendera", "Upacara mingguan setiap Senin", today + timedelta(days=2, hours=7), today + timedelta(days=2, hours=8), "Lapangan", "akademik", "all", False),
        ("UTS Semester Genap", "Ulangan Tengah Semester untuk semua kelas", today + timedelta(days=14, hours=7), today + timedelta(days=21, hours=12), "Ruang Kelas", "ujian", "siswa", False),
        ("Libur Hari Raya Idul Fitri", "Libur sekolah selama Hari Raya", today + timedelta(days=30), today + timedelta(days=37), None, "libur", "all", False),
        ("Lomba Cerdas Cermat", "LCC antar kelas, kategori IPA & IPS", today + timedelta(days=10, hours=9), today + timedelta(days=10, hours=15), "Aula", "lomba", "siswa", True),
        ("Pertemuan Wali Murid", "Rapat wali murid kelas X", today + timedelta(days=7, hours=9), today + timedelta(days=7, hours=11), "Aula", "rapat", "ortu", True),
        ("Kunjungan Industri", "Kunjungan ke pabrik untuk kelas XII", today + timedelta(days=20, hours=8), today + timedelta(days=20, hours=16), "Pabrik XYZ", "kunjungan", "siswa", True),
        ("Bakti Sosial", "Pembagian sembako ke panti asuhan", today + timedelta(days=5, hours=8), today + timedelta(days=5, hours=14), "Panti Asuhan Kasih", "lainnya", "all", False),
    ]
    for title, desc, start, end, loc, cat, aud, rsvp in samples:
        db.add(SchoolEvent(
            org_id=org_id,
            title=title,
            description=desc,
            start_at=start,
            end_at=end,
            location=loc,
            category=cat,
            audience=aud,
            requires_rsvp=rsvp,
            created_by=kepsek.id,
        ))
    await db.commit()
    print(f"[events] {len(samples)} acara dibuat")


async def main():
    async with AsyncSessionLocal() as db:
        # Auto-detect org_id (yang aktif)
        org_id = (
            await db.execute(
                select(User.org_id).where(User.role == "super_admin").limit(1)
            )
        ).scalar_one_or_none()
        if not org_id:
            print("Tidak ada super_admin. Skip.")
            return
        print(f"Seeding for org_id={org_id}")

        await seed_timetable(db, org_id)
        await seed_ekskul(db, org_id)
        await seed_library(db, org_id)
        await seed_events(db, org_id)
    print("DONE")


if __name__ == "__main__":
    asyncio.run(main())
