'use client';

import { Flame } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

interface StreakCardProps {
  streakDays: number;
  daysToNextBadge?: number | null;
  nextBadgeCode?: string | null;
}

const NEXT_BADGE_LABEL: Record<string, string> = {
  perfect_attendance: 'Hadir Sempurna',
  early_bird: 'Early Bird',
  rising_star: 'Rising Star',
};

/**
 * Streak counter besar — meniru pola Duolingo.
 * Visual: angka besar dengan ikon api yang berdenyut, plus progress
 * bar menuju badge berikutnya.
 */
export function StreakCard({ streakDays, daysToNextBadge, nextBadgeCode }: StreakCardProps) {
  const badgeLabel = nextBadgeCode ? NEXT_BADGE_LABEL[nextBadgeCode] : null;
  const goal = streakDays + (daysToNextBadge ?? 0);
  const percent = goal > 0 ? Math.min(100, (streakDays / goal) * 100) : 100;

  // Tier visual berdasarkan streak length
  const tier =
    streakDays >= 30
      ? { color: 'text-amber-300', bg: 'from-amber-500/30 to-orange-500/10', label: 'Master Streak' }
      : streakDays >= 14
        ? { color: 'text-orange-400', bg: 'from-orange-500/25 to-rose-500/10', label: 'On Fire' }
        : streakDays >= 7
          ? { color: 'text-rose-400', bg: 'from-rose-500/20 to-pink-500/10', label: 'Hot Streak' }
          : streakDays >= 3
            ? { color: 'text-cyan-400', bg: 'from-cyan-500/20 to-primary-500/10', label: 'Mulai Mantap' }
            : { color: 'text-text-muted', bg: 'from-surface-overlay to-surface-base', label: 'Mulai Streak' };

  return (
    <Card padding="lg" className="relative overflow-hidden">
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-br opacity-60 pointer-events-none',
          tier.bg
        )}
      />
      <div className="relative flex items-center gap-4">
        <div className="relative shrink-0">
          <Flame
            className={cn(
              'w-14 h-14 sm:w-16 sm:h-16 drop-shadow-lg',
              tier.color,
              streakDays > 0 && 'animate-pulse'
            )}
          />
          {streakDays >= 7 && (
            <span className="absolute -top-1 -right-1 inline-flex w-4 h-4 rounded-full bg-amber-300 animate-ping opacity-75" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">
            {tier.label}
          </p>
          <p className="font-display font-bold text-3xl sm:text-4xl leading-tight">
            <span className={tier.color}>{streakDays}</span>
            <span className="text-text-muted text-lg ml-2">hari beruntun</span>
          </p>
          {daysToNextBadge !== null && daysToNextBadge !== undefined && daysToNextBadge > 0 && badgeLabel && (
            <p className="font-body text-sm text-text-secondary mt-2">
              <span className="font-semibold text-text-primary">{daysToNextBadge} hari lagi</span>
              {' '}sampai badge <span className="text-amber-400">{badgeLabel}</span>
            </p>
          )}
        </div>
      </div>

      {daysToNextBadge !== null && daysToNextBadge !== undefined && daysToNextBadge > 0 && (
        <div className="relative mt-4">
          <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden">
            <span
              className="block h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-700"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
