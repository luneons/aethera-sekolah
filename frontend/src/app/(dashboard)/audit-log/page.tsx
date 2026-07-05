'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  History,
  Loader2,
  Shield,
} from 'lucide-react';
import { fetchAuditLogs, fetchAuditStats } from '@/lib/auditApi';
import { cn, formatDate } from '@/lib/utils';

const ACTION_COLOR: Record<string, string> = {
  LOGIN: 'bg-emerald-500/15 text-emerald-300',
  LOGIN_FAILED: 'bg-rose-500/15 text-rose-300',
  LOGIN_LOCKED: 'bg-rose-500/15 text-rose-300',
  LOGIN_2FA: 'bg-violet-500/15 text-violet-300',
  '2FA_ENABLE': 'bg-emerald-500/15 text-emerald-300',
  '2FA_DISABLE': 'bg-amber-500/15 text-amber-300',
  '2FA_FAILED': 'bg-rose-500/15 text-rose-300',
  '2FA_RECOVERY_USED': 'bg-violet-500/15 text-violet-300',
  LOGOUT: 'bg-text-muted/15 text-text-muted',
  RESET_PASSWORD: 'bg-amber-500/15 text-amber-300',
  CHANGE_PASSWORD: 'bg-blue-500/15 text-blue-300',
  UPDATE_PROFILE: 'bg-blue-500/15 text-blue-300',
  PPDB_ACCEPTED: 'bg-emerald-500/15 text-emerald-300',
  PPDB_REJECTED: 'bg-rose-500/15 text-rose-300',
  PPDB_ENROLL: 'bg-violet-500/15 text-violet-300',
};

function actionStyle(action: string): string {
  return ACTION_COLOR[action] || 'bg-text-muted/15 text-text-secondary';
}

export default function AuditLogPage() {
  const [actionFilter, setActionFilter] = useState('');

  const { data: stats } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: fetchAuditStats,
    refetchInterval: 60_000,
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit-logs', actionFilter],
    queryFn: () => fetchAuditLogs({ action: actionFilter || undefined, limit: 200 }),
  });

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Audit Trail
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Audit Log</h1>
        <p className="font-body text-text-muted mt-1">
          Riwayat aktivitas sensitif user — login, perubahan password, 2FA, dan keputusan PPDB.
        </p>
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBox label="Event 30 Hari" value={stats.total_events_30d} />
            <StatBox label="Login Gagal 24jam" value={stats.failed_logins_24h} tone="text-rose-300" />
            <StatBox label="Top Action" value={stats.by_action[0]?.action ?? '-'} small />
            <StatBox label="User Suspicious" value={stats.suspicious_users.length} tone="text-amber-300" />
          </div>

          {stats.suspicious_users.length > 0 && (
            <div className="rounded-lg bg-rose-500/5 border border-rose-500/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-rose-300" />
                <h3 className="font-display font-bold">User dengan Banyak Login Gagal</h3>
              </div>
              <div className="space-y-1.5">
                {stats.suspicious_users.map((u) => (
                  <div key={u.user_id} className="flex justify-between items-center text-sm">
                    <span>{u.user_name}</span>
                    <span className="font-mono text-rose-300">{u.failed_count}× failed</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.by_action.length > 0 && (
            <div className="rounded-lg bg-surface-raised border border-surface-border p-4">
              <h3 className="font-display font-bold mb-3 flex items-center gap-2">
                <History className="w-4 h-4" />
                Top Activities (30 hari)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {stats.by_action.map((a) => (
                  <button
                    key={a.action}
                    onClick={() => setActionFilter(a.action === actionFilter ? '' : a.action)}
                    className={cn(
                      'rounded p-2 text-left transition-colors',
                      a.action === actionFilter
                        ? 'bg-primary-500/15 border border-primary-500/50'
                        : 'bg-surface-base hover:bg-surface-muted border border-transparent'
                    )}
                  >
                    <div className={cn('font-mono text-2xs uppercase truncate', actionStyle(a.action))}>
                      {a.action}
                    </div>
                    <div className="font-display font-bold text-lg">{a.count}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-text-muted">Filter Action:</span>
        {['', 'LOGIN', 'LOGIN_FAILED', 'LOGIN_LOCKED', 'LOGOUT', '2FA_ENABLE', 'RESET_PASSWORD'].map((a) => (
          <button
            key={a || 'all'}
            onClick={() => setActionFilter(a)}
            className={cn(
              'px-3 py-1 text-xs rounded-md font-mono uppercase',
              actionFilter === a
                ? 'bg-primary-500 text-text-inverse'
                : 'bg-surface-muted text-text-muted hover:text-text-primary'
            )}
          >
            {a || 'SEMUA'}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-text-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          Memuat...
        </div>
      )}

      <div className="rounded-lg bg-surface-raised border border-surface-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Waktu</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">User</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Action</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Target</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-surface-border">
                <td className="px-3 py-2 text-xs font-mono text-text-muted whitespace-nowrap">
                  {formatDate(l.created_at)}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium text-sm">{l.user_name || '?'}</div>
                </td>
                <td className="px-3 py-2">
                  <span className={cn('font-mono text-2xs px-2 py-0.5 rounded uppercase', actionStyle(l.action))}>
                    {l.action}
                  </span>
                </td>
                <td className="px-3 py-2 text-2xs text-text-muted">
                  {l.target_type && `${l.target_type} #${l.target_id}`}
                </td>
                <td className="px-3 py-2 text-2xs font-mono text-text-muted">
                  {l.ip_address || '-'}
                </td>
              </tr>
            ))}
            {logs.length === 0 && !isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-text-muted">
                  Tidak ada log
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: number | string;
  tone?: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-lg bg-surface-raised border border-surface-border p-3">
      <div className="text-2xs uppercase tracking-widest text-text-muted font-mono">{label}</div>
      <div className={cn('font-display font-bold mt-1', small ? 'text-base' : 'text-2xl', tone)}>
        {value}
      </div>
    </div>
  );
}
