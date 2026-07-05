'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { gsap } from 'gsap';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CalendarX,
  ClipboardCheck,
  Clock,
  GraduationCap,
  Library,
  School,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';
import {
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
import { Avatar } from '@/components/ui/Avatar';
import { fetchHomeroomExtras, fetchMyHomeroomClass } from '@/lib/disciplineApi';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { DonutChart } from '@/components/dashboard/charts/DonutChart';
import { cn } from '@/lib/utils';

const TOOLTIP_STYLE = {
  backgroundColor: '#0a1520',
  border: '1px solid #1a3045',
  borderRadius: 8,
  color: '#e8f4f8',
};

export function HomeroomDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: env, isLoading } = useQuery({
    queryKey: ['my-homeroom-class'],
    queryFn: fetchMyHomeroomClass,
    refetchInterval: 60_000,
    staleTime: 0,
  });

  const { data: extras } = useQuery({
    queryKey: ['homeroom-extras'],
    queryFn: fetchHomeroomExtras,
    staleTime: 0,
    refetchOnMount: true,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.hr-section', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.06 });
    }, containerRef);
    return () => ctx.revert();
  }, [isLoading]);

  if (isLoading) {
    return <p className="text-center font-body text-text-muted py-24">Memuat data kelas...</p>;
  }

  const data = env?.data;

  if (!data) {
    return (
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <School className="w-5 h-5 role-accent-text" />
            <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">Wali Kelas</span>
          </div>
          <h1 className="font-display text-2xl sm:text-display-md font-bold">Kelas Saya</h1>
        </div>
        <Card padding="lg" className="max-w-2xl border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
              <School className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <p className="font-display font-bold text-lg text-text-primary mb-1">Belum diberi tugas wali kelas</p>
              <p className="font-body text-sm text-text-secondary leading-relaxed">
                {env?.message ?? 'Akun kamu sudah terdaftar sebagai guru, tapi belum di-assign untuk megang kelas tertentu.'}
              </p>
              <div className="mt-3 p-3 rounded-lg bg-surface-base/60 border border-surface-border">
                <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mb-1">Apa yang harus dilakukan?</p>
                <ol className="font-body text-sm text-text-secondary space-y-1 list-decimal list-inside">
                  <li>Hubungi <span className="font-semibold text-text-primary">Kepala Sekolah</span> untuk minta penugasan kelas.</li>
                  <li>Kepsek bisa assign kamu lewat menu <span className="font-mono text-amber-400">Manajemen → Tugas Wali Kelas</span>.</li>
                  <li>Setelah ditugaskan, refresh halaman ini.</li>
                </ol>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const weeklyBarData = extras?.weekly_attendance.map((w) => ({
    label: w.week_label,
    Hadir: w.present,
    Telat: w.late,
    Absen: w.absent,
  })) ?? [];

  const subjectBarData = extras?.subject_avg.map((s) => ({
    label: s.subject_code,
    Nilai: Math.round(s.avg_score),
  })) ?? [];

  return (
    <div ref={containerRef} className="space-y-6">
      <div className="hr-section">
        <div className="flex items-center gap-2 mb-2">
          <School className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">Wali Kelas</span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Kelas {data.class_name}</h1>
        <p className="font-body text-text-muted mt-1">
          {data.grade ? `Kelas ${data.grade}` : '—'}{data.major ? ` · ${data.major}` : ''} · {data.student_count} siswa
        </p>
      </div>

      {/* Hari ini snapshot */}
      <div className="hr-section grid grid-cols-2 md:grid-cols-4 gap-3">
        <Snap label="Hadir" value={data.today_present} tone="text-success" icon={<CalendarCheck className="w-4 h-4" />} href="/attendance" />
        <Snap label="Telat" value={data.today_late} tone="text-accent-400" icon={<Clock className="w-4 h-4" />} href="/attendance?status=late" />
        <Snap label="Absen" value={data.today_absent} tone="text-danger" icon={<CalendarX className="w-4 h-4" />} href="/attendance?status=absent" />
        <Snap label="Belum Masuk" value={data.not_yet_checked_in} tone="text-text-secondary" icon={<Users className="w-4 h-4" />} href="/attendance" />
      </div>

      {/* Composite + averages */}
      <div className="hr-section grid grid-cols-1 md:grid-cols-3 gap-3">
        <Link href="/gradebook" className="block group">
        <Card padding="md" className="h-full transition-colors group-hover:border-primary-500/40">
          <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mb-1">
            <GraduationCap className="inline w-3.5 h-3.5 mr-1" /> Rata-Rata GPA
          </p>
          <p className="font-display font-bold text-3xl role-accent-text">{data.avg_gpa.toFixed(1)}</p>
        </Card>
        </Link>
        <Link href="/student-status" className="block group">
        <Card padding="md" className="h-full transition-colors group-hover:border-primary-500/40">
          <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mb-1">
            <ShieldCheck className="inline w-3.5 h-3.5 mr-1" /> Rata-Rata Sikap
          </p>
          <p className="font-display font-bold text-3xl role-accent-text">
            {data.avg_attitude.toFixed(0)}<span className="text-base font-medium text-text-muted">/100</span>
          </p>
        </Card>
        </Link>
        <Link href="/leaderboard?view=class" className="block group">
        <Card padding="md" className="h-full transition-colors group-hover:border-primary-500/40">
          <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mb-1">Skor Komposit</p>
          <p className="font-display font-bold text-3xl text-amber-400">{data.composite_score.toFixed(1)}</p>
        </Card>
        </Link>
      </div>

      {/* Charts row */}
      {extras && (
        <div className="hr-section grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Link href="/attendance" className="group">
          <Card padding="lg" className="h-full transition-colors group-hover:border-primary-500/40">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display font-semibold text-base">Kehadiran 6 Minggu</h3>
              <span className="font-mono text-2xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">Detail →</span>
            </div>
            <p className="font-body text-sm text-text-muted mb-4">Tren mingguan hadir / telat / absen kelas ini</p>
            <div className="h-48">
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
              <h3 className="font-display font-semibold text-base">Distribusi Sikap</h3>
              <span className="font-mono text-2xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">Detail →</span>
            </div>
            <p className="font-body text-sm text-text-muted mb-4">Status poin sikap siswa kelas ini</p>
            <DonutChart
              data={extras.attitude_distribution.map((a, i) => ({
                ...a,
                color: i === 0 ? '#00e676' : i === 1 ? '#ffc107' : '#ff1744',
              }))}
              centerLabel="Siswa"
              centerValue={data.student_count}
            />
          </Card>
          </Link>
        </div>
      )}

      {/* Subject avg chart */}
      {extras && subjectBarData.length > 0 && (
        <Link href="/gradebook" className="hr-section block group">
        <Card padding="lg" className="h-full transition-colors group-hover:border-primary-500/40">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-display font-semibold text-base">Rata-Rata per Mata Pelajaran</h3>
            <span className="font-mono text-2xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">Detail →</span>
          </div>
          <p className="font-body text-sm text-text-muted mb-4">Performa kelas di tiap mapel (skala 100)</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectBarData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a3045" vertical={false} />
                <XAxis dataKey="label" stroke="#4a6b82" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#4a6b82" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="Nilai" fill="#00d4d4" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        </Link>
      )}

      {/* Daftar siswa */}
      <Card padding="lg" className="hr-section">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold text-lg">Siswa di Kelas</h3>
            <p className="font-body text-sm text-text-muted">Diurutkan dari sikap terendah</p>
          </div>
          <Link href="/leaderboard" className="text-sm font-body role-accent-text hover:underline inline-flex items-center gap-1">
            Peringkat <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-1.5">
          {data.students.map((s) => {
            const tone = s.attitude_points >= 80 ? 'text-success' : s.attitude_points >= 60 ? 'text-accent-400' : s.attitude_points >= 40 ? 'text-orange-400' : 'text-danger';
            return (
              <Link key={s.user_id} href={`/student-status/${s.user_id}`} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-base/40 hover:bg-surface-overlay border border-transparent hover:border-primary-500/30 transition-all group">
                <Avatar name={s.full_name} src={s.photo_url ?? undefined} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-body font-medium text-sm truncate group-hover:role-accent-text transition-colors">{s.full_name}</p>
                  <p className="font-mono text-2xs text-text-muted">NIS {s.employee_id}</p>
                </div>
                <div className="hidden sm:flex items-center gap-3">
                  <Mini label="GPA" value={s.gpa.toFixed(1)} tone="text-primary-300" />
                  <Mini label="Sikap" value={String(s.attitude_points)} tone={tone} />
                  <Mini label="Apr" value={String(s.appreciation_points)} tone="text-amber-400" />
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:role-accent-text group-hover:translate-x-1 transition-all" />
              </Link>
            );
          })}
        </div>
      </Card>

      {/* Quick actions */}
      <div className="hr-section">
        <QuickActions
          title="Pintasan Cepat"
          actions={[
            { href: '/gradebook', icon: ClipboardCheck, label: 'Nilai Siswa', description: 'Lihat semua nilai kelas', tone: 'primary' },
            { href: '/assignments', icon: BookOpen, label: 'Tugas & Nilai', description: 'Buat tugas baru', tone: 'cyan' },
            { href: '/materials', icon: Library, label: 'Materi Saya', description: 'Upload bahan ajar', tone: 'violet' },
            { href: '/kts/new', icon: ShieldAlert, label: 'Lapor KTS', description: 'Catat insiden siswa', tone: 'rose' },
            { href: '/student-status', icon: ShieldCheck, label: 'Status Siswa', description: 'Lihat profil disiplin', tone: 'amber' },
            { href: '/leaderboard', icon: Trophy, label: 'Papan Peringkat', description: 'Top siswa kelas', tone: 'amber' },
          ]}
        />
      </div>
    </div>
  );
}

function Snap({
  label,
  value,
  tone,
  icon,
  href,
}: {
  label: string;
  value: number;
  tone: string;
  icon: React.ReactNode;
  href?: string;
}) {
  const inner = (
    <Card
      padding="md"
      className={cn('h-full transition-colors', href && 'group-hover:border-primary-500/40')}
    >
      <div className={cn('flex items-center gap-2 mb-1', tone)}>{icon}<span className="font-mono text-2xs uppercase tracking-widest">{label}</span></div>
      <p className={cn('font-display font-bold text-3xl', tone)}>{value}</p>
    </Card>
  );
  if (!href) return inner;
  return (
    <Link href={href} className="block group">
      {inner}
    </Link>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="text-center min-w-[44px]">
      <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">{label}</p>
      <p className={cn('font-display font-bold text-sm', tone)}>{value}</p>
    </div>
  );
}
