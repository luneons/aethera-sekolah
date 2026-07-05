#!/bin/bash
# =============================================================================
# Aethera Database Setup
# Jalankan setelah setup_vps.sh
# =============================================================================

set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
info() { echo -e "${BLUE}[→]${NC} $1"; }

echo ""
echo "=============================================="
echo "   Aethera Database Setup"
echo "=============================================="
echo ""

# ── Generate password acak ────────────────────────────────────────────────────
DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 20)
DB_NAME="aethera"
DB_USER="aethera_user"

info "Membuat database MySQL..."

# Jalankan sebagai root MySQL
mysql -u root << EOF
-- Buat database
CREATE DATABASE IF NOT EXISTS ${DB_NAME}
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

-- Buat user khusus (lebih aman dari root)
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';

-- Beri akses penuh ke database Aethera
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';

-- Flush privileges
FLUSH PRIVILEGES;

SELECT 'Database setup selesai!' AS status;
EOF

log "Database '${DB_NAME}' dibuat"
log "User '${DB_USER}' dibuat"

# ── Simpan kredensial ke file ──────────────────────────────────────────────────
CRED_FILE="/home/luneons/aethera_db_credentials.txt"
cat > "$CRED_FILE" << EOF
# Aethera Database Credentials
# SIMPAN FILE INI DI TEMPAT AMAN!
# Generated: $(date)

DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_HOST=localhost
DB_PORT=3306

# Connection string untuk .env backend:
DATABASE_URL=mysql+aiomysql://${DB_USER}:${DB_PASSWORD}@localhost:3306/${DB_NAME}
EOF
chmod 600 "$CRED_FILE"

log "Kredensial disimpan di: $CRED_FILE"

echo ""
echo "=============================================="
echo "   Database Siap!"
echo "=============================================="
echo ""
echo "Database  : ${DB_NAME}"
echo "User      : ${DB_USER}"
echo "Password  : ${DB_PASSWORD}"
echo ""
echo "DATABASE_URL untuk .env:"
echo "mysql+aiomysql://${DB_USER}:${DB_PASSWORD}@localhost:3306/${DB_NAME}"
echo ""
warn "Catat password di atas! Tersimpan juga di: $CRED_FILE"
echo ""
