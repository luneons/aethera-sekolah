'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Clock, TrendingDown, TrendingUp, UserCheck, UserX } from 'lucide-react';
import api, { type Envelope } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOrgMode } from '@/stores/useOrgMode';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDate, formatDuration, formatTime } from '@/lib/utils';

interface AttendanceRecord {
  id: number;
  attendance_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: string;
  late_minutes: number;
  work_duration: number | null;
}

interface Summary {
  period: string;
  present: number;
  late: number;
  excused: number;
  absent: number;
  total_late_minutes: number;
  total_work_minutes: number;
  today: {
    status: string | null;
    check_in_at: string | null;
    check_out_at: string | null;
    late_minutes: number;
  };
}

interface Meta {
  page: number;
  per_page: number;
  total: number;
}

export default function MyAttendancePage() {
  const user = useAuthStore((s) => s.user);
  const { t, isSchool } = useOrgMode();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const PER_PAGE = 20;

  const { data: summary } = useQuery({
    queryKey: ['my-summary', year, month],
    queryFn: async () => {
      const r = await api.get<Envelope<Summary>>('/attendance/my/summary', {
        params: { year, month },
      });
      return r.data.data!;
    },
  });

  const { data: recordsEnv, isLoading } = useQuery({
    queryKey: ['my-records', page, statusFilter],
    queryFn: async () => {
      const r = await api.get<Envelope<AttendanceRecord[]> & { meta: Meta }>('/attendance/my/records', {
        params: {
          page,
          per_page: PER_PAGE,
          status: statusFilter || undefined,
        },
      });
      return r.data;
    },
  });

  const records = recordsEnv?.data ?? [];
  const meta = recordsEnv?.meta;
  const totalPages = meta ? Math.ceil(meta.total / PER_PAGE) : 1;

  // Today's status card
  const todayStatus = summary?.today;
  const todayStatusColor = {
    present: 'text-success bg-success/10 border-success/20',
    late: 'text-accent-400 bg-accent-500/10 border-accent-500/20',
    absent: 'text-danger bg-danger/10 border-danger/20',
    excused: 'text-text-secondary bg-surface-muted border-surface-border',
  }[todayStatus?.status ?? ''] ?? 'text-text-muted bg-surface-muted border-surface-border';

  const todayStatusLabel = {
    present: isSchool ? '✅ Sudah Masuk Sekolah' : '✅ Sudah Check-in',
    late: isSchool ? '⚠️ Terlambat Masuk' : '⚠️ Terlambat Check-in',
    absent: '❌ Tidak Hadir',
    excused: '📋 Izin',
  }[todayStatus?.status ?? ''] ?? '⏳ Belum Absen Hari Ini';

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Absensi Saya</h1>
        <p className="font-body text-text-muted mt-1 text-sm sm:text-base">
          Halo, <span className="text-text-primary font-medium">{user?.full_name}</span> — riwayat kehadiran kamu
        </p>
      </div>

      {/* Today's status */}
      <Card padding="lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-text-muted uppercase tracking-widest mb-1">Hari Ini</p>
            <p className="font-display font-bold text-xl capitalize">
              {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <div className={`px-4 py-3 rounded-xl border text-center min-w-[180px] ${todayStatusColor}`}>
            <p className="font-display font-semibold text-base">{todayStatusLabel}</p>
            {todayStatus?.check_in_at && (
              <p className="font-mono text-xs mt-1 opacity-80">
                {isSchool ? 'Masuk' : 'Check-in'}: {formatTime(todayStatus.check_in_at)}
                {todayStatus.check_out_at && ` · ${isSchool ? 'Pulang' : 'Check-out'}: ${formatTime(todayStatus.check_out_at)}`}
              </p>
            )}
            {(todayStatus?.late_minutes ?? 0) > 0 && (
              <p className="font-mono text-xs mt-0.5 opacity-80">
                Terlambat {todayStatus?.late_minutes} menit
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Monthly summary */}
      <Card padding="lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="font-display font-semibold text-lg">Rekap Bulanan</h3>
            <p className="text-sm text-text-muted">Statistik kehadiran kamu</p>
          </div>
          <div className="flex gap-3 items-end">
            <Input
              label="Tahun"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-24"
            />
            <div className="space-y-1.5">
              <label className="block font-body text-sm font-medium text-text-secondary">Bulan</label>
              <select
                className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 outline-none"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'].map((n, i) => (
                  <option key={i + 1} value={i + 1}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Hadir */}
          <div className="p-4 rounded-xl bg-success/5 border border-success/20">
            <div className="flex items-center gap-2 mb-2">
              <UserCheck className="w-4 h-4 text-success" />
              <span className="font-mono text-xs text-text-muted uppercase tracking-widest">Hadir</span>
            </div>
            <p className="font-display font-bold text-2xl text-success">{summary?.present ?? 0}</p>
            <p className="font-mono text-xs text-text-muted mt-0.5">hari</p>
          </div>

          {/* Terlambat */}
          <div className="p-4 rounded-xl bg-accent-500/5 border border-accent-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-accent-400" />
              <span className="font-mono text-xs text-text-muted uppercase tracking-widest">Terlambat</span>
            </div>
            <p className="font-display font-bold text-2xl text-accent-400">{summary?.late ?? 0}</p>
            <p className="font-mono text-xs text-text-muted mt-0.5">hari</p>
          </div>

          {/* Absen */}
          <div className="p-4 rounded-xl bg-danger/5 border border-danger/20">
            <div className="flex items-center gap-2 mb-2">
              <UserX className="w-4 h-4 text-danger" />
              <span className="font-mono text-xs text-text-muted uppercase tracking-widest">Absen</span>
            </div>
            <p className="font-display font-bold text-2xl text-danger">{summary?.absent ?? 0}</p>
            <p className="font-mono text-xs text-text-muted mt-0.5">hari</p>
          </div>

          {/* Total Telat */}
          <div className="p-4 rounded-xl bg-surface-muted border border-surface-border">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-text-muted" />
              <span className="font-mono text-xs text-text-muted uppercase tracking-widest">Total Telat</span>
            </div>
            <p className="font-display font-bold text-2xl text-text-primary">{summary?.total_late_minutes ?? 0}</p>
            <p className="font-mono text-xs text-text-muted mt-0.5">menit</p>
          </div>
        </div>

        {/* Total jam kerja */}
        {(summary?.total_work_minutes ?? 0) > 0 && (
          <div className="mt-3 p-3 rounded-lg bg-primary-500/5 border border-primary-500/20 flex items-center gap-3">
            <TrendingUp className="w-4 h-4 text-primary-400 shrink-0" />
            <p className="text-sm text-text-secondary">
              Total jam {isSchool ? 'di sekolah' : 'kerja'} bulan ini:{' '}
              <span className="font-semibold text-primary-400">
                {formatDuration(summary?.total_work_minutes)}
              </span>
            </p>
          </div>
        )}
      </Card>

      {/* Riwayat kehadiran */}
      <Card padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-primary-400" />
            <h3 className="font-display font-semibold">Riwayat Kehadiran</h3>
          </div>
          <select
            className="bg-surface-raised border border-surface-border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 outline-none"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">Semua Status</option>
            <option value="present">Hadir</option>
            <option value="late">Terlambat</option>
            <option value="absent">Absen</option>
            <option value="excused">Izin</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-muted border-b border-surface-border">
              <tr>
                <th className="text-left px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">Tanggal</th>
                <th className="text-left px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">{t.Checkin}</th>
                <th className="text-left px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">{t.Checkout}</th>
                <th className="text-left px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">Durasi</th>
                <th className="text-left px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {isLoading && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-text-muted">Memuat...</td>
                </tr>
              )}
              {!isLoading && records.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-text-muted">
                    Belum ada riwayat kehadiran
                  </td>
                </tr>
              )}
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-surface-muted/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-sm">
                    {formatDate(r.attendance_date, { day: '2-digit', month: 'short', year: 'numeric' })}
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
        {totalPages > 1 && (
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
