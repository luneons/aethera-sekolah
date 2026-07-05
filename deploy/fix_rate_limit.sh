#!/bin/bash
# Naikkan rate limit nginx untuk Aethera — polling chat/notif butuh throughput lebih tinggi.
set -e
CONF=/etc/nginx/sites-available/aethera

sudo cp "$CONF" "$CONF.bak.$(date +%s)"

# 30r/m -> 600r/m (10 req/sec rata-rata)
sudo sed -i 's|zone=api:10m rate=30r/m|zone=api:10m rate=600r/m|g' "$CONF"
# 60r/m -> 300r/m untuk endpoint /scan
sudo sed -i 's|zone=scan:10m rate=60r/m|zone=scan:10m rate=300r/m|g' "$CONF"
# burst=20 -> burst=100, biar tab baru/refresh halaman tidak spike-blokir
sudo sed -i 's|limit_req zone=api burst=20 nodelay|limit_req zone=api burst=100 nodelay|g' "$CONF"

echo "After:"
grep -E 'limit_req|burst' "$CONF" | head -5
sudo nginx -t
sudo systemctl reload nginx
echo "DONE — rate limit dinaikkan."
