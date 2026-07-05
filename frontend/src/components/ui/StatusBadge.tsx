import { cn } from '@/lib/utils';

type Status = 'present' | 'late' | 'absent' | 'excused' | 'holiday' | 'online' | 'offline';

const statusConfig: Record<Status, { label: string; cls: string; dot: string }> = {
  present: { label: 'Hadir', cls: 'bg-success/10 text-success border-success/30', dot: 'bg-success' },
  late: {
    label: 'Terlambat',
    cls: 'bg-accent-500/10 text-accent-400 border-accent-500/30',
    dot: 'bg-accent-500',
  },
  absent: { label: 'Absen', cls: 'bg-danger/10 text-danger border-danger/30', dot: 'bg-danger' },
  excused: {
    label: 'Izin',
    cls: 'bg-primary-500/10 text-primary-400 border-primary-500/30',
    dot: 'bg-primary-500',
  },
  holiday: {
    label: 'Libur',
    cls: 'bg-surface-border text-text-muted border-surface-border',
    dot: 'bg-text-muted',
  },
  online: {
    label: 'Online',
    cls: 'bg-success/10 text-success border-success/30',
    dot: 'bg-success animate-status-blink',
  },
  offline: { label: 'Offline', cls: 'bg-danger/10 text-danger border-danger/30', dot: 'bg-danger' },
};

export function StatusBadge({ status }: { status: Status | string }) {
  const cfg = statusConfig[status as Status] ?? statusConfig.absent;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-mono font-semibold tracking-widest uppercase border',
        cfg.cls
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}
