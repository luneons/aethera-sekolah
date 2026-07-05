"""Quiz online service.

Pisah dari `lms_service.py` agar logic quiz (scoring, anti-cheat lock)
terisolasi.
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Assignment,
    AssignmentGrade,
    QuizAttempt,
    QuizQuestion,
    User,
)


async def server_now(db: AsyncSession) -> datetime:
    """Ambil waktu sekarang dari MySQL — selalu sinkron dengan func.now() yang
    dipakai untuk created_at/updated_at default value. Mengembalikan naive
    datetime di server timezone (Asia/Jakarta di VPS).
    """
    res = await db.execute(select(func.now()))
    return res.scalar_one()


def _normalize_answer(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def grade_attempt(
    questions: list[QuizQuestion], answers: dict[str, str | int | bool | None]
) -> tuple[float, float]:
    """Hitung total raw score dari jawaban siswa.

    Returns: (raw_score, max_possible)
    """
    earned = 0.0
    total = 0.0
    for q in questions:
        total += q.points or 1.0
        ans = answers.get(str(q.id))
        if ans is None:
            continue
        if q.question_type == "mcq":
            # correct_value disimpan sebagai index opsi (string)
            if _normalize_answer(str(ans)) == _normalize_answer(q.correct_value):
                earned += q.points or 1.0
        elif q.question_type == "tf":
            if _normalize_answer(str(ans)) == _normalize_answer(q.correct_value):
                earned += q.points or 1.0
        elif q.question_type == "essay":
            # Auto-grade tidak bisa, biarkan 0; guru akan adjust manual
            pass
    return earned, total


def scale_score(raw: float, max_raw: float, max_score: float) -> float:
    if max_raw <= 0:
        return 0.0
    return round((raw / max_raw) * max_score, 2)


async def shuffle_questions_for(
    db: AsyncSession, assignment: Assignment, attempt: QuizAttempt
) -> list[QuizQuestion]:
    """Ambil pertanyaan, urutkan acak per attempt-id (deterministik per siswa)."""
    questions = (
        await db.execute(
            select(QuizQuestion)
            .where(QuizQuestion.assignment_id == assignment.id)
            .order_by(QuizQuestion.order_index, QuizQuestion.id)
        )
    ).scalars().all()
    if assignment.shuffle_questions and questions:
        rng = random.Random(attempt.id)  # seed = attempt id, deterministik
        questions = list(questions)
        rng.shuffle(questions)
    return questions


async def apply_lock(
    db: AsyncSession, attempt: QuizAttempt, lock_minutes: int
) -> None:
    """Tandai attempt ke-lock, set locked_until."""
    now = await server_now(db)
    attempt.status = "locked"
    attempt.locked_until = now + timedelta(minutes=lock_minutes)


async def auto_submit_if_finished(
    db: AsyncSession, attempt: QuizAttempt, assignment: Assignment
) -> bool:
    """Submit otomatis kalau deadline lewat. Return True kalau di-submit."""
    if attempt.status not in ("in_progress", "locked", "unlocked_by_teacher"):
        return False
    if not attempt.deadline_at:
        return False
    now = await server_now(db)
    if now < attempt.deadline_at:
        return False

    # Sudah lewat deadline → grade & submit
    questions = (
        await db.execute(
            select(QuizQuestion).where(QuizQuestion.assignment_id == assignment.id)
        )
    ).scalars().all()
    answers = attempt.answers_json or {}
    raw, total = grade_attempt(list(questions), answers)
    attempt.raw_score = raw
    attempt.final_score = scale_score(raw, total, assignment.max_score)
    attempt.status = "auto_submitted"
    attempt.submitted_at = now
    await persist_grade(db, assignment, attempt)
    return True


async def persist_grade(
    db: AsyncSession, assignment: Assignment, attempt: QuizAttempt
) -> None:
    """Tulis hasil quiz ke `assignment_grades` agar masuk hitungan GPA."""
    if attempt.final_score is None:
        return
    now = await server_now(db)
    existing = (
        await db.execute(
            select(AssignmentGrade).where(
                AssignmentGrade.assignment_id == assignment.id,
                AssignmentGrade.student_id == attempt.student_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        existing.score = attempt.final_score
        existing.source = "manual"
        existing.note = "Quiz online (auto-graded)"
        existing.graded_at = now
    else:
        db.add(
            AssignmentGrade(
                assignment_id=assignment.id,
                student_id=attempt.student_id,
                score=attempt.final_score,
                source="manual",
                graded_by=assignment.teacher_id,
                note="Quiz online (auto-graded)",
            )
        )
    await db.flush()
