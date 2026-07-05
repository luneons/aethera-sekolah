'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Crown } from 'lucide-react';
import type { LeaderboardEntry } from '@/lib/disciplineApi';
import { Avatar } from '@/components/ui/Avatar';
import { BadgeRow, BadgeRowCompact } from './StudentBadge';
import { cn } from '@/lib/utils';

const PODIUM_TONE = {
  1: {
    cls: 'podium-gold',
    label: 'JUARA 1',
    height: 'h-44 md:h-56',
    avatarRing: 'ring-amber-300',
  },
  2: {
    cls: 'podium-silver',
    label: 'JUARA 2',
    height: 'h-32 md:h-44',
    avatarRing: 'ring-slate-200',
  },
  3: {
    cls: 'podium-bronze',
    label: 'JUARA 3',
    height: 'h-28 md:h-36',
    avatarRing: 'ring-amber-700',
  },
} as const;

interface PodiumProps {
  entries: LeaderboardEntry[];
  formatValue?: (n: number) => string;
}

/**
 * Podium 1-2-3 dengan gold/silver/bronze. Posisi visual: 2 — 1 — 3.
 */
export function LeaderboardPodium({ entries, formatValue }: PodiumProps) {
  const podiumRef = useRef<HTMLDivElement>(null);
  const top3 = entries.slice(0, 3);
  const fmt = formatValue ?? ((n: number) => n.toString());

  useEffect(() => {
    if (!podiumRef.current || top3.length < 3) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.podium-pillar',
        { y: 60, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.7,
          ease: 'back.out(1.4)',
          stagger: { each: 0.15, from: 'edges' },
        }
      );
      gsap.fromTo(
        '.podium-avatar',
        { scale: 0, rotate: -20 },
        {
          scale: 1,
          rotate: 0,
          duration: 0.6,
          ease: 'back.out(1.7)',
          stagger: 0.15,
          delay: 0.2,
        }
      );
    }, podiumRef);
    return () => ctx.revert();
  }, [top3.map((e) => e.student_id).join(',')]);

  if (top3.length < 3) return null;

  // Reorder visual: index 1 (rank 2) — index 0 (rank 1) — index 2 (rank 3)
  const ordered = [top3[1], top3[0], top3[2]];

  return (
    <div ref={podiumRef} className="grid grid-cols-3 gap-3 md:gap-6 items-end">
      {ordered.map((e) => {
        const rank = e.rank as 1 | 2 | 3;
        const tone = PODIUM_TONE[rank];
        return (
          <div key={e.student_id} className="podium-pillar flex flex-col items-center">
            <div className="relative mb-3 podium-avatar">
              {rank === 1 && (
                <Crown className="absolute -top-7 left-1/2 -translate-x-1/2 w-7 h-7 text-amber-300 drop-shadow-lg" />
              )}
              <div
                className={cn(
                  'rounded-full ring-4 shadow-card-hover',
                  tone.avatarRing
                )}
              >
                <Avatar
                  name={e.full_name}
                  src={e.photo_url ?? undefined}
                  size={rank === 1 ? 'xl' : 'lg'}
                />
              </div>
            </div>

            <div
              className={cn(
                'w-full rounded-t-2xl border border-white/20 px-3 py-4 text-center flex flex-col justify-end',
                tone.cls,
                tone.height
              )}
            >
              <p className="font-mono text-2xs tracking-[0.25em] font-bold opacity-80">
                {tone.label}
              </p>
              <p className="font-display font-bold text-base md:text-lg leading-tight mt-1 truncate">
                {e.full_name}
              </p>
              <p className="font-mono text-2xs opacity-80">{e.class_name ?? '—'}</p>
              <p className="font-display text-2xl md:text-3xl font-bold mt-2">
                {fmt(e.primary_value)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LeaderboardRow({
  entry,
  formatValue,
}: {
  entry: LeaderboardEntry;
  formatValue?: (n: number) => string;
}) {
  const fmt = formatValue ?? ((n: number) => n.toString());
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-muted hover:bg-surface-overlay border border-transparent hover:border-primary-500/20 transition-all group">
      <span className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-surface-base font-mono font-bold text-sm text-text-secondary border border-surface-border shrink-0">
        {entry.rank}
      </span>
      <Avatar name={entry.full_name} src={entry.photo_url ?? undefined} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="font-body text-sm font-medium truncate group-hover:text-primary-300 transition-colors">
          {entry.full_name}
        </p>
        <p className="font-mono text-2xs text-text-muted whitespace-nowrap truncate">
          {entry.class_name ?? '—'}
        </p>
      </div>
      <BadgeRow badges={entry.badges.slice(0, 1)} />
      <BadgeRowCompact badges={entry.badges} />
      <span className="font-display font-bold text-lg text-primary-300 ml-2 shrink-0">
        {fmt(entry.primary_value)}
      </span>
    </div>
  );
}
