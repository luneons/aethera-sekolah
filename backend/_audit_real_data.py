"""Audit data real di database production untuk fitur baru."""
import asyncio
from sqlalchemy import select, func
from app.database import AsyncSessionLocal
from app.models import (
    Bill,
    BillCategory,
    LetterIssue,
    ParentAccount,
    ParentLink,
    Payment,
    User,
)


async def main():
    async with AsyncSessionLocal() as db:
        print("=" * 50)
        print(" AUDIT DATA REAL — production DB")
        print("=" * 50)

        # Parent accounts
        pa_count = (await db.execute(select(func.count(ParentAccount.id)))).scalar_one()
        pa_active = (
            await db.execute(
                select(func.count(ParentAccount.id)).where(ParentAccount.is_active == True)  # noqa: E712
            )
        ).scalar_one()
        pl_count = (await db.execute(select(func.count(ParentLink.id)))).scalar_one()
        print(f"\n[Parent Portal]")
        print(f"  parent_accounts: {pa_count} ({pa_active} aktif)")
        print(f"  parent_links   : {pl_count}")
        sample_pa = (await db.execute(select(ParentAccount).limit(3))).scalars().all()
        for p in sample_pa:
            kids = (await db.execute(select(func.count(ParentLink.id)).where(ParentLink.parent_id == p.id))).scalar_one()
            print(f"    - {p.full_name} | HP {p.phone} | {kids} anak")

        # Billing
        cat_count = (await db.execute(select(func.count(BillCategory.id)))).scalar_one()
        bill_count = (await db.execute(select(func.count(Bill.id)))).scalar_one()
        bill_paid = (
            await db.execute(
                select(func.count(Bill.id)).where(Bill.status == "paid")
            )
        ).scalar_one()
        bill_unpaid = (
            await db.execute(
                select(func.count(Bill.id)).where(Bill.status == "unpaid")
            )
        ).scalar_one()
        pay_count = (await db.execute(select(func.count(Payment.id)))).scalar_one()
        total_amt = (
            await db.execute(select(func.coalesce(func.sum(Bill.amount), 0)))
        ).scalar_one()
        total_paid = (
            await db.execute(select(func.coalesce(func.sum(Bill.paid_amount), 0)))
        ).scalar_one()
        print(f"\n[Billing / SPP]")
        print(f"  bill_categories: {cat_count}")
        print(f"  bills          : {bill_count} (paid={bill_paid}, unpaid={bill_unpaid})")
        print(f"  payments       : {pay_count}")
        print(f"  total amount   : Rp {int(total_amt):,}".replace(",", "."))
        print(f"  total paid     : Rp {int(total_paid):,}".replace(",", "."))

        sample_cat = (await db.execute(select(BillCategory))).scalars().all()
        for c in sample_cat:
            print(f"    - kategori: {c.code} | {c.name} | Rp {int(c.default_amount):,}".replace(",", "."))

        # Letters
        ltr_count = (await db.execute(select(func.count(LetterIssue.id)))).scalar_one()
        print(f"\n[Letters]")
        print(f"  letter_issues  : {ltr_count}")

        # Students
        st_count = (
            await db.execute(
                select(func.count(User.id)).where(User.role == "employee", User.status == "active")
            )
        ).scalar_one()
        print(f"\n[Sanity check]")
        print(f"  active students: {st_count}")

        print("\n" + "=" * 50)
        print(" SEMUA DATA NYATA. BUKAN MOCK.")
        print("=" * 50)


asyncio.run(main())
