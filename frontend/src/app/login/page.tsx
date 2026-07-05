'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { gsap } from 'gsap';
import dynamic from 'next/dynamic';
import {
  ArrowRight,
  Award,
  GraduationCap,
  Heart,
  Lock,
  Mail,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage, type Envelope } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { useAuthStore, type AuthUser } from '@/stores/useAuthStore';
import { AuroraGlow } from '@/components/effects/AuroraGlow';
import { FloatingParticles } from '@/components/effects/FloatingParticles';
import { ShinyText } from '@/components/effects/ShinyText';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

// Lazy-load WebGL component
const MagicRings = dynamic(() => import('@/components/effects/MagicRings'), {
  ssr: false,
  loading: () => null,
});

interface LoginResponse {
  requires_2fa?: boolean;
  challenge_token?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number;
}

const HIGHLIGHTS = [
  { icon: ScanFace, title: 'Absensi AI', desc: 'ArcFace 99% akurasi' },
  { icon: GraduationCap, title: 'LMS & Rapor', desc: 'PDF auto-generate' },
  { icon: Heart, title: 'Konseling BK', desc: 'Booking + anonim' },
  { icon: Trophy, title: 'Disiplin', desc: 'Poin sikap & apresiasi' },
  { icon: Users, title: 'Portal Ortu', desc: 'Real-time data anak' },
  { icon: Sparkles, title: 'AI Insight', desc: 'KPI summary AI' },
];

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (accessToken) router.replace('/dashboard');
  }, [accessToken, router]);

  useEffect(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    if (heroRef.current) {
      tl.fromTo(
        heroRef.current.querySelectorAll('.hero-anim'),
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.7, stagger: 0.1 }
      );
    }
    if (cardRef.current) {
      tl.fromTo(
        cardRef.current,
        { opacity: 0, y: 24, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.7 },
        '-=0.4'
      );
    }
    if (heroRef.current) {
      tl.fromTo(
        heroRef.current.querySelectorAll('.feat-card'),
        { opacity: 0, y: 16, scale: 0.92 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.05 },
        '-=0.3'
      );
    }
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.post<Envelope<LoginResponse>>('/auth/login', {
        email,
        password,
      });
      const data = r.data.data!;

      if (data.requires_2fa && data.challenge_token) {
        setChallengeToken(data.challenge_token);
        toast.message('Masukkan kode 2FA dari aplikasi authenticator');
        return;
      }

      if (!data.access_token || !data.refresh_token) {
        throw new Error('Login response tidak valid');
      }

      // Bersihkan sisa state akun sebelumnya (cache React Query + user lama)
      // supaya tidak ada data nyangkut saat ganti akun di tab yang sama.
      clear();
      queryClient.clear();

      setSession({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });

      const meRes = await api.get<Envelope<AuthUser>>('/auth/me', {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const me = meRes.data.data;
      if (me) setUser(me);
      const role = me?.role;

      // Minta izin notifikasi — user sudah gesture (klik submit), browser izinkan
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }

      toast.success('Login berhasil');
      router.push(role === 'employee' ? '/my-attendance' : '/dashboard');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const onSubmit2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeToken) return;
    setLoading(true);
    try {
      const r = await api.post<Envelope<LoginResponse>>('/auth/login-2fa', {
        challenge_token: challengeToken,
        code: twoFaCode.trim(),
        use_recovery: useRecovery,
      });
      const data = r.data.data!;
      if (!data.access_token || !data.refresh_token) {
        throw new Error('2FA response tidak valid');
      }
      // Bersihkan sisa state akun sebelumnya sebelum set sesi baru.
      clear();
      queryClient.clear();
      setSession({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      const meRes = await api.get<Envelope<AuthUser>>('/auth/me', {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const me = meRes.data.data;
      if (me) setUser(me);
      const role = me?.role;

      // Minta izin notifikasi — user sudah gesture (klik submit 2FA)
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }

      toast.success('Login berhasil');
      router.push(role === 'employee' ? '/my-attendance' : '/dashboard');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const cancel2FA = () => {
    setChallengeToken(null);
    setTwoFaCode('');
    setUseRecovery(false);
  };

  // Theme-aware colors
  const ringColor = isLight ? '#fb923c' : '#00f2f2';
  const ringColorTwo = isLight ? '#ec4899' : '#a855f7';
  const particleColor = isLight
    ? 'rgba(249, 115, 22, 0.55)'
    : 'rgba(0, 242, 242, 0.55)';
  const auroraColors = isLight
    ? ['#fb923c', '#fbbf24', '#fde68a', '#f97316']
    : ['#00b8b8', '#0ea5e9', '#6366f1', '#a855f7'];

  return (
    <div className="relative min-h-[100dvh] bg-surface-base overflow-hidden">
      {/* ─── FULL-SCREEN BACKGROUND LAYERS ──────────────────────────── */}

      {/* Layer 1: Grid */}
      <div
        className="fixed inset-0 bg-grid-cyber bg-grid pointer-events-none opacity-40"
        aria-hidden
      />

      {/* Layer 2: Aurora — full screen, halus banget */}
      <AuroraGlow
        colors={auroraColors}
        intensity={isLight ? 0.35 : 0.4}
        speed={0.6}
      />

      {/* Layer 3: Magic Rings — fullscreen tapi subtle, cuma aksen background.
          Pakai 100vmax square supaya rings reach semua aspect ratio.
          Tweak: ringCount kecil, attenuation gede (tight glow), opacity rendah
          → kelihatan tapi gak overpowering konten. */}
      <div
        className="fixed inset-0 pointer-events-auto overflow-hidden"
        aria-hidden
      >
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: '100vmax', height: '100vmax' }}
        >
          <MagicRings
            color={ringColor}
            colorTwo={ringColorTwo}
            ringCount={5}
            speed={0.35}
            attenuation={9}
            lineThickness={1.4}
            baseRadius={0.25}
            radiusStep={0.18}
            opacity={0.35}
            followMouse
            mouseInfluence={0.08}
            hoverScale={1.02}
            parallax={0.04}
            clickBurst
            noiseAmount={0.03}
            ringGap={1.6}
            fadeIn={0.7}
            fadeOut={0.5}
          />
        </div>
      </div>

      {/* Layer 4: Particles — sedikit aja biar gak rame */}
      <FloatingParticles color={particleColor} count={35} />

      {/* Layer 5: Vignette tipis — cuma soften edges */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: isLight
            ? 'radial-gradient(ellipse at center, transparent 0%, transparent 60%, rgba(254,249,243,0.35) 100%)'
            : 'radial-gradient(ellipse at center, transparent 0%, transparent 60%, rgba(5,10,15,0.45) 100%)',
        }}
        aria-hidden
      />

      {/* ─── CONTENT GRID ───────────────────────────────────────────── */}
      <div className="relative z-10 min-h-[100dvh] grid grid-cols-1 lg:grid-cols-[1fr_480px] xl:grid-cols-[1fr_520px]">
        {/* Tombol mode kecerahan — pojok kanan atas, di atas semua layer */}
        <div className="fixed top-4 right-4 z-50">
          <ThemeToggle className="shadow-card backdrop-blur-md" />
        </div>
        {/* ─── LEFT: HERO (desktop only) ─── */}
        <div
          ref={heroRef}
          className="hidden lg:flex flex-col justify-between p-8 xl:p-12 relative"
        >
          {/* Top: Brand */}
          <div className="hero-anim flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-glow-primary ring-1 ring-surface-border bg-surface-base">
              <img src="/logo.png" alt="Aethera" className="w-full h-full object-cover" />
            </div>
            <div>
              <ShinyText
                className="font-display font-black text-3xl tracking-tight text-primary-400 block"
                duration={5}
              >
                AETHERA
              </ShinyText>
              <p className="font-mono text-2xs text-text-muted uppercase tracking-widest">
                Platform Sekolah Modern
              </p>
            </div>
          </div>

          {/* Middle: Headline */}
          <div className="max-w-2xl py-6">
            <h1 className="hero-anim font-display font-black text-5xl xl:text-7xl leading-[1.05] tracking-tight">
              Sekolah pintar,
              <br />
              <span
                className="bg-gradient-to-br from-primary-400 via-accent-500 to-primary-600 bg-clip-text text-transparent"
                style={{
                  backgroundSize: '200% 100%',
                  animation: 'gradientShift 6s ease infinite',
                }}
              >
                guru bahagia.
              </span>
            </h1>
            <p className="hero-anim font-body text-text-secondary text-lg mt-5 leading-relaxed max-w-xl">
              All-in-one platform: absensi pengenalan wajah, LMS, rapor PDF,
              portal orang tua, sampai AI insight. Dirancang untuk sekolah
              Indonesia modern.
            </p>

            <div className="hero-anim flex flex-wrap items-center gap-2 mt-6">
              <Badge icon={ShieldCheck} label="2FA + AES-256" />
              <Badge icon={Award} label="WCAG AA" />
              <Badge icon={Sparkles} label="AI-Powered" />
            </div>
          </div>

          {/* Bottom: Feature grid */}
          <div className="grid grid-cols-3 gap-3 max-w-2xl">
            {HIGHLIGHTS.map((h) => (
              <FeatureCard key={h.title} {...h} />
            ))}
          </div>

          {/* CSS keyframes inline */}
          <style jsx>{`
            @keyframes gradientShift {
              0%, 100% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
            }
          `}</style>
        </div>

        {/* ─── RIGHT: LOGIN CARD ─── */}
        <div className="flex flex-col items-center justify-center p-4 sm:p-8 relative">
          {/* Mobile hero */}
          <div className="lg:hidden text-center mb-6 max-w-sm">
            <div className="inline-flex w-16 h-16 rounded-2xl overflow-hidden shadow-glow-primary ring-1 ring-surface-border bg-surface-base mb-3">
              <img src="/logo.png" alt="Aethera" className="w-full h-full object-cover" />
            </div>
            <ShinyText
              className="font-display font-black text-3xl text-primary-400 block"
              duration={5}
            >
              AETHERA
            </ShinyText>
            <p className="font-body text-text-muted text-sm mt-2">
              Platform manajemen sekolah modern
            </p>
          </div>

          <div ref={cardRef} className="relative w-full max-w-md">
            {/* Glow halo behind card */}
            <div
              className="absolute -inset-6 rounded-3xl blur-3xl pointer-events-none opacity-70"
              style={{
                background:
                  'radial-gradient(ellipse, rgb(var(--brand-500) / 0.35), transparent 70%)',
              }}
              aria-hidden
            />

            <div
              className={cn(
                'relative rounded-3xl p-7 sm:p-8 shadow-card-hover backdrop-blur-2xl',
                isLight
                  ? 'bg-white/85 border border-white/60'
                  : 'bg-surface-raised/70 border border-surface-border/80'
              )}
            >
              {!challengeToken ? (
                <>
                  <h2 className="font-display font-bold text-2xl mb-1">
                    Selamat Datang Kembali 👋
                  </h2>
                  <p className="font-body text-sm text-text-muted mb-6">
                    Masuk untuk akses dashboard sekolah Anda
                  </p>

                  <form onSubmit={onSubmit} className="space-y-4">
                    <Input
                      label="Email"
                      type="email"
                      placeholder="anda@sekolah.id"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      leftIcon={<Mail className="w-4 h-4" />}
                      required
                    />
                    <Input
                      label="Password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      leftIcon={<Lock className="w-4 h-4" />}
                      required
                    />
                    <ShimmerButton
                      type="submit"
                      isLoading={loading}
                      label="Masuk ke Dashboard"
                    />
                  </form>

                  <div className="my-6 flex items-center gap-3">
                    <span className="flex-1 h-px bg-surface-border" />
                    <span className="font-mono text-2xs text-text-muted tracking-widest">
                      ATAU
                    </span>
                    <span className="flex-1 h-px bg-surface-border" />
                  </div>

                  <div className="space-y-2.5">
                    <QuickLink
                      href="/scan"
                      target="_blank"
                      icon={ScanFace}
                      title="Mode Kiosk Scan"
                      desc="Untuk perangkat absensi"
                      tone="primary"
                    />
                    <QuickLink
                      href="/parent/login"
                      icon={Heart}
                      title="Login Orang Tua"
                      desc="Lihat data anak Anda"
                      tone="rose"
                    />
                    <QuickLink
                      href="/daftar"
                      icon={GraduationCap}
                      title="Pendaftaran (PPDB)"
                      desc="Calon siswa baru"
                      tone="emerald"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-12 h-12 rounded-xl bg-violet-500/15 text-violet-400 flex items-center justify-center">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="font-display font-bold text-xl">
                        Verifikasi 2FA
                      </h2>
                      <p className="text-xs text-text-muted">
                        Lapisan keamanan tambahan
                      </p>
                    </div>
                  </div>

                  <p className="font-body text-sm text-text-muted mb-6">
                    {useRecovery
                      ? 'Masukkan salah satu recovery code (8 huruf-angka).'
                      : 'Masukkan 6-digit kode dari aplikasi Authenticator.'}
                  </p>

                  <form onSubmit={onSubmit2FA} className="space-y-4">
                    <Input
                      label={useRecovery ? 'Recovery Code' : 'Kode 6 digit'}
                      type="text"
                      placeholder={useRecovery ? 'XXXX-XXXX' : '123456'}
                      value={twoFaCode}
                      onChange={(e) => setTwoFaCode(e.target.value)}
                      autoFocus
                      required
                    />
                    <ShimmerButton
                      type="submit"
                      isLoading={loading}
                      label="Verifikasi"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setUseRecovery(!useRecovery);
                        setTwoFaCode('');
                      }}
                      className="w-full text-center text-xs text-primary-400 hover:underline"
                    >
                      {useRecovery
                        ? '← Kembali ke kode authenticator'
                        : 'Pakai recovery code →'}
                    </button>
                    <button
                      type="button"
                      onClick={cancel2FA}
                      className="w-full text-center text-xs text-text-muted hover:text-text-primary"
                    >
                      Batal & login ulang
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>

          <div className="mt-6 text-center text-2xs text-text-muted font-mono">
            © {new Date().getFullYear()} Aethera Platform • v1.0
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helper components ─────────────────────────────────────────────────

function Badge({
  icon: Icon,
  label,
}: {
  icon: typeof ShieldCheck;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono bg-surface-raised/60 border border-surface-border backdrop-blur-md">
      <Icon className="w-3.5 h-3.5 text-primary-400" />
      <span className="text-text-secondary">{label}</span>
    </span>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof ScanFace;
  title: string;
  desc: string;
}) {
  return (
    <div className="feat-card group rounded-xl bg-surface-raised/50 backdrop-blur-md border border-surface-border/70 p-3 hover:border-primary-500/50 hover:bg-surface-raised/70 transition-all">
      <div className="w-9 h-9 rounded-lg bg-primary-500/15 text-primary-400 flex items-center justify-center mb-2 group-hover:scale-110 group-hover:bg-primary-500/25 transition-all">
        <Icon className="w-4 h-4" />
      </div>
      <div className="font-display font-semibold text-sm text-text-primary truncate">
        {title}
      </div>
      <div className="text-2xs text-text-muted leading-snug truncate">
        {desc}
      </div>
    </div>
  );
}

function QuickLink({
  href,
  target,
  icon: Icon,
  title,
  desc,
  tone,
}: {
  href: string;
  target?: string;
  icon: typeof ScanFace;
  title: string;
  desc: string;
  tone: 'primary' | 'rose' | 'emerald';
}) {
  const toneStyles = {
    primary: {
      iconBg: 'bg-primary-500/15 text-primary-400',
      border: 'hover:border-primary-500/50',
    },
    rose: {
      iconBg: 'bg-rose-500/15 text-rose-400',
      border: 'hover:border-rose-500/50',
    },
    emerald: {
      iconBg: 'bg-emerald-500/15 text-emerald-400',
      border: 'hover:border-emerald-500/50',
    },
  }[tone];
  return (
    <Link
      href={href}
      target={target}
      className={cn(
        'group w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-surface-border bg-surface-raised/40 backdrop-blur-md transition-all',
        toneStyles.border
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
            toneStyles.iconBg
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="font-display font-semibold text-sm text-text-primary truncate">
            {title}
          </div>
          <div className="text-2xs text-text-muted truncate">{desc}</div>
        </div>
      </div>
      <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-primary-400 group-hover:translate-x-1 transition-all shrink-0" />
    </Link>
  );
}

function ShimmerButton({
  type = 'button',
  isLoading,
  label,
}: {
  type?: 'submit' | 'button';
  isLoading?: boolean;
  label: string;
}) {
  return (
    <button
      type={type}
      disabled={isLoading}
      className="group relative w-full overflow-hidden rounded-xl bg-primary-500 hover:bg-primary-600 text-text-inverse font-display font-bold py-3.5 px-6 transition-all disabled:opacity-60 shadow-glow-primary"
    >
      <span
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 pointer-events-none"
        aria-hidden
      />
      <span className="relative flex items-center justify-center gap-2">
        {isLoading ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-current border-r-transparent rounded-full animate-spin" />
            Memproses...
          </>
        ) : (
          <>
            {label}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </>
        )}
      </span>
    </button>
  );
}
