'use client';

import { cn } from '@/lib/utils';

interface DonutChartProps {
  data: { label: string; count: number; color?: string }[];
  total?: number;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}

const DEFAULT_PALETTE = [
  '#00e676', '#00d4d4', '#ffc107', '#ff6f00',
  '#ff1744', '#9c27b0', '#e91e63', '#3f51b5',
];

/**
 * Donut chart pure SVG. Tanpa GSAP — pakai stroke-dashoffset CSS
 * transition supaya selalu render benar.
 */
export function DonutChart({
  data,
  total,
  size = 180,
  thickness = 22,
  centerLabel,
  centerValue,
}: DonutChartProps) {
  const sumValue = data.reduce((s, d) => s + d.count, 0);
  const denominator = total ?? sumValue ?? 1;
  const radius = size / 2 - thickness / 2;
  const circumference = 2 * Math.PI * radius;

  let cumulative = 0;
  const segments = data.map((d, i) => {
    const ratio = sumValue > 0 ? d.count / sumValue : 0;
    const length = ratio * circumference;
    const offset = -cumulative;
    cumulative += length;
    return {
      ...d,
      color: d.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
      length,
      offset,
    };
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#1a3045"
            strokeWidth={thickness}
            fill="none"
            opacity={0.5}
          />
          {sumValue > 0 &&
            segments.map((s, i) => (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={s.color}
                strokeWidth={thickness}
                fill="none"
                strokeLinecap="butt"
                strokeDasharray={`${s.length} ${circumference}`}
                strokeDashoffset={s.offset}
                style={{ transition: 'stroke-dasharray 0.7s ease-out' }}
              />
            ))}
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          {centerValue !== undefined && (
            <p className="font-display font-bold text-2xl text-text-primary">
              {centerValue}
            </p>
          )}
          {centerLabel && (
            <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">
              {centerLabel}
            </p>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex-1 min-w-0 space-y-1.5 w-full sm:w-auto">
        {sumValue === 0 ? (
          <p className="font-body text-sm text-text-muted">Belum ada data.</p>
        ) : (
          segments.map((s, i) => {
            const pct = sumValue > 0 ? (s.count / sumValue) * 100 : 0;
            return (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="font-body text-sm text-text-secondary flex-1 truncate">
                  {s.label}
                </span>
                <span className="font-mono text-2xs text-text-muted">
                  {s.count} <span className="opacity-60">({pct.toFixed(0)}%)</span>
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
