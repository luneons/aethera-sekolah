#!/bin/bash
# =============================================================================
# Aethera Update Script — versi lengkap dengan migrasi DB
# Jalankan di VPS setelah upload kode baru:
#   sudo bash /var/www/aethera/deploy/update_app.sh
# =============================================================================

APP_DIR="/var/www/aethera"
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[OK]${NC} $1"; }
info() { echo -e "${BLUE}[>>]${NC} $1"; }
warn() { echo -e "${YELLOW}[!!]${NC} $1"; }
err()  { echo -e "${RED}[ERR]${NC} $1"; }

echo "=============================================="
echo "   Aethera Update"
echo "=============================================="
echo ""

# ── Backend ────────────────────────────────────────────────────────────────────
info "Update backend dependencies..."
cd "$APP_DIR/backend"
source .venv/bin/activate

pip install -r requirements.txt -q
if [ $? -ne 0 ]; then
    err "pip install gagal!"
    exit 1
fi
log "Backend dependencies diupdate"

# ── VAPID keys (Web Push) — generate sekali, idempotent ──────────────────────
info "Cek VAPID keys untuk Web Push..."
if grep -q "^VAPID_PRIVATE_KEY=" .env 2>/dev/null && [ -n "$(grep ^VAPID_PRIVATE_KEY= .env | cut -d= -f2-)" ]; then
    log "VAPID keys sudah ada di .env"
else
    if [ -f "_gen_vapid.py" ]; then
        python _gen_vapid.py 2>&1 | tail -3 || warn "Gagal generate VAPID, push notif tidak akan jalan"
        log "VAPID keys di-generate"
    else
        warn "_gen_vapid.py tidak ada — Web Push akan disabled"
    fi
fi

# ── Migrasi DB (idempotent) ────────────────────────────────────────────────────
info "Jalankan migrasi database..."
python _migrate.py
if [ $? -ne 0 ]; then
    warn "Migrasi mungkin ada warning, cek log di atas"
fi
log "Migrasi selesai"

# ── Seed SIMMICO (idempotent — skip kalau sudah ada) ──────────────────────────
info "Cek seed data SIMMICO..."
python -m app.seed_simmico 2>&1 | tail -5
log "Seed SIMMICO selesai"

# ── Seed contoh nilai (idempotent) ────────────────────────────────────────────
if [ -f "_seed_all_grades.py" ]; then
    info "Seed contoh nilai semua kelas..."
    python _seed_all_grades.py 2>&1 | tail -5
    log "Seed nilai selesai"
fi

# ── Seed contoh kehadiran (idempotent) ────────────────────────────────────────
if [ -f "_seed_attendance_demo.py" ]; then
    info "Seed contoh kehadiran..."
    python _seed_attendance_demo.py 2>&1 | tail -5
    log "Seed kehadiran selesai"
fi

deactivate

# ── Restart backend ────────────────────────────────────────────────────────────
info "Restart backend service..."
systemctl restart aethera-backend
sleep 2
if systemctl is-active --quiet aethera-backend; then
    log "Backend berjalan"
else
    err "Backend gagal start! Cek: journalctl -u aethera-backend -n 30"
    exit 1
fi

# ── Frontend ───────────────────────────────────────────────────────────────────
info "Install frontend dependencies..."
cd "$APP_DIR/frontend"
npm install --legacy-peer-deps -q
log "npm install selesai"

info "Build frontend (production)..."
npm run build
if [ $? -ne 0 ]; then
    err "Frontend build gagal!"
    exit 1
fi
log "Frontend build selesai"

# ── Restart frontend ───────────────────────────────────────────────────────────
info "Restart frontend service..."
systemctl restart aethera-frontend
sleep 2
if systemctl is-active --quiet aethera-frontend; then
    log "Frontend berjalan"
else
    err "Frontend gagal start! Cek: journalctl -u aethera-frontend -n 30"
    exit 1
fi

# ── Health check ───────────────────────────────────────────────────────────────
info "Health check..."
sleep 3
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/v1/health 2>/dev/null || echo "000")
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000 2>/dev/null || echo "000")

if [ "$BACKEND_STATUS" = "200" ]; then
    log "Backend health check: OK ($BACKEND_STATUS)"
else
    warn "Backend health check: $BACKEND_STATUS (mungkin masih loading)"
fi

if [ "$FRONTEND_STATUS" = "200" ]; then
    log "Frontend health check: OK ($FRONTEND_STATUS)"
else
    warn "Frontend health check: $FRONTEND_STATUS (mungkin masih loading)"
fi

echo ""
echo "=============================================="
log "Update selesai!"
echo "=============================================="
echo ""
echo "Akun demo:"
echo "  Kepsek  : admin@smk-aethera.id / admin123"
echo "  Wali    : wali@smk-aethera.id  / wali123"
echo "  BK      : bk@smk-aethera.id    / bk123"
echo "  Siswa   : hafiz.20240001@siswa.aethera.id / hafiz123"
echo ""
