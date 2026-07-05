'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Heart, HeartPulse } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import {
  fetchClassNames,
  fetchMoodAggregate,
} from '@/lib/disciplineApi';
import { cn, formatDate } from '@/lib/utils';

const PERIODS = [
  { days: 7, label: '7 hari' },
  { days: 14, label: '14 hari' },
  { days: 30, label: '30 hari' },
];

const MOOD_META = [
  { value: 5, emoji: '😄', label: 'Senang Sekali', tone: 'text-emerald-400' },
  { value: 4, emoji: '🙂', label: 'Baik', tone: 'text-cyan-400' },
  { value: 3, emoji: '😐', label: 'Biasa', tone: 'text-text-secondary' },
  { value: 2, emoji: '😟', label: 'Kurang Baik', tone: 'text-amber-400' },
  { value: 1, emoji: '😢', label: 'Sedih', tone: 'text-rose-400' },
];

/**
 * Mood Tracker — guru BK lihat agregat mood siswa per kelas / sekolah.
 * Privasi siswa terjaga: tidak ada data individual yang ditampilkan.
 */
export default function MoodTrackerPage() {
  const [days, setDays] = useState(7);
  const [classFilter, setClassFilter] = useState<string>('all');

  const { data: classNames } = useQuery({
    queryKey: ['discipline-classes'],
    queryFn: fetchClassNames,
    staleTime: 5 * 60 * 1000,
  });

  const { data: agg, isLoading } = useQuery({
    queryKey: ['mood-aggregate', days, classFilter],
    queryFn: () =>
      fetchMoodAggregate(days, classFilter === 'all' ? undefined : classFilter),
    refetchInterval: 60_000,
  });

  const classOptions = ['all', ...(classNames ?? [])];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Heart className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Konseling
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">
          Mood Tracker
        </h1>
        <p className="font-body text-text-muted mt-1">
          Agregat suasana hati siswa — privasi individu tetap terjaga, hanya data ringkasan.
        </p>
      </div>

      <Card padding="md" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block font-mono text-2xs uppercase tracking-widest text-text-muted mb-1.5">
            Periode
          </label>
          <div className="inline-flex rounded-lg border border-surface-border p-1 bg-surface-base">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setDays(p.days)}
                className={cn(
                  'px-3 py-1.5 text-sm font-display font-semibold rounded-md transition-all',
                  days === p.days
                    ? 'role-accent-bg-soft role-accent-text'
                    : 'text-text-muted hover:text-text-secondary'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block font-mono text-2xs uppercase tracking-widest text-text-muted mb-1.5">
            Kelas
          </label>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="bg-surface-base border border-surface-border rounded-lg px-3 py-2 text-sm font-body text-text-primary focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
          >
            {classOptions.map((c) => (
              <option key={c} value={c}>
                {c === 'all' ? 'Semua Kelas' : c}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {isLoading || !agg ? (
        <p className="text-center font-body text-text-muted py-12">
          Memuat data mood...
        </p>
      ) : agg.total_checkins === 0 ? (
        <Card padding="lg" className="text-center">
          <HeartPulse className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="font-display font-semibold">Belum ada check-in mood</p>
          <p className="font-body text-sm text-text-muted mt-1">
            Siswa belum mulai mood check-in di periode ini.
          </p>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card padding="md">
              <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mb-1">
                Total Check-in
              </p>
              <p className="font-display font-bold text-3xl role-accent-text">
                {agg.total_checkins}
              </p>
              <p className="font-mono text-2xs text-text-muted mt-1">
                {formatDate(agg.period_start)} — {formatDate(agg.period_end)}
              </p>
            </Card>
            <Card padding="md">
              <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mb-1">
                Rata-Rata Mood
              </p>
              <p className="font-display font-bold text-3xl">
                {agg.avg_mood.toFixed(2)}
                <span className="text-base font-medium text-text-muted">/5</span>
              </p>
              <MoodLabel value={agg.avg_mood} />
            </Card>
            <Card padding="md">
              <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mb-1">
                Indikator
              </p>
              <p
                className={cn(
                  'font-display font-bold text-2xl mt-1',
                  agg.avg_mood >= 4
                    ? 'text-success'
                    : agg.avg_mood >= 3
                      ? 'text-amber-400'
                      : 'text-rose-400'
                )}
              >
                {agg.avg_mood >= 4 ? 'Sehat' : agg.avg_mood >= 3 ? 'Stabil' : 'Perlu Perhatian'}
              </p>
            </Card>
          </div>

          {/* Distribution */}
          <Card padding="lg">
            <h3 className="font-display font-semibold text-lg mb-4">
              Distribusi Mood
            </h3>
            <div className="space-y-2">
              {MOOD_META.map((m) => {
                const count = agg.distribution[String(m.value)] ?? 0;
                const pct = agg.total_checkins ? (count / agg.total_checkins) * 100 : 0;
                return (
                  <div key={m.value} className="flex items-center gap-3">
                    <span className="text-2xl shrink-0 w-8 text-center">
                      {m.emoji}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className={cn('font-display font-semibold text-sm', m.tone)}>
                          {m.label}
                        </span>
                        <span className="font-mono text-2xs text-text-muted">
                          {count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-overlay overflow-hidden">
                        <span
                          className={cn(
                            'block h-full transition-all duration-700',
                            m.value === 5
                              ? 'bg-emerald-500'
                              : m.value === 4
                                ? 'bg-cyan-500'
                                : m.value === 3
                                  ? 'bg-text-secondary'
                                  : m.value === 2
                                    ? 'bg-amber-500'
                                    : 'bg-rose-500'
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function MoodLabel({ value }: { value: number }) {
  const closest = MOOD_META.reduce((a, b) =>
    Math.abs(a.value - value) < Math.abs(b.value - value) ? a : b
  );
  return (
    <p className={cn('font-mono text-2xs uppercase tracking-widest mt-1', closest.tone)}>
      {closest.emoji} {closest.label}
    </p>
  );
}
