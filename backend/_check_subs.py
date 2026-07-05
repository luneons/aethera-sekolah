"""Diagnostik: list semua push subscription + jenis endpoint."""
import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import PushSubscription, User


async def main():
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(PushSubscription))).scalars().all()
        print(f"Total subscriptions: {len(rows)}")
        for r in rows:
            u = await db.get(User, r.user_id)
            ep = r.endpoint
            ua = (r.user_agent or "")[:80]
            if "fcm.googleapis.com" in ep:
                kind = "FCM(Android/Chrome)"
            elif "apple" in ep:
                kind = "APNs(iOS Safari)"
            elif "mozilla" in ep:
                kind = "Mozilla(Firefox)"
            else:
                kind = "Other"
            uname = u.full_name if u else "?"
            print(f"  user=#{r.user_id} {uname} | {kind}")
            print(f"    UA      : {ua}")
            print(f"    last    : {r.last_used_at}")
            print(f"    endpoint: {ep[:90]}...")


if __name__ == "__main__":
    asyncio.run(main())
