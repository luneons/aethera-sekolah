"""Test fixtures: in-memory SQLite + httpx async client.

Strategi:
- Override `get_db` di FastAPI dependency injection biar test pakai DB sementara.
- Pakai aiosqlite dengan StaticPool agar 1 connection di-reuse antar request
  (in-memory SQLite per process).
- Setiap test fungsi dapat session bersih (rollback per-test bukan create-drop
  per-test agar cepat).
"""
from __future__ import annotations

import asyncio
import os
from typing import AsyncGenerator

# Set test env BEFORE importing app — pakai os.environ langsung (bukan setdefault)
# karena .env file di project bisa override. Test selalu pakai SQLite.
os.environ["APP_ENV"] = "test"
os.environ["SECRET_KEY"] = "test-secret-key-for-pytest-only-dont-use-in-prod"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["CORS_ORIGINS"] = "http://localhost:3000"
os.environ["EMBEDDING_ENCRYPTION_KEY"] = "test-encryption-key-32bytes-pad!"
os.environ["VAPID_PUBLIC_KEY"] = ""
os.environ["VAPID_PRIVATE_KEY"] = ""
os.environ["OPENROUTER_API_KEY"] = ""
os.environ["GEOFENCE_ENABLED"] = "false"

# Hapus .env file yang mungkin ada di working dir untuk test
# (pydantic-settings env vars override file values, tapi defensive)
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


# ─── Engine & Session ──────────────────────────────────────────────────────


@pytest_asyncio.fixture(autouse=True)
async def _reset_rate_limiters():
    """Reset all rate limiters between tests biar tidak ada residual state."""
    from app.services.rate_limiter import reset_all_limiters
    reset_all_limiters()
    yield
    reset_all_limiters()


@pytest_asyncio.fixture(scope="function")
async def engine():
    """Fresh in-memory engine per test (full isolation)."""
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    # Import models so create_all picks them up
    from app import models  # noqa: F401
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def db_session(engine) -> AsyncGenerator[AsyncSession, None]:
    """Per-test session. Rollback at end so tests are isolated."""
    sess_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with sess_maker() as sess:
        yield sess
        # Rollback any uncommitted changes (commit dilakukan dalam endpoint)
        # Plus DELETE FROM all tables agar isolated
        await sess.rollback()


@pytest_asyncio.fixture
async def client(engine) -> AsyncGenerator[AsyncClient, None]:
    """HTTP client untuk hit endpoint. Override `get_db` ke session test."""
    sess_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with sess_maker() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ─── Helpers ────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def seed_kepsek(db_session: AsyncSession):
    """Buat user kepsek + auth untuk testing."""
    from app.models import Organization, User, UserAuth
    from app.security import hash_password

    # Org dulu
    org = Organization(
        name="Test School",
        organization_mode="school",
        slug="test-school",
    )
    db_session.add(org)
    await db_session.flush()

    user = User(
        org_id=org.id,
        employee_id="KS-001",
        full_name="Pak Kepsek",
        email="kepsek@test.id",
        role="super_admin",
        status="active",
    )
    db_session.add(user)
    await db_session.flush()
    db_session.add(UserAuth(user_id=user.id, password_hash=hash_password("password123")))
    await db_session.commit()
    return user


@pytest_asyncio.fixture
async def seed_student(db_session: AsyncSession, seed_kepsek):
    """Buat siswa di org yang sama dengan kepsek."""
    from app.models import User, UserAuth
    from app.security import hash_password

    user = User(
        org_id=seed_kepsek.org_id,
        employee_id="STD-001",
        full_name="Budi Siswa",
        email="budi@test.id",
        role="employee",
        status="active",
    )
    db_session.add(user)
    await db_session.flush()
    db_session.add(UserAuth(user_id=user.id, password_hash=hash_password("password123")))
    await db_session.commit()
    return user
