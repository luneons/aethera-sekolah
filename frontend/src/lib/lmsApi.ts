/**
 * Client API untuk modul LMS (Pembelajaran).
 * Mirror endpoint backend FastAPI /v1/subjects, /v1/assignments, /v1/materials, /v1/lms/me/*.
 */
import api, { type Envelope } from './api';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Subject {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  is_active: boolean;
}

export interface TeachingAssignment {
  id: number;
  teacher_id: number;
  teacher_name?: string | null;
  subject_id: number;
  subject_name?: string | null;
  subject_code?: string | null;
  school_class_id: number;
  school_class_name?: string | null;
}

export interface LessonMaterial {
  id: number;
  teacher_id: number;
  teacher_name?: string | null;
  subject_id: number;
  subject_name?: string | null;
  school_class_id?: number | null;
  school_class_name?: string | null;
  title: string;
  description?: string | null;
  file_url: string;
  file_name: string;
  file_size?: number | null;
  file_mime?: string | null;
  is_published: boolean;
  created_at: string;
}

export type AssignmentType = 'tugas' | 'ulangan' | 'kuis' | 'uts' | 'uas';

export interface Assignment {
  id: number;
  teacher_id: number;
  teacher_name?: string | null;
  subject_id: number;
  subject_name?: string | null;
  subject_code?: string | null;
  school_class_id: number;
  school_class_name?: string | null;
  title: string;
  description?: string | null;
  assignment_type: AssignmentType;
  max_score: number;
  weight: number;
  due_date?: string | null;
  is_published: boolean;
  graded_count: number;
  student_count: number;
  avg_score?: number | null;
  created_at: string;
  // Quiz online (optional, default 'manual')
  mode?: 'manual' | 'quiz';
  duration_minutes?: number | null;
  max_focus_violations?: number;
  lock_duration_minutes?: number;
  shuffle_questions?: boolean;
  show_score_immediately?: boolean;
  open_at?: string | null;
  close_at?: string | null;
}

export interface AssignmentInput {
  subject_id: number;
  school_class_id: number;
  title: string;
  description?: string;
  assignment_type: AssignmentType;
  max_score: number;
  weight: number;
  due_date?: string | null;
  is_published: boolean;
  mode?: 'manual' | 'quiz';
  duration_minutes?: number | null;
  max_focus_violations?: number;
  lock_duration_minutes?: number;
  shuffle_questions?: boolean;
  show_score_immediately?: boolean;
  open_at?: string | null;
  close_at?: string | null;
}

export interface Grade {
  id: number;
  assignment_id: number;
  student_id: number;
  student_name?: string | null;
  student_nis?: string | null;
  score: number;
  max_score?: number;
  note?: string | null;
  source: 'manual' | 'csv_upload' | 'xlsx_upload';
  graded_at: string;
}

export interface CsvPreviewRow {
  row_num: number;
  nis?: string | null;
  nama?: string | null;
  nilai?: number | null;
  catatan?: string | null;
  student_id?: number | null;
  student_name_db?: string | null;
  valid: boolean;
  error?: string | null;
}

export interface CsvPreview {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  rows: CsvPreviewRow[];
  column_format: Record<string, string>;
}

export interface CsvCommit {
  saved: number;
  skipped: number;
  errors: string[];
}

export interface StudentAssignment {
  id: number;
  title: string;
  description?: string | null;
  assignment_type: AssignmentType;
  subject_name?: string | null;
  subject_code?: string | null;
  teacher_name?: string | null;
  max_score: number;
  weight: number;
  due_date?: string | null;
  my_score?: number | null;
  my_note?: string | null;
  graded_at?: string | null;
  created_at: string;
  mode?: 'manual' | 'quiz';
  duration_minutes?: number | null;
}

export interface StudentMaterial {
  id: number;
  title: string;
  description?: string | null;
  subject_name?: string | null;
  subject_code?: string | null;
  teacher_name?: string | null;
  file_url: string;
  file_name: string;
  file_size?: number | null;
  file_mime?: string | null;
  created_at: string;
}

// ─── Subjects ───────────────────────────────────────────────────────────────

export async function fetchSubjects() {
  const r = await api.get<Envelope<Subject[]>>('/subjects');
  return r.data.data ?? [];
}

export async function createSubject(data: { code: string; name: string; description?: string }) {
  const r = await api.post<Envelope<Subject>>('/subjects', data);
  return r.data.data!;
}

export async function updateSubject(id: number, data: { code: string; name: string; description?: string }) {
  const r = await api.patch<Envelope<Subject>>(`/subjects/${id}`, data);
  return r.data.data!;
}

export async function deleteSubject(id: number) {
  await api.delete(`/subjects/${id}`);
}

// ─── Teaching Assignments ──────────────────────────────────────────────────

export async function fetchTeaching(teacherId?: number) {
  const r = await api.get<Envelope<TeachingAssignment[]>>('/teaching-assignments', {
    params: teacherId ? { teacher_id: teacherId } : undefined,
  });
  return r.data.data ?? [];
}

export async function createTeaching(data: {
  teacher_id: number;
  subject_id: number;
  school_class_id: number;
}) {
  const r = await api.post<Envelope<TeachingAssignment>>('/teaching-assignments', data);
  return r.data.data!;
}

export async function deleteTeaching(id: number) {
  await api.delete(`/teaching-assignments/${id}`);
}

// ─── Materials ──────────────────────────────────────────────────────────────

