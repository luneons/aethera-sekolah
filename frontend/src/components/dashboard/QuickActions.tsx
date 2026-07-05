'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

export interface QuickAction {
  href: string;
  icon: LucideIcon;
  label: string;
  description?: string;
  /** Tone untuk hover & icon background. */
  tone?: 'primary' | 'amber' | 'rose' | 'emerald' | 'violet' | 'cyan';
  /** Optional badge count di kanan atas. */
  badge?: string | number;
}

const TONE_MAP: Record<NonNullable<QuickAction['tone']>, string> = {
  primary: 'bg-primary-500/15 text-primary-300 group-hover:bg-primary-500/25 border-primary-500/30',
  amber: 'bg-amber-500/15 text-amber-400 group-hover:bg-amber-500/25 border-amber-500/30',
  rose: 'bg-rose-500/15 text-rose-400 group-hover:bg-rose-500/25 border-rose-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-400 group-hover:bg-emerald-500/25 border-emerald-500/30',
  violet: 'bg-violet-500/15 text-violet-400 group-hover:bg-violet-500/25 border-violet-500/30',
  cyan: 'bg-cyan-500/15 text-cyan-300 group-hover:bg-cyan-500/25 border-cyan-500/30',
};

interface QuickActionsProps {
  title?: string;
  description?: string;
  actions: QuickAction[];
}

/**
 * Pintasan cepat untuk dashboard — visual besar, mudah di-tap.
 */
export function QuickActions({ title, description, actions }: QuickActionsProps) {
  return (
    <Card padding="lg">
      {(title || description) && (
        <div className="mb-4">
          {title && <h3 className="font-display font-semibold text-base">{title}</h3>}
          {description && (
            <p className="font-body text-sm text-text-muted mt-0.5">{description}</p>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {actions.map((a) => {
          const Icon = a.icon;
          const tone = TONE_MAP[a.tone ?? 'primary'];
          return (
            <Link
              key={a.href}
              href={a.href}
              className={cn(
                'group relative rounded-xl border bg-surface-base/60 hover:bg-surface-overlay transition-all p-3 flex flex-col gap-2',
                'hover:border-primary-500/40 hover:-translate-y-0.5'
              )}
            >
              {a.badge !== undefined && a.badge !== '' && (
                <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-rose-500 text-white font-mono text-2xs font-bold">
                  {a.badge}
                </span>
              )}
              <span
                className={cn(
                  'inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-colors',
                  tone
                )}
              >
                <Icon className="w-[18px] h-[18px]" />
              </span>
              <div className="flex-1">
                <p className="font-display font-semibold text-sm text-text-primary leading-tight">
                  {a.label}
                </p>
                {a.description && (
                  <p className="font-body text-2xs text-text-muted mt-0.5 line-clamp-2">
                    {a.description}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
