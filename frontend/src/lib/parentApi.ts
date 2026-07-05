/**
 * Client API untuk Parent Portal & Parent Admin.
 */
import api, { type Envelope } from './api';

// ─── Parent admin (sekolah → kelola akun ortu) ──────────────────────────

export interface ParentAccount {
  id: number;
  phone: string;
  full_name: string;
  email?: string | null;
  is_active: boolean;
  last_login_at?: string | null;
  children_count: number;
  children: Array<{
    student_id: number;
    full_name: string;
    employee_id: string;
    class_name?: string | null;
    relationship: string;
  }>;
  created_at: string;
}

export async function fetchParentAccounts(q?: string) {
  const r = await api.get<Envelope<ParentAccount[]>>('/parents', {
    params: q ? { q } : undefined,
  });
  return r.data.data ?? [];
}

export async function createParentAccount(payload: {
  phone: string;
  full_name: string;
  email?: string;
  student_ids: number[];
  relationship: 'ayah' | 'ibu' | 'wali';
  password?: string;
}) {
  const r = await api.post<
    Envelope<{ parent: ParentAccount; initial_password: string }>
  >('/parents', payload);
  return r.data.data!;
}

export async function linkStudentToParent(
  parentId: number,
  studentId: number,
  relationship: 'ayah' | 'ibu' | 'wali'
) {
  const r = await api.post<Envelope<ParentAccount>>(
    `/parents/${parentId}/link`,
    { student_id: studentId, relationship }
  );
  return r.data.data!;
}

export async function unlinkStudent(parentId: number, studentId: number) {
  const r = await api.delete<Envelope<ParentAccount>>(
    `/parents/${parentId}/link/${studentId}`
  );
  return r.data.data!;
}

export async function resetParentPassword(parentId: number) {
  const r = await api.post<Envelope<{ new_password: string }>>(
    `/parents/${parentId}/reset-password`,
    {}
  );
  return r.data.data!.new_password;
}

export async function toggleParentActive(parentId: number) {
  const r = await api.patch<Envelope<ParentAccount>>(
    `/parents/${parentId}/toggle-active`,
    {}
  );
  return r.data.data!;
}

export async function deleteParentAccount(parentId: number) {
  await api.delete(`/parents/${parentId}`);
}

export async function autoCreateParentAccounts() {
  const r = await api.post<
    Envelope<{
      created: Array<{ phone: string; name: string; password: string; children?: string[]; children_added?: number }>;
      skipped: number;
      total_processed: number;
    }>
  >('/parents/auto-create', {});
  return r.data;
}

// ─── Parent portal (login ortu pakai token sendiri) ──────────────────────

export interface ParentMe {
  id: number;
  full_name: string;
  phone: string;
  email?: string | null;
}

export interface ChildSummary {
  id: number;
  full_name: string;
  employee_id: string;
  photo_url?: string | null;
  class_name?: string | null;
  relationship: string;
  today_attendance_status?: string | null;
  today_check_in_at?: string | null;
  attitude_points: number;
  appreciation_points: number;
  overall_gpa?: number | null;
  unpaid_bills_count: number;
  unpaid_total: number;
}

const PARENT_TOKEN_KEY = 'aethera_parent_token';
const PARENT_INFO_KEY = 'aethera_parent_info';

export function getParentToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(PARENT_TOKEN_KEY);
}

export function setParentToken(token: string, info: { id: number; name: string }) {
  window.localStorage.setItem(PARENT_TOKEN_KEY, token);
  window.localStorage.setItem(PARENT_INFO_KEY, JSON.stringify(info));
}

export function clearParentToken() {
  window.localStorage.removeItem(PARENT_TOKEN_KEY);
  window.localStorage.removeItem(PARENT_INFO_KEY);
}

export function getParentInfo(): { id: number; name: string } | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(PARENT_INFO_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parentHeaders() {
  const t = getParentToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function parentLogin(phone: string, password: string) {
  const r = await api.post<
    Envelope<{
      access_token: string;
      expires_in: number;
      parent_id: number;
      parent_name: string;
      children_count: number;
    }>
  >('/parent/login', { phone, password });
  return r.data.data!;
}

export async function fetchParentMe() {
  const r = await api.get<Envelope<ParentMe>>('/parent/me', {
    headers: parentHeaders(),
  });
  return r.data.data!;
}

export async function fetchChildren() {
  const r = await api.get<Envelope<ChildSummary[]>>('/parent/children', {
    headers: parentHeaders(),
  });
  return r.data.data ?? [];
}

export interface ChildAttendanceRow {
  date: string;
  status: string;
  check_in_at?: string | null;
  check_out_at?: string | null;
  late_minutes: number;
  notes?: string | null;
}

export async function fetchChildAttendance(studentId: number, days = 30) {
  const r = await api.get<Envelope<ChildAttendanceRow[]>>(
    `/parent/children/${studentId}/attendance`,
    { headers: parentHeaders(), params: { days } }
  );
  return r.data.data ?? [];
}

export interface ChildGradeRow {
  assignment_title: string;
  subject_code: string;
  subject_name: string;
  teacher_name: string;
  score: number;
  max_score: number;
  percent: number;
  graded_at?: string | null;
}

export async function fetchChildGrades(studentId: number) {
  const r = await api.get<Envelope<ChildGradeRow[]>>(
    `/parent/children/${studentId}/grades`,
    { headers: parentHeaders() }
  );
  return r.data.data ?? [];
}

export interface ChildIncidentRow {
  id: number;
  kind: 'penalty' | 'adjustment';
  incident_date: string;
  ref_name: string;
  attitude_delta: number;
  appreciation_delta: number;
  notes?: string | null;
}

export async function fetchChildIncidents(studentId: number) {
  const r = await api.get<Envelope<ChildIncidentRow[]>>(
    `/parent/children/${studentId}/incidents`,
    { headers: parentHeaders() }
  );
  return r.data.data ?? [];
}

export interface ChildBillRow {
  id: number;
  category_name: string;
  period: string;
  amount: number;
  paid_amount: number;
  remaining: number;
  due_date?: string | null;
  status: string;
}

export async function fetchChildBills(studentId: number) {
  const r = await api.get<Envelope<ChildBillRow[]>>(
    `/parent/children/${studentId}/bills`,
    { headers: parentHeaders() }
  );
  return r.data.data ?? [];
}

export async function parentSubmitLeave(payload: {
  student_id: number;
  kind: 'sakit' | 'izin' | 'lainnya';
  start_date: string;
  end_date: string;
  reason: string;
}) {
  const r = await api.post<Envelope<{ id: number }>>(
    '/parent/leave',
    payload,
    { headers: parentHeaders() }
  );
  return r.data;
}