export async function fetchMaterials(params?: { subject_id?: number; school_class_id?: number }) {
  const r = await api.get<Envelope<LessonMaterial[]>>('/materials', { params });
  return r.data.data ?? [];
}

export async function uploadMaterial(formData: FormData) {
  const r = await api.post<Envelope<LessonMaterial>>('/materials', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return r.data;
}

export async function deleteMaterial(id: number) {
  await api.delete(`/materials/${id}`);
}

// ─── Assignments ────────────────────────────────────────────────────────────

export async function fetchAssignments(params?: {
  school_class_id?: number;
  subject_id?: number;
  mine_only?: boolean;
}) {
  const r = await api.get<Envelope<Assignment[]>>('/assignments', { params });
  return r.data.data ?? [];
}

export async function fetchAssignment(id: number) {
  const r = await api.get<Envelope<Assignment>>(`/assignments/${id}`);
  return r.data.data!;
}

export async function createAssignment(data: AssignmentInput) {
  const r = await api.post<Envelope<Assignment>>('/assignments', data);
  return r.data.data!;
}

export async function updateAssignment(id: number, data: AssignmentInput) {
  const r = await api.patch<Envelope<Assignment>>(`/assignments/${id}`, data);
  return r.data.data!;
}

export async function deleteAssignment(id: number) {
  await api.delete(`/assignments/${id}`);
}

// ─── Grades ────────────────────────────────────────────────────────────────

export async function fetchGrades(assignmentId: number) {
  const r = await api.get<Envelope<Grade[]>>(`/assignments/${assignmentId}/grades`);
  return r.data.data ?? [];
}

export async function saveGradesBulk(
  assignmentId: number,
  grades: { student_id: number; score: number; note?: string }[]
) {
  const r = await api.post<Envelope<CsvCommit>>(`/assignments/${assignmentId}/grades`, {
    grades,
  });
  return r.data;
}

export async function importPreviewGrades(assignmentId: number, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const r = await api.post<Envelope<CsvPreview>>(
    `/assignments/${assignmentId}/grades/import-preview`,
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return r.data;
}

export async function importCommitGrades(assignmentId: number, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const r = await api.post<Envelope<CsvCommit>>(
    `/assignments/${assignmentId}/grades/import-commit`,
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return r.data;
}

export function gradesTemplateUrl(assignmentId: number) {
  // Endpoint butuh auth, jadi kita fetch via api & buat blob download
  return `/assignments/${assignmentId}/grades/template`;
}

export async function downloadGradesTemplate(assignmentId: number, filename: string) {
  const r = await api.get(`/assignments/${assignmentId}/grades/template`, {
    responseType: 'blob',
  });
  const blob = new Blob([r.data], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Student Views ──────────────────────────────────────────────────────────

export async function fetchMyAssignments() {
  const r = await api.get<Envelope<StudentAssignment[]>>('/lms/me/assignments');
  return r.data.data ?? [];
}

export async function fetchMyMaterials() {
  const r = await api.get<Envelope<StudentMaterial[]>>('/lms/me/materials');
  return r.data.data ?? [];
}


// ─── Gradebook (matrix view) ────────────────────────────────────────────────

export interface GradebookStudent {
  id: number;
  nis: string;
  name: string;
  photo_url: string | null;
}

export interface GradebookAssignment {
  id: number;
  title: string;
  subject_code: string;
  subject_name: string;
  assignment_type: AssignmentType;
  max_score: number;
  weight: number;
  due_date: string | null;
}

export interface GradebookCell {
  score: number;
  note?: string | null;
  source: 'manual' | 'csv_upload' | 'xlsx_upload';
}

export interface GradebookData {
  class_id: number;
  class_name: string;
  grade: string | null;
  major: string | null;
  students: GradebookStudent[];
  assignments: GradebookAssignment[];
  grades: Record<number, Record<number, GradebookCell>>;
  stats: {
    students_count: number;
    assignments_count: number;
    graded_total: number;
    ungraded_total: number;
    class_avg_per_assignment: Record<number, number | null>;
  };
}

export async function fetchGradebook(params: {
  school_class_id?: number;
  subject_id?: number;
}) {
  const r = await api.get<Envelope<GradebookData>>('/lms/gradebook', { params });
  return r.data.data!;
}


// ─── Detail Nilai per Siswa ────────────────────────────────────────────────

export interface StudentGradeAssignment {
  assignment_id: number;
  title: string;
  assignment_type: AssignmentType;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  teacher_name: string;
  max_score: number;
  weight: number;
  due_date: string | null;
  mode: 'manual' | 'quiz';
  score: number | null;
  percent: number | null;
  note: string | null;
  graded_at: string | null;
  is_graded: boolean;
}

export interface StudentSubjectSummary {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  teacher_name: string;
  assignments_count: number;
  graded_count: number;
  average: number | null;
}

export interface StudentGradeDetail {
  student: {
    id: number;
    full_name: string;
    employee_id: string;
    photo_url: string | null;
    class_id: number | null;
    class_name: string | null;
  };
  summary: {
    overall_gpa: number | null;
    subjects_count: number;
    assignments_count: number;
    graded_count: number;
    ungraded_count: number;
    rank_in_class: {
      rank: number | null;
      class_size: number;
      cached_gpa: number;
    } | null;
  };
  subjects: StudentSubjectSummary[];
  assignments: StudentGradeAssignment[];
}

export async function fetchStudentGradeDetail(studentId: number) {
  const r = await api.get<Envelope<StudentGradeDetail>>(
    `/lms/gradebook/student/${studentId}`
  );
  return r.data.data!;
}
