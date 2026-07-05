'use client';

import { useEffect, useMemo, useRef } from 'react';
import { gsap } from 'gsap';
import { Activity, AlertTriangle, Flame } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import type { HeatmapData } from '@/lib/disciplineApi';
import { cn } from '@/lib/utils';

interface DisciplineHeatmapProps {
  data: HeatmapData;
}

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
const HOURS = [6, 7, 8, 9, 10, 11, 12];

/**
 * Heatmap pola disiplin: hari × jam dengan intensitas warna sesuai
 * jumlah keterlambatan. Membantu kepsek melihat pola: kapan paling
 * sering telat, kapan paling banyak insiden.
 */
export function DisciplineHeatmap({ data }: DisciplineHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { grid, maxLate } = useMemo(() => {
    const cells: Record<string, number> = {};
    let maxL = 0;
    for (const c of data.grid) {
      cells[`${c.day_of_week}-${c.hour}`] = c.late_count;
      if (c.late_count > maxL) maxL = c.late_count;
    }
    return { grid: cells, maxLate: maxL };
  }, [data]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.heatmap-cell',
        { opacity: 0, scale: 0.9 },
        { opacity: 1, scale: 1, duration: 0.4, stagger: 0.01, ease: 'power2.out' }
      );
    }, containerRef);
    return () => ctx.revert();
  }, [data.grid.length]);

  function cellTone(count: number): string {
    if (maxLate === 0) return 'bg-surface-base/40 border-surface-border';
    const ratio = count / maxLate;
    if (ratio === 0) return 'bg-surface-base/40 border-surface-border text-text-muted';
    if (ratio < 0.25) return 'bg-amber-500/15 border-amber-500/30 text-amber-300';
    if (ratio < 0.5) return 'bg-amber-500/30 border-amber-500/50 text-amber-200';
    if (ratio < 0.75) return 'bg-orange-500/40 border-orange-500/60 text-orange-100';
    return 'bg-rose-500/60 border-rose-500/80 text-white';
  }

  return (
    <Card padding="lg">
      <div ref={containerRef}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 role-accent-text" />
              <h3 className="font-display font-semibold text-base">
                Heatmap Pola Disiplin
              </h3>
            </div>
            <p className="font-body text-sm text-text-muted">
              Hari × jam — intensitas keterlambatan 30 hari terakhir
            </p>
          </div>
        </div>

        {/* Insights */}
        {(data.peak_late_day || data.peak_incident_day) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
            {data.peak_late_day && data.peak_late_hour !== null && data.peak_late_hour !== undefined && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <Flame className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-mono text-2xs uppercase tracking-widest text-amber-300">
                    Jam paling sering telat
                  </p>
                  <p className="font-display font-bold text-sm text-text-primary">
                    {data.peak_late_day}, jam {String(data.peak_late_hour).padStart(2, '0')}:00
                  </p>
                </div>
              </div>
            )}
            {data.peak_incident_day && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-mono text-2xs uppercase tracking-widest text-rose-300">
                    Hari paling banyak insiden
                  </p>
                  <p className="font-display font-bold text-sm text-text-primary">
                    {data.peak_incident_day}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Grid */}
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            {/* Header jam */}
            <div className="grid gap-1" style={{ gridTemplateColumns: `64px repeat(${HOURS.length}, minmax(48px, 1fr))` }}>
              <div />
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="text-center font-mono text-2xs uppercase tracking-widest text-text-muted py-1"
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>
            {/* Rows */}
            {DAYS.map((label, dow) => (
              <div
                key={label}
                className="grid gap-1 mt-1"
                style={{ gridTemplateColumns: `64px repeat(${HOURS.length}, minmax(48px, 1fr))` }}
              >
                <div className="font-mono text-2xs uppercase tracking-widest text-text-muted py-2 pr-1 text-right self-center">
                  {label}
                </div>
                {HOURS.map((hour) => {
                  const count = grid[`${dow}-${hour}`] ?? 0;
                  return (
                    <div
                      key={hour}
                      className={cn(
                        'heatmap-cell aspect-square min-h-[44px] rounded-md border flex items-center justify-center font-mono text-sm font-bold transition-colors hover:scale-105',
                        cellTone(count)
                      )}
                      title={`${label} ${String(hour).padStart(2, '0')}:00 — ${count} kasus telat`}
                    >
                      {count > 0 ? count : ''}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-2 mt-4">
          <span className="font-mono text-2xs uppercase tracking-widest text-text-muted">
            Lebih Sedikit
          </span>
          {[0, 0.2, 0.4, 0.6, 0.8].map((r) => (
            <div
              key={r}
              className={cn(
                'w-5 h-5 rounded border',
                cellTone(Math.round(r * Math.max(maxLate, 1)))
              )}
            />
          ))}
          <span className="font-mono text-2xs uppercase tracking-widest text-text-muted">
            Lebih Banyak
          </span>
        </div>
      </div>
    </Card>
  );
}
