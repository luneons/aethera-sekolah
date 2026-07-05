# PRD — Aethera (Platform Manajemen Sekolah)

> **Tujuan dokumen.** Blueprint produk + teknis agar di masa depan bisa membangun
> ulang aplikasi serupa (manajemen sekolah / SaaS multi-modul) dengan cepat.
> Dokumen ini menggabungkan *apa* yang dibangun (produk) dan *bagaimana* (arsitektur,
> konvensi, keputusan). Bukan tutorial langkah-demi-langkah — itu ada di
> `Panduan_Developer_Aethera` Vol 1–3.

- **Versi PRD:** 1.0
- **Status produk acuan:** live di `aethera.my.id`
- **Pemilik:** Andy Siswanto A.B (Founder)

---

## 1. Ringkasan Produk

**Aethera** adalah platform manajemen sekolah *all-in-one* berbasis web (+ PWA/Android)
yang menyatukan operasional sekolah ke satu sistem: absensi pengenalan wajah (AI),
pembayaran SPP online, LMS & rapor, disiplin & gamifikasi, komunikasi orang tua, dan
belasan modul layanan sekolah.

**Masalah yang dipecahkan**
- Sekolah memakai banyak aplikasi terpisah (absensi, keuangan, nilai, komunikasi) yang tidak terhubung.
- Proses manual (rekap absensi, kuitansi kertas, buku penghubung) memakan waktu & rawan salah.
- Orang tua tidak tahu kondisi anak secara real-time.
- Keputusan kepala sekolah tanpa data ringkas.

**Solusi inti**
- Satu platform, satu sumber kebenaran data, dengan dashboard per peran + ringkasan AI.

**Prinsip desain produk**
1. **Satu platform terpadu** — hindari fitur jadi pulau-pulau terpisah.
2. **Dark-first "Cyber-Biometric"** — lihat `design.md`.
3. **Mobile-friendly + PWA** — bisa dipakai dari HP tanpa instal.
4. **Aman & privat** — data sensitif (wajah) terenkripsi, akses berjenjang.
5. **Otomatis** — kurangi kerja manual (notifikasi, rekonsiliasi, penjadwalan).

---

## 2. Target Pengguna & Peran (Roles)

Empat peran inti. **Nama di kode berbeda dengan sebutan di UI** — selalu pakai nama kode untuk logika akses.

| Role (kode) | Sebutan UI | Kebutuhan utama |
|---|---|---|
| `super_admin` | Kepala Sekolah | Pantau metrik sekolah-wide, ambil keputusan, atur sistem |
| `admin` | Wali Kelas / Guru | Kelola kelas yang dipegang, absensi & nilai |
| `hr` | Guru BK | Konseling, deteksi dini, watchlist kesejahteraan siswa |
| `employee` | Siswa | Data pribadi: absensi, nilai, tagihan, tugas |

Peran tambahan di luar tabel `users`:
- **Orang Tua** — login terpisah (`parent_accounts`), portal read-only data anak + bayar SPP.
- **Calon Siswa (PPDB)** — publik, tanpa login, mendaftar lewat halaman publik.

**Aturan akses**
- Backend: dekorator `require_roles(...)` per endpoint.
- Wali kelas otomatis "di-scope" ke kelasnya (`homeroom_scope()`), kepsek/BK lihat semua.
- Frontend: menu sidebar dibangun per role; halaman cek `user.role` lalu redirect bila tak berhak.

---

## 3. Lingkup Fitur (Feature Scope)

Modul ditandai prioritas: **P0** = inti (MVP), **P1** = penting, **P2** = pelengkap.

### 3.1 Absensi & Kehadiran
- **P0 Absensi wajah AI** — pengenalan wajah (ArcFace) + anti-foto palsu (liveness).
- **P0 Absensi QR** — kartu QR unik per siswa/guru (alternatif bila HP tak mendukung Face-ID).
- **P0 Mode absensi** — admin pilih metode (wajah / QR / manual / impor CSV), bisa per-siswa.
- **P0 Jam masuk/pulang & toleransi** — jadwal kerja + status tepat/telat otomatis.
- **P1 Geofencing** — absen hanya sah dalam radius sekolah.
- **P1 Perizinan online** — izin/sakit + unggah bukti, approval, sinkron ke absensi.
- **P1 Absensi per mata pelajaran** + jurnal mengajar.
- **P2 Notifikasi WhatsApp** ke orang tua saat anak tiba/pulang.

