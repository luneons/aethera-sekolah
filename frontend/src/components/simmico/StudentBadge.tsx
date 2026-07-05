'use client';

import {
  Award,
  CalendarCheck,
  Crown,
  HeartHandshake,
  Sunrise,
  Sparkles,
  Star,
} from 'lucide-react';
import type { StudentBadgeCode } from '@/lib/disciplineApi';
import { cn } from '@/lib/utils';

const BADGE_CONFIG: Record<
  StudentBadgeCode,
  { label: string; description: string; icon: React.ElementType; tone: string }
> = {
  perfect_attendance: {
    label: 'Hadir Sempurna',
    description: '30+ hari beruntun tanpa terlambat',
    icon: CalendarCheck,
    tone: 'from-emerald-500/20 to-emerald-700/10 text-emerald-400 border-emerald-500/30',
  },
  top_scorer: {
    label: 'Top Akademik',
    description: 'Rata-rata nilai >= 90',
    icon: Crown,
    tone: 'from-yellow-500/20 to-amber-700/10 text-amber-400 border-amber-500/40',
  },
  social_hero: {
    label: 'Pahlawan Baksos',
    description: '100+ poin apresiasi sosial',
    icon: HeartHandshake,
    tone: 'from-rose-500/20 to-rose-700/10 text-rose-400 border-rose-500/30',
  },
  early_bird: {
    label: 'Early Bird',
    description: 'Datang rata-rata 10+ menit lebih awal',
    icon: Sunrise,
    tone: 'from-cyan-500/20 to-cyan-700/10 text-cyan-400 border-cyan-500/30',
  },
  rising_star: {
    label: 'Rising Star',
    description: 'Disiplin tinggi & nilai memuaskan',
    icon: Star,
    tone: 'from-violet-500/20 to-violet-700/10 text-violet-400 border-violet-500/30',
  },
  comeback_kid: {
    label: 'Comeback Kid',
    description: 'Mengangkat poin sikap secara signifikan',
    icon: Sparkles,
    tone: 'from-fuchsia-500/20 to-fuchsia-700/10 text-fuchsia-400 border-fuchsia-500/30',
  },
};

export function BadgeChip({
  badge,
  size = 'sm',
}: {
  badge: StudentBadgeCode;
  size?: 'sm' | 'md';
}) {
  const cfg = BADGE_CONFIG[badge];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span
      title={cfg.description}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border bg-gradient-to-br backdrop-blur-sm whitespace-nowrap shrink-0',
        'font-mono font-semibold tracking-wide uppercase',
        size === 'sm' ? 'text-2xs px-2 py-0.5' : 'text-xs px-3 py-1',
        cfg.tone
      )}
    >
      <Icon className={cn('shrink-0', size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
      <span className="whitespace-nowrap">{cfg.label}</span>
    </span>
  );
}

export function BadgeRow({ badges }: { badges: StudentBadgeCode[] }) {
  if (!badges?.length) return null;
  return (
    <div className="hidden sm:flex flex-wrap gap-1.5 shrink-0">
      {badges.map((b) => (
        <BadgeChip key={b} badge={b} />
      ))}
    </div>
  );
}

/** Versi compact yang tetap muncul di mobile — cuma icon. */
export function BadgeRowCompact({ badges }: { badges: StudentBadgeCode[] }) {
  if (!badges?.length) return null;
  return (
    <div className="flex sm:hidden gap-1 shrink-0">
      {badges.slice(0, 2).map((b) => (
        <BadgeIconOnly key={b} badge={b} />
      ))}
    </div>
  );
}

export function BadgeIconOnly({ badge }: { badge: StudentBadgeCode }) {
  const cfg = BADGE_CONFIG[badge];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span
      title={`${cfg.label} — ${cfg.description}`}
      className={cn(
        'inline-flex items-center justify-center w-7 h-7 rounded-full border bg-gradient-to-br',
        cfg.tone
      )}
    >
      <Icon className="w-3.5 h-3.5" />
    </span>
  );
}

/** Generic award medal for podium / rank labels. */
export function MedalIcon({
  rank,
  className,
}: {
  rank: 1 | 2 | 3;
  className?: string;
}) {
  const tone =
    rank === 1
      ? 'podium-gold'
      : rank === 2
        ? 'podium-silver'
        : 'podium-bronze';
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-display font-bold',
        tone,
        className
      )}
    >
      <Award className="w-1/2 h-1/2" />
    </span>
  );
}
