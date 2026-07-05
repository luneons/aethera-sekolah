#!/bin/bash
# Tambah nginx location untuk /lessons/ dan /proofs/ ke aethera config
set -e
CONF=/etc/nginx/sites-available/aethera

sudo cp "$CONF" "$CONF.bak.$(date +%s)"

# Cek apakah sudah ada
if grep -q "location /lessons/" "$CONF"; then
  echo "/lessons/ sudah terdaftar — skip lessons"
else
  # Sisipkan location /lessons/ + /proofs/ tepat setelah blok /photos/
  sudo python3 - "$CONF" <<'PY'
import sys, re
path = sys.argv[1]
with open(path) as f:
    content = f.read()

# Cari blok location /photos/ {...}
pattern = re.compile(
    r'(    location /photos/ \{[^}]*?\}\n)',
    re.DOTALL,
)
match = pattern.search(content)
if not match:
    print("ERROR: blok /photos/ tidak ketemu")
    sys.exit(1)

addition = """
    location /lessons/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 25m;
    }

    location /proofs/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 10m;
    }
"""
new_content = content.replace(match.group(0), match.group(0) + addition)
with open(path, "w") as f:
    f.write(new_content)
print("Inserted /lessons/ + /proofs/ blocks")
PY
fi

sudo nginx -t
sudo systemctl reload nginx
echo "DONE"
