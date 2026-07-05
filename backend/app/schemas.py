"""Pydantic request/response models."""
from datetime import date, datetime
from typing import Any, Generic, Literal, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field


T = TypeVar("T")


# --- Standard envelopes ----------------------------------------------------


class Meta(BaseModel):
    page: Optional[int] = None
    per_page: Optional[int] = None
    total: Optional[int] = None


class Envelope(BaseModel, Generic[T]):
    success: bool = True
    data: Optional[T] = None
    meta: Optional[Meta] = None
    message: Optional[str] = None


class ErrorBody(BaseModel):
    code: str
    message: str
    details: Optional[dict[str, Any]] = None


class ErrorEnvelope(BaseModel):
    success: bool = False
    error: ErrorBody


# --- Auth -------------------------------------------------------------------


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


# --- User -------------------------------------------------------------------


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: Optional[str] = None


class SchoolClassOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    grade: Optional[str] = None
    major: Optional[str] = None
    homeroom_teacher: Optional[str] = None
    description: Optional[str] = None


class SchoolClassCreate(BaseModel):
    name: str
    grade: Optional[str] = None
    major: Optional[str] = None
    homeroom_teacher: Optional[str] = None
    description: Optional[str] = None


class UserBase(BaseModel):
    employee_id: str
    full_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    parent_phone: Optional[str] = None
    parent_name: Optional[str] = None
    department_id: Optional[int] = None
    school_class_id: Optional[int] = None
    role: str = "employee"
    join_date: Optional[date] = None


class UserCreate(UserBase):
    password: str = Field(min_length=8, description="Minimal 8 karakter")


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    parent_phone: Optional[str] = None
    parent_name: Optional[str] = None
    department_id: Optional[int] = None
    school_class_id: Optional[int] = None
    role: Optional[Literal["super_admin", "admin", "hr", "employee"]] = None
    status: Optional[Literal["active", "inactive", "suspended"]] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    employee_id: str
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    parent_phone: Optional[str] = None
    parent_name: Optional[str] = None
    photo_url: Optional[str] = None
    role: str
    status: str
    department: Optional[DepartmentOut] = None
    school_class: Optional[SchoolClassOut] = None
    homeroom_class: Optional[SchoolClassOut] = None
    homeroom_class_id: Optional[int] = None
    join_date: Optional[date] = None
    has_face_enrolled: bool = False
    created_at: datetime


# --- Department -------------------------------------------------------------


class DepartmentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None


class GeofenceSettings(BaseModel):
    location_name: str = Field(default="Kantor", min_length=1, max_length=255)
    enabled: bool = False
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    radius_meters: int = Field(default=150, ge=10, le=10_000)
    max_accuracy_meters: int = Field(default=150, ge=10, le=5_000)


class GeofenceSettingsOut(GeofenceSettings):
    id: Optional[int] = None
    org_id: int
    updated_at: Optional[datetime] = None


class FaceSensitivitySettings(BaseModel):
    match_threshold: float = Field(default=0.78, ge=0.3, le=0.99)
    duplicate_threshold: float = Field(default=0.9, ge=0.3, le=0.99)
    min_quality: float = Field(default=0.5, ge=0.0, le=1.0)
    min_enrollment_frames: int = Field(default=3, ge=1, le=12)
    blur_threshold: float = Field(default=50, ge=0, le=500)
    min_brightness: float = Field(default=0.18, ge=0, le=1)
    max_brightness: float = Field(default=0.92, ge=0, le=1)
    min_variance: float = Field(default=220, ge=0, le=2000)
    min_center_variance: float = Field(default=120, ge=0, le=2000)
    min_rgb_spread: float = Field(default=8, ge=0, le=100)
    min_skin_ratio: float = Field(default=0.045, ge=0, le=1)
    liveness_enabled: bool = True
    liveness_min_delta: float = Field(default=0.6, ge=0, le=20)


class FaceSensitivitySettingsOut(FaceSensitivitySettings):
    id: Optional[int] = None
    org_id: int
    updated_at: Optional[datetime] = None


# --- Face -------------------------------------------------------------------


class EnrollImage(BaseModel):
    image: str  # base64 data URL


class EnrollRequest(BaseModel):
    user_id: int
    images: list[str] = Field(min_length=1, max_length=25)


class EnrollResponse(BaseModel):
    user_id: int
    embeddings_count: int
    quality_avg: float
    accepted: int
    rejected: list[dict[str, Any]]


class FaceTestRequest(BaseModel):
    image: str


class FaceTestUser(BaseModel):
    id: int
    full_name: str
    employee_id: str
    role: str
    status: str
    department_name: Optional[str] = None
    photo_url: Optional[str] = None


class FaceTestResponse(BaseModel):
    matched: bool
    confidence: float
    quality_score: float
    user: Optional[FaceTestUser] = None


