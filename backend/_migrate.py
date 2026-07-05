"""One-shot migration helper.

Idempotent — jalankan kapanpun setelah tambah model baru.
"""
import asyncio
import sys

from sqlalchemy import text

from app.database import engine, init_db


# (table, column, ddl) — tambahkan di sini setiap kolom baru.
COLUMN_ADDITIONS = [
    ("discipline_profiles", "xp_total", "ALTER TABLE discipline_profiles ADD COLUMN xp_total INT DEFAULT 0"),
    ("discipline_profiles", "level_code", "ALTER TABLE discipline_profiles ADD COLUMN level_code VARCHAR(20) DEFAULT 'pemula'"),
    ("users", "homeroom_class_id", "ALTER TABLE users ADD COLUMN homeroom_class_id INT NULL"),
    ("assignments", "mode", "ALTER TABLE assignments ADD COLUMN mode VARCHAR(20) DEFAULT 'manual' NOT NULL"),
    ("assignments", "duration_minutes", "ALTER TABLE assignments ADD COLUMN duration_minutes INT NULL"),
    ("assignments", "max_focus_violations", "ALTER TABLE assignments ADD COLUMN max_focus_violations SMALLINT DEFAULT 2"),
    ("assignments", "lock_duration_minutes", "ALTER TABLE assignments ADD COLUMN lock_duration_minutes SMALLINT DEFAULT 10"),
    ("assignments", "shuffle_questions", "ALTER TABLE assignments ADD COLUMN shuffle_questions TINYINT(1) DEFAULT 1"),
    ("assignments", "show_score_immediately", "ALTER TABLE assignments ADD COLUMN show_score_immediately TINYINT(1) DEFAULT 1"),
    ("assignments", "open_at", "ALTER TABLE assignments ADD COLUMN open_at DATETIME NULL"),
    ("assignments", "close_at", "ALTER TABLE assignments ADD COLUMN close_at DATETIME NULL"),

    # Audit P0 — brute-force protection untuk akun ortu
    ("parent_accounts", "failed_attempts", "ALTER TABLE parent_accounts ADD COLUMN failed_attempts SMALLINT DEFAULT 0"),
    ("parent_accounts", "locked_until", "ALTER TABLE parent_accounts ADD COLUMN locked_until DATETIME NULL"),

    # 2FA TOTP fields
    ("user_auth", "totp_enabled", "ALTER TABLE user_auth ADD COLUMN totp_enabled TINYINT(1) DEFAULT 0 NOT NULL"),
    ("user_auth", "recovery_codes_json", "ALTER TABLE user_auth ADD COLUMN recovery_codes_json JSON NULL"),
]


async def column_exists(conn, table: str, column: str) -> bool:
    result = await conn.execute(
        text(
            """
            SELECT COUNT(*)
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = :tbl
              AND COLUMN_NAME = :col
            """
        ),
        {"tbl": table, "col": column},
    )
    return (result.scalar() or 0) > 0


async def main():
    await init_db()
    print("[1/2] schema sync (create_all) OK")

    async with engine.begin() as conn:
        for table, column, ddl in COLUMN_ADDITIONS:
            if await column_exists(conn, table, column):
                print(f"[skip] {table}.{column} already exists")
            else:
                await conn.execute(text(ddl))
                print(f"[add ] {table}.{column}")

    await engine.dispose()
    print("DONE")


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
