# 🎓 Aethera — Platform Manajemen Sekolah Modern

> **Bukan sekadar absensi. Ini ekosistem sekolah digital yang lengkap.**

---

## Daftar Isi

1. [Tentang Aethera](#tentang-aethera)
2. [Masalah yang Diselesaikan](#masalah-yang-diselesaikan)
3. [Fitur Lengkap](#fitur-lengkap)
4. [Tampilan per Role](#tampilan-per-role)
5. [Keunggulan vs Kompetitor](#keunggulan-vs-kompetitor)
6. [Spesifikasi Teknis](#spesifikasi-teknis)
7. [Harga & Paket](#harga--paket)
8. [Proses Implementasi](#proses-implementasi)
9. [Q&A](#qa)
10. [Kontak](#kontak)

---

## Tentang Aethera

**Aethera** adalah platform manajemen sekolah berbasis kecerdasan buatan yang menggabungkan:

- ✅ **Absensi otomatis** via pengenalan wajah (Face-ID)
- ✅ **Sistem disiplin & gamifikasi** (poin sikap, apresiasi, leaderboard)
- ✅ **LMS mini** (materi, tugas, nilai terintegrasi)
- ✅ **Dashboard cerdas** berbeda untuk tiap role (Kepsek, Wali Kelas, Guru BK, Siswa)
- ✅ **Notifikasi WhatsApp otomatis** ke orang tua
- ✅ **Analitik visual** real-time dengan grafik interaktif

Dibangun khusus untuk sekolah Indonesia — terminologi, alur kerja, dan fitur disesuaikan dengan kebutuhan nyata di lapangan.

---

## Masalah yang Diselesaikan

### ❌ Kondisi Sekolah Saat Ini (Sebelum Aethera)

| Masalah | Dampak |
|---|---|
| Absensi manual / kartu / fingerprint → input CSV manual ke sistem | Buang waktu TU 1-2 jam/hari, rawan human error |
| Sistem disiplin (SIMMICO) kaku, tidak ada gamifikasi | Siswa tidak termotivasi, guru tidak proaktif |
| Nilai dari PPT/Google Form → input manual satu per satu | Guru buang waktu, data sering terlambat |
| Tidak ada notifikasi real-time ke orang tua | Orang tua tidak tahu kondisi anak |
| Data tersebar di banyak platform (Classroom, Quizizz, SIMMICO) | Tidak ada satu sumber kebenaran |
| Kepala sekolah tidak punya dashboard eksekutif | Keputusan berdasarkan intuisi, bukan data |

### ✅ Solusi Aethera

- **Scan wajah → data langsung masuk** — tidak ada input manual
- **Gamifikasi disiplin** — siswa berlomba naik level, bukan takut hukuman
- **Import nilai dari CSV/XLSX** — guru upload file, sistem proses otomatis
- **WhatsApp ke orang tua** — notifikasi masuk/pulang, terlambat, absen
- **Satu platform** — absensi + disiplin + nilai + materi + komunikasi
- **Dashboard per role** — tiap pengguna lihat yang relevan untuk mereka

---

## Fitur Lengkap

### 🔐 Absensi Face-ID

- **Kiosk mode** — halaman publik, tidak perlu login, scan wajah langsung
- **Pengenalan wajah AI** menggunakan model ArcFace (512-dimensi embedding) + SCRFD detector
- **Anti-spoofing** — deteksi foto statis vs wajah asli
- **Geofencing** — absensi hanya bisa dilakukan dalam radius lokasi sekolah
- **Snapshot otomatis** — foto tersimpan sebagai bukti setiap absensi
- **Notifikasi WhatsApp** ke orang tua setelah check-in/check-out
- **Voice greeting** — sapaan suara personal setelah scan berhasil ("Selamat pagi Hafiz, kamu hadir 12 menit lebih awal!")
- **Confetti celebration** — animasi perayaan saat siswa capai milestone

### 🏆 Gamifikasi & Disiplin

- **Poin Sikap** — mulai dari 100, berkurang saat pelanggaran, bisa dipulihkan
- **Poin Apresiasi** — akumulasi dari prestasi, baksos, kepemimpinan
- **XP & Level System** — 6 level (Pemula → Rajin → Konsisten → Teladan → Master → Legendaris)
- **Streak kehadiran** — counter hari beruntun hadir tepat waktu
- **Quest mingguan** — 4 misi per minggu dengan reward XP
- **Mood check-in** — siswa lapor suasana hati, BK lihat agregat
- **Badge visual** — 6 jenis badge (Hadir Sempurna, Top Akademik, Pahlawan Baksos, Early Bird, Rising Star, Comeback Kid)

### 📊 Papan Peringkat (Leaderboard)

- **3 kategori siswa**: Nilai Terbaik, Siswa Paling Rajin, Pahlawan Baksos
- **Peringkat kelas** — skor komposit dari GPA + sikap + apresiasi + ketepatan waktu
- **Podium visual** gold/silver/bronze dengan animasi
- **Filter per kelas** — wali kelas lihat kelasnya saja
- **Terintegrasi dengan nilai** — GPA di leaderboard otomatis update saat guru input nilai

### 📚 LMS Mini (Pembelajaran)

- **Mata pelajaran** — CRUD oleh kepsek/admin
- **Materi pembelajaran** — guru upload PDF, PPT, Word, video (max 50MB)
- **Tugas & Kuis** — 5 jenis (Tugas, Kuis, Ulangan, UTS, UAS) dengan bobot berbeda
- **Input nilai manual** — guru ketik langsung di tabel
- **Import nilai dari CSV/XLSX** — upload file → preview valid/invalid → commit
- **Download template CSV** — pre-filled nama & NIS siswa, guru tinggal isi nilai
- **Gradebook** — matrix nilai siswa × tugas dalam satu tampilan
- **GPA otomatis** — weighted average dari semua tugas, update leaderboard

### 📋 Sistem KTS (Ketidaksesuaian Siswa)

- **Katalog 10 jenis pelanggaran** dengan hukuman terkunci (auto-fill)
- **Approval workflow** — pelanggaran berat butuh persetujuan kepsek
- **Catatan privat BK** — hanya guru BK & kepsek yang bisa lihat
- **Ledger double-entry** — log pelanggaran (merah) vs penyesuaian (hijau)
- **Hutang jam** — kersos & lembur/bengkel tercatat dan bisa dilunasi

### 📱 Dashboard per Role

#### 👑 Kepala Sekolah
- KPI sekolah-wide (8 metrik)
- Tren kehadiran 7 hari (area chart)
- Tren kehadiran 6 minggu (grouped bar chart)
- Top 5 jenis KTS (donut chart)
- Severity breakdown (ringan/sedang/berat)
- Heatmap pola disiplin (hari × jam)
- Ranking kelas terbaik & butuh perhatian
- Pending approvals & watch list alert
- 8 pintasan cepat

#### 🏫 Wali Kelas
- Snapshot kehadiran kelas hari ini
- Tren kehadiran 6 minggu (bar chart)
- Distribusi sikap siswa (donut chart)
- Rata-rata nilai per mata pelajaran (bar chart)
- Daftar siswa dengan GPA, sikap, apresiasi
- 6 pintasan cepat

#### 🩺 Guru BK
- Triage kasus aktif dengan risk score
- Tren kasus 8 minggu (bar chart)
- Kategori pelanggaran 30 hari (donut chart)
- Tren mood harian 7 hari (bar chart)
- Distribusi mood siswa (5 emoji)
- 6 pintasan cepat

#### 🎓 Siswa
- XP bar dengan level & progress
- Streak counter (gaya Duolingo)
- Recap harian personal
- 3 metric ring (GPA, Sikap, Apresiasi)
- Distribusi kehadiran 30 hari (donut)
- XP mingguan (bar chart)
- Performa per mata pelajaran (bar chart)
- Peringkat di kelas (3 kategori)
- Quest mingguan (4 misi)
- Mood check-in

### 📣 Notifikasi & Komunikasi

- **WhatsApp otomatis** ke orang tua saat check-in/check-out
- **Template pesan** yang bisa dikustomisasi per sekolah
- **Variasi pesan** — random greeting/closing untuk hindari spam detection
- **Digest mingguan** — ringkasan otomatis tiap Senin 06:00 ke kepsek, wali kelas, BK
- **Manual trigger** — kepsek bisa kirim digest kapan saja

### 🔧 Manajemen Sekolah

- **Multi-role** — Kepsek, Wali Kelas, Guru BK, Siswa
- **Penugasan wali kelas** — kepsek assign guru ke kelas
- **Auto-scope** — wali kelas otomatis lihat data kelasnya saja
- **Manajemen kelas** — CRUD kelas, wali kelas, jadwal
- **Kalender libur** — nasional & sekolah
- **Pengaturan geofence** — per sekolah, bisa diubah kapan saja
- **Pengaturan face sensitivity** — 13 parameter tunable
- **Laporan CSV** — export kehadiran dengan filter tanggal

---

## Tampilan per Role

### Akun Demo

| Role | Email | Password | Akses |
|---|---|---|---|
| Kepala Sekolah | `admin@smk-aethera.id` | `admin123` | Full access |
| Wali Kelas | `wali@smk-aethera.id` | `wali123` | Kelas 11 IPA 1 |
| Guru BK | `bk@smk-aethera.id` | `bk123` | Konseling |
| Siswa | `hafiz.20240001@siswa.aethera.id` | `hafiz123` | Personal |

### Pola Login Siswa
Email: `<nama_depan>.<NIS>@siswa.aethera.id`
Password: `<nama_depan>123`

Contoh: `dewi.20240011@siswa.aethera.id` / `dewi123`

---

## Keunggulan vs Kompetitor

| Fitur | Aethera | SIMMICO | Google Classroom | Quizizz |
|---|---|---|---|---|
| Absensi Face-ID | ✅ | ❌ | ❌ | ❌ |
| Gamifikasi disiplin | ✅ | ❌ | ❌ | ✅ (terbatas) |
| Leaderboard kelas | ✅ | ❌ | ❌ | ❌ |
| Notifikasi WA orang tua | ✅ | ❌ | ❌ | ❌ |
| Import nilai CSV/XLSX | ✅ | ❌ | ❌ | ❌ |
| Dashboard per role | ✅ | ❌ | ❌ | ❌ |
| Approval workflow KTS | ✅ | ❌ | ❌ | ❌ |
| Catatan privat BK | ✅ | ❌ | ❌ | ❌ |
| Mood tracker siswa | ✅ | ❌ | ❌ | ❌ |
| Heatmap pola disiplin | ✅ | ❌ | ❌ | ❌ |
| Digest mingguan otomatis | ✅ | ❌ | ❌ | ❌ |
| Satu platform terintegrasi | ✅ | Parsial | ❌ | ❌ |
| Data tersimpan di server sendiri | ✅ | ✅ | ❌ | ❌ |
| Bisa diakses dari HP | ✅ (PWA) | ❌ | ✅ | ✅ |

---

## Spesifikasi Teknis

### Stack Teknologi

| Layer | Teknologi |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Recharts, GSAP |
| Backend | FastAPI (Python 3.12), SQLAlchemy async |
| Database | MySQL 8.0 |
| AI/ML | ArcFace (ONNX), SCRFD face detector |
| WhatsApp | Baileys (Node.js, self-hosted) |
| Deployment | VPS Ubuntu 24.04, Nginx, systemd |

### Persyaratan Server

**Minimum (hingga 500 siswa):**
- CPU: 2 core
- RAM: 4 GB
- Storage: 50 GB SSD
- Bandwidth: 100 Mbps

**Rekomendasi (500-2000 siswa):**
- CPU: 4 core
- RAM: 8 GB
- Storage: 100 GB SSD
- Bandwidth: 200 Mbps

### Persyaratan Kiosk (Perangkat Absensi)

- Perangkat: Tablet/PC dengan kamera depan minimal 2MP
- Browser: Chrome/Edge terbaru
- Koneksi: WiFi stabil (minimal 5 Mbps)
- Tidak perlu aplikasi khusus — cukup buka browser

### Keamanan

- JWT authentication dengan refresh token
- Password di-hash dengan bcrypt
- Face embedding di-enkripsi (XOR obfuscation)
- HTTPS via Let's Encrypt (auto-renew)
- Audit log untuk semua aksi penting
- Geofencing untuk mencegah absensi dari luar sekolah

---

## Harga & Paket

> *Harga bersifat indikatif dan dapat disesuaikan dengan kebutuhan sekolah.*

### 🥉 Paket Starter
**Rp 2.500.000 / tahun**

Cocok untuk: Sekolah kecil (< 200 siswa)

- ✅ Absensi Face-ID (1 kiosk)
- ✅ Notifikasi WhatsApp orang tua
- ✅ Dashboard siswa & admin
- ✅ Laporan kehadiran CSV
- ✅ Support via WhatsApp (jam kerja)
- ❌ Gamifikasi & leaderboard
- ❌ LMS (materi & nilai)
- ❌ Dashboard per role

---

### 🥈 Paket Sekolah
**Rp 6.000.000 / tahun**

Cocok untuk: Sekolah menengah (200-800 siswa)

- ✅ Semua fitur Starter
- ✅ Gamifikasi lengkap (XP, level, quest, badge)
- ✅ Leaderboard siswa & kelas
- ✅ Sistem KTS & approval workflow
- ✅ Dashboard per role (Kepsek, Wali Kelas, BK, Siswa)
- ✅ LMS mini (materi, tugas, nilai, gradebook)
- ✅ Import nilai CSV/XLSX
- ✅ Digest mingguan otomatis
- ✅ Heatmap & analitik lanjutan
- ✅ Support prioritas (respons < 4 jam)
- ✅ Training onboarding (2 sesi)

---

### 🥇 Paket Enterprise
**Harga negosiasi**

Cocok untuk: Yayasan / Grup sekolah (> 800 siswa atau multi-sekolah)

- ✅ Semua fitur Sekolah
- ✅ Multi-sekolah dalam satu platform
- ✅ Custom domain & branding
- ✅ Integrasi dengan sistem existing (SIMMICO, dll)
- ✅ Dedicated server
- ✅ SLA 99.9% uptime
- ✅ Support 24/7
- ✅ Training onboarding (unlimited)
- ✅ Pengembangan fitur custom

---

### 💡 Add-on (Opsional)

| Add-on | Harga |
|---|---|
| Kiosk tambahan (per unit) | Rp 500.000 / tahun |
| Penyimpanan ekstra (per 100GB) | Rp 300.000 / tahun |
| Integrasi custom (per endpoint) | Rp 1.500.000 sekali bayar |
| Training tambahan (per sesi) | Rp 500.000 / sesi |

---

## Proses Implementasi

### Timeline Standar (2-3 Minggu)

```
Minggu 1: Setup & Konfigurasi
├── Hari 1-2 : Setup server & domain
├── Hari 3   : Konfigurasi database & backup
├── Hari 4   : Setup WhatsApp gateway
└── Hari 5   : Testing internal

Minggu 2: Onboarding Data
├── Hari 1-2 : Import data siswa (dari Excel/CSV sekolah)
├── Hari 3   : Setup kelas, jadwal, wali kelas
├── Hari 4   : Enrollment wajah siswa (batch)
└── Hari 5   : Testing dengan data nyata

Minggu 3: Go-Live & Training
├── Hari 1-2 : Training kepsek & admin
├── Hari 3   : Training wali kelas & BK
├── Hari 4   : Sosialisasi ke siswa
└── Hari 5   : Go-live & monitoring
```

### Yang Dibutuhkan dari Sekolah

1. **Data siswa** dalam format Excel (nama, NIS, kelas, HP orang tua, email)
2. **Data guru** (nama, email, kelas yang dipegang)
3. **Jadwal sekolah** (jam masuk, jam pulang, hari aktif)
4. **Koordinat GPS** lokasi sekolah (untuk geofencing)
5. **Nomor WhatsApp** yang akan dipakai untuk notifikasi
6. **Perangkat kiosk** (tablet/PC dengan kamera)

---

## Q&A

### 🔧 Teknis

**Q: Apakah perlu internet untuk absensi?**
A: Ya, kiosk membutuhkan koneksi internet untuk mengirim data ke server. Namun jika koneksi terputus sesaat, sistem akan retry otomatis. Untuk sekolah dengan koneksi tidak stabil, kami bisa setup mode offline dengan sync berkala.

**Q: Berapa akurasi pengenalan wajah?**
A: Menggunakan model ArcFace (state-of-the-art), akurasi di atas 99% dalam kondisi pencahayaan normal. Sistem juga punya anti-spoofing untuk mencegah penggunaan foto. Threshold bisa disesuaikan per sekolah.

**Q: Apakah bisa diakses dari HP siswa?**
A: Ya, Aethera adalah Progressive Web App (PWA) — bisa diakses dari browser HP tanpa install aplikasi. Siswa bisa lihat tugas, nilai, status disiplin, dan leaderboard dari HP mereka.

**Q: Berapa kapasitas maksimal siswa?**
A: Paket Starter mendukung hingga 200 siswa, Paket Sekolah hingga 800 siswa. Untuk lebih dari itu, kami upgrade spesifikasi server. Tidak ada batasan teknis yang keras.

**Q: Apakah data aman? Siapa yang bisa akses?**
A: Data tersimpan di server yang dikontrol sekolah (bukan cloud pihak ketiga). Enkripsi HTTPS, password di-hash, face embedding di-enkripsi. Hanya pengguna dengan akun yang bisa akses, dan tiap role hanya lihat data yang relevan.

**Q: Bagaimana kalau server mati?**
A: Backup otomatis setiap hari jam 02:00. Semua service auto-start saat server reboot. Untuk Paket Enterprise, kami sediakan SLA 99.9% uptime dengan monitoring 24/7.

**Q: Apakah bisa integrasi dengan SIMMICO?**
A: Saat ini belum ada integrasi langsung, tapi data kehadiran bisa di-export ke CSV yang kompatibel dengan format SIMMICO. Integrasi API custom tersedia sebagai add-on.

---

### 📚 Fitur

**Q: Bagaimana cara guru input nilai dari Google Form atau Quizizz?**
A: Export hasil Google Form/Quizizz ke Excel/CSV, lalu upload ke Aethera. Sistem akan preview baris valid/invalid sebelum disimpan. Format yang dibutuhkan: kolom NIS, Nama, Nilai, Catatan (opsional).

**Q: Apakah siswa bisa lihat nilai mereka?**
A: Ya. Siswa login ke akun mereka, buka menu "Tugas Saya" untuk lihat semua tugas beserta nilai. Nilai juga muncul di "Status Saya" dalam bentuk grafik performa per mata pelajaran.

**Q: Bagaimana kalau siswa tidak punya HP untuk mood check-in?**
A: Mood check-in bersifat opsional. Siswa yang tidak check-in tidak akan kena penalti. Guru BK hanya lihat agregat dari yang check-in.

**Q: Apakah leaderboard bisa dimatikan?**
A: Ya, kepsek bisa mengatur visibilitas fitur. Leaderboard bisa dibatasi hanya untuk admin, atau dinonaktifkan sepenuhnya.

**Q: Bagaimana kalau wajah siswa berubah (kacamata, rambut baru)?**
A: Sistem menggunakan multiple enrollment frames (minimal 3 foto dari sudut berbeda). Perubahan penampilan minor biasanya masih dikenali. Jika tidak, admin bisa re-enroll wajah siswa dalam 2-3 menit.

**Q: Apakah bisa absensi dari HP siswa sendiri (BYOD)?**
A: Ya, dengan geofencing aktif. Siswa buka browser di HP, akses halaman kiosk, scan wajah. Sistem akan verifikasi lokasi GPS sebelum menerima absensi.

---

### 💰 Bisnis

**Q: Apakah ada biaya setup awal?**
A: Tidak ada biaya setup terpisah untuk Paket Sekolah dan Enterprise. Biaya sudah termasuk instalasi, konfigurasi, dan training. Untuk Paket Starter, ada biaya setup Rp 500.000 sekali bayar.

**Q: Apakah bisa trial dulu?**
A: Ya, kami menyediakan demo environment selama 30 hari gratis dengan data dummy. Sekolah bisa coba semua fitur sebelum memutuskan berlangganan.

**Q: Bagaimana sistem pembayaran?**
A: Pembayaran tahunan di muka via transfer bank. Untuk Paket Enterprise, bisa dinegosiasikan pembayaran per semester atau per kuartal.

**Q: Apakah ada diskon untuk yayasan dengan banyak sekolah?**
A: Ya, untuk 3+ sekolah dalam satu yayasan ada diskon 20%. Untuk 5+ sekolah, diskon 30%. Hubungi kami untuk penawaran khusus.

**Q: Apa yang terjadi kalau tidak perpanjang langganan?**
A: Data sekolah tetap aman dan bisa di-export. Akses ke platform akan dinonaktifkan, tapi data tidak dihapus selama 90 hari setelah masa berakhir.

**Q: Apakah ada garansi?**
A: Kami memberikan garansi kepuasan 30 hari. Jika dalam 30 hari pertama sekolah tidak puas, kami kembalikan 100% pembayaran.

---

### 🏫 Implementasi

**Q: Berapa lama proses enrollment wajah untuk 500 siswa?**
A: Dengan 2 petugas dan 2 kiosk, enrollment 500 siswa bisa selesai dalam 1-2 hari sekolah. Setiap siswa butuh sekitar 2-3 menit untuk foto dari 3 sudut.

**Q: Bagaimana kalau ada siswa baru di tengah tahun?**
A: Admin bisa tambah siswa baru kapan saja melalui menu "Siswa". Enrollment wajah bisa dilakukan langsung setelah akun dibuat.

**Q: Apakah guru perlu training khusus?**
A: Tidak perlu training teknis yang panjang. Interface dirancang intuitif. Training standar 2-3 jam sudah cukup untuk semua role. Kami juga menyediakan video tutorial dan dokumentasi.

**Q: Bagaimana kalau ada masalah teknis saat jam sekolah?**
A: Untuk Paket Sekolah, support via WhatsApp dengan respons < 4 jam. Untuk Enterprise, ada hotline 24/7. Selain itu, sistem dirancang dengan fallback — jika kiosk bermasalah, admin bisa input absensi manual.

---

## Kontak

**Untuk demo, pertanyaan, atau penawaran:**

- 📧 Email: [isi email kamu]
- 📱 WhatsApp: [isi nomor kamu]
- 🌐 Website: [isi website kamu]
- 📍 Lokasi: [isi kota kamu]

**Demo live tersedia setiap hari kerja, Senin–Jumat 09:00–17:00 WIB.**

Kami dengan senang hati akan mendemonstrasikan semua fitur secara langsung dan menjawab pertanyaan spesifik tentang kebutuhan sekolah Anda.

---

## Tentang Pengembang

Aethera dikembangkan oleh tim yang berpengalaman di bidang pengembangan software pendidikan dan kecerdasan buatan. Kami memahami tantangan nyata yang dihadapi sekolah Indonesia dan membangun solusi yang benar-benar menjawab kebutuhan tersebut — bukan sekadar adaptasi produk luar negeri.

---

*Dokumen ini terakhir diperbarui: Mei 2026*
*Versi aplikasi: 1.0.0*
*Hak cipta © 2026 Aethera. Semua hak dilindungi.*
