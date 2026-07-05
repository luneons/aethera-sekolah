"""Reset semua attempt quiz yang udah broken (deadline-nya kacau karena bug TZ).

Idempotent: hapus semua attempt, biar siswa bisa start fresh.
"""
import asyncio
import sys

from sqlalchemy import delete

from app.database import AsyncSessionLocal
from app.models import QuizAttempt


async def main():
    async with AsyncSessionLocal() as db:
        result = await db.execute(delete(QuizAttempt))
        await db.commit()
        print(f"Deleted {result.rowcount} attempts.")


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
