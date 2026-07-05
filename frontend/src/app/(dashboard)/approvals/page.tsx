'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Clock,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  decideApproval,
  fetchApprovals,
  type PendingApproval,
} from '@/lib/disciplineApi';
import { getErrorMessage } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';

const TABS = [
  { key: 'pending' as const, label: 'Menunggu', icon: Clock },
  { key: 'approved' as const, label: 'Disetujui', icon: CheckCircle2 },
  { key: 'rejected' as const, label: 'Ditolak', icon: XCircle },
];

/**
 * Halaman persetujuan KTS berat — exclusive untuk kepsek (super_admin).
 * Pelanggaran kategori 'berat' yang dilapor guru/BK akan masuk antrian
 * di sini sebelum di-apply ke ledger siswa.
 */
export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending');

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ['approvals', tab],
    queryFn: () => fetchApprovals(tab),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Decision Queue
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">
          Persetujuan KTS Berat
        </h1>
        <p className="font-body text-text-muted mt-1">
          Pelanggaran kategori berat butuh persetujuan kepala sekolah sebelum
          tercatat di ledger siswa.
        </p>
      </div>

      <div className="inline-flex rounded-xl border border-surface-border bg-surface-raised p-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg font-display font-semibold text-sm transition-all',
                isActive
                  ? 'role-accent-bg-soft role-accent-text'
                  : 'text-text-muted hover:text-text-secondary'
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {isLoading && (
        <p className="text-center font-body text-text-muted py-8">
          Memuat permohonan...
        </p>
      )}
      {!isLoading && approvals.length === 0 && (
        <Card padding="lg" className="text-center">
          <ShieldCheck className="w-12 h-12 text-success mx-auto mb-3" />
          <p className="font-display font-semibold">
            Tidak ada permohonan {tab === 'pending' ? 'pending' : tab === 'approved' ? 'disetujui' : 'ditolak'}
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {approvals.map((a) => (
          <ApprovalCard
            key={a.id}
            approval={a}
            onDecided={() => {
              queryClient.invalidateQueries({ queryKey: ['approvals'] });
              queryClient.invalidateQueries({ queryKey: ['exec-dashboard'] });
              queryClient.invalidateQueries({ queryKey: ['discipline-student', a.student_id] });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ApprovalCard({
  approval,
  onDecided,
}: {
  approval: PendingApproval;
  onDecided: () => void;
}) {
  const [reason, setReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  const decideMutation = useMutation({
    mutationFn: (decision: 'approve' | 'reject') =>
      decideApproval(approval.id, decision, reason || undefined),
    onSuccess: (res) => {
      toast.success(res.message ?? 'Permohonan diproses');
      onDecided();
    },
    onError: (err) =>
      toast.error('Gagal memproses', { description: getErrorMessage(err) }),
  });

  const isPending = approval.status === 'pending';
  const statusTone =
    approval.status === 'approved'
      ? 'border-success/40 bg-success/5'
      : approval.status === 'rejected'
        ? 'border-rose-500/40 bg-rose-500/5'
        : 'border-amber-500/40 bg-amber-500/5';

  return (
    <Card padding="lg" className={cn('border-2', statusTone)}>
      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-2xs uppercase tracking-widest font-bold text-rose-400 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/30">
              {approval.severity}
            </span>
            <span className="font-mono text-2xs text-text-muted">
              {approval.violation_code}
            </span>
          </div>
          <h3 className="font-display font-bold text-lg">{approval.violation_name}</h3>
          <p className="font-body text-sm text-text-muted mt-0.5">
            untuk{' '}
            <span className="font-semibold text-text-primary">
              {approval.student_name}
            </span>
            {approval.student_class ? ` · ${approval.student_class}` : ''}
          </p>
          <p className="font-mono text-2xs text-text-muted mt-1">
            Dilaporkan {approval.requester_name} · {formatDate(approval.incident_date)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <Pill label="Sikap" value={`-${approval.attitude_penalty}`} tone="text-danger" />
        <Pill label="Kersos" value={`+${approval.kersos_hours}j`} tone="text-fuchsia-400" />
        <Pill label="Lembur" value={`+${approval.lembur_hours}j`} tone="text-orange-400" />
      </div>

      {approval.notes && (
        <div className="rounded-lg border border-surface-border bg-surface-base/40 p-3 mb-3">
          <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mb-1">
            Catatan pelapor
          </p>
          <p className="font-body text-sm text-text-secondary whitespace-pre-wrap">
            {approval.notes}
          </p>
        </div>
      )}

      {!isPending && (
        <div className="rounded-lg border border-surface-border bg-surface-base/40 p-3 mb-3">
          <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mb-1">
            Keputusan oleh {approval.decision_by_name}
          </p>
          {approval.decision_at && (
            <p className="font-mono text-2xs text-text-muted">
              {formatDate(approval.decision_at)}
            </p>
          )}
          {approval.decision_reason && (
            <p className="font-body text-sm text-text-secondary mt-1 whitespace-pre-wrap">
              {approval.decision_reason}
            </p>
          )}
        </div>
      )}

      {isPending && (
        <>
          {showRejectForm && (
            <div className="mb-3">
              <label className="block font-body text-sm font-medium text-text-secondary mb-1.5">
                Alasan penolakan
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Misal: butuh klarifikasi tambahan, pelanggaran masih bisa diberi peringatan, dst."
                className="w-full font-body text-sm bg-surface-raised border border-surface-border rounded-lg px-3 py-2 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
              />
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
            {!showRejectForm ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setShowRejectForm(true)}
                  leftIcon={<XCircle className="w-4 h-4" />}
                  className="text-rose-400 hover:bg-rose-500/10"
                >
                  Tolak
                </Button>
                <Button
                  isLoading={decideMutation.isPending}
                  onClick={() => decideMutation.mutate('approve')}
                  leftIcon={<CheckCircle2 className="w-4 h-4" />}
                >
                  Setujui & Apply
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setShowRejectForm(false)}>
                  Batal
                </Button>
                <Button
                  variant="danger"
                  isLoading={decideMutation.isPending}
                  onClick={() => decideMutation.mutate('reject')}
                  leftIcon={<XCircle className="w-4 h-4" />}
                >
                  Konfirmasi Tolak
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function Pill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-base/60 px-3 py-2 text-center">
      <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">
        {label}
      </p>
      <p className={cn('font-display font-bold text-lg', tone)}>{value}</p>
    </div>
  );
}
