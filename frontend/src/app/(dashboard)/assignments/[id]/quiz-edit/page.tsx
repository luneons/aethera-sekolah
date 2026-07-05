'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Eye, Loader2, Plus, Save, Send, Trash2, Lock } from 'lucide-react';
import { fetchAssignment } from '@/lib/lmsApi';
import {
  fetchQuizQuestions,
  publishQuiz,
  saveQuizQuestions,
  unpublishQuiz,
  type QuestionInput,
  type QuestionType,
} from '@/lib/quizApi';
import { getErrorMessage } from '@/lib/api';

interface DraftQuestion {
  question_type: QuestionType;
  body: string;
  options: string[];
  correct_value: string;
  points: number;
}

const EMPTY_MCQ: DraftQuestion = {
  question_type: 'mcq',
  body: '',
  options: ['', '', '', ''],
  correct_value: '0',
  points: 10,
};

export default function QuizEditPage() {
  const params = useParams<{ id: string }>();
  const assignmentId = Number(params.id);
  const router = useRouter();
  const qc = useQueryClient();

  const [drafts, setDrafts] = useState<DraftQuestion[]>([]);

  const { data: assignment } = useQuery({
    queryKey: ['assignment-detail', assignmentId],
    queryFn: () => fetchAssignment(assignmentId),
  });

  const { data: existing, isLoading } = useQuery({
    queryKey: ['quiz-questions', assignmentId],
    queryFn: () => fetchQuizQuestions(assignmentId),
    enabled: !Number.isNaN(assignmentId),
  });

  useEffect(() => {
    if (existing && existing.length > 0 && drafts.length === 0) {
      setDrafts(
        existing.map((q) => ({
          question_type: q.question_type,
          body: q.body,
          options: q.options ?? ['', '', '', ''],
          correct_value: q.correct_value ?? '0',
          points: q.points,
        }))
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: QuestionInput[] = drafts.map((d) => ({
        question_type: d.question_type,
        body: d.body.trim(),
        options: d.question_type === 'mcq' ? d.options.map((o) => o.trim()) : undefined,
        correct_value: d.correct_value,
        points: d.points,
      }));
      return saveQuizQuestions(assignmentId, payload);
    },
    onSuccess: () => {
      toast.success('Soal disimpan');
      qc.invalidateQueries({ queryKey: ['quiz-questions', assignmentId] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const publishMutation = useMutation({
    mutationFn: () => publishQuiz(assignmentId),
    onSuccess: (res) => {
      toast.success(res.message ?? 'Quiz aktif');
      qc.invalidateQueries({ queryKey: ['assignment-detail', assignmentId] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const unpublishMutation = useMutation({
    mutationFn: () => unpublishQuiz(assignmentId),
    onSuccess: (res) => {
      toast.success(res.message ?? 'Quiz disembunyikan dari siswa');
      qc.invalidateQueries({ queryKey: ['assignment-detail', assignmentId] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const addQuestion = (type: QuestionType) => {
    if (type === 'mcq') {
      setDrafts((prev) => [...prev, { ...EMPTY_MCQ }]);
    } else if (type === 'tf') {
      setDrafts((prev) => [
        ...prev,
        {
          question_type: 'tf',
          body: '',
          options: [],
          correct_value: 'true',
          points: 10,
        },
      ]);
    } else {
      setDrafts((prev) => [
        ...prev,
        {
          question_type: 'essay',
          body: '',
          options: [],
          correct_value: '',
          points: 10,
        },
      ]);
    }
  };

  const updateDraft = (idx: number, patch: Partial<DraftQuestion>) => {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  const removeDraft = (idx: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  };

  if (assignment && assignment.mode !== 'quiz') {
    return (
      <div className="max-w-2xl space-y-4">
        <Link
          href={`/assignments/${assignmentId}`}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary-400"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali
        </Link>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <p className="font-display font-semibold mb-1">Mode tugas bukan quiz online</p>
          <p className="text-sm text-text-muted">
            Edit dulu tugas ini ke mode <strong>Quiz Online</strong> dari halaman detail tugas, baru tambahkan soal.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link
            href={`/assignments/${assignmentId}`}
            className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary-400 mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Kembali
          </Link>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2 flex-wrap">
            Soal Quiz: {assignment?.title ?? '...'}
            {assignment?.is_published ? (
              <span className="font-mono text-2xs uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/40">
                AKTIF
              </span>
            ) : (
              <span className="font-mono text-2xs uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40">
                DRAFT
              </span>
            )}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {assignment?.is_published
              ? 'Quiz sudah aktif. Siswa dapat memulai pengerjaan.'
              : `Quiz masih DRAFT — siswa belum melihat. Tambah soal lalu klik "Publish ke Siswa".`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href={`/assignments/${assignmentId}/proctor`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-border text-sm hover:bg-surface-raised"
          >
            <Eye className="w-4 h-4" /> Proctor
          </Link>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || drafts.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-border text-text-primary hover:bg-surface-raised text-sm font-medium disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Simpan {drafts.length} soal
          </button>
          {assignment?.is_published ? (
            <button
              onClick={() => {
                if (confirm('Sembunyikan quiz dari siswa? Siswa yang sudah mulai tetap bisa lanjut.')) {
                  unpublishMutation.mutate();
                }
              }}
              disabled={unpublishMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-sm font-semibold disabled:opacity-50"
            >
              <Lock className="w-4 h-4" />
              Set ke Draft
            </button>
          ) : (
            <button
              onClick={() => {
                if (drafts.length === 0) {
                  toast.error('Tambah minimal 1 soal dulu');
                  return;
                }
                if (
                  confirm(
                    `Publish quiz ini ke ${drafts.length} soal? Siswa kelas akan dapat notifikasi & bisa langsung mulai mengerjakan.`
                  )
                ) {
                  publishMutation.mutate();
                }
              }}
              disabled={publishMutation.isPending || drafts.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
              title={drafts.length === 0 ? 'Tambah soal dulu' : 'Aktifkan quiz untuk siswa'}
            >
              {publishMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Publish ke Siswa
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-muted p-4">
        <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mb-2">
          Total bobot saat ini
        </p>
        <p className="font-display text-3xl font-bold text-primary-400">
          {drafts.reduce((s, d) => s + d.points, 0)}
          <span className="text-sm text-text-muted ml-1">/ {assignment?.max_score ?? 100}</span>
        </p>
      </div>

      {isLoading && (
        <div className="text-center py-12">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary-400" />
        </div>
      )}

      {drafts.length === 0 && !isLoading && (
        <div className="rounded-xl border border-dashed border-surface-border p-10 text-center">
          <p className="text-text-muted text-sm mb-4">Belum ada soal. Tambah dulu:</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={() => addQuestion('mcq')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm"
            >
              <Plus className="w-4 h-4" /> Pilihan Ganda
            </button>
            <button
              onClick={() => addQuestion('tf')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-surface-border text-sm hover:bg-surface-raised"
            >
              <Plus className="w-4 h-4" /> Benar/Salah
            </button>
            <button
              onClick={() => addQuestion('essay')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-surface-border text-sm hover:bg-surface-raised"
            >
              <Plus className="w-4 h-4" /> Essay
            </button>
          </div>
        </div>
      )}

      {drafts.map((d, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-surface-border bg-surface-muted p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-xs text-primary-400">
              Soal #{idx + 1} · {d.question_type.toUpperCase()}
            </p>
            <button
              onClick={() => removeDraft(idx)}
              className="text-text-muted hover:text-rose-400 p-1"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <textarea
            value={d.body}
            onChange={(e) => updateDraft(idx, { body: e.target.value })}
            placeholder="Tulis pertanyaan..."
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-surface-border bg-surface-raised text-sm"
          />

          {d.question_type === 'mcq' && (
            <div className="space-y-2">
              {d.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateDraft(idx, { correct_value: String(i) })}
                    className={`w-7 h-7 rounded-full border-2 font-mono font-bold text-xs flex items-center justify-center shrink-0 ${
                      d.correct_value === String(i)
                        ? 'border-success bg-success/20 text-success'
                        : 'border-surface-border text-text-muted hover:border-primary-500'
                    }`}
                    title="Tandai sebagai jawaban benar"
                  >
                    {String.fromCharCode(65 + i)}
                  </button>
                  <input
                    value={opt}
                    onChange={(e) => {
                      const next = [...d.options];
                      next[i] = e.target.value;
                      updateDraft(idx, { options: next });
                    }}
                    placeholder={`Pilihan ${String.fromCharCode(65 + i)}`}
                    className="flex-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-raised text-sm"
                  />
                  {d.options.length > 2 && (
                    <button
                      onClick={() => {
                        const next = d.options.filter((_, ii) => ii !== i);
                        updateDraft(idx, {
                          options: next,
                          correct_value:
                            String(i) === d.correct_value ? '0' : d.correct_value,
                        });
                      }}
                      className="text-text-muted hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {d.options.length < 5 && (
                <button
                  onClick={() => updateDraft(idx, { options: [...d.options, ''] })}
                  className="text-xs text-primary-400 hover:underline inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Tambah pilihan
                </button>
              )}
            </div>
          )}

          {d.question_type === 'tf' && (
            <div className="grid grid-cols-2 gap-2">
              {(['true', 'false'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => updateDraft(idx, { correct_value: v })}
                  className={`px-4 py-2 rounded-lg border font-display font-semibold text-sm ${
                    d.correct_value === v
                      ? 'border-success bg-success/10 text-success'
                      : 'border-surface-border bg-surface-raised text-text-muted'
                  }`}
                >
                  {v === 'true' ? 'BENAR (jawaban)' : 'SALAH (jawaban)'}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted">Poin:</label>
            <input
              type="number"
              value={d.points}
              onChange={(e) => updateDraft(idx, { points: Number(e.target.value) })}
              min={0}
              max={100}
              className="w-20 px-2 py-1 rounded border border-surface-border bg-surface-raised text-sm"
            />
          </div>
        </div>
      ))}

      {drafts.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={() => addQuestion('mcq')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-border text-sm hover:bg-surface-raised"
          >
            <Plus className="w-3.5 h-3.5" /> Pilihan Ganda
          </button>
          <button
            onClick={() => addQuestion('tf')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-border text-sm hover:bg-surface-raised"
          >
            <Plus className="w-3.5 h-3.5" /> Benar/Salah
          </button>
          <button
            onClick={() => addQuestion('essay')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-border text-sm hover:bg-surface-raised"
          >
            <Plus className="w-3.5 h-3.5" /> Essay
          </button>
        </div>
      )}
    </div>
  );
}
