'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun, Sunrise } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * ThemeToggle dengan circular wipe animation.
 *
 * Perilaku:
 * - Click → animasi lingkaran membesar dari titik klik, warna tema baru
 *   ter-reveal seiring lingkaran mengembang.
 * - Long-press / Right-click → reset ke "auto by time" (06–18 = light, sisanya dark)
 * - Auto-mode aktif kalau user belum pernah set manual (localStorage `theme-manual`)
 *
 * Fallback animasi untuk browser tanpa clip-path:
 * - Smooth color transition 700ms via .theme-transitioning class.
 */

const MANUAL_KEY = 'aethera-theme-manual';

function getAutoTheme(): 'light' | 'dark' {
  const hour = new Date().getHours();
  // Pagi 06:00 - sore 17:59 = light, sisanya dark
  return hour >= 6 && hour < 18 ? 'light' : 'dark';
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isAuto, setIsAuto] = useState(false);

  // Apply auto theme saat mount (kalau user tidak pernah set manual)
  useEffect(() => {
    setMounted(true);

    const isManual = localStorage.getItem(MANUAL_KEY) === '1';
    setIsAuto(!isManual);

    if (!isManual) {
      const autoTheme = getAutoTheme();
      if (resolvedTheme !== autoTheme) {
        setTheme(autoTheme);
      }
    }

    // Re-check setiap 5 menit kalau dalam mode auto
    const intervalId = setInterval(() => {
      if (localStorage.getItem(MANUAL_KEY) !== '1') {
        const autoTheme = getAutoTheme();
        const currentDom = document.documentElement.classList.contains('light') ? 'light' : 'dark';
        if (currentDom !== autoTheme) {
          setTheme(autoTheme);
        }
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update meta theme-color tag untuk PWA status bar kalau theme berubah
  useEffect(() => {
    if (!mounted) return;
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    const isLight = (resolvedTheme || theme) === 'light';
    const color = isLight ? '#fef9f3' : '#050a0f';
    metas.forEach((m) => m.setAttribute('content', color));
  }, [resolvedTheme, theme, mounted]);

  if (!mounted) {
    return (
      <span
        aria-hidden
        className={cn(
          'inline-flex w-9 h-9 rounded-lg bg-surface-raised border border-surface-border',
          className
        )}
      />
    );
  }

  const isLight = (resolvedTheme || theme) === 'light';
  const nextTheme: 'light' | 'dark' = isLight ? 'dark' : 'light';

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    runWipeAnimation(e.clientX, e.clientY, nextTheme, () => {
      setTheme(nextTheme);
    });
    // Tandai user sudah override manual
    localStorage.setItem(MANUAL_KEY, '1');
    setIsAuto(false);
  };

  const handleLongPress = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Reset ke auto mode
    localStorage.removeItem(MANUAL_KEY);
    setIsAuto(true);
    const auto = getAutoTheme();
    const rect = buttonRef.current?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    runWipeAnimation(cx, cy, auto, () => setTheme(auto));
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      onContextMenu={handleLongPress}
      className={cn(
        'relative inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-200 group',
        'border-surface-border bg-surface-raised hover:border-primary-500/40 hover:text-primary-400',
        'text-text-secondary',
        className
      )}
      aria-label={isLight ? 'Aktifkan mode gelap' : 'Aktifkan mode terang'}
      title={
        isAuto
          ? `Mode otomatis (${isLight ? 'siang' : 'malam'}). Klik untuk override • klik kanan untuk reset auto`
          : `Klik: ${isLight ? 'mode gelap' : 'mode terang'} • klik kanan: kembali auto`
      }
    >
      <span className="relative w-4 h-4">
        {/* Sun icon — spins in from below when switching to light */}
        <Sun
          className={cn(
            'absolute inset-0 w-4 h-4 transition-all duration-500',
            isLight
              ? 'opacity-100 rotate-0 scale-100 text-amber-500'
              : 'opacity-0 rotate-[135deg] scale-0'
          )}
          style={isLight ? { filter: 'drop-shadow(0 0 4px rgba(251,146,60,0.8))' } : {}}
        />
        {/* Moon icon — slides in from above when switching to dark */}
        <Moon
          className={cn(
            'absolute inset-0 w-4 h-4 transition-all duration-500',
            !isLight
              ? 'opacity-100 rotate-0 scale-100 text-cyan-400'
              : 'opacity-0 -rotate-[135deg] scale-0'
          )}
          style={!isLight ? { filter: 'drop-shadow(0 0 4px rgba(0,212,212,0.8))' } : {}}
        />
      </span>
      {isAuto && (
        <span
          className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-surface-base"
          aria-label="Mode otomatis aktif"
        />
      )}
    </button>
  );
}

/**
 * Animasi tema: liquid morph blob + particle burst + shimmer wave.
 *
 * Flow:
 * 1. Spawn overlay dengan warna tema TARGET di titik klik
 * 2. Blob mengembang dengan border-radius morphing (bukan circle biasa)
 * 3. Particle burst: 12 titik kecil melesat ke segala arah
 * 4. Shimmer wave: ring cahaya melebar dari titik klik
 * 5. Di tengah animasi (~40%), apply theme → konten di bawah sudah berganti
 * 6. Overlay fade out smooth
 */
function runWipeAnimation(
  x: number,
  y: number,
  toTheme: 'light' | 'dark',
  applyTheme: () => void
) {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    applyTheme();
    document.documentElement.classList.add('theme-transitioning');
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 700);
    return;
  }

  const isToLight = toTheme === 'light';
  const bgColor   = isToLight ? '#fef9f3' : '#050a0f';
  const accentColor = isToLight ? '#f97316' : '#00b8b8';
  const accentGlow  = isToLight
    ? 'rgba(249,115,22,0.7)'
    : 'rgba(0,184,184,0.7)';

  // ── 1. Main blob overlay ──────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = `theme-morph-overlay to-${toTheme}`;
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9998;
    pointer-events: none;
    background: ${bgColor};
    clip-path: circle(0% at ${x}px ${y}px);
    will-change: clip-path, opacity;
  `;
  document.body.appendChild(overlay);

  // ── 2. Shimmer ring (expands outward, fades) ──────────────────────
  const ring = document.createElement('div');
  ring.style.cssText = `
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    border-radius: 50%;
    border: 2px solid ${accentColor};
    box-shadow: 0 0 20px 4px ${accentGlow}, inset 0 0 20px 4px ${accentGlow};
    width: 0px;
    height: 0px;
    left: ${x}px;
    top: ${y}px;
    transform: translate(-50%, -50%);
    opacity: 1;
    will-change: width, height, opacity;
    transition:
      width 900ms cubic-bezier(0.2, 0, 0.1, 1),
      height 900ms cubic-bezier(0.2, 0, 0.1, 1),
      opacity 900ms cubic-bezier(0.4, 0, 1, 1);
  `;
  document.body.appendChild(ring);

  // ── 3. Particle burst ─────────────────────────────────────────────
  const PARTICLE_COUNT = 14;
  const particles: HTMLDivElement[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
    const dist  = 80 + Math.random() * 120;
    const size  = 3 + Math.random() * 5;
    const delay = Math.random() * 80;

    const p = document.createElement('div');
    p.style.cssText = `
      position: fixed;
      z-index: 10000;
      pointer-events: none;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: ${accentColor};
      box-shadow: 0 0 ${size * 2}px ${accentGlow};
      left: ${x}px;
      top: ${y}px;
      transform: translate(-50%, -50%);
      opacity: 0;
      will-change: transform, opacity;
      transition:
        transform ${500 + Math.random() * 300}ms cubic-bezier(0.2, 0.8, 0.3, 1) ${delay}ms,
        opacity ${400 + Math.random() * 200}ms ease ${delay}ms;
    `;
    document.body.appendChild(p);
    particles.push(p);

    // Trigger after reflow
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        p.style.transform = `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) scale(0.2)`;
        p.style.opacity = '0';
      });
    });
  }

  // Trigger particle burst opacity first frame
  requestAnimationFrame(() => {
    particles.forEach(p => { p.style.opacity = '1'; });
  });

  // ── 4. Glow burst (radial flash at click point) ───────────────────
  const burst = document.createElement('div');
  burst.style.cssText = `
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    border-radius: 50%;
    width: 0px;
    height: 0px;
    left: ${x}px;
    top: ${y}px;
    transform: translate(-50%, -50%);
    background: radial-gradient(circle, ${accentGlow} 0%, transparent 70%);
    opacity: 0.9;
    will-change: width, height, opacity;
    transition:
      width 400ms cubic-bezier(0.2, 0, 0.1, 1),
      height 400ms cubic-bezier(0.2, 0, 0.1, 1),
      opacity 400ms ease;
  `;
  document.body.appendChild(burst);

  // ── Kick off all animations ───────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  overlay.offsetWidth; // force reflow

  requestAnimationFrame(() => {
    // Blob expand — morphing border-radius via clip-path
    overlay.style.transition = 'clip-path 900ms cubic-bezier(0.65, 0, 0.2, 1), opacity 300ms ease';
    overlay.style.clipPath = `circle(150% at ${x}px ${y}px)`;

    // Shimmer ring expand
    const maxDim = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    ) * 2.2;
    ring.style.width  = `${maxDim}px`;
    ring.style.height = `${maxDim}px`;
    ring.style.opacity = '0';

    // Glow burst
    burst.style.width  = '300px';
    burst.style.height = '300px';
    burst.style.opacity = '0';
  });

  // Apply theme at ~40% of animation
  document.documentElement.classList.add('theme-transitioning');
  setTimeout(applyTheme, 360);

  // Fade overlay out after blob fully covers screen
  setTimeout(() => {
    overlay.style.opacity = '0';
  }, 820);

  // Cleanup everything
  setTimeout(() => {
    overlay.remove();
    ring.remove();
    burst.remove();
    particles.forEach(p => p.remove());
    document.documentElement.classList.remove('theme-transitioning');
  }, 1200);
}