### 3.2 Akademik (LMS)
- **P1 Mata pelajaran & penugasan mengajar.**
- **P1 Materi pelajaran** (PDF/PPT/video).
- **P1 Tugas & nilai** (input manual + impor Excel/CSV) → **gradebook** matriks.
- **P1 Kuis/Ujian online (CBT)** dengan anti-curang (acak soal, deteksi pindah tab, lock).
- **P1 Rapor digital** PDF otomatis.
- **P1 Jadwal pelajaran** (timetable kelas × hari × jam).

### 3.3 Keuangan
- **P0 Tagihan & SPP** — kategori, tagihan massal per kelas/angkatan.
- **P0 Pembayaran online** — payment gateway (VA/QRIS/e-wallet), status lunas otomatis via webhook.
- **P1 Pembayaran manual** + laporan keuangan & collection rate.

### 3.4 Disiplin & Kesiswaan
- **P1 Poin disiplin/KTS** + apresiasi.
- **P1 Gamifikasi** — XP, level, streak, quest, leaderboard siswa & kelas.
- **P1 Konseling BK** — booking (bisa anonim) + catatan privat.
- **P1 Mood tracker** — deteksi dini.
- **P2 Ekstrakurikuler, UKS/klinik.**

### 3.5 Komunikasi & Layanan
- **P1 Chat internal** termoderasi (siswa/ortu ↔ wali kelas).
- **P1 Notifikasi (Web Push)** + pengumuman/broadcast.
- **P1 Portal orang tua** — pantau kehadiran/nilai/tagihan.
- **P2 Perpustakaan, surat otomatis, inventaris aset, acara sekolah (RSVP), PPDB online.**

### 3.6 Sistem & Analitik
- **P0 Auth** (login, token, refresh) + **P1 2FA** opsional.
- **P0 Dashboard per peran.**
- **P1 AI Insight** — ringkasan mingguan otomatis (LLM).
- **P1 Laporan & ekspor CSV.**
- **P1 Audit log** + **P1 manajemen pengguna & organisasi**.

> **Saran MVP untuk produk baru:** mulai dari P0 (Auth + Absensi inti + Mode + Tagihan/Bayar +
> Dashboard). Tambah modul lain secara bertahap memakai pola yang sama (lihat §7).

---

## 4. Arsitektur Teknis

### 4.1 Stack
| Lapisan | Teknologi | Alasan dipilih |
|---|---|---|
| Frontend | Next.js 14 (App Router) + React + TypeScript | SSR/route mudah, ekosistem besar, PWA-ready |
| Styling | Tailwind CSS | konsisten, cepat, theming via config |
| State server | TanStack React Query | cache, refetch, loading state otomatis |
| State global | Zustand (+ persist) | ringan, simpan sesi user |
| Animasi | GSAP | efek "cyber" terkontrol |
| Backend | FastAPI (Python), async penuh | cepat, async, `/docs` otomatis |
| ORM/DB | SQLAlchemy (async) + MySQL 8 | matang, relasional |
| AI wajah | ONNX Runtime (SCRFD + ArcFace) | jalan lokal, tanpa biaya per-panggil |
| Jadwal | APScheduler (in-app) + cron Linux | tugas berkala |
| Notifikasi | Web Push (VAPID) + WhatsApp (Baileys gateway) | gratis/murah, real-time |
| Pembayaran | Midtrans (Snap + webhook) | populer di Indonesia |
| AI Insight | OpenRouter (LLM, model gratis) | ringkasan teks |
| Deploy | VPS Linux + Nginx + systemd + Let's Encrypt | sederhana, hemat |

### 4.2 Topologi
```
Browser/PWA/Android
      │ HTTPS
   [ Nginx ]  reverse proxy + TLS
   ├── / ............ Frontend Next.js (port 3000)
   ├── /v1/* ........ Backend FastAPI (port 8001)
   └── (statis terlindungi: /snapshots, /proofs, /letters-files via token)
        │
   [ MySQL 8 ]   [ WA Gateway Baileys (port 3001) ]
```

