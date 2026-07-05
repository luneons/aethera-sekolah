/**
 * Client API untuk Quiz online + anti-cheat.
 */
import api, { type Envelope } from './api';

// ─── Types ──────────────────────────────────────────────────────────────────

export type QuestionType = 'mcq' | 'tf' | 'essay';

export interface QuizQuestion {
  id: number;
  question_type: QuestionType;
  body: string;
  options?: string[] | null;
  correct_value?: string | null;
  points: number;
  explanation?: string | null;
  order_index: number;
}

export interface StudentQuizQuestion {
  id: number;
  question_type: QuestionType;
  body: string;
  options?: string[] | null;
  points: number;
  order_index: number;
}

export interface QuizAttempt {
  id: number;
  assignment_id: number;
  status:
    | 'in_progress'
    | 'submitted'
    | 'locked'
    | 'unlocked_by_teacher'
    | 'auto_submitted'
    | 'not_started';
  started_at: string;
  deadline_at?: string | null;
  locked_until?: string | null;
  submitted_at?: string | null;
  focus_violations: number;
  answers: Record<string, string>;
  raw_score?: number | null;
  final_score?: number | null;
  duration_minutes?: number | null;
  max_focus_violations: number;
  lock_duration_minutes: number;
}

export interface QuizPlayPayload {
  attempt: QuizAttempt;
  questions: StudentQuizQuestion[];
  assignment_title: string;
  duration_minutes?: number | null;
}

export interface ProctorRow {
  student_id: number;
  student_name: string;
  nis: string;
  status: string;
  focus_violations: number;
  locked_until?: string | null;
  started_at?: string | null;
  submitted_at?: string | null;
  final_score?: number | null;
}

// ─── Teacher: kelola soal ──────────────────────────────────────────────────

export interface QuestionInput {
  question_type: QuestionType;
  body: string;
  options?: string[];
  correct_value?: string;
  points: number;
  explanation?: string;
}

export async function fetchQuizQuestions(assignmentId: number) {
  const r = await api.get<Envelope<QuizQuestion[]>>(
    `/quiz/assignments/${assignmentId}/questions`
  );
  return r.data.data ?? [];
}

export async function saveQuizQuestions(
  assignmentId: number,
  questions: QuestionInput[]
) {
  const r = await api.post<Envelope<QuizQuestion[]>>(
    `/quiz/assignments/${assignmentId}/questions`,
    questions
  );
  return r.data.data ?? [];
}

// ─── Student: play ─────────────────────────────────────────────────────────

export async function startQuiz(assignmentId: number) {
  const r = await api.post<Envelope<QuizPlayPayload>>(
    `/quiz/assignments/${assignmentId}/start`,
    {}
  );
  return r.data.data!;
}

export async function saveAnswer(
  assignmentId: number,
  question_id: number,
  answer: string
) {
  const r = await api.post<Envelope<QuizAttempt>>(
    `/quiz/assignments/${assignmentId}/answer`,
    { question_id, answer }
  );
  return r.data.data!;
}

export async function submitQuiz(assignmentId: number) {
  const r = await api.post<Envelope<QuizAttempt>>(
    `/quiz/assignments/${assignmentId}/submit`,
    {}
  );
  return r.data;
}

export async function reportViolation(
  assignmentId: number,
  reason = 'visibility_change'
) {
  const r = await api.post<Envelope<QuizAttempt>>(
    `/quiz/assignments/${assignmentId}/violation`,
    { reason }
  );
  return r.data;
}

// ─── Proctor (guru) ─────────────────────────────────────────────────────────

export async function fetchProctor(assignmentId: number) {
  const r = await api.get<Envelope<ProctorRow[]>>(
    `/quiz/assignments/${assignmentId}/proctor`
  );
  return r.data.data ?? [];
}

export async function unlockStudent(assignmentId: number, studentId: number) {
  const r = await api.post<Envelope<ProctorRow>>(
    `/quiz/assignments/${assignmentId}/unlock/${studentId}`,
    {}
  );
  return r.data;
}


export async function publishQuiz(assignmentId: number) {
  const r = await api.post<Envelope<{ is_published: boolean; questions?: number }>>(
    `/quiz/assignments/${assignmentId}/publish`,
    {}
  );
  return r.data;
}

export async function unpublishQuiz(assignmentId: number) {
  const r = await api.post<Envelope<{ is_published: boolean }>>(
    `/quiz/assignments/${assignmentId}/unpublish`,
    {}
  );
  return r.data;
}
