'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Plus,
  Sigma,
  Trash2,
  Users,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import {
  createAssignment,
  deleteAssignment,
  fetchAssignments,
  fetchSubjects,
  type Assignment,
  type AssignmentInput,
} from '@/lib/lmsApi';
import api, { getErrorMessage, type Envelope } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';

interface SchoolClass {
  id: number;
  name: string;
}

const TYPE_LABELS: Record<string, { label: string; tone: string }> = {
  tugas: { label: 'Tugas', tone: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  ulangan: { label: 'Ulangan', tone: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  kuis: { label: 'Kuis', tone: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  uts: { label: 'UTS', tone: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  uas: { label: 'UAS', tone: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30' },
};

export default function AssignmentsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AssignmentInput>({
    subject_id: 0,
    school_class_id: 0,
    title: '',
    description: '',
    assignment_type: 'tugas',
    max_score: 100,
    weight: 1.0,
    due_date: null,
    is_published: true,
    mode: 'manual',
    duration_minutes: 15,
    max_focus_violations: 2,
    lock_duration_minutes: 10,
    shuffle_questions: true,
    show_score_immediately: true,
  });

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => fetchAssignments({ mine_only: true }),
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: fetchSubjects,
  });

  const { data: classes = [] } = useQuery<SchoolClass[]>({
    queryKey: ['school-classes-list'],
    queryFn: async () => {
      const r = await api.get<Envelope<SchoolClass[]>>('/org/school-classes');
      return r.data.data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: () => createAssignment(form),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      const isQuiz = form.mode === 'quiz';
      toast.success(
        isQuiz
          ? 'Quiz dibuat! Sekarang tambahkan soal-soalnya.'
          : 'Tugas dibuat'
      );
      setOpen(false);
      setForm({
        subject_id: 0,
        school_class_id: 0,
        title: '',
        description: '',
        assignment_type: 'tugas',
        max_score: 100,
        weight: 1.0,
        due_date: null,
        is_published: true,
        mode: 'manual',
        duration_minutes: 15,
        max_focus_violations: 2,
        lock_duration_minutes: 10,
        shuffle_questions: true,
        show_score_immediately: true,
      });
      // Auto-redirect ke editor soal kalau ini quiz online
      if (isQuiz && created?.id) {
        router.push(`/assignments/${created.id}/quiz-edit`);
      }
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAssignment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      toast.success('Tugas dihapus');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-5 h-5 role-accent-text" />
            <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
              Pembelajaran
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-display-md font-bold">Tugas & Nilai</h1>
          <p className="font-body text-text-muted mt-1">
            Buat tugas, input nilai manual atau import dari CSV/XLSX. Nilai otomatis terintegrasi ke leaderboard.
          </p>
        </div>
        <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setOpen(true)}>
          Buat Tugas Baru
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center font-body text-text-muted py-12">Memuat...</p>
      ) : assignments.length === 0 ? (
        <Card padding="lg" className="text-center">
          <BookOpen className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="font-display font-semibold">Belum ada tugas</p>
          <p className="font-body text-sm text-text-muted mt-1">
            Buat tugas pertama untuk mulai input nilai siswa.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => (
            <AssignmentRow key={a.id} a={a} onDelete={() => deleteMutation.mutate(a.id)} />
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Buat Tugas Baru" size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="space-y-4"
        >
          <Input
            label="Judul Tugas"
            required
            placeholder="Contoh: Ulangan Harian Bab 3"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-body text-sm font-medium text-text-secondary mb-1.5">
                Mata Pelajaran *
              </label>
              <select
                required
                value={form.subject_id}
                onChange={(e) => setForm({ ...form, subject_id: Number(e.target.value) })}
                className="w-full bg-surface-raised border border-surface-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
              >
                <option value={0}>— Pilih —</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-body text-sm font-medium text-text-secondary mb-1.5">
                Kelas Target *
              </label>
              <select
                required
                value={form.school_class_id}
                onChange={(e) =>
                  setForm({ ...form, school_class_id: Number(e.target.value) })
                }
                className="w-full bg-surface-raised border border-surface-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
              >
                <option value={0}>— Pilih —</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-body text-sm font-medium text-text-secondary mb-1.5">
                Jenis
              </label>
              <select
                value={form.assignment_type}
                onChange={(e) =>
                  setForm({ ...form, assignment_type: e.target.value as any })
                }
                className="w-full bg-surface-raised border border-surface-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
              >
                <option value="tugas">Tugas</option>
                <option value="kuis">Kuis</option>
                <option value="ulangan">Ulangan</option>
                <option value="uts">UTS</option>
                <option value="uas">UAS</option>
              </select>
            </div>
            <Input
              label="Nilai Maks"
              type="number"
              min={1}
              max={1000}
              required
              value={form.max_score}
              onChange={(e) => setForm({ ...form, max_score: Number(e.target.value) })}
            />
            <Input
              label="Bobot"
              type="number"
              step={0.1}
              min={0.1}
              max={10}
              required
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
              hint="1.0 = standar"
            />
          </div>
          <Input
            label="Deadline (opsional)"
            type="date"
            value={form.due_date ?? ''}
            onChange={(e) => setForm({ ...form, due_date: e.target.value || null })}
          />

          {/* Mode tugas */}
          <div>
            <label className="block font-body text-sm font-medium text-text-secondary mb-1.5">
              Mode Tugas
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, mode: 'manual' })}
                className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  form.mode === 'manual'
                    ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                    : 'border-surface-border bg-surface-raised text-text-muted'
                }`}
              >
                Manual / Upload Nilai
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, mode: 'quiz' })}
                className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  form.mode === 'quiz'
                    ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                    : 'border-surface-border bg-surface-raised text-text-muted'
                }`}
              >
                Quiz Online (Anti-Cheat)
              </button>
            </div>
            <p className="text-2xs text-text-muted mt-1.5">
              {form.mode === 'quiz'
                ? 'Siswa kerjakan langsung di app dengan timer. Auto-grade. Setelah disimpan, klik "Edit Soal Quiz" di detail tugas.'
                : 'Guru input nilai sendiri atau upload CSV/XLSX dari sumber lain (Google Form, PPT, dll).'}
            </p>
          </div>

          {form.mode === 'quiz' && (
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 space-y-3">
              <p className="font-mono text-2xs uppercase tracking-widest text-violet-300">
                Pengaturan Quiz Online
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  label="Durasi (menit)"
                  type="number"
                  min={1}
                  max={480}
                  value={form.duration_minutes ?? 15}
                  onChange={(e) =>
                    setForm({ ...form, duration_minutes: Number(e.target.value) })
                  }
                />
                <Input
                  label="Toleransi keluar layar"
                  type="number"
                  min={0}
                  max={10}
                  value={form.max_focus_violations ?? 2}
                  onChange={(e) =>
                    setForm({ ...form, max_focus_violations: Number(e.target.value) })
                  }
                  hint="kali"
                />
                <Input
                  label="Lock (menit)"
                  type="number"
                  min={1}
                  max={120}
                  value={form.lock_duration_minutes ?? 10}
                  onChange={(e) =>
                    setForm({ ...form, lock_duration_minutes: Number(e.target.value) })
                  }
                />
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.shuffle_questions ?? true}
                    onChange={(e) =>
                      setForm({ ...form, shuffle_questions: e.target.checked })
                    }
                    className="accent-primary-500"
                  />
                  Acak urutan soal
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.show_score_immediately ?? true}
                    onChange={(e) =>
                      setForm({ ...form, show_score_immediately: e.target.checked })
                    }
                    className="accent-primary-500"
                  />
                  Tampilkan nilai langsung
                </label>
              </div>
            </div>
          )}

          <div>
            <label className="block font-body text-sm font-medium text-text-secondary mb-1.5">
              Deskripsi (opsional)
            </label>
            <textarea
              rows={2}
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full font-body text-sm bg-surface-raised border border-surface-border rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              type="submit"
              isLoading={createMutation.isPending}
              disabled={
                !form.title.trim() ||
                form.subject_id <= 0 ||
                form.school_class_id <= 0
              }
            >
              {form.mode === 'quiz' ? 'Buat Quiz & Lanjut Tambah Soal' : 'Buat Tugas'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function AssignmentRow({ a, onDelete }: { a: Assignment; onDelete: () => void }) {
  const meta = TYPE_LABELS[a.assignment_type] ?? TYPE_LABELS.tugas;
  const gradedPct = a.student_count > 0 ? (a.graded_count / a.student_count) * 100 : 0;
  return (
    <Card padding="md" className="hover:border-primary-500/30 transition-colors">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={cn(
                'font-mono text-2xs uppercase tracking-widest font-bold px-2 py-0.5 rounded-full border',
                meta.tone
              )}
            >
              {meta.label}
            </span>
            <span className="font-mono text-2xs text-text-muted">
              {a.subject_code} · {a.school_class_name}
            </span>
          </div>
          <p className="font-display font-semibold text-base text-text-primary">{a.title}</p>
          <div className="flex items-center gap-3 mt-2 text-2xs font-mono text-text-muted flex-wrap">
            <span>
              <Sigma className="inline w-3 h-3" /> Maks {a.max_score} · bobot {a.weight}x
            </span>
            {a.due_date && (
              <span>
                <Calendar className="inline w-3 h-3" /> {formatDate(a.due_date)}
              </span>
            )}
            <span>
              <Users className="inline w-3 h-3" /> {a.graded_count}/{a.student_count} dinilai
            </span>
            {a.avg_score !== null && a.avg_score !== undefined && (
              <span className="text-primary-300">
                Rata-rata {a.avg_score.toFixed(1)}
              </span>
            )}
          </div>
          <div className="mt-2 h-1 rounded-full bg-surface-overlay overflow-hidden">
            <span
              className="block h-full bg-gradient-to-r from-primary-500 to-success transition-[width] duration-500"
              style={{ width: `${gradedPct}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 self-start">
          <Link href={`/assignments/${a.id}`}>
            <Button variant="outline" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
              Input Nilai
            </Button>
          </Link>
          <button
            onClick={() => {
              if (confirm(`Hapus tugas "${a.title}"? Semua nilai akan ikut terhapus.`)) onDelete();
            }}
            className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}
