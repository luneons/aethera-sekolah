/**
 * Confetti celebration tanpa library eksternal.
 *
 * Render via canvas overlay. Auto-cleanup setelah animasi selesai
 * sehingga tidak meninggalkan node permanen di DOM.
 */

interface CelebrationOpts {
  intensity?: 'normal' | 'epic';
  durationMs?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  shape: 'rect' | 'circle';
  opacity: number;
}

const COLORS = ['#00f2f2', '#00e676', '#ffc107', '#ff6f00', '#ff1744', '#e91e63', '#9c27b0', '#3f51b5'];

export function triggerCelebration(opts: CelebrationOpts = {}) {
  if (typeof window === 'undefined') return;

  const intensity = opts.intensity ?? 'normal';
  const durationMs = opts.durationMs ?? (intensity === 'epic' ? 2400 : 1600);
  const count = intensity === 'epic' ? 180 : 90;

  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '99999';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }

  // Burst dari dua titik di kiri-bawah & kanan-bawah, mirip cannon confetti.
  const particles: Particle[] = [];
  const launchFromLeft = (n: number) => {
    for (let i = 0; i < n; i++) {
      particles.push(makeParticle(50, canvas.height - 30, -Math.PI / 4 + (Math.random() - 0.5) * 0.5));
    }
  };
  const launchFromRight = (n: number) => {
    for (let i = 0; i < n; i++) {
      particles.push(
        makeParticle(canvas.width - 50, canvas.height - 30, -Math.PI - (-Math.PI / 4 + (Math.random() - 0.5) * 0.5))
      );
    }
  };

  launchFromLeft(count / 2);
  launchFromRight(count / 2);

  // Untuk epic: burst tambahan dari tengah-atas
  if (intensity === 'epic') {
    setTimeout(() => {
      for (let i = 0; i < 60; i++) {
        particles.push(
          makeParticle(canvas.width / 2, canvas.height / 3, -Math.PI / 2 + (Math.random() - 0.5) * Math.PI)
        );
      }
    }, 400);
  }

  const startTime = performance.now();
  let rafId = 0;

  const tick = (now: number) => {
    const elapsed = now - startTime;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      // Physics
      p.vy += 0.3; // gravity
      p.vx *= 0.99; // air drag
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      // Fade out di akhir
      if (elapsed > durationMs - 600) {
        p.opacity = Math.max(0, p.opacity - 0.02);
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (elapsed < durationMs && particles.some((p) => p.opacity > 0 && p.y < canvas.height + 50)) {
      rafId = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(rafId);
      canvas.remove();
    }
  };

  rafId = requestAnimationFrame(tick);
}

function makeParticle(originX: number, originY: number, angle: number): Particle {
  const speed = 12 + Math.random() * 10;
  return {
    x: originX,
    y: originY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size: 6 + Math.random() * 8,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.3,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
    opacity: 1,
  };
}
