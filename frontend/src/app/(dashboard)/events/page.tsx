'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Calendar,
  CalendarDays,
  Check,
  Edit,
  ExternalLink,
  HelpCircle,
  MapPin,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import api, { type Envelope, getErrorMessage } from '@/lib/api';
import {
  calendarIcsUrl,
  createEvent,
  deleteEvent,
  fetchEvents,
  fetchRsvps,
  rsvpEvent,
  updateEvent,
  type EventInput,
  type SchoolEvent,
} from '@/lib/eventsApi';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn, formatDate } from '@/lib/utils';

interface SchoolClass { id: number; name: string }

const CATEGORIES = [
  { value: 'akademik', label: 'Akademik', color: 'bg-blue-500/15 text-blue-300' },
  { value: 'ujian', label: 'Ujian', color: 'bg-rose-500/15 text-rose-300' },
  { value: 'libur', label: 'Libur', color: 'bg-emerald-500/15 text-emerald-300' },
  { value: 'rapat', label: 'Rapat', color: 'bg-amber-500/15 text-amber-300' },
  { value: 'lomba', label: 'Lomba', color: 'bg-violet-500/15 text-violet-300' },
  { value: 'kunjungan', label: 'Kunjungan', color: 'bg-cyan-500/15 text-cyan-300' },
  { value: 'lainnya', label: 'Lainnya', color: 'bg-text-muted/15 text-text-muted' },
];

const AUDIENCES = [
  { value: 'all', label: 'Semua' },
  { value: 'siswa', label: 'Siswa' },
  { value: 'guru', label: 'Guru' },
  { value: 'ortu', label: 'Orang Tua' },
  { value: 'kelas', label: 'Per Kelas' },
];

