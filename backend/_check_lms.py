import asyncio
from sqlalchemy import select, func
from app.database import AsyncSessionLocal
from app.models import TeachingAssignment, Assignment, Subject


async def main():
    async with AsyncSessionLocal() as db:
        ta = (await db.execute(select(func.count(TeachingAssignment.id)))).scalar_one()
        asg = (await db.execute(select(func.count(Assignment.id)))).scalar_one()
        subj = (await db.execute(select(func.count(Subject.id)))).scalar_one()
        print(f"subjects={subj}  teaching_assignments={ta}  assignments={asg}")


asyncio.run(main())
