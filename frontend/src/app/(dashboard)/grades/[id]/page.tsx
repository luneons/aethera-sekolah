'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  Loader2,
  PieChart,
  Sigma,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import {
  fetchStudentGradeDetail,
  type StudentGradeAssignment,
} from '@/lib/lmsApi';
import { cn, formatDate } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  tugas: 'Tugas',
  ulangan: 'Ulangan',
  kuis: 'Kuis',
  uts: 'UTS',
  uas: 'UAS',
};

const TOOLTIP_STYLE = {
  backgroundColor: '#0a1520',
  border: '1px solid #1a3045',
  borderRadius: 8,
  color: '#e8f4f8',
};

function toneFor(pct: number | null) {
  if (pct === null) return 'text-text-muted';
  if (pct >= 80) return 'text-success';
  if (pct >= 60) return 'text-cyan-300';
  if (pct >= 40) return 'text-amber-400';
  return 'text-rose-400';
}

function bgToneFor(pct: number | null) {
  if (pct === null) return 'bg-surface-muted border-surface-border';
  if (pct >= 80) return 'bg-success/5 border-success/30';
  if (pct >= 60) return 'bg-cyan-500/5 border-cyan-500/30';
  if (pct >= 40) return 'bg-amber-500/5 border-amber-500/30';
  return 'bg-rose-500/5 border-rose-500/30';
}

