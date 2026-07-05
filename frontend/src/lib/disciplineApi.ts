/**
 * Client API untuk modul SIMMICO (discipline & gamification).
 *
 * Semua endpoint nempel di /v1/discipline/* di backend FastAPI.
 * Pakai axios instance yang sama (`api`) supaya JWT interceptor jalan.
 */
import api, { type Envelope } from './api';

// ─── Types ──────────────────────────────────────────────────────────────────

export type StudentBadgeCode =
  | 'perfect_attendance'
  | 'top_scorer'
  | 'social_hero'
  | 'early_bird'
  | 'rising_star'
  | 'comeback_kid';

export type DisciplineCategory = 'gpa' | 'punctuality' | 'appreciation';
export type IncidentKind = 'penalty' | 'adjustment';

export interface ViolationType {
  id: number;
  code: string;
  category: 'kedisiplinan' | 'kerapian' | 'akademik' | 'etika' | 'kehadiran';
  name: string;
  severity: 'ringan' | 'sedang' | 'berat';
  attitude_penalty: number;
  kersos_hours: number;
  lembur_hours: number;
  description?: string | null;
  is_active: boolean;
}

export interface AppreciationType {
  id: number;
  code: string;
  name: string;
  appreciation_points: number;
  is_payoff_kersos: boolean;
  is_payoff_lembur: boolean;
  description?: string | null;
  is_active: boolean;
}

export interface TrendPoint {
  week: string;
  attitude: number;
  appreciation: number;
}

export interface StudentDisciplineSummary {
  user_id: number;
  full_name: string;
  employee_id: string;
  class_name?: string | null;
  grade?: string | null;
  major?: string | null;
  photo_url?: string | null;
  gpa: number;
  attitude_points: number;
  appreciation_points: number;
  kersos_hours_owed: number;
  lembur_hours_owed: number;
  avg_arrival_offset_min: number;
  streak_days: number;
  badges: StudentBadgeCode[];
  trend: TrendPoint[];
  // Gamifikasi (optional — endpoint /me & /students/{id} mengisi, list endpoint tidak)
  xp_total?: number | null;
  level_code?: string | null;
  level_title?: string | null;
  level_color?: string | null;
  next_level_code?: string | null;
  next_level_title?: string | null;
  xp_to_next?: number | null;
  progress_percent?: number | null;
}

export interface IncidentRecord {
  id: number;
  student_id: number;
  kind: IncidentKind;
  date: string; // ISO datetime
  reporter?: string | null;
  ref_code: string;
  ref_name: string;
  attitude_delta: number;
  kersos_delta: number;
  lembur_delta: number;
  appreciation_delta: number;
  notes?: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  student_id: number;
  full_name: string;
  class_name?: string | null;
  photo_url?: string | null;
  badges: StudentBadgeCode[];
  primary_value: number;
  primary_label: string;
}

// ─── Endpoints ──────────────────────────────────────────────────────────────

export async function fetchViolations() {
  const r = await api.get<Envelope<ViolationType[]>>('/discipline/violations');
  return r.data.data ?? [];
}

export async function fetchAppreciations() {
  const r = await api.get<Envelope<AppreciationType[]>>('/discipline/appreciations');
  return r.data.data ?? [];
}

export async function fetchClassNames() {
  const r = await api.get<Envelope<string[]>>('/discipline/classes');
  return r.data.data ?? [];
}

export async function fetchStudents(params?: { q?: string; class_name?: string }) {
  const r = await api.get<Envelope<StudentDisciplineSummary[]>>(
    '/discipline/students',
    { params }
  );
  return r.data.data ?? [];
}

export async function fetchStudent(studentId: number) {
  const r = await api.get<Envelope<StudentDisciplineSummary>>(
    `/discipline/students/${studentId}`
  );
  return r.data.data!;
}

export async function fetchMyDisciplineStatus() {
  const r = await api.get<Envelope<StudentDisciplineSummary>>('/discipline/me');
  return r.data.data!;
}

