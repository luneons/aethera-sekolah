"""Seed contoh Quiz Online untuk demo.

Idempotent. Strategi:
1. Pilih (teacher, subject, class) unik dari `assignments` yang sudah ada
   (hasil _seed_all_grades.py).
2. Untuk tiap kombinasi, bikin 1 quiz mode='quiz' + soal-soalnya.
"""
from __future__ import annotations

import asyncio
import sys
from datetime import date, datetime, timedelta

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import (
    Assignment,
    QuizQuestion,
    SchoolClass,
    Subject,
    User,
)


SAMPLE_TEMPLATES = {
    "MTK": [
        ("Berapa hasil dari 7 × 8?", ["54", "56", "58", "63"], "1"),
        ("Akar kuadrat dari 144 adalah…", ["10", "11", "12", "14"], "2"),
        ("2/3 + 1/6 = ?", ["3/9", "5/6", "1/2", "2/9"], "1"),
        ("Bentuk paling sederhana dari 18/24 adalah…", ["2/3", "3/4", "4/5", "5/6"], "1"),
        ("Sudut total dalam segitiga adalah…", ["90°", "180°", "270°", "360°"], "1"),
    ],
    "IPA": [
        ("Air mendidih di tekanan 1 atm pada suhu…", ["80°C", "90°C", "100°C", "110°C"], "2"),
        ("Planet terdekat dengan matahari adalah…", ["Bumi", "Venus", "Merkurius", "Mars"], "2"),
        ("Gas yang dibutuhkan tumbuhan untuk fotosintesis…", ["O2", "CO2", "N2", "H2"], "1"),
        ("Satuan SI untuk gaya adalah…", ["Joule", "Pascal", "Newton", "Watt"], "2"),
        ("Organ tubuh manusia yang memompa darah…", ["Paru-paru", "Hati", "Jantung", "Ginjal"], "2"),
    ],
    "BIN": [
        ("Imbuhan 'me-' yang melebur di kata 'pukul' menjadi…", ["mempukul", "memukul", "menpukul", "mengukul"], "1"),
        ("Sinonim kata 'cepat' adalah…", ["lambat", "kilat", "lelah", "biasa"], "1"),
        ("Kalimat berikut menggunakan ejaan baku: …", [
            "Aku pergi kepasar",
            "Aku pergi ke pasar",
            "Aku pergi ke-pasar",
            "Aku pergi ke pasar.",
        ], "3"),
        ("Antonim dari 'rajin' adalah…", ["giat", "tekun", "malas", "sibuk"], "2"),
        ("Karangan yang menceritakan suatu peristiwa disebut…", ["argumentasi", "narasi", "deskripsi", "eksposisi"], "1"),
    ],
    "ENG": [
        ("Past tense of 'go' is…", ["goed", "gone", "went", "going"], "2"),
        ("Synonym for 'big' is…", ["small", "tiny", "huge", "thin"], "2"),
        ("She ___ a teacher.", ["are", "is", "am", "be"], "1"),
        ("Plural of 'child' is…", ["childs", "childes", "children", "childrens"], "2"),
        ("'Apple' in Indonesian is…", ["jeruk", "apel", "anggur", "mangga"], "1"),
    ],
    "SEJ": [
        ("Proklamasi kemerdekaan Indonesia tanggal…", ["17 Agustus 1945", "27 Agustus 1945", "17 Juli 1945", "1 Oktober 1945"], "0"),
        ("Presiden pertama Indonesia adalah…", ["Soeharto", "Sukarno", "BJ Habibie", "Megawati"], "1"),
        ("Ibukota Indonesia berada di provinsi…", ["DKI Jakarta", "Banten", "Jawa Barat", "Jawa Tengah"], "0"),
        ("Sumpah Pemuda dicetuskan pada tahun…", ["1908", "1928", "1945", "1950"], "1"),
        ("Negara yang menjajah Indonesia paling lama adalah…", ["Jepang", "Inggris", "Belanda", "Portugis"], "2"),
    ],
}

TF_TEMPLATE = ("Aplikasi Aethera dapat memberikan notifikasi push ke HP siswa.", "true")


async def main():
    async with AsyncSessionLocal() as db:
        # Ambil kombinasi (subject, class, teacher) unik dari assignments existing.
        # Kalau subject_code-nya tidak ada di template, fallback ke MTK.
        rows = (
            await db.execute(
                select(Assignment, Subject, SchoolClass, User)
                .join(Subject, Assignment.subject_id == Subject.id)
                .join(SchoolClass, Assignment.school_class_id == SchoolClass.id)
                .join(User, Assignment.teacher_id == User.id)
                .where(Assignment.mode == "manual")
                .order_by(SchoolClass.name)
            )
        ).all()

        if not rows:
            print(
                "Tidak ada assignments. Jalankan _seed_all_grades.py atau buat tugas manual dulu."
            )
            return

        seen: set[tuple[int, int, int]] = set()
        added = 0
        skipped = 0

        for asg, subject, cls, teacher in rows:
            key = (subject.id, cls.id, teacher.id)
            if key in seen:
                continue
            seen.add(key)

            template = SAMPLE_TEMPLATES.get(subject.code, SAMPLE_TEMPLATES["MTK"])
            title = f"Quiz Online - {subject.code} {cls.name}"

            existing = (
                await db.execute(
                    select(Assignment).where(
                        Assignment.title == title,
                        Assignment.school_class_id == cls.id,
                        Assignment.subject_id == subject.id,
                    )
                )
            ).scalar_one_or_none()
            if existing:
                skipped += 1
                continue

            new_asg = Assignment(
                org_id=teacher.org_id,
                teacher_id=teacher.id,
                subject_id=subject.id,
                school_class_id=cls.id,
                title=title,
                description="Quiz online dengan timer & anti-cheat. Jangan keluar layar.",
                assignment_type="kuis",
                max_score=100.0,
                weight=1.0,
                due_date=date.today() + timedelta(days=14),
                is_published=True,
                mode="quiz",
                duration_minutes=15,
                max_focus_violations=2,
                lock_duration_minutes=10,
                shuffle_questions=True,
                show_score_immediately=True,
                open_at=datetime.utcnow() - timedelta(hours=1),
                close_at=datetime.utcnow() + timedelta(days=14),
            )
            db.add(new_asg)
            await db.flush()

            for idx, (body, opts, correct) in enumerate(template):
                db.add(
                    QuizQuestion(
                        assignment_id=new_asg.id,
                        order_index=idx,
                        question_type="mcq",
                        body=body,
                        options=opts,
                        correct_value=correct,
                        points=15.0,
                    )
                )
            db.add(
                QuizQuestion(
                    assignment_id=new_asg.id,
                    order_index=len(template),
                    question_type="tf",
                    body=TF_TEMPLATE[0],
                    correct_value=TF_TEMPLATE[1],
                    points=25.0,
                )
            )
            added += 1
            print(f"  [+] {title} ({len(template)+1} soal)")

        await db.commit()
        print(f"\nDONE: +{added} quiz, {skipped} skipped (sudah ada).")


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
