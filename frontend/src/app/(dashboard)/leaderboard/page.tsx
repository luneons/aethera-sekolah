'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gsap } from 'gsap';
import {
  Award,
  Filter,
  GraduationCap,
  HeartHandshake,
  School,
  Sunrise,
  Trophy,
  Users,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  LeaderboardPodium,
  LeaderboardRow,
} from '@/components/simmico/LeaderboardPodium';
import { ClassLeaderboard } from '@/components/simmico/ClassLeaderboard';
import {
  fetchClassLeaderboard,
  fetchClassNames,
  fetchLeaderboard,
  type DisciplineCategory,
} from '@/lib/disciplineApi';
import { cn } from '@/lib/utils';

type Mode = 'student' | 'class';

const STUDENT_TABS: {
  key: DisciplineCategory;
  label: string;
  description: string;
  icon: React.ElementType;
  format: (n: number) => string;
}[] = [
  {
    key: 'gpa',
    label: 'Nilai Terbaik',
    description: 'Rata-rata nilai akademik tertinggi per kelas',
    icon: GraduationCap,
    format: (n) => n.toFixed(1),
  },
  {
    key: 'punctuality',
    label: 'Siswa Paling Rajin',
    description: 'Datang paling awal & streak hadir terbanyak',
    icon: Sunrise,
    format: (n) => `${n.toFixed(1)} mnt`,
  },
  {
    key: 'appreciation',
    label: 'Pahlawan Baksos',
    description: 'Akumulasi poin apresiasi tertinggi',
    icon: HeartHandshake,
    format: (n) => n.toString(),
  },
];

