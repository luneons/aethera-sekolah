'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Edit, Megaphone, Pin, Plus, Trash2, X } from 'lucide-react';
import api, { type Envelope, getErrorMessage } from '@/lib/api';
import {
  createAnnouncement,
  deleteAnnouncement,
  fetchAnnouncements,
  markAnnouncementRead,
  updateAnnouncement,
  type Announcement,
  type AnnouncementInput,
} from '@/lib/announcementsApi';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn, formatDate } from '@/lib/utils';

interface SchoolClass { id: number; name: string }

const AUDIENCES = [
  { value: 'all', label: 'Semua' },
  { value: 'siswa', label: 'Siswa' },
  { value: 'guru', label: 'Guru' },
  { value: 'ortu', label: 'Orang Tua' },
  { value: 'kelas', label: 'Kelas Tertentu' },
];

export default function AnnouncementsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'hr';

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => fetchAnnouncements({ pinned_first: true, limit: 100 }),
  });

  const readMut = useMutation({
    mutationFn: (id: number) => markAnnouncementRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['announcements-unread'] });
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: number) => deleteAnnouncement(id),
    onSuccess: () => {
      toast.success('Pengumuman dihapus');
      qc.invalidateQueries({ queryKey: ['announcements'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Megaphone className="w-5 h-5 role-accent-text" />
            <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
              Pengumuman
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-display-md font-bold">Pengumuman Sekolah</h1>
          <p className="font-body text-text-muted mt-1">
            Feed pengumuman persistent. Bisa di-pin & target audience tertentu.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setCreating(true)}
            className="px-3 py-2 bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg text-sm font-medium flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Pengumuman Baru
          </button>
        )}
      </div>

      {isLoading && <div className="text-text-muted">Memuat...</div>}

      <div className="space-y-3">
        {list.map((a) => (
          <div
            key={a.id}
            className={cn(
              'rounded-lg border p-4 space-y-2 transition-colors',
              a.is_read
                ? 'bg-surface-raised border-surface-border'
                : 'bg-primary-500/5 border-primary-500/30'
            )}
            onClick={() => !a.is_read && readMut.mutate(a.id)}
          >
            <div className="flex items-start gap-3 flex-wrap">
              {a.pinned && (
                <span className="font-mono text-2xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 flex items-center gap-1">
                  <Pin className="w-3 h-3" /> PINNED
                </span>
              )}
              {!a.is_read && (
                <span className="font-mono text-2xs px-2 py-0.5 rounded bg-primary-500 text-text-inverse">
                  BARU
                </span>
              )}
              <span className="font-mono text-2xs text-text-muted">
                {AUDIENCES.find((x) => x.value === a.audience)?.label || a.audience}
                {a.target_class_name && ` • ${a.target_class_name}`}
              </span>
              <span className="font-mono text-2xs text-text-muted ml-auto">
                {formatDate(a.created_at)}
              </span>
            </div>
            <h3 className="font-display font-bold text-lg">{a.title}</h3>
            <p className="font-body text-sm text-text-secondary whitespace-pre-wrap">
              {a.body}
            </p>
            <div className="flex items-center gap-2 text-2xs text-text-muted">
              <span>oleh {a.created_by_name || '?'}</span>
              {a.expire_at && (
                <span>• berlaku sampai {formatDate(a.expire_at)}</span>
              )}
            </div>
            {isAdmin && (
              <div className="flex gap-2 pt-2 border-t border-surface-border" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setEditing(a)}
                  className="px-3 py-1 text-xs bg-surface-muted text-text-muted hover:text-text-primary rounded flex items-center gap-1"
                >
                  <Edit className="w-3 h-3" /> Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Hapus "${a.title}"?`)) removeMut.mutate(a.id);
                  }}
                  className="px-3 py-1 text-xs bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 rounded flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        ))}
        {list.length === 0 && !isLoading && (
          <div className="text-center text-text-muted py-12">
            Belum ada pengumuman
          </div>
        )}
      </div>

      {creating && <AnnouncementModal onClose={() => setCreating(false)} />}
      {editing && (
        <AnnouncementModal existing={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function AnnouncementModal({
  existing,
  onClose,
}: {
  existing?: Announcement;
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

  const [form, setForm] = useState<AnnouncementInput>({
    title: existing?.title ?? '',
    body: existing?.body ?? '',
    audience: existing?.audience ?? 'all',
    target_class_id: existing?.target_class_id ?? null,
    pinned: existing?.pinned ?? false,
    publish_at: existing?.publish_at ? toLocalIso(existing.publish_at) : null,
    expire_at: existing?.expire_at ? toLocalIso(existing.expire_at) : null,
  });

  const mut = useMutation({
    mutationFn: () => {
      const payload: AnnouncementInput = {
        ...form,
        publish_at: form.publish_at ? new Date(form.publish_at).toISOString() : null,
        expire_at: form.expire_at ? new Date(form.expire_at).toISOString() : null,
        target_class_id: form.audience === 'kelas' ? form.target_class_id : null,
      };
      return existing ? updateAnnouncement(existing.id, payload) : createAnnouncement(payload);
    },
    onSuccess: () => {
      toast.success('Tersimpan');
      qc.invalidateQueries({ queryKey: ['announcements'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">
            {existing ? 'Edit Pengumuman' : 'Pengumuman Baru'}
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
            placeholder="Isi pengumuman"
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={6}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <div className="grid grid-cols-2 gap-2">
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
            {form.audience === 'kelas' && (
              <div>
                <label className="text-xs text-text-muted">Kelas</label>
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
                  <option value="">Pilih...</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-text-muted">Tayang dari (opsional)</label>
              <input
                type="datetime-local"
                value={form.publish_at ?? ''}
                onChange={(e) => setForm({ ...form, publish_at: e.target.value || null })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Berlaku sampai (opsional)</label>
              <input
                type="datetime-local"
                value={form.expire_at ?? ''}
                onChange={(e) => setForm({ ...form, expire_at: e.target.value || null })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
            />
            <span>Pin di paling atas</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted">Batal</button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !form.title || !form.body}
            className="px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg disabled:opacity-50"
          >
            {mut.isPending ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}
