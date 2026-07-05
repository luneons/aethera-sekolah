#!/bin/bash
# =============================================================================
# Aethera Systemd Services Setup
# Membuat service agar app otomatis jalan saat VPS restart
# =============================================================================

set -e

APP_DIR="/var/www/aethera"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
info() { echo -e "${BLUE}[→]${NC} $1"; }

echo ""
echo "=============================================="
echo "   Aethera Services Setup"
echo "=============================================="
echo ""

# ── Service 1: Backend FastAPI ────────────────────────────────────────────────
info "Buat service backend..."
cat > /etc/systemd/system/aethera-backend.service << EOF
[Unit]
Description=Aethera Backend (FastAPI)
After=network.target mysql.service
Requires=mysql.service

[Service]
Type=exec
User=luneons
Group=luneons
WorkingDirectory=${APP_DIR}/backend
Environment="PATH=${APP_DIR}/backend/.venv/bin"
ExecStart=${APP_DIR}/backend/.venv/bin/uvicorn app.main:app \
    --host 127.0.0.1 \
    --port 8001 \
    --workers 2 \
    --log-level info \
    --access-log \
    --no-use-colors
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=aethera-backend

# Limits
LimitNOFILE=65536
TimeoutStartSec=60

[Install]
WantedBy=multi-user.target
EOF

log "Service backend dibuat"

# ── Service 2: Frontend Next.js ───────────────────────────────────────────────
info "Buat service frontend..."
cat > /etc/systemd/system/aethera-frontend.service << EOF
[Unit]
Description=Aethera Frontend (Next.js)
After=network.target aethera-backend.service

[Service]
Type=exec
User=luneons
Group=luneons
WorkingDirectory=${APP_DIR}/frontend
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/node node_modules/.bin/next start -p 3000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=aethera-frontend

# Limits
LimitNOFILE=65536
TimeoutStartSec=60

[Install]
WantedBy=multi-user.target
EOF

log "Service frontend dibuat"

# ── Service 3: WA Gateway (opsional) ─────────────────────────────────────────
if [ -d "$APP_DIR/wa-gateway" ]; then
    info "Buat service WA Gateway..."
    cat > /etc/systemd/system/aethera-wa.service << EOF
[Unit]
Description=Aethera WhatsApp Gateway
After=network.target aethera-backend.service

[Service]
Type=exec
User=luneons
Group=luneons
WorkingDirectory=${APP_DIR}/wa-gateway
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=aethera-wa

[Install]
WantedBy=multi-user.target
EOF
    log "Service WA Gateway dibuat"
fi

# ── Aktifkan semua service ────────────────────────────────────────────────────
info "Aktifkan dan jalankan services..."
systemctl daemon-reload

systemctl enable aethera-backend
systemctl start aethera-backend
sleep 3

systemctl enable aethera-frontend
systemctl start aethera-frontend
sleep 3

if [ -f /etc/systemd/system/aethera-wa.service ]; then
    systemctl enable aethera-wa
    # WA gateway tidak auto-start, user harus connect manual via UI
    warn "WA Gateway service dibuat tapi tidak auto-start (connect via UI)"
fi

# ── Cek status ────────────────────────────────────────────────────────────────
echo ""
info "Cek status services..."
echo ""

systemctl is-active aethera-backend && log "Backend: RUNNING" || warn "Backend: FAILED"
systemctl is-active aethera-frontend && log "Frontend: RUNNING" || warn "Frontend: FAILED"

echo ""
echo "=============================================="
echo "   Services Setup Selesai!"
echo "=============================================="
echo ""
echo "Perintah berguna:"
echo "  systemctl status aethera-backend    # Cek status backend"
echo "  systemctl status aethera-frontend   # Cek status frontend"
echo "  journalctl -u aethera-backend -f    # Lihat log backend live"
echo "  journalctl -u aethera-frontend -f   # Lihat log frontend live"
echo "  systemctl restart aethera-backend   # Restart backend"
echo "  systemctl restart aethera-frontend  # Restart frontend"
echo ""

# ── Cron Job: Tandai Absent Otomatis ─────────────────────────────────────────
info "Setup cron job absent marking..."
CRON_CMD="0 23 * * 1-5 cd /var/www/aethera/backend && .venv/bin/python -m app.services.absent_job >> /var/log/aethera-absent.log 2>&1"

# Tambahkan ke crontab jika belum ada
(crontab -l 2>/dev/null | grep -v "absent_job"; echo "$CRON_CMD") | crontab -
log "Cron job absent marking aktif (setiap hari kerja jam 23:00)"