export async function fetchIncidents(studentId: number) {
  const r = await api.get<Envelope<IncidentRecord[]>>(
    `/discipline/students/${studentId}/incidents`
  );
  return r.data.data ?? [];
}

export async function fetchLeaderboard(
  category: DisciplineCategory,
  className?: string,
  limit = 10
) {
  const r = await api.get<Envelope<LeaderboardEntry[]>>('/discipline/leaderboard', {
    params: {
      category,
      class_name: className && className !== 'all' ? className : undefined,
      limit,
    },
  });
  return r.data.data ?? [];
}

export async function reportPenalty(payload: {
  student_id: number;
  violation_code: string;
  incident_date?: string;
  notes?: string;
}) {
  const r = await api.post<Envelope<IncidentRecord>>(
    '/discipline/incidents/penalty',
    payload
  );
  return r.data;
}

export async function reportAdjustment(payload: {
  student_id: number;
  appreciation_code: string;
  incident_date?: string;
  payoff_hours?: number;
  extra_points?: number;
  notes?: string;
}) {
  const r = await api.post<Envelope<IncidentRecord>>(
    '/discipline/incidents/adjustment',
    payload
  );
  return r.data;
}


export interface ClassLeaderboardEntry {
  rank: number;
  class_id: number;
  class_name: string;
  grade?: string | null;
  major?: string | null;
  homeroom_teacher?: string | null;
  student_count: number;
  avg_gpa: number;
  avg_attitude: number;
  total_appreciation: number;
  avg_punctuality_min: number;
  composite_score: number;
  top_student?: string | null;
  top_student_id?: number | null;
}

export async function fetchClassLeaderboard() {
  const r = await api.get<Envelope<ClassLeaderboardEntry[]>>(
    '/discipline/leaderboard/classes'
  );
  return r.data.data ?? [];
}


// ─── Gamification ──────────────────────────────────────────────────────────

export interface Quest {
  code: string;
  title: string;
  description: string;
  icon: string;
  progress: number;
  target: number;
  reward_xp: number;
  completed: boolean;
  percent: number;
}

export interface DailyRecap {
  today_status?: string | null;
  arrival_offset_min?: number | null;
  class_rank_today?: number | null;
  class_size_today?: number | null;
  streak_days: number;
  days_to_next_badge?: number | null;
  next_badge_code?: string | null;
  headline: string;
}

export interface VoiceGreetingPayload {
  text: string;
  name?: string;
  streak_days?: number;
  arrival_offset_min?: number | null;
  class_rank_today?: number | null;
}

export async function fetchMyQuests() {
  const r = await api.get<Envelope<Quest[]>>('/discipline/me/quests');
  return r.data.data ?? [];
}

export async function fetchMyRecap() {
  const r = await api.get<Envelope<DailyRecap>>('/discipline/me/recap');
  return r.data.data!;
}

/** Public endpoint — dipakai dari kiosk page tanpa auth. */
export async function fetchVoiceGreeting(userId: number): Promise<VoiceGreetingPayload> {
  const r = await api.get<Envelope<VoiceGreetingPayload>>(
    `/discipline/voice-greeting/${userId}`
  );
  return r.data.data!;
}

// ─── Mood ──────────────────────────────────────────────────────────────────

export async function postMood(mood: number, note?: string) {
  const r = await api.post<Envelope<{ ok: boolean }>>('/discipline/me/mood', {
    mood,
    note,
  });
  return r.data;
}

export async function fetchMyMoodToday() {
  const r = await api.get<Envelope<{ mood: number; note?: string } | null>>(
    '/discipline/me/mood/today'
  );
  return r.data.data;
}

export interface MoodAggregate {
  period_start: string;
  period_end: string;
  total_checkins: number;
  avg_mood: number;
  distribution: Record<string, number>;
}

export async function fetchMoodAggregate(days = 7, className?: string) {
  const r = await api.get<Envelope<MoodAggregate>>('/discipline/mood/aggregate', {
    params: { days, class_name: className },
  });
  return r.data.data!;
}

// ─── Watchlist ─────────────────────────────────────────────────────────────

