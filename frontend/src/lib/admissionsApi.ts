import api, { type Envelope } from './api';

export interface AdmissionPeriod {
  id: number;
  name: string;
  school_year: string;
  start_at: string;
  end_at: string;
  quota?: number | null;
  registration_fee: number;
  is_active: boolean;
  description?: string | null;
  applications_count: number;
  accepted_count: number;
  enrolled_count: number;
  created_at: string;
}

export interface PeriodInput {
  name: string;
  school_year: string;
  start_at: string;
  end_at: string;
  quota?: number | null;
  registration_fee?: number;
  is_active?: boolean;
  description?: string;
}

export interface Application {
  id: number;
  period_id: number;
  period_name?: string | null;
  registration_number: string;
  full_name: string;
  nisn?: string | null;
  nik?: string | null;
  birth_place?: string | null;
  birth_date?: string | null;
  gender: string;
  religion?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  previous_school?: string | null;
  father_name?: string | null;
  mother_name?: string | null;
  parent_phone?: string | null;
  parent_occupation?: string | null;
  photo_url?: string | null;
  kk_url?: string | null;
  akta_url?: string | null;
  raport_url?: string | null;
  status: string;
  decision_note?: string | null;
  decided_by?: number | null;
  decided_at?: string | null;
  enrolled_user_id?: number | null;
  submitted_at: string;
}

export async function fetchActivePeriods(orgId: number) {
  const r = await api.get<Envelope<AdmissionPeriod[]>>(
    '/admissions/periods/active',
    { params: { org_id: orgId } }
  );
  return r.data.data ?? [];
}

export async function fetchPeriods() {
  const r = await api.get<Envelope<AdmissionPeriod[]>>('/admissions/periods');
  return r.data.data ?? [];
}

export async function createPeriod(payload: PeriodInput) {
  const r = await api.post<Envelope<AdmissionPeriod>>('/admissions/periods', payload);
  return r.data.data!;
}

export async function updatePeriod(id: number, payload: PeriodInput) {
  const r = await api.put<Envelope<AdmissionPeriod>>(
    `/admissions/periods/${id}`,
    payload
  );
  return r.data.data!;
}

export async function fetchApplications(params?: {
  period_id?: number;
  status?: string;
  q?: string;
}) {
  const r = await api.get<Envelope<Application[]>>('/admissions/applications', { params });
  return r.data.data ?? [];
}

export async function decideApplication(
  id: number,
  payload: { status: string; note?: string }
) {
  const r = await api.patch<Envelope<Application>>(
    `/admissions/applications/${id}/decide`,
    payload
  );
  return r.data.data!;
}

export async function enrollApplication(id: number) {
  const r = await api.post<Envelope<{
    user_id: number;
    employee_id: string;
    initial_password: string;
  }>>(`/admissions/applications/${id}/enroll`, {});
  return r.data.data!;
}

export async function submitApplication(formData: FormData) {
  const r = await api.post<Envelope<{
    registration_number: string;
    id: number;
    status: string;
  }>>('/admissions/apply', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return r.data.data!;
}

export async function checkApplicationStatus(
  registration_number: string,
  email: string
) {
  const r = await api.post<Envelope<{
    registration_number: string;
    full_name: string;
    period_name?: string;
    status: string;
    decision_note?: string;
    submitted_at: string;
  }>>('/admissions/check-status', { registration_number, email });
  return r.data.data!;
}
