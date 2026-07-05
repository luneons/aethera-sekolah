'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Megaphone, Send, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api, { type Envelope, getErrorMessage } from '@/lib/api';
import { broadcastNotif } from '@/lib/pushApi';
import { useAuthStore } from '@/stores/useAuthStore';

interface SchoolClass {
  id: number;
  name: string;
  grade?: string | null;
  major?: string | null;
}

const ROLE_OPTIONS = [
  { value: 'employee', label: 'Semua Siswa' },
  { value: 'admin', label: 'Semua Wali Kelas / Guru' },
  { value: 'hr', label: 'Semua Guru BK' },
];

export default function BroadcastPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [target, setTarget] = useState<'all' | 'role' | 'class'>('all');
  const [targetRole, setTargetRole] = useState<string>('employee');
  const [targetClassId, setTargetClassId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: classes = [] } = useQuery({
    queryKey: ['school-classes'],
    queryFn: async () => {
      const r = await api.get<Envelope<SchoolClass[]>>('/school-classes');
      return r.data.data ?? [];
    },
    enabled: target === 'class',
  });

  const send = useMutation({
    mutationFn: () =>
      broadcastNotif({
        title: title.trim(),
        body: body.trim(),
        target,
        target_role: target === 'role' ? (targetRole as any) : null,
        target_class_id: target === 'class' ? targetClassId : null,
        url: url.trim() || undefined,
      }),
    onSuccess: (recipients) => {
      setSuccess(`Terkirim ke ${recipients} penerima.`);
      setError(null);
      setTitle('');
      setBody('');
      setUrl('');
    },
    onError: (e) => {
      setError(getErrorMessage(e));
      setSuccess(null);
    },
  });

  if (!user || user.role !== 'super_admin') {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 flex items-start gap-3">
        <ShieldAlert className="w-6 h-6 text-amber-400 shrink-0" />
        <div>
          <p className="font-semibold text-text-primary">Hanya kepala sekolah</p>
          <p className="text-sm text-text-muted mt-1">
            Halaman broadcast hanya dapat diakses oleh akun kepala sekolah.
          </p>
        </div>
      </div>
    );
  }

  const canSubmit =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (target !== 'class' || !!targetClassId);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-primary-400" />
          Broadcast Notifikasi
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Kirim pengumuman langsung ke semua warga sekolah, role tertentu, atau satu kelas saja.
        </p>
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-muted p-5 space-y-5">
        {/* Target */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Penerima
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(['all', 'role', 'class'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTarget(t)}
                className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  target === t
                    ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                    : 'border-surface-border bg-surface-raised text-text-muted hover:text-text-primary'
                }`}
              >
                {t === 'all' && 'Semua warga sekolah'}
                {t === 'role' && 'Per Role'}
                {t === 'class' && 'Per Kelas'}
              </button>
            ))}
          </div>
        </div>

        {target === 'role' && (
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Pilih role
            </label>
            <select
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-border bg-surface-raised text-sm text-text-primary"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        {target === 'class' && (
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Pilih kelas
            </label>
            <select
              value={targetClassId ?? ''}
              onChange={(e) =>
                setTargetClassId(e.target.value ? Number(e.target.value) : null)
              }
              className="w-full px-3 py-2 rounded-lg border border-surface-border bg-surface-raised text-sm text-text-primary"
            >
              <option value="">— pilih kelas —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Judul <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="Contoh: Upacara Senin pagi"
            className="w-full px-3 py-2 rounded-lg border border-surface-border bg-surface-raised text-sm text-text-primary"
          />
          <p className="text-2xs text-text-muted mt-1">{title.length}/200</p>
        </div>

        {/* Body */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Pesan <span className="text-rose-400">*</span>
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
            rows={5}
            placeholder="Isi pengumuman lengkap…"
            className="w-full px-3 py-2 rounded-lg border border-surface-border bg-surface-raised text-sm text-text-primary"
          />
          <p className="text-2xs text-text-muted mt-1">{body.length}/1000</p>
        </div>

        {/* URL */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Tautan (opsional)
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/leaderboard atau https://…"
            className="w-full px-3 py-2 rounded-lg border border-surface-border bg-surface-raised text-sm text-text-primary"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-400">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-400">
            {success}
          </div>
        )}

        <div className="flex flex-wrap gap-2 justify-end pt-2">
          <button
            onClick={() => router.push('/notifications')}
            className="px-4 py-2 rounded-lg border border-surface-border text-sm text-text-secondary hover:bg-surface-raised transition-colors"
          >
            Kembali
          </button>
          <button
            onClick={() => send.mutate()}
            disabled={!canSubmit || send.isPending}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {send.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Kirim Broadcast
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-muted p-5">
        <p className="font-display font-semibold text-sm text-text-primary mb-2">
          Tips Broadcast
        </p>
        <ul className="text-sm text-text-muted space-y-1.5 list-disc pl-5">
          <li>Notifikasi push hanya muncul di perangkat yang sudah aktif notifikasi-nya.</li>
          <li>Semua penerima tetap dapat history-nya di halaman Notifikasi.</li>
          <li>Untuk pengumuman penting (libur, ujian), pakai tautan ke halaman terkait di field URL.</li>
        </ul>
      </div>
    </div>
  );
}
