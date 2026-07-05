"""SQLAlchemy ORM models matching the PRD database schema."""
from __future__ import annotations

from datetime import date, datetime, time
from typing import Optional

from sqlalchemy import (
    BigInteger, Boolean, Date, DateTime, Enum, Float, ForeignKey,
    Integer, LargeBinary, SmallInteger, String, Text, Time, JSON,
    UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# BigInteger PK yang otomatis fall back ke Integer untuk SQLite (testing).
# Karena SQLite tidak support AUTO_INCREMENT untuk BIGINT — hanya untuk INTEGER.
# Pakai with_variant agar MySQL pakai BIGINT (untuk row count besar) tapi
# SQLite (test) pakai INTEGER yang autoincrement.
BigIntPK = BigInteger().with_variant(Integer(), "sqlite")


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500))
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Jakarta")
    organization_mode: Mapped[str] = mapped_column(
        Enum("school", "office", name="org_mode"),
        default="school",
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())

    departments: Mapped[list["Department"]] = relationship(back_populates="organization")
    school_classes: Mapped[list["SchoolClass"]] = relationship(back_populates="organization")
    users: Mapped[list["User"]] = relationship(back_populates="organization")
    geofence_setting: Mapped[Optional["OrganizationGeofenceSetting"]] = relationship(
        back_populates="organization", uselist=False, cascade="all, delete-orphan"
    )
    face_setting: Mapped[Optional["OrganizationFaceSetting"]] = relationship(
        back_populates="organization", uselist=False, cascade="all, delete-orphan"
    )
    whatsapp_setting: Mapped[Optional["OrganizationWhatsappSetting"]] = relationship(
        back_populates="organization", uselist=False, cascade="all, delete-orphan"
    )


class OrganizationGeofenceSetting(Base):
    __tablename__ = "organization_geofence_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    location_name: Mapped[str] = mapped_column(String(255), default="Kantor")
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    latitude: Mapped[Optional[float]] = mapped_column(Float(53))
    longitude: Mapped[Optional[float]] = mapped_column(Float(53))
    radius_meters: Mapped[int] = mapped_column(Integer, default=150)
    max_accuracy_meters: Mapped[int] = mapped_column(Integer, default=150)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())

    organization: Mapped[Organization] = relationship(back_populates="geofence_setting")


class OrganizationFaceSetting(Base):
    __tablename__ = "organization_face_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    match_threshold: Mapped[float] = mapped_column(Float, default=0.45)
    duplicate_threshold: Mapped[float] = mapped_column(Float, default=0.60)
    min_quality: Mapped[float] = mapped_column(Float, default=0.4)
    min_enrollment_frames: Mapped[int] = mapped_column(Integer, default=3)
    blur_threshold: Mapped[float] = mapped_column(Float, default=30)
    min_brightness: Mapped[float] = mapped_column(Float, default=0.15)
    max_brightness: Mapped[float] = mapped_column(Float, default=0.95)
    min_variance: Mapped[float] = mapped_column(Float, default=220)
    min_center_variance: Mapped[float] = mapped_column(Float, default=120)
    min_rgb_spread: Mapped[float] = mapped_column(Float, default=8)
    min_skin_ratio: Mapped[float] = mapped_column(Float, default=0.045)
    liveness_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    liveness_min_delta: Mapped[float] = mapped_column(Float, default=0.6)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())

    organization: Mapped[Organization] = relationship(back_populates="face_setting")


class OrganizationWhatsappSetting(Base):
    __tablename__ = "organization_whatsapp_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    api_url: Mapped[Optional[str]] = mapped_column(String(500))
    api_token: Mapped[Optional[str]] = mapped_column(String(500))
    message_template: Mapped[str] = mapped_column(
        Text,
        default=(
            "{salam}, Bapak/Ibu wali dari *{nama}*.\n\n"
            "Kami informasikan bahwa anak Anda telah *{aksi}* pada:\n"
            "📅 {tanggal}\n"
            "🕐 {waktu}\n"
            "📍 {lokasi}\n\n"
            "Status: *{status}*\n\n"
            "{penutup}\n"
            "— {organisasi}"
        ),
    )
    notify_checkin: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_checkout: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_absent: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())

    organization: Mapped[Organization] = relationship(back_populates="whatsapp_setting")


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    organization: Mapped[Organization] = relationship(back_populates="departments")
    users: Mapped[list["User"]] = relationship(back_populates="department")


