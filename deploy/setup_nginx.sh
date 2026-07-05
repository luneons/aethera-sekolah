#!/bin/bash
# =============================================================================
# Aethera Nginx + SSL Setup
# Usage: bash setup_nginx.sh DOMAIN_KAMU.COM EMAIL_KAMU
# =============================================================================

set -e

DOMAIN="${1:-}"
EMAIL="${2:-admin@example.com}"
APP_DIR="/var/www/aethera"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
info() { echo -e "${BLUE}[→]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

[ -z "$DOMAIN" ] && err "Usage: bash setup_nginx.sh DOMAIN_KAMU.COM EMAIL_KAMU"

echo ""
echo "=============================================="
echo "   Aethera Nginx + SSL Setup"
echo "   Domain: $DOMAIN"
echo "=============================================="
echo ""

# ── Konfigurasi Nginx ─────────────────────────────────────────────────────────
info "Buat konfigurasi Nginx..."

cat > /etc/nginx/sites-available/aethera << EOF
# Aethera Nginx Configuration
# Domain: ${DOMAIN}

# Rate limiting — polling-friendly untuk chat & notifikasi
limit_req_zone \$binary_remote_addr zone=api:10m rate=600r/m;
limit_req_zone \$binary_remote_addr zone=scan:10m rate=300r/m;

server {
    listen 80;
    server_name ${DOMAIN};

    # Redirect HTTP → HTTPS (akan aktif setelah SSL)
    # return 301 https://\$host\$request_uri;

    # ── Frontend (Next.js) ──────────────────────────────────────────────────
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 60s;
    }

    # ── Backend API (FastAPI) ───────────────────────────────────────────────
    location /v1/ {
        # Rate limit untuk API umum
        limit_req zone=api burst=100 nodelay;

        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;

        # Upload foto wajah bisa besar
        client_max_body_size 10M;
    }

    # ── Scan endpoint (lebih longgar rate limit) ────────────────────────────
    location /v1/attendance/ {
        limit_req zone=scan burst=60 nodelay;

        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        client_max_body_size 10M;
    }

    # ── Snapshots (foto absensi) ────────────────────────────────────────────
    location /snapshots/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host \$host;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # ── Profile photos ──────────────────────────────────────────────────────
    location /photos/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host \$host;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # ── Lesson materials (PDF/PPTX) ─────────────────────────────────────────
    location /lessons/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host \$host;
        client_max_body_size 25m;
    }

    # ── Leave proofs (gambar/PDF) ───────────────────────────────────────────
    location /proofs/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host \$host;
        client_max_body_size 10m;
    }

    # ── Docs FastAPI (opsional, bisa diblokir di production) ───────────────
    location /docs {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host \$host;
    }

    location /openapi.json {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host \$host;
    }

    # ── Security headers ────────────────────────────────────────────────────
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # ── Gzip compression ────────────────────────────────────────────────────
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/aethera /etc/nginx/sites-enabled/aethera
rm -f /etc/nginx/sites-enabled/default

# Test konfigurasi
nginx -t && log "Konfigurasi Nginx valid"
systemctl reload nginx
log "Nginx dikonfigurasi untuk domain: $DOMAIN"

# ── Update .env frontend dengan domain ────────────────────────────────────────
info "Update .env frontend dengan domain..."
cat > "$APP_DIR/frontend/.env.local" << EOF
NEXT_PUBLIC_API_URL=https://${DOMAIN}/v1
NEXT_PUBLIC_API_BASE=https://${DOMAIN}
NEXT_PUBLIC_APP_NAME=Aethera
EOF

# Update CORS di backend .env
info "Update CORS backend..."
sed -i "s|CORS_ORIGINS=.*|CORS_ORIGINS=https://${DOMAIN},http://localhost:3000|" "$APP_DIR/backend/.env"

# Rebuild frontend dengan URL baru
info "Rebuild frontend dengan URL production..."
cd "$APP_DIR/frontend"
npm run build
log "Frontend di-rebuild"

# ── Setup SSL dengan Certbot ──────────────────────────────────────────────────
echo ""
warn "Sekarang setup SSL. Pastikan DNS domain sudah mengarah ke IP VPS ini!"
echo ""
read -p "Lanjutkan setup SSL? (y/n): " SETUP_SSL

if [ "$SETUP_SSL" = "y" ]; then
    info "Setup SSL dengan Certbot..."
    certbot --nginx -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive
    
    # Update Nginx untuk redirect HTTP → HTTPS
    sed -i 's|# return 301|return 301|' /etc/nginx/sites-available/aethera
    systemctl reload nginx
    
    log "SSL aktif! Site bisa diakses di https://${DOMAIN}"
    
    # Auto-renew SSL
    systemctl enable certbot.timer
    log "Auto-renew SSL dikonfigurasi"
else
    warn "SSL skip. Akses via http://${DOMAIN}"
    warn "Jalankan 'certbot --nginx -d ${DOMAIN}' nanti untuk aktifkan SSL"
fi

echo ""
echo "=============================================="
echo "   Nginx Setup Selesai!"
echo "=============================================="
echo ""
echo "Langkah selanjutnya:"
echo "  bash $APP_DIR/deploy/setup_services.sh"
echo ""
