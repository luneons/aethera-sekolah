# 📋 Catatan Operasional VPS Aethera

## Info VPS
| Item | Detail |
|------|--------|
| IP | 103.150.116.52 |
| Domain | https://aethera.my.id |
| Provider | Biznet Neo |
| Username | luneons |
| SSH Key | C:\Users\reswa\Downloads\Razor-246810.pem |
| OS | Ubuntu 24.04 |

---

## 🔑 Cara Masuk VPS

Buka PowerShell di laptop, jalankan:
```powershell
ssh -i C:\Users\reswa\Downloads\Razor-246810.pem luneons@103.150.116.52
```

---

## 🟢 Kondisi Normal (Sudah Running)

Semua service sudah auto-start saat VPS reboot. Tidak perlu lakukan apa-apa.

Cek semua service jalan:
```bash
systemctl status aethera-backend
systemctl status aethera-frontend
systemctl status nginx
systemctl status mysql
```

Semua harus `active (running)`.

---

## 🔄 Kalau Ada Update Kode

**Di laptop** (dari folder Absensi):
```
deploy\upload_to_vps.bat
```

**Di VPS** setelah upload:
```bash
sudo bash /var/www/aethera/deploy/update_app.sh
```

Script ini otomatis:
- Install dependencies baru
- Rebuild frontend
- Restart backend & frontend

---

## 🚨 Troubleshooting

### Service mati / tidak jalan
```bash
# Restart semua
sudo systemctl restart aethera-backend aethera-frontend nginx

# Lihat log error
journalctl -u aethera-backend -n 50 --no-pager
journalctl -u aethera-frontend -n 50 --no-pager
```

### Website tidak bisa diakses
```bash
# Cek nginx
sudo nginx -t
sudo systemctl restart nginx

# Cek frontend jalan
curl -s http://127.0.0.1:3000 | head -2

# Cek backend jalan
curl -s http://127.0.0.1:8001/v1/health
```

### Database error
```bash
# Cek MySQL jalan
sudo systemctl status mysql

# Masuk MySQL
mysql -u aethera_user -p aethera
# Password ada di: /home/luneons/aethera_db_credentials.txt
```

### SSL expired (tiap 90 hari, auto-renew)
```bash
# Cek status SSL
sudo certbot certificates

# Renew manual kalau perlu
sudo certbot renew
sudo systemctl reload nginx
```

---

## 📦 Backup Manual

```bash
sudo bash /var/www/aethera/deploy/backup.sh
```

Backup tersimpan di `/var/backups/aethera/`

Backup otomatis sudah jalan tiap hari jam 2 pagi.

---

## 🔧 Perintah Berguna Sehari-hari

```bash
# Restart backend saja (kalau ada update kode backend)
sudo systemctl restart aethera-backend

# Restart frontend saja (kalau ada update kode frontend)
sudo systemctl restart aethera-frontend

# Lihat log backend live
journalctl -u aethera-backend -f

# Lihat log frontend live
journalctl -u aethera-frontend -f

# Cek penggunaan RAM & CPU
# Cek penggunaan RAM & CPU
htop

# Cek penggunaan disk
df -h

# Cek kredensial database
cat /home/luneons/aethera_db_credentials.txt
```

---

## 📁 Lokasi File Penting di VPS

```
/var/www/aethera/
├── backend/
│   ├── .env              ← Konfigurasi backend (DATABASE_URL, SECRET_KEY, dll)
│   ├── app/              ← Kode Python
│   └── storage/
│       ├── snapshots/    ← Foto absensi
│       └── photos/       ← Foto profil user
├── frontend/
│   ├── .env.local        ← Konfigurasi frontend (API URL)
│   └── .next/            ← Build production
├── wa-gateway/           ← WhatsApp gateway
└── deploy/               ← Script deployment

/home/luneons/aethera_db_credentials.txt  ← Password database
/var/backups/aethera/                     ← Backup otomatis
/etc/nginx/sites-available/aethera        ← Konfigurasi Nginx
```

---

## 🆕 Kalau Mau Deploy Ulang dari Awal

Ini tidak perlu dilakukan kecuali VPS di-reset total.

1. Upload kode: `deploy\upload_to_vps.bat` (dari laptop)
2. Di VPS:
```bash
sudo bash /var/www/aethera/deploy/setup_vps.sh
sudo bash /var/www/aethera/deploy/setup_database.sh
sudo bash /var/www/aethera/deploy/setup_app.sh
sudo bash /var/www/aethera/deploy/setup_nginx.sh aethera.my.id admin@aethera.my.id
sudo bash /var/www/aethera/deploy/setup_services.sh
```

**Catatan penting yang ditemukan saat deploy pertama:**
- Python di VPS adalah 3.12 (bukan 3.11) — sudah dihandle di script
- Perlu install: `sudo apt-get install -y python3.12-venv python3.12-dev`
- aiomysql harus versi 0.2.0 (bukan 0.3.x)
- SQLAlchemy harus versi 2.0.41+
- Setelah install, upgrade manual: `pip install aiomysql==0.2.0 sqlalchemy==2.0.41`

---

## 👤 Akun Default Aplikasi

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@aethera.id | admin123 |
| HR | budi@aethera.id | budi123 |
| Karyawan | siti@aethera.id | siti123 |

⚠️ **Ganti semua password ini segera!**

---

## 📱 WA Gateway (WhatsApp Notifikasi)

Kalau WA Gateway belum jalan:
```bash
cd /var/www/aethera/wa-gateway
npm install
```

Lalu aktifkan dari UI:
- Login sebagai Admin
- Buka **Organisasi** → **Notifikasi WhatsApp**
- Klik **Jalankan WA Gateway**
- Scan QR code dengan WhatsApp

---

*Catatan dibuat: Mei 2026*
*Domain: https://aethera.my.id*
