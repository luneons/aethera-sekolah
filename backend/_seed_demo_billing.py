"""Seed kategori tagihan + bills demo untuk SMK Aethera Demo.

Idempotent. Bikin:
- Kategori: SPP (Rp 500.000/bulan), UANG_GEDUNG (Rp 2jt/tahun), KEGIATAN (Rp 250rb/tahun)
- Tagihan SPP untuk bulan ini ke semua siswa
- 30% sudah lunas (random)
- 10% lewat tempo
"""
from __future__ import annotations

import asyncio
import random
import sys
from datetime import date, datetime, timedelta

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import (
    Bill,
    BillCategory,
    Organization,
    Payment,
    User,
)


CATEGORIES = [
    {
        "code": "SPP", "name": "SPP Bulanan",
        "default_amount": 500000, "recurring": "monthly",
        "description": "Biaya sumbangan pendidikan bulanan",
    },
    {
        "code": "GEDUNG", "name": "Uang Gedung Tahunan",
        "default_amount": 2000000, "recurring": "yearly",
        "description": "Pembangunan & perbaikan fasilitas",
    },
    {
        "code": "KEGIATAN", "name": "Iuran Kegiatan",
        "default_amount": 250000, "recurring": "yearly",
        "description": "Studi banding, pentas seni, dll",
    },
]


async def main():
    async with AsyncSessionLocal() as db:
        org = (await db.execute(select(Organization).limit(1))).scalar_one_or_none()
        if not org:
            print("No organization found.")
            return

        # 1. Categories
        cat_map: dict[str, BillCategory] = {}
        for c in CATEGORIES:
            existing = (
                await db.execute(
                    select(BillCategory).where(
                        BillCategory.org_id == org.id,
                        BillCategory.code == c["code"],
                    )
                )
            ).scalar_one_or_none()
            if existing:
                cat_map[c["code"]] = existing
                continue
            cat = BillCategory(
                org_id=org.id,
                **c,
            )
            db.add(cat)
            await db.flush()
            cat_map[c["code"]] = cat
            print(f"  [+] kategori {c['code']}")

        await db.commit()

        # 2. Bills SPP untuk bulan ini
        spp = cat_map["SPP"]
        today = date.today()
        period = f"{today.year}-{today.month:02d}"
        due = today.replace(day=10) + timedelta(days=30) if today.day < 10 else today.replace(day=10).replace(month=today.month + 1 if today.month < 12 else 1)

        students = (
            await db.execute(
                select(User).where(
                    User.org_id == org.id,
                    User.role == "employee",
                    User.status == "active",
                )
            )
        ).scalars().all()

        created = 0
        skipped = 0
        rng = random.Random(42)

        for s in students:
            existing = (
                await db.execute(
                    select(Bill).where(
                        Bill.student_id == s.id,
                        Bill.category_id == spp.id,
                        Bill.period == period,
                    )
                )
            ).scalar_one_or_none()
            if existing:
                skipped += 1
                continue
            b = Bill(
                org_id=org.id,
                student_id=s.id,
                category_id=spp.id,
                period=period,
                amount=spp.default_amount,
                due_date=due,
                status="unpaid",
            )
            db.add(b)
            await db.flush()

            # 30% chance lunas
            if rng.random() < 0.3:
                pay = Payment(
                    bill_id=b.id,
                    amount=b.amount,
                    method=rng.choice(["cash", "transfer", "qris"]),
                    payment_ref=f"DEMO-{rng.randint(1000, 9999)}",
                )
                db.add(pay)
                b.paid_amount = b.amount
                b.status = "paid"
                b.paid_at = datetime.utcnow() - timedelta(days=rng.randint(1, 15))

            created += 1

        await db.commit()
        print(f"\nDONE: +{created} tagihan SPP {period}, {skipped} sudah ada.")
        print(f"      Status: 30% lunas (random), 70% belum lunas.")


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
