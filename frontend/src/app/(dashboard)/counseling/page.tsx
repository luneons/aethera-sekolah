'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Calendar,
  Check,
  Clock,
  Eye,
  EyeOff,
  Heart,
  Plus,
  Stethoscope,
  Trash2,
  X,
} from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import {
  bulkGenerateSlots,
  createBooking,
  createSlot,
  decideBooking,
  deleteSlot,
  fetchBookings,
  fetchCounselingStats,
  fetchSlots,
  type CounselingBooking,
  type CounselingSlot,
} from '@/lib/counselingApi';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn, formatDate } from '@/lib/utils';

export default function CounselingPage() {
  const user = useAuthStore((s) => s.user);
  const isStudent = user?.role === 'employee';
  const isBK = user?.role === 'hr' || user?.role === 'super_admin';

  const [tab, setTab] = useState<'slots' | 'bookings'>(isStudent ? 'slots' : 'bookings');

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Heart className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Bimbingan & Konseling
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Booking Konsultasi BK</h1>
        <p className="font-body text-text-muted mt-1">
          {isStudent
            ? 'Pilih slot waktu yang tersedia untuk konsultasi dengan guru BK. Bisa anonim.'
            : 'Buka jadwal konsultasi, kelola booking siswa, catat hasil sesi (private).'}
        </p>
      </div>

      {isBK && <BkStats />}

      <div className="flex flex-wrap gap-2 border-b border-surface-border">
        <button
          onClick={() => setTab('slots')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
            tab === 'slots' ? 'border-primary-500 text-primary-300' : 'border-transparent text-text-muted'
          )}
        >
          {isStudent ? 'Slot Tersedia' : 'Manajemen Slot'}
        </button>
        <button
          onClick={() => setTab('bookings')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
            tab === 'bookings' ? 'border-primary-500 text-primary-300' : 'border-transparent text-text-muted'
          )}
        >
          {isStudent ? 'Booking Saya' : 'Booking Siswa'}
        </button>
      </div>

      {tab === 'slots' && <SlotsTab isStudent={isStudent} isBK={isBK} />}
      {tab === 'bookings' && <BookingsTab isStudent={isStudent} isBK={isBK} />}
    </div>
  );
}

