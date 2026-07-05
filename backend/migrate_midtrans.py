"""Migration: tambah kolom Midtrans ke tabel bills."""
import pymysql

conn = pymysql.connect(
    host='localhost', port=3306,
    user='aethera_user', password='AetheraStrong2026Secret!',
    database='aethera'
)
cur = conn.cursor()


def col_exists(table: str, col: str) -> bool:
    cur.execute("""
        SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'aethera'
          AND TABLE_NAME = %s AND COLUMN_NAME = %s
    """, (table, col))
    return cur.fetchone()[0] > 0


cols = [
    ("midtrans_order_id", "VARCHAR(100) NULL"),
    ("midtrans_token", "VARCHAR(255) NULL"),
    ("midtrans_redirect_url", "VARCHAR(500) NULL"),
    ("midtrans_status", "VARCHAR(40) NULL"),
    ("midtrans_token_at", "DATETIME NULL"),
]

for name, ddl in cols:
    if not col_exists("bills", name):
        cur.execute(f"ALTER TABLE bills ADD COLUMN {name} {ddl}")
        print(f"Added bills.{name}")
    else:
        print(f"bills.{name} exists")

# Index untuk lookup webhook by order_id
cur.execute("""
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = 'aethera' AND TABLE_NAME = 'bills'
      AND INDEX_NAME = 'ix_bills_midtrans_order_id'
""")
if cur.fetchone()[0] == 0:
    cur.execute("CREATE INDEX ix_bills_midtrans_order_id ON bills (midtrans_order_id)")
    print("Created index ix_bills_midtrans_order_id")
else:
    print("Index exists")

conn.commit()
print("Migration done")
conn.close()
