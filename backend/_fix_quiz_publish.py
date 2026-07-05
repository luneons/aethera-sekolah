"""Sync existing quiz: yang sudah ada soalnya tetap published, yang kosong jadi draft."""
import asyncio
import sys

from sqlalchemy import select, func, update

from app.database import AsyncSessionLocal
from app.models import Assignment, QuizQuestion


async def main():
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(Assignment).where(Assignment.mode == "quiz")
            )
        ).scalars().all()
        published = 0
        draft = 0
        for asg in rows:
            count = (
                await db.execute(
                    select(func.count(QuizQuestion.id)).where(
                        QuizQuestion.assignment_id == asg.id
                    )
                )
            ).scalar_one() or 0
            if count == 0:
                if asg.is_published:
                    asg.is_published = False
                    draft += 1
            else:
                if not asg.is_published:
                    asg.is_published = True
                    published += 1
        await db.commit()
        print(f"Synced {len(rows)} quiz: +{published} dipublish (sudah ada soal), {draft} di-draft (kosong).")


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