export default function EventsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'hr';

  const [filter, setFilter] = useState<{ category?: string; upcoming_only?: boolean }>({
    upcoming_only: true,
  });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SchoolEvent | null>(null);
  const [rsvpFor, setRsvpFor] = useState<{ event: SchoolEvent; response: 'yes' | 'no' | 'maybe' } | null>(null);
  const [viewRsvps, setViewRsvps] = useState<SchoolEvent | null>(null);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', filter],
    queryFn: () => fetchEvents(filter),
  });

  const removeMut = useMutation({
    mutationFn: (id: number) => deleteEvent(id),
    onSuccess: () => {
      toast.success('Acara dihapus');
      qc.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CalendarDays className="w-5 h-5 role-accent-text" />
            <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
              Kalender Sekolah
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-display-md font-bold">Acara Sekolah</h1>
          <p className="font-body text-text-muted mt-1">
            Kalender ujian, libur, lomba, kunjungan. Bisa export ke Google Calendar / Apple Calendar (.ics).
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a
            href={calendarIcsUrl()}
            className="px-3 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 rounded-lg text-sm font-medium flex items-center gap-1"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="w-4 h-4" /> Export .ics
          </a>
          {isAdmin && (
            <button
              onClick={() => setCreating(true)}
              className="px-3 py-2 bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg text-sm font-medium flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Acara Baru
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => setFilter({ ...filter, upcoming_only: !filter.upcoming_only })}
          className={cn(
            'px-3 py-1.5 text-xs rounded-md font-medium',
            filter.upcoming_only ? 'bg-primary-500 text-text-inverse' : 'bg-surface-muted text-text-muted'
          )}
        >
          {filter.upcoming_only ? '✓ Mendatang Saja' : 'Semua Tanggal'}
        </button>
        <select
          value={filter.category ?? ''}
          onChange={(e) =>
            setFilter({ ...filter, category: e.target.value || undefined })
          }
          className="bg-surface-raised border border-surface-border rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">Semua Kategori</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <div className="text-text-muted">Memuat...</div>}

      <div className="space-y-3">
        {events.map((ev) => {
          const cat = CATEGORIES.find((c) => c.value === ev.category);
          return (
            <div
              key={ev.id}
              className="rounded-lg bg-surface-raised border border-surface-border p-4 space-y-2"
            >
              <div className="flex items-start gap-3 flex-wrap">
                <div className="text-center bg-surface-base/50 rounded-md p-2 min-w-[60px]">
                  <div className="font-mono text-2xs uppercase text-text-muted">
                    {new Date(ev.start_at).toLocaleDateString('id-ID', { month: 'short' })}
                  </div>
                  <div className="font-display text-2xl font-bold text-primary-300">
                    {new Date(ev.start_at).getDate()}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {cat && (
                      <span className={cn('font-mono text-2xs px-2 py-0.5 rounded uppercase', cat.color)}>
                        {cat.label}
                      </span>
                    )}
                    <span className="font-mono text-2xs text-text-muted">
                      {AUDIENCES.find((a) => a.value === ev.audience)?.label || ev.audience}
                      {ev.target_class_name && ` • ${ev.target_class_name}`}
                    </span>
                    {ev.requires_rsvp && (
                      <span className="font-mono text-2xs px-2 py-0.5 rounded bg-violet-500/15 text-violet-300">
                        RSVP
                      </span>
                    )}
                  </div>
                  <h3 className="font-display font-bold text-lg">{ev.title}</h3>
                  {ev.description && (
                    <p className="text-sm text-text-muted mt-1">{ev.description}</p>
                  )}
                  <div className="flex flex-wrap gap-3 text-xs text-text-muted mt-2">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(ev.start_at).toLocaleString('id-ID', {
                        weekday: 'short',
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {ev.end_at &&
                        ` – ${new Date(ev.end_at).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`}
                    </span>
                    {ev.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {ev.location}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {ev.requires_rsvp && (
                <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-surface-border">
                  <span className="text-xs text-text-muted">
                    RSVP: ✅ {ev.rsvp_yes} • ❌ {ev.rsvp_no} • ❓ {ev.rsvp_maybe}
                  </span>
                  <div className="flex gap-1">
                    {(['yes', 'no', 'maybe'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setRsvpFor({ event: ev, response: r })}
                        className={cn(
                          'px-3 py-1 text-2xs rounded font-mono',
                          ev.self_rsvp === r
                            ? 'bg-primary-500 text-text-inverse'
                            : 'bg-surface-muted text-text-muted hover:text-text-primary'
                        )}
                      >
                        {r === 'yes' && '✅ Hadir'}
                        {r === 'no' && '❌ Tidak'}
                        {r === 'maybe' && '❓ Mungkin'}
                      </button>
                    ))}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => setViewRsvps(ev)}
                      className="ml-auto px-2 py-1 text-2xs bg-surface-muted text-text-muted hover:text-text-primary rounded"
                    >
                      Lihat List
                    </button>
                  )}
                </div>
              )}

              {isAdmin && (
                <div className="flex gap-2 pt-2 border-t border-surface-border">
                  <button
                    onClick={() => setEditing(ev)}
                    className="px-3 py-1 text-xs bg-surface-muted text-text-muted hover:text-text-primary rounded flex items-center gap-1"
                  >
                    <Edit className="w-3 h-3" /> Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Hapus acara "${ev.title}"?`)) removeMut.mutate(ev.id);
                    }}
                    className="px-3 py-1 text-xs bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 rounded flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {events.length === 0 && !isLoading && (
          <div className="text-center text-text-muted py-8">Belum ada acara</div>
        )}
      </div>

      {creating && <EventModal onClose={() => setCreating(false)} />}
      {editing && <EventModal existing={editing} onClose={() => setEditing(null)} />}
      {rsvpFor && (
        <RsvpModal
          event={rsvpFor.event}
          response={rsvpFor.response}
          onClose={() => setRsvpFor(null)}
        />
      )}
      {viewRsvps && <ViewRsvpsModal event={viewRsvps} onClose={() => setViewRsvps(null)} />}
    </div>
  );
}

function EventModal({
  existing,
  onClose,
}: {
  existing?: SchoolEvent;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: classes = [] } = useQuery<SchoolClass[]>({
    queryKey: ['school-classes-list'],
    queryFn: async () => {
      const r = await api.get<Envelope<SchoolClass[]>>('/org/school-classes');
      return r.data.data ?? [];
    },
  });

  const toLocalIso = (s: string | null | undefined) => {
    if (!s) return '';
    const d = new Date(s);
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const [form, setForm] = useState<EventInput>({
    title: existing?.title ?? '',
    description: existing?.description ?? '',
    start_at: toLocalIso(existing?.start_at) || new Date().toISOString().slice(0, 16),
    end_at: existing?.end_at ? toLocalIso(existing.end_at) : null,
    location: existing?.location ?? '',
    category: existing?.category ?? 'akademik',
    audience: existing?.audience ?? 'all',
    target_class_id: existing?.target_class_id ?? null,
    requires_rsvp: existing?.requires_rsvp ?? false,
    cover_url: existing?.cover_url ?? '',
  });

  const mut = useMutation({
    mutationFn: () => {
      const payload: EventInput = {
        ...form,
        start_at: new Date(form.start_at).toISOString(),
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
        target_class_id: form.audience === 'kelas' ? form.target_class_id : null,
      };
      return existing ? updateEvent(existing.id, payload) : createEvent(payload);
    },
    onSuccess: () => {
      toast.success('Tersimpan');
      qc.invalidateQueries({ queryKey: ['events'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">
            {existing ? 'Edit Acara' : 'Acara Baru'}
          </h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <input
            placeholder="Judul"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <textarea
            placeholder="Deskripsi"
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-text-muted">Mulai</label>
              <input
                type="datetime-local"
                value={form.start_at}
                onChange={(e) => setForm({ ...form, start_at: e.target.value })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Selesai (opsional)</label>
              <input
                type="datetime-local"
                value={form.end_at ?? ''}
                onChange={(e) => setForm({ ...form, end_at: e.target.value || null })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
          </div>
          <input
            placeholder="Lokasi"
            value={form.location ?? ''}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-text-muted">Kategori</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted">Audience</label>
              <select
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              >
                {AUDIENCES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {form.audience === 'kelas' && (
            <select
              value={form.target_class_id ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  target_class_id: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
            >
              <option value="">Pilih kelas...</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <input
            placeholder="URL gambar cover (opsional)"
            value={form.cover_url ?? ''}
            onChange={(e) => setForm({ ...form, cover_url: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.requires_rsvp}
              onChange={(e) => setForm({ ...form, requires_rsvp: e.target.checked })}
            />
            <span>Butuh RSVP / konfirmasi kehadiran</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted">Batal</button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg disabled:opacity-50"
          >
            {mut.isPending ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RsvpModal({
  event,
  response,
  onClose,
}: {
  event: SchoolEvent;
  response: 'yes' | 'no' | 'maybe';
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const mut = useMutation({
    mutationFn: () => rsvpEvent(event.id, { response, note: note || undefined }),
    onSuccess: () => {
      toast.success('RSVP terkirim');
      qc.invalidateQueries({ queryKey: ['events'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">RSVP — {response.toUpperCase()}</h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <p className="text-text-muted text-xs">{event.title}</p>
          <textarea
            placeholder="Catatan (opsional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
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
            Kirim RSVP
          </button>
        </div>
      </div>
    </div>
  );
}

function ViewRsvpsModal({
  event,
  onClose,
}: {
  event: SchoolEvent;
  onClose: () => void;
}) {
  const { data: rows = [] } = useQuery({
    queryKey: ['rsvps', event.id],
    queryFn: () => fetchRsvps(event.id),
  });
  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-md max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">RSVP — {event.title}</h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-2 text-sm">
          {rows.length === 0 && <p className="text-text-muted">Belum ada respons</p>}
          {rows.map((r) => (
            <div key={r.user_id} className="flex items-center justify-between border-b border-surface-border pb-2">
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-2xs text-text-muted">{r.role}</div>
                {r.note && <div className="text-xs text-text-muted">{r.note}</div>}
              </div>
              <span
                className={cn(
                  'font-mono text-2xs px-2 py-0.5 rounded uppercase',
                  r.response === 'yes' && 'bg-success/15 text-success',
                  r.response === 'no' && 'bg-rose-500/15 text-rose-300',
                  r.response === 'maybe' && 'bg-amber-500/15 text-amber-300'
                )}
              >
                {r.response}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
