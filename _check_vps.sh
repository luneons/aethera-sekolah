#!/bin/bash
cd /var/www/aethera/backend
source .venv/bin/activate

python << 'EOF'
import asyncio, sys
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from sqlalchemy import select, func
from app.database import AsyncSessionLocal, engine
from app.models import Assignment, AssignmentGrade, User, Organization

async def go():
    async with AsyncSessionLocal() as db:
        orgs = (await db.execute(select(Organization))).scalars().all()
        print(f"Orgs: {len(orgs)}")
        for o in orgs:
            print(f"  org_id={o.id} name={o.name!r} mode={o.organization_mode}")
        
        a = (await db.execute(select(func.count()).select_from(Assignment))).scalar()
        g = (await db.execute(select(func.count()).select_from(AssignmentGrade))).scalar()
        u = (await db.execute(select(func.count()).select_from(User).where(User.role == "employee"))).scalar()
        print(f"Assignments: {a}")
        print(f"Grades: {g}")
        print(f"Students: {u}")
    await engine.dispose()

asyncio.run(go())
EOF

deactivate
