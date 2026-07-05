'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { gsap } from 'gsap';
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  GraduationCap,
  Heart,
  HeartPulse,
  ShieldAlert,
  Stethoscope,
  TrendingDown,
  Trophy,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { fetchBkCases, fetchBkExtras, fetchMoodAggregate } from '@/lib/disciplineApi';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { DonutChart } from '@/components/dashboard/charts/DonutChart';
import { cn, formatDate } from '@/lib/utils';

const TOOLTIP_STYLE = {
  backgroundColor: '#0a1520',
  border: '1px solid #1a3045',
  borderRadius: 8,
  color: '#e8f4f8',
};

export function BkDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ['bk-cases'],
    queryFn: fetchBkCases,
    refetchInterval: 60_000,
    staleTime: 0,
  });

  const { data: moodAgg } = useQuery({
    queryKey: ['mood-agg-week'],
    queryFn: () => fetchMoodAggregate(7),
    staleTime: 0,
  });

  const { data: extras } = useQuery({
    queryKey: ['bk-extras'],
    queryFn: fetchBkExtras,
    staleTime: 0,
    refetchOnMount: true,
  });

  const stats = useMemo(() => ({
    critical: cases.filter((c) => c.risk_score >= 70).length,
    moderate: cases.filter((c) => c.risk_score >= 40 && c.risk_score < 70).length,
    mild: cases.filter((c) => c.risk_score < 40).length,
  }), [cases]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.bk-section', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.05 });
    }, containerRef);
    return () => ctx.revert();
  }, [cases.length]);

  if (isLoading) {
    return <p className="text-center font-body text-text-muted py-24">Memuat triage kasus...</p>;
  }

  const casesTrendData = extras?.cases_trend.map((d) => ({ label: d.label, Kasus: d.count })) ?? [];
  const moodTrendData = extras?.mood_trend.map((d) => ({ label: d.label, Mood: d.count })) ?? [];

  return (
    <div ref={containerRef} className="space-y-6">
      <div className="bk-section">
        <div className="flex items-center gap-2 mb-2">
          <Stethoscope className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">Konseling</span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Triage Kasus</h1>
        <p className="font-body text-text-muted mt-1">Siswa yang butuh perhatianmu hari ini, di-rank dari risiko paling tinggi.</p>
      </div>

      {/* Risk distribution */}
      <div className="bk-section grid grid-cols-1 md:grid-cols-4 gap-3">
        <RiskCard label="Total Kasus" value={cases.length} tone="role-accent-text" bg="bg-rose-500/10 border-rose-500/30" icon={<HeartPulse className="w-5 h-5" />} href="/watchlist" />
        <RiskCard label="Risk Tinggi (70+)" value={stats.critical} tone="text-rose-400" bg="bg-rose-500/10 border-rose-500/30" icon={<AlertTriangle className="w-5 h-5" />} href="/watchlist?risk=high" />
        <RiskCard label="Risk Sedang" value={stats.moderate} tone="text-amber-400" bg="bg-amber-500/10 border-amber-500/30" icon={<TrendingDown className="w-5 h-5" />} href="/watchlist?risk=medium" />
        <RiskCard label="Mood Avg / 7d" value={moodAgg ? moodAgg.avg_mood.toFixed(1) : '—'} tone="text-cyan-400" bg="bg-cyan-500/10 border-cyan-500/30" icon={<Heart className="w-5 h-5" />} href="/mood-tracker" />
      </div>

      {/* Charts */}
      {extras && (
        <div className="bk-section grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Link href="/watchlist" className="group">
          <Card padding="lg" className="h-full transition-colors group-hover:border-primary-500/40">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display font-semibold text-base">Tren Kasus 8 Minggu</h3>
              <span className="font-mono text-2xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">Detail →</span>
            </div>
            <p className="font-body text-sm text-text-muted mb-4">Pelanggaran baru per minggu</p>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={casesTrendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a3045" vertical={false} />
                  <XAxis dataKey="label" stroke="#4a6b82" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#4a6b82" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="Kasus" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          </Link>

          <Link href="/student-status" className="group">
          <Card padding="lg" className="h-full transition-colors group-hover:border-primary-500/40">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display font-semibold text-base">Kategori Pelanggaran (30 Hari)</h3>
              <span className="font-mono text-2xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">Detail →</span>
            </div>
            <p className="font-body text-sm text-text-muted mb-4">Breakdown insiden berdasarkan jenisnya</p>
            <DonutChart
              data={extras.category_breakdown}
              centerLabel="Insiden"
              centerValue={extras.category_breakdown.reduce((s, d) => s + d.count, 0)}
            />
          </Card>
          </Link>
        </div>
      )}

      {/* Mood trend */}
      {extras && moodTrendData.length > 0 && (
        <Link href="/mood-tracker" className="bk-section block group">
        <Card padding="lg" className="h-full transition-colors group-hover:border-primary-500/40">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-display font-semibold text-base">Tren Mood Harian (7 Hari)</h3>
            <span className="font-mono text-2xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">Detail →</span>
          </div>
          <p className="font-body text-sm text-text-muted mb-4">Rata-rata mood siswa per hari (skala 0-50)</p>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={moodTrendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a3045" vertical={false} />
                <XAxis dataKey="label" stroke="#4a6b82" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#4a6b82" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="Mood" fill="#06b6d4" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        </Link>
      )}

      {/* Cases list */}
      <Card padding="lg" className="bk-section">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold text-lg">Daftar Kasus Aktif</h3>
            <p className="font-body text-sm text-text-muted">Klik untuk lihat profil & catatan privat siswa</p>
          </div>
        </div>
        {cases.length === 0 ? (
          <Card padding="lg" className="text-center bg-success/5 border-success/30">
            <Heart className="w-12 h-12 text-success mx-auto mb-3" />
            <p className="font-display font-semibold text-text-primary">Tidak ada kasus aktif</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {cases.map((c) => (
              <Link key={c.student.user_id} href={`/student-status/${c.student.user_id}`} className="flex items-center gap-3 p-3 rounded-lg bg-surface-base/40 hover:bg-surface-overlay border border-transparent hover:border-rose-500/30 transition-all group">
                <Avatar name={c.student.full_name} src={c.student.photo_url ?? undefined} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-sm truncate group-hover:role-accent-text transition-colors">{c.student.full_name}</p>
                  <p className="font-mono text-2xs text-text-muted">{c.student.class_name ?? '—'} · sikap {c.student.attitude_points}</p>
                  {c.last_note_at && <p className="font-mono text-2xs text-text-muted mt-0.5">{c.pending_notes_count} catatan · terakhir {formatDate(c.last_note_at)}</p>}
                </div>
                <RiskBadge score={c.risk_score} />
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:role-accent-text group-hover:translate-x-1 transition-all" />
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Quick actions */}
      <div className="bk-section">
        <QuickActions
          title="Pintasan Cepat"
          actions={[
            { href: '/watchlist', icon: Eye, label: 'Watch List', description: 'Siswa butuh perhatian', tone: 'amber', badge: stats.critical > 0 ? stats.critical : undefined },
            { href: '/mood-tracker', icon: Heart, label: 'Mood Tracker', description: 'Agregat mood per kelas', tone: 'rose' },
            { href: '/kts/new', icon: ShieldAlert, label: 'Lapor KTS', description: 'Catat insiden baru', tone: 'rose' },
            { href: '/student-status', icon: Users, label: 'Status Siswa', description: 'Profil disiplin lengkap', tone: 'primary' },
            { href: '/leaderboard', icon: Trophy, label: 'Papan Peringkat', description: 'Top siswa sekolah', tone: 'amber' },
            { href: '/employees?role=employee', icon: GraduationCap, label: 'Daftar Siswa', description: 'Browse semua siswa', tone: 'cyan' },
          ]}
        />
      </div>
    </div>
  );
}

function RiskCard({
  label,
  value,
  tone,
  bg,
  icon,
  href,
}: {
  label: string;
  value: number | string;
  tone: string;
  bg: string;
  icon: React.ReactNode;
  href?: string;
}) {
  const inner = (
    <Card padding="md" className={cn('border h-full transition-colors', bg, href && 'group-hover:border-primary-500/40')}>
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex w-10 h-10 rounded-lg items-center justify-center shrink-0', bg)}>
          <span className={tone}>{icon}</span>
        </span>
        <div>
          <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">{label}</p>
          <p className={cn('font-display font-bold text-2xl', tone)}>{value}</p>
        </div>
      </div>
    </Card>
  );
  if (!href) return inner;
  return (
    <Link href={href} className="block group">
      {inner}
    </Link>
  );
}

function RiskBadge({ score }: { score: number }) {
  const tone = score >= 70 ? 'bg-rose-500/15 text-rose-300 border-rose-500/40' : score >= 40 ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40';
  const label = score >= 70 ? 'Tinggi' : score >= 40 ? 'Sedang' : 'Ringan';
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-widest font-bold px-2.5 py-1 rounded-full border shrink-0', tone)}>
      {label} · {score}
    </span>
  );
}
