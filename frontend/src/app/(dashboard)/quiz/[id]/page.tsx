'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldAlert,
  Send,
} from 'lucide-react';
import {
  fetchQuizQuestions,
  reportViolation,
  saveAnswer,
  startQuiz,
  submitQuiz,
  type QuizPlayPayload,
  type StudentQuizQuestion,
} from '@/lib/quizApi';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

function formatTime(secs: number): string {
  if (secs < 0) secs = 0;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function QuizPlayerPage() {
  const params = useParams<{ id: string }>();
  const assignmentId = Number(params.id);
  const router = useRouter();
  const qc = useQueryClient();

  const [now, setNow] = useState(() => Date.now());
  const violationCooldownRef = useRef(0);
  const submittedRef = useRef(false);

  const startMutation = useMutation({
    mutationFn: () => startQuiz(assignmentId),
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['quiz-play', assignmentId],
    queryFn: () => startQuiz(assignmentId),
    enabled: !Number.isNaN(assignmentId),
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: () => submitQuiz(assignmentId),
    onSuccess: (res) => {
      submittedRef.current = true;
      toast.success(res.message || 'Quiz disubmit');
      qc.invalidateQueries({ queryKey: ['quiz-play', assignmentId] });
      qc.invalidateQueries({ queryKey: ['my-assignments'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const answerMutation = useMutation({
    mutationFn: (vars: { questionId: number; answer: string }) =>
      saveAnswer(assignmentId, vars.questionId, vars.answer),
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const violationMutation = useMutation({
    mutationFn: () => reportViolation(assignmentId, 'visibility_change'),
    onSuccess: (res) => {
      toast.warning(res.message || 'Pelanggaran tercatat');
      qc.invalidateQueries({ queryKey: ['quiz-play', assignmentId] });
      // Refresh state agar locked_until kepakai segera
      refetch();
    },
  });

  // Update clock per detik
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Reset guard saat attempt berubah dari submitted → in_progress (mis. retry).
  useEffect(() => {
    if (!data) return;
    if (data.attempt.status === 'in_progress' || data.attempt.status === 'unlocked_by_teacher') {
      // hanya reset kalau memang punya deadline future
      if (data.attempt.deadline_at) {
        const dl = new Date(data.attempt.deadline_at).getTime();
        if (!Number.isNaN(dl) && Date.now() < dl) {
          submittedRef.current = false;
        }
      } else {
        submittedRef.current = false;
      }
    }
  }, [data?.attempt.status, data?.attempt.deadline_at]);

  // ANTI-CHEAT: lapor saat tab/window kehilangan fokus.
  // Pakai cooldown 3 detik supaya tidak dobel-trigger saat alt+tab cepat.
  useEffect(() => {
    if (!data) return;
    if (data.attempt.status !== 'in_progress' && data.attempt.status !== 'unlocked_by_teacher') return;

    const handleHidden = () => {
      if (document.visibilityState === 'hidden') {
        const now = Date.now();
        if (now - violationCooldownRef.current < 3000) return;
        violationCooldownRef.current = now;
        violationMutation.mutate();
      }
    };
    const handleBlur = () => {
      const now = Date.now();
      if (now - violationCooldownRef.current < 3000) return;
      violationCooldownRef.current = now;
      violationMutation.mutate();
    };

    document.addEventListener('visibilitychange', handleHidden);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleHidden);
      window.removeEventListener('blur', handleBlur);
    };
  }, [data, violationMutation]);

  // Cegah copy/paste, drag, klik kanan, F12 (best effort).
  useEffect(() => {
    if (!data) return;
    if (data.attempt.status === 'submitted' || data.attempt.status === 'auto_submitted') return;

    const blockKey = (e: KeyboardEvent) => {
      // Block Ctrl+C/Ctrl+V/Ctrl+P/Ctrl+S/F12/Ctrl+Shift+I
      if (
        (e.ctrlKey && ['c', 'v', 'p', 's', 'u'].includes(e.key.toLowerCase())) ||
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['i', 'j'].includes(e.key.toLowerCase()))
      ) {
        e.preventDefault();
      }
    };
    const blockContext = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('keydown', blockKey);
    document.addEventListener('contextmenu', blockContext);
    return () => {
      window.removeEventListener('keydown', blockKey);
      document.removeEventListener('contextmenu', blockContext);
    };
  }, [data]);

  // Auto-submit on deadline — guard supaya tidak fire berkali-kali
  useEffect(() => {
    if (!data?.attempt.deadline_at) return;
    if (data.attempt.status !== 'in_progress' && data.attempt.status !== 'unlocked_by_teacher') return;
    if (submittedRef.current) return;
    const deadline = new Date(data.attempt.deadline_at).getTime();
    if (Number.isNaN(deadline)) return;
    if (Date.now() < deadline) return;
    if (submitMutation.isPending) return;
    submittedRef.current = true;
    submitMutation.mutate();
  }, [data, now, submitMutation]);

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
      </div>
    );
  }

  const attempt = data.attempt;
  const questions = data.questions;

  // ─── Status awal: belum di-start ────────────────────────────────────────
  if (attempt.status === 'submitted' || attempt.status === 'auto_submitted') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center py-10">
          <Check className="w-16 h-16 text-success mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold mb-2">Quiz Selesai</h1>
          <p className="text-text-muted mb-6">
            Skor kamu: <span className="font-display text-3xl text-primary-400 font-bold">{attempt.final_score?.toFixed(1) ?? '-'}</span>
          </p>
          <button
            onClick={() => router.push('/my-assignments')}
            className="px-5 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium"
          >
            Kembali ke Tugas Saya
          </button>
        </div>
      </div>
    );
  }

  // ─── Locked state ───────────────────────────────────────────────────────
  if (attempt.status === 'locked' && attempt.locked_until) {
    const lockDeadline = new Date(attempt.locked_until).getTime();
    const remaining = Math.max(0, Math.floor((lockDeadline - now) / 1000));

    if (remaining === 0) {
      // Refresh untuk masuk lagi
      refetch();
    }

    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-rose-500/10 border border-rose-500/30">
          <Lock className="w-10 h-10 text-rose-400" />
        </div>
        <h1 className="font-display text-2xl font-bold">Akun Quiz Terkunci</h1>
        <p className="text-text-muted max-w-md mx-auto">
          Kamu keluar dari layar quiz {attempt.focus_violations}× — melebihi toleransi {attempt.max_focus_violations}×.
          Tunggu waktu lock habis, atau minta guru untuk unlock.
        </p>
        <p className="font-display text-5xl font-bold text-rose-400 font-mono">
          {formatTime(remaining)}
        </p>
        <p className="text-xs text-text-muted">
          Notifikasi sudah terkirim ke guru otomatis.
        </p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-lg border border-surface-border text-sm hover:bg-surface-raised"
        >
          Cek lagi
        </button>
      </div>
    );
  }

  return (
    <QuizPlayerInner
      data={data}
      now={now}
      onAnswer={(qid, val) => answerMutation.mutate({ questionId: qid, answer: val })}
      onSubmit={() => submitMutation.mutate()}
      submitting={submitMutation.isPending}
    />
  );
}

function QuizPlayerInner({
  data,
  now,
  onAnswer,
  onSubmit,
  submitting,
}: {
  data: QuizPlayPayload;
  now: number;
  onAnswer: (questionId: number, answer: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => data.attempt.answers || {});
  const [currentIdx, setCurrentIdx] = useState(0);

  const deadline = data.attempt.deadline_at ? new Date(data.attempt.deadline_at).getTime() : null;
  const remaining = deadline ? Math.max(0, Math.floor((deadline - now) / 1000)) : null;

  const setAnswer = useCallback(
    (qid: number, val: string) => {
      setAnswers((prev) => ({ ...prev, [String(qid)]: val }));
      onAnswer(qid, val);
    },
    [onAnswer]
  );

  const violationsLeft = data.attempt.max_focus_violations - data.attempt.focus_violations;
  const q = data.questions[currentIdx];

  return (
    <div className="max-w-3xl mx-auto space-y-4 select-none">
      {/* Timer + violations bar */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-surface-base/95 backdrop-blur border-b border-surface-border">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="font-display font-bold text-lg leading-tight">{data.assignment_title}</h1>
            <p className="text-xs text-text-muted">
              Soal {currentIdx + 1} dari {data.questions.length}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {remaining !== null && (
              <div
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono font-bold text-sm border',
                  remaining < 60
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-300 animate-pulse'
                    : remaining < 300
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      : 'border-primary-500/30 bg-primary-500/5 text-primary-300'
                )}
              >
                <Clock className="w-4 h-4" />
                {formatTime(remaining)}
              </div>
            )}
            <div
              className={cn(
                'hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border',
                violationsLeft > 0
                  ? 'border-amber-500/40 bg-amber-500/5 text-amber-300'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
              )}
            >
              <Eye className="w-3.5 h-3.5" />
              {violationsLeft > 0
                ? `Sisa toleransi: ${violationsLeft}`
                : 'Toleransi habis'}
            </div>
          </div>
        </div>
      </div>

      {/* Warning banner */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-200/90 leading-relaxed">
          Jangan keluar dari layar quiz. Tiap kali kamu pindah aplikasi / minimize / membuka tab lain,
          akan tercatat sebagai pelanggaran. {data.attempt.max_focus_violations + 1}× pelanggaran =
          akun terkunci {data.attempt.lock_duration_minutes} menit.
        </p>
      </div>

      {/* Soal */}
      <div className="rounded-xl border border-surface-border bg-surface-muted p-5 space-y-5">
        <div className="flex items-start gap-2">
          <span className="font-mono text-sm font-bold text-primary-400 shrink-0">
            #{currentIdx + 1}
          </span>
          <p className="font-body text-base leading-relaxed">{q.body}</p>
        </div>

        {q.question_type === 'mcq' && q.options && (
          <div className="space-y-2">
            {q.options.map((opt, i) => {
              const value = String(i);
              const selected = answers[String(q.id)] === value;
              return (
                <button
                  key={i}
                  onClick={() => setAnswer(q.id, value)}
                  className={cn(
                    'w-full text-left px-4 py-3 rounded-lg border transition-all flex items-center gap-3',
                    selected
                      ? 'border-primary-500 bg-primary-500/10 text-primary-200'
                      : 'border-surface-border bg-surface-raised hover:border-primary-500/40 text-text-secondary'
                  )}
                >
                  <span
                    className={cn(
                      'w-6 h-6 rounded-full border-2 flex items-center justify-center font-mono font-bold text-xs shrink-0',
                      selected
                        ? 'border-primary-400 bg-primary-500/20 text-primary-300'
                        : 'border-surface-border text-text-muted'
                    )}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="text-sm">{opt}</span>
                </button>
              );
            })}
          </div>
        )}

        {q.question_type === 'tf' && (
          <div className="grid grid-cols-2 gap-3">
            {(['true', 'false'] as const).map((v) => {
              const selected = answers[String(q.id)] === v;
              return (
                <button
                  key={v}
                  onClick={() => setAnswer(q.id, v)}
                  className={cn(
                    'px-4 py-4 rounded-lg border transition-all font-display font-semibold',
                    selected
                      ? 'border-primary-500 bg-primary-500/10 text-primary-200'
                      : 'border-surface-border bg-surface-raised hover:border-primary-500/40'
                  )}
                >
                  {v === 'true' ? 'BENAR' : 'SALAH'}
                </button>
              );
            })}
          </div>
        )}

        {q.question_type === 'essay' && (
          <textarea
            value={answers[String(q.id)] ?? ''}
            onChange={(e) => setAnswer(q.id, e.target.value)}
            rows={6}
            className="w-full px-3 py-2 rounded-lg border border-surface-border bg-surface-raised text-sm"
            placeholder="Ketik jawabanmu di sini..."
          />
        )}
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
          disabled={currentIdx === 0}
          className="px-4 py-2 rounded-lg border border-surface-border text-sm disabled:opacity-40"
        >
          Sebelumnya
        </button>

        <div className="flex flex-wrap gap-1.5 max-w-md justify-center">
          {data.questions.map((_, i) => {
            const answered = !!answers[String(data.questions[i].id)];
            const isCurrent = i === currentIdx;
            return (
              <button
                key={i}
                onClick={() => setCurrentIdx(i)}
                className={cn(
                  'w-8 h-8 rounded-md font-mono text-xs font-bold transition-colors',
                  isCurrent
                    ? 'bg-primary-500 text-white'
                    : answered
                      ? 'bg-success/20 text-success border border-success/40'
                      : 'bg-surface-raised text-text-muted border border-surface-border'
                )}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        {currentIdx < data.questions.length - 1 ? (
          <button
            onClick={() => setCurrentIdx((i) => Math.min(data.questions.length - 1, i + 1))}
            className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium"
          >
            Berikutnya
          </button>
        ) : (
          <button
            onClick={() => {
              if (
                confirm(
                  `Submit ${Object.keys(answers).length}/${data.questions.length} jawaban?`
                )
              ) {
                onSubmit();
              }
            }}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-success hover:bg-success/90 text-white text-sm font-medium disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Submit
          </button>
        )}
      </div>
    </div>
  );
}
