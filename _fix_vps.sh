#!/bin/bash
# Fix VPS: pastikan semua data ada di org yang benar
cd /var/www/aethera/backend
source .venv/bin/activate

echo "=== Fix VPS Data ==="

# 1. Jalankan seed SIMMICO (idempotent)
echo "[1/3] Seed SIMMICO..."
python -m app.seed_simmico 2>&1 | tail -10

# 2. Seed nilai semua kelas
echo "[2/3] Seed nilai..."
python _seed_all_grades.py 2>&1 | tail -5

# 3. Seed kehadiran
echo "[3/3] Seed kehadiran..."
python _seed_attendance_demo.py 2>&1 | tail -5

# 4. Cek hasil
python << 'EOF'
import asyncio
from sqlalchemy import select, func
from app.database import AsyncSessionLocal, engine
from app.models import Assignment, AssignmentGrade, User, Organization, AttendanceRecord

async def go():
    async with AsyncSessionLocal() as db:
        orgs = (await db.execute(select(Organization))).scalars().all()
        for o in orgs:
            students = (await db.execute(select(func.count()).select_from(User).where(User.org_id == o.id, User.role == "employee"))).scalar()
            assignments = (await db.execute(select(func.count()).select_from(Assignment).where(Assignment.org_id == o.id))).scalar()
            grades = (await db.execute(select(func.count()).select_from(AssignmentGrade).join(Assignment, Assignment.id == AssignmentGrade.assignment_id).where(Assignment.org_id == o.id))).scalar()
            attendance = (await db.execute(select(func.count()).select_from(AttendanceRecord).join(User, User.id == AttendanceRecord.user_id).where(User.org_id == o.id))).scalar()
            print(f"Org {o.id} ({o.name!r}): {students} siswa, {assignments} tugas, {grades} nilai, {attendance} kehadiran")
    await engine.dispose()

asyncio.run(go())
EOF

deactivate
echo "=== Selesai ==="
