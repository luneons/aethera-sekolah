'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import {
  Clock,
  GraduationCap,
  HardHat,
  HeartHandshake,
  Minus,
  Plus,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { PointPill } from '@/components/simmico/PointPill';
import { BadgeRow } from '@/components/simmico/StudentBadge';
import { IncidentLedger } from '@/components/simmico/IncidentLedger';
import type { IncidentRecord, StudentDisciplineSummary } from '@/lib/disciplineApi';
import { cn } from '@/lib/utils';

interface StudentStatusViewProps {
  student: StudentDisciplineSummary;
  incidents: IncidentRecord[];
  /** Optional header bar (back button, action buttons). */
  topAction?: React.ReactNode;
}

/**
 * Profile status siswa lengkap. Dipakai oleh:
 * - /student-status/[id] (admin / guru lihat siswa lain)
 * - /my-status (siswa lihat dirinya sendiri)
 */
export function StudentStatusView({
  student,
  incidents,
  topAction,
}: StudentStatusViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.ss-section',
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out' }
      );
    }, containerRef);
    return () => ctx.revert();
  }, [student.user_id]);

  const totalIncidents = incidents.length;
  const totalPenalty = incidents.filter((i) => i.kind === 'penalty').length;
  const totalAdjustment = incidents.filter((i) => i.kind === 'adjustment').length;

  return (
    <div ref={containerRef} className="space-y-6">
      {/* Hero */}
      <Card padding="lg" variant="glass" className="ss-section relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-72 h-72 rounded-full bg-primary-500/10 blur-3xl" />
        <div className="relative flex flex-col md:flex-row gap-5 md:items-center">
          <div className="flex items-center gap-4 flex-1">
            <Avatar
              name={student.full_name}
              src={student.photo_url ?? undefined}
              size="xl"
              status="online"
            />
            <div className="flex-1 min-w-0">
              <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">
                Profil Status Siswa
              </p>
              <h1 className="font-display text-2xl sm:text-display-md font-bold leading-tight">
                {student.full_name}
              </h1>
              <p className="font-mono text-sm text-text-secondary mt-1">
                NIS {student.employee_id}
                {student.class_name ? ` · ${student.class_name}` : ''}
                {student.major ? ` · ${student.major}` : ''}
              </p>
              <div className="mt-2">
                <BadgeRow badges={student.badges} />
              </div>
            </div>
          </div>
          {topAction}
        </div>
      </Card>

      {/* Main metric row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 ss-section">
        <PointPill
          label="Rata-Rata Nilai"
          value={student.gpa.toFixed(1)}
          tone="primary"
          icon={<GraduationCap className="w-4 h-4" />}
        />
        <PointPill
          label="Poin Sikap"
          value={student.attitude_points}
          numeric={student.attitude_points}
          tone="auto-attitude"
          suffix="/100"
          icon={<ShieldCheck className="w-4 h-4" />}
        />
        <PointPill
          label="Poin Apresiasi"
          value={student.appreciation_points}
          tone="gold"
          icon={<HeartHandshake className="w-4 h-4" />}
        />
      </div>

      {/* Hutang Jam */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ss-section">
        <DueBox
          icon={<Wrench className="w-5 h-5" />}
          label="Hutang Jam Lembur (Bengkel/Praktek)"
          value={student.lembur_hours_owed}
          tone="text-orange-400"
          chipColor="bg-orange-500/10 border-orange-500/30"
          unit="jam"
          empty="Tidak ada tunggakan jam praktek"
        />
        <DueBox
          icon={<HardHat className="w-5 h-5" />}
          label="Jam Kersos (Kerja Sosial)"
          value={student.kersos_hours_owed}
          tone="text-fuchsia-400"
          chipColor="bg-fuchsia-500/10 border-fuchsia-500/30"
          unit="jam"
          empty="Bersih dari kewajiban kersos"
        />
      </div>

      {/* Trend chart */}
      <Card padding="lg" className="ss-section">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold text-lg">
              Tren Poin Siswa
            </h3>
            <p className="font-body text-sm text-text-muted">
              6 minggu terakhir — sikap & apresiasi
            </p>
          </div>
          <div className="flex items-center gap-3 text-2xs font-mono uppercase tracking-widest">
            <span className="flex items-center gap-1 text-primary-300">
              <span className="w-2 h-2 rounded-full bg-primary-400" /> Sikap
            </span>
            <span className="flex items-center gap-1 text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-400" /> Apresiasi
            </span>
          </div>
        </div>
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={student.trend}
              margin={{ top: 4, right: 8, left: -12, bottom: 0 }}
            >
              <defs>
                <linearGradient id="grad-att" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00d4d4" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#00d4d4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="grad-apr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffc107" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#ffc107" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a3045" vertical={false} />
              <XAxis
                dataKey="week"
                stroke="#4a6b82"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                fontFamily="JetBrains Mono"
              />
              <YAxis
                stroke="#4a6b82"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                fontFamily="JetBrains Mono"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0a1520',
                  border: '1px solid #1a3045',
                  borderRadius: 8,
                  color: '#e8f4f8',
                }}
              />
              <Area
                type="monotone"
                dataKey="attitude"
                name="Poin Sikap"
                stroke="#00d4d4"
                strokeWidth={2.5}
                fill="url(#grad-att)"
              />
              <Area
                type="monotone"
                dataKey="appreciation"
                name="Apresiasi"
                stroke="#ffc107"
                strokeWidth={2}
                fill="url(#grad-apr)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Ledger */}
      <Card padding="lg" className="ss-section">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold text-lg">Ledger Disiplin</h3>
            <p className="font-body text-sm text-text-muted">
              {totalIncidents} catatan ({totalPenalty} pelanggaran, {totalAdjustment} penyesuaian)
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-2xs font-mono uppercase tracking-widest">
            <span className="flex items-center gap-1 text-danger">
              <Minus className="w-3 h-3" /> Penalti
            </span>
            <span className="flex items-center gap-1 text-success">
              <Plus className="w-3 h-3" /> Adjustment
            </span>
          </div>
        </div>
        <IncidentLedger incidents={incidents} />
      </Card>
    </div>
  );
}

function DueBox({
  icon,
  label,
  value,
  tone,
  chipColor,
  unit,
  empty,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
  chipColor: string;
  unit: string;
  empty: string;
}) {
  return (
    <Card
      padding="md"
      className={cn(
        'border',
        value > 0 ? chipColor : 'border-success/30 bg-success/5'
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'p-2.5 rounded-lg shrink-0',
            value > 0 ? chipColor : 'bg-success/10 text-success'
          )}
        >
          <span className={value > 0 ? tone : 'text-success'}>{icon}</span>
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">
            {label}
          </p>
          {value > 0 ? (
            <p className={cn('font-display font-bold text-2xl mt-1', tone)}>
              {value}
              <span className="font-display text-base font-medium ml-1 opacity-70">
                {unit}
              </span>
            </p>
          ) : (
            <p className="font-display font-semibold text-base mt-1 text-success">
              <Clock className="inline-block w-4 h-4 mr-1" /> {empty}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
