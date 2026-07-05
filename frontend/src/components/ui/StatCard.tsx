'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: number;
  suffix?: string;
  change?: number;
  icon: React.ReactNode;
  color?: 'primary' | 'success' | 'danger' | 'accent';
}

const colorMap = {
  primary: { text: 'text-primary-400', bg: 'bg-primary-500/10', border: 'border-primary-500/20' },
  success: { text: 'text-success', bg: 'bg-success/10', border: 'border-success/20' },
  danger: { text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/20' },
  accent: { text: 'text-accent-400', bg: 'bg-accent-500/10', border: 'border-accent-500/20' },
};

export function StatCard({ label, value, suffix = '', change, icon, color = 'primary' }: StatCardProps) {
  const numberRef = useRef<HTMLSpanElement>(null);
  const c = colorMap[color];

  useEffect(() => {
    if (!numberRef.current) return;
    const obj = { v: 0 };
    const tween = gsap.to(obj, {
      v: value,
      duration: 1.2,
      ease: 'power2.out',
      delay: 0.2,
      onUpdate: () => {
        if (numberRef.current) numberRef.current.textContent = String(Math.round(obj.v));
      },
    });
    return () => {
      tween.kill();
    };
  }, [value]);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl p-6 bg-surface-raised border transition-all duration-300 group cursor-default hover:border-opacity-60',
        c.border
      )}
    >
      <div className={cn('absolute -right-8 -top-8 w-32 h-32 rounded-full blur-3xl opacity-60 group-hover:opacity-100 transition-opacity duration-500', c.bg)} />
      <div className="flex items-start justify-between mb-4 relative">
        <div className={cn('p-2.5 rounded-lg', c.bg)}>
          <div className={c.text}>{icon}</div>
        </div>
        {change !== undefined && (
          <span
            className={cn(
              'text-xs font-mono font-semibold px-2 py-0.5 rounded-full',
              change >= 0 ? 'text-success bg-success/10' : 'text-danger bg-danger/10'
            )}
          >
            {change >= 0 ? '+' : ''}
            {change}%
          </span>
        )}
      </div>
      <div className="relative">
        <p className="text-text-muted text-sm font-body mb-1">{label}</p>
        <p className="font-display text-4xl font-bold text-text-primary">
          <span ref={numberRef}>0</span>
          {suffix && <span className={cn('text-xl font-medium ml-1', c.text)}>{suffix}</span>}
        </p>
      </div>
    </div>
  );
}
