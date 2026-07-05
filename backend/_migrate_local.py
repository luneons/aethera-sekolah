"""Auto-migrate lokal: sinkronkan schema DB dengan semua model SQLAlchemy.

Strategi:
1. create_all → bikin TABEL yang belum ada (aman, tidak sentuh tabel existing).
2. Bandingkan kolom tiap model vs kolom aktual di DB → ALTER ADD kolom yang hilang.

Type mapping best-effort dari tipe SQLAlchemy ke DDL MySQL.
Idempotent & aman dijalankan berkali-kali.
"""
import os
import re
import asyncio
import pymysql
from dotenv import load_dotenv

load_dotenv()

# Import semua model + engine
from app.database import Base, init_db  # noqa: E402
import app.models  # noqa: F401,E402  (register semua model ke Base.metadata)

url = os.getenv("DATABASE_URL", "")
m = re.match(r"mysql\+aiomysql://([^:]+):([^@]*)@([^:]+):(\d+)/(.+)", url)
if not m:
    raise SystemExit(f"Gagal parse DATABASE_URL: {url}")

DB = m.group(5)
conn = pymysql.connect(
    host=m.group(3), port=int(m.group(4)),
    user=m.group(1), password=m.group(2), database=DB,
)
cur = conn.cursor()


# 1. create_all untuk tabel yang belum ada
print("== Step 1: create_all (tabel baru) ==")
asyncio.run(init_db())
print("  OK")


def db_columns(table: str) -> set[str]:
    cur.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s",
        (DB, table),
    )
    return {r[0] for r in cur.fetchall()}


def table_exists(table: str) -> bool:
    cur.execute(
        "SELECT COUNT(*) FROM information_schema.TABLES "
        "WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s",
        (DB, table),
    )
    return cur.fetchone()[0] > 0


def ddl_for(col) -> str:
    """Map kolom SQLAlchemy → DDL MySQL (best-effort)."""
    t = col.type
    tname = type(t).__name__
    sql_type = "VARCHAR(255)"
    if tname in ("Integer", "SmallInteger"):
        sql_type = "INT"
    elif tname == "BigInteger":
        sql_type = "BIGINT"
    elif tname == "Boolean":
        sql_type = "TINYINT(1)"
    elif tname == "Float":
        sql_type = "DOUBLE"
    elif tname == "DateTime":
        sql_type = "DATETIME"
    elif tname == "Date":
        sql_type = "DATE"
    elif tname == "Time":
        sql_type = "TIME"
    elif tname == "Text":
        sql_type = "TEXT"
    elif tname == "JSON":
        sql_type = "JSON"
    elif tname == "LargeBinary":
        sql_type = "LONGBLOB"
    elif tname == "String":
        length = getattr(t, "length", 255) or 255
        sql_type = f"VARCHAR({length})"
    elif tname == "Enum":
        vals = ",".join(f"'{v}'" for v in t.enums)
        sql_type = f"ENUM({vals})"

    parts = [sql_type]
    if not col.nullable:
        parts.append("NULL")  # tambah NULL dulu supaya aman utk existing rows
    return " ".join(parts)


print("\n== Step 2: ALTER kolom yang hilang ==")
added_total = 0
for table_name, table in Base.metadata.tables.items():
    if not table_exists(table_name):
        # sudah dibuat create_all, skip
        continue
    existing = db_columns(table_name)
    for col in table.columns:
        if col.name not in existing:
            ddl = ddl_for(col)
            try:
                cur.execute(f"ALTER TABLE `{table_name}` ADD COLUMN `{col.name}` {ddl}")
                print(f"  + {table_name}.{col.name}  ({ddl})")
                added_total += 1
            except Exception as e:
                print(f"  ! GAGAL {table_name}.{col.name}: {e}")

conn.commit()
print(f"\nSELESAI — {added_total} kolom ditambahkan.")
conn.close()
