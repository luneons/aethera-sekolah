import api, { type Envelope } from './api';

export interface Ekskul {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  coach_id?: number | null;
  coach_name?: string | null;
  schedule_text?: string | null;
  location?: string | null;
  quota?: number | null;
  is_active: boolean;
  enrolled_count: number;
  pending_count: number;
  approved_count: number;
  is_self_enrolled: boolean;
  self_enrollment_status?: string | null;
}

export interface EkskulInput {
  code: string;
  name: string;
  description?: string;
  coach_id?: number | null;
  schedule_text?: string;
  location?: string;
  quota?: number | null;
  is_active?: boolean;
}

export interface Enrollment {
  id: number;
  ekskul_id: number;
  ekskul_name: string;
  student_id: number;
  student_name: string;
  status: string;
  enrolled_at: string;
  decided_by?: number | null;
}

export interface Achievement {
  id: number;
  ekskul_id: number;
  ekskul_name: string;
  title: string;
  description?: string | null;
  achievement_date: string;
  level: string;
  rank?: string | null;
  appreciation_points: number;
  photo_url?: string | null;
  member_count: number;
  member_names: string[];
  created_at: string;
}

export async function fetchEkskuls(only_active = true) {
  const r = await api.get<Envelope<Ekskul[]>>('/ekskul', {
    params: { only_active },
  });
  return r.data.data ?? [];
}

export async function createEkskul(payload: EkskulInput) {
  const r = await api.post<Envelope<Ekskul>>('/ekskul', payload);
  return r.data.data!;
}

export async function updateEkskul(id: number, payload: EkskulInput) {
  const r = await api.put<Envelope<Ekskul>>(`/ekskul/${id}`, payload);
  return r.data.data!;
}

export async function deleteEkskul(id: number) {
  await api.delete(`/ekskul/${id}`);
}

export async function enrollEkskul(ekskul_id: number, student_id?: number) {
  const r = await api.post<Envelope<Enrollment>>('/ekskul/enroll', {
    ekskul_id,
    student_id,
  });
  return r.data.data!;
}

export async function fetchEnrollments(params?: {
  ekskul_id?: number;
  status?: string;
  student_id?: number;
}) {
  const r = await api.get<Envelope<Enrollment[]>>('/ekskul/enrollments', { params });
  return r.data.data ?? [];
}

export async function decideEnrollment(
  id: number,
  status: 'approved' | 'rejected'
) {
  const r = await api.patch<Envelope<Enrollment>>(`/ekskul/enrollments/${id}`, {
    status,
  });
  return r.data.data!;
}

export async function cancelEnrollment(id: number) {
  await api.delete(`/ekskul/enrollments/${id}`);
}

export interface AchievementInput {
  ekskul_id: number;
  title: string;
  description?: string;
  achievement_date: string;
  level: string;
  rank?: string;
  appreciation_points: number;
  photo_url?: string;
  member_student_ids: number[];
}

export async function addAchievement(payload: AchievementInput) {
  const r = await api.post<Envelope<Achievement>>('/ekskul/achievements', payload);
  return r.data.data!;
}

export async function fetchAchievements(params?: {
  ekskul_id?: number;
  limit?: number;
}) {
  const r = await api.get<Envelope<Achievement[]>>('/ekskul/achievements', {
    params,
  });
  return r.data.data ?? [];
}

export async function deleteAchievement(id: number) {
  await api.delete(`/ekskul/achievements/${id}`);
}
