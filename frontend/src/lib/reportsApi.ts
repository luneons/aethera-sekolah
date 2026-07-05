import api, { type Envelope } from './api';

// Akademik
export interface ClassPerformance {
  class_id: number;
  class_name: string;
  total_students: number;
  avg_score: number;
  graded_count: number;
  above_kkm_count: number;
  above_kkm_pct: number;
  avg_gpa: number;
}

export interface SubjectPerformance {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  avg_score: number;
  min_score: number;
  max_score: number;
  graded_count: number;
}

export interface TopStudent {
  student_id: number;
  full_name: string;
  employee_id: string;
  class_name?: string | null;
  gpa: number;
  attitude_points: number;
  appreciation_points: number;
}

// Disiplin
export interface IncidentStats {
  total_incidents: number;
  by_severity: Array<{ severity: string; count: number }>;
  by_type: Array<{ type: string; count: number }>;
  recidivists: Array<{
    student_id: number;
    full_name: string;
    employee_id: string;
    class_name?: string;
    incident_count: number;
  }>;
  period_days: number;
}

// Keuangan
export interface BillingSummary {
  total_amount: number;
  total_paid: number;
  outstanding: number;
  collection_rate: number;
  total_bills: number;
  paid_bills: number;
  unpaid_bills: number;
  overdue_bills: number;
  by_category: Array<{
    category_id: number;
    category_name: string;
    amount: number;
    paid: number;
    outstanding: number;
    count: number;
  }>;
}

export interface PaymentHistoryRow {
  payment_id: number;
  bill_id: number;
  student_name: string;
  student_employee_id: string;
  amount: number;
  method?: string;
  reference?: string;
  paid_at: string;
  bill_period: string;
}

// Operasional
export interface UksSummary {
  total_visits: number;
  by_outcome: Record<string, number>;
  by_class: Array<{ class_name: string; count: number }>;
  low_stock_medicines: Array<{ name: string; stock: number; threshold: number }>;
  expiring_medicines: Array<{ name: string; expire_date: string }>;
  period_days: number;
}

export interface LibrarySummary {
  total_books: number;
  total_copies: number;
  active_loans: number;
  overdue: number;
  top_books: Array<{ title: string; loan_count: number }>;
  top_readers: Array<{ name: string; loan_count: number }>;
}

export interface InventorySummary {
  total_items: number;
  total_quantity: number;
  total_value: number;
  by_condition: Record<string, { count: number; qty: number; value: number }>;
  by_category: Array<{ category: string; qty: number }>;
  by_location: Array<{ location: string; qty: number }>;
}

// PPDB
export interface PpdbPeriodStat {
  period_id: number;
  period_name: string;
  school_year: string;
  is_active: boolean;
  quota: number | null;
  start_at: string;
  end_at: string;
  total_applications: number;
  by_status: Record<string, number>;
  conversion_rate: number;
  registration_fee_total: number;
}

// Audit
export interface AuditActivity {
  daily: Array<{ date: string; count: number }>;
  active_users: Array<{ name: string; login_count: number }>;
  period_days: number;
}

// ─── API calls ─────────────────────────────────────────────────────────────


export async function fetchClassPerformance(semester_start?: string) {
  const r = await api.get<Envelope<ClassPerformance[]>>(
    '/reports-ext/academic/class-performance',
    { params: { semester_start } }
  );
  return r.data.data ?? [];
}

export async function fetchSubjectPerformance(semester_start?: string) {
  const r = await api.get<Envelope<SubjectPerformance[]>>(
    '/reports-ext/academic/subject-performance',
    { params: { semester_start } }
  );
  return r.data.data ?? [];
}

export async function fetchTopStudents(limit = 20, bottom = false) {
  const r = await api.get<Envelope<TopStudent[]>>(
    '/reports-ext/academic/top-students',
    { params: { limit, bottom } }
  );
  return r.data.data ?? [];
}

export async function fetchIncidentStats(days = 90) {
  const r = await api.get<Envelope<IncidentStats>>(
    '/reports-ext/discipline/incident-stats',
    { params: { days } }
  );
  return r.data.data!;
}

export async function fetchAppreciationLeaderboard(limit = 20) {
  const r = await api.get<Envelope<TopStudent[]>>(
    '/reports-ext/discipline/appreciation-leaderboard',
    { params: { limit } }
  );
  return r.data.data ?? [];
}

export async function fetchBillingSummary(period?: string) {
  const r = await api.get<Envelope<BillingSummary>>(
    '/reports-ext/finance/billing-summary',
    { params: { period } }
  );
  return r.data.data!;
}

export async function fetchPaymentHistory(params?: {
  from_date?: string;
  to_date?: string;
  limit?: number;
}) {
  const r = await api.get<Envelope<PaymentHistoryRow[]>>(
    '/reports-ext/finance/payment-history',
    { params }
  );
  return r.data.data ?? [];
}

export async function fetchUksSummary(days = 30) {
  const r = await api.get<Envelope<UksSummary>>(
    '/reports-ext/operational/uks-summary',
    { params: { days } }
  );
  return r.data.data!;
}

export async function fetchLibrarySummary() {
  const r = await api.get<Envelope<LibrarySummary>>(
    '/reports-ext/operational/library-summary'
  );
  return r.data.data!;
}

export async function fetchInventorySummary() {
  const r = await api.get<Envelope<InventorySummary>>(
    '/reports-ext/operational/inventory-summary'
  );
  return r.data.data!;
}

export async function fetchPpdbStats() {
  const r = await api.get<Envelope<PpdbPeriodStat[]>>(
    '/reports-ext/ppdb/period-stats'
  );
  return r.data.data ?? [];
}

export async function fetchAuditActivity(days = 7) {
  const r = await api.get<Envelope<AuditActivity>>(
    '/reports-ext/audit/activity-summary',
    { params: { days } }
  );
  return r.data.data!;
}

// CSV downloads
export function classPerformanceCsvUrl() {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/v1';
  return `${base}/reports-ext/export/class-performance.csv`;
}

export function paymentsCsvUrl(from?: string, to?: string) {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/v1';
  const params = new URLSearchParams();
  if (from) params.set('from_date', from);
  if (to) params.set('to_date', to);
  const q = params.toString();
  return `${base}/reports-ext/export/payment-history.csv${q ? '?' + q : ''}`;
}
