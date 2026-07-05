'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Save,
} from 'lucide-react';
import api, { type Envelope, getErrorMessage } from '@/lib/api';
import {
  bulkMarkAttendance,
  fetchSessionRoster,
  type StudentAttRow,
} from '@/lib/subjectAttendanceApi';
import { fetchSlots, type TimetableSlot } from '@/lib/timetableApi';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn, formatDate } from '@/lib/utils';

interface SchoolClass { id: number; name: string }

const STATUS_OPTIONS = [
  { value: 'present', label: 'Hadir', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
  { value: 'late', label: 'Terlambat', color: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  { value: 'sick', label: 'Sakit', color: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
  { value: 'permit', label: 'Izin', color: 'bg-violet-500/15 text-violet-300 border-violet-500/40' },
  { value: 'leave', label: 'Cuti', color: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40' },
  { value: 'absent', label: 'Alpa', color: 'bg-rose-500/15 text-rose-300 border-rose-500/40' },
] as const;

type Status = typeof STATUS_OPTIONS[number]['value'];

const statusStyle = (s: string) =>
  STATUS_OPTIONS.find((x) => x.value === s)?.color ?? 'bg-text-muted/15 text-text-muted';

export default function SubjectAttendancePage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const today = new Date().toISOString().slice(0, 10);

  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [sessionDate, setSessionDate] = useState(today);
  const [edits, setEdits] = useState<Record<number, { status: Status; note?: string }>>({});

  // Filter slot berdasarkan role
  const slotParams = useMemo(() => {
    if (user?.role === 'admin') {
      return { teacher_id: user.id };
    }
    return undefined;
  }, [user]);

  const { data: slots = [] } = useQuery({
    queryKey: ['timetable-slots-mine', slotParams],
    queryFn: () => fetchSlots(slotParams),
  });

  const { data: roster, isLoading } = useQuery({
    queryKey: ['session-roster', selectedSlot, sessionDate],
    queryFn: () => fetchSessionRoster(selectedSlot!, sessionDate),
    enabled: !!selectedSlot,
  });

  // Reset edits saat ganti slot/tanggal
  useEffect(() => {
    setEdits({});
  }, [selectedSlot, sessionDate]);

  const submitMut = useMutation({
    mutationFn: () => {
      if (!roster) throw new Error('roster not loaded');
      // Merge edits dengan default dari roster
      const rows = roster.students.map((s) => ({
        student_id: s.student_id,
        status: edits[s.student_id]?.status ?? (s.status as Status),
        note: edits[s.student_id]?.note ?? s.note ?? undefined,
      }));
      return bulkMarkAttendance({
        slot_id: roster.slot_id,
        session_date: sessionDate,
        rows,
      });
    },
    onSuccess: (data) => {
      toast.success(`${data.saved} siswa tersimpan`);
      setEdits({});
      qc.invalidateQueries({ queryKey: ['session-roster'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const setStatus = (studentId: number, status: Status) => {
    setEdits((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], status },
    }));
  };

  const setNote = (studentId: number, note: string) => {
    setEdits((prev) => ({
      ...prev,
      [studentId]: {
        status: prev[studentId]?.status ?? 'present',
        note,
      },
    }));
  };

  const bulkAllPresent = () => {
    if (!roster) return;
    const next: typeof edits = {};
    for (const s of roster.students) {
      next[s.student_id] = { status: 'present' };
    }
    setEdits(next);
    toast.message('Semua di-mark hadir. Klik Simpan untuk submit.');
  };

  const effectiveStatus = (row: StudentAttRow): Status =>
    edits[row.student_id]?.status ?? (row.status as Status);

  const stats = useMemo(() => {
    if (!roster) return null;
    const counts: Record<Status, number> = {
      present: 0, late: 0, absent: 0, sick: 0, permit: 0, leave: 0,
    };
    for (const s of roster.students) {
      counts[effectiveStatus(s)]++;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, edits]);

  const hasUnsaved = Object.keys(edits).length > 0;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <ClipboardList className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Absensi Mata Pelajaran
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">
          Absen Per Mapel
        </h1>
        <p className="font-body text-text-muted mt-1">
          Catat kehadiran siswa per sesi mapel. Auto-prefill dari pengajuan izin yang
          disetujui.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Filter panel */}
        <div className="lg:col-span-1 space-y-3">
          <div className="rounded-lg bg-surface-raised border border-surface-border p-4 space-y-3">
            <h3 className="font-display font-semibold">Pilih Sesi</h3>
            <div>
              <label className="text-xs text-text-muted">Tanggal</label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Slot Mata Pelajaran</label>
              <select
                value={selectedSlot ?? ''}
                onChange={(e) => setSelectedSlot(Number(e.target.value) || null)}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2 text-sm"
              >
                <option value="">Pilih...</option>
                {slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.day_name} jam {s.period_index} • {s.subject_name || s.subject_code} • {s.school_class_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {stats && (
            <div className="rounded-lg bg-surface-raised border border-surface-border p-4">
              <h3 className="font-display font-semibold text-sm mb-2">Ringkasan</h3>
              <div className="space-y-1.5 text-sm">
                {STATUS_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex justify-between">
                    <span className="text-text-muted">{opt.label}</span>
                    <span className="font-mono font-semibold">{stats[opt.value]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Roster */}
        <div className="lg:col-span-2">
          {!selectedSlot && (
            <div className="rounded-lg bg-surface-raised border border-surface-border p-12 text-center text-text-muted">
              <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Pilih sesi mapel di kiri</p>
            </div>
          )}
          {selectedSlot && isLoading && (
            <div className="text-center py-8 text-text-muted flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Memuat...
            </div>
          )}
          {roster && (
            <div className="rounded-lg bg-surface-raised border border-surface-border p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-mono text-2xs text-text-muted uppercase">
                    {formatDate(sessionDate)} • Jam ke-{roster.period_index}
                  </div>
                  <h3 className="font-display font-bold text-lg">
                    {roster.subject_name}
                  </h3>
                  <div className="text-sm text-text-muted">
                    {roster.school_class_name}
                    {roster.teacher_name && ` • ${roster.teacher_name}`}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={bulkAllPresent}
                    className="px-3 py-1.5 text-xs bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 rounded-md flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Tandai Semua Hadir
                  </button>
                  <button
                    onClick={() => submitMut.mutate()}
                    disabled={submitMut.isPending}
                    className={cn(
                      'px-3 py-1.5 text-xs rounded-md flex items-center gap-1 disabled:opacity-50',
                      hasUnsaved
                        ? 'bg-primary-500 hover:bg-primary-600 text-text-inverse'
                        : 'bg-surface-muted text-text-muted'
                    )}
                  >
                    {submitMut.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Save className="w-3 h-3" />
                    )}
                    {hasUnsaved ? 'Simpan Perubahan' : 'Simpan'}
                  </button>
                </div>
              </div>

              {roster.students.length === 0 ? (
                <div className="text-center text-text-muted py-8">
                  Tidak ada siswa di kelas ini
                </div>
              ) : (
                <div className="space-y-2">
                  {roster.students.map((s) => {
                    const cur = effectiveStatus(s);
                    const noteVal =
                      edits[s.student_id]?.note ?? s.note ?? '';
                    const isModified = !!edits[s.student_id];
                    return (
                      <div
                        key={s.student_id}
                        className={cn(
                          'rounded-lg border p-3 space-y-2',
                          isModified
                            ? 'border-primary-500/50 bg-primary-500/5'
                            : 'border-surface-border'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {s.photo_url ? (
                            <img
                              src={s.photo_url}
                              alt={s.full_name}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-surface-muted flex items-center justify-center font-mono text-xs">
                              {s.full_name[0]}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{s.full_name}</div>
                            <div className="text-2xs font-mono text-text-muted">
                              {s.employee_id}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {STATUS_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => setStatus(s.student_id, opt.value)}
                              className={cn(
                                'px-3 py-1 text-2xs rounded-md border font-medium uppercase font-mono',
                                cur === opt.value
                                  ? opt.color
                                  : 'border-surface-border text-text-muted hover:text-text-primary'
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        {(cur === 'sick' || cur === 'permit' || cur === 'leave') && (
                          <input
                            type="text"
                            value={noteVal}
                            onChange={(e) => setNote(s.student_id, e.target.value)}
                            placeholder="Catatan (opsional)"
                            className="w-full bg-surface-base border border-surface-border rounded px-2 py-1 text-xs"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
