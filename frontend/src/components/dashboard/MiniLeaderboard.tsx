'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, GraduationCap, HeartHandshake, Sunrise, Trophy } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { fetchLeaderboard, type DisciplineCategory } from '@/lib/disciplineApi';
import { cn } from '@/lib/utils';

const TABS: {
  key: DisciplineCategory;
  label: string;
  icon: React.ElementType;
  fmt: (n: number) => string;
}[] = [
  { key: 'gpa', label: 'Nilai', icon: GraduationCap, fmt: (n) => n.toFixed(1) },
  { key: 'punctuality', label: 'Rajin', icon: Sunrise, fmt: (n) => `${n.toFixed(1)}m` },
  { key: 'appreciation', label: 'Apresiasi', icon: HeartHandshake, fmt: (n) => String(n) },
];

const RANK_TONE: Record<number, string> = {
  1: 'podium-gold',
  2: 'podium-silver',
  3: 'podium-bronze',
};

export function MiniLeaderboard() {
  const [active, setActive] = useState<DisciplineCategory>('gpa');
  const tab = TABS.find((t) => t.key === active)!;

  const { data: entries = [] } = useQuery({
    queryKey: ['mini-leaderboard', active],
    queryFn: () => fetchLeaderboard(active, undefined, 5),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <h3 className="font-display font-semibold text-base text-text-primary">
            Top Siswa
          </h3>
        </div>
        <Link
          href="/leaderboard"
          className="text-xs font-body text-primary-300 hover:text-primary-400 inline-flex items-center gap-1 group"
        >
          Lihat semua
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      <div className="inline-flex rounded-lg bg-surface-base/60 border border-surface-border p-1 w-full">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-display font-semibold rounded-md transition-all',
                isActive
                  ? 'bg-primary-500/15 text-primary-300'
                  : 'text-text-muted hover:text-text-secondary'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {entries.map((e) => {
          const podium = RANK_TONE[e.rank];
          return (
            <Link
              key={e.student_id}
              href={`/student-status/${e.student_id}`}
              className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-base/40 hover:bg-surface-overlay border border-transparent hover:border-primary-500/30 transition-all group"
            >
              <span
                className={cn(
                  'inline-flex items-center justify-center w-7 h-7 rounded-full font-mono font-bold text-2xs',
                  podium ?? 'bg-surface-base text-text-secondary border border-surface-border'
                )}
              >
                {e.rank}
              </span>
              <Avatar
                name={e.full_name}
                src={e.photo_url ?? undefined}
                size="xs"
              />
              <div className="flex-1 min-w-0">
                <p className="font-body text-sm font-medium truncate group-hover:text-primary-300 transition-colors">
                  {e.full_name}
                </p>
                <p className="font-mono text-2xs text-text-muted">
                  {e.class_name ?? '—'}
                </p>
              </div>
              <span className="font-display font-bold text-sm text-primary-300">
                {tab.fmt(e.primary_value)}
              </span>
            </Link>
          );
        })}
        {entries.length === 0 && (
          <p className="font-body text-text-muted text-xs text-center py-4">
            Belum ada data peringkat.
          </p>
        )}
      </div>
    </div>
  );
}
