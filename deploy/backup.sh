#!/bin/bash
# =============================================================================
# Aethera Backup Script
# Jalankan manual atau setup cron: 0 2 * * * /var/www/aethera/deploy/backup.sh
# =============================================================================

APP_DIR="/var/www/aethera"
BACKUP_DIR="/var/backups/aethera"
DATE=$(date +%Y%m%d_%H%M%S)
GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${BLUE}[→]${NC} $1"; }

# Baca kredensial DB
source /home/luneons/aethera_db_credentials.txt 2>/dev/null || {
    DB_USER="aethera_user"
    DB_NAME="aethera"
    read -s -p "DB Password: " DB_PASSWORD; echo
}

mkdir -p "$BACKUP_DIR"

# Backup database
info "Backup database..."
mysqldump -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    --single-transaction \
    --routines \
    --triggers \
    | gzip > "$BACKUP_DIR/db_${DATE}.sql.gz"
log "Database backup: db_${DATE}.sql.gz"

# Backup foto snapshots
info "Backup snapshots..."
tar -czf "$BACKUP_DIR/snapshots_${DATE}.tar.gz" \
    -C "$APP_DIR/backend" storage/snapshots/ 2>/dev/null || true
log "Snapshots backup: snapshots_${DATE}.tar.gz"

# Backup .env files
info "Backup konfigurasi..."
tar -czf "$BACKUP_DIR/config_${DATE}.tar.gz" \
    "$APP_DIR/backend/.env" \
    "$APP_DIR/frontend/.env.local" 2>/dev/null || true
log "Config backup: config_${DATE}.tar.gz"

# Hapus backup lebih dari 30 hari
find "$BACKUP_DIR" -name "*.gz" -mtime +30 -delete
log "Backup lama dihapus (>30 hari)"

echo ""
log "Backup selesai! Tersimpan di: $BACKUP_DIR"
ls -lh "$BACKUP_DIR" | tail -10
echo ""