### 4.3 Prinsip arsitektur
- **Pemisahan tegas** frontend ↔ backend, komunikasi via REST `/v1`.
- **Envelope respons seragam**: `{success, data, meta?, error?}`.
- **Router tipis, service tebal**: logika berat di `services/`.
- **Async end-to-end**: semua endpoint `async def`, DB pakai `await`.
- **Konfigurasi via `.env`** (12-factor), divalidasi saat start (mis. SECRET_KEY wajib kuat).
- **Versioning API** lewat prefix `/v1` agar mudah berevolusi.

---

## 5. Model Data (Konsep)

Tabel pusat **`users`** (semua orang; `role` menentukan akses). Relasi penting:
`users.school_class_id` (kelas siswa), `users.homeroom_class_id` (kelas yang diampu wali),
`users.parent_phone` (untuk WA), `parent_links` (ortu↔anak).

Kelompok tabel (≈66 tabel di produk acuan):
- **Organisasi & setelan:** organizations, *_geofence/face/whatsapp/attendance_settings, departments, school_classes, work_schedules, holidays, cameras.
- **Pengguna & auth:** users, user_auth, token_blacklist, face_embeddings, parent_accounts, parent_links, audit_logs, push_subscriptions, app_notifications.
- **Absensi:** attendance_records, subject_attendance, leave_requests.
- **Akademik:** subjects, teaching_assignments, lesson_materials, assignments, assignment_grades, quiz_questions, quiz_attempts, timetable_slots.
- **Disiplin:** violation_types, appreciation_types, discipline_profiles, discipline_incidents, mood_checkins, bk_notes, pending_approvals.
- **Keuangan:** bill_categories, bills (+ kolom `midtrans_*`), payments.
- **Layanan:** counseling_*, library_*, extracurricular*, school_events/event_rsvps, uks_*, inventory_*, letter_issues, admission_*, announcements/announcement_reads, chat_*, ai_insights.

**Pola data yang berulang:** tabel induk + tabel anak (mis. library_books + library_loans);
status sebagai string ber-enum (lihat §9); timestamp `created_at`; soft references via ForeignKey.

---

## 6. Konvensi & Pola (kunci agar cepat membangun ulang)

**Pola "satu fitur = 6 lapis"** — semua fitur mengikuti ini, tinggal ganti nama:
1. **Model** — `backend/app/models.py` (class = tabel).
2. **Migrasi** — `_migrate_local.py` (lokal) / `_migrate.py` (produksi); idempotent, hanya menambah.
3. **Router** — `backend/app/routers/<fitur>.py` → endpoint `/v1/<fitur>`.
4. **Daftar** — `app.include_router(...)` di `main.py` (tanpa ini endpoint mati).
5. **lib API** — `frontend/src/lib/<fitur>Api.ts` (pakai `api` yang sudah inject token).
6. **Page + Menu** — `frontend/src/app/(dashboard)/<fitur>/page.tsx` + item di `Sidebar.tsx`.

**Urutan kerja:** dari data ke tampilan (model → migrasi → service → router → main.py → lib → page → menu → tes).

**Aturan praktis lain**
- Logika > 15 baris / dipakai >1 tempat / panggil layanan luar → taruh di `services/`.
- Validasi input pakai schema (Pydantic) — jangan percaya frontend.
- Query SQLAlchemy berparameter — jangan rangkai SQL manual.
- Tampilan pakai komponen `components/ui/` (Button/Card/Input) agar konsisten.
- Terminologi massal lewat `lib/terminology.ts`.

---

## 7. Rencana Membangun Ulang (Roadmap MVP → Lengkap)

**Fase 0 — Fondasi (1 minggu)**
- Setup repo (frontend Next.js + backend FastAPI + MySQL).
- Auth (login/token/refresh/me), envelope respons, `require_roles`, seed akun demo.
- Layout dashboard + sidebar per role + tema.

**Fase 1 — Inti absensi (1–2 minggu)**
- Model users/organization/classes/attendance.
- Absensi (mulai QR/manual dulu; wajah AI menyusul), jadwal jam masuk, status tepat/telat.
- Dashboard kehadiran + laporan dasar.

**Fase 2 — Keuangan (1 minggu)**
- Tagihan + pembayaran manual → lalu integrasi gateway + webhook.

