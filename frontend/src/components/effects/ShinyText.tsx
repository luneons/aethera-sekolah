'use client';

/**
 * ShinyText — animated gradient sweep text effect.
 * Pakai untuk hero title supaya kerasa premium.
 */
import { cn } from '@/lib/utils';

interface Props {
  children: React.ReactNode;
  className?: string;
  /** Durasi animasi sweep dalam detik */
  duration?: number;
  /** Warna utama (default mengikuti theme) */
  baseColor?: string;
  shineColor?: string;
}

export function ShinyText({
  children,
  className,
  duration = 4,
  baseColor,
  shineColor = 'rgba(255, 255, 255, 0.85)',
}: Props) {
  return (
    <span
      className={cn('shiny-text', className)}
      style={{
        backgroundImage: baseColor
          ? `linear-gradient(110deg, ${baseColor} 30%, ${shineColor} 50%, ${baseColor} 70%)`
          : `linear-gradient(110deg, currentColor 30%, ${shineColor} 50%, currentColor 70%)`,
        backgroundSize: '200% 100%',
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        animation: `shineSweep ${duration}s linear infinite`,
      }}
    >
      {children}
      <style jsx>{`
        @keyframes shineSweep {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
      `}</style>
    </span>
  );
}