export default function LeaderboardPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>('student');
  const [active, setActive] = useState<DisciplineCategory>('gpa');
  const [classFilter, setClassFilter] = useState<string>('all');

  const { data: classNames } = useQuery({
    queryKey: ['discipline-classes'],
    queryFn: fetchClassNames,
    staleTime: 5 * 60 * 1000,
  });

  const { data: studentEntries = [], isLoading: loadingStudents } = useQuery({
    queryKey: ['leaderboard', active, classFilter],
    queryFn: () =>
      fetchLeaderboard(active, classFilter === 'all' ? undefined : classFilter),
    staleTime: 30_000,
    enabled: mode === 'student',
  });

  const { data: classEntries = [], isLoading: loadingClasses } = useQuery({
    queryKey: ['leaderboard-classes'],
    queryFn: fetchClassLeaderboard,
    staleTime: 30_000,
    enabled: mode === 'class',
  });

  const studentTab = STUDENT_TABS.find((t) => t.key === active)!;
  const classOptions = ['all', ...(classNames ?? [])];

  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.lb-header',
        { opacity: 0, y: -20 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
      );
      gsap.fromTo(
        '.lb-mode-btn',
        { opacity: 0, scale: 0.95 },
        { opacity: 1, scale: 1, duration: 0.4, stagger: 0.08, ease: 'power2.out', delay: 0.05 }
      );
      gsap.fromTo(
        '.lb-tab',
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.08, ease: 'power2.out', delay: 0.15 }
      );
    }, containerRef);
    return () => ctx.revert();
  }, [mode, active, classFilter]);

  return (
    <div ref={containerRef} className="space-y-6">
      <div className="lb-header flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span className="font-mono text-2xs uppercase tracking-widest text-amber-400">
              Hall of Fame
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-display-md font-bold">
            Papan Peringkat
          </h1>
          <p className="font-body text-text-muted mt-1 text-sm sm:text-base">
            Apresiasi publik untuk disiplin & prestasi — diperbarui otomatis dari kiosk absensi & poin guru.
          </p>
        </div>

        {mode === 'student' && (
          <div className="flex items-center gap-2 self-start sm:self-end">
            <Filter className="w-4 h-4 text-text-muted" />
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="form-select bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm font-body text-text-primary focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
            >
              {classOptions.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? 'Semua Kelas' : c}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Mode toggle: Student vs Class */}
      <div className="inline-flex rounded-xl border border-surface-border bg-surface-raised p-1.5 self-start">
        <ModeButton
          active={mode === 'student'}
          onClick={() => setMode('student')}
          icon={<Users className="w-4 h-4" />}
          label="Per Siswa"
        />
        <ModeButton
          active={mode === 'class'}
          onClick={() => setMode('class')}
          icon={<School className="w-4 h-4" />}
          label="Per Kelas"
        />
      </div>

      {mode === 'student' ? (
        <>
          {/* Student tabs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {STUDENT_TABS.map((t) => {
              const Icon = t.icon;
              const isActive = t.key === active;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActive(t.key)}
                  className={cn(
                    'lb-tab relative text-left rounded-xl border p-4 transition-all group overflow-hidden',
                    isActive
                      ? 'border-primary-500 bg-primary-500/10 shadow-glow-sm'
                      : 'border-surface-border bg-surface-raised hover:border-primary-500/40'
                  )}
                >
                  <div
                    className={cn(
                      'absolute -right-6 -top-6 w-24 h-24 rounded-full blur-2xl transition-opacity',
                      isActive
                        ? 'bg-primary-500/30 opacity-100'
                        : 'bg-primary-500/10 opacity-0 group-hover:opacity-100'
                    )}
                  />
                  <div className="relative flex items-start gap-3">
                    <div
                      className={cn(
                        'p-2 rounded-lg shrink-0',
                        isActive
                          ? 'bg-primary-500/20 text-primary-300'
                          : 'bg-surface-base text-text-secondary'
                      )}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-display font-semibold text-text-primary">
                        {t.label}
                      </p>
                      <p className="font-body text-xs text-text-muted mt-0.5">
                        {t.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Podium */}
          <Card padding="lg" variant="glass">
            <div className="flex items-center gap-2 mb-6">
              <Award className="w-5 h-5 text-amber-400" />
              <h2 className="font-display font-semibold text-lg">{studentTab.label}</h2>
              <span className="font-mono text-2xs uppercase tracking-widest text-text-muted ml-auto">
                {classFilter === 'all' ? 'Lintas Kelas' : classFilter}
              </span>
            </div>
            {loadingStudents ? (
              <p className="text-text-muted text-center py-12 font-body">
                Memuat papan peringkat...
              </p>
            ) : studentEntries.length >= 3 ? (
              <LeaderboardPodium entries={studentEntries} formatValue={studentTab.format} />
            ) : (
              <p className="text-text-muted text-center py-12 font-body">
                Belum cukup data di kelas ini untuk membentuk podium.
              </p>
            )}
          </Card>

          {/* Full ranking */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold text-lg">Peringkat Lengkap</h3>
                <p className="font-body text-sm text-text-muted">
                  Top 10 — {studentTab.description.toLowerCase()}
                </p>
              </div>
              <Button variant="ghost" size="sm">
                Export CSV
              </Button>
            </div>
            <div className="space-y-2">
              {studentEntries.map((e) => (
                <LeaderboardRow
                  key={e.student_id}
                  entry={e}
                  formatValue={studentTab.format}
                />
              ))}
              {!loadingStudents && studentEntries.length === 0 && (
                <p className="text-text-muted text-center py-8 font-body">
                  Tidak ada data peringkat.
                </p>
              )}
            </div>
          </Card>
        </>
      ) : (
        <Card padding="lg" variant="glass">
          <div className="flex items-center gap-2 mb-6">
            <School className="w-5 h-5 text-amber-400" />
            <h2 className="font-display font-semibold text-lg">Peringkat Kelas Terbaik</h2>
            <span className="font-mono text-2xs uppercase tracking-widest text-text-muted ml-auto">
              Skor Komposit
            </span>
          </div>
          {loadingClasses ? (
            <p className="text-text-muted text-center py-12 font-body">
              Memuat peringkat kelas...
            </p>
          ) : (
            <ClassLeaderboard entries={classEntries} />
          )}
        </Card>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'lb-mode-btn inline-flex items-center gap-2 px-4 py-2 rounded-lg font-display font-semibold text-sm transition-all',
        active
          ? 'bg-primary-500/20 text-primary-300 shadow-glow-sm'
          : 'text-text-muted hover:text-text-secondary'
      )}
    >
      {icon}
      {label}
    </button>
  );
}