**Fase 3 — Akademik & komunikasi (2–3 minggu)**
- LMS (materi/tugas/nilai/rapor), notifikasi (Web Push), portal/komunikasi ortu.

**Fase 4 — Lanjutan**
- Wajah AI (ArcFace), gamifikasi, AI insight, modul layanan (BK/perpus/UKS/PPDB/dll).

**Fase 5 — Produksi**
- Deploy (Nginx + systemd), backup, monitoring, 2FA, audit log, PWA.

> Tiap fitur baru = ulangi "6 lapis" di §6. Contek modul CRUD sederhana (inventory/library) sebagai template.

---

## 8. Kebutuhan Non-Fungsional

- **Keamanan:** password hashed; token JWT akses+refresh; data wajah disimpan sebagai *embedding terenkripsi* (bukan foto); file sensitif diproteksi token; 2FA opsional; rate limiter pada login; audit log.
- **Privasi:** data milik sekolah, dapat diekspor; PII diminimalkan; embedding tidak bisa dibalik jadi foto.
- **Performa:** async; hindari N+1 (ambil sekali, petakan); cache (React Query di FE, XP cache di BE).
- **Keandalan:** service auto-restart (systemd); scheduler punya `misfire_grace_time`; webhook idempotent.
- **Skalabilitas:** single-VPS cukup untuk 1 sekolah; untuk multi-tenant besar → pindah scheduler ke runner eksternal, pertimbangkan DB terpisah per tenant.
- **Aksesibilitas:** target WCAG 2.1 AA; mobile-first; PWA installable.
- **Observability:** log via journalctl; health endpoint `/v1/health`.

---

## 9. Lampiran — Nilai Enum/Status Baku

| Konteks | Nilai sah |
|---|---|
| Role | `super_admin`, `admin`, `hr`, `employee` |
| Status kehadiran | `present`, `late`, `absent`, `sick`, `permit`, `leave` |
| Izin: kind / status | `sakit`/`izin`/`lainnya` ; `pending`/`approved`/`rejected`/`cancelled` |
| Tagihan | belum lunas / lunas (+ `midtrans_status`) |
| Pinjaman perpus | `borrowed`, `overdue`, `returned` |
| Tipe tugas | `tugas`, `quiz` |
| Audience acara/broadcast | `siswa`, `guru`, `kelas`, `ortu` |

---

## 10. Keputusan Desain Penting (Lessons Learned)

Catatan agar tidak mengulang jebakan saat membangun ulang:
1. **Webhook pembayaran pakai path `/v1/...` bukan `/api/v1/...`** — salah prefix = status tak pernah update.
2. **Bersihkan cache React Query saat login/logout** — kalau tidak, data akun lama "nyangkut" saat ganti akun di tab sama.
3. **SECRET_KEY wajib kuat** — divalidasi saat start; server menolak default lemah.
4. **DB lokal & produksi terpisah** — setiap perubahan model wajib dimigrasi di keduanya; migrator idempotent (hanya menambah).
5. **Embedding wajah, bukan foto** — lebih privat & ringan; kunci enkripsi jangan diganti setelah ada data (kalau ganti, semua harus enroll ulang).
6. **Nama role di kode ≠ sebutan UI** — sumber bug akses; selalu pakai nama kode untuk logika.
7. **Mode absensi fleksibel per-siswa** — karena tidak semua HP mendukung Face-ID (QR sebagai fallback).
8. **Gateway WhatsApp pakai nomor asli** — perlu variasi pesan + antrean agar tidak diblokir; jangan dijadikan spam.
9. **Router tipis, service tebal** — memudahkan dipakai ulang (scheduler & router berbagi service yang sama).

---

## 11. Referensi Dokumen Terkait

| Dokumen | Isi |
|---|---|
| `design.md` | Sistem desain UI (warna, font, komponen) |
| `Panduan_Developer_Aethera.docx` (Vol 1) | Dasar: setup → arsitektur → tambah fitur → deploy dasar |
| `Panduan_Developer_Aethera_Vol2.docx` | Lanjut: AI, scheduler, notif/WA, bayar, frontend lanjut, testing, deploy nyata |
| `Panduan_Developer_Aethera_Vol3.docx` | Referensi: model DB, API (325 endpoint), cookbook resep |
| `Panduan_Developer_Aethera_Indeks.docx` | Peta navigasi semua volume |

