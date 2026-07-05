# 🚀 Panduan Deploy FaceTrack ke VPS

## Spek VPS yang Digunakan
- **CPU**: 2 vCPU
- **RAM**: 2 GB
- **Disk**: 60 GB
- **OS**: Ubuntu 24.04 LTS
- **Provider**: Biznet Neo (atau provider lain)

---

## 📋 Persiapan Sebelum Deploy

### Yang Kamu Butuhkan
1. ✅ VPS sudah dibeli dan dapat IP publik
2. ✅ Domain (opsional tapi sangat disarankan untuk HTTPS)
3. ✅ Akses SSH ke VPS (username `root` + password dari provider)
4. ✅ Kode aplikasi di komputer lokal

### Tools di Komputer Lokal (Windows)
- **Terminal**: PowerShell atau Command Prompt
- **SSH Client**: Sudah built-in di Windows 10/11
- **Opsional**: [WinSCP](https://winscp.net) untuk upload file via GUI

---

## 🗺️ Gambaran Arsitektur di VPS

```
Internet
    │
    ▼
[Nginx :80/:443]  ← Reverse proxy + SSL
    │
    ├── /          → [Next.js :3000]  ← Frontend
    ├── /v1/       → [FastAPI :8001]  ← Backend API
    └── /snapshots → [FastAPI :8001]  ← Foto absensi
    
[MySQL :3306]  ← Database (hanya bisa diakses lokal)
[WA Gateway :3001]  ← WhatsApp (opsional)
```

---

## 📦 LANGKAH 1: Upload Kode ke VPS

### Cara A: Pakai Script Otomatis (Recommended)

1. Buka file `deploy/upload_to_vps.bat`
2. Ganti `YOUR_VPS_IP` dengan IP VPS kamu
3. Double-click file tersebut
4. Masukkan password VPS saat diminta

### Cara B: Manual via SCP

Buka PowerShell di folder project, jalankan:

```powershell
# Ganti 1.2.3.4 dengan IP VPS kamu
$VPS = "root@1.2.3.4"
$REMOTE = "/var/www/aethera"

# Buat folder di VPS
ssh $VPS "mkdir -p $REMOTE"

# Upload backend
scp -r backend "$VPS`:$REMOTE/"

# Upload frontend (tanpa node_modules)
# Buat dulu file exclude
# Lalu upload
scp -r frontend "$VPS`:$REMOTE/"

# Upload deploy scripts
scp -r deploy "$VPS`:$REMOTE/"
```

### Cara C: Pakai Git (Paling Mudah untuk Update)

```bash
# Di VPS nanti:
cd /var/www
git clone https://github.com/USERNAME/REPO_NAME facetrack
```

> **Catatan**: Kalau pakai Git, pastikan `.gitignore` sudah benar (jangan commit `.env`, `node_modules`, `.venv`)

---

## 🖥️ LANGKAH 2: Masuk ke VPS via SSH

```powershell
# Di PowerShell Windows
ssh luneons@103.150.116.52_KAMU

# Contoh:
ssh luneons@103.xxx.xxx.xxx
```

Masukkan password yang diberikan provider VPS.

---

## ⚙️ LANGKAH 3: Setup Dasar VPS

Setelah masuk SSH, jalankan:

```bash
# Beri permission execute ke semua script
chmod +x /var/www/aethera/deploy/*.sh

# Jalankan setup dasar (install Python, Node.js, MySQL, Nginx, dll)
# Ini butuh 5-10 menit
bash /var/www/aethera/deploy/setup_vps.sh
```

Script ini akan:
- ✅ Update sistem Ubuntu
- ✅ Install Python 3.11
- ✅ Install Node.js 20 LTS
- ✅ Install MySQL 8.0
- ✅ Install Nginx
- ✅ Install Certbot (untuk SSL)
- ✅ Setup Swap 2GB
- ✅ Tune MySQL untuk RAM rendah
- ✅ Setup Firewall (UFW)
- ✅ Setup Fail2ban (keamanan)

---

## 🗄️ LANGKAH 4: Setup Database

```bash
bash /var/www/aethera/deploy/setup_database.sh
```

Script ini akan:
- ✅ Buat database `aethera`
- ✅ Buat user MySQL khusus (lebih aman dari root)
- ✅ Generate password acak yang kuat
- ✅ Simpan kredensial di `/root/aethera_db_credentials.txt`

**Catat output password yang muncul!**

---

## 🔧 LANGKAH 5: Setup Aplikasi

```bash
bash /var/www/aethera/deploy/setup_app.sh
```

Script ini akan:
- ✅ Buat virtual environment Python
- ✅ Install semua Python dependencies
- ✅ Buat file `.env` backend dengan konfigurasi production
- ✅ Inisialisasi tabel database
- ✅ Jalankan migrasi schema
- ✅ Seed data awal (akun admin)
- ✅ Install Node.js dependencies
- ✅ Build Next.js production

> ⏱️ **Ini butuh 5-10 menit** karena install dependencies dan build frontend

---

## 🌐 LANGKAH 6: Setup Nginx + Domain

### Jika Punya Domain

```bash
# Ganti dengan domain dan email kamu
bash /var/www/aethera/deploy/setup_nginx.sh aethera.sekolahku.com admin@sekolahku.com
```

**Sebelum jalankan ini**, pastikan:
1. Domain sudah dibeli
2. DNS A Record sudah diarahkan ke IP VPS
3. Tunggu propagasi DNS (bisa 5 menit - 24 jam)

### Jika Belum Punya Domain (Pakai IP Langsung)

```bash
bash /var/www/aethera/deploy/setup_nginx.sh IP_VPS_KAMU
```

Contoh: `bash /var/www/aethera/deploy/setup_nginx.sh 103.xxx.xxx.xxx`

> ⚠️ Tanpa domain, tidak bisa pakai HTTPS. Kamera di browser mungkin tidak bisa diakses dari HP karena butuh HTTPS (kecuali localhost).

---

## 🔄 LANGKAH 7: Setup Services (Auto-start)

```bash
bash /var/www/aethera/deploy/setup_services.sh
```

Script ini akan:
- ✅ Buat systemd service untuk backend
- ✅ Buat systemd service untuk frontend
- ✅ Aktifkan auto-start saat VPS reboot
- ✅ Jalankan semua service

---

## ✅ LANGKAH 8: Verifikasi

```bash
# Cek semua service berjalan
systemctl status aethera-backend
systemctl status aethera-frontend
systemctl status nginx
systemctl status mysql

# Cek log jika ada error
journalctl -u aethera-backend -n 50
journalctl -u aethera-frontend -n 50
```

Buka browser dan akses:
- `http://IP_VPS` atau `https://DOMAIN_KAMU`
- Login dengan: `admin@aethera.id` / `admin123`

> ⚠️ **Segera ganti password admin setelah login pertama!**

---

## 🔐 LANGKAH 9: Keamanan Tambahan (Wajib!)

### Ganti Password MySQL Root

```bash
mysql -u root
ALTER USER 'root'@'localhost' IDENTIFIED BY 'PASSWORD_BARU_YANG_KUAT';
FLUSH PRIVILEGES;
EXIT;
```

### Ganti Password Admin Aplikasi

Login ke aplikasi → Edit profil → Ganti password

### Amankan SSH (Opsional tapi Recommended)

```bash
# Buat SSH key di komputer lokal (Windows PowerShell)
ssh-keygen -t ed25519 -C "aethera-vps"

# Copy public key ke VPS
ssh-copy-id luneons@103.150.116.52

# Setelah berhasil login dengan key, nonaktifkan password SSH
nano /etc/ssh/sshd_config
# Ubah: PasswordAuthentication no
systemctl restart sshd
```

---

## 📊 Monitoring & Maintenance

### Cek Penggunaan Resource

```bash
# RAM dan CPU
htop

# Disk
df -h

# Koneksi database
mysql -u aethera_user -p facetrack -e "SHOW STATUS LIKE 'Threads_connected';"
```

### Lihat Log Real-time

```bash
# Log backend
journalctl -u aethera-backend -f

# Log frontend
journalctl -u aethera-frontend -f

# Log Nginx
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Backup Manual

```bash
bash /var/www/aethera/deploy/backup.sh
```

### Setup Backup Otomatis (Setiap Hari Jam 2 Pagi)

```bash
crontab -e
# Tambahkan baris ini:
0 2 * * * /var/www/aethera/deploy/backup.sh >> /var/log/aethera-backup.log 2>&1
```

---

## 🔄 Update Aplikasi

Setiap kali ada update kode:

```bash
# Upload kode baru dari Windows
# (jalankan upload_to_vps.bat lagi)

# Lalu di VPS:
bash /var/www/aethera/deploy/update_app.sh
```

---

## 🐛 Troubleshooting

### Backend tidak bisa start

```bash
# Lihat error detail
journalctl -u aethera-backend -n 100

# Coba jalankan manual untuk lihat error
cd /var/www/aethera/backend
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

### Frontend tidak bisa start

```bash
journalctl -u aethera-frontend -n 100

# Coba manual
cd /var/www/aethera/frontend
node node_modules/.bin/next start -p 3000
```

### Database connection error

```bash
# Cek MySQL berjalan
systemctl status mysql

# Test koneksi
mysql -u aethera_user -p facetrack -e "SELECT 1;"

# Cek .env backend
cat /var/www/aethera/backend/.env | grep DATABASE_URL
```

### Nginx 502 Bad Gateway

```bash
# Cek backend berjalan di port 8001
curl http://127.0.0.1:8001/v1/health

# Cek frontend berjalan di port 3000
curl http://127.0.0.1:3000

# Restart services
systemctl restart aethera-backend aethera-frontend
```

### SSL Certificate Error

```bash
# Renew manual
certbot renew

# Cek status
certbot certificates
```

### RAM penuh

```bash
# Cek penggunaan RAM
free -h

# Cek proses yang makan RAM
ps aux --sort=-%mem | head -20

# Restart services untuk free memory
systemctl restart aethera-backend aethera-frontend
```

---

## 📱 Akses dari HP (PWA)

Setelah deploy dengan HTTPS:

1. Buka Safari (iPhone) atau Chrome (Android)
2. Akses `https://DOMAIN_KAMU`
3. Login
4. Tap **Share** → **Add to Home Screen** (iPhone)
   atau tap **⋮** → **Add to Home Screen** (Android)
5. App muncul di home screen!

---

## 📞 Akun Default Setelah Deploy

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@aethera.id | admin123 |
| HR | budi@aethera.id | budi123 |
| Karyawan | siti@aethera.id | siti123 |

> ⚠️ **WAJIB ganti semua password ini setelah deploy!**

---

## 💰 Estimasi Biaya Bulanan

| Item | Biaya |
|------|-------|
| VPS Biznet Neo SS 2.2 | Rp 109.000 |
| Domain .com (per tahun ÷ 12) | ~Rp 15.000 |
| **Total** | **~Rp 124.000/bulan** |

---

## 🗂️ Struktur File di VPS

```
/var/www/aethera/
├── backend/
│   ├── .venv/          ← Python virtual environment
│   ├── .env            ← Konfigurasi production (RAHASIA!)
│   ├── app/            ← Kode aplikasi
│   ├── models/         ← ONNX face recognition models
│   ├── storage/
│   │   └── snapshots/  ← Foto absensi
│   └── requirements.txt
├── frontend/
│   ├── .next/          ← Build production
│   ├── .env.local      ← Konfigurasi frontend (RAHASIA!)
│   ├── node_modules/
│   └── package.json
├── wa-gateway/         ← WhatsApp gateway (opsional)
└── deploy/             ← Script deployment
    ├── setup_vps.sh
    ├── setup_database.sh
    ├── setup_app.sh
    ├── setup_nginx.sh
    ├── setup_services.sh
    ├── update_app.sh
    └── backup.sh

/root/aethera_db_credentials.txt  ← Kredensial DB (RAHASIA!)
/var/backups/aethera/             ← Backup otomatis
/etc/nginx/sites-available/facetrack ← Konfigurasi Nginx
/etc/systemd/system/facetrack-*.service ← Service files
```

---

## ✅ Checklist Deploy

- [ ] VPS dibeli dan dapat IP
- [ ] SSH berhasil masuk ke VPS
- [ ] Kode diupload ke VPS
- [ ] `setup_vps.sh` berhasil dijalankan
- [ ] `setup_database.sh` berhasil, password dicatat
- [ ] `setup_app.sh` berhasil, frontend ter-build
- [ ] DNS domain diarahkan ke IP VPS (jika pakai domain)
- [ ] `setup_nginx.sh` berhasil
- [ ] SSL aktif (https://)
- [ ] `setup_services.sh` berhasil
- [ ] Bisa akses aplikasi di browser
- [ ] Login berhasil
- [ ] Password admin sudah diganti
- [ ] Backup otomatis dikonfigurasi
- [ ] Test scan wajah berhasil

---

*Panduan ini dibuat untuk Aethera v1.0*
*Terakhir diupdate: Mei 2026*
