'use client';

import { cn } from '@/lib/utils';

interface PointPillProps {
  label: string;
  value: number | string;
  /** Tone fixed atau auto from numeric value (untuk poin sikap). */
  tone?: 'success' | 'warning' | 'danger' | 'gold' | 'primary' | 'auto-attitude';
  /** Untuk tone auto-attitude: nilai 100 max → success/warning/danger. */
  numeric?: number;
  suffix?: string;
  icon?: React.ReactNode;
  className?: string;
}

const toneMap = {
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-accent-500/10 text-accent-400 border-accent-500/30',
  danger: 'bg-danger/10 text-danger border-danger/30',
  gold: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  primary: 'bg-primary-500/10 text-primary-400 border-primary-500/30',
} as const;

function resolveTone(
  tone: PointPillProps['tone'],
  numeric: number | undefined,
): keyof typeof toneMap {
  if (tone && tone !== 'auto-attitude') return tone;
  if (typeof numeric === 'number') {
    if (numeric >= 80) return 'success';
    if (numeric >= 60) return 'warning';
    return 'danger';
  }
  return 'primary';
}

export function PointPill({
  label,
  value,
  tone = 'primary',
  numeric,
  suffix,
  icon,
  className,
}: PointPillProps) {
  const t = resolveTone(tone, numeric);
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-surface-raised px-4 py-3 transition-colors',
        toneMap[t],
        className
      )}
    >
      {icon && (
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-surface-base/40">
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">
          {label}
        </p>
        <p className="font-display font-bold text-2xl leading-tight">
          {value}
          {suffix && (
            <span className="ml-1 font-display text-base font-medium opacity-80">
              {suffix}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
