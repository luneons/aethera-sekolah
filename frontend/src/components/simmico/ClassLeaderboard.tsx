'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import {
  Crown,
  GraduationCap,
  HeartHandshake,
  Sunrise,
  Trophy,
  Users,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import type { ClassLeaderboardEntry } from '@/lib/disciplineApi';
import { cn } from '@/lib/utils';

interface ClassLeaderboardProps {
  entries: ClassLeaderboardEntry[];
}

const PODIUM_TONE = {
  1: { cls: 'podium-gold', label: 'JUARA 1', height: 'h-44 md:h-56', ring: 'ring-amber-300' },
  2: { cls: 'podium-silver', label: 'JUARA 2', height: 'h-32 md:h-44', ring: 'ring-slate-200' },
  3: { cls: 'podium-bronze', label: 'JUARA 3', height: 'h-28 md:h-36', ring: 'ring-amber-700' },
} as const;

/**
 * Podium kelas + tabel detail metrik agregasi.
 *
 * Skor komposit dijelaskan inline supaya guru/kepsek paham
 * cara penilaiannya transparan.
 */
export function ClassLeaderboard({ entries }: ClassLeaderboardProps) {
  const podiumRef = useRef<HTMLDivElement>(null);
  const top3 = entries.slice(0, 3);

  useEffect(() => {
    if (!podiumRef.current || top3.length < 3) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.cl-pillar',
        { y: 60, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.7,
          ease: 'back.out(1.4)',
          stagger: { each: 0.15, from: 'edges' },
        }
      );
      gsap.fromTo(
        '.cl-row',
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.4, stagger: 0.04, ease: 'power2.out', delay: 0.4 }
      );
    }, podiumRef);
    return () => ctx.revert();
  }, [entries.map((e) => e.class_id).join(',')]);

  if (entries.length === 0) {
    return (
      <p className="text-text-muted text-center py-12 font-body">
        Belum ada data peringkat kelas.
      </p>
    );
  }

  return (
    <div ref={podiumRef} className="space-y-6">
      {/* Podium */}
      {top3.length >= 3 && (
        <div className="grid grid-cols-3 gap-3 md:gap-6 items-end">
          {[top3[1], top3[0], top3[2]].map((e) => {
            const rank = e.rank as 1 | 2 | 3;
            const tone = PODIUM_TONE[rank];
            return (
              <div key={e.class_id} className="cl-pillar flex flex-col items-center">
                <div className="relative mb-3">
                  {rank === 1 && (
                    <Crown className="absolute -top-7 left-1/2 -translate-x-1/2 w-7 h-7 text-amber-300 drop-shadow-lg" />
                  )}
                  <div
                    className={cn(
                      'inline-flex items-center justify-center rounded-2xl ring-4 shadow-card-hover',
                      tone.ring,
                      rank === 1 ? 'w-20 h-20' : 'w-16 h-16',
                      'bg-gradient-to-br from-primary-700 to-primary-900 text-primary-200'
                    )}
                  >
                    <GraduationCap className={rank === 1 ? 'w-9 h-9' : 'w-7 h-7'} />
                  </div>
                </div>
                <div
                  className={cn(
                    'w-full rounded-t-2xl border border-white/20 px-3 py-4 text-center flex flex-col justify-end',
                    tone.cls,
                    tone.height
                  )}
                >
                  <p className="font-mono text-2xs tracking-[0.25em] font-bold opacity-80">
                    {tone.label}
                  </p>
                  <p className="font-display font-bold text-base md:text-lg leading-tight mt-1 truncate">
                    {e.class_name}
                  </p>
                  <p className="font-mono text-2xs opacity-80 truncate">
                    {e.student_count} siswa
                  </p>
                  <p className="font-display text-2xl md:text-3xl font-bold mt-2">
                    {e.composite_score.toFixed(1)}
                  </p>
                  {e.top_student && (
                    <p className="font-mono text-2xs opacity-70 mt-1 truncate">
                      ★ {e.top_student}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabel detail */}
      <Card padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border bg-surface-muted/40">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h3 className="font-display font-semibold">Detail Peringkat Kelas</h3>
          </div>
          <p className="font-mono text-2xs uppercase tracking-widest text-text-muted hidden sm:block">
            30% GPA · 30% Sikap · 20% Apresiasi · 20% Ketepatan
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-base/40 border-b border-surface-border">
              <tr className="text-left">
                <Th>#</Th>
                <Th>Kelas</Th>
                <Th>Wali Kelas</Th>
                <Th className="text-center">Siswa</Th>
                <Th icon={<GraduationCap className="w-3 h-3" />}>GPA</Th>
                <Th icon={<HeartHandshake className="w-3 h-3" />}>Apresiasi</Th>
                <Th icon={<Sunrise className="w-3 h-3" />}>Ketepatan</Th>
                <Th>Sikap</Th>
                <Th className="text-right">Skor Komposit</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {entries.map((e) => (
                <tr key={e.class_id} className="cl-row hover:bg-surface-muted/40 transition-colors">
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center justify-center w-7 h-7 rounded-full font-mono font-bold text-2xs',
                        e.rank === 1
                          ? 'podium-gold'
                          : e.rank === 2
                            ? 'podium-silver'
                            : e.rank === 3
                              ? 'podium-bronze'
                              : 'bg-surface-base text-text-secondary border border-surface-border'
                      )}
                    >
                      {e.rank}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-display font-semibold text-sm">{e.class_name}</p>
                    <p className="font-mono text-2xs text-text-muted">
                      Kelas {e.grade ?? '—'} · {e.major ?? '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-text-secondary">
                    {e.homeroom_teacher ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 font-mono text-xs text-text-secondary">
                      <Users className="w-3 h-3" /> {e.student_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-display font-semibold text-primary-300">
                    {e.avg_gpa.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">
                    <span className="text-amber-400 font-display font-semibold">
                      {e.total_appreciation}
                    </span>
                    <span className="text-text-muted text-2xs ml-1">total</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                    {e.avg_punctuality_min <= 0 ? (
                      <span className="text-success">
                        {Math.abs(e.avg_punctuality_min).toFixed(1)} mnt awal
                      </span>
                    ) : (
                      <span className="text-accent-400">
                        +{e.avg_punctuality_min.toFixed(1)} mnt
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">
                    <AttitudeBar value={e.avg_attitude} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-display text-lg font-bold text-primary-300">
                      {e.composite_score.toFixed(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Th({ children, icon, className }: { children: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'px-4 py-2.5 font-mono text-2xs text-text-muted uppercase tracking-widest font-semibold',
        className
      )}
    >
      <span className="inline-flex items-center gap-1">
        {icon}
        {children}
      </span>
    </th>
  );
}

function AttitudeBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const tone =
    pct >= 80 ? 'bg-success' : pct >= 60 ? 'bg-accent-500' : 'bg-danger';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-[60px] h-1.5 rounded-full bg-surface-overlay overflow-hidden">
        <span className={cn('block h-full', tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-text-secondary w-8 text-right">
        {pct.toFixed(0)}
      </span>
    </div>
  );
}