# --- Attendance -------------------------------------------------------------


class AttendanceImageRequest(BaseModel):
    image: str
    camera_id: Optional[int] = None
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    accuracy: Optional[float] = Field(None, ge=0)


class AttendanceUserBrief(BaseModel):
    id: int
    name: str
    employee_id: str
    photo_url: Optional[str] = None


class AttendanceResponse(BaseModel):
    action: str
    user: AttendanceUserBrief
    timestamp: datetime
    status: Optional[str] = None
    late_minutes: Optional[int] = None
    work_duration_min: Optional[int] = None
    confidence: float
    already_recorded: bool = False
    geofence: Optional[dict[str, Any]] = None


class AttendanceRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    user_name: Optional[str] = None
    employee_id: Optional[str] = None
    department_name: Optional[str] = None
    attendance_date: date
    check_in_at: Optional[datetime] = None
    check_out_at: Optional[datetime] = None
    status: str
    late_minutes: int
    work_duration: Optional[int] = None
    check_in_snapshot_url: Optional[str] = None
    check_out_snapshot_url: Optional[str] = None


class AttendanceOverrideRequest(BaseModel):
    check_in_at: Optional[datetime] = None
    check_out_at: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None


# --- Reports ----------------------------------------------------------------


class DailySummary(BaseModel):
    date: date
    total_employees: int
    present: int
    late: int
    absent: int
    on_leave: int


class StatsToday(BaseModel):
    total_employees: int
    present: int
    late: int
    absent: int
    delta_present: float = 0.0
    delta_late: float = 0.0
    delta_absent: float = 0.0


class TrendPoint(BaseModel):
    date: date
    present: int
    late: int
    absent: int



# ─── Discipline / SIMMICO ──────────────────────────────────────────────────


