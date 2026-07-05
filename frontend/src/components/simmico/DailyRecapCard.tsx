'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Award, Clock, Sparkles, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import type { DailyRecap } from '@/lib/disciplineApi';
import { cn } from '@/lib/utils';

interface DailyRecapCardProps {
  recap: DailyRecap;
}

/**
 * Mini-Wrapped harian — gaya Spotify Wrapped tapi tiap hari.
 * Dipakai di Status Saya untuk kasih dopamine kecil tiap buka aplikasi.
 */
export function DailyRecapCard({ recap }: DailyRecapCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.recap-stat',
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: 'power2.out' }
      );
    }, containerRef);
    return () => ctx.revert();
  }, [recap.headline]);

  const stats: { icon: React.ReactNode; label: string; value: string; tone: string }[] = [];

  if (recap.arrival_offset_min !== null && recap.arrival_offset_min !== undefined) {
    const min = recap.arrival_offset_min;
    stats.push({
      icon: <Clock className="w-4 h-4" />,
      label: 'Kedatangan',
      value: min <= 0 ? `${Math.abs(min)} menit lebih awal` : `${min} menit telat`,
      tone: min <= -5 ? 'text-success' : min <= 0 ? 'text-primary-300' : 'text-accent-400',
    });
  }

  if (recap.class_rank_today && recap.class_size_today) {
    stats.push({
      icon: <TrendingUp className="w-4 h-4" />,
      label: 'Urutan masuk',
      value: `Ke-${recap.class_rank_today} dari ${recap.class_size_today}`,
      tone: recap.class_rank_today <= 3 ? 'text-amber-400' : 'text-text-secondary',
    });
  }

  if (recap.streak_days > 0) {
    stats.push({
      icon: <Sparkles className="w-4 h-4" />,
      label: 'Streak',
      value: `${recap.streak_days} hari aktif`,
      tone: 'text-rose-400',
    });
  }

  return (
    <Card padding="lg" variant="glow" className="relative overflow-hidden">
      <div className="absolute -left-12 -top-12 w-48 h-48 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

      <div ref={containerRef} className="relative">
        <div className="flex items-center gap-2 mb-3">
          <Award className="w-4 h-4 text-amber-400" />
          <p className="font-mono text-2xs uppercase tracking-widest text-amber-400">
            Recap Hari Ini
          </p>
        </div>

        <p className="font-display font-bold text-lg sm:text-xl leading-snug text-text-primary mb-4">
          {recap.headline}
        </p>

        {stats.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {stats.map((s, i) => (
              <div
                key={i}
                className="recap-stat rounded-lg border border-surface-border bg-surface-base/40 p-3"
              >
                <span className="inline-flex items-center gap-1 font-mono text-2xs uppercase tracking-widest text-text-muted">
                  {s.icon}
                  {s.label}
                </span>
                <p className={cn('font-display font-semibold text-sm mt-1', s.tone)}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
