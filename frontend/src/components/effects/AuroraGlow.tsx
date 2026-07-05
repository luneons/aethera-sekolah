'use client';

/**
 * AuroraGlow — multi-layer animated radial gradients yang gerakannya organik.
 * Pure CSS-only, gak butuh WebGL. Cocok buat bg dekoratif belakang konten utama.
 */
import { useEffect, useRef } from 'react';

interface Props {
  className?: string;
  colors?: string[]; // 2-4 warna
  speed?: number; // 0.5-2
  intensity?: number; // 0-1
}

export function AuroraGlow({
  className,
  colors = ['#fb923c', '#f59e0b', '#0ea5e9', '#8b5cf6'],
  speed = 1,
  intensity = 0.6,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    let raf = 0;
    const animate = () => {
      frame += 0.01 * speed;
      // Setiap blob punya pola gerak elliptic dengan offset fase
      const blobs = el.querySelectorAll<HTMLDivElement>('.aurora-blob');
      blobs.forEach((b, i) => {
        const phase = i * (Math.PI * 2 / blobs.length);
        const x = 50 + Math.sin(frame + phase) * 25;
        const y = 50 + Math.cos(frame * 0.7 + phase * 1.3) * 20;
        b.style.transform = `translate3d(${x}%, ${y}%, 0)`;
      });
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [speed]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        opacity: intensity,
      }}
      aria-hidden
    >
      {colors.map((c, i) => (
        <div
          key={i}
          className="aurora-blob"
          style={{
            position: 'absolute',
            top: '-25%',
            left: '-25%',
            width: '60%',
            height: '60%',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${c} 0%, transparent 70%)`,
            filter: 'blur(60px)',
            opacity: 0.55,
            mixBlendMode: 'screen',
            willChange: 'transform',
            transition: 'transform 50ms linear',
          }}
        />
      ))}
    </div>
  );
}
