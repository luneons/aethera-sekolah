import api, { type Envelope } from './api';

export interface AiInsight {
  id: number;
  scope: 'school' | 'class' | 'student';
  scope_id?: number | null;
  insight_type: string;
  summary: string;
  items: string[];
  severity: 'info' | 'warning' | 'critical';
  generated_at: string;
  expires_at?: string | null;
  source: string;
}

export async function fetchSchoolInsight(refresh = false) {
  const r = await api.get<Envelope<AiInsight>>('/ai-insight/school', {
    params: { refresh },
  });
  return r.data.data!;
}

export async function fetchClassInsight(class_id: number, refresh = false) {
  const r = await api.get<Envelope<AiInsight>>(`/ai-insight/class/${class_id}`, {
    params: { refresh },
  });
  return r.data.data!;
}

export async function fetchStudentInsight(student_id: number, refresh = false) {
  const r = await api.get<Envelope<AiInsight>>(
    `/ai-insight/student/${student_id}`,
    { params: { refresh } }
  );
  return r.data.data!;
}

export async function fetchMyInsight(refresh = false) {
  const r = await api.get<Envelope<AiInsight>>('/ai-insight/my-status', {
    params: { refresh },
  });
  return r.data.data!;
}
