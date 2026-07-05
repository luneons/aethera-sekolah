'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { gsap } from 'gsap';
import {
  ArrowRight,
  GraduationCap,
  HeartHandshake,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { BadgeRow } from '@/components/simmico/StudentBadge';
import { fetchClassNames, fetchStudents } from '@/lib/disciplineApi';
import { cn } from '@/lib/utils';

export default function StudentStatusListPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');

  const { data: classNames } = useQuery({
    queryKey: ['discipline-classes'],
    queryFn: fetchClassNames,
    staleTime: 5 * 60 * 1000,
  });

  const { data: students = [], isLoading } = useQuery({
    queryKey: ['discipline-students', classFilter],
    queryFn: () =>
      fetchStudents({
        class_name: classFilter === 'all' ? undefined : classFilter,
      }),
    staleTime: 30_000,
  });

  const classOptions = useMemo(
    () => ['all', ...(classNames ?? [])],
    [classNames]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        s.employee_id.toLowerCase().includes(q) ||
        (s.class_name ?? '').toLowerCase().includes(q)
    );
  }, [query, students]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.ss-card',
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.03, ease: 'power2.out' }
      );
    }, containerRef);
    return () => ctx.revert();
  }, [filtered.length]);

  return (
    <div ref={containerRef} className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">
          Status Siswa
        </h1>
        <p className="font-body text-text-muted mt-1">
          Profil disiplin & prestasi tiap siswa — poin sikap, apresiasi, dan tunggakan jam.
        </p>
      </div>

      <Card padding="md" className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <Input
            placeholder="Cari nama, NIS, atau kelas..."
            leftIcon={<Search className="w-4 h-4" />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="form-select bg-surface-raised border border-surface-border rounded-lg px-3 text-sm font-body text-text-primary focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
        >
          {classOptions.map((c) => (
            <option key={c} value={c}>
              {c === 'all' ? 'Semua Kelas' : c}
            </option>
          ))}
        </select>
      </Card>

      {isLoading && (
        <p className="text-center font-body text-text-muted py-12">
          Memuat daftar siswa...
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((s) => {
          const att = s.attitude_points;
          const attTone =
            att >= 80
              ? 'text-success'
              : att >= 60
                ? 'text-accent-400'
                : 'text-danger';
          return (
            <Link
              key={s.user_id}
              href={`/student-status/${s.user_id}`}
              className="ss-card group"
            >
              <Card
                padding="md"
                className="h-full hover:border-primary-500/40 transition-all"
              >
                <div className="flex items-start gap-3">
                  <Avatar
                    name={s.full_name}
                    src={s.photo_url ?? undefined}
                    size="lg"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold text-base truncate group-hover:text-primary-300 transition-colors">
                      {s.full_name}
                    </p>
                    <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">
                      {s.employee_id} · {s.class_name ?? '—'}
                    </p>
                    <div className="mt-2">
                      <BadgeRow badges={s.badges.slice(0, 3)} />
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-primary-400 group-hover:translate-x-1 transition-all" />
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4">
                  <Mini
                    icon={<GraduationCap className="w-3.5 h-3.5" />}
                    label="GPA"
                    value={s.gpa.toFixed(1)}
                    tone="text-primary-300"
                  />
                  <Mini
                    icon={<ShieldCheck className="w-3.5 h-3.5" />}
                    label="Sikap"
                    value={String(s.attitude_points)}
                    tone={cn(attTone)}
                  />
                  <Mini
                    icon={<HeartHandshake className="w-3.5 h-3.5" />}
                    label="Apresiasi"
                    value={String(s.appreciation_points)}
                    tone="text-amber-400"
                  />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {!isLoading && filtered.length === 0 && (
        <p className="text-center font-body text-text-muted py-12">
          Tidak ada siswa cocok dengan pencarian.
        </p>
      )}
    </div>
  );
}

function Mini({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg bg-surface-base/60 border border-surface-border px-2 py-2 text-center">
      <span className="inline-flex items-center gap-1 font-mono text-2xs uppercase tracking-widest text-text-muted">
        {icon}
        {label}
      </span>
      <p className={cn('font-display font-bold text-base mt-0.5', tone)}>
        {value}
      </p>
    </div>
  );
}
