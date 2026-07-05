'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Calendar, Plus, Trash2, X } from 'lucide-react';
import api, { type Envelope, getErrorMessage } from '@/lib/api';
import {
  createSlot,
  deleteSlot,
  fetchGrid,
  fetchSlots,
  type TimetableSlotInput,
} from '@/lib/timetableApi';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn } from '@/lib/utils';

interface SchoolClass { id: number; name: string }
interface Subject { id: number; code: string; name: string }
interface Teacher { id: number; full_name: string; role: string }

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export default function TimetablePage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const isStudent = user?.role === 'employee';

  const { data: classes = [] } = useQuery<SchoolClass[]>({
    queryKey: ['school-classes-list'],
    queryFn: async () => {
      const r = await api.get<Envelope<SchoolClass[]>>('/org/school-classes');
      return r.data.data ?? [];
    },
    enabled: !isStudent,
  });

  const [selectedClass, setSelectedClass] = useState<number | null>(null);

  useEffect(() => {
    if (isStudent && user?.school_class?.id) {
      setSelectedClass(user.school_class.id);
    } else if (!selectedClass && classes.length > 0) {
      setSelectedClass(classes[0].id);
    }
  }, [classes, isStudent, user, selectedClass]);

  const { data: grid, isLoading } = useQuery({
    queryKey: ['timetable-grid', selectedClass],
    queryFn: () => fetchGrid(selectedClass!),
    enabled: !!selectedClass,
  });

  const { data: allSlots = [] } = useQuery({
    queryKey: ['timetable-slots', selectedClass],
    queryFn: () => fetchSlots({ school_class_id: selectedClass! }),
    enabled: !!selectedClass,
  });

  const [openModal, setOpenModal] = useState<{ day: number; period: number } | null>(null);

  const removeMut = useMutation({
    mutationFn: (id: number) => deleteSlot(id),
    onSuccess: () => {
      toast.success('Slot dihapus');
      qc.invalidateQueries({ queryKey: ['timetable-grid'] });
      qc.invalidateQueries({ queryKey: ['timetable-slots'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const periodCount = grid?.max_period || 8;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Akademik
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Jadwal Pelajaran</h1>
        <p className="font-body text-text-muted mt-1">
          Matriks 6 hari × {periodCount} jam pelajaran. Konflik guru terdeteksi otomatis.
        </p>
      </div>

      {!isStudent && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="font-body text-sm text-text-muted">Kelas:</span>
          <select
            value={selectedClass ?? ''}
            onChange={(e) => setSelectedClass(Number(e.target.value))}
            className="bg-surface-raised border border-surface-border rounded-lg px-3 py-1.5 text-sm font-body"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {isLoading && <div className="text-text-muted">Memuat...</div>}

      {grid && (
        <div className="overflow-x-auto rounded-lg border border-surface-border bg-surface-raised">
          <table className="min-w-[800px] w-full text-sm">
            <thead className="bg-surface-muted">
              <tr>
                <th className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-widest text-text-muted w-24">
                  Jam
                </th>
                {DAYS.map((d, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-widest text-text-muted"
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: periodCount }, (_, i) => i + 1).map((p) => (
                <tr key={p} className="border-t border-surface-border">
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">
                    Jam {p}
                  </td>
                  {DAYS.map((_, dIdx) => {
                    const slot = grid.grid?.[String(dIdx)]?.[String(p)];
                    return (
                      <td
                        key={dIdx}
                        className="px-2 py-1 align-top border-l border-surface-border min-w-[120px]"
                      >
                        {slot ? (
                          <div
                            className={cn(
                              'rounded-md p-2 text-xs space-y-0.5 group',
                              slot.has_conflict
                                ? 'bg-rose-500/15 border border-rose-500/40'
                                : 'bg-primary-500/10 border border-primary-500/30'
                            )}
                          >
                            <div className="font-display font-semibold text-text-primary truncate">
                              {slot.subject_name || slot.subject_code || '?'}
                            </div>
                            <div className="text-text-muted truncate">
                              {slot.teacher_name || '-'}
                            </div>
                            <div className="font-mono text-2xs text-text-muted">
                              {slot.start_time?.slice(0, 5)}-{slot.end_time?.slice(0, 5)}
                              {slot.room && ` • ${slot.room}`}
                            </div>
                            {slot.has_conflict && (
                              <div className="text-2xs text-rose-300 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Bentrok: {slot.conflict_with}
                              </div>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() => removeMut.mutate(slot.id)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-rose-400 hover:text-rose-300 text-2xs flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" /> Hapus
                              </button>
                            )}
                          </div>
                        ) : isAdmin ? (
                          <button
                            onClick={() => setOpenModal({ day: dIdx, period: p })}
                            className="w-full h-full min-h-[60px] rounded-md border border-dashed border-surface-border text-text-muted hover:bg-surface-muted/40 flex items-center justify-center"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        ) : (
                          <div className="text-text-muted text-2xs italic">-</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openModal && selectedClass && (
        <SlotModal
          schoolClassId={selectedClass}
          day={openModal.day}
          period={openModal.period}
          onClose={() => setOpenModal(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['timetable-grid'] });
            qc.invalidateQueries({ queryKey: ['timetable-slots'] });
            setOpenModal(null);
          }}
        />
      )}
    </div>
  );
}

function SlotModal({
  schoolClassId,
  day,
  period,
  onClose,
  onSaved,
}: {
  schoolClassId: number;
  day: number;
  period: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ['subjects-list'],
    queryFn: async () => {
      const r = await api.get<Envelope<Subject[]>>('/subjects');
      return r.data.data ?? [];
    },
  });
  const { data: teachers = [] } = useQuery<Teacher[]>({
    queryKey: ['teachers-list'],
    queryFn: async () => {
      const r = await api.get<Envelope<{ items: Teacher[] }>>('/users', {
        params: { role: 'admin', per_page: 200 },
      });
      const data = (r.data.data as any)?.items ?? r.data.data ?? [];
      return Array.isArray(data) ? data : [];
    },
  });

  const [form, setForm] = useState<TimetableSlotInput>({
    school_class_id: schoolClassId,
    day_of_week: day,
    period_index: period,
    start_time: '07:00',
    end_time: '07:45',
    subject_id: null,
    teacher_id: null,
    room: '',
  });

  const saveMut = useMutation({
    mutationFn: (p: TimetableSlotInput) => createSlot(p),
    onSuccess: () => {
      toast.success('Slot tersimpan');
      onSaved();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">
            {DAYS[day]} • Jam ke-{period}
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div>
            <label className="block text-text-muted mb-1">Mata Pelajaran</label>
            <select
              value={form.subject_id ?? ''}
              onChange={(e) =>
                setForm({ ...form, subject_id: e.target.value ? Number(e.target.value) : null })
              }
              className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
            >
              <option value="">Pilih mapel...</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-text-muted mb-1">Guru</label>
            <select
              value={form.teacher_id ?? ''}
              onChange={(e) =>
                setForm({ ...form, teacher_id: e.target.value ? Number(e.target.value) : null })
              }
              className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
            >
              <option value="">Pilih guru...</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-text-muted mb-1">Mulai</label>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-text-muted mb-1">Selesai</label>
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-text-muted mb-1">Ruang</label>
            <input
              type="text"
              value={form.room ?? ''}
              onChange={(e) => setForm({ ...form, room: e.target.value })}
              placeholder="Misal: R-101"
              className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary"
          >
            Batal
          </button>
          <button
            onClick={() => saveMut.mutate(form)}
            disabled={saveMut.isPending}
            className="px-4 py-2 text-sm font-medium bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg disabled:opacity-50"
          >
            {saveMut.isPending ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}