---

*Akhir PRD. Untuk membangun produk serupa: tentukan modul P0 (§3), ikuti stack (§4) & pola 6-lapis (§6), bangun bertahap sesuai roadmap (§7), dan hindari jebakan di §10.*


---

## Lampiran A — ERD Ringkas (Hubungan Tabel Utama)

Diagram relasi inti (format Mermaid — render otomatis di GitHub/VS Code dengan
ekstensi Mermaid). Hanya tabel utama; tabel layanan lain mengikuti pola serupa
(ForeignKey ke `users.id` dan/atau `school_classes.id`).

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ USERS : "punya"
    ORGANIZATIONS ||--o{ SCHOOL_CLASSES : "punya"
    ORGANIZATIONS ||--o{ DEPARTMENTS : "punya"
    ORGANIZATIONS ||--|| ORG_WHATSAPP_SETTINGS : "setelan"
    ORGANIZATIONS ||--|| ORG_GEOFENCE_SETTINGS : "setelan"

    SCHOOL_CLASSES ||--o{ USERS : "berisi siswa"
    USERS ||--|| USER_AUTH : "kredensial"
    USERS ||--o{ FACE_EMBEDDINGS : "sidik wajah"
    USERS ||--o{ ATTENDANCE_RECORDS : "kehadiran"
    USERS ||--o{ LEAVE_REQUESTS : "izin"
    USERS ||--o{ ASSIGNMENT_GRADES : "nilai"
    USERS ||--o{ BILLS : "tagihan"
    USERS ||--|| DISCIPLINE_PROFILES : "poin sikap"
    USERS ||--o{ DISCIPLINE_INCIDENTS : "kejadian"
    USERS ||--o{ PUSH_SUBSCRIPTIONS : "perangkat push"
    USERS ||--o{ APP_NOTIFICATIONS : "notifikasi"

    PARENT_ACCOUNTS ||--o{ PARENT_LINKS : "tautan"
    USERS ||--o{ PARENT_LINKS : "anak"

    SUBJECTS ||--o{ TEACHING_ASSIGNMENTS : "diampu"
    USERS ||--o{ TEACHING_ASSIGNMENTS : "guru"
    SCHOOL_CLASSES ||--o{ TEACHING_ASSIGNMENTS : "di kelas"
    SUBJECTS ||--o{ ASSIGNMENTS : "tugas"
    ASSIGNMENTS ||--o{ ASSIGNMENT_GRADES : "nilai"
    ASSIGNMENTS ||--o{ QUIZ_QUESTIONS : "soal"
    ASSIGNMENTS ||--o{ QUIZ_ATTEMPTS : "percobaan"
    SCHOOL_CLASSES ||--o{ TIMETABLE_SLOTS : "jadwal"
    TIMETABLE_SLOTS ||--o{ SUBJECT_ATTENDANCE : "absensi mapel"

    BILL_CATEGORIES ||--o{ BILLS : "kategori"
    BILLS ||--o{ PAYMENTS : "pembayaran"

    VIOLATION_TYPES ||--o{ DISCIPLINE_INCIDENTS : "jenis"
    APPRECIATION_TYPES ||--o{ DISCIPLINE_INCIDENTS : "jenis"
```

**Cara baca relasi:**
- `||--o{` = satu ke banyak (mis. 1 kelas berisi banyak siswa).
- `||--||` = satu ke satu (mis. 1 user punya 1 baris kredensial).
- Tabel `users` adalah hub: hampir semua data sekolah merujuk ke sini lewat ForeignKey.

**Relasi penting yang sering bikin bug:**
- `users.school_class_id` → kelas tempat siswa belajar.
- `users.homeroom_class_id` → kelas yang *diampu* wali kelas (beda kolom!).
- `parent_links` = tabel jembatan many-to-many antara `parent_accounts` ↔ `users` (anak).

---

## Lampiran B — Skeleton Boilerplate (Auth + 1 Fitur)

Kerangka minimum untuk memulai proyek serupa dari nol. Ini bukan kode lengkap
Aethera, tapi *cetakan* mengikuti konvensi §6 yang bisa langsung di-copy lalu
dikembangkan. Ganti `notes`/`Note` dengan nama fiturmu.

### B.1 Struktur folder minimum

```
proyek/
  backend/
    app/
      main.py          # entry + daftar router + CORS + error handler
      config.py        # baca .env
      database.py      # engine + session async
      security.py      # hash, token, get_current_user, require_roles
      models.py        # semua tabel
      schemas.py       # Envelope + schema per fitur
      routers/
        auth.py
        notes.py       # contoh 1 fitur
    requirements.txt
    .env
  frontend/
    src/
      lib/api.ts       # axios + interceptor token
      lib/notesApi.ts  # contoh
      stores/useAuthStore.ts
      app/(dashboard)/notes/page.tsx
```

### B.2 Backend — `config.py`

```python
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)
    APP_NAME: str = "MyApp"
    SECRET_KEY: str = "change-me"          # wajib >=32 char acak di .env
    DATABASE_URL: str = "mysql+aiomysql://root:pass@localhost:3306/myapp"
    CORS_ORIGINS: str = "http://localhost:3000"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    @property
    def cors_list(self): return [o.strip() for o in self.CORS_ORIGINS.split(",")]

@lru_cache
def get_settings(): return Settings()
settings = get_settings()
```

### B.3 Backend — `database.py`

```python
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase): pass

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
```

### B.4 Backend — `security.py` (inti auth)

```python
from datetime import datetime, timedelta
from typing import Annotated
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.database import get_db
from app.models import User

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2 = OAuth2PasswordBearer(tokenUrl="/v1/auth/login")

def hash_password(p): return pwd.hash(p)
def verify_password(p, h): return pwd.verify(p, h)

def create_token(sub: str, kind: str = "access"):
    exp = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": sub, "kind": kind, "exp": exp}, settings.SECRET_KEY, "HS256")

def decode_token(token, kind="access"):
    data = jwt.decode(token, settings.SECRET_KEY, ["HS256"])
    if data.get("kind") != kind: raise ValueError("wrong token kind")
    return data

async def get_current_user(
    token: Annotated[str, Depends(oauth2)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    try:
        data = decode_token(token, "access")
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token tidak valid")
    user = (await db.execute(select(User).where(User.id == int(data["sub"])))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User tidak ada")
    return user

def require_roles(*roles: str):
    async def checker(current: Annotated[User, Depends(get_current_user)]) -> User:
        if current.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Butuh role: {', '.join(roles)}")
        return current
    return checker
```

### B.5 Backend — `models.py` (user + contoh fitur)

```python
from datetime import datetime
from sqlalchemy import Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import mapped_column
from app.database import Base

class User(Base):
    __tablename__ = "users"
    id = mapped_column(Integer, primary_key=True)
    full_name = mapped_column(String(120))
    email = mapped_column(String(120), unique=True)
    password_hash = mapped_column(String(255))
    role = mapped_column(String(20), default="employee")  # super_admin/admin/hr/employee

class Note(Base):                       # <- contoh 1 fitur
    __tablename__ = "notes"
    id = mapped_column(Integer, primary_key=True)
    author_id = mapped_column(ForeignKey("users.id"))
    text = mapped_column(Text)
    created_at = mapped_column(DateTime, default=datetime.utcnow)
```

### B.6 Backend — `schemas.py` (envelope seragam)

```python
from typing import Generic, Optional, TypeVar
from pydantic import BaseModel
T = TypeVar("T")

class Envelope(BaseModel, Generic[T]):
    success: bool = True
    data: Optional[T] = None
    message: Optional[str] = None

class NoteIn(BaseModel):
    text: str

class NoteOut(BaseModel):
    id: int
    text: str
    class Config: from_attributes = True
```

### B.7 Backend — `routers/auth.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import User
from app.security import verify_password, create_token, get_current_user

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/login")
async def login(payload: dict, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == payload["email"]))).scalar_one_or_none()
    if not user or not verify_password(payload["password"], user.password_hash):
        raise HTTPException(401, "Email atau password salah")
    return {"success": True, "data": {
        "access_token": create_token(str(user.id), "access"),
        "refresh_token": create_token(str(user.id), "refresh"),
    }}

@router.get("/me")
async def me(current: User = Depends(get_current_user)):
    return {"success": True, "data": {"id": current.id, "name": current.full_name, "role": current.role}}
```

### B.8 Backend — `routers/notes.py` (template CRUD 1 fitur)

```python
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import Note, User
from app.schemas import Envelope, NoteIn, NoteOut
from app.security import get_current_user, require_roles

router = APIRouter(prefix="/notes", tags=["Notes"])

@router.get("", response_model=Envelope[list[NoteOut]])
async def list_notes(db: AsyncSession = Depends(get_db),
                     current: User = Depends(get_current_user)):
    rows = (await db.execute(select(Note).order_by(Note.id.desc()))).scalars().all()
    return {"success": True, "data": rows}

@router.post("", response_model=Envelope[NoteOut])
async def create_note(payload: NoteIn,
                      current: User = Depends(require_roles("admin", "super_admin")),
                      db: AsyncSession = Depends(get_db)):
    note = Note(author_id=current.id, text=payload.text)
    db.add(note); await db.commit(); await db.refresh(note)
    return {"success": True, "data": note}
```

### B.9 Backend — `main.py`

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db
from app.routers import auth, notes

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list,
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/v1/health")
async def health(): return {"success": True, "data": {"status": "ok"}}

for r in (auth, notes):
    app.include_router(r.router, prefix="/v1")   # JANGAN lupa baris ini per fitur
```

### B.10 Frontend — `lib/api.ts` (axios + token)

```typescript
import axios from 'axios';
import { useAuthStore } from '@/stores/useAuthStore';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001/v1',
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
export interface Envelope<T> { success: boolean; data?: T; message?: string; }
```

### B.11 Frontend — `stores/useAuthStore.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  user: { id: number; name: string; role: string } | null;
  setSession: (t: string) => void;
  setUser: (u: AuthState['user']) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null, user: null,
      setSession: (accessToken) => set({ accessToken }),
      setUser: (user) => set({ user }),
      clear: () => set({ accessToken: null, user: null }),
    }),
    { name: 'myapp-auth' }
  )
);
```

### B.12 Frontend — `lib/notesApi.ts` + `notes/page.tsx`

```typescript
// lib/notesApi.ts
import api, { type Envelope } from './api';
export interface Note { id: number; text: string; }
export async function fetchNotes() {
  const r = await api.get<Envelope<Note[]>>('/notes'); return r.data.data ?? [];
}
export async function createNote(text: string) {
  const r = await api.post<Envelope<Note>>('/notes', { text }); return r.data;
}
```

```tsx
// app/(dashboard)/notes/page.tsx
'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchNotes, createNote } from '@/lib/notesApi';

export default function NotesPage() {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const { data: notes = [] } = useQuery({ queryKey: ['notes'], queryFn: fetchNotes });
  const m = useMutation({
    mutationFn: () => createNote(text),
    onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['notes'] }); },
  });
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Catatan</h1>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)}
               className="border rounded px-3 py-2 flex-1" placeholder="Tulis catatan..." />
        <button onClick={() => m.mutate()} className="px-4 py-2 rounded bg-cyan-600 text-white">
          Simpan
        </button>
      </div>
      <ul className="space-y-2">
        {notes.map((n) => <li key={n.id} className="border rounded p-3">{n.text}</li>)}
      </ul>
    </div>
  );
}
```

### B.13 Checklist memulai dari skeleton ini

1. `pip install fastapi uvicorn sqlalchemy aiomysql pydantic-settings "python-jose[cryptography]" "passlib[bcrypt]"`
2. Buat DB kosong + isi `.env` (DATABASE_URL, SECRET_KEY acak ≥32 char).
3. Jalankan backend: `uvicorn app.main:app --reload --port 8001` → cek `http://127.0.0.1:8001/docs`.
4. `npx create-next-app` (App Router, TS, Tailwind) + `npm i axios zustand @tanstack/react-query`.
5. Bungkus app dengan `QueryClientProvider` (di `providers.tsx`), set `NEXT_PUBLIC_API_URL`.
6. Buat user pertama (seed/manual), login, lalu uji halaman `/notes`.
7. **Tiap fitur baru → ulangi pola 6-lapis (§6).** Selesai.

> Skeleton ini sengaja minimal (tanpa refresh-token rotation, 2FA, dll) agar mudah dipahami.
> Untuk fitur produksi penuh, lihat implementasi nyata di kodebase + Panduan Vol 2.
