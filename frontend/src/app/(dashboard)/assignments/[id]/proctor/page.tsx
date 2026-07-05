'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Loader2,
  Lock,
  Send,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  User,
} from 'lucide-react';
import { fetchAssignment } from '@/lib/lmsApi';
import { fetchProctor, unlockStudent, type ProctorRow } from '@/lib/quizApi';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<
  string,
  { label: string; tone: string; icon: typeof Eye }
> = {
  not_started: { label: 'Belum Mulai', tone: 'text-text-muted bg-surface-raised', icon: User },
  in_progress: { label: 'Sedang Mengerjakan', tone: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30', icon: Eye },
  locked: { label: 'TERKUNCI', tone: 'text-rose-300 bg-rose-500/10 border-rose-500/30 animate-pulse', icon: Lock },
  unlocked_by_teacher: { label: 'Diunlock', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30', icon: Unlock },
  submitted: { label: 'Selesai', tone: 'text-success bg-success/10 border-success/30', icon: CheckCircle2 },
  auto_submitted: { label: 'Auto-Submit', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30', icon: Send },
};

function timeFromNow(iso?: string | null) {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'sekarang';
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ProctorPage() {
  const params = useParams<{ id: string }>();
  const assignmentId = Number(params.id);
  const qc = useQueryClient();
  const [, setNow] = useState(0);

  // Re-render setiap 2 detik untuk countdown lock
  useEffect(() => {
    const id = setInterval(() => setNow((n) => n + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const { data: assignment } = useQuery({
    queryKey: ['assignment-detail', assignmentId],
    queryFn: () => fetchAssignment(assignmentId),
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['proctor', assignmentId],
    queryFn: () => fetchProctor(assignmentId),
    refetchInterval: 5_000,
    staleTime: 0,
  });

  const unlockMutation = useMutation({
    mutationFn: (studentId: number) => unlockStudent(assignmentId, studentId),
    onSuccess: (res) => {
      toast.success(res.message || 'Siswa di-unlock');
      qc.invalidateQueries({ queryKey: ['proctor', assignmentId] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const stats = {
    inProgress: rows.filter((r) => r.status === 'in_progress' || r.status === 'unlocked_by_teacher').length,
    locked: rows.filter((r) => r.status === 'locked').length,
    submitted: rows.filter((r) => r.status === 'submitted' || r.status === 'auto_submitted').length,
    notStarted: rows.filter((r) => r.status === 'not_started').length,
  };

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/assignments/${assignmentId}`}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary-400 mb-2"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali
        </Link>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Eye className="w-6 h-6 text-primary-400" />
          Proctor: {assignment?.title ?? '...'}
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Pantau siswa real-time. Status auto-refresh tiap 5 detik.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Sedang Aktif" value={stats.inProgress} tone="text-cyan-300" icon={<Eye className="w-4 h-4" />} />
        <Stat label="Terkunci" value={stats.locked} tone="text-rose-400" icon={<Lock className="w-4 h-4" />} />
        <Stat label="Selesai" value={stats.submitted} tone="text-success" icon={<CheckCircle2 className="w-4 h-4" />} />
        <Stat label="Belum Mulai" value={stats.notStarted} tone="text-text-muted" icon={<User className="w-4 h-4" />} />
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary-400" />
        </div>
      ) : (
        <div className="rounded-xl border border-surface-border bg-surface-muted overflow-hidden">
          {rows.map((r) => {
            const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.not_started;
            const Icon = cfg.icon;
            const showUnlock = r.status === 'locked';
            return (
              <div
                key={r.student_id}
                className="flex items-center gap-3 px-3 sm:px-4 py-3 border-b border-surface-border/60 last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-body font-semibold text-sm truncate">{r.student_name}</p>
                  <p className="font-mono text-2xs text-text-muted">NIS {r.nis}</p>
                </div>

                <div className="hidden sm:flex flex-col items-end text-right shrink-0">
                  {r.focus_violations > 0 && (
                    <p className="font-mono text-2xs text-amber-400">
                      {r.focus_violations}× pelanggaran
                    </p>
                  )}
                  {r.status === 'locked' && r.locked_until && (
                    <p className="font-mono text-2xs text-rose-400">
                      sisa {timeFromNow(r.locked_until)}
                    </p>
                  )}
                  {r.final_score !== null && r.final_score !== undefined && (
                    <p className="font-display font-bold text-sm text-primary-400">
                      {r.final_score.toFixed(1)}
                    </p>
                  )}
                </div>

                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wider font-bold px-2 py-1 rounded-full border whitespace-nowrap',
                    cfg.tone
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {cfg.label}
                </span>

                {showUnlock && (
                  <button
                    onClick={() => unlockMutation.mutate(r.student_id)}
                    disabled={unlockMutation.isPending}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-semibold disabled:opacity-50"
                  >
                    <Unlock className="w-3 h-3" /> Buka
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-muted p-3">
      <div className={`flex items-center gap-1.5 ${tone}`}>
        {icon}
        <span className="font-mono text-2xs uppercase tracking-widest">{label}</span>
      </div>
      <p className={`font-display font-bold text-2xl mt-1 ${tone}`}>{value}</p>
    </div>
  );
}
