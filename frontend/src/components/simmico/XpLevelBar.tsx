'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Sparkles, Zap } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

interface XpLevelBarProps {
  /** Subset gamifikasi dari student summary. Semua field optional
   *  karena ada endpoint list yang skip kalkulasi XP untuk speed. */
  data: {
    xp_total?: number | null;
    level_code?: string | null;
    level_title?: string | null;
    level_color?: string | null;
    next_level_title?: string | null;
    xp_to_next?: number | null;
    progress_percent?: number | null;
  };
}

/**
 * Level + XP bar gaya RPG.
 * - Animated counter untuk XP total
 * - Progress bar dengan shimmer ketika full
 * - Badge level dengan color hint dari backend
 */
export function XpLevelBar({ data }: XpLevelBarProps) {
  const xpRef = useRef<HTMLSpanElement>(null);
  const xp = data.xp_total ?? 0;
  const percent = data.progress_percent ?? 0;
  const isMaxed = !data.next_level_title;

  useEffect(() => {
    if (!xpRef.current) return;
    const obj = { v: 0 };
    const tween = gsap.to(obj, {
      v: xp,
      duration: 1.0,
      ease: 'power2.out',
      onUpdate: () => {
        if (xpRef.current) xpRef.current.textContent = String(Math.round(obj.v));
      },
    });
    return () => {
      tween.kill();
    };
  }, [xp]);

  return (
    <Card padding="lg" variant="glow" className="relative overflow-hidden">
      <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-primary-500/10 blur-3xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mb-1">
              Level Disiplin
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 font-display font-bold text-base px-3 py-1 rounded-full border',
                  data.level_color ?? 'bg-primary-500/20 text-primary-300 border-primary-500/40'
                )}
              >
                <Sparkles className="w-4 h-4" />
                {data.level_title ?? 'Pemula'}
              </span>
              {!isMaxed && data.next_level_title && (
                <span className="font-mono text-2xs text-text-muted">
                  → {data.next_level_title}
                </span>
              )}
            </div>
          </div>

          <div className="text-right shrink-0">
            <p className="font-display text-3xl sm:text-4xl font-bold text-primary-300">
              <span ref={xpRef}>0</span>
              <span className="text-base font-medium text-text-muted ml-1">XP</span>
            </p>
            {!isMaxed && data.xp_to_next != null && (
              <p className="font-mono text-2xs text-text-muted mt-0.5">
                <Zap className="inline w-3 h-3" /> {data.xp_to_next} XP lagi
              </p>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative h-2 rounded-full bg-surface-overlay overflow-hidden">
          <span
            className={cn(
              'absolute inset-y-0 left-0 bg-gradient-to-r from-primary-500 via-primary-400 to-success transition-[width] duration-700',
              isMaxed && 'animate-shimmer bg-[length:200%_auto]'
            )}
            style={{ width: `${isMaxed ? 100 : percent}%` }}
          />
        </div>
        <p className="font-mono text-2xs text-text-muted text-right mt-1">
          {isMaxed ? '★ MAX LEVEL ★' : `${percent.toFixed(0)}% menuju level berikutnya`}
        </p>
      </div>
    </Card>
  );
}
