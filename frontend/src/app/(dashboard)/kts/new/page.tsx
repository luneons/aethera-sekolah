'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gsap } from 'gsap';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Lock,
  ShieldAlert,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import {
  fetchStudents,
  fetchViolations,
  reportPenalty,
} from '@/lib/disciplineApi';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

const SEVERITY_TONE: Record<string, string> = {
  ringan: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  sedang: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  berat: 'bg-danger/10 text-danger border-danger/30',
};

export default function ReportKtsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const lockedFieldsRef = useRef<HTMLDivElement>(null);

  const initialStudentId = searchParams.get('student');
  const [studentId, setStudentId] = useState<string>(initialStudentId || '');
  const [violationCode, setViolationCode] = useState<string>('');
  const [date, setDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState<string>('');

  const { data: students = [] } = useQuery({
    queryKey: ['discipline-students-all'],
    queryFn: () => fetchStudents(),
    staleTime: 60_000,
  });
  const { data: violations = [] } = useQuery({
    queryKey: ['violation-types'],
    queryFn: fetchViolations,
    staleTime: 5 * 60 * 1000,
  });

  const student = useMemo(
    () => (studentId ? students.find((s) => s.user_id === Number(studentId)) : undefined),
    [studentId, students]
  );
  const violation = useMemo(
    () => violations.find((v) => v.code === violationCode),
    [violationCode, violations]
  );

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!student || !violation) throw new Error('Data belum lengkap');
      return reportPenalty({
        student_id: student.user_id,
        violation_code: violation.code,
        incident_date: date,
        notes: notes || undefined,
      });
    },
    onSuccess: (res) => {
      toast.success(res.message ?? 'Laporan KTS dikirim', {
        description: `${student?.full_name} — ${violation?.name}`,
      });
      // Invalidate semua cache yang ke-impact
      queryClient.invalidateQueries({ queryKey: ['discipline-student', student?.user_id] });
      queryClient.invalidateQueries({ queryKey: ['discipline-incidents', student?.user_id] });
      queryClient.invalidateQueries({ queryKey: ['discipline-students'] });
      queryClient.invalidateQueries({ queryKey: ['discipline-students-all'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['mini-leaderboard'] });
      router.push(`/student-status/${student?.user_id}`);
    },
    onError: (err) => {
      toast.error('Gagal mengirim laporan', { description: getErrorMessage(err) });
    },
  });

  // Animate in
  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.kts-section',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.08, ease: 'power2.out' }
      );
    }, containerRef);
    return () => ctx.revert();
  }, []);

  // Pulse highlight ketika auto-fill kena.
  useEffect(() => {
    if (!violation || !lockedFieldsRef.current) return;
    gsap.fromTo(
      lockedFieldsRef.current,
      { scale: 0.98, boxShadow: '0 0 0 0 rgba(0, 184, 184, 0)' },
      {
        scale: 1,
        boxShadow: '0 0 0 6px rgba(0, 184, 184, 0)',
        duration: 0.6,
        ease: 'power2.out',
      }
    );
  }, [violation?.code]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) {
      toast.error('Pilih siswa dulu.');
      return;
    }
    if (!violation) {
      toast.error('Pilih jenis pelanggaran.');
      return;
    }
    submitMutation.mutate();
  };

  return (
    <div ref={containerRef} className="max-w-4xl space-y-6">
      <button
        onClick={() => router.back()}
        className="kts-section inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary-400 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali
      </button>

      <div className="kts-section">
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert className="w-5 h-5 text-danger" />
          <span className="font-mono text-2xs uppercase tracking-widest text-danger">
            Laporan Insiden
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">
          Lapor KTS — Ketidaksesuaian Siswa
        </h1>
        <p className="font-body text-text-muted mt-1">
          Pilih jenis pelanggaran, hukuman terisi & terkunci otomatis sesuai pedoman sekolah.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        {/* Step 1 — Pilih siswa */}
        <Card padding="lg" className="kts-section">
          <SectionHeader
            no={1}
            title="Pilih Siswa"
            description="Cari berdasarkan nama atau NIS."
            icon={<User className="w-4 h-4" />}
          />
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="form-select w-full bg-surface-raised border border-surface-border rounded-lg px-3 py-2.5 text-sm font-body text-text-primary focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
          >
            <option value="">— Pilih siswa —</option>
            {students.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.full_name} — {s.employee_id} ({s.class_name ?? '—'})
              </option>
            ))}
          </select>
          {student && (
            <div className="mt-4 flex items-center gap-3 p-3 rounded-lg bg-surface-base border border-surface-border">
              <Avatar
                name={student.full_name}
                src={student.photo_url ?? undefined}
                size="md"
              />
              <div className="flex-1 min-w-0">
                <p className="font-display font-semibold text-text-primary truncate">
                  {student.full_name}
                </p>
                <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">
                  NIS {student.employee_id} · {student.class_name ?? '—'}
                </p>
              </div>
              <div className="text-right hidden sm:block">
                <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">
                  Sikap saat ini
                </p>
                <p
                  className={cn(
                    'font-display font-bold text-lg',
                    student.attitude_points >= 80
                      ? 'text-success'
                      : student.attitude_points >= 60
                        ? 'text-accent-400'
                        : 'text-danger'
                  )}
                >
                  {student.attitude_points}/100
                </p>
              </div>
            </div>
          )}
        </Card>

        {/* Step 2 — Jenis pelanggaran */}
        <Card padding="lg" className="kts-section">
          <SectionHeader
            no={2}
            title="Jenis Pelanggaran (KTS)"
            description="Pilih dari daftar — hukuman akan terisi otomatis."
            icon={<ShieldAlert className="w-4 h-4" />}
          />
          <select
            value={violationCode}
            onChange={(e) => setViolationCode(e.target.value)}
            className="form-select w-full bg-surface-raised border border-surface-border rounded-lg px-3 py-2.5 text-sm font-body text-text-primary focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
          >
            <option value="">— Pilih jenis pelanggaran —</option>
            {violations.map((v) => (
              <option key={v.code} value={v.code}>
                {v.code} — {v.name} ({v.severity.toUpperCase()})
              </option>
            ))}
          </select>

          {violation && (
            <div className="mt-3 p-3 rounded-lg border border-surface-border bg-surface-base">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'font-mono text-2xs uppercase tracking-widest px-2 py-0.5 rounded-full border',
                    SEVERITY_TONE[violation.severity]
                  )}
                >
                  {violation.severity}
                </span>
                <div className="flex-1">
                  <p className="font-display font-semibold text-text-primary">
                    {violation.name}
                  </p>
                  <p className="font-body text-sm text-text-muted mt-0.5">
                    {violation.description}
                  </p>
                  <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mt-1">
                    Kategori: {violation.category}
                  </p>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Step 3 — Hukuman otomatis (locked) */}
        <Card
          padding="lg"
          className={cn(
            'kts-section relative overflow-hidden transition-all',
            violation
              ? 'border-primary-500/40 shadow-glow-sm'
              : 'opacity-60 pointer-events-none'
          )}
        >
          {violation && (
            <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-primary-500/10 blur-3xl" />
          )}
          <div ref={lockedFieldsRef} className="relative">
            <SectionHeader
              no={3}
              title="Hukuman Otomatis"
              description="Nilai-nilai berikut terkunci sesuai pedoman sekolah — tidak bisa diubah manual."
              icon={<Lock className="w-4 h-4" />}
              accent
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <LockedField
                label="Δ Poin Sikap"
                value={violation ? `-${Math.abs(violation.attitude_penalty)}` : '—'}
                tone="text-danger"
                hint="Otomatis dipotong dari poin siswa"
              />
              <LockedField
                label="+ Jam Kersos"
                value={violation ? `${violation.kersos_hours} jam` : '—'}
                tone="text-fuchsia-400"
                hint="Wajib dijalani siswa"
              />
              <LockedField
                label="+ Jam Lembur/Bengkel"
                value={violation ? `${violation.lembur_hours} jam` : '—'}
                tone="text-orange-400"
                hint="Tergantung jenis pelanggaran"
              />
            </div>
          </div>
        </Card>

        {/* Step 4 — Detail tambahan */}
        <Card padding="lg" className="kts-section">
          <SectionHeader
            no={4}
            title="Detail Insiden"
            description="Tanggal kejadian dan catatan opsional. Pelapor otomatis = guru yang sedang login."
            icon={<CalendarDays className="w-4 h-4" />}
          />
          <Input
            label="Tanggal Insiden"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="sm:max-w-xs"
          />
          <div className="mt-3">
            <label className="block font-body text-sm font-medium text-text-secondary mb-1.5">
              Catatan (opsional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Detail tambahan atau konteks insiden..."
              className="w-full font-body text-sm text-text-primary bg-surface-raised border border-surface-border rounded-lg px-4 py-2.5 outline-none placeholder:text-text-muted focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
            />
          </div>
        </Card>

        <div className="flex flex-col sm:flex-row sm:justify-end gap-3 kts-section">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setStudentId('');
              setViolationCode('');
              setNotes('');
            }}
          >
            Reset
          </Button>
          <Button
            type="submit"
            isLoading={submitMutation.isPending}
            leftIcon={<CheckCircle2 className="w-4 h-4" />}
            disabled={!student || !violation}
          >
            Simpan & Tandai Otomatis
          </Button>
        </div>
      </form>
    </div>
  );
}

function SectionHeader({
  no,
  title,
  description,
  icon,
  accent,
}: {
  no: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <span
        className={cn(
          'inline-flex w-8 h-8 rounded-lg items-center justify-center font-display font-bold text-sm shrink-0',
          accent
            ? 'bg-primary-500/15 text-primary-300 border border-primary-500/40'
            : 'bg-surface-base text-text-secondary border border-surface-border'
        )}
      >
        {no}
      </span>
      <div className="flex-1">
        <p className="flex items-center gap-2 font-display font-semibold text-text-primary">
          {icon} {title}
        </p>
        <p className="font-body text-sm text-text-muted mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function LockedField({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-base/60 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-2xs uppercase tracking-widest text-text-muted">
          {label}
        </span>
        <Lock className="w-3 h-3 text-text-muted" />
      </div>
      <p className={cn('font-display font-bold text-2xl', tone)}>{value}</p>
      <p className="font-body text-2xs text-text-muted mt-1">{hint}</p>
    </div>
  );
}
