'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { gsap } from 'gsap';
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  Filter,
  HeartHandshake,
  ShieldCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { fetchWatchlist } from '@/lib/disciplineApi';
import { cn } from '@/lib/utils';

/**
 * Early Warning Dashboard untuk guru BK / wali kelas / kepsek.
 *
 * Menampilkan siswa yang butuh perhatian:
 * - Poin sikap di bawah threshold (default 60)
 * - Telat berulang dalam window tertentu (default 3x dalam 7 hari)
 *
 * Filter dapat di-tweak supaya guru bisa lebih atau kurang ketat.
 */
export default function WatchlistPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [thresholdAttitude, setThresholdAttitude] = useState(60);
  const [thresholdLate, setThresholdLate] = useState(3);
  const [days, setDays] = useState(7);

  const { data: watchlist = [], isLoading } = useQuery({
    queryKey: ['watchlist', thresholdAttitude, thresholdLate, days],
    queryFn: () =>
      fetchWatchlist({
        threshold_attitude: thresholdAttitude,
        threshold_late_count: thresholdLate,
        days,
      }),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.wl-card',
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.04, ease: 'power2.out' }
      );
    }, containerRef);
    return () => ctx.revert();
  }, [watchlist.length]);

  return (
    <div ref={containerRef} className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Eye className="w-5 h-5 text-amber-400" />
          <span className="font-mono text-2xs uppercase tracking-widest text-amber-400">
            Early Warning
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">
          Watch List Siswa
        </h1>
        <p className="font-body text-text-muted mt-1">
          Siswa yang butuh perhatian — proaktif, bukan reaktif. Filter di bawah
          untuk sesuaikan tingkat sensitivitas.
        </p>
      </div>

      {/* Filter */}
      <Card padding="md">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-text-muted" />
          <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">
            Filter Ketat
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FilterField
            label="Sikap di bawah"
            value={thresholdAttitude}
            onChange={setThresholdAttitude}
            min={0}
            max={100}
            suffix="poin"
          />
          <FilterField
            label="Telat ≥"
            value={thresholdLate}
            onChange={setThresholdLate}
            min={1}
            max={20}
            suffix="kali"
          />
          <FilterField
            label="Window"
            value={days}
            onChange={setDays}
            min={1}
            max={60}
            suffix="hari terakhir"
          />
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryStat
          icon={<AlertTriangle className="w-5 h-5" />}
          label="Total Watch List"
          value={watchlist.length}
          tone="text-amber-400 bg-amber-500/10 border-amber-500/30"
        />
        <SummaryStat
          icon={<ShieldCheck className="w-5 h-5" />}
          label="Sikap Kritis (<40)"
          value={watchlist.filter((w) => w.attitude_points < 40).length}
          tone="text-danger bg-danger/10 border-danger/30"
        />
        <SummaryStat
          icon={<HeartHandshake className="w-5 h-5" />}
          label="Bisa Diapresiasi"
          value={watchlist.filter((w) => w.appreciation_points >= 50).length}
          tone="text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
        />
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading && (
          <p className="text-center font-body text-text-muted py-8">
            Memuat watch list...
          </p>
        )}
        {!isLoading && watchlist.length === 0 && (
          <Card padding="lg" className="text-center">
            <ShieldCheck className="w-12 h-12 text-success mx-auto mb-3" />
            <p className="font-display font-semibold text-text-primary">
              Tidak ada siswa di watch list
            </p>
            <p className="font-body text-sm text-text-muted mt-1">
              Semua siswa di atas threshold yang ditetapkan. Mantap!
            </p>
          </Card>
        )}
        {watchlist.map((s) => {
          const attTone =
            s.attitude_points >= 80
              ? 'text-success'
              : s.attitude_points >= 60
                ? 'text-accent-400'
                : s.attitude_points >= 40
                  ? 'text-orange-400'
                  : 'text-danger';
          return (
            <Link
              key={s.user_id}
              href={`/student-status/${s.user_id}`}
              className="wl-card block group"
            >
              <Card
                padding="md"
                className="hover:border-amber-500/40 transition-all"
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    name={s.full_name}
                    src={s.photo_url ?? undefined}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold text-base truncate group-hover:text-amber-300 transition-colors">
                      {s.full_name}
                    </p>
                    <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">
                      {s.employee_id} · {s.class_name ?? '—'}
                    </p>
                  </div>

                  <div className="hidden sm:flex items-center gap-4">
                    <Metric label="Sikap" value={s.attitude_points} tone={attTone} />
                    <Metric
                      label="GPA"
                      value={s.gpa.toFixed(1)}
                      tone="text-primary-300"
                    />
                    <Metric
                      label="Streak"
                      value={`${s.streak_days}h`}
                      tone={s.streak_days >= 7 ? 'text-rose-400' : 'text-text-secondary'}
                    />
                  </div>

                  <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-amber-300 group-hover:translate-x-1 transition-all" />
                </div>

                {/* Mobile metric strip */}
                <div className="sm:hidden grid grid-cols-3 gap-2 mt-3">
                  <Metric label="Sikap" value={s.attitude_points} tone={attTone} small />
                  <Metric
                    label="GPA"
                    value={s.gpa.toFixed(1)}
                    tone="text-primary-300"
                    small
                  />
                  <Metric
                    label="Streak"
                    value={`${s.streak_days}h`}
                    tone={s.streak_days >= 7 ? 'text-rose-400' : 'text-text-secondary'}
                    small
                  />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function FilterField({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <div>
      <label className="block font-mono text-2xs uppercase tracking-widest text-text-muted mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={(e) =>
            onChange(Math.max(min, Math.min(max, Number(e.target.value))))
          }
          min={min}
          max={max}
          className="w-full font-display font-semibold text-text-primary bg-surface-base border border-surface-border rounded-lg px-3 py-2.5 pr-20 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-2xs text-text-muted">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function SummaryStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <Card padding="md" className={cn('border', tone.split(' ').slice(1).join(' '))}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'inline-flex items-center justify-center w-10 h-10 rounded-lg',
            tone
          )}
        >
          {icon}
        </span>
        <div>
          <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">
            {label}
          </p>
          <p className={cn('font-display font-bold text-2xl', tone.split(' ')[0])}>
            {value}
          </p>
        </div>
      </div>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string | number;
  tone?: string;
  small?: boolean;
}) {
  return (
    <div className={cn('text-center', small ? 'rounded-lg bg-surface-base/40 border border-surface-border py-1.5' : '')}>
      <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">
        {label}
      </p>
      <p className={cn('font-display font-bold', small ? 'text-base' : 'text-lg', tone)}>
        {value}
      </p>
    </div>
  );
}