function BkStats() {
  const { data: stats } = useQuery({
    queryKey: ['counseling-stats'],
    queryFn: fetchCounselingStats,
    refetchInterval: 60_000,
  });
  if (!stats) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { label: 'Pending', value: stats.pending, tone: 'text-amber-400' },
        { label: 'Hari Ini', value: stats.today, tone: 'text-primary-300' },
        { label: 'Pekan Ini', value: stats.this_week, tone: 'text-emerald-300' },
        { label: 'Total Selesai', value: stats.completed_total, tone: 'text-text-secondary' },
      ].map((s) => (
        <div key={s.label} className="rounded-lg bg-surface-raised border border-surface-border p-3">
          <div className="text-2xs uppercase tracking-widest text-text-muted font-mono">{s.label}</div>
          <div className={cn('font-display text-2xl font-bold mt-1', s.tone)}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

function SlotsTab({ isStudent, isBK }: { isStudent: boolean; isBK: boolean }) {
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const [openBulk, setOpenBulk] = useState(false);
  const [openBook, setOpenBook] = useState<CounselingSlot | null>(null);
  const [openWalkIn, setOpenWalkIn] = useState(false);

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ['counseling-slots'],
    queryFn: () => fetchSlots({ available_only: isStudent }),
  });

  const removeMut = useMutation({
    mutationFn: (id: number) => deleteSlot(id),
    onSuccess: () => {
      toast.success('Slot dihapus');
      qc.invalidateQueries({ queryKey: ['counseling-slots'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="space-y-3">
      {(isBK || isStudent) && (
        <div className="flex flex-wrap gap-2">
          {isStudent && (
            <button
              onClick={() => setOpenWalkIn(true)}
              className="px-3 py-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-md flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Booking Manual
            </button>
          )}
          {isBK && (
            <>
              <button
                onClick={() => setOpenCreate(true)}
                className="px-3 py-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-md flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Slot Baru
              </button>
              <button
                onClick={() => setOpenBulk(true)}
                className="px-3 py-1.5 text-sm bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-md"
              >
                ⚡ Generate Bulk
              </button>
            </>
          )}
        </div>
      )}

      {isLoading && <div className="text-text-muted">Memuat...</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {slots.map((s) => (
          <div
            key={s.id}
            className={cn(
              'rounded-lg border p-3 text-sm',
              s.is_blocked
                ? 'border-rose-500/40 bg-rose-500/10'
                : s.is_booked
                ? 'border-amber-500/40 bg-amber-500/10'
                : 'border-emerald-500/40 bg-emerald-500/10'
            )}
          >
            <div className="font-mono text-xs text-text-muted">
              {formatDate(s.slot_date)}
            </div>
            <div className="font-display font-semibold text-text-primary mt-0.5">
              {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
            </div>
            <div className="text-xs text-text-muted">{s.counselor_name}</div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-2xs font-mono uppercase">
                {s.is_blocked ? '🚫 Blocked' : s.is_booked ? '⏳ Booked' : '✅ Tersedia'}
              </span>
              <div className="flex gap-1">
                {!s.is_blocked && !s.is_booked && isStudent && (
                  <button
                    onClick={() => setOpenBook(s)}
                    className="px-2 py-0.5 text-2xs bg-primary-500 hover:bg-primary-600 text-text-inverse rounded"
                  >
                    Book
                  </button>
                )}
                {isBK && !s.is_booked && (
                  <button
                    onClick={() => removeMut.mutate(s.id)}
                    className="px-2 py-0.5 text-2xs bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {slots.length === 0 && !isLoading && (
          <div className="col-span-full text-center text-text-muted py-8">
            Belum ada slot tersedia
          </div>
        )}
      </div>

      {openCreate && <SlotModal onClose={() => setOpenCreate(false)} />}
      {openBulk && <BulkSlotModal onClose={() => setOpenBulk(false)} />}
      {openBook && (
        <BookingModal
          slot={openBook}
          onClose={() => setOpenBook(null)}
        />
      )}
      {openWalkIn && <BookingModal onClose={() => setOpenWalkIn(false)} />}
    </div>
  );
}

function BookingsTab({ isStudent, isBK }: { isStudent: boolean; isBK: boolean }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [decideMod, setDecideMod] = useState<{ b: CounselingBooking; status: string } | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['counseling-bookings', statusFilter],
    queryFn: () => fetchBookings({ status: statusFilter || undefined }),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {['', 'pending', 'approved', 'completed', 'rejected', 'cancelled'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-md font-medium',
              statusFilter === s
                ? 'bg-primary-500 text-text-inverse'
                : 'bg-surface-muted text-text-muted hover:text-text-primary'
            )}
          >
            {s ? s.toUpperCase() : 'SEMUA'}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-text-muted">Memuat...</div>}

      <div className="space-y-2">
        {rows.map((b) => (
          <div key={b.id} className="rounded-lg bg-surface-raised border border-surface-border p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      'font-mono text-2xs px-2 py-0.5 rounded uppercase',
                      b.status === 'approved' && 'bg-success/15 text-success',
                      b.status === 'pending' && 'bg-amber-500/15 text-amber-300',
                      b.status === 'rejected' && 'bg-rose-500/15 text-rose-300',
                      b.status === 'completed' && 'bg-blue-500/15 text-blue-300',
                      b.status === 'cancelled' && 'bg-text-muted/15 text-text-muted'
                    )}
                  >
                    {b.status.toUpperCase()}
                  </span>
                  {b.is_anonymous && (
                    <span className="font-mono text-2xs px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 flex items-center gap-1">
                      <EyeOff className="w-3 h-3" /> ANONIM
                    </span>
                  )}
                </div>
                <h3 className="font-display font-semibold text-text-primary mt-1">{b.topic}</h3>
                <div className="text-xs text-text-muted mt-0.5">
                  {b.is_anonymous && isStudent ? 'Anda' : b.student_name}
                  {b.student_class && ` • ${b.student_class}`}
                </div>
              </div>
              <div className="text-right text-xs">
                <div className="font-mono">{formatDate(b.booking_date)}</div>
                <div className="text-text-muted">
                  {b.start_time.slice(0, 5)} – {b.end_time.slice(0, 5)}
                </div>
              </div>
            </div>

            {b.student_note && (
              <div className="text-sm text-text-secondary bg-surface-base/50 p-2 rounded">
                <span className="font-mono text-2xs uppercase text-text-muted">Catatan siswa</span>
                <p>{b.student_note}</p>
              </div>
            )}
            {b.counselor_note && (
              <div className="text-sm text-text-secondary bg-blue-500/10 border border-blue-500/30 p-2 rounded">
                <span className="font-mono text-2xs uppercase text-blue-300">Catatan BK (private)</span>
                <p>{b.counselor_note}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2 border-t border-surface-border">
              {isBK && b.status === 'pending' && (
                <>
                  <button
                    onClick={() => setDecideMod({ b, status: 'approved' })}
                    className="px-3 py-1 text-xs bg-success/15 text-success hover:bg-success/25 rounded"
                  >
                    ✓ Setujui
                  </button>
                  <button
                    onClick={() => setDecideMod({ b, status: 'rejected' })}
                    className="px-3 py-1 text-xs bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 rounded"
                  >
                    ✗ Tolak
                  </button>
                </>
              )}
              {isBK && b.status === 'approved' && (
                <button
                  onClick={() => setDecideMod({ b, status: 'completed' })}
                  className="px-3 py-1 text-xs bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 rounded"
                >
                  ✓ Selesai
                </button>
              )}
              {isStudent && (b.status === 'pending' || b.status === 'approved') && (
                <button
                  onClick={() => setDecideMod({ b, status: 'cancelled' })}
                  className="px-3 py-1 text-xs bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 rounded"
                >
                  Batalkan
                </button>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && !isLoading && (
          <div className="text-center text-text-muted py-8">Tidak ada booking</div>
        )}
      </div>

      {decideMod && (
        <DecideModal
          booking={decideMod.b}
          status={decideMod.status}
          onClose={() => setDecideMod(null)}
        />
      )}
    </div>
  );
}

function SlotModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    slot_date: today,
    start_time: '09:00',
    end_time: '09:30',
    is_blocked: false,
    note: '',
  });
  const mut = useMutation({
    mutationFn: () => createSlot(form),
    onSuccess: () => {
      toast.success('Slot dibuat');
      qc.invalidateQueries({ queryKey: ['counseling-slots'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">Slot Baru</h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <input
            type="date"
            value={form.slot_date}
            onChange={(e) => setForm({ ...form, slot_date: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="time"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
            />
            <input
              type="time"
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
            />
          </div>
          <input
            placeholder="Catatan (opsional)"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_blocked}
              onChange={(e) => setForm({ ...form, is_blocked: e.target.checked })}
            />
            <span>Blok slot (rapat dst)</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted">Batal</button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg disabled:opacity-50"
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkSlotModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    days: 7,
    start_hour: 9,
    end_hour: 15,
    duration_minutes: 30,
    skip_weekends: true,
  });
  const mut = useMutation({
    mutationFn: () => bulkGenerateSlots(form),
    onSuccess: (r) => {
      toast.success(`${r.created} slot dibuat (skip ${r.skipped} duplicate)`);
      qc.invalidateQueries({ queryKey: ['counseling-slots'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">Generate Slot Otomatis</h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <p className="text-text-muted text-xs">
            Otomatis bikin slot konsultasi untuk N hari ke depan, jam X-Y, durasi Z menit.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-text-muted">Hari ke depan</label>
              <input
                type="number"
                value={form.days}
                onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Durasi/slot (menit)</label>
              <input
                type="number"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Jam mulai</label>
              <input
                type="number"
                value={form.start_hour}
                onChange={(e) => setForm({ ...form, start_hour: Number(e.target.value) })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Jam selesai</label>
              <input
                type="number"
                value={form.end_hour}
                onChange={(e) => setForm({ ...form, end_hour: Number(e.target.value) })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.skip_weekends}
              onChange={(e) => setForm({ ...form, skip_weekends: e.target.checked })}
            />
            <span>Skip weekend (Sabtu-Minggu)</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted">Batal</button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg disabled:opacity-50"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}

function BookingModal({
  slot,
  onClose,
}: {
  slot?: CounselingSlot;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    slot_id: slot?.id ?? null,
    booking_date: slot?.slot_date ?? today,
    start_time: slot?.start_time ?? '10:00',
    end_time: slot?.end_time ?? '10:30',
    topic: '',
    is_anonymous: false,
    student_note: '',
  });
  const mut = useMutation({
    mutationFn: () => createBooking(form),
    onSuccess: () => {
      toast.success('Booking dikirim, menunggu persetujuan BK');
      qc.invalidateQueries({ queryKey: ['counseling-slots'] });
      qc.invalidateQueries({ queryKey: ['counseling-bookings'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">
            {slot ? 'Booking Slot' : 'Booking Manual'}
          </h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          {!slot && (
            <>
              <input
                type="date"
                value={form.booking_date}
                onChange={(e) => setForm({ ...form, booking_date: e.target.value })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
                />
                <input
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
                />
              </div>
            </>
          )}
          {slot && (
            <div className="rounded bg-surface-base/50 p-3 text-xs text-text-muted">
              {formatDate(slot.slot_date)} • {slot.start_time.slice(0, 5)}-{slot.end_time.slice(0, 5)} • {slot.counselor_name}
            </div>
          )}
          <input
            placeholder="Isi topik..."
            value={form.topic}
            onChange={(e) => setForm({ ...form, topic: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <textarea
            placeholder="Cerita/keluhan (opsional)"
            value={form.student_note}
            onChange={(e) => setForm({ ...form, student_note: e.target.value })}
            rows={3}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <label className="flex items-center gap-2 text-violet-300">
            <input
              type="checkbox"
              checked={form.is_anonymous}
              onChange={(e) => setForm({ ...form, is_anonymous: e.target.checked })}
            />
            <span>Booking anonim (nama tersembunyi dari teman sekelas)</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted">Batal</button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !form.topic}
            className="px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg disabled:opacity-50"
          >
            Booking
          </button>
        </div>
      </div>
    </div>
  );
}

function DecideModal({
  booking,
  status,
  onClose,
}: {
  booking: CounselingBooking;
  status: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const mut = useMutation({
    mutationFn: () =>
      decideBooking(booking.id, {
        status,
        counselor_note: note || undefined,
      }),
    onSuccess: () => {
      toast.success('Booking diupdate');
      qc.invalidateQueries({ queryKey: ['counseling-bookings'] });
      qc.invalidateQueries({ queryKey: ['counseling-slots'] });
      qc.invalidateQueries({ queryKey: ['counseling-stats'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  const labels: Record<string, string> = {
    approved: 'Setujui',
    rejected: 'Tolak',
    completed: 'Tandai Selesai',
    cancelled: 'Batalkan',
  };
  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">{labels[status] || status}</h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="text-text-muted text-xs">
            Topik: <strong className="text-text-primary">{booking.topic}</strong>
          </div>
          <textarea
            placeholder={
              status === 'completed'
                ? 'Catatan hasil sesi (private, hanya BK & siswa)'
                : 'Catatan untuk siswa (opsional)'
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted">Batal</button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg disabled:opacity-50"
          >
            Konfirmasi
          </button>
        </div>
      </div>
    </div>
  );
}
