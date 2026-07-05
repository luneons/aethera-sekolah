'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  LogIn,
  LogOut,
  Timer,
  CalendarDays,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/lib/api';
import {
  fetchSchedules,
  createSchedule,
  updateSchedule,
  activateSchedule,
  deleteSchedule,
  formatWorkDays,
  type Schedule,
  type SchedulePayload,
} from '@/lib/scheduleApi';

const DAYS = [
  { value: '1', label: 'Senin' },
  { value: '2', label: 'Selasa' },
  { value: '3', label: 'Rabu' },
  { value: '4', label: 'Kamis' },
  { value: '5', label: 'Jumat' },
  { value: '6', label: 'Sabtu' },
  { value: '7', label: 'Minggu' },
];

const DEFAULT_FORM: SchedulePayload = {
  name: '',
  check_in_start: '06:30',
  check_in_end: '07:30',
  check_out_start: '14:00',
  grace_period: 15,
  work_days: '1,2,3,4,5',
};

export default function SchedulePage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Schedule | null>(null);
  const [form, setForm] = useState<SchedulePayload>(DEFAULT_FORM);
  const [selectedDays, setSelectedDays] = useState<string[]>(['1', '2', '3', '4', '5']);

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: fetchSchedules,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['schedules'] });

  const createMut = useMutation({
    mutationFn: createSchedule,
    onSuccess: () => { toast.success('Jadwal berhasil dibuat'); invalidate(); closeForm(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SchedulePayload }) =>
      updateSchedule(id, payload),
    onSuccess: () => { toast.success('Jadwal diperbarui'); invalidate(); closeForm(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const activateMut = useMutation({
    mutationFn: activateSchedule,
    onSuccess: (s) => { toast.success(`Jadwal "${s.name}" diaktifkan`); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => { toast.success('Jadwal dihapus'); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openCreate = () => {
    setEditTarget(null);
    setForm(DEFAULT_FORM);
    setSelectedDays(['1', '2', '3', '4', '5']);
    setShowForm(true);
  };

  const openEdit = (s: Schedule) => {
    setEditTarget(s);
    setForm({
      name: s.name,
      check_in_start: s.check_in_start,
      check_in_end: s.check_in_end,
      check_out_start: s.check_out_start,
      grace_period: s.grace_period,
      work_days: s.work_days ?? '1,2,3,4,5',
    });
    setSelectedDays((s.work_days ?? '1,2,3,4,5').split(',').map((d) => d.trim()));
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditTarget(null); };

  const toggleDay = (d: string) => {
    setSelectedDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: SchedulePayload = {
      ...form,
      work_days: selectedDays.join(','),
    };
    if (editTarget) {
      updateMut.mutate({ id: editTarget.id, payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const activeSchedule = schedules.find((s) => s.is_active);
  const isBusy = createMut.isPending || updateMut.isPending;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-2xl flex items-center gap-2">
            <Clock className="w-6 h-6 text-primary-400" />
            Jadwal Sekolah
          </h1>
          <p className="text-text-muted text-sm mt-1">
            Atur jam masuk, jam pulang, dan hari aktif sekolah
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium text-sm shadow-glow-primary transition-all"
        >
          <Plus className="w-4 h-4" />
          Tambah Jadwal
        </button>
      </div>

      {/* Active schedule banner */}
      {activeSchedule && (
        <div className="rounded-2xl border border-primary-500/30 bg-primary-500/5 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-display font-semibold text-primary-400">
                Jadwal Aktif: {activeSchedule.name}
              </p>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <TimeChip
                  icon={LogIn}
                  label="Buka Absen"
                  value={activeSchedule.check_in_start}
                  color="emerald"
                />
                <TimeChip
                  icon={AlertCircle}
                  label="Batas Masuk"
                  value={activeSchedule.check_in_end}
                  color="amber"
                />
                <TimeChip
                  icon={LogOut}
                  label="Jam Pulang"
                  value={activeSchedule.check_out_start}
                  color="rose"
                />
                <TimeChip
                  icon={Timer}
                  label="Toleransi"
                  value={`${activeSchedule.grace_period} menit`}
                  color="violet"
                />
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-text-muted">
                <CalendarDays className="w-4 h-4" />
                <span>Hari aktif: {formatWorkDays(activeSchedule.work_days)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {!activeSchedule && !isLoading && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3 text-sm text-amber-300">
          <Info className="w-4 h-4 shrink-0" />
          Belum ada jadwal aktif. Buat jadwal lalu klik &quot;Aktifkan&quot;.
        </div>
      )}

      {/* Schedule list */}
      {isLoading && (
        <div className="text-text-muted text-sm">Memuat jadwal...</div>
      )}

      <div className="space-y-3">
        {schedules.map((s) => (
          <div
            key={s.id}
            className={cn(
              'rounded-2xl border p-5 transition-all',
              s.is_active
                ? 'border-primary-500/40 bg-surface-raised'
                : 'border-surface-border bg-surface-raised'
            )}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                {s.is_active && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-mono bg-primary-500/15 text-primary-400 border border-primary-500/30 shrink-0">
                    <CheckCircle2 className="w-3 h-3" />
                    AKTIF
                  </span>
                )}
                <h3 className="font-display font-semibold text-base truncate">{s.name}</h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!s.is_active && (
                  <button
                    onClick={() => activateMut.mutate(s.id)}
                    disabled={activateMut.isPending}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 border border-primary-500/30 transition-all"
                  >
                    Aktifkan
                  </button>
                )}
                <button
                  onClick={() => openEdit(s)}
                  className="p-1.5 rounded-lg text-text-muted hover:text-primary-400 hover:bg-primary-500/10 transition-all"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                {!s.is_active && (
                  <button
                    onClick={() => {
                      if (confirm(`Hapus jadwal "${s.name}"?`)) deleteMut.mutate(s.id);
                    }}
                    className="p-1.5 rounded-lg text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                    title="Hapus"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <TimeChip icon={LogIn} label="Buka Absen" value={s.check_in_start} color="emerald" />
              <TimeChip icon={AlertCircle} label="Batas Masuk" value={s.check_in_end} color="amber" />
              <TimeChip icon={LogOut} label="Jam Pulang" value={s.check_out_start} color="rose" />
              <TimeChip icon={Timer} label="Toleransi" value={`${s.grace_period} mnt`} color="violet" />
            </div>

            <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
              <CalendarDays className="w-3.5 h-3.5" />
              {formatWorkDays(s.work_days)}
            </div>
          </div>
        ))}

        {schedules.length === 0 && !isLoading && (
          <div className="rounded-xl border border-surface-border bg-surface-raised p-8 text-center text-text-muted text-sm">
            Belum ada jadwal. Klik &quot;Tambah Jadwal&quot; untuk mulai.
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-surface-base/80 backdrop-blur-md"
            onClick={closeForm}
          />
          <div className="relative w-full max-w-lg bg-surface-raised border border-surface-border rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-surface-border">
              <h2 className="font-display font-bold text-lg">
                {editTarget ? 'Edit Jadwal' : 'Tambah Jadwal Baru'}
              </h2>
              <button
                onClick={closeForm}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-all"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Nama */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Nama Jadwal
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Contoh: Jadwal Reguler, Jadwal Ramadan"
                  required
                  className="w-full bg-surface-base border border-surface-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30"
                />
              </div>

              {/* Jam */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <TimeField
                  label="Buka Absen"
                  hint="Mulai bisa scan masuk"
                  color="emerald"
                  value={form.check_in_start}
                  onChange={(v) => setForm({ ...form, check_in_start: v })}
                />
                <TimeField
                  label="Batas Masuk"
                  hint="Lewat ini = terlambat"
                  color="amber"
                  value={form.check_in_end}
                  onChange={(v) => setForm({ ...form, check_in_end: v })}
                />
                <TimeField
                  label="Jam Pulang"
                  hint="Mulai bisa scan pulang"
                  color="rose"
                  value={form.check_out_start}
                  onChange={(v) => setForm({ ...form, check_out_start: v })}
                />
              </div>

              {/* Toleransi */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Toleransi Keterlambatan
                  <span className="ml-1 text-text-muted font-normal">(menit setelah batas masuk)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={60}
                    step={5}
                    value={form.grace_period}
                    onChange={(e) => setForm({ ...form, grace_period: Number(e.target.value) })}
                    className="flex-1 accent-primary-500"
                  />
                  <span className="font-mono font-bold text-primary-400 w-16 text-right">
                    {form.grace_period} mnt
                  </span>
                </div>
                <p className="text-2xs text-text-muted mt-1">
                  Siswa yang scan antara batas masuk + toleransi tetap dianggap hadir (bukan terlambat).
                </p>
              </div>

              {/* Hari aktif */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Hari Aktif Sekolah
                </label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
                        selectedDays.includes(d.value)
                          ? 'bg-primary-500/15 text-primary-400 border-primary-500/40'
                          : 'bg-surface-base text-text-muted border-surface-border hover:border-primary-500/30'
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Info box */}
              <div className="rounded-xl bg-surface-overlay/40 border border-surface-border/50 p-3 text-xs text-text-muted space-y-1">
                <p className="font-medium text-text-secondary">Cara kerja jadwal:</p>
                <p>• Scan wajah sebelum <strong>Buka Absen</strong> → ditolak (terlalu pagi)</p>
                <p>• Scan antara <strong>Buka Absen</strong> dan <strong>Batas Masuk</strong> → hadir tepat waktu</p>
                <p>• Scan antara <strong>Batas Masuk</strong> dan <strong>Batas + Toleransi</strong> → hadir (tidak terlambat)</p>
                <p>• Scan setelah <strong>Batas + Toleransi</strong> → terlambat</p>
                <p>• Scan setelah <strong>Jam Pulang</strong> → check-out</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 py-2.5 rounded-xl border border-surface-border text-text-secondary hover:bg-surface-overlay transition-all text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isBusy || selectedDays.length === 0}
                  className="flex-1 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-medium text-sm shadow-glow-primary transition-all disabled:opacity-60"
                >
                  {isBusy ? 'Menyimpan...' : editTarget ? 'Simpan Perubahan' : 'Buat Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function TimeChip({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  color: 'emerald' | 'amber' | 'rose' | 'violet';
}) {
  const colorMap = {
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    rose: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
    violet: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
  }[color];

  return (
    <div className={cn('rounded-xl border p-3', colorMap)}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-2xs font-mono uppercase tracking-wider opacity-70">{label}</span>
      </div>
      <div className="font-display font-bold text-lg leading-none">{value}</div>
    </div>
  );
}

function TimeField({
  label,
  hint,
  color,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  color: 'emerald' | 'amber' | 'rose';
  value: string;
  onChange: (v: string) => void;
}) {
  const borderMap = {
    emerald: 'focus:border-emerald-500 focus:ring-emerald-500/20',
    amber: 'focus:border-amber-500 focus:ring-amber-500/20',
    rose: 'focus:border-rose-500 focus:ring-rose-500/20',
  }[color];

  return (
    <div>
      <label className="block text-sm font-medium text-text-secondary mb-1">
        {label}
      </label>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className={cn(
          'w-full bg-surface-base border border-surface-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 transition-all',
          borderMap
        )}
      />
      <p className="text-2xs text-text-muted mt-1">{hint}</p>
    </div>
  );
}