class SchoolClass(Base):
    """Tabel kelas khusus untuk mode sekolah, terpisah dari departments."""
    __tablename__ = "school_classes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)  # e.g. "10 IPA 1"
    grade: Mapped[Optional[str]] = mapped_column(String(20))        # e.g. "10", "11", "12"
    major: Mapped[Optional[str]] = mapped_column(String(100))       # e.g. "IPA", "IPS", "Bahasa"
    homeroom_teacher: Mapped[Optional[str]] = mapped_column(String(255))  # Wali kelas
    description: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    organization: Mapped[Organization] = relationship(back_populates="school_classes")
    students: Mapped[list["User"]] = relationship(
        back_populates="school_class",
        foreign_keys="User.school_class_id",
    )


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("org_id", "employee_id", name="uq_org_employee"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"))
    school_class_id: Mapped[Optional[int]] = mapped_column(ForeignKey("school_classes.id"))
    # Khusus admin/wali kelas: kelas mana yang ia pegang sebagai wali.
    # Untuk siswa selalu null. Untuk kepsek/BK juga umumnya null.
    homeroom_class_id: Mapped[Optional[int]] = mapped_column(ForeignKey("school_classes.id"))
    employee_id: Mapped[str] = mapped_column(String(50), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    parent_phone: Mapped[Optional[str]] = mapped_column(String(20))
    parent_name: Mapped[Optional[str]] = mapped_column(String(255))  # Nama orang tua/wali
    photo_url: Mapped[Optional[str]] = mapped_column(String(500))
    role: Mapped[str] = mapped_column(
        Enum("super_admin", "admin", "hr", "employee", name="user_role"),
        default="employee",
    )
    status: Mapped[str] = mapped_column(
        Enum("active", "inactive", "suspended", name="user_status"),
        default="active",
    )
    join_date: Mapped[Optional[date]] = mapped_column(Date)
    qr_token: Mapped[Optional[str]] = mapped_column(String(64), unique=True, index=True)
    qr_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())

    organization: Mapped[Organization] = relationship(back_populates="users")
    department: Mapped[Optional[Department]] = relationship(back_populates="users")
    school_class: Mapped[Optional["SchoolClass"]] = relationship(
        back_populates="students",
        foreign_keys=[school_class_id],
    )
    homeroom_class: Mapped[Optional["SchoolClass"]] = relationship(
        foreign_keys=[homeroom_class_id],
    )
    auth: Mapped[Optional["UserAuth"]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    face_embeddings: Mapped[list["FaceEmbedding"]] = relationship(
        back_populates="user", cascade="all, delete-orphan",
        foreign_keys="FaceEmbedding.user_id",
    )
    attendance: Mapped[list["AttendanceRecord"]] = relationship(back_populates="user")


class UserAuth(Base):
    __tablename__ = "user_auth"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    password_hash: Mapped[Optional[str]] = mapped_column(String(255))
    totp_secret: Mapped[Optional[str]] = mapped_column(String(100))
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # 10 recovery code (hashed) untuk emergency login kalau HP TOTP hilang
    recovery_codes_json: Mapped[Optional[dict]] = mapped_column(JSON)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    failed_attempts: Mapped[int] = mapped_column(SmallInteger, default=0)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime)

    user: Mapped[User] = relationship(back_populates="auth")


class TokenBlacklist(Base):
    """Daftar JWT yang di-revoke (logout). Auto-expire setelah masa berlaku token habis.

    Pakai `jti` claim sebagai key. Logout endpoint insert ke sini, login flow
    cek apakah jti ada → reject.
    """

    __tablename__ = "token_blacklist"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    jti: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    revoked_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    reason: Mapped[Optional[str]] = mapped_column(String(50))


class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    embedding_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)
    quality_score: Mapped[Optional[float]] = mapped_column(Float)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    enrolled_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    enrolled_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))

    user: Mapped[User] = relationship(
        back_populates="face_embeddings", foreign_keys=[user_id]
    )


class WorkSchedule(Base):
    __tablename__ = "work_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    check_in_start: Mapped[time] = mapped_column(Time, nullable=False)
    check_in_end: Mapped[time] = mapped_column(Time, nullable=False)
    check_out_start: Mapped[time] = mapped_column(Time, nullable=False)
    grace_period: Mapped[int] = mapped_column(SmallInteger, default=0)
    work_days: Mapped[Optional[str]] = mapped_column(String(50))  # comma-joined
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class OrganizationAttendanceSetting(Base):
    """Pengaturan global metode absensi per organisasi.

    Mode:
    - face   = hanya pengenalan wajah (default)
    - qr     = hanya QR scan (per siswa, kalau qr_enabled)
    - mixed  = wajah + QR (siswa pilih, atau QR fallback kalau wajah gagal)
    - manual = hanya admin yang bisa input lewat CSV / form

    Kalau mode = qr / mixed, daftar siswa yang boleh pakai QR diatur
    via field `User.qr_enabled` (default True).
    """

    __tablename__ = "organization_attendance_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    mode: Mapped[str] = mapped_column(
        Enum("face", "qr", "mixed", "manual", name="attendance_mode"),
        default="face",
        nullable=False,
    )
    qr_default_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Token QR perlu di-rotate berapa hari sekali (0 = tidak rotate)
    qr_rotation_days: Mapped[int] = mapped_column(SmallInteger, default=0)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())


