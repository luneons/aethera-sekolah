# Aethera — Platform Manajemen Sekolah Modern

Platform all-in-one untuk sekolah Indonesia: absensi pengenalan wajah, LMS, disiplin & gamifikasi, portal orang tua, surat otomatis, perpustakaan, ekstrakurikuler, jadwal pelajaran, kalender acara, dan AI Insight powered by OpenRouter.

```
absensi/
├── backend/    # FastAPI + SQLAlchemy + JWT + ArcFace (InsightFace)
├── frontend/   # Next.js 14 + Tailwind + GSAP (PWA-ready)
└── android/    # Bundle TWA (Trusted Web Activity) untuk Play Store
```

## Quick Start

### Prasyarat
- Python 3.12+
- Node 20+
- MySQL 8+ (atau MariaDB 10.6+)

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/Mac
pip install -r requirements.txt
copy .env.example .env          # Windows
# cp .env.example .env          # Linux/Mac
# Edit .env — minimal isi DATABASE_URL & SECRET_KEY
python _gen_vapid.py            # generate VAPID keys → tempel ke .env
python _migrate.py              # buat semua tabel
python -m app.seed              # seed user demo + sample data
uvicorn app.main:app --reload --port 8000
```

Swagger docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
copy .env.local.example .env.local
npm run dev
```

App: http://localhost:3000

### Login Demo
- **Kepala Sekolah**: `admin@smk-aethera.id` / `admin123`
- **Wali Kelas**: lihat output `python -m app.seed_simmico`
- **Guru BK**: lihat output seed
- **Siswa**: lihat output seed
- **Orang Tua**: pakai HP siswa + password yang di-generate saat seed

## Fitur Lengkap

### Absensi & Disiplin
- ✅ Pengenalan wajah ArcFace (InsightFace ONNX) — akurasi ≥99%
- ✅ Anti-spoofing dasar (variance check, blur detection)
- ✅ Geofencing BYOD (verifikasi GPS dalam radius sekolah)
- ✅ Sistem poin sikap & apresiasi (skala 0–100)
- ✅ Lapor KTS dengan severity (ringan/sedang/berat) + persetujuan kepsek
- ✅ Watch List otomatis siswa berisiko (poin <70)
- ✅ Mood tracker untuk BK
- ✅ Surat panggilan ortu otomatis dari riwayat KTS

### LMS & Akademik
- ✅ Mata pelajaran + assignment teacher (CRUD)
- ✅ Tugas mode `manual` (input nilai dari sumber luar) dan `quiz` (online + anti-cheat)
- ✅ Quiz online dengan timer, anti-keluar-layar, auto-lock saat ketahuan cheat
- ✅ Materi pelajaran (upload PDF/video/dokumen)
- ✅ **Jadwal Pelajaran** — matrix 6 hari × N jam, deteksi konflik guru otomatis
- ✅ Gradebook + import nilai dari CSV/XLSX
- ✅ **Rapor PDF** — generate per semester dengan KKM, predikat, kehadiran, disiplin

### Komunikasi & Portal
- ✅ Chat real-time antar staff
- ✅ Chat monitor (kepsek/wali kelas pantau chat)
- ✅ Hapus obrolan (kepsek only)
- ✅ Broadcast push notification per audience
- ✅ Web Push notification (VAPID)
- ✅ **Pengumuman** persistent dengan pin, audience, expire date
- ✅ **Portal Orang Tua** — login terpisah, lihat absen/nilai/incident/tagihan/ajukan izin
- ✅ Notifikasi mark-as-read + click-to-navigate ke halaman terkait

### Operasional
- ✅ **SPP & Tagihan** — kategori, bulk-generate, payment recording, dashboard
- ✅ **Bulk Import Siswa** dari Excel/CSV dengan fuzzy column detection
- ✅ **Surat Otomatis** — 5 jenis (keterangan aktif, kelakuan baik, panggilan ortu, sehat jasmani, rekomendasi)
- ✅ **Perpustakaan Digital** — katalog, peminjaman, denda otomatis, top reader stats
- ✅ **Ekstrakurikuler** — daftar ekskul, enrollment, pencatatan prestasi (auto-bonus poin)
- ✅ **Booking Konsultasi BK** — slot, anonim, private note, bulk-generate slot
- ✅ **Acara Sekolah** — kalender + RSVP + export .ics ke Google/Apple Calendar
- ✅ **AI Insight** — KPI summary AI via OpenRouter (Nemotron 3 Nano gratis), cache 6 jam, fallback rule-based

### Security & Reliability
- ✅ JWT access + refresh token
- ✅ Brute-force protection (5x salah → lock 15 menit)
- ✅ Rate limit per-IP (login, kiosk attendance, face test)
- ✅ AES-256-GCM encryption untuk face embedding (auto-migrate dari format lama)
- ✅ File upload validation by magic bytes (bukan hanya MIME header)
- ✅ Audit log untuk semua action sensitive
- ✅ Password policy minimum 8 karakter
- ✅ CORS strict per domain

### PWA
- ✅ Installable di Android/iOS (manifest + service worker)
- ✅ Offline shell (cached static + offline page)
- ✅ Push notifications (Android & iOS PWA)
- ✅ TWA bundle untuk Play Store

## Database

MySQL 8+ wajib (production). Ada `_migrate.py` yang cuma `create_all` (cocok untuk MVP).
Untuk migrasi production yang aman, pakai Alembic (TODO).

Setelah pull versi baru, jalankan:

```bash
python _migrate.py
```

## Env Variables

Lihat `backend/.env.example`. Yang wajib di-isi:
- `SECRET_KEY` — random 32+ karakter
- `DATABASE_URL` — URL MySQL
- `EMBEDDING_ENCRYPTION_KEY` — random 32+ karakter (jangan ganti setelah ada embedding tersimpan)
- `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` — generate via `_gen_vapid.py`

Yang opsional tapi recommended:
- `OPENROUTER_API_KEY` — aktifkan AI Insight beneran (gratis di https://openrouter.ai/keys)
- `GEOFENCE_ENABLED=true` + koordinat — kunci absensi BYOD ke radius sekolah

## Deployment

Production live: https://aethera.my.id

VPS Ubuntu 24.04 + Nginx + systemd. Lihat `AETHERA_PRODUCT.md` untuk arsitektur lengkap.

## Brand

Nama aplikasi: **Aethera** (bukan "Aethera Face-ID" lagi). Cocok untuk semua sekolah Indonesia, bukan cuma sebagai aplikasi absensi.
