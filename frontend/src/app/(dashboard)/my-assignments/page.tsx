'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  PlayCircle,
  Sigma,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { fetchMyAssignments, type StudentAssignment } from '@/lib/lmsApi';
import { cn, formatDate } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  tugas: 'Tugas',
  ulangan: 'Ulangan',
  kuis: 'Kuis',
  uts: 'UTS',
  uas: 'UAS',
};

/**
 * Tugas Saya — daftar tugas + nilai untuk siswa.
 */
export default function MyAssignmentsPage() {
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['my-assignments'],
    queryFn: fetchMyAssignments,
  });

  const graded = assignments.filter((a) => a.my_score !== null && a.my_score !== undefined);
  const pending = assignments.filter((a) => a.my_score === null || a.my_score === undefined);

  const avgScore =
    graded.length > 0
      ? graded.reduce(
          (sum, a) => sum + ((a.my_score ?? 0) / a.max_score) * 100,
          0
        ) / graded.length
      : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Pembelajaran
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Tugas Saya</h1>
        <p className="font-body text-text-muted mt-1">
          Lihat semua tugas, status nilai, dan rata-rata akademikmu.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card padding="md">
          <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mb-1">
            Total Tugas
          </p>
          <p className="font-display font-bold text-3xl text-primary-300">
            {assignments.length}
          </p>
        </Card>
        <Card padding="md">
          <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mb-1">
            Sudah Dinilai
          </p>
          <p className="font-display font-bold text-3xl text-success">{graded.length}</p>
        </Card>
        <Card padding="md">
          <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mb-1">
            Rata-Rata
          </p>
          <p className="font-display font-bold text-3xl text-amber-400">
            {avgScore !== null ? avgScore.toFixed(1) : '—'}
          </p>
        </Card>
      </div>

      {isLoading ? (
        <p className="text-center font-body text-text-muted py-12">Memuat...</p>
      ) : assignments.length === 0 ? (
        <Card padding="lg" className="text-center">
          <BookOpen className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="font-display font-semibold">Belum ada tugas</p>
          <p className="font-body text-sm text-text-muted mt-1">
            Guru-mu belum memberi tugas. Cek lagi nanti.
          </p>
        </Card>
      ) : (
        <>
          {pending.length > 0 && (
            <div>
              <h2 className="font-display font-semibold text-base mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Belum Dinilai ({pending.length})
              </h2>
              <div className="space-y-2">
                {pending.map((a) => (
                  <AssignmentRow key={a.id} a={a} />
                ))}
              </div>
            </div>
          )}
          {graded.length > 0 && (
            <div>
              <h2 className="font-display font-semibold text-base mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                Sudah Dinilai ({graded.length})
              </h2>
              <div className="space-y-2">
                {graded.map((a) => (
                  <AssignmentRow key={a.id} a={a} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AssignmentRow({ a }: { a: StudentAssignment }) {
  const isGraded = a.my_score !== null && a.my_score !== undefined;
  const pct = isGraded ? ((a.my_score ?? 0) / a.max_score) * 100 : 0;
  const tone =
    !isGraded
      ? 'border-amber-500/30 bg-amber-500/5'
      : pct >= 80
        ? 'border-success/30 bg-success/5'
        : pct >= 60
          ? 'border-cyan-500/30 bg-cyan-500/5'
          : 'border-rose-500/30 bg-rose-500/5';
  const scoreTone =
    pct >= 80 ? 'text-success' : pct >= 60 ? 'text-cyan-300' : 'text-rose-400';

  return (
    <Card padding="md" className={cn('border', tone)}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-2xs uppercase tracking-widest font-bold text-text-secondary px-2 py-0.5 rounded-full border border-surface-border">
              {TYPE_LABELS[a.assignment_type] ?? a.assignment_type}
            </span>
            <span className="font-mono text-2xs text-text-muted">
              {a.subject_code} · {a.teacher_name}
            </span>
          </div>
          <p className="font-display font-semibold text-base">{a.title}</p>
          {a.description && (
            <p className="font-body text-xs text-text-secondary mt-1 line-clamp-2">
              {a.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 font-mono text-2xs text-text-muted flex-wrap">
            <span>
              <Sigma className="inline w-3 h-3" /> Maks {a.max_score}
            </span>
            {a.due_date && (
              <span>
                <Calendar className="inline w-3 h-3" /> {formatDate(a.due_date)}
              </span>
            )}
          </div>
          {a.my_note && (
            <p className="font-body text-xs text-text-secondary mt-2 italic">
              Catatan guru: {a.my_note}
            </p>
          )}
        </div>

        <div className="text-right shrink-0">
          {isGraded ? (
            <>
              <p className={cn('font-display font-bold text-3xl', scoreTone)}>
                {a.my_score}
                <span className="text-base text-text-muted font-medium">
                  /{a.max_score}
                </span>
              </p>
              <p className="font-mono text-2xs text-text-muted">{pct.toFixed(0)}%</p>
            </>
          ) : a.mode === 'quiz' ? (
            <Link
              href={`/quiz/${a.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold whitespace-nowrap"
            >
              <PlayCircle className="w-4 h-4" />
              {a.duration_minutes ? `${a.duration_minutes} menit` : 'Mulai'}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 font-mono text-2xs uppercase tracking-widest font-bold">
              <Clock className="w-3 h-3" />
              Menunggu Nilai
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
