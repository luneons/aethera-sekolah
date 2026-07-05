'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api, { type Envelope } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Input } from '@/components/ui/Input';
import { formatDate, formatDuration, formatTime } from '@/lib/utils';
import { useOrgMode } from '@/stores/useOrgMode';

interface Record {
  id: number;
  user_id: number;
  user_name: string;
  employee_id: string;
  department_name: string | null;
  attendance_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: string;
  late_minutes: number;
  work_duration: number | null;
  check_in_snapshot_url: string | null;
}

interface Meta {
  page: number;
  per_page: number;
  total: number;
}

const PER_PAGE = 25;

export default function AttendancePage() {
  const { t } = useOrgMode();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);

  const { data: response, isLoading } = useQuery({
    queryKey: ['attendance-records', from, to, statusFilter, page],
    queryFn: async () => {
      const r = await api.get<Envelope<Record[]> & { meta: Meta }>('/attendance/records', {
        params: {
          date_from: from,
          date_to: to,
          status: statusFilter || undefined,
          page,
          per_page: PER_PAGE,
        },
      });
      return r.data;
    },
  });

  const data = response?.data ?? [];
  const meta = response?.meta;
  const totalPages = meta ? Math.ceil(meta.total / PER_PAGE) : 1;

  // Reset ke halaman 1 saat filter berubah
  const handleFilterChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setter(e.target.value);
    setPage(1);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">{t.page_attendance_title}</h1>
        <p className="font-body text-text-muted mt-1 text-sm sm:text-base">{t.page_attendance_subtitle}</p>
      </div>

      <Card padding="md">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Dari" type="date" value={from} onChange={handleFilterChange(setFrom)} />
          <Input label="Sampai" type="date" value={to} onChange={handleFilterChange(setTo)} />
          <div className="space-y-1.5">
            <label className="block font-body text-sm font-medium text-text-secondary">Status</label>
            <select
              className="w-full bg-surface-raised border border-surface-border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 outline-none"
              value={statusFilter}
              onChange={handleFilterChange(setStatusFilter)}
            >
              <option value="">Semua</option>
              <option value="present">Hadir</option>
              <option value="late">Terlambat</option>
              <option value="absent">Absen</option>
              <option value="excused">Izin</option>
            </select>
          </div>
        </div>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-muted border-b border-surface-border">
              <tr>
                <th className="text-left px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">Tanggal</th>
                <th className="text-left px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">{t.Employee}</th>
                <th className="text-left px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">{t.Checkin}</th>
                <th className="text-left px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">{t.Checkout}</th>
                <th className="text-left px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">Durasi</th>
                <th className="text-left px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-text-muted">
                    Memuat...
                  </td>
                </tr>
              )}
              {!isLoading && data.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-text-muted">
                    Tidak ada record dalam rentang ini
                  </td>
                </tr>
              )}
              {data.map((r) => (
                <tr key={r.id} className="hover:bg-surface-muted/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-sm">{formatDate(r.attendance_date, { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.user_name} size="sm" />
                      <div>
                        <p className="font-body font-medium text-sm">{r.user_name}</p>
                        <p className="font-mono text-xs text-text-muted">{r.employee_id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">
                    {formatTime(r.check_in_at)}
                    {r.late_minutes > 0 && (
                      <span className="ml-2 text-2xs text-accent-400">+{r.late_minutes}m</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">{formatTime(r.check_out_at)}</td>
                  <td className="px-4 py-3 font-mono text-sm">{formatDuration(r.work_duration)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {(meta?.total ?? 0) > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
            <p className="font-mono text-xs text-text-muted">
              {meta?.total ?? 0} record · Halaman {page} dari {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border border-surface-border text-text-muted hover:text-text-primary hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Sebelumnya
              </button>
              {/* Page numbers — show max 5 */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      p === page
                        ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                        : 'border-surface-border text-text-muted hover:text-text-primary hover:bg-surface-raised'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border border-surface-border text-text-muted hover:text-text-primary hover:bg-surface-raised disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Berikutnya →
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
