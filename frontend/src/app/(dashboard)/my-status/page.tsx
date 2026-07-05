'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Calendar,
  GraduationCap,
  HeartHandshake,
  Library,
  ScanFace,
  ShieldCheck,
  Sunrise,
  Trophy,
} from 'lucide-react';
import api, { type Envelope } from '@/lib/api';
import {
  fetchMyDashboardExtras,
  fetchMyDisciplineStatus,
  fetchMyQuests,
  fetchMyRecap,
  type IncidentRecord,
  type StudentDisciplineSummary,
} from '@/lib/disciplineApi';
import { StudentStatusView } from '@/components/simmico/StudentStatusView';
import { XpLevelBar } from '@/components/simmico/XpLevelBar';
import { StreakCard } from '@/components/simmico/StreakCard';
import { DailyRecapCard } from '@/components/simmico/DailyRecapCard';
import { QuestList } from '@/components/simmico/QuestList';
import { MoodCheckIn } from '@/components/simmico/MoodCheckIn';
import { Card } from '@/components/ui/Card';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { DonutChart } from '@/components/dashboard/charts/DonutChart';
import { MetricRing } from '@/components/dashboard/charts/MetricRing';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn } from '@/lib/utils';

function SimpleBarChart({ data, color }: { data: { label: string; count: number }[]; color: string }) {
  return (
    <div className="h-36 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a3045" vertical={false} />
          <XAxis dataKey="label" stroke="#4a6b82" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#4a6b82" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ backgroundColor: '#0a1520', border: '1px solid #1a3045', borderRadius: 8, color: '#e8f4f8' }} />
          <Bar dataKey="count" fill={color} radius={[3, 3, 0, 0]} name="Nilai" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Status Saya untuk siswa.
 * Layout: gamifikasi atas → recap & mood → quest → visualisasi tambahan
 * (attendance pie, subject progress, weekly XP, rank di kelas) → detail
 * disiplin (existing) + quick actions di bawah.
 */
export default function MyStatusPage() {
  const user = useAuthStore((s) => s.user);

  const { data: student, isLoading } = useQuery({
    queryKey: ['my-discipline-status'],
    queryFn: fetchMyDisciplineStatus,
  });

  const { data: incidents = [] } = useQuery({
    queryKey: ['my-discipline-incidents', user?.id],
    queryFn: async () => {
      if (!user?.id) return [] as IncidentRecord[];
      const r = await api.get<Envelope<IncidentRecord[]>>(
        `/discipline/students/${user.id}/incidents`
      );
      return r.data.data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: recap } = useQuery({
    queryKey: ['my-recap'],
    queryFn: fetchMyRecap,
    refetchInterval: 60_000,
  });

  const { data: quests = [] } = useQuery({
    queryKey: ['my-quests'],
    queryFn: fetchMyQuests,
    refetchInterval: 5 * 60_000,
  });

  const { data: extras } = useQuery({
    queryKey: ['my-dashboard-extras'],
    queryFn: fetchMyDashboardExtras,
    staleTime: 5 * 60_000,
  });

  if (isLoading || !student) {
    return (
      <div className="flex flex-col items-center py-24 gap-3">
        <GraduationCap className="w-10 h-10 text-text-muted animate-pulse" />
        <p className="font-body text-text-muted">Memuat status disiplinmu...</p>
      </div>
    );
  }

  const attTone =
    student.attitude_points >= 80
      ? 'success'
      : student.attitude_points >= 60
        ? 'warning'
        : 'danger';

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-2xs uppercase tracking-widest text-amber-400">
          Status Disiplin
        </p>
        <h1 className="font-display text-2xl sm:text-display-md font-bold mt-1">Profilku</h1>
        <p className="font-body text-text-muted mt-1 text-sm sm:text-base">
          Pantau XP, streak, nilai, dan misi mingguan kamu — semua diperbarui otomatis.
        </p>
      </div>

      {/* Gamifikasi row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <XpLevelBar data={student as StudentDisciplineSummary} />
        <StreakCard
          streakDays={student.streak_days}
          daysToNextBadge={recap?.days_to_next_badge}
          nextBadgeCode={recap?.next_badge_code}
        />
      </div>

      {/* Metric rings — visual cepat untuk 3 pilar */}
      <Card padding="lg">
        <div className="mb-4">
          <h3 className="font-display font-semibold text-base">Performa Kunci</h3>
          <p className="font-body text-sm text-text-muted">
            Indikator visual sekilas — semua di skala 100
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-4 justify-items-center">
          <MetricRing
            value={student.gpa}
            label="Rata-Rata Nilai"
            tone="primary"
            suffix=""
          />
          <MetricRing
            value={student.attitude_points}
            label="Poin Sikap"
            tone={attTone}
            suffix=""
          />
          <MetricRing
            value={Math.min(100, student.appreciation_points)}
            label="Apresiasi"
            tone="amber"
            suffix=""
          />
        </div>
      </Card>

      {/* Recap + Mood */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {recap && <DailyRecapCard recap={recap} />}
        <MoodCheckIn />
      </div>

      {/* Visualisasi tambahan */}
      {extras && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card padding="lg">
              <div className="mb-4">
                <h3 className="font-display font-semibold text-base">Kehadiran 30 Hari</h3>
                <p className="font-body text-sm text-text-muted">
                  Distribusi status absensi kamu
                </p>
              </div>
              <DonutChart
                data={extras.attendance_pie.map((a, i) => ({
                  ...a,
                  color: ['#00e676', '#ffc107', '#ff1744', '#06b6d4'][i],
                }))}
                centerLabel="Total Hari"
                centerValue={extras.attendance_pie.reduce((s, d) => s + d.count, 0)}
              />
            </Card>

            <Card padding="lg">
              <div className="mb-4">
                <h3 className="font-display font-semibold text-base">XP Mingguan</h3>
                <p className="font-body text-sm text-text-muted">Pengumpulan XP 4 minggu terakhir</p>
              </div>
              <SimpleBarChart
                data={extras.weekly_xp.map((w) => ({ label: w.week_label, count: w.xp }))}
                color="#00d4d4"
              />
            </Card>
          </div>

          {/* Subject progress */}
          {extras.subject_progress.length > 0 && (
            <Card padding="lg">
              <div className="mb-4">
                <h3 className="font-display font-semibold text-base">Performa Mata Pelajaran</h3>
                <p className="font-body text-sm text-text-muted">Rata-rata nilai per mapel (skala 100)</p>
              </div>
              <SimpleBarChart
                data={extras.subject_progress.map((s) => ({
                  label: s.subject_code,
                  count: Math.round(s.avg_score),
                }))}
                color="#a78bfa"
              />
            </Card>
          )}

          {/* Rank in class */}
          {extras.rank_in_class.class_size > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <RankCard
                label="Peringkat Nilai"
                rank={extras.rank_in_class.gpa}
                total={extras.rank_in_class.class_size}
                tone="text-primary-300"
                href="/leaderboard?cat=gpa"
              />
              <RankCard
                label="Peringkat Sikap"
                rank={extras.rank_in_class.attitude}
                total={extras.rank_in_class.class_size}
                tone="text-success"
                href="/leaderboard?cat=attitude"
              />
              <RankCard
                label="Peringkat Apresiasi"
                rank={extras.rank_in_class.appreciation}
                total={extras.rank_in_class.class_size}
                tone="text-amber-400"
                href="/leaderboard?cat=appreciation"
              />
            </div>
          )}
        </>
      )}

      {/* Quests */}
      <QuestList quests={quests} />

      {/* Quick actions */}
      <QuickActions
        title="Pintasan Cepat"
        description="Aksi yang paling sering kamu pakai"
        actions={[
          {
            href: '/absen',
            icon: ScanFace,
            label: 'Absen Sekarang',
            description: 'Scan wajah untuk masuk',
            tone: 'emerald',
          },
          {
            href: '/my-attendance',
            icon: Calendar,
            label: 'Absensi Saya',
            description: 'Riwayat & ringkasan',
            tone: 'cyan',
          },
          {
            href: '/my-assignments',
            icon: BookOpen,
            label: 'Tugas Saya',
            description: 'Lihat tugas & nilai',
            tone: 'violet',
          },
          {
            href: '/my-materials',
            icon: Library,
            label: 'Materi Pelajaran',
            description: 'Download bahan ajar',
            tone: 'primary',
          },
          {
            href: '/leaderboard',
            icon: Trophy,
            label: 'Papan Peringkat',
            description: 'Lihat top siswa',
            tone: 'amber',
          },
        ]}
      />

      {/* Detail status disiplin */}
      <StudentStatusView
        student={student as StudentDisciplineSummary}
        incidents={incidents}
      />
    </div>
  );
}

function RankCard({
  label,
  rank,
  total,
  tone,
  href,
}: {
  label: string;
  rank: number | null;
  total: number;
  tone: string;
  href?: string;
}) {
  const inner = (
    <Card padding="md" className={cn('text-center h-full transition-colors', href && 'group-hover:border-primary-500/40')}>
      <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">{label}</p>
      {rank ? (
        <p className={`font-display font-bold text-3xl mt-1 ${tone}`}>
          #{rank}
          <span className="text-sm text-text-muted ml-1 font-medium">/ {total}</span>
        </p>
      ) : (
        <p className="font-display text-text-muted text-2xl mt-1">—</p>
      )}
    </Card>
  );
  if (!href) return inner;
  return (
    <Link href={href} className="block group">
      {inner}
    </Link>
  );
}
