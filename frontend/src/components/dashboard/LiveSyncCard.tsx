'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gsap } from 'gsap';
import { Cpu, Database, RefreshCw, ScanLine, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import api, { type Envelope } from '@/lib/api';

/**
 * Live Sync widget — pakai data REAL dari /reports/sync-feed.
 *
 * Visual storytelling:
 *  - Status pulse hijau "Automation Active"
 *  - Stats real-time: synced records, hadir/telat, bytes processed
 *  - Stream log = attendance terakhir hari ini, di-mapping jadi event log
 *  - Countdown 15 detik antar refresh (poll endpoint)
 *  - Mini radar yang berputar saat data refresh
 *
 * Kalau API gagal (offline/error), fallback ke placeholder agar tidak
 * meledak di production.
 */

interface SyncFeedStats {
  total_students: number;
  present_today: number;
  late_today: number;
  synced_records: number;
  bytes_processed: number;
}

interface SyncFeedEvent {
  id: number;
  time: string;
  action: string;
  user_id: number;
  user_name: string;
  status: string;
  label: string;
}

interface SyncFeedData {
  stats: SyncFeedStats;
  recent_events: SyncFeedEvent[];
  server_time: string;
}

const REFRESH_INTERVAL_MS = 15_000;

export function LiveSyncCard() {
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_MS / 1000);
  const radarRef = useRef<HTMLDivElement>(null);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ['sync-feed'],
    queryFn: async () => {
      const r = await api.get<Envelope<SyncFeedData>>('/reports/sync-feed', {
        params: { limit: 8 },
      });
      return r.data.data!;
    },
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS / 2,
  });

  // Reset countdown saat data baru masuk
  useEffect(() => {
    setCountdown(REFRESH_INTERVAL_MS / 1000);
  }, [data]);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((c) => (c <= 1 ? REFRESH_INTERVAL_MS / 1000 : c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Animate radar saat data refresh
  useEffect(() => {
    if (!radarRef.current) return;
    gsap.fromTo(
      radarRef.current,
      { scale: 0.96, opacity: 0.6 },
      { scale: 1, opacity: 1, duration: 0.8, ease: 'power2.out' }
    );
  }, [data?.server_time]);

  const stats = data?.stats;
  const events = data?.recent_events ?? [];
  const progress = ((REFRESH_INTERVAL_MS / 1000 - countdown) / (REFRESH_INTERVAL_MS / 1000)) * 100;

  return (
    <Card variant="glow" padding="lg" className="relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-cyber bg-grid opacity-30 pointer-events-none" />
      <div className="absolute -right-24 -top-24 w-64 h-64 rounded-full bg-success/15 blur-3xl pointer-events-none" />

      <div className="relative space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex w-2 h-2 rounded-full bg-success animate-soft-pulse" />
              <p className="font-mono text-2xs uppercase tracking-widest text-success">
                {isFetching ? 'Syncing…' : 'Automation Active'}
              </p>
            </div>
            <h3 className="mt-2 font-display text-xl font-bold text-text-primary">
              Live Sync
            </h3>
            <p className="font-body text-sm text-text-muted mt-1">
              Data real-time dari kiosk pengenalan wajah. Tidak ada input manual lagi.
            </p>
          </div>

          {/* Mini radar */}
          <div ref={radarRef} className="relative w-16 h-16 shrink-0">
            <span className="absolute inset-0 rounded-full border border-primary-500/40" />
            <span className="absolute inset-2 rounded-full border border-primary-500/30" />
            <span className="absolute inset-4 rounded-full border border-primary-500/20" />
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary-400" />
            <span className="absolute inset-0 animate-radar">
              <span className="absolute top-1/2 left-1/2 origin-left h-0.5 w-1/2 bg-gradient-to-r from-success/80 to-transparent" />
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Mini
            icon={<Database className="w-4 h-4" />}
            label="Synced Records"
            value={stats?.synced_records?.toString() ?? '—'}
          />
          <Mini
            icon={<ScanLine className="w-4 h-4" />}
            label="Hadir / Telat"
            value={
              stats
                ? `${stats.present_today}/${stats.late_today}`
                : '—/—'
            }
          />
          <Mini
            icon={<ShieldCheck className="w-4 h-4" />}
            label="Data Diproses"
            value={
              stats
                ? `${(stats.bytes_processed / 1024).toFixed(0)} KB`
                : '—'
            }
          />
        </div>

        {/* Countdown bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-widest text-text-muted">
              <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
              Sync berikutnya
            </span>
            <button
              onClick={() => refetch()}
              className="font-mono text-xs text-primary-300 hover:text-primary-200 transition-colors"
            >
              {countdown}s
            </button>
          </div>
          <div className="relative h-1.5 rounded-full bg-surface-overlay overflow-hidden">
            <span
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary-500 to-success transition-[width] duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Live event feed */}
        <div className="rounded-lg border border-surface-border bg-surface-base/60 p-3 max-h-32 overflow-hidden">
          <p className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-widest text-text-muted mb-2">
            <Cpu className="w-3 h-3" /> Stream log
          </p>
          {events.length === 0 ? (
            <p className="font-mono text-xs text-text-muted italic">
              Belum ada aktivitas hari ini.
            </p>
          ) : (
            <ul className="space-y-1">
              {events.slice(0, 6).map((e) => (
                <li
                  key={e.id}
                  className="font-mono text-xs text-text-secondary truncate animate-ticker"
                  title={e.label}
                >
                  {e.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

function Mini({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-overlay/60 p-3">
      <div className="flex items-center gap-1.5 text-primary-300 mb-1">{icon}</div>
      <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">
        {label}
      </p>
      <p className="font-display text-base font-bold text-text-primary">{value}</p>
    </div>
  );
}