export async function fetchWatchlist(params?: {
  threshold_attitude?: number;
  threshold_late_count?: number;
  days?: number;
}) {
  const r = await api.get<Envelope<StudentDisciplineSummary[]>>(
    '/discipline/watchlist',
    { params }
  );
  return r.data.data ?? [];
}


// ─── Role-Specific Dashboards ──────────────────────────────────────────────

export interface ExecKpi {
  total_students: number;
  total_classes: number;
  today_present: number;
  today_late: number;
  today_absent: number;
  avg_attitude: number;
  total_appreciation: number;
  pending_approvals: number;
  watchlist_count: number;
}

export interface ClassPerformanceItem {
  class_id: number;
  class_name: string;
  avg_attitude: number;
  avg_gpa: number;
  today_attendance_pct: number;
}

export interface ExecDashboardData {
  kpi: ExecKpi;
  top_classes: ClassPerformanceItem[];
  bottom_classes: ClassPerformanceItem[];
  weekly_attendance_trend: { date: string; present: number; late: number; absent: number }[];
}

export async function fetchExecDashboard() {
  const r = await api.get<Envelope<ExecDashboardData>>('/exec/dashboard');
  return r.data.data!;
}

export interface HomeroomClass {
  class_id: number;
  class_name: string;
  grade?: string | null;
  major?: string | null;
  student_count: number;
  today_present: number;
  today_late: number;
  today_absent: number;
  not_yet_checked_in: number;
  avg_attitude: number;
  avg_gpa: number;
  composite_score: number;
  students: StudentDisciplineSummary[];
}

export async function fetchMyHomeroomClass() {
  const r = await api.get<Envelope<HomeroomClass | null>>('/classroom/my-class');
  return r.data;
}

export interface BkCase {
  student: StudentDisciplineSummary;
  pending_notes_count: number;
  last_note_at?: string | null;
  today_mood?: number | null;
  risk_score: number;
}

export async function fetchBkCases() {
  const r = await api.get<Envelope<BkCase[]>>('/bk/cases');
  return r.data.data ?? [];
}

export interface BkNote {
  id: number;
  student_id: number;
  author_id: number;
  author_name?: string | null;
  pinned: boolean;
  body: string;
  created_at: string;
  updated_at?: string | null;
}

export async function fetchBkNotes(studentId: number) {
  const r = await api.get<Envelope<BkNote[]>>(`/bk/notes/${studentId}`);
  return r.data.data ?? [];
}

export async function addBkNote(studentId: number, body: string, pinned = false) {
  const r = await api.post<Envelope<BkNote>>(`/bk/notes/${studentId}`, {
    body,
    pinned,
  });
  return r.data.data!;
}

export async function deleteBkNote(noteId: number) {
  await api.delete(`/bk/notes/${noteId}`);
}

export interface PendingApproval {
  id: number;
  student_id: number;
  student_name: string;
  student_class?: string | null;
  requester_id: number;
  requester_name: string;
  violation_code: string;
  violation_name: string;
  severity: string;
  attitude_penalty: number;
  kersos_hours: number;
  lembur_hours: number;
  incident_date: string;
  notes?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  decision_at?: string | null;
  decision_by_name?: string | null;
  decision_reason?: string | null;
  created_at: string;
}

export async function fetchApprovals(statusFilter?: 'pending' | 'approved' | 'rejected') {
  const r = await api.get<Envelope<PendingApproval[]>>('/exec/approvals', {
    params: statusFilter ? { status_filter: statusFilter } : undefined,
  });
  return r.data.data ?? [];
}

export async function decideApproval(
  approvalId: number,
  decision: 'approve' | 'reject',
  reason?: string
) {
  const r = await api.post<Envelope<PendingApproval>>(
    `/exec/approvals/${approvalId}/decide`,
    { decision, reason }
  );
  return r.data;
}


// ─── Heatmap & Digest ──────────────────────────────────────────────────────

export interface HeatmapCell {
  day_of_week: number;
  day_label: string;
  hour: number;
  late_count: number;
  incident_count: number;
}

