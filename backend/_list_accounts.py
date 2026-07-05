"""Quick script untuk list semua akun login di DB."""
import asyncio
import sys

from sqlalchemy import select

from app.database import AsyncSessionLocal, engine
from app.models import SchoolClass, User


async def main():
    async with AsyncSessionLocal() as db:
        users = (
            await db.execute(select(User).order_by(User.role, User.full_name))
        ).scalars().all()

        by_role: dict[str, list] = {}
        for u in users:
            by_role.setdefault(u.role, []).append(u)

        for role in ("super_admin", "admin", "hr", "employee"):
            if role not in by_role:
                continue
            print(f"\n=== {role.upper()} ({len(by_role[role])}) ===")
            for u in by_role[role][:10]:
                extra = ""
                if u.homeroom_class_id:
                    c = await db.get(SchoolClass, u.homeroom_class_id)
                    extra = f" [wali {c.name}]" if c else ""
                elif u.school_class_id:
                    c = await db.get(SchoolClass, u.school_class_id)
                    extra = f" [kelas {c.name}]" if c else ""
                email = u.email or "-"
                print(f"  {u.full_name:<35} {email:<45}{extra}")
            if len(by_role[role]) > 10:
                print(f"  ... dan {len(by_role[role]) - 10} lagi")

    await engine.dispose()


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
