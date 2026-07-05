'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookCheck,
  Filter,
  GraduationCap,
  School,
  Sigma,
  TrendingUp,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { fetchGradebook, fetchSubjects } from '@/lib/lmsApi';
import api, { type Envelope } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn } from '@/lib/utils';

interface SchoolClass {
  id: number;
  name: string;
  grade?: string | null;
  major?: string | null;
}

/**
 * Gradebook — matrix nilai siswa × tugas dalam satu kelas.
 * - Wali kelas: default ke kelas yang dia pegang
 * - Kepsek/BK: pilih kelas dari dropdown
 */
export default function GradebookPage() {
  const me = useAuthStore((s) => s.user);
  const [classId, setClassId] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);

  const { data: classes = [] } = useQuery<SchoolClass[]>({
    queryKey: ['school-classes-list'],
    queryFn: async () => {
      const r = await api.get<Envelope<SchoolClass[]>>('/org/school-classes');
      return r.data.data ?? [];
    },
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: fetchSubjects,
  });

  // Auto-pilih kelas pertama kalau wali kelas (backend juga auto-scope, tapi kita force pilih kelas-nya untuk UI feedback)
  const effectiveClassId = useMemo(() => {
    if (classId) return classId;
    if (me?.role === 'admin') {
      // Wali kelas — tidak perlu pilih, backend auto-scope ke homeroom
      return null;
    }
    if (classes.length > 0) return classes[0].id;
    return null;
  }, [classId, me?.role, classes]);

  const { data: gradebook, isLoading } = useQuery({
    queryKey: ['gradebook', effectiveClassId, subjectId],
    queryFn: () =>
      fetchGradebook({
        school_class_id: effectiveClassId ?? undefined,
        subject_id: subjectId ?? undefined,
      }),
    enabled: me?.role === 'admin' || effectiveClassId !== null,
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <BookCheck className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Gradebook
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Nilai Siswa</h1>
        <p className="font-body text-text-muted mt-1">
          Pantau semua nilai siswa per kelas dalam satu tampilan matrix.
        </p>
      </div>

      <Card padding="md">
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-text-muted shrink-0" />
          {me?.role !== 'admin' && (
            <div className="flex items-center gap-2">
              <School className="w-4 h-4 text-text-muted" />
              <select
                value={effectiveClassId ?? ''}
                onChange={(e) =>
                  setClassId(e.target.value ? Number(e.target.value) : null)
                }
                className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm font-body text-text-primary focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
              >
                <option value="">— Pilih Kelas —</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-text-muted" />
            <select
              value={subjectId ?? ''}
              onChange={(e) =>
                setSubjectId(e.target.value ? Number(e.target.value) : null)
              }
              className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm font-body text-text-primary focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
            >
              <option value="">Semua Mata Pelajaran</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-center font-body text-text-muted py-12">Memuat gradebook...</p>
      ) : !gradebook ? (
        <Card padding="lg" className="text-center">
          <BookCheck className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="font-display font-semibold">Pilih kelas dulu</p>
        </Card>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat
              label="Kelas"
              value={gradebook.class_name}
              icon={<School className="w-4 h-4" />}
              tone="role-accent-text"
            />
            <Stat
              label="Total Siswa"
              value={String(gradebook.stats.students_count)}
              icon={<GraduationCap className="w-4 h-4" />}
              tone="text-primary-300"
            />
            <Stat
              label="Total Tugas"
              value={String(gradebook.stats.assignments_count)}
              icon={<BookCheck className="w-4 h-4" />}
              tone="text-amber-400"
            />
            <Stat
              label="Sudah Dinilai"
              value={`${gradebook.stats.graded_total}/${gradebook.stats.graded_total + gradebook.stats.ungraded_total}`}
              icon={<TrendingUp className="w-4 h-4" />}
              tone="text-success"
            />
          </div>

          {gradebook.assignments.length === 0 ? (
            <Card padding="lg" className="text-center">
              <BookCheck className="w-12 h-12 text-text-muted mx-auto mb-3" />
              <p className="font-display font-semibold">Belum ada tugas di kelas ini</p>
              <p className="font-body text-sm text-text-muted mt-1">
                Buat tugas dulu di menu <span className="font-mono">Tugas & Nilai</span>.
              </p>
            </Card>
          ) : (
            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <Th sticky>Siswa</Th>
                      {gradebook.assignments.map((a) => (
                        <Th key={a.id} center>
                          <div className="flex flex-col items-center gap-0.5">
                            <span
                              className="text-[10px] font-mono uppercase tracking-widest text-text-muted truncate max-w-[140px]"
                              title={a.title}
                            >
                              {a.subject_code} · {a.assignment_type}
                            </span>
                            <Link
                              href={`/assignments/${a.id}`}
                              className="font-mono text-xs font-bold text-text-primary hover:text-primary-400 truncate max-w-[140px]"
                              title={a.title}
                            >
                              {a.title}
                            </Link>
                            <span className="text-2xs text-text-muted">
                              maks {a.max_score} · ×{a.weight}
                            </span>
                          </div>
                        </Th>
                      ))}
                      <Th center>
                        <span className="font-mono text-2xs uppercase tracking-widest">
                          <Sigma className="inline w-3 h-3" /> Rata-rata
                        </span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradebook.students.map((s) => {
                      // Hitung rata-rata weighted siswa ini
                      let totalW = 0;
                      let weightedSum = 0;
                      for (const a of gradebook.assignments) {
                        const cell = gradebook.grades[s.id]?.[a.id];
                        if (cell && a.max_score > 0) {
                          const norm = (cell.score / a.max_score) * 100;
                          weightedSum += norm * a.weight;
                          totalW += a.weight;
                        }
                      }
                      const avg = totalW > 0 ? weightedSum / totalW : null;
                      const avgTone =
                        avg === null
                          ? 'text-text-muted'
                          : avg >= 80
                            ? 'text-success'
                            : avg >= 60
                              ? 'text-cyan-300'
                              : 'text-rose-400';

                      return (
                        <tr
                          key={s.id}
                          className="hover:bg-surface-muted/40 border-b border-surface-border"
                        >
                          <Td sticky>
                            <Link
                              href={`/grades/${s.id}`}
                              className="flex items-center gap-2 hover:text-primary-300"
                              title="Lihat detail nilai siswa"
                            >
                              <Avatar
                                name={s.name}
                                src={s.photo_url ?? undefined}
                                size="xs"
                              />
                              <div className="min-w-0">
                                <p className="font-body text-sm font-medium truncate">
                                  {s.name}
                                </p>
                                <p className="font-mono text-2xs text-text-muted">
                                  {s.nis}
                                </p>
                              </div>
                            </Link>
                          </Td>
                          {gradebook.assignments.map((a) => {
                            const cell = gradebook.grades[s.id]?.[a.id];
                            const score = cell?.score;
                            const pct =
                              score !== undefined && a.max_score > 0
                                ? (score / a.max_score) * 100
                                : null;
                            const tone =
                              pct === null
                                ? 'text-text-muted'
                                : pct >= 80
                                  ? 'text-success'
                                  : pct >= 60
                                    ? 'text-cyan-300'
                                    : 'text-rose-400';
                            return (
                              <Td key={a.id} center>
                                {score !== undefined ? (
                                  <span
                                    className={cn('font-mono font-bold text-sm', tone)}
                                    title={cell?.note ?? undefined}
                                  >
                                    {Number.isInteger(score) ? score : score.toFixed(1)}
                                  </span>
                                ) : (
                                  <span className="text-text-muted text-2xs">—</span>
                                )}
                              </Td>
                            );
                          })}
                          <Td center>
                            {avg !== null ? (
                              <span className={cn('font-display font-bold', avgTone)}>
                                {avg.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </Td>
                        </tr>
                      );
                    })}

                    {/* Footer rata-rata kelas */}
                    <tr className="bg-surface-base/40 sticky bottom-0">
                      <Td sticky>
                        <span className="font-mono text-2xs uppercase tracking-widest text-text-muted">
                          Rata-rata Kelas
                        </span>
                      </Td>
                      {gradebook.assignments.map((a) => {
                        const avg = gradebook.stats.class_avg_per_assignment[a.id];
                        const pct = avg !== null && a.max_score > 0 ? (avg / a.max_score) * 100 : null;
                        const tone =
                          pct === null
                            ? 'text-text-muted'
                            : pct >= 80
                              ? 'text-success'
                              : pct >= 60
                                ? 'text-cyan-300'
                                : 'text-rose-400';
                        return (
                          <Td key={a.id} center>
                            {avg !== null ? (
                              <span className={cn('font-mono font-semibold text-sm', tone)}>
                                {avg.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-text-muted text-2xs">—</span>
                            )}
                          </Td>
                        );
                      })}
                      <Td center>
                        {(() => {
                          const validAvgs = Object.values(gradebook.stats.class_avg_per_assignment).filter(
                            (v): v is number => v !== null
                          );
                          if (validAvgs.length === 0)
                            return <span className="text-text-muted">—</span>;
                          const overall = validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length;
                          return (
                            <span className="font-display font-bold role-accent-text">
                              {overall.toFixed(1)}
                            </span>
                          );
                        })()}
                      </Td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card padding="md" className="bg-primary-500/5 border-primary-500/30">
            <p className="font-mono text-2xs uppercase tracking-widest text-primary-300 mb-1">
              <ArrowRight className="inline w-3 h-3 mr-1" /> Cara input nilai
            </p>
            <p className="font-body text-sm text-text-secondary">
              Klik judul tugas di header untuk membuka halaman input nilai (manual atau import CSV/XLSX).
              Nilai akan otomatis terupdate di sini begitu kamu simpan.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function Th({
  children,
  sticky,
  center,
}: {
  children: React.ReactNode;
  sticky?: boolean;
  center?: boolean;
}) {
  return (
    <th
      className={cn(
        'px-3 py-2 font-mono text-2xs text-text-muted uppercase tracking-widest font-semibold border-b border-surface-border bg-surface-muted',
        center ? 'text-center' : 'text-left',
        sticky && 'sticky left-0 z-10 min-w-[180px]'
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  sticky,
  center,
}: {
  children: React.ReactNode;
  sticky?: boolean;
  center?: boolean;
}) {
  return (
    <td
      className={cn(
        'px-3 py-2 align-middle',
        center ? 'text-center' : '',
        sticky && 'sticky left-0 bg-surface-base/95 backdrop-blur-sm z-[5] min-w-[180px]'
      )}
    >
      {children}
    </td>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <Card padding="md">
      <div className="flex items-center gap-2 mb-1 text-text-muted">
        <span className={cn('inline-flex', tone)}>{icon}</span>
        <span className="font-mono text-2xs uppercase tracking-widest">{label}</span>
      </div>
      <p className={cn('font-display font-bold text-xl truncate', tone)}>{value}</p>
    </Card>
  );
}
