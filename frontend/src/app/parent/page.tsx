'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Award,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  GraduationCap,
  Heart,
  Loader2,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  TrendingUp,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { getErrorMessage } from '@/lib/api';
import {
  clearParentToken,
  fetchChildAttendance,
  fetchChildBills,
  fetchChildGrades,
  fetchChildIncidents,
  fetchChildren,
  fetchParentMe,
  getParentInfo,
  getParentToken,
  parentSubmitLeave,
  type ChildSummary,
} from '@/lib/parentApi';
import { cn, formatDate } from '@/lib/utils';

type TabKey = 'overview' | 'attendance' | 'grades' | 'incidents' | 'bills' | 'leave';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatRp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID');
}

export default function ParentDashboardPage() {
  const router = useRouter();
  const [parentName, setParentName] = useState('');
  const [activeChild, setActiveChild] = useState<number | null>(null);
  const [tab, setTab] = useState<TabKey>('overview');

  // Auth check
  useEffect(() => {
    const t = getParentToken();
    if (!t) {
      router.replace('/parent/login');
      return;
    }
    const info = getParentInfo();
    if (info) setParentName(info.name);
  }, [router]);

  const { data: me } = useQuery({
    queryKey: ['parent-me'],
    queryFn: fetchParentMe,
    retry: false,
  });

  useEffect(() => {
    if (me) setParentName(me.full_name);
  }, [me]);

  const { data: children = [], isLoading } = useQuery({
    queryKey: ['parent-children'],
    queryFn: fetchChildren,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (children.length > 0 && activeChild === null) {
      setActiveChild(children[0].id);
    }
  }, [children, activeChild]);

  const child = children.find((c) => c.id === activeChild) ?? null;

  const handleLogout = () => {
    clearParentToken();
    router.push('/parent/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-surface-base">
      {/* Header */}
      <header className="border-b border-surface-border bg-surface-muted/60 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary-500/15 text-primary-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="font-display font-bold leading-tight">Portal Orang Tua</p>
              <p className="font-mono text-2xs text-text-muted truncate">
                {parentName || 'Memuat...'}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-text-muted hover:text-rose-400 text-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-5">
        {children.length === 0 ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
            <p className="font-display font-bold mb-1">Belum ada anak ter-link</p>
            <p className="text-sm text-text-muted">
              Hubungi sekolah untuk meng-link akun Anda dengan data siswa.
            </p>
          </div>
        ) : (
          <>
            {/* Children selector */}
            {children.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {children.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActiveChild(c.id);
                      setTab('overview');
                    }}
                    className={cn(
                      'inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
                      activeChild === c.id
                        ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                        : 'border-surface-border bg-surface-muted text-text-muted hover:text-text-primary'
                    )}
                  >
                    <Avatar name={c.full_name} src={c.photo_url ?? undefined} size="xs" />
                    <span className="font-medium">{c.full_name.split(' ')[0]}</span>
                    {c.unpaid_bills_count > 0 && (
                      <span className="font-mono text-2xs px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300">
                        {c.unpaid_bills_count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {child && (
              <>
                <ChildHero child={child} />

                {/* Tabs */}
                <div className="flex flex-wrap gap-1 border-b border-surface-border overflow-x-auto">
                  <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')}>
                    Ringkasan
                  </TabBtn>
                  <TabBtn active={tab === 'attendance'} onClick={() => setTab('attendance')}>
                    Kehadiran
                  </TabBtn>
                  <TabBtn active={tab === 'grades'} onClick={() => setTab('grades')}>
                    Nilai
                  </TabBtn>
                  <TabBtn active={tab === 'incidents'} onClick={() => setTab('incidents')}>
                    Disiplin
                  </TabBtn>
                  <TabBtn active={tab === 'bills'} onClick={() => setTab('bills')}>
                    Tagihan
                    {child.unpaid_bills_count > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-mono text-2xs">
                        {child.unpaid_bills_count}
                      </span>
                    )}
                  </TabBtn>
                  <TabBtn active={tab === 'leave'} onClick={() => setTab('leave')}>
                    Ajukan Izin
                  </TabBtn>
                </div>

                {tab === 'overview' && <OverviewTab child={child} />}
                {tab === 'attendance' && <AttendanceTab childId={child.id} />}
                {tab === 'grades' && <GradesTab childId={child.id} />}
                {tab === 'incidents' && <IncidentsTab childId={child.id} />}
                {tab === 'bills' && <BillsTab childId={child.id} />}
                {tab === 'leave' && <LeaveTab childId={child.id} childName={child.full_name} />}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
        active ? 'border-primary-500 text-primary-300' : 'border-transparent text-text-muted hover:text-text-primary'
      )}
    >
      {children}
    </button>
  );
}

function ChildHero({ child }: { child: ChildSummary }) {
  const attTone = child.attitude_points >= 80 ? 'text-success' : child.attitude_points >= 60 ? 'text-amber-400' : 'text-rose-400';
  const todayLabel = child.today_attendance_status
    ? {
        present: 'Hadir',
        late: 'Terlambat',
        absent: 'Tidak Hadir',
        excused: 'Izin/Sakit',
      }[child.today_attendance_status] || child.today_attendance_status
    : 'Belum absen';
  const todayTone = child.today_attendance_status === 'present'
    ? 'text-success'
    : child.today_attendance_status === 'late' ? 'text-amber-400'
    : child.today_attendance_status === 'absent' ? 'text-rose-400'
    : child.today_attendance_status === 'excused' ? 'text-cyan-400'
    : 'text-text-muted';

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-muted p-5">
      <div className="flex items-start gap-4 flex-wrap">
        <Avatar name={child.full_name} src={child.photo_url ?? undefined} size="lg" />
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-xl font-bold truncate">{child.full_name}</h2>
          <p className="font-mono text-2xs text-text-muted">
            NIS {child.employee_id} · {child.class_name ?? '—'} · {child.relationship}
          </p>
          <p className="text-sm mt-1">
            Hari ini:{' '}
            <span className={cn('font-bold', todayTone)}>{todayLabel}</span>
            {child.today_check_in_at && (
              <span className="text-text-muted text-xs ml-1">
                @{new Date(child.today_check_in_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        <Mini
          icon={<GraduationCap className="w-3.5 h-3.5" />}
          label="Rata-Rata"
          value={child.overall_gpa != null ? child.overall_gpa.toFixed(1) : '—'}
          tone="text-primary-300"
        />
        <Mini
          icon={<ShieldCheck className="w-3.5 h-3.5" />}
          label="Sikap"
          value={`${child.attitude_points}/100`}
          tone={attTone}
        />
        <Mini
          icon={<Heart className="w-3.5 h-3.5" />}
          label="Apresiasi"
          value={String(child.appreciation_points)}
          tone="text-amber-400"
        />
        <Mini
          icon={<CreditCard className="w-3.5 h-3.5" />}
          label="Tagihan"
          value={child.unpaid_bills_count > 0 ? formatRp(child.unpaid_total) : 'Lunas'}
          tone={child.unpaid_bills_count > 0 ? 'text-rose-400' : 'text-success'}
        />
      </div>
    </div>
  );
}

function Mini({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-base/40 p-2.5">
      <div className={cn('flex items-center gap-1', tone)}>
        {icon}
        <span className="font-mono text-2xs uppercase tracking-widest">{label}</span>
      </div>
      <p className={cn('font-display font-bold text-lg mt-0.5 break-words', tone)}>{value}</p>
    </div>
  );
}

function OverviewTab({ child }: { child: ChildSummary }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Card icon={<TrendingUp className="w-4 h-4 text-primary-400" />} title="Performa Akademik">
        <p className="text-text-secondary text-sm">
          Rata-rata nilai keseluruhan:{' '}
          <strong className="text-primary-300 text-lg">
            {child.overall_gpa != null ? child.overall_gpa.toFixed(1) : '—'}
          </strong>
        </p>
      </Card>
      <Card icon={<Award className="w-4 h-4 text-amber-400" />} title="Disiplin & Karakter">
        <p className="text-text-secondary text-sm">
          Poin sikap: <strong>{child.attitude_points}/100</strong><br />
          Apresiasi positif: <strong>{child.appreciation_points}</strong>
        </p>
      </Card>
    </div>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-muted p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="font-display font-semibold">{title}</p>
      </div>
      {children}
    </div>
  );
}

function AttendanceTab({ childId }: { childId: number }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['parent-attendance', childId],
    queryFn: () => fetchChildAttendance(childId, 60),
  });

  if (isLoading) return <Loader2 className="w-5 h-5 mx-auto animate-spin text-primary-400" />;
  if (data.length === 0) return <Empty msg="Belum ada catatan kehadiran" />;

  return (
    <div className="space-y-1.5">
      {data.map((r) => {
        const tone = r.status === 'present' ? 'border-success/30 bg-success/5'
          : r.status === 'late' ? 'border-amber-500/30 bg-amber-500/5'
          : r.status === 'absent' ? 'border-rose-500/30 bg-rose-500/5'
          : r.status === 'excused' ? 'border-cyan-500/30 bg-cyan-500/5'
          : 'border-surface-border';
        const label = { present: 'Hadir', late: 'Telat', absent: 'Tidak Hadir', excused: 'Izin/Sakit', holiday: 'Libur' }[r.status as keyof Record<string, string>] || r.status;
        return (
          <div key={r.date} className={cn('rounded-lg border p-3 flex items-center gap-3', tone)}>
            <div className="text-center w-12 shrink-0">
              <p className="font-mono text-2xs text-text-muted">
                {new Date(r.date).toLocaleDateString('id-ID', { weekday: 'short' })}
              </p>
              <p className="font-display font-bold text-lg">
                {new Date(r.date).getDate()}
              </p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display font-semibold text-sm">{label}</p>
              {r.check_in_at && (
                <p className="font-mono text-2xs text-text-muted">
                  Masuk {new Date(r.check_in_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  {r.check_out_at && ` · Pulang ${new Date(r.check_out_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`}
                </p>
              )}
              {r.late_minutes > 0 && (
                <p className="text-2xs text-amber-400">Telat {r.late_minutes} menit</p>
              )}
              {r.notes && <p className="text-2xs text-text-muted mt-0.5 italic">{r.notes}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GradesTab({ childId }: { childId: number }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['parent-grades', childId],
    queryFn: () => fetchChildGrades(childId),
  });

  if (isLoading) return <Loader2 className="w-5 h-5 mx-auto animate-spin text-primary-400" />;
  if (data.length === 0) return <Empty msg="Belum ada nilai" />;

  return (
    <div className="space-y-1.5">
      {data.map((g, idx) => {
        const tone = g.percent >= 80 ? 'text-success' : g.percent >= 60 ? 'text-cyan-300' : 'text-rose-400';
        return (
          <div key={idx} className="rounded-lg border border-surface-border bg-surface-muted p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-display font-semibold text-sm">{g.assignment_title}</p>
              <p className="font-mono text-2xs text-text-muted">
                {g.subject_code} · {g.teacher_name}
                {g.graded_at && ` · ${formatDate(g.graded_at)}`}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className={cn('font-display font-bold text-lg', tone)}>
                {g.score}<span className="text-xs text-text-muted">/{g.max_score}</span>
              </p>
              <p className={cn('text-2xs font-mono', tone)}>{g.percent.toFixed(0)}%</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IncidentsTab({ childId }: { childId: number }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['parent-incidents', childId],
    queryFn: () => fetchChildIncidents(childId),
  });

  if (isLoading) return <Loader2 className="w-5 h-5 mx-auto animate-spin text-primary-400" />;
  if (data.length === 0) return <Empty msg="Tidak ada catatan disiplin (bagus!)" />;

  return (
    <div className="space-y-2">
      {data.map((i) => {
        const isPenalty = i.kind === 'penalty';
        return (
          <div key={i.id} className={cn(
            'rounded-lg border p-3',
            isPenalty ? 'border-rose-500/30 bg-rose-500/5' : 'border-success/30 bg-success/5'
          )}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-display font-semibold">{i.ref_name}</p>
              <span className={cn(
                'font-mono text-2xs uppercase tracking-wider px-2 py-0.5 rounded-full',
                isPenalty ? 'bg-rose-500/15 text-rose-300 border border-rose-500/40'
                  : 'bg-success/15 text-success border border-success/40'
              )}>
                {isPenalty ? 'Pelanggaran' : 'Apresiasi'}
              </span>
            </div>
            <p className="text-2xs text-text-muted mt-1">{formatDate(i.incident_date)}</p>
            <div className="flex gap-3 mt-2 text-xs">
              {i.attitude_delta !== 0 && (
                <span className={i.attitude_delta < 0 ? 'text-rose-400' : 'text-success'}>
                  Sikap {i.attitude_delta > 0 ? '+' : ''}{i.attitude_delta}
                </span>
              )}
              {i.appreciation_delta !== 0 && (
                <span className="text-amber-400">
                  Apresiasi +{i.appreciation_delta}
                </span>
              )}
            </div>
            {i.notes && <p className="text-xs text-text-secondary mt-1 italic">{i.notes}</p>}
          </div>
        );
      })}
    </div>
  );
}

function BillsTab({ childId }: { childId: number }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['parent-bills', childId],
    queryFn: () => fetchChildBills(childId),
  });

  if (isLoading) return <Loader2 className="w-5 h-5 mx-auto animate-spin text-primary-400" />;
  if (data.length === 0) return <Empty msg="Tidak ada tagihan" />;

  return (
    <div className="space-y-2">
      {data.map((b) => {
        const isOverdue = b.status === 'unpaid' && b.due_date && new Date(b.due_date) < new Date();
        return (
          <div key={b.id} className={cn(
            'rounded-xl border p-3',
            b.status === 'paid' && 'border-success/30 bg-success/5',
            b.status === 'unpaid' && !isOverdue && 'border-amber-500/30 bg-amber-500/5',
            isOverdue && 'border-rose-500/40 bg-rose-500/5',
          )}>
            <div className="flex items-start gap-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="font-display font-semibold">{b.category_name}</p>
                <p className="font-mono text-2xs text-text-muted">Periode {b.period}</p>
                <p className="font-display font-bold text-xl mt-2">
                  {formatRp(b.amount)}
                </p>
                {b.paid_amount > 0 && b.status !== 'paid' && (
                  <p className="text-xs text-text-muted">
                    Dibayar: {formatRp(b.paid_amount)} · Sisa:{' '}
                    <span className="text-amber-400 font-bold">{formatRp(b.remaining)}</span>
                  </p>
                )}
                {b.due_date && b.status !== 'paid' && (
                  <p className={cn('text-2xs mt-1', isOverdue ? 'text-rose-400' : 'text-text-muted')}>
                    {isOverdue && '⚠ '}Jatuh tempo: {formatDate(b.due_date)}
                  </p>
                )}
              </div>
              <span className={cn(
                'font-mono text-2xs uppercase tracking-wider px-2 py-1 rounded-full',
                b.status === 'paid' && 'bg-success/15 text-success border border-success/40',
                b.status === 'unpaid' && 'bg-amber-500/15 text-amber-300 border border-amber-500/40',
              )}>
                {b.status === 'paid' ? 'Lunas' : isOverdue ? 'Lewat Tempo' : 'Belum Lunas'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeaveTab({ childId, childName }: { childId: number; childName: string }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<'sakit' | 'izin' | 'lainnya'>('izin');
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [reason, setReason] = useState('');

  const days = useMemo(() => {
    const a = new Date(startDate).getTime();
    const b = new Date(endDate).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return 0;
    return Math.max(0, Math.floor((b - a) / 86400000)) + 1;
  }, [startDate, endDate]);

  const m = useMutation({
    mutationFn: () =>
      parentSubmitLeave({
        student_id: childId,
        kind,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim(),
      }),
    onSuccess: (res) => {
      toast.success(res.message || 'Pengajuan terkirim');
      setReason('');
      qc.invalidateQueries({ queryKey: ['parent-children'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="rounded-xl border border-surface-border bg-surface-muted p-5 max-w-md">
      <p className="font-display font-semibold mb-1">Ajukan Izin untuk {childName}</p>
      <p className="text-xs text-text-muted mb-4">
        Pengajuan akan dikirim ke wali kelas. Setelah disetujui, absensi otomatis di-mark "izin/sakit".
      </p>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-text-secondary">Jenis</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm">
            <option value="sakit">Sakit</option>
            <option value="izin">Izin</option>
            <option value="lainnya">Lainnya</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-text-secondary">Mulai</label>
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (new Date(e.target.value) > new Date(endDate)) setEndDate(e.target.value); }} className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm" />
          </div>
          <div>
            <label className="text-xs text-text-secondary">Selesai</label>
            <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm" />
          </div>
        </div>
        <p className="text-2xs text-text-muted">Total: <strong className="text-primary-300">{days} hari</strong></p>
        <div>
          <label className="text-xs text-text-secondary">Alasan</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder="Sakit demam tinggi, perlu istirahat di rumah" className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm" />
        </div>
        <button
          onClick={() => m.mutate()}
          disabled={reason.trim().length < 5 || m.isPending}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
        >
          {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
          Kirim Pengajuan
        </button>
      </div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl border border-dashed border-surface-border p-8 text-center text-text-muted text-sm">
      {msg}
    </div>
  );
}
