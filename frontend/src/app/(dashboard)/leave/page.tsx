'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Calendar,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Send,
  ShieldAlert,
  Stethoscope,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import {
  cancelLeave,
  decideLeave,
  fetchLeaveRequests,
  submitLeaveRequest,
  type LeaveKind,
  type LeaveRequest,
  type LeaveStatus,
} from '@/lib/leaveApi';
import { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn, formatDate } from '@/lib/utils';

const STATUS_CONFIG: Record<
  LeaveStatus,
  { label: string; tone: string; icon: typeof Clock }
> = {
  pending: {
    label: 'Menunggu',
    tone: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    icon: Clock,
  },
  approved: {
    label: 'Disetujui',
    tone: 'bg-success/10 border-success/30 text-success',
    icon: CheckCircle2,
  },
  rejected: {
    label: 'Ditolak',
    tone: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
    icon: XCircle,
  },
  cancelled: {
    label: 'Dibatalkan',
    tone: 'bg-surface-raised border-surface-border text-text-muted',
    icon: X,
  },
};

const KIND_LABELS: Record<LeaveKind, { label: string; icon: typeof FileText; color: string }> = {
  sakit: { label: 'Sakit', icon: Stethoscope, color: 'text-rose-400' },
  izin: { label: 'Izin', icon: ClipboardList, color: 'text-cyan-400' },
  lainnya: { label: 'Lainnya', icon: FileText, color: 'text-violet-400' },
};

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function LeavePage() {
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'employee';
  const isStudent = role === 'employee';
  const canDecide = role === 'super_admin' || role === 'admin' || role === 'hr';

  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | 'all'>(
    isStudent ? 'all' : 'pending'
  );
  const [openForm, setOpenForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['leave-list', statusFilter],
    queryFn: () =>
      fetchLeaveRequests({
        status: statusFilter === 'all' ? undefined : statusFilter,
        page: 1,
        per_page: 100,
      }),
    refetchInterval: 30_000,
    staleTime: 0,
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList className="w-5 h-5 role-accent-text" />
            <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
              Pengajuan Izin
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-display-md font-bold">
            Izin / Sakit
          </h1>
          <p className="font-body text-text-muted mt-1">
            {isStudent
              ? 'Ajukan izin atau sakit dengan bukti pendukung. Wali kelas atau guru BK akan memproses.'
              : canDecide
                ? 'Tinjau pengajuan dari siswa. Yang disetujui otomatis update absensi mereka jadi excused.'
                : 'Daftar pengajuan izin di sekolah ini.'}
          </p>
        </div>
        {isStudent && (
          <button
            onClick={() => setOpenForm(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Ajukan Izin Baru
          </button>
        )}
      </div>

      {/* Filter chip */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'pending', 'approved', 'rejected', 'cancelled'] as const).map((k) => {
          const active = statusFilter === k;
          return (
            <button
              key={k}
              onClick={() => setStatusFilter(k)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                active
                  ? 'bg-primary-500/15 text-primary-300 border-primary-500/40'
                  : 'bg-surface-muted text-text-muted border-surface-border hover:text-text-primary'
              )}
            >
              {k === 'all' ? 'Semua' : STATUS_CONFIG[k].label}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-surface-border p-10 text-center">
            <ClipboardList className="w-10 h-10 text-text-muted mx-auto mb-2 opacity-50" />
            <p className="font-display font-semibold">
              {isStudent && statusFilter === 'all'
                ? 'Belum ada pengajuan'
                : 'Tidak ada pengajuan dengan filter ini'}
            </p>
            {isStudent && statusFilter === 'all' && (
              <p className="text-sm text-text-muted mt-1">
                Klik tombol "Ajukan Izin Baru" untuk mulai.
              </p>
            )}
          </div>
        ) : (
          items.map((lr) => (
            <LeaveCard
              key={lr.id}
              lr={lr}
              isOwner={isStudent && lr.student_id === user?.id}
              canDecide={canDecide && lr.status === 'pending'}
              onChanged={() => qc.invalidateQueries({ queryKey: ['leave-list'] })}
            />
          ))
        )}
      </div>

      {/* Form modal */}
      {openForm && (
        <LeaveFormModal
          onClose={() => setOpenForm(false)}
          onSubmitted={() => {
            qc.invalidateQueries({ queryKey: ['leave-list'] });
            setOpenForm(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────

function LeaveCard({
  lr,
  isOwner,
  canDecide,
  onChanged,
}: {
  lr: LeaveRequest;
  isOwner: boolean;
  canDecide: boolean;
  onChanged: () => void;
}) {
  const cfg = STATUS_CONFIG[lr.status];
  const kindCfg = KIND_LABELS[lr.kind];
  const KindIcon = kindCfg.icon;
  const StatusIcon = cfg.icon;

  const [decisionOpen, setDecisionOpen] = useState<'approve' | 'reject' | null>(null);
  const [decisionNote, setDecisionNote] = useState('');

  const decideMutation = useMutation({
    mutationFn: (d: 'approve' | 'reject') => decideLeave(lr.id, d, decisionNote || undefined),
    onSuccess: (res) => {
      toast.success(res.message || 'Pengajuan diputuskan');
      setDecisionOpen(null);
      setDecisionNote('');
      onChanged();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelLeave(lr.id),
    onSuccess: () => {
      toast.success('Pengajuan dibatalkan');
      onChanged();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="rounded-xl border border-surface-border bg-surface-muted p-3 sm:p-4 space-y-3">
      <div className="flex items-start gap-3 flex-wrap">
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
            kindCfg.color === 'text-rose-400' && 'bg-rose-500/10',
            kindCfg.color === 'text-cyan-400' && 'bg-cyan-500/10',
            kindCfg.color === 'text-violet-400' && 'bg-violet-500/10'
          )}
        >
          <KindIcon className={cn('w-5 h-5', kindCfg.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="font-display font-semibold text-base">
              {kindCfg.label}: {lr.student_name}
            </p>
            <span
              className={cn(
                'inline-flex items-center gap-1 font-mono text-2xs uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border',
                cfg.tone
              )}
            >
              <StatusIcon className="w-3 h-3" />
              {cfg.label}
            </span>
          </div>
          <p className="font-mono text-2xs text-text-muted">
            NIS {lr.student_nis}
            {lr.student_class && ` · ${lr.student_class}`}
          </p>
          <div className="flex items-center gap-3 mt-2 text-xs text-text-secondary flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(lr.start_date)}
              {lr.start_date !== lr.end_date && ` - ${formatDate(lr.end_date)}`}
              <span className="text-text-muted ml-1">({lr.days_count} hari)</span>
            </span>
          </div>
          <p className="text-sm text-text-secondary mt-2 break-words whitespace-pre-line">
            <strong className="text-text-primary">Alasan:</strong> {lr.reason}
          </p>
          {lr.proof_file_url && (
            <a
              href={lr.proof_file_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-lg border border-surface-border bg-surface-raised text-xs text-primary-400 hover:bg-surface-overlay"
            >
              <Paperclip className="w-3.5 h-3.5" />
              {lr.proof_file_name ?? 'Bukti pendukung'}
            </a>
          )}
          {lr.status !== 'pending' && lr.decided_by_name && (
            <div className="mt-2 text-xs text-text-muted">
              {lr.status === 'approved' ? 'Disetujui' : lr.status === 'rejected' ? 'Ditolak' : 'Diputuskan'} oleh{' '}
              <span className="text-text-secondary font-medium">{lr.decided_by_name}</span>
              {lr.decided_at && ` · ${formatDate(lr.decided_at)}`}
              {lr.decision_note && (
                <p className="mt-1 italic text-text-secondary">
                  "{lr.decision_note}"
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action row */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-surface-border/40">
        {canDecide && decisionOpen === null && (
          <>
            <button
              onClick={() => setDecisionOpen('approve')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/15 hover:bg-success/25 text-success border border-success/40 text-xs font-semibold"
            >
              <Check className="w-3.5 h-3.5" />
              Setujui
            </button>
            <button
              onClick={() => setDecisionOpen('reject')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 text-xs font-semibold"
            >
              <X className="w-3.5 h-3.5" />
              Tolak
            </button>
          </>
        )}
        {isOwner && lr.status === 'pending' && (
          <button
            onClick={() => {
              if (confirm('Batalkan pengajuan ini?')) cancelMutation.mutate();
            }}
            disabled={cancelMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-border text-text-muted text-xs hover:text-rose-400 hover:border-rose-500/40"
          >
            <X className="w-3.5 h-3.5" />
            Batalkan
          </button>
        )}
      </div>

      {decisionOpen && (
        <div className="rounded-lg border border-surface-border bg-surface-base/60 p-3 space-y-2">
          <p className="text-xs text-text-muted">
            {decisionOpen === 'approve'
              ? 'Catatan untuk siswa (opsional). Setelah disetujui, absensi siswa pada tanggal-tanggal tersebut akan otomatis di-mark sebagai excused.'
              : 'Berikan alasan penolakan (opsional tapi sangat disarankan).'}
          </p>
          <textarea
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={
              decisionOpen === 'approve'
                ? 'Sembuh ya, kabari kalau sudah sehat.'
                : 'Lampirkan surat dokter yang lebih jelas dulu.'
            }
            className="w-full px-3 py-2 rounded-lg border border-surface-border bg-surface-raised text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setDecisionOpen(null);
                setDecisionNote('');
              }}
              className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary"
            >
              Batal
            </button>
            <button
              onClick={() => decideMutation.mutate(decisionOpen)}
              disabled={decideMutation.isPending}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50',
                decisionOpen === 'approve'
                  ? 'bg-success hover:bg-success/90 text-white'
                  : 'bg-rose-500 hover:bg-rose-600 text-white'
              )}
            >
              {decideMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {decisionOpen === 'approve' ? 'Konfirmasi Setuju' : 'Konfirmasi Tolak'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Form Modal ──────────────────────────────────────────────────────────

function LeaveFormModal({
  onClose,
  onSubmitted,
}: {
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [kind, setKind] = useState<LeaveKind>('izin');
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [reason, setReason] = useState('');
  const [proof, setProof] = useState<File | null>(null);

  const days = useMemo(() => {
    const a = new Date(startDate).getTime();
    const b = new Date(endDate).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return 0;
    return Math.max(0, Math.floor((b - a) / 86400000)) + 1;
  }, [startDate, endDate]);

  const submitMutation = useMutation({
    mutationFn: () =>
      submitLeaveRequest({
        kind,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim(),
        proof,
      }),
    onSuccess: (res) => {
      toast.success(res.message || 'Pengajuan terkirim');
      onSubmitted();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const canSubmit =
    reason.trim().length >= 5 &&
    !!startDate &&
    !!endDate &&
    new Date(endDate).getTime() >= new Date(startDate).getTime();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-surface-base/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-surface-border bg-surface-raised shadow-card-hover overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <p className="font-display font-bold text-base">Ajukan Izin / Sakit</p>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Jenis Pengajuan
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['sakit', 'izin', 'lainnya'] as const).map((k) => {
                const cfg = KIND_LABELS[k];
                const Icon = cfg.icon;
                const active = kind === k;
                return (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={cn(
                      'px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors flex flex-col items-center gap-1',
                      active
                        ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                        : 'border-surface-border bg-surface-base text-text-muted'
                    )}
                  >
                    <Icon className={cn('w-5 h-5', active ? 'text-primary-300' : cfg.color)} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Mulai
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (new Date(e.target.value) > new Date(endDate)) {
                    setEndDate(e.target.value);
                  }
                }}
                className="w-full px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Selesai
              </label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-text-muted">
            Total: <span className="text-primary-300 font-bold">{days} hari</span> (Sabtu/Minggu otomatis tidak dihitung saat di-approve)
          </p>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Alasan <span className="text-rose-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Jelaskan alasan pengajuan dengan jelas..."
              className="w-full px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm"
            />
            <p className="text-2xs text-text-muted mt-1">{reason.length}/1000 (min 5)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Bukti Pendukung (opsional)
            </label>
            <p className="text-2xs text-text-muted mb-2">
              Surat dokter / foto / PDF — maksimal 5MB
            </p>
            <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed border-surface-border bg-surface-base/40 cursor-pointer hover:border-primary-500/40 transition-colors">
              <Upload className="w-4 h-4 text-text-muted" />
              <span className="text-sm text-text-secondary truncate">
                {proof ? proof.name : 'Pilih file (gambar atau PDF)'}
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setProof(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
            {proof && (
              <button
                onClick={() => setProof(null)}
                className="text-xs text-text-muted hover:text-rose-400 mt-1.5 inline-flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Hapus file
              </button>
            )}
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/90">
              Setelah disetujui wali kelas atau guru BK, absensimu pada tanggal yang diajukan otomatis di-mark sebagai <strong>"izin/sakit"</strong>, tidak menghilangkan poin kehadiran.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-text-muted hover:bg-surface-overlay"
          >
            Batal
          </button>
          <button
            onClick={() => submitMutation.mutate()}
            disabled={!canSubmit || submitMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {submitMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Kirim Pengajuan
          </button>
        </div>
      </div>
    </div>
  );
}
