#!/bin/bash
# =============================================================================
# Aethera VPS Setup Script
# Ubuntu 24.04 LTS
# Jalankan sebagai root: bash setup_vps.sh
# =============================================================================

set -e  # Stop on error

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
info() { echo -e "${BLUE}[→]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "=============================================="
echo "   Aethera VPS Setup — Ubuntu 24.04"
echo "=============================================="
echo ""

# ── 1. Update sistem ──────────────────────────────────────────────────────────
info "Update sistem..."
apt-get update -qq && apt-get upgrade -y -qq
log "Sistem diupdate"

# ── 2. Install dependensi dasar ───────────────────────────────────────────────
info "Install dependensi dasar..."
apt-get install -y -qq \
    curl wget git unzip zip \
    build-essential libssl-dev libffi-dev \
    software-properties-common \
    ca-certificates gnupg lsb-release \
    htop nano ufw fail2ban \
    libgl1-mesa-glx libglib2.0-0 libsm6 libxext6 libxrender-dev
log "Dependensi dasar terinstall"

# ── 3. Install Python 3.11 ────────────────────────────────────────────────────
info "Install Python 3.11..."
add-apt-repository ppa:deadsnakes/ppa -y
apt-get update -qq
apt-get install -y -qq python3.11 python3.11-venv python3.11-dev python3-pip
update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1
log "Python 3.11 terinstall: $(python3 --version)"

# ── 4. Install Node.js 20 LTS ─────────────────────────────────────────────────
info "Install Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y -qq nodejs
log "Node.js terinstall: $(node --version)"
log "npm terinstall: $(npm --version)"

# ── 5. Install MySQL 8.0 ──────────────────────────────────────────────────────
info "Install MySQL 8.0..."
apt-get install -y -qq mysql-server
systemctl start mysql
systemctl enable mysql
log "MySQL terinstall: $(mysql --version)"

# ── 6. Install Nginx ──────────────────────────────────────────────────────────
info "Install Nginx..."
apt-get install -y -qq nginx
systemctl start nginx
systemctl enable nginx
log "Nginx terinstall: $(nginx -v 2>&1)"

# ── 7. Install Certbot (SSL) ──────────────────────────────────────────────────
info "Install Certbot untuk SSL..."
apt-get install -y -qq certbot python3-certbot-nginx
log "Certbot terinstall"

# ── 8. Setup Swap 2GB ─────────────────────────────────────────────────────────
info "Setup swap 2GB..."
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    # Optimize swappiness
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
    sysctl -p
    log "Swap 2GB aktif"
else
    warn "Swap sudah ada, skip"
fi

# ── 9. Tune MySQL untuk RAM rendah ────────────────────────────────────────────
info "Tune MySQL untuk VPS 2GB RAM..."
cat > /etc/mysql/mysql.conf.d/aethera.cnf << 'EOF'
[mysqld]
# Memory optimization for 2GB VPS
innodb_buffer_pool_size = 256M
innodb_log_file_size = 64M
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT
max_connections = 50
query_cache_type = 0
tmp_table_size = 32M
max_heap_table_size = 32M
key_buffer_size = 16M
thread_cache_size = 8
table_open_cache = 256

# Character set
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
EOF
systemctl restart mysql
log "MySQL dikonfigurasi"

# ── 10. Setup Firewall ────────────────────────────────────────────────────────
info "Setup firewall UFW..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
log "Firewall aktif (SSH, HTTP, HTTPS)"

# ── 11. Setup Fail2ban ────────────────────────────────────────────────────────
info "Setup Fail2ban..."
systemctl start fail2ban
systemctl enable fail2ban
log "Fail2ban aktif"

# ── 12. Buat User aethera ───────────────────────────────────────────────────
info "Buat user aethera..."
if ! id "aethera" &>/dev/null; then
    useradd -m -s /bin/bash aethera
    usermod -aG sudo aethera
    log "User aethera dibuat"
else
    warn "User aethera sudah ada"
fi

# ── 13. Buat direktori aplikasi ───────────────────────────────────────────────
info "Buat direktori aplikasi..."
mkdir -p /var/www/aethera
chown -R luneons:luneons /var/www/aethera
log "Direktori /var/www/aethera siap"

echo ""
echo "=============================================="
echo "   Setup Dasar Selesai!"
echo "=============================================="
echo ""
echo "Langkah selanjutnya:"
echo "  1. Upload kode aplikasi ke /var/www/aethera"
echo "  2. Jalankan: bash /var/www/aethera/deploy/setup_database.sh"
echo "  3. Jalankan: bash /var/www/aethera/deploy/setup_app.sh"
echo "  4. Jalankan: bash /var/www/aethera/deploy/setup_nginx.sh DOMAIN_KAMU"
echo ""
