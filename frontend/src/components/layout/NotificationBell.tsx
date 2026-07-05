'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, Check, MoreHorizontal } from 'lucide-react';
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllRead,
  markNotifRead,
  type AppNotification,
} from '@/lib/pushApi';
import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<string, string> = {
  attendance_reminder: 'Absensi',
  discipline_penalty: 'Disiplin',
  discipline_appreciation: 'Apresiasi',
  approval_pending: 'Persetujuan',
  approval_decision: 'Keputusan',
  lms_assignment: 'Tugas',
  lms_grade: 'Nilai',
  lms_material: 'Materi',
  chat_message: 'Chat',
  chat_flag: 'Chat ter-flag',
  broadcast: 'Pengumuman',
  system: 'Sistem',
};

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam`;
  return `${Math.floor(diff / 86400)} hr`;
}

/**
 * Bell icon di TopBar dengan badge unread + dropdown preview.
 * Polling setiap 15 detik (lebih jarang dari chat karena push juga
 * langsung notify).
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: count = 0 } = useQuery({
    queryKey: ['notif-unread'],
    queryFn: fetchUnreadCount,
    refetchInterval: 15_000,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: list, isLoading } = useQuery({
    queryKey: ['notif-recent'],
    queryFn: () => fetchNotifications({ page: 1, per_page: 8 }),
    enabled: open,
    staleTime: 0,
  });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const handleClickItem = async (n: AppNotification) => {
    if (!n.is_read) {
      await markNotifRead(n.id);
      qc.invalidateQueries({ queryKey: ['notif-unread'] });
      qc.invalidateQueries({ queryKey: ['notif-recent'] });
    }
    setOpen(false);
  };

  const handleMarkAll = async () => {
    await markAllRead();
    qc.invalidateQueries({ queryKey: ['notif-unread'] });
    qc.invalidateQueries({ queryKey: ['notif-recent'] });
  };

  const items = list?.items ?? [];
  const Icon = count > 0 ? BellRing : Bell;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-text-muted hover:text-primary-400 hover:bg-surface-raised transition-colors"
        aria-label="Notifikasi"
      >
        <Icon className={cn('w-5 h-5', count > 0 && 'animate-pulse text-primary-400')} />
        {count > 0 && (
          <span className="absolute top-1 right-1 inline-flex items-center justify-center min-w-[1rem] h-4 px-1 rounded-full bg-rose-500 text-white font-mono text-[10px] font-bold">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop di mobile supaya tap di luar nutup dropdown */}
          <div
            className="lg:hidden fixed inset-0 z-[9998] bg-surface-base/40"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              // Mobile: full-width fixed di bawah TopBar, dengan padding sisi safe
              'fixed left-2 right-2 top-[3.75rem] z-[9999]',
              // Desktop: absolute, anchored kanan ke bell
              'lg:absolute lg:left-auto lg:right-0 lg:top-full lg:mt-2 lg:w-[22rem]',
              'rounded-xl border border-surface-border bg-surface-raised shadow-card-hover overflow-hidden animate-fade-up'
            )}
          >
          <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-b border-surface-border gap-2">
            <p className="font-display font-semibold text-sm text-text-primary shrink-0">
              Notifikasi
            </p>
            <button
              onClick={handleMarkAll}
              className="flex items-center gap-1 text-2xs sm:text-xs text-text-muted hover:text-primary-400 transition-colors shrink-0"
              disabled={count === 0}
            >
              <Check className="w-3.5 h-3.5" />
              Tandai semua dibaca
            </button>
          </div>

          <div className="max-h-[65vh] overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-10 text-center text-text-muted text-sm">Memuat…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-text-muted text-sm">
                Belum ada notifikasi.
              </div>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  href={n.url || '/notifications'}
                  onClick={() => handleClickItem(n)}
                  className={cn(
                    'block px-3 sm:px-4 py-3 border-b border-surface-border/60 hover:bg-surface-muted/60 transition-colors',
                    !n.is_read && 'bg-primary-500/5'
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && (
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <p className="font-body font-semibold text-sm text-text-primary line-clamp-2 break-words">
                          {n.title}
                        </p>
                        <span className="font-mono text-2xs text-text-muted shrink-0 mt-0.5">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                      {n.body && (
                        <p className="text-xs text-text-secondary line-clamp-2 break-words">{n.body}</p>
                      )}
                      <p className="font-mono text-2xs text-text-muted mt-1 uppercase tracking-wider">
                        {CATEGORY_LABELS[n.category] || n.category}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-2 px-4 py-3 border-t border-surface-border text-sm text-primary-400 hover:bg-surface-muted/60 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
            Lihat semua
          </Link>
          </div>
        </>
      )}
    </div>
  );
}
