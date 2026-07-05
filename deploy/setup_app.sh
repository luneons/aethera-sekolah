#!/bin/bash
# =============================================================================
# Aethera Application Setup
# Jalankan dari direktori /var/www/aethera
# =============================================================================

set -e

APP_DIR="/var/www/aethera"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
info() { echo -e "${BLUE}[→]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "=============================================="
echo "   Aethera App Setup"
echo "=============================================="
echo ""

# ── Cek direktori ─────────────────────────────────────────────────────────────
[ -d "$APP_DIR/backend" ] || err "Direktori backend tidak ditemukan di $APP_DIR"
[ -d "$APP_DIR/frontend" ] || err "Direktori frontend tidak ditemukan di $APP_DIR"

# ── Baca kredensial DB ────────────────────────────────────────────────────────
if [ -f "/home/luneons/aethera_db_credentials.txt" ]; then
    source /home/luneons/aethera_db_credentials.txt
    info "Kredensial DB dibaca dari /home/luneons/aethera_db_credentials.txt"
else
    warn "File kredensial tidak ditemukan. Masukkan manual:"
    read -p "DB_USER: " DB_USER
    read -s -p "DB_PASSWORD: " DB_PASSWORD; echo
    DB_NAME="aethera"
fi

# ── Generate secret key ───────────────────────────────────────────────────────
SECRET_KEY=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -base64 32 | head -c 32)

# ── Setup Backend ─────────────────────────────────────────────────────────────
info "Setup backend Python..."
cd "$APP_DIR/backend"

# Buat virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Upgrade pip
pip install --upgrade pip -q

# Install dependencies
info "Install Python dependencies (ini butuh beberapa menit)..."
pip install -r requirements.txt -q
log "Python dependencies terinstall"

# Buat direktori storage
mkdir -p storage/snapshots
chown -R luneons:luneons storage/

# Buat .env production
cat > .env << EOF
APP_NAME=Aethera
APP_ENV=production
SECRET_KEY=${SECRET_KEY}
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=14

# Database
DATABASE_URL=mysql+aiomysql://${DB_USER}:${DB_PASSWORD}@localhost:3306/${DB_NAME}

# CORS — akan diupdate setelah domain dikonfigurasi
CORS_ORIGINS=http://localhost:3000

# Face recognition
FACE_MATCH_THRESHOLD=0.45
FACE_MIN_QUALITY=0.4
SNAPSHOT_DIR=./storage/snapshots
EMBEDDING_ENCRYPTION_KEY=${ENCRYPTION_KEY}

# Geofencing (atur sesuai kebutuhan)
GEOFENCE_ENABLED=false
EOF

log "File .env backend dibuat"

# Jalankan migrasi database
info "Inisialisasi database (buat tabel)..."
python3 -c "
import asyncio
from app.database import init_db
asyncio.run(init_db())
print('Database tables created!')
"
log "Tabel database dibuat"

# Jalankan migrasi tambahan
info "Jalankan migrasi schema tambahan..."
DB_URL="mysql -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME}"

# Migration: organization_mode
$DB_URL < "$APP_DIR/backend/add_organization_mode.sql" 2>/dev/null || warn "Migration organization_mode sudah ada atau skip"

# Migration: school_classes
$DB_URL < "$APP_DIR/backend/add_school_classes.sql" 2>/dev/null || warn "Migration school_classes sudah ada atau skip"

log "Migrasi database selesai"

# Seed data awal
info "Seed data awal..."
python3 -c "
import asyncio
from app.seed import run
asyncio.run(run())
" || warn "Seed sudah ada atau skip"
log "Seed data selesai"

deactivate

# ── Setup Frontend ────────────────────────────────────────────────────────────
info "Setup frontend Next.js..."
cd "$APP_DIR/frontend"

# Install dependencies
info "Install Node.js dependencies..."
npm install --production=false -q
log "Node.js dependencies terinstall"

# Buat .env.local production
# Domain akan diisi setelah Nginx dikonfigurasi
cat > .env.local << EOF
# Akan diupdate setelah domain dikonfigurasi
NEXT_PUBLIC_API_URL=http://localhost:8001/v1
NEXT_PUBLIC_API_BASE=http://localhost:8001
NEXT_PUBLIC_APP_NAME=Aethera
EOF

log "File .env.local frontend dibuat (sementara)"

# Build production
info "Build Next.js production (ini butuh 2-5 menit)..."
npm run build
log "Frontend berhasil di-build"

# ── Setup Permissions ─────────────────────────────────────────────────────────
chown -R luneons:luneons "$APP_DIR"
log "Permissions diset"

echo ""
echo "=============================================="
echo "   App Setup Selesai!"
echo "=============================================="
echo ""
echo "Langkah selanjutnya:"
echo "  bash $APP_DIR/deploy/setup_nginx.sh DOMAIN_KAMU.COM"
echo ""
echo "Contoh:"
echo "  bash $APP_DIR/deploy/setup_nginx.sh aethera.sekolahku.com"
echo ""