class Camera(Base):
    __tablename__ = "cameras"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    location_name: Mapped[str] = mapped_column(String(255), nullable=False)
    device_token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    status: Mapped[str] = mapped_column(
        Enum("online", "offline", "error", name="camera_status"),
        default="offline",
    )
    last_ping_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (UniqueConstraint("user_id", "attendance_date", name="uq_user_date"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    camera_id: Mapped[Optional[int]] = mapped_column(ForeignKey("cameras.id"))
    schedule_id: Mapped[Optional[int]] = mapped_column(ForeignKey("work_schedules.id"))
    attendance_date: Mapped[date] = mapped_column(Date, nullable=False)
    check_in_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    check_out_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    check_in_method: Mapped[str] = mapped_column(
        Enum("face", "manual", "override", name="checkin_method"), default="face"
    )
    check_out_method: Mapped[Optional[str]] = mapped_column(
        Enum("face", "manual", "override", name="checkout_method")
    )
    check_in_confidence: Mapped[Optional[float]] = mapped_column(Float)
    check_out_confidence: Mapped[Optional[float]] = mapped_column(Float)
    check_in_snapshot_url: Mapped[Optional[str]] = mapped_column(String(500))
    check_out_snapshot_url: Mapped[Optional[str]] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(
        Enum("present", "late", "absent", "excused", "holiday", name="att_status"),
        default="present",
    )
    late_minutes: Mapped[int] = mapped_column(SmallInteger, default=0)
    work_duration: Mapped[Optional[int]] = mapped_column(SmallInteger)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())

    user: Mapped[User] = relationship(back_populates="attendance")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    target_type: Mapped[Optional[str]] = mapped_column(String(50))
    target_id: Mapped[Optional[int]] = mapped_column(Integer)
    extra_meta: Mapped[Optional[dict]] = mapped_column("metadata", JSON)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    user_agent: Mapped[Optional[str]] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Holiday(Base):
    __tablename__ = "holidays"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[Optional[int]] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    is_national: Mapped[bool] = mapped_column(Boolean, default=False)


class FaceTestLog(Base):
    __tablename__ = "face_test_logs"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    tested_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    matched_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    matched: Mapped[bool] = mapped_column(Boolean, default=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    quality_score: Mapped[float] = mapped_column(Float, default=0.0)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    user_agent: Mapped[Optional[str]] = mapped_column(String(500))
    error_message: Mapped[Optional[str]] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    tester: Mapped[User] = relationship(foreign_keys=[tested_by])
    matched_user: Mapped[Optional[User]] = relationship(foreign_keys=[matched_user_id])


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    type: Mapped[str] = mapped_column(
        Enum("checkin_success", "late_warning", "absent_alert", "system", name="notif_type"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[Optional[str]] = mapped_column(Text)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())



# ─── SIMMICO Discipline & Gamification Module ─────────────────────────────


class ViolationType(Base):
    """Katalog jenis pelanggaran (KTS) per organisasi.

    Hukuman terkunci: tiap pelanggaran punya besaran tetap untuk
    poin sikap yang dipotong, jam kersos, dan jam lembur/bengkel.
    Ini bikin proses pelaporan auto-fill di UI guru.
    """

    __tablename__ = "violation_types"
    __table_args__ = (UniqueConstraint("org_id", "code", name="uq_org_violation_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    severity: Mapped[str] = mapped_column(
        Enum("ringan", "sedang", "berat", name="violation_severity"),
        default="ringan",
        nullable=False,
    )
    attitude_penalty: Mapped[int] = mapped_column(SmallInteger, default=0)
    kersos_hours: Mapped[int] = mapped_column(SmallInteger, default=0)
    lembur_hours: Mapped[int] = mapped_column(SmallInteger, default=0)
    description: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AppreciationType(Base):
    """Katalog jenis apresiasi positif untuk siswa."""

    __tablename__ = "appreciation_types"
    __table_args__ = (UniqueConstraint("org_id", "code", name="uq_org_appreciation_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    appreciation_points: Mapped[int] = mapped_column(SmallInteger, default=0)
    # Sentinel: jika True, insiden adjustment dengan tipe ini akan mengurangi
    # hutang kersos / lembur siswa (lewat angka jam yang dimasukkan).
    is_payoff_kersos: Mapped[bool] = mapped_column(Boolean, default=False)
    is_payoff_lembur: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class DisciplineProfile(Base):
    """Snapshot agregat per siswa: poin sikap/apresiasi & hutang jam.

    Diupdate tiap kali insiden disiplin baru ditambahkan, dan dipakai
    untuk papan peringkat agar query cepat.
    """

    __tablename__ = "discipline_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    gpa: Mapped[float] = mapped_column(Float, default=0.0)  # 0–100
    attitude_points: Mapped[int] = mapped_column(SmallInteger, default=100)
    appreciation_points: Mapped[int] = mapped_column(Integer, default=0)
    kersos_hours_owed: Mapped[int] = mapped_column(SmallInteger, default=0)
    lembur_hours_owed: Mapped[int] = mapped_column(SmallInteger, default=0)
    avg_arrival_offset_min: Mapped[float] = mapped_column(Float, default=0.0)
    streak_days: Mapped[int] = mapped_column(SmallInteger, default=0)
    badges_json: Mapped[Optional[str]] = mapped_column(Text)  # comma-joined badge codes
    # Gamifikasi: total XP & level cache untuk display cepat.
    xp_total: Mapped[int] = mapped_column(Integer, default=0)
    level_code: Mapped[str] = mapped_column(String(20), default="pemula")
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())


class DisciplineIncident(Base):
    """Log laporan KTS atau apresiasi. Double-entry merah/hijau.

    kind = 'penalty'  → dampak negatif pada profil
    kind = 'adjustment' → apresiasi atau pelunasan jam (positif)
    """

    __tablename__ = "discipline_incidents"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    reporter_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(
        Enum("penalty", "adjustment", name="incident_kind"), nullable=False
    )
    incident_date: Mapped[date] = mapped_column(Date, nullable=False)
    ref_code: Mapped[str] = mapped_column(String(20), nullable=False)
    ref_name: Mapped[str] = mapped_column(String(255), nullable=False)
    attitude_delta: Mapped[int] = mapped_column(SmallInteger, default=0)
    kersos_delta: Mapped[int] = mapped_column(SmallInteger, default=0)
    lembur_delta: Mapped[int] = mapped_column(SmallInteger, default=0)
    appreciation_delta: Mapped[int] = mapped_column(SmallInteger, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())



class MoodCheckIn(Base):
    """Mood check-in 1-tap dari siswa setelah scan wajah berhasil.

    Disimpan privat — guru BK hanya lihat agregat per kelas atau
    siswa-siswa dengan tren rendah beruntun, bukan emoji individual.
    """

    __tablename__ = "mood_checkins"
    __table_args__ = (
        UniqueConstraint("user_id", "checkin_date", name="uq_user_mood_date"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    checkin_date: Mapped[date] = mapped_column(Date, nullable=False)
    mood: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 1..5
    note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())



class BkNote(Base):
    """Catatan privat guru BK tentang siswa.

    Tidak terlihat oleh siswa atau guru lain — hanya HR (BK) dan
    super_admin (kepsek). Membantu handover saat ganti guru BK.
    """

    __tablename__ = "bk_notes"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())


class PendingApproval(Base):
    """Antrian persetujuan untuk pelanggaran berat (>= 20 poin sikap).

    Saat guru/BK melapor pelanggaran kategori berat, insiden tidak
    langsung apply. Masuk antrian, kepsek harus approve atau reject.
    Audit trail rapi, melindungi guru juga dari tuduhan tindakan sepihak.
    """

    __tablename__ = "pending_approvals"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    violation_code: Mapped[str] = mapped_column(String(20), nullable=False)
    violation_name: Mapped[str] = mapped_column(String(255), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    attitude_penalty: Mapped[int] = mapped_column(SmallInteger, default=0)
    kersos_hours: Mapped[int] = mapped_column(SmallInteger, default=0)
    lembur_hours: Mapped[int] = mapped_column(SmallInteger, default=0)
    incident_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        Enum("pending", "approved", "rejected", name="approval_status"),
        default="pending",
        nullable=False,
    )
    decision_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    decision_reason: Mapped[Optional[str]] = mapped_column(Text)
    decision_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())



# ─── Pembelajaran (LMS-Mini) ────────────────────────────────────────────────


class Subject(Base):
    """Mata pelajaran. Per organisasi.

    Sengaja simple — kode + nama. Detail kurikulum di luar scope MVP.
    """

    __tablename__ = "subjects"
    __table_args__ = (UniqueConstraint("org_id", "code", name="uq_org_subject_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)  # MTK, IPA, BIN, dll
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class TeachingAssignment(Base):
    """Pengampu — guru yang mengajar mata pelajaran X di kelas Y.

    Satu guru bisa mengajar banyak (subject, class) kombinasi.
    Dipakai untuk: scope tugas yang dibuat guru hanya ke kelas yang dia ampu.
    """

    __tablename__ = "teaching_assignments"
    __table_args__ = (
        UniqueConstraint(
            "teacher_id", "subject_id", "school_class_id",
            name="uq_teaching_combo",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), nullable=False)
    school_class_id: Mapped[int] = mapped_column(ForeignKey("school_classes.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class LessonMaterial(Base):
    """Materi pembelajaran yang di-upload guru.

    File disimpan di /storage/lessons/. Visibility: per kelas atau "all
    classes I teach this subject for".
    """

    __tablename__ = "lesson_materials"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), nullable=False)
    school_class_id: Mapped[Optional[int]] = mapped_column(ForeignKey("school_classes.id"))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    file_url: Mapped[str] = mapped_column(String(500), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[Optional[int]] = mapped_column(Integer)
    file_mime: Mapped[Optional[str]] = mapped_column(String(100))
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())


class Assignment(Base):
    """Tugas / quiz dari guru.

    MVP: scoring manual (guru input nilai dari PPT/Google Form via CSV/XLSX
    atau ketik manual). Bank soal & auto-grading di-skip dulu.
    """

    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), nullable=False)
    school_class_id: Mapped[int] = mapped_column(ForeignKey("school_classes.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    assignment_type: Mapped[str] = mapped_column(
        Enum("tugas", "ulangan", "kuis", "uts", "uas", name="assignment_type"),
        default="tugas",
    )
    # Nilai maksimum (default 100)
    max_score: Mapped[float] = mapped_column(Float, default=100.0)
    # Bobot di GPA — 1.0 = standar, 2.0 = ujian besar
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    due_date: Mapped[Optional[date]] = mapped_column(Date)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)

    # ─── Mode Quiz Online ─────────────────────────────────────────
    # 'manual'  → nilai diinput guru dari sumber luar (PPT, Google Form, CSV)
    # 'quiz'    → siswa mengerjakan langsung di app dengan timer + anti-cheat
    mode: Mapped[str] = mapped_column(
        Enum("manual", "quiz", name="assignment_mode"),
        default="manual",
        nullable=False,
    )
    duration_minutes: Mapped[Optional[int]] = mapped_column(Integer)  # null = tanpa batas
    max_focus_violations: Mapped[int] = mapped_column(SmallInteger, default=2)
    lock_duration_minutes: Mapped[int] = mapped_column(SmallInteger, default=10)
    shuffle_questions: Mapped[bool] = mapped_column(Boolean, default=True)
    show_score_immediately: Mapped[bool] = mapped_column(Boolean, default=True)
    open_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    close_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())


class AssignmentGrade(Base):
    """Nilai tugas per siswa.

    Sumber: 'manual' (guru ketik), 'csv_upload', 'xlsx_upload'.
    Konstrain unik (assignment_id, student_id) — satu nilai per kombinasi.
    """

    __tablename__ = "assignment_grades"
    __table_args__ = (
        UniqueConstraint("assignment_id", "student_id", name="uq_grade_per_student"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text)
    source: Mapped[str] = mapped_column(
        Enum("manual", "csv_upload", "xlsx_upload", name="grade_source"),
        default="manual",
    )
    graded_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    graded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())



# ─── Chat Module ─────────────────────────────────────────────────────────────


class ChatRoom(Base):
    """Ruang chat antara dua pengguna.

    Aturan keamanan:
    - Siswa hanya bisa chat dengan guru/staff (bukan sesama siswa)
    - Dibuat otomatis saat pesan pertama dikirim
    - Tidak bisa dihapus oleh siswa
    """

    __tablename__ = "chat_rooms"
    __table_args__ = (
        UniqueConstraint("participant_a_id", "participant_b_id", name="uq_chat_room_pair"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    # participant_a_id selalu user dengan id lebih kecil (canonical order)
    participant_a_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    participant_b_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    # Apakah salah satu peserta di-mute oleh admin
    is_muted_a: Mapped[bool] = mapped_column(Boolean, default=False)
    is_muted_b: Mapped[bool] = mapped_column(Boolean, default=False)
    last_message_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class ChatMessage(Base):
    """Pesan dalam ruang chat.

    Keamanan:
    - Tidak bisa dihapus oleh pengirim (hanya admin/kepsek)
    - Disimpan permanen sebagai audit trail
    - Max 1000 karakter
    - Hanya teks (tidak ada file/gambar dari siswa)
    - Bisa di-flag untuk review moderasi
    """

    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    room_id: Mapped[int] = mapped_column(
        ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False
    )
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    body: Mapped[str] = mapped_column(String(1000), nullable=False)
    is_flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    flag_reason: Mapped[Optional[str]] = mapped_column(String(255))
    flagged_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)  # soft delete by admin only
    deleted_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class ChatMute(Base):
    """Daftar siswa yang di-mute dari chat oleh admin/kepsek.

    Siswa yang di-mute tidak bisa kirim pesan baru tapi masih bisa baca.
    """

    __tablename__ = "chat_mutes"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_chat_mute_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    muted_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(String(255))
    muted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime)  # null = permanent



class ChatReadReceipt(Base):
    """Tracking kapan user terakhir membaca room tertentu.

    Dipakai untuk hitung unread_count yang akurat.
    """

    __tablename__ = "chat_read_receipts"
    __table_args__ = (
        UniqueConstraint("room_id", "user_id", name="uq_read_receipt"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_id: Mapped[int] = mapped_column(
        ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    last_read_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())



# ─── Push Notifications ─────────────────────────────────────────────────────


class PushSubscription(Base):
    """Web-Push subscription per device.

    Satu user bisa punya banyak device (HP, laptop, dst). Tiap browser
    yang grant permission akan register endpoint unik.
    """

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    endpoint: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    p256dh: Mapped[str] = mapped_column(String(255), nullable=False)
    auth: Mapped[str] = mapped_column(String(100), nullable=False)
    user_agent: Mapped[Optional[str]] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime)


class AppNotification(Base):
    """History notifikasi in-app per user.

    Dipakai untuk timeline bell-icon di TopBar dan halaman /notifications.
    Disimpan terpisah dari tabel `notifications` lama (yang scope-nya
    sempit untuk attendance) supaya enum kategori bisa di-extend bebas.
    """

    __tablename__ = "app_notifications"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[Optional[str]] = mapped_column(Text)
    url: Mapped[Optional[str]] = mapped_column(String(255))
    icon: Mapped[Optional[str]] = mapped_column(String(255))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    delivered_push: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False, index=True
    )
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime)


class ChatRoomArchive(Base):
    """Tracking room yang di-archive oleh user tertentu.

    Room tidak dihapus dari DB — hanya disembunyikan dari list user ini.
    Kalau ada pesan baru masuk, room otomatis muncul lagi.
    """

    __tablename__ = "chat_room_archives"
    __table_args__ = (
        UniqueConstraint("room_id", "user_id", name="uq_room_archive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_id: Mapped[int] = mapped_column(
        ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    archived_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ─── Quiz Online & Anti-Cheat ───────────────────────────────────────────────


class QuizQuestion(Base):
    """Soal pilihan ganda / true-false untuk Assignment ber-mode 'quiz'.

    Untuk MVP kita support:
    - mcq    : pilihan ganda 2-5 opsi, jawaban 1 opsi
    - tf     : true/false
    - essay  : text area, butuh nilai manual (auto-grade ngga jalan)

    Struktur opsi disimpan sebagai list di kolom JSON `options` untuk MCQ.
    `correct_value` simpan jawaban benar (index opsi atau 'true'/'false').
    """

    __tablename__ = "quiz_questions"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False
    )
    order_index: Mapped[int] = mapped_column(SmallInteger, default=0)
    question_type: Mapped[str] = mapped_column(
        Enum("mcq", "tf", "essay", name="quiz_qtype"),
        default="mcq",
        nullable=False,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[Optional[dict]] = mapped_column(JSON)  # ["opsi A", "opsi B", ...]
    correct_value: Mapped[Optional[str]] = mapped_column(String(255))  # "0"/"1"/.../true/false
    points: Mapped[float] = mapped_column(Float, default=1.0)
    explanation: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class QuizAttempt(Base):
    """Sesi pengerjaan quiz oleh siswa.

    Lifecycle:
      'in_progress' → siswa sedang mengerjakan
      'submitted'   → sudah submit normal atau timeout
      'locked'      → kena anti-cheat lock, bisa lanjut setelah locked_until
      'unlocked_by_teacher' → guru paksa unlock (override)
      'auto_submitted' → server force-submit karena kelebihan violation
    """

    __tablename__ = "quiz_attempts"
    __table_args__ = (
        UniqueConstraint("assignment_id", "student_id", name="uq_quiz_attempt"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum(
            "in_progress",
            "submitted",
            "locked",
            "unlocked_by_teacher",
            "auto_submitted",
            name="quiz_attempt_status",
        ),
        default="in_progress",
        nullable=False,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    deadline_at: Mapped[Optional[datetime]] = mapped_column(DateTime)  # started + duration
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime)
    focus_violations: Mapped[int] = mapped_column(SmallInteger, default=0)
    answers_json: Mapped[Optional[dict]] = mapped_column(JSON)  # { question_id: "answer" }
    raw_score: Mapped[Optional[float]] = mapped_column(Float)
    final_score: Mapped[Optional[float]] = mapped_column(Float)
    teacher_note: Mapped[Optional[str]] = mapped_column(Text)
    last_unlocked_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    last_unlocked_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())



# ─── Leave Request (Izin / Sakit) ────────────────────────────────────────────


class LeaveRequest(Base):
    """Pengajuan izin / sakit dari siswa.

    Lifecycle:
      pending   → siswa baru ajukan, menunggu wali kelas / BK / kepsek
      approved  → di-acc, attendance_records pada range tanggal otomatis di-mark
                  status='excused' agar leaderboard kehadiran tetap rapi
      rejected  → ditolak, tidak ada efek ke absensi
      cancelled → siswa batalin sendiri (hanya boleh saat masih pending)
    """

    __tablename__ = "leave_requests"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(
        Enum("sakit", "izin", "lainnya", name="leave_kind"),
        default="izin",
        nullable=False,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    proof_file_url: Mapped[Optional[str]] = mapped_column(String(500))
    proof_file_name: Mapped[Optional[str]] = mapped_column(String(255))
    proof_file_mime: Mapped[Optional[str]] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(
        Enum("pending", "approved", "rejected", "cancelled", name="leave_status"),
        default="pending",
        nullable=False,
    )
    decided_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    decision_note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())



# ─── Parent Portal ───────────────────────────────────────────────────────────


class ParentAccount(Base):
    """Akun login untuk orang tua/wali siswa.

    Terpisah dari `users` karena ortu bukan staff sekolah dan butuh
    skema akses yang berbeda. Login pakai HP + password yang di-generate
    saat pertama kali dibuat (admin/wali kelas yang setup).
    """

    __tablename__ = "parent_accounts"
    __table_args__ = (
        UniqueConstraint("org_id", "phone", name="uq_parent_org_phone"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    failed_attempts: Mapped[int] = mapped_column(SmallInteger, default=0)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())


class ParentLink(Base):
    """Mapping ortu ke siswa. Satu ortu bisa pegang beberapa anak.

    `relationship` berisi 'ayah' | 'ibu' | 'wali'.
    """

    __tablename__ = "parent_links"
    __table_args__ = (
        UniqueConstraint("parent_id", "student_id", name="uq_parent_student"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    parent_id: Mapped[int] = mapped_column(
        ForeignKey("parent_accounts.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    relationship: Mapped[str] = mapped_column(String(20), default="wali", nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ─── Billing / SPP ──────────────────────────────────────────────────────────


class BillCategory(Base):
    """Jenis tagihan: SPP, uang gedung, kegiatan, dll.

    `recurring` = 'none' | 'monthly' | 'yearly' menentukan apakah bisa
    di-generate batch tiap periode.
    """

    __tablename__ = "bill_categories"
    __table_args__ = (
        UniqueConstraint("org_id", "code", name="uq_bill_category_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    default_amount: Mapped[float] = mapped_column(Float, default=0.0)
    recurring: Mapped[str] = mapped_column(
        Enum("none", "monthly", "yearly", name="bill_recurring"),
        default="none",
        nullable=False,
    )
    description: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Bill(Base):
    """Tagihan ke siswa tertentu untuk periode tertentu.

    Status:
      - unpaid : belum bayar / sebagian
      - paid   : lunas
      - waived : dihapus / dibebaskan
    """

    __tablename__ = "bills"
    __table_args__ = (
        UniqueConstraint(
            "student_id", "category_id", "period", name="uq_bill_per_period"
        ),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("bill_categories.id"), nullable=False)
    period: Mapped[str] = mapped_column(String(20), nullable=False)  # "2026-05" or "2026-2027"
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    paid_amount: Mapped[float] = mapped_column(Float, default=0.0)
    due_date: Mapped[Optional[date]] = mapped_column(Date)
    status: Mapped[str] = mapped_column(
        Enum("unpaid", "paid", "waived", name="bill_status"),
        default="unpaid",
        nullable=False,
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())

    # Midtrans online payment tracking
    midtrans_order_id: Mapped[Optional[str]] = mapped_column(String(100), index=True)
    midtrans_token: Mapped[Optional[str]] = mapped_column(String(255))      # Snap token
    midtrans_redirect_url: Mapped[Optional[str]] = mapped_column(String(500))
    midtrans_status: Mapped[Optional[str]] = mapped_column(String(40))      # pending/settlement/expire/dll
    midtrans_token_at: Mapped[Optional[datetime]] = mapped_column(DateTime) # kapan token dibuat (untuk expiry)


class Payment(Base):
    """Catatan pembayaran terhadap satu Bill.

    Satu bill bisa punya banyak payment (cicilan).
    """

    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    bill_id: Mapped[int] = mapped_column(
        ForeignKey("bills.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    method: Mapped[str] = mapped_column(
        Enum("cash", "transfer", "qris", "midtrans", "manual", name="pay_method"),
        default="manual",
        nullable=False,
    )
    payment_ref: Mapped[Optional[str]] = mapped_column(String(100))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    received_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    received_by_parent: Mapped[Optional[int]] = mapped_column(ForeignKey("parent_accounts.id"))
    paid_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ─── Letters / Surat Otomatis ───────────────────────────────────────────────


class LetterIssue(Base):
    """Riwayat penerbitan surat otomatis (audit trail).

    Tipe:
      - keterangan_aktif : Surat keterangan siswa aktif
      - kelakuan_baik    : Surat kelakuan baik (auto dari poin sikap)
      - panggilan_ortu   : Surat panggilan ortu (dari KTS berat)
      - sehat_jasmani    : Surat keterangan
    """

    __tablename__ = "letter_issues"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    letter_type: Mapped[str] = mapped_column(String(40), nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    issued_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    serial_number: Mapped[str] = mapped_column(String(50), nullable=False)
    purpose: Mapped[Optional[str]] = mapped_column(Text)
    file_url: Mapped[Optional[str]] = mapped_column(String(500))
    extra_data: Mapped[Optional[dict]] = mapped_column(JSON)
    issued_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())



# ─── Jadwal Pelajaran (Timetable) ───────────────────────────────────────────


class TimetableSlot(Base):
    """Slot jadwal: kelas X, hari Y, jam ke-N, mapel + guru.

    Conflict detection: 1 guru tidak boleh mengajar 2 kelas di slot waktu yg sama.
    """

    __tablename__ = "timetable_slots"
    __table_args__ = (
        UniqueConstraint(
            "school_class_id", "day_of_week", "period_index",
            name="uq_class_day_period",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    school_class_id: Mapped[int] = mapped_column(
        ForeignKey("school_classes.id", ondelete="CASCADE"), nullable=False
    )
    day_of_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 0=Senin..5=Sabtu
    period_index: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 1..10
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    subject_id: Mapped[Optional[int]] = mapped_column(ForeignKey("subjects.id"))
    teacher_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    room: Mapped[Optional[str]] = mapped_column(String(40))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())


# ─── Ekstrakurikuler ────────────────────────────────────────────────────────


class Extracurricular(Base):
    """Daftar ekskul di sekolah."""

    __tablename__ = "extracurriculars"
    __table_args__ = (
        UniqueConstraint("org_id", "code", name="uq_ekskul_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    coach_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    schedule_text: Mapped[Optional[str]] = mapped_column(String(255))  # "Kamis 15:00-17:00"
    location: Mapped[Optional[str]] = mapped_column(String(120))
    quota: Mapped[Optional[int]] = mapped_column(SmallInteger)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class ExtracurricularEnrollment(Base):
    """Pendaftaran siswa ke ekskul."""

    __tablename__ = "extracurricular_enrollments"
    __table_args__ = (
        UniqueConstraint("ekskul_id", "student_id", name="uq_ekskul_student"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ekskul_id: Mapped[int] = mapped_column(
        ForeignKey("extracurriculars.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("pending", "approved", "rejected", "left", name="ekskul_status"),
        default="approved",
        nullable=False,
    )
    enrolled_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    decided_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))


class ExtracurricularAchievement(Base):
    """Prestasi tim ekskul (auto-bonus apresiasi ke siswa)."""

    __tablename__ = "extracurricular_achievements"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    ekskul_id: Mapped[int] = mapped_column(
        ForeignKey("extracurriculars.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    achievement_date: Mapped[date] = mapped_column(Date, nullable=False)
    level: Mapped[str] = mapped_column(
        Enum("sekolah", "kecamatan", "kabupaten", "provinsi", "nasional", "internasional", name="ach_level"),
        default="sekolah",
    )
    rank: Mapped[Optional[str]] = mapped_column(String(40))
    appreciation_points: Mapped[int] = mapped_column(SmallInteger, default=10)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500))
    members_json: Mapped[Optional[dict]] = mapped_column(JSON)  # list student_ids
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ─── Booking Konsultasi BK ──────────────────────────────────────────────────


class CounselingSlot(Base):
    """Slot waktu konsultasi yang BK buka. Siswa book ke sini."""

    __tablename__ = "counseling_slots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    counselor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    slot_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)  # BK block (rapat dst)
    note: Mapped[Optional[str]] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class CounselingBooking(Base):
    """Booking siswa ke slot. Bisa juga walk-in (tanpa slot)."""

    __tablename__ = "counseling_bookings"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    counselor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    slot_id: Mapped[Optional[int]] = mapped_column(ForeignKey("counseling_slots.id"))
    booking_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    topic: Mapped[str] = mapped_column(String(255), nullable=False)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=False)  # privacy
    status: Mapped[str] = mapped_column(
        Enum("pending", "approved", "rejected", "completed", "cancelled", name="booking_status"),
        default="pending",
        nullable=False,
    )
    student_note: Mapped[Optional[str]] = mapped_column(Text)
    counselor_note: Mapped[Optional[str]] = mapped_column(Text)  # private
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())


# ─── Perpustakaan Digital ───────────────────────────────────────────────────


class LibraryBook(Base):
    """Master buku perpustakaan."""

    __tablename__ = "library_books"
    __table_args__ = (
        UniqueConstraint("org_id", "code", name="uq_library_book_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)  # kode unik / barcode
    isbn: Mapped[Optional[str]] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    author: Mapped[Optional[str]] = mapped_column(String(255))
    publisher: Mapped[Optional[str]] = mapped_column(String(255))
    year: Mapped[Optional[int]] = mapped_column(SmallInteger)
    category: Mapped[Optional[str]] = mapped_column(String(80))
    cover_url: Mapped[Optional[str]] = mapped_column(String(500))
    description: Mapped[Optional[str]] = mapped_column(Text)
    total_copies: Mapped[int] = mapped_column(SmallInteger, default=1)
    available_copies: Mapped[int] = mapped_column(SmallInteger, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class LibraryLoan(Base):
    """Peminjaman buku oleh siswa."""

    __tablename__ = "library_loans"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("library_books.id"), nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    loan_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    return_date: Mapped[Optional[date]] = mapped_column(Date)
    status: Mapped[str] = mapped_column(
        Enum("borrowed", "returned", "overdue", "lost", name="loan_status"),
        default="borrowed",
        nullable=False,
    )
    fine_amount: Mapped[float] = mapped_column(Float, default=0.0)
    librarian_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ─── Acara & Kalender Sekolah ───────────────────────────────────────────────


class SchoolEvent(Base):
    """Acara / kegiatan sekolah."""

    __tablename__ = "school_events"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    location: Mapped[Optional[str]] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(
        Enum("akademik", "ujian", "libur", "rapat", "lomba", "kunjungan", "lainnya", name="event_category"),
        default="akademik",
        nullable=False,
    )
    audience: Mapped[str] = mapped_column(
        Enum("all", "siswa", "guru", "ortu", "kelas", name="event_audience"),
        default="all",
        nullable=False,
    )
    target_class_id: Mapped[Optional[int]] = mapped_column(ForeignKey("school_classes.id"))
    requires_rsvp: Mapped[bool] = mapped_column(Boolean, default=False)
    cover_url: Mapped[Optional[str]] = mapped_column(String(500))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class EventRSVP(Base):
    """RSVP siswa/ortu untuk event terbatas."""

    __tablename__ = "event_rsvps"
    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_event_rsvp"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("school_events.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    response: Mapped[str] = mapped_column(
        Enum("yes", "no", "maybe", name="rsvp_response"),
        default="yes",
    )
    note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ─── AI Insight Cache ───────────────────────────────────────────────────────


class AiInsight(Base):
    """Cache insight AI agar tidak nge-call LLM tiap halaman load.

    `scope` = 'school' | 'class' | 'student'
    Auto-expire setelah 6 jam.
    """

    __tablename__ = "ai_insights"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    scope: Mapped[str] = mapped_column(String(20), nullable=False)
    scope_id: Mapped[Optional[int]] = mapped_column(Integer)  # class_id atau student_id
    insight_type: Mapped[str] = mapped_column(String(40), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    items_json: Mapped[Optional[dict]] = mapped_column(JSON)  # list bullet points
    severity: Mapped[str] = mapped_column(
        Enum("info", "warning", "critical", name="insight_severity"),
        default="info",
    )
    generated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime)


# ─── Pengumuman / Announcement ──────────────────────────────────────────────


class Announcement(Base):
    """Pengumuman persistent. Tampil di feed siswa/guru/ortu dan bisa di-pin."""

    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    audience: Mapped[str] = mapped_column(
        Enum("all", "siswa", "guru", "ortu", "kelas", name="announcement_audience"),
        default="all",
        nullable=False,
    )
    target_class_id: Mapped[Optional[int]] = mapped_column(ForeignKey("school_classes.id"))
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    cover_url: Mapped[Optional[str]] = mapped_column(String(500))
    publish_at: Mapped[Optional[datetime]] = mapped_column(DateTime)  # null = langsung tayang
    expire_at: Mapped[Optional[datetime]] = mapped_column(DateTime)  # null = tidak pernah expire
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())


class AnnouncementRead(Base):
    """Tracking siapa yang sudah baca pengumuman (untuk badge unread)."""

    __tablename__ = "announcement_reads"
    __table_args__ = (
        UniqueConstraint("announcement_id", "user_id", name="uq_announcement_read"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    announcement_id: Mapped[int] = mapped_column(
        ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    read_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())



# ─── PPDB (Penerimaan Peserta Didik Baru) ───────────────────────────────────


class AdmissionPeriod(Base):
    """Periode pendaftaran (gelombang). Sekolah bisa buka beberapa gelombang."""

    __tablename__ = "admission_periods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)  # "Gelombang 1 2025/2026"
    school_year: Mapped[str] = mapped_column(String(20), nullable=False)  # "2025/2026"
    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    quota: Mapped[Optional[int]] = mapped_column(SmallInteger)
    registration_fee: Mapped[float] = mapped_column(Float, default=0.0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AdmissionApplication(Base):
    """Pendaftaran calon siswa. Public (tidak butuh login user).

    Workflow:
      'submitted'  → form selesai disubmit
      'reviewing'  → admin sedang verifikasi dokumen
      'accepted'   → diterima
      'rejected'   → ditolak
      'enrolled'   → sudah jadi user (auto-create akun)
      'cancelled'  → calon batal
    """

    __tablename__ = "admission_applications"
    __table_args__ = (
        UniqueConstraint("period_id", "registration_number", name="uq_admission_regno"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    period_id: Mapped[int] = mapped_column(ForeignKey("admission_periods.id"), nullable=False)
    registration_number: Mapped[str] = mapped_column(String(40), nullable=False)
    # Data calon siswa
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    nisn: Mapped[Optional[str]] = mapped_column(String(20))
    nik: Mapped[Optional[str]] = mapped_column(String(20))
    birth_place: Mapped[Optional[str]] = mapped_column(String(120))
    birth_date: Mapped[Optional[date]] = mapped_column(Date)
    gender: Mapped[str] = mapped_column(
        Enum("L", "P", name="adm_gender"), default="L"
    )
    religion: Mapped[Optional[str]] = mapped_column(String(40))
    address: Mapped[Optional[str]] = mapped_column(Text)
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    previous_school: Mapped[Optional[str]] = mapped_column(String(255))
    # Data orang tua
    father_name: Mapped[Optional[str]] = mapped_column(String(255))
    mother_name: Mapped[Optional[str]] = mapped_column(String(255))
    parent_phone: Mapped[Optional[str]] = mapped_column(String(20))
    parent_occupation: Mapped[Optional[str]] = mapped_column(String(120))
    # Dokumen pendukung (URL ke storage/admissions/)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500))
    kk_url: Mapped[Optional[str]] = mapped_column(String(500))  # Kartu Keluarga
    akta_url: Mapped[Optional[str]] = mapped_column(String(500))  # Akta lahir
    raport_url: Mapped[Optional[str]] = mapped_column(String(500))
    # Status & decision
    status: Mapped[str] = mapped_column(
        Enum(
            "submitted", "reviewing", "accepted", "rejected", "enrolled", "cancelled",
            name="adm_status",
        ),
        default="submitted",
        nullable=False,
    )
    decision_note: Mapped[Optional[str]] = mapped_column(Text)
    decided_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    # Setelah enrolled, link ke User created
    enrolled_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    # Tracking access — calon bisa cek status lewat reg number + email
    submitted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())


# ─── Per-Subject Attendance ────────────────────────────────────────────────


class SubjectAttendance(Base):
    """Absensi per mata pelajaran (per slot timetable).

    Berbeda dari attendance harian (AttendanceRecord). Ini untuk track
    kehadiran siswa di kelas mapel tertentu — penting buat hitung
    persentase kehadiran per mapel di rapor.

    Status:
      'present'  → hadir
      'late'     → terlambat
      'absent'   → tidak hadir tanpa keterangan
      'sick'     → sakit
      'permit'   → izin
      'leave'    → cuti/dispensasi
    """

    __tablename__ = "subject_attendance"
    __table_args__ = (
        UniqueConstraint("student_id", "timetable_slot_id", "session_date", name="uq_subj_att"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    timetable_slot_id: Mapped[int] = mapped_column(
        ForeignKey("timetable_slots.id", ondelete="CASCADE"), nullable=False
    )
    session_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        Enum("present", "late", "absent", "sick", "permit", "leave", name="subj_att_status"),
        default="present",
        nullable=False,
    )
    note: Mapped[Optional[str]] = mapped_column(Text)
    recorded_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())



# ─── UKS / Klinik Sekolah ───────────────────────────────────────────────────


class UksVisit(Base):
    """Catatan kunjungan UKS — siswa datang untuk berobat / istirahat."""

    __tablename__ = "uks_visits"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    visit_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    arrival_time: Mapped[time] = mapped_column(Time, nullable=False)
    departure_time: Mapped[Optional[time]] = mapped_column(Time)
    complaint: Mapped[str] = mapped_column(Text, nullable=False)
    diagnosis: Mapped[Optional[str]] = mapped_column(Text)
    treatment: Mapped[Optional[str]] = mapped_column(Text)
    medicines_json: Mapped[Optional[dict]] = mapped_column(JSON)  # list {name, qty}
    body_temp: Mapped[Optional[float]] = mapped_column(Float)  # Celsius
    blood_pressure: Mapped[Optional[str]] = mapped_column(String(20))  # "120/80"
    outcome: Mapped[str] = mapped_column(
        Enum("kembali_kelas", "istirahat_uks", "pulang", "rujuk_rs", name="uks_outcome"),
        default="kembali_kelas",
        nullable=False,
    )
    notify_parent: Mapped[bool] = mapped_column(Boolean, default=False)
    handled_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class UksMedicine(Base):
    """Stok obat di UKS."""

    __tablename__ = "uks_medicines"
    __table_args__ = (
        UniqueConstraint("org_id", "code", name="uq_uks_med_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(80))
    unit: Mapped[str] = mapped_column(String(20), default="butir")  # butir, botol, sachet
    stock: Mapped[int] = mapped_column(Integer, default=0)
    low_stock_threshold: Mapped[int] = mapped_column(SmallInteger, default=10)
    expire_date: Mapped[Optional[date]] = mapped_column(Date)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())


# ─── Inventaris ────────────────────────────────────────────────────────────


class InventoryItem(Base):
    """Aset/inventaris sekolah (proyektor, AC, meja, dll)."""

    __tablename__ = "inventory_items"
    __table_args__ = (
        UniqueConstraint("org_id", "asset_code", name="uq_inventory_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    asset_code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(80))  # elektronik, mebel, lab, OR
    location: Mapped[Optional[str]] = mapped_column(String(120))  # Lab Komputer 1, Aula, dll
    purchase_date: Mapped[Optional[date]] = mapped_column(Date)
    purchase_price: Mapped[Optional[float]] = mapped_column(Float)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    condition: Mapped[str] = mapped_column(
        Enum("baik", "rusak_ringan", "rusak_berat", "hilang", "dijual", name="asset_condition"),
        default="baik",
        nullable=False,
    )
    description: Mapped[Optional[str]] = mapped_column(Text)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500))
    responsible_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    last_audit_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, onupdate=func.now())


class InventoryLog(Base):
    """Log perubahan kondisi/lokasi inventaris (audit trail)."""

    __tablename__ = "inventory_logs"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    item_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(40), nullable=False)  # 'create', 'condition_change', 'move', 'audit'
    note: Mapped[Optional[str]] = mapped_column(Text)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