class ViolationTypeOut(BaseModel):
    """Katalog pelanggaran. Hukuman terkunci di sini supaya UI guru auto-fill."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    category: str
    name: str
    severity: str
    attitude_penalty: int
    kersos_hours: int
    lembur_hours: int
    description: Optional[str] = None
    is_active: bool = True


class AppreciationTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    appreciation_points: int
    is_payoff_kersos: bool = False
    is_payoff_lembur: bool = False
    description: Optional[str] = None
    is_active: bool = True


class TrendPointSimple(BaseModel):
    week: str
    attitude: int
    appreciation: int


class StudentDisciplineSummary(BaseModel):
    """Profil status siswa untuk halaman detail."""
    user_id: int
    full_name: str
    employee_id: str
    class_name: Optional[str] = None
    grade: Optional[str] = None
    major: Optional[str] = None
    photo_url: Optional[str] = None
    gpa: float
    attitude_points: int
    appreciation_points: int
    kersos_hours_owed: int
    lembur_hours_owed: int
    avg_arrival_offset_min: float
    streak_days: int
    badges: list[str] = []
    trend: list[TrendPointSimple] = []
    # Gamifikasi cache (opsional supaya endpoint list tidak overhead).
    xp_total: Optional[int] = None
    level_code: Optional[str] = None
    level_title: Optional[str] = None
    level_color: Optional[str] = None
    next_level_code: Optional[str] = None
    next_level_title: Optional[str] = None
    xp_to_next: Optional[int] = None
    progress_percent: Optional[float] = None


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    student_id: int
    kind: str
    date: datetime
    reporter: Optional[str] = None
    ref_code: str
    ref_name: str
    attitude_delta: int
    kersos_delta: int
    lembur_delta: int
    appreciation_delta: int
    notes: Optional[str] = None


class IncidentCreatePenalty(BaseModel):
    student_id: int
    violation_code: str
    incident_date: Optional[date] = None
    notes: Optional[str] = None


class IncidentCreateAdjustment(BaseModel):
    student_id: int
    appreciation_code: str
    incident_date: Optional[date] = None
    # Untuk pelunasan kersos/lembur, jumlah jam yang dilunasi
    payoff_hours: Optional[int] = None
    # Untuk apresiasi: opsional override poin
    extra_points: Optional[int] = None
    notes: Optional[str] = None


class LeaderboardEntryOut(BaseModel):
    rank: int
    student_id: int
    full_name: str
    class_name: Optional[str] = None
    photo_url: Optional[str] = None
    badges: list[str] = []
    primary_value: float
    primary_label: str



class ClassLeaderboardEntry(BaseModel):
    """Peringkat kelas berdasarkan agregasi performa siswa-siswanya."""
    rank: int
    class_id: int
    class_name: str
    grade: Optional[str] = None
    major: Optional[str] = None
    homeroom_teacher: Optional[str] = None
    student_count: int
    avg_gpa: float
    avg_attitude: float
    total_appreciation: int
    avg_punctuality_min: float
    composite_score: float
    top_student: Optional[str] = None
    top_student_id: Optional[int] = None



# ─── Gamification ───────────────────────────────────────────────────────────


class LevelInfo(BaseModel):
    code: str
    title: str
    color: str


class XpStatus(BaseModel):
    xp_total: int
    level: LevelInfo
    next_level: Optional[LevelInfo] = None
    progress_percent: float
    xp_to_next: Optional[int] = None


class QuestOut(BaseModel):
    code: str
    title: str
    description: str
    icon: str
    progress: int
    target: int
    reward_xp: int
    completed: bool
    percent: float


class DailyRecapOut(BaseModel):
    today_status: Optional[str] = None
    arrival_offset_min: Optional[int] = None
    class_rank_today: Optional[int] = None
    class_size_today: Optional[int] = None
    streak_days: int = 0
    days_to_next_badge: Optional[int] = None
    next_badge_code: Optional[str] = None
    headline: str


class MoodCheckInRequest(BaseModel):
    mood: int = Field(ge=1, le=5)
    note: Optional[str] = None


class MoodAggregateOut(BaseModel):
    """Dipakai guru BK untuk lihat agregat (privasi siswa terjaga)."""
    period_start: date
    period_end: date
    total_checkins: int
    avg_mood: float
    distribution: dict[str, int]  # {"1": count, "2": count, ...}



# ─── Role-Specific Dashboards & Workflows ──────────────────────────────────


class ExecKpi(BaseModel):
    """Executive KPI untuk kepsek."""
    total_students: int
    total_classes: int
    today_present: int
    today_late: int
    today_absent: int
    avg_attitude: float
    total_appreciation: int
    pending_approvals: int
    watchlist_count: int


class ClassPerformanceItem(BaseModel):
    class_id: int
    class_name: str
    avg_attitude: float
    avg_gpa: float
    today_attendance_pct: float


class ExecDashboardOut(BaseModel):
    kpi: ExecKpi
    top_classes: list[ClassPerformanceItem]
    bottom_classes: list[ClassPerformanceItem]
    weekly_attendance_trend: list[dict]


class HomeroomClassOut(BaseModel):
    """Ringkasan kelas yang dipegang wali kelas."""
    class_id: int
    class_name: str
    grade: Optional[str] = None
    major: Optional[str] = None
    student_count: int
    today_present: int
    today_late: int
    today_absent: int
    not_yet_checked_in: int
    avg_attitude: float
    avg_gpa: float
    composite_score: float
    students: list[StudentDisciplineSummary] = []


class BkCaseOut(BaseModel):
    student: StudentDisciplineSummary
    pending_notes_count: int
    last_note_at: Optional[datetime] = None
    today_mood: Optional[int] = None
    risk_score: int  # 0–100, makin tinggi makin urgen


class BkNoteIn(BaseModel):
    body: str = Field(min_length=2, max_length=4000)
    pinned: bool = False


class BkNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    student_id: int
    author_id: int
    author_name: Optional[str] = None
    pinned: bool
    body: str
    created_at: datetime
    updated_at: Optional[datetime] = None


class PendingApprovalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    student_id: int
    student_name: str
    student_class: Optional[str] = None
    requester_id: int
    requester_name: str
    violation_code: str
    violation_name: str
    severity: str
    attitude_penalty: int
    kersos_hours: int
    lembur_hours: int
    incident_date: date
    notes: Optional[str] = None
    status: str
    decision_at: Optional[datetime] = None
    decision_by_name: Optional[str] = None
    decision_reason: Optional[str] = None
    created_at: datetime


class ApprovalDecision(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")
    reason: Optional[str] = None


class HomeroomAssign(BaseModel):
    user_id: int
    homeroom_class_id: Optional[int] = None  # null untuk hapus assignment



# ─── LMS / Pembelajaran ──────────────────────────────────────────────────────


class SubjectIn(BaseModel):
    code: str = Field(min_length=2, max_length=20)
    name: str = Field(min_length=2, max_length=100)
    description: Optional[str] = None


class SubjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    description: Optional[str] = None
    is_active: bool


class TeachingAssignmentIn(BaseModel):
    teacher_id: int
    subject_id: int
    school_class_id: int


class TeachingAssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    teacher_id: int
    teacher_name: Optional[str] = None
    subject_id: int
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    school_class_id: int
    school_class_name: Optional[str] = None


class LessonMaterialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    teacher_id: int
    teacher_name: Optional[str] = None
    subject_id: int
    subject_name: Optional[str] = None
    school_class_id: Optional[int] = None
    school_class_name: Optional[str] = None
    title: str
    description: Optional[str] = None
    file_url: str
    file_name: str
    file_size: Optional[int] = None
    file_mime: Optional[str] = None
    is_published: bool
    created_at: datetime


class AssignmentIn(BaseModel):
    subject_id: int
    school_class_id: int
    title: str = Field(min_length=2, max_length=255)
    description: Optional[str] = None
    assignment_type: str = "tugas"
    max_score: float = Field(default=100.0, ge=1, le=1000)
    weight: float = Field(default=1.0, ge=0.1, le=10.0)
    due_date: Optional[date] = None
    is_published: bool = True
    # Quiz online fields (optional)
    mode: str = "manual"  # 'manual' | 'quiz'
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=480)
    max_focus_violations: int = Field(default=2, ge=0, le=10)
    lock_duration_minutes: int = Field(default=10, ge=1, le=120)
    shuffle_questions: bool = True
    show_score_immediately: bool = True
    open_at: Optional[datetime] = None
    close_at: Optional[datetime] = None


class AssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    teacher_id: int
    teacher_name: Optional[str] = None
    subject_id: int
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    school_class_id: int
    school_class_name: Optional[str] = None
    title: str
    description: Optional[str] = None
    assignment_type: str
    max_score: float
    weight: float
    due_date: Optional[date] = None
    is_published: bool
    graded_count: int = 0
    student_count: int = 0
    avg_score: Optional[float] = None
    created_at: datetime
    mode: str = "manual"
    duration_minutes: Optional[int] = None
    max_focus_violations: int = 2
    lock_duration_minutes: int = 10
    shuffle_questions: bool = True
    show_score_immediately: bool = True
    open_at: Optional[datetime] = None
    close_at: Optional[datetime] = None


class GradeIn(BaseModel):
    student_id: int
    score: float = Field(ge=0)
    note: Optional[str] = None


class GradeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    assignment_id: int
    student_id: int
    student_name: Optional[str] = None
    student_nis: Optional[str] = None
    score: float
    max_score: Optional[float] = None
    note: Optional[str] = None
    source: str
    graded_at: datetime


class GradeBulkIn(BaseModel):
    """Untuk paste manual (simpan banyak nilai sekaligus)."""
    grades: list[GradeIn]


class CsvPreviewRow(BaseModel):
    row_num: int  # 1-indexed (Excel-style)
    nis: Optional[str] = None
    nama: Optional[str] = None
    nilai: Optional[float] = None
    catatan: Optional[str] = None
    student_id: Optional[int] = None  # Resolved by backend kalau NIS valid
    student_name_db: Optional[str] = None  # Nama dari DB (untuk verifikasi)
    valid: bool = False
    error: Optional[str] = None


class CsvPreviewOut(BaseModel):
    total_rows: int
    valid_rows: int
    invalid_rows: int
    rows: list[CsvPreviewRow]
    column_format: dict = Field(
        default_factory=lambda: {
            "A": "nis (wajib)",
            "B": "nama (untuk verifikasi visual)",
            "C": "nilai (0-max_score)",
            "D": "catatan (opsional)",
        }
    )


class CsvCommitOut(BaseModel):
    saved: int
    skipped: int
    errors: list[str] = []


class StudentAssignmentOut(BaseModel):
    """Tampilan untuk siswa: list tugas + nilai mereka."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    description: Optional[str] = None
    assignment_type: str
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    teacher_name: Optional[str] = None
    max_score: float
    weight: float
    due_date: Optional[date] = None
    my_score: Optional[float] = None
    my_note: Optional[str] = None
    graded_at: Optional[datetime] = None
    created_at: datetime
    mode: str = "manual"
    duration_minutes: Optional[int] = None


class StudentMaterialOut(BaseModel):
    """Tampilan materi untuk siswa."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    description: Optional[str] = None
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    teacher_name: Optional[str] = None
    file_url: str
    file_name: str
    file_size: Optional[int] = None
    file_mime: Optional[str] = None
    created_at: datetime



# ─── Chat ────────────────────────────────────────────────────────────────────


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    room_id: int
    sender_id: int
    sender_name: str
    sender_role: str
    sender_photo: Optional[str] = None
    body: str
    is_flagged: bool = False
    is_deleted: bool = False
    created_at: datetime


class ChatRoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    other_user_id: int
    other_user_name: str
    other_user_role: str
    other_user_photo: Optional[str] = None
    last_message: Optional[str] = None
    last_message_at: Optional[datetime] = None
    unread_count: int = 0
    is_muted: bool = False


class SendMessageIn(BaseModel):
    recipient_id: int
    body: str = Field(min_length=1, max_length=1000)


class FlagMessageIn(BaseModel):
    reason: str = Field(min_length=2, max_length=255)


class MuteUserIn(BaseModel):
    user_id: int
    reason: Optional[str] = None
    duration_hours: Optional[int] = Field(None, ge=1, le=720)  # max 30 hari
