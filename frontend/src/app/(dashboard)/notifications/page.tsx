'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  BellRing,
  Check,
  Loader2,
  Megaphone,
  Trash2,
} from 'lucide-react';
import {
  deleteNotif,
  fetchNotifications,
  markAllRead,
  markNotifRead,
  sendTestNotif,
  type AppNotification,
} from '@/lib/pushApi';
import {
  getCurrentSubscription,
  getPermissionState,
  isPushSupported,
  subscribeUser,
  unsubscribeUser,
} from '@/lib/pushHelper';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/useAuthStore';

const CATEGORIES: { value: string; label: string }[] = [
  { value: '', label: 'Semua' },
  { value: 'broadcast', label: 'Pengumuman' },
  { value: 'attendance_reminder', label: 'Absensi' },
  { value: 'discipline_penalty', label: 'Disiplin' },
  { value: 'discipline_appreciation', label: 'Apresiasi' },
  { value: 'lms_assignment', label: 'Tugas' },
  { value: 'lms_grade', label: 'Nilai' },
  { value: 'lms_material', label: 'Materi' },
  { value: 'chat_message', label: 'Chat' },
  { value: 'chat_flag', label: 'Chat ter-flag' },
  { value: 'approval_pending', label: 'Persetujuan' },
  { value: 'approval_decision', label: 'Keputusan' },
  { value: 'system', label: 'Sistem' },
];

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [category, setCategory] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushOk, setPushOk] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['notif-list', category, onlyUnread],
    queryFn: () =>
      fetchNotifications({
        page: 1,
        per_page: 50,
        category: category || undefined,
        only_unread: onlyUnread,
      }),
    staleTime: 0,
    refetchOnMount: true,
  });

  const items: AppNotification[] = data?.items ?? [];

  const markRead = useMutation({
    mutationFn: markNotifRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notif-list'] });
      qc.invalidateQueries({ queryKey: ['notif-unread'] });
      qc.invalidateQueries({ queryKey: ['notif-recent'] });
    },
  });
  const markAll = useMutation({
    mutationFn: markAllRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notif-list'] });
      qc.invalidateQueries({ queryKey: ['notif-unread'] });
      qc.invalidateQueries({ queryKey: ['notif-recent'] });
    },
  });
  const remove = useMutation({
    mutationFn: deleteNotif,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notif-list'] });
      qc.invalidateQueries({ queryKey: ['notif-unread'] });
    },
  });

  const handleEnablePush = async () => {
    setPushBusy(true);
    setPushError(null);
    setPushOk(null);
    try {
      await subscribeUser();
      setPushOk('Notifikasi push aktif untuk perangkat ini.');
    } catch (e: unknown) {
      setPushError(e instanceof Error ? e.message : 'Gagal mengaktifkan notifikasi');
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisablePush = async () => {
    setPushBusy(true);
    setPushError(null);
    setPushOk(null);
    try {
      await unsubscribeUser();
      setPushOk('Notifikasi push dinonaktifkan untuk perangkat ini.');
    } catch (e: unknown) {
      setPushError(e instanceof Error ? e.message : 'Gagal mematikan notifikasi');
    } finally {
      setPushBusy(false);
    }
  };

  const handleTest = async () => {
    setPushError(null);
    setPushOk(null);
    try {
      await sendTestNotif();
      setPushOk('Tes notifikasi terkirim. Cek HP/desktop kamu.');
      qc.invalidateQueries({ queryKey: ['notif-list'] });
      qc.invalidateQueries({ queryKey: ['notif-unread'] });
    } catch (e: unknown) {
      setPushError(e instanceof Error ? e.message : 'Tes gagal');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-text-primary">Notifikasi</h1>
        <p className="text-sm text-text-muted mt-1">
          Pemberitahuan terbaru untukmu — push ke HP, dan history di sini.
        </p>
      </div>

      {/* Push controls */}
      <PushSettingsCard
        busy={pushBusy}
        error={pushError}
        ok={pushOk}
        onEnable={handleEnablePush}
        onDisable={handleDisablePush}
        onTest={handleTest}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 rounded-lg border border-surface-border bg-surface-muted text-sm text-text-primary"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <label className="inline-flex items-center gap-2 text-sm text-text-secondary px-3 py-2 rounded-lg border border-surface-border bg-surface-muted cursor-pointer">
          <input
            type="checkbox"
            checked={onlyUnread}
            onChange={(e) => setOnlyUnread(e.target.checked)}
            className="accent-primary-500"
          />
          Hanya yang belum dibaca
        </label>

        <div className="grow" />

        <button
          onClick={() => markAll.mutate()}
          disabled={markAll.isPending || items.every((i) => i.is_read)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-surface-border text-text-secondary hover:text-primary-400 disabled:opacity-50 transition-colors"
        >
          <Check className="w-4 h-4" />
          Tandai semua dibaca
        </button>

        {user?.role === 'super_admin' && (
          <Link
            href="/broadcast"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-primary-500 hover:bg-primary-600 text-white transition-colors"
          >
            <Megaphone className="w-4 h-4" />
            Broadcast
          </Link>
        )}
      </div>

      {/* List */}
      <div className="rounded-xl border border-surface-border bg-surface-muted overflow-hidden">
        {isLoading ? (
          <div className="px-4 py-12 text-center text-text-muted text-sm">
            <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" />
            Memuat…
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-16 text-center text-text-muted text-sm">
            <Bell className="w-10 h-10 mx-auto mb-3 opacity-40" />
            Tidak ada notifikasi {onlyUnread ? 'yang belum dibaca' : 'di kategori ini'}.
          </div>
        ) : (
          items.map((n) => (
            <div
              key={n.id}
              className={cn(
                'flex items-start gap-2 sm:gap-3 px-3 sm:px-4 py-3 border-b border-surface-border/60 last:border-b-0',
                !n.is_read && 'bg-primary-500/5'
              )}
            >
              {!n.is_read && (
                <span className="mt-2 w-2 h-2 rounded-full bg-primary-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-body font-semibold text-sm text-text-primary line-clamp-2 break-words">
                    {n.title}
                  </p>
                  <span className="font-mono text-2xs text-text-muted shrink-0 mt-0.5">
                    {timeAgo(n.created_at)}
                  </span>
                </div>
                {n.body && (
                  <p className="text-sm text-text-secondary mb-1.5 whitespace-pre-line break-words line-clamp-3">
                    {n.body}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="font-mono text-2xs text-text-muted uppercase tracking-wider">
                    {n.category}
                  </span>
                  {n.url && (
                    <Link
                      href={n.url}
                      onClick={() => !n.is_read && markRead.mutate(n.id)}
                      className="text-xs text-primary-400 hover:underline"
                    >
                      Buka →
                    </Link>
                  )}
                  {!n.is_read && (
                    <button
                      onClick={() => markRead.mutate(n.id)}
                      className="text-xs text-text-muted hover:text-primary-400"
                    >
                      Tandai dibaca
                    </button>
                  )}
                  <button
                    onClick={() => remove.mutate(n.id)}
                    className="ml-auto text-text-muted hover:text-rose-400 p-1 -m-1"
                    aria-label="Hapus"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PushSettingsCard({
  busy,
  error,
  ok,
  onEnable,
  onDisable,
  onTest,
}: {
  busy: boolean;
  error: string | null;
  ok: string | null;
  onEnable: () => void;
  onDisable: () => void;
  onTest: () => void;
}) {
  const [hasSub, setHasSub] = useState<boolean | null>(null);
  const [perm, setPerm] = useState<string>('default');

  // Refresh state on mount + after action
  const refreshState = async () => {
    if (!isPushSupported()) {
      setHasSub(false);
      setPerm('unsupported');
      return;
    }
    setPerm(getPermissionState());
    const sub = await getCurrentSubscription();
    setHasSub(!!sub);
  };

  useEffect(() => {
    void refreshState();
  }, []);

  const handleEnable = async () => {
    await onEnable();
    await refreshState();
  };
  const handleDisable = async () => {
    await onDisable();
    await refreshState();
  };

  const supported = perm !== 'unsupported';

  return (
    <div className="rounded-xl border border-surface-border bg-surface-muted p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-500/15 text-primary-400 flex items-center justify-center shrink-0">
          {hasSub ? <BellRing className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
        </div>
        <div className="flex-1">
          <p className="font-display font-semibold text-text-primary">Push ke perangkat ini</p>
          <p className="text-sm text-text-muted mt-0.5">
            {!supported
              ? 'Browser ini tidak mendukung Web Push. Gunakan Chrome / Edge / Firefox versi terbaru, atau install PWA.'
              : hasSub
              ? 'Notifikasi aktif. Pesan baru akan muncul meski tab tertutup.'
              : perm === 'denied'
              ? 'Izin notifikasi diblokir. Buka pengaturan browser untuk mengaktifkan, lalu kembali ke sini.'
              : 'Aktifkan agar absensi, tugas, dan pengumuman langsung masuk ke HP-mu.'}
          </p>
          {error && <p className="text-sm text-rose-400 mt-2">{error}</p>}
          {ok && <p className="text-sm text-emerald-400 mt-2">{ok}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {supported && !hasSub && (
              <button
                onClick={handleEnable}
                disabled={busy || perm === 'denied'}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Aktifkan notifikasi
              </button>
            )}
            {supported && hasSub && (
              <>
                <button
                  onClick={onTest}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-raised hover:bg-surface-border text-text-primary text-sm font-medium transition-colors border border-surface-border"
                >
                  Tes notifikasi
                </button>
                <button
                  onClick={handleDisable}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  Matikan
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