export default function StudentGradeDetailPage() {
  const params = useParams<{ id: string }>();
  const studentId = Number(params.id);
  const [filter, setFilter] = useState<'all' | 'graded' | 'pending'>('all');
  const [subjectFilter, setSubjectFilter] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['student-grade-detail', studentId],
    queryFn: () => fetchStudentGradeDetail(studentId),
    enabled: !Number.isNaN(studentId),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data.assignments;
    if (filter === 'graded') rows = rows.filter((a) => a.is_graded);
    if (filter === 'pending') rows = rows.filter((a) => !a.is_graded);
    if (subjectFilter !== null) rows = rows.filter((a) => a.subject_id === subjectFilter);
    return rows;
  }, [data, filter, subjectFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-6">
        <p className="font-display font-semibold text-rose-300">Tidak bisa memuat data</p>
        <p className="text-sm text-text-muted mt-1">
          {error instanceof Error ? error.message : 'Terjadi kesalahan'}
        </p>
      </div>
    );
  }

  const { student, summary, subjects, assignments } = data;
  const overallTone = toneFor(summary.overall_gpa);

  // Chart data: per subject
  const subjectChart = subjects.map((s) => ({
    label: s.subject_code,
    Nilai: Math.round(s.average ?? 0),
    Pelajaran: s.subject_name,
  }));

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/gradebook"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary-400 mb-2"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali ke Nilai Siswa
        </Link>
      </div>

      {/* Header siswa */}
      <Card padding="lg" className="flex items-start gap-4 flex-wrap">
        <Avatar name={student.full_name} src={student.photo_url ?? undefined} size="lg" />
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-bold truncate">{student.full_name}</h1>
          <p className="font-mono text-sm text-text-muted">
            NIS {student.employee_id} · {student.class_name ?? '—'}
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <Link
              href={`/student-status/${student.id}`}
              className="text-xs text-primary-400 hover:underline inline-flex items-center gap-1"
            >
              Profil disiplin →
            </Link>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">
            Rata-Rata Nilai
          </p>
          <p className={cn('font-display font-bold text-4xl', overallTone)}>
            {summary.overall_gpa !== null ? summary.overall_gpa.toFixed(1) : '—'}
            <span className="text-sm text-text-muted ml-1 font-medium">/ 100</span>
          </p>
          {summary.rank_in_class?.rank && (
            <p className="font-mono text-2xs text-amber-400 mt-1">
              Peringkat #{summary.rank_in_class.rank} dari {summary.rank_in_class.class_size}
            </p>
          )}
        </div>
      </Card>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<BookOpen className="w-4 h-4" />}
          label="Mata Pelajaran"
          value={summary.subjects_count}
          tone="text-text-secondary"
        />
        <StatCard
          icon={<FileText className="w-4 h-4" />}
          label="Total Tugas"
          value={summary.assignments_count}
          tone="text-cyan-300"
        />
        <StatCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Sudah Dinilai"
          value={summary.graded_count}
          tone="text-success"
        />
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="Menunggu Nilai"
          value={summary.ungraded_count}
          tone="text-amber-400"
        />
      </div>

      {/* Chart per mapel + ringkasan mapel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card padding="lg" className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-1">
            <PieChart className="w-4 h-4 text-primary-400" />
            <h3 className="font-display font-semibold text-base">Rata-Rata per Mata Pelajaran</h3>
          </div>
          <p className="font-body text-sm text-text-muted mb-4">
            Skala 0-100, dihitung dari nilai yang sudah masuk
          </p>
          <div className="h-56">
            {subjectChart.length === 0 ? (
              <p className="text-center text-text-muted text-sm py-12">
                Belum ada nilai untuk dihitung.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectChart} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a3045" vertical={false} />
                  <XAxis dataKey="label" stroke="#4a6b82" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="#4a6b82"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="Nilai" fill="#00d4d4" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card padding="lg">
          <div className="flex items-center gap-2 mb-3">
            <Award className="w-4 h-4 text-amber-400" />
            <h3 className="font-display font-semibold text-base">Ranking Mapel</h3>
          </div>
          <div className="space-y-2">
            {subjects.length === 0 && (
              <p className="text-text-muted text-sm">Belum ada data.</p>
            )}
            {[...subjects]
              .sort((a, b) => (b.average ?? -1) - (a.average ?? -1))
              .map((s) => {
                const t = toneFor(s.average);
                return (
                  <button
                    key={s.subject_id}
                    onClick={() =>
                      setSubjectFilter(subjectFilter === s.subject_id ? null : s.subject_id)
                    }
                    className={cn(
                      'w-full flex items-center gap-2 p-2 rounded-lg border transition-colors text-left',
                      subjectFilter === s.subject_id
                        ? 'border-primary-500/50 bg-primary-500/10'
                        : 'border-surface-border bg-surface-base/40 hover:border-primary-500/30'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-semibold text-sm truncate">
                        {s.subject_code}
                      </p>
                      <p className="font-mono text-2xs text-text-muted truncate">
                        {s.graded_count}/{s.assignments_count} dinilai
                      </p>
                    </div>
                    <p className={cn('font-display font-bold text-lg', t)}>
                      {s.average !== null ? s.average.toFixed(1) : '—'}
                    </p>
                  </button>
                );
              })}
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-surface-border overflow-hidden">
          {(['all', 'graded', 'pending'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                filter === k
                  ? 'bg-primary-500/15 text-primary-300 border-r border-surface-border'
                  : 'text-text-muted hover:bg-surface-raised border-r border-surface-border last:border-r-0'
              )}
            >
              {k === 'all' && 'Semua'}
              {k === 'graded' && 'Sudah Dinilai'}
              {k === 'pending' && 'Menunggu'}
            </button>
          ))}
        </div>
        {subjectFilter !== null && (
          <button
            onClick={() => setSubjectFilter(null)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-surface-border text-xs text-text-muted hover:text-primary-400"
          >
            <XCircle className="w-3.5 h-3.5" />
            Reset filter mapel
          </button>
        )}
        <span className="ml-auto text-2xs text-text-muted">
          Menampilkan {filtered.length} dari {assignments.length}
        </span>
      </div>

      {/* Assignment list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <Card padding="lg" className="text-center">
            <FileText className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-50" />
            <p className="font-display font-semibold">Tidak ada tugas yang cocok dengan filter.</p>
          </Card>
        ) : (
          filtered.map((a) => <AssignmentRow key={a.assignment_id} a={a} />)
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <Card padding="md">
      <div className={cn('flex items-center gap-1.5', tone)}>
        {icon}
        <span className="font-mono text-2xs uppercase tracking-widest">{label}</span>
      </div>
      <p className={cn('font-display font-bold text-2xl mt-1', tone)}>{value}</p>
    </Card>
  );
}

function AssignmentRow({ a }: { a: StudentGradeAssignment }) {
  const tone = toneFor(a.percent);
  const bg = bgToneFor(a.percent);

  return (
    <div className={cn('rounded-xl border p-3 sm:p-4 flex items-start gap-3 flex-wrap', bg)}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-mono text-2xs uppercase tracking-widest font-bold text-text-secondary px-2 py-0.5 rounded-full border border-surface-border bg-surface-raised">
            {TYPE_LABELS[a.assignment_type] ?? a.assignment_type}
          </span>
          {a.mode === 'quiz' && (
            <span className="font-mono text-2xs uppercase tracking-widest font-bold text-violet-300 px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/40">
              QUIZ
            </span>
          )}
          <span className="font-mono text-2xs text-text-muted">
            {a.subject_code} · {a.teacher_name}
          </span>
        </div>
        <p className="font-display font-semibold text-base break-words">{a.title}</p>
        <div className="flex items-center gap-3 mt-1 font-mono text-2xs text-text-muted flex-wrap">
          <span>
            <Sigma className="inline w-3 h-3" /> Maks {a.max_score}
          </span>
          {a.weight !== 1 && <span>· bobot {a.weight}x</span>}
          {a.due_date && (
            <span>
              <Calendar className="inline w-3 h-3" /> {formatDate(a.due_date)}
            </span>
          )}
          {a.graded_at && (
            <span>
              <CheckCircle2 className="inline w-3 h-3" /> dinilai {formatDate(a.graded_at)}
            </span>
          )}
        </div>
        {a.note && (
          <p className="text-xs text-text-secondary italic mt-1.5 break-words">
            Catatan: {a.note}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        {a.is_graded && a.score !== null ? (
          <>
            <p className={cn('font-display font-bold text-3xl', tone)}>
              {Number.isInteger(a.score) ? a.score : a.score.toFixed(1)}
              <span className="text-sm text-text-muted font-medium">/{a.max_score}</span>
            </p>
            <p className={cn('font-mono text-2xs', tone)}>
              {a.percent !== null ? `${a.percent.toFixed(0)}%` : ''}
            </p>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 font-mono text-2xs uppercase tracking-widest font-bold">
            <Clock className="w-3 h-3" />
            Belum
          </span>
        )}
      </div>
    </div>
  );
}
