'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { gsap } from 'gsap';
import {
  AlertTriangle,
  Award,
  BookOpen,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  HeartHandshake,
  Mail,
  School,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import {
  fetchExecDashboard,
  fetchExecExtras,
  fetchHeatmap,
} from '@/lib/disciplineApi';
import { DisciplineHeatmap } from './DisciplineHeatmap';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { DonutChart } from '@/components/dashboard/charts/DonutChart';
import { AiInsightWidget } from '@/components/dashboard/AiInsightWidget';
import { cn } from '@/lib/utils';

const TOOLTIP_STYLE = {
  backgroundColor: '#0a1520',
  border: '1px solid #1a3045',
  borderRadius: 8,
  color: '#e8f4f8',
};

export function ExecDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['exec-dashboard'],
    queryFn: fetchExecDashboard,
    refetchInterval: 60_000,
    staleTime: 0,
  });

  const { data: heatmap } = useQuery({
    queryKey: ['exec-heatmap'],
    queryFn: () => fetchHeatmap(30),
    staleTime: 0,
  });

  const { data: extras } = useQuery({
    queryKey: ['exec-extras'],
    queryFn: fetchExecExtras,
    staleTime: 0,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.exec-section', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.06 });
    }, containerRef);
    return () => ctx.revert();
  }, [isLoading]);

  if (isLoading || !data) {
    return <p className="text-center font-body text-text-muted py-24">Memuat ringkasan sekolah...</p>;
  }

  const { kpi, top_classes, bottom_classes, weekly_attendance_trend } = data;

  const trendData = weekly_attendance_trend.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' }),
  }));

  const weeklyBarData = extras?.weekly_attendance.map((w) => ({
    label: w.week_label,
    Hadir: w.present,
    Telat: w.late,
    Absen: w.absent,
  })) ?? [];

  return (
    <div ref={containerRef} className="space-y-6">
      {/* Header */}
      <div className="exec-section">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">Executive Overview</span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Ringkasan Sekolah</h1>
        <p className="font-body text-text-muted mt-1">Bird's-eye view performance sekolah hari ini & minggu ini.</p>
      </div>

      {/* AI Insight banner */}
      <div className="exec-section">
        <AiInsightWidget />
      </div>

      {/* Alert chips */}
      {(kpi.pending_approvals > 0 || kpi.watchlist_count > 0) && (
        <div className="exec-section grid grid-cols-1 md:grid-cols-2 gap-3">
          {kpi.pending_approvals > 0 && (
            <Link href="/approvals" className="block group">
              <Card padding="md" className="border-rose-500/30 bg-rose-500/5 hover:border-rose-500/60 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="inline-flex w-10 h-10 rounded-lg bg-rose-500/15 text-rose-400 items-center justify-center shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                  </span>
                  <div>
                    <p className="font-mono text-2xs uppercase tracking-widest text-rose-300">Butuh Keputusan</p>
                    <p className="font-display font-bold text-base">{kpi.pending_approvals} Permohonan KTS Berat</p>
                  </div>
                </div>
              </Card>
            </Link>
          )}
          {kpi.watchlist_count > 0 && (
            <Link href="/watchlist" className="block group">
              <Card padding="md" className="border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="inline-flex w-10 h-10 rounded-lg bg-amber-500/15 text-amber-400 items-center justify-center shrink-0">
                    <Eye className="w-5 h-5" />
                  </span>
                  <div>
                    <p className="font-mono text-2xs uppercase tracking-widest text-amber-300">Perlu Perhatian</p>
                    <p className="font-display font-bold text-base">{kpi.watchlist_count} Siswa di Watch List</p>
                  </div>
                </div>
              </Card>
            </Link>
          )}
        </div>
      )}

      {/* KPI grid */}
      <div className="exec-section grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total Siswa" value={kpi.total_students} icon={<Users className="w-4 h-4" />} href="/employees?role=employee" />
        <Kpi label="Total Kelas" value={kpi.total_classes} icon={<Building2 className="w-4 h-4" />} href="/organization" />
        <Kpi label="Hadir Hari Ini" value={kpi.today_present} icon={<CheckCircle2 className="w-4 h-4" />} tone="text-success" href="/attendance" />
        <Kpi label="Telat / Absen" value={`${kpi.today_late}/${kpi.today_absent}`} icon={<AlertTriangle className="w-4 h-4" />} tone="text-amber-400" href="/attendance" />
        <Kpi label="Rata-Rata Sikap" value={kpi.avg_attitude.toFixed(1)} icon={<ShieldCheck className="w-4 h-4" />} tone="role-accent-text" href="/student-status" />
        <Kpi label="Total Apresiasi" value={kpi.total_appreciation} icon={<HeartHandshake className="w-4 h-4" />} tone="text-amber-400" href="/leaderboard?cat=appreciation" />
        <Kpi label="Pending Approval" value={kpi.pending_approvals} icon={<ShieldAlert className="w-4 h-4" />} tone={kpi.pending_approvals > 0 ? 'text-rose-400' : 'text-text-secondary'} href="/approvals" />
        <Kpi label="Watch List" value={kpi.watchlist_count} icon={<Eye className="w-4 h-4" />} tone={kpi.watchlist_count > 0 ? 'text-amber-400' : 'text-text-secondary'} href="/watchlist" />
      </div>

      {/* Trend chart (7 hari) + Top kelas */}
      <div className="exec-section grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Link href="/reports" className="lg:col-span-2 group">
        <Card padding="lg" className="h-full transition-colors group-hover:border-primary-500/40">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-lg">Tren Kehadiran 7 Hari</h3>
            <span className="font-mono text-2xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">Detail →</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="exec-present" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00e676" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#00e676" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="exec-late" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffc107" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#ffc107" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a3045" vertical={false} />
                <XAxis dataKey="label" stroke="#4a6b82" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#4a6b82" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="present" name="Hadir" stroke="#00e676" strokeWidth={2} fill="url(#exec-present)" />
                <Area type="monotone" dataKey="late" name="Terlambat" stroke="#ffc107" strokeWidth={2} fill="url(#exec-late)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        </Link>

        <Link href="/leaderboard?view=class" className="group">
        <Card padding="lg" className="h-full transition-colors group-hover:border-primary-500/40">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              <h3 className="font-display font-semibold text-base">Kelas Terbaik</h3>
            </div>
            <span className="font-mono text-2xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">Detail →</span>
          </div>
          <div className="space-y-2">
            {top_classes.map((c, idx) => (
              <ClassRow key={c.class_id} item={c} rank={idx + 1} positive />
            ))}
          </div>
          {bottom_classes.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-3 mt-5">
                <TrendingDown className="w-4 h-4 text-rose-400" />
                <h3 className="font-display font-semibold text-base">Butuh Perhatian</h3>
              </div>
              <div className="space-y-2">
                {bottom_classes.map((c) => (
                  <ClassRow key={c.class_id} item={c} positive={false} />
                ))}
              </div>
            </>
          )}
        </Card>
        </Link>
      </div>

      {/* Tren kehadiran 6 minggu (grouped bar) + Donut KTS */}
      {extras && (
        <div className="exec-section grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Link href="/reports" className="group">
          <Card padding="lg" className="h-full transition-colors group-hover:border-primary-500/40">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display font-semibold text-base">Tren Kehadiran 6 Minggu</h3>
              <span className="font-mono text-2xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">Detail →</span>
            </div>
            <p className="font-body text-sm text-text-muted mb-4">Breakdown hadir / telat / absen per minggu</p>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyBarData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a3045" vertical={false} />
                  <XAxis dataKey="label" stroke="#4a6b82" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#4a6b82" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#4a6b82' }} />
                  <Bar dataKey="Hadir" fill="#00e676" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Telat" fill="#ffc107" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Absen" fill="#ff1744" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          </Link>

          <Link href="/student-status" className="group">
          <Card padding="lg" className="h-full transition-colors group-hover:border-primary-500/40">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display font-semibold text-base">Top 5 Jenis KTS (90 hari)</h3>
              <span className="font-mono text-2xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">Detail →</span>
            </div>
            <p className="font-body text-sm text-text-muted mb-4">Jenis pelanggaran paling sering terjadi</p>
            <DonutChart
              data={extras.violation_breakdown}
              centerLabel="Insiden"
              centerValue={extras.violation_breakdown.reduce((s, d) => s + d.count, 0)}
            />
          </Card>
          </Link>
        </div>
      )}

      {/* Severity breakdown */}
      {extras && extras.severity_breakdown.length > 0 && (
        <div className="exec-section grid grid-cols-1 sm:grid-cols-3 gap-3">
          {extras.severity_breakdown.map((s) => {
            const tone =
              s.label.toLowerCase() === 'berat'
                ? 'border-rose-500/40 bg-rose-500/5 text-rose-300 hover:border-rose-500/70'
                : s.label.toLowerCase() === 'sedang'
                  ? 'border-amber-500/40 bg-amber-500/5 text-amber-300 hover:border-amber-500/70'
                  : 'border-cyan-500/40 bg-cyan-500/5 text-cyan-300 hover:border-cyan-500/70';
            return (
              <Link
                key={s.label}
                href={`/student-status?severity=${s.label.toLowerCase()}`}
                className="block group"
              >
              <Card padding="md" className={cn('border h-full transition-colors', tone)}>
                <p className="font-mono text-2xs uppercase tracking-widest">Pelanggaran {s.label}</p>
                <p className="font-display font-bold text-3xl mt-1">{s.count}</p>
                <p className="font-body text-xs text-text-muted">90 hari terakhir · klik untuk detail</p>
              </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Heatmap */}
      {heatmap && (
        <div className="exec-section">
          <DisciplineHeatmap data={heatmap} />
        </div>
      )}

      {/* Quick actions */}
      <div className="exec-section">
        <QuickActions
          title="Pintasan Cepat"
          description="Aksi yang paling sering dipakai sebagai kepala sekolah"
          actions={[
            { href: '/approvals', icon: ShieldAlert, label: 'Persetujuan KTS', description: 'Putuskan pelanggaran berat', tone: 'rose', badge: kpi.pending_approvals > 0 ? kpi.pending_approvals : undefined },
            { href: '/watchlist', icon: Eye, label: 'Watch List', description: 'Siswa butuh perhatian', tone: 'amber', badge: kpi.watchlist_count > 0 ? kpi.watchlist_count : undefined },
            { href: '/leaderboard', icon: Trophy, label: 'Papan Peringkat', description: 'Top siswa & kelas', tone: 'amber' },
            { href: '/homeroom-assign', icon: UserCheck, label: 'Tugas Wali Kelas', description: 'Assign guru ke kelas', tone: 'cyan' },
            { href: '/gradebook', icon: ClipboardCheck, label: 'Nilai Siswa', description: 'Audit nilai per kelas', tone: 'primary' },
            { href: '/digest', icon: Mail, label: 'Digest Mingguan', description: 'Kirim ringkasan ke staff', tone: 'violet' },
            { href: '/organization', icon: Building2, label: 'Pengaturan', description: 'Geofence, WhatsApp, dll', tone: 'primary' },
            { href: '/employees?role=admin', icon: School, label: 'Daftar Wali Kelas', description: 'Kelola guru pengampu', tone: 'cyan' },
          ]}
        />
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone,
  href,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone?: string;
  href?: string;
}) {
  const inner = (
    <Card
      padding="md"
      className={cn(
        'relative overflow-hidden h-full transition-colors',
        href && 'group-hover:border-primary-500/40 cursor-pointer'
      )}
    >
      <div className="flex items-center gap-2 mb-1.5 text-text-muted">
        <span className={cn('inline-flex', tone)}>{icon}</span>
        <span className="font-mono text-2xs uppercase tracking-widest">{label}</span>
      </div>
      <p className={cn('font-display font-bold text-2xl sm:text-3xl', tone)}>{value}</p>
    </Card>
  );
  if (!href) return inner;
  return (
    <Link href={href} className="block group">
      {inner}
    </Link>
  );
}

function ClassRow({ item, rank, positive }: { item: { class_id: number; class_name: string; avg_attitude: number; avg_gpa: number; today_attendance_pct: number }; rank?: number; positive: boolean }) {
  const podium = rank === 1 ? 'podium-gold' : rank === 2 ? 'podium-silver' : rank === 3 ? 'podium-bronze' : null;
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-base/40 border border-surface-border hover:border-primary-500/40 transition-colors">
      {rank ? (
        <span className={cn('inline-flex items-center justify-center w-7 h-7 rounded-full font-mono font-bold text-xs', podium ?? 'bg-surface-overlay text-text-secondary')}>
          {rank}
        </span>
      ) : (
        <TrendingDown className="w-4 h-4 text-rose-400 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-display font-semibold text-sm truncate">{item.class_name}</p>
        <p className="font-mono text-2xs text-text-muted truncate">GPA {item.avg_gpa.toFixed(1)} · sikap {item.avg_attitude.toFixed(0)} · hadir {item.today_attendance_pct}%</p>
      </div>
      {positive ? <TrendingUp className="w-4 h-4 text-success" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
    </div>
  );
}