export interface HeatmapData {
  period_start: string;
  period_end: string;
  grid: HeatmapCell[];
  peak_late_day?: string | null;
  peak_late_hour?: number | null;
  peak_incident_day?: string | null;
}

export async function fetchHeatmap(days = 30) {
  const r = await api.get<Envelope<HeatmapData>>('/exec/heatmap', { params: { days } });
  return r.data.data!;
}

export interface DigestPreview {
  role: string;
  recipient_name: string;
  recipient_phone?: string | null;
  title: string;
  body: string;
}

export async function previewDigests() {
  const r = await api.get<Envelope<DigestPreview[]>>('/digest/preview');
  return r.data.data ?? [];
}

export interface DigestSendResult {
  role: string;
  recipient_name: string;
  sent: boolean;
  error?: string | null;
}

export async function sendDigestNow() {
  const r = await api.post<Envelope<DigestSendResult[]>>('/digest/send-now');
  return r.data;
}


// ─── Homeroom Assignment (kepsek) ──────────────────────────────────────────

export interface HomeroomCandidate {
  id: number;
  full_name: string;
  email: string | null;
  homeroom_class_id?: number | null;
  homeroom_class_name?: string | null;
}

export interface SchoolClassOption {
  id: number;
  name: string;
  grade?: string | null;
  major?: string | null;
  homeroom_teacher_id?: number | null;
  homeroom_teacher_name?: string | null;
}

export async function fetchHomeroomCandidates() {
  // Reuse /v1/users dengan filter — kepsek lihat semua admin (wali kelas)
  const r = await api.get<Envelope<any[]>>('/users', {
    params: { per_page: 100, show_all: true },
  });
  const users = r.data.data ?? [];
  // Hanya admin role
  return users
    .filter((u) => u.role === 'admin')
    .map((u) => ({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      homeroom_class_id: u.homeroom_class_id ?? null,
      homeroom_class_name: u.homeroom_class?.name ?? null,
    })) as HomeroomCandidate[];
}

export async function assignHomeroom(
  userId: number,
  classId: number | null
) {
  const r = await api.post<Envelope<{ user_id: number; homeroom_class_id: number | null }>>(
    '/exec/homeroom-assignment',
    { user_id: userId, homeroom_class_id: classId }
  );
  return r.data;
}


// ─── Dashboard Extras (visualisasi tambahan) ────────────────────────────────

export interface CategoryCount {
  label: string;
  count: number;
}

export interface WeeklyAttendancePoint {
  week_start: string;
  week_label: string;
  present: number;
  late: number;
  absent: number;
}

export interface SubjectAvgItem {
  subject_code: string;
  subject_name: string;
  avg_score: number;
  submissions: number;
}

export interface ExecExtras {
  violation_breakdown: CategoryCount[];
  severity_breakdown: CategoryCount[];
  weekly_attendance: WeeklyAttendancePoint[];
}

export async function fetchExecExtras() {
  const r = await api.get<Envelope<ExecExtras>>('/exec/dashboard-extras');
  return r.data.data!;
}

export interface HomeroomExtras {
  weekly_attendance: WeeklyAttendancePoint[];
  subject_avg: SubjectAvgItem[];
  attitude_distribution: CategoryCount[];
}

export async function fetchHomeroomExtras() {
  const r = await api.get<Envelope<HomeroomExtras | null>>('/classroom/my-class/extras');
  return r.data.data;
}

export interface BkExtras {
  cases_trend: CategoryCount[];
  category_breakdown: CategoryCount[];
  mood_trend: CategoryCount[];
}

export async function fetchBkExtras() {
  const r = await api.get<Envelope<BkExtras>>('/bk/extras');
  return r.data.data!;
}

export interface MyDashboardExtras {
  attendance_pie: CategoryCount[];
  subject_progress: SubjectAvgItem[];
  weekly_xp: { week_label: string; xp: number }[];
  rank_in_class: {
    gpa: number | null;
    attitude: number | null;
    appreciation: number | null;
    class_size: number;
  };
}

export async function fetchMyDashboardExtras() {
  const r = await api.get<Envelope<MyDashboardExtras>>('/discipline/me/extras');
  return r.data.data!;
}
