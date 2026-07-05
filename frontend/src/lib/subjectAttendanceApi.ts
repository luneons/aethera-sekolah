import api, { type Envelope } from './api';

export interface StudentAttRow {
  student_id: number;
  full_name: string;
  employee_id: string;
  photo_url?: string | null;
  status: 'present' | 'late' | 'absent' | 'sick' | 'permit' | 'leave';
  note?: string | null;
  record_id?: number | null;
}

export interface SessionRoster {
  slot_id: number;
  subject_name: string;
  teacher_name?: string | null;
  school_class_name: string;
  session_date: string;
  period_index: number;
  students: StudentAttRow[];
}

export interface StudentSummary {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  total_sessions: number;
  present: number;
  late: number;
  absent: number;
  sick: number;
  permit: number;
  leave: number;
  attendance_rate: number;
}

export async function fetchSessionRoster(slotId: number, sessionDate?: string) {
  const r = await api.get<Envelope<SessionRoster>>(
    `/subject-attendance/session/${slotId}`,
    { params: sessionDate ? { session_date: sessionDate } : undefined }
  );
  return r.data.data!;
}

export async function bulkMarkAttendance(payload: {
  slot_id: number;
  session_date: string;
  rows: Array<{
    student_id: number;
    status: string;
    note?: string;
  }>;
}) {
  const r = await api.post<Envelope<{ saved: number; skipped: number }>>(
    '/subject-attendance/bulk-mark',
    payload
  );
  return r.data.data!;
}

export async function fetchStudentSubjectSummary(
  studentId: number,
  fromDate?: string,
  toDate?: string
) {
  const r = await api.get<Envelope<StudentSummary[]>>(
    `/subject-attendance/student/${studentId}/summary`,
    {
      params: {
        from_date: fromDate,
        to_date: toDate,
      },
    }
  );
  return r.data.data ?? [];
}
