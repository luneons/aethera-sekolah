'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface MetricRingProps {
  value: number;
  label: string;
  tone?: 'success' | 'warning' | 'danger' | 'primary' | 'rose' | 'amber';
  suffix?: string;
  size?: number;
}

const TONE_MAP = {
  success: { stroke: '#00e676', glow: 'rgba(0,230,118,0.3)' },
  warning: { stroke: '#ffc107', glow: 'rgba(255,193,7,0.3)' },
  danger: { stroke: '#ff1744', glow: 'rgba(255,23,68,0.3)' },
  primary: { stroke: '#00d4d4', glow: 'rgba(0,212,212,0.3)' },
  rose: { stroke: '#f43f5e', glow: 'rgba(244,63,94,0.3)' },
  amber: { stroke: '#f59e0b', glow: 'rgba(245,158,11,0.3)' },
};

/**
 * Progress ring (gauge) — circular SVG dengan animasi count-up.
 * Pure CSS animation, tanpa GSAP.
 */
export function MetricRing({
  value,
  label,
  tone = 'primary',
  suffix = '%',
  size = 120,
}: MetricRingProps) {
  const [animated, setAnimated] = useState(false);
  const [displayValue, setDisplayValue] = useState(0);
  const t = TONE_MAP[tone];

  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  const clampedValue = Math.max(0, Math.min(100, value));
  const offset = circumference - (clampedValue / 100) * circumference;

  // Trigger CSS transition
  useEffect(() => {
    const id = window.setTimeout(() => setAnimated(true), 50);
    return () => window.clearTimeout(id);
  }, [clampedValue]);

  // Count-up text animation
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const duration = 900;
    const tick = (now: number) => {
      const elapsed = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 3); // easeOutCubic
      setDisplayValue(clampedValue * eased);
      if (elapsed < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clampedValue]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(26, 48, 69, 0.4)"
            strokeWidth={8}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={t.stroke}
            strokeWidth={8}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={animated ? offset : circumference}
            style={{
              filter: `drop-shadow(0 0 8px ${t.glow})`,
              transition: 'stroke-dashoffset 0.9s cubic-bezier(0.33, 1, 0.68, 1)',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-display font-bold text-2xl" style={{ color: t.stroke }}>
            {Math.round(displayValue)}
            {suffix && (
              <span className="text-base font-medium opacity-70 ml-0.5">{suffix}</span>
            )}
          </p>
        </div>
      </div>
      <p className={cn('font-mono text-2xs uppercase tracking-widest text-text-muted text-center')}>
        {label}
      </p>
    </div>
  );
}
