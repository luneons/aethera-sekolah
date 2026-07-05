'use client';

import {
  CalendarCheck,
  CheckCircle2,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  Sunrise,
  Target,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import type { Quest } from '@/lib/disciplineApi';
import { cn } from '@/lib/utils';

interface QuestListProps {
  quests: Quest[];
}

const ICON_MAP: Record<string, React.ElementType> = {
  'calendar-check': CalendarCheck,
  sunrise: Sunrise,
  'heart-handshake': HeartHandshake,
  'shield-check': ShieldCheck,
};

/**
 * Quest mingguan — refresh otomatis tiap Senin, server-side.
 * Tampil sebagai checklist progres + reward XP, biar siswa ada
 * micro-goal di luar streak.
 */
export function QuestList({ quests }: QuestListProps) {
  const completedCount = quests.filter((q) => q.completed).length;

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary-300" />
          <div>
            <h3 className="font-display font-semibold text-lg">Quest Minggu Ini</h3>
            <p className="font-body text-sm text-text-muted">
              Selesaikan untuk dapat XP bonus
            </p>
          </div>
        </div>
        <span className="font-mono text-2xs uppercase tracking-widest text-text-muted">
          {completedCount}/{quests.length} done
        </span>
      </div>

      <div className="space-y-2">
        {quests.map((q) => {
          const Icon = ICON_MAP[q.icon] ?? Sparkles;
          return (
            <div
              key={q.code}
              className={cn(
                'relative rounded-xl border p-3 transition-all',
                q.completed
                  ? 'border-success/40 bg-success/5'
                  : 'border-surface-border bg-surface-base/40 hover:border-primary-500/30'
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0',
                    q.completed
                      ? 'bg-success/20 text-success'
                      : 'bg-primary-500/15 text-primary-300'
                  )}
                >
                  {q.completed ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <p
                      className={cn(
                        'font-display font-semibold text-sm',
                        q.completed && 'line-through text-text-muted'
                      )}
                    >
                      {q.title}
                    </p>
                    <span
                      className={cn(
                        'font-mono text-2xs uppercase tracking-widest font-bold shrink-0',
                        q.completed ? 'text-success' : 'text-amber-400'
                      )}
                    >
                      +{q.reward_xp} XP
                    </span>
                  </div>
                  <p className="font-body text-xs text-text-muted mt-0.5">
                    {q.description}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
                      <span
                        className={cn(
                          'block h-full transition-all duration-500',
                          q.completed
                            ? 'bg-success'
                            : 'bg-gradient-to-r from-primary-500 to-primary-400'
                        )}
                        style={{ width: `${q.percent}%` }}
                      />
                    </div>
                    <span className="font-mono text-2xs text-text-muted w-12 text-right">
                      {q.progress}/{q.target}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {quests.length === 0 && (
        <p className="text-center font-body text-text-muted py-6 text-sm">
          Belum ada quest aktif minggu ini.
        </p>
      )}
    </Card>
  );
}
