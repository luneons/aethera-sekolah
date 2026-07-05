'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, Download, FileSpreadsheet } from 'lucide-react';
import api, { type Envelope } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOrgMode } from '@/stores/useOrgMode';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ReportLayout } from '@/components/reports/ReportLayout';

interface MonthlySummaryRow {
  user_id: number;
  full_name: string;
  employee_id: string;
  present: number;
  late: number;
  excused: number;
  absent: number;
  total_late_minutes: number;
}

interface MonthlyResponse {
  period: string;
  summary: MonthlySummaryRow[];
}

export default function AttendanceReportPage() {
  const { t } = useOrgMode();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [from, setFrom] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  );
  const [to, setTo] = useState(today.toISOString().slice(0, 10));

  const accessToken = useAuthStore((s) => s.accessToken);

  const { data, isLoading } = useQuery({
    queryKey: ['monthly-report', year, month],
    queryFn: async () => {
      const r = await api.get<Envelope<MonthlyResponse>>('/reports/monthly', {
        params: { year, month },
      });
      return r.data.data!;
    },
  });

  const downloadCsv = async () => {
    const url = `${process.env.NEXT_PUBLIC_API_URL}/reports/export?from=${from}&to=${to}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `attendance_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <ReportLayout
      title="Rekap Kehadiran Bulanan"
      description={`Rekap absensi per ${t.employee} dalam satu bulan`}
      category="Kehadiran"
      icon={CalendarRange}
    >
      <Card padding="lg">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <h3 className="font-display font-semibold">Filter Periode</h3>
          </div>
          <div className="flex gap-3 items-end">
            <Input
              label="Tahun"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-28"
            />
            <div className="space-y-1.5">
              <label className="block font-body text-sm font-medium text-text-secondary">
                Bulan
              </label>
              <select
                className="bg-surface-raised border border-surface-border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 outline-none"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {[
                  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
                ].map((name, i) => (
                  <option key={i + 1} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto -mx-6">
          <table className="w-full">
            <thead className="bg-surface-muted border-y border-surface-border">
              <tr>
                <th className="text-left px-6 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">
                  {t.Employee}
                </th>
                <th className="text-right px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">
                  Hadir
                </th>
                <th className="text-right px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">
                  Telat
                </th>
                <th className="text-right px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">
                  Izin
                </th>
                <th className="text-right px-4 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">
                  Alpa
                </th>
                <th className="text-right px-6 py-3 font-mono text-2xs text-text-muted uppercase tracking-widest">
                  Total Telat
                </th>
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
              {data?.summary?.map((row) => (
                <tr key={row.user_id} className="hover:bg-surface-muted/50">
                  <td className="px-6 py-3">
                    <div>
                      <p className="font-body font-medium text-sm">{row.full_name}</p>
                      <p className="font-mono text-xs text-text-muted">{row.employee_id}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-success">{row.present}</td>
                  <td className="px-4 py-3 text-right font-mono text-amber-300">{row.late}</td>
                  <td className="px-4 py-3 text-right font-mono text-text-secondary">{row.excused}</td>
                  <td className="px-4 py-3 text-right font-mono text-rose-300">{row.absent}</td>
                  <td className="px-6 py-3 text-right font-mono text-sm">
                    {row.total_late_minutes}m
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card padding="lg">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <h3 className="font-display font-semibold text-lg flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary-400" />
              Export Data
            </h3>
            <p className="font-body text-sm text-text-muted">
              Unduh seluruh record absensi dalam format CSV
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <Input label="Dari" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="Sampai" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button onClick={downloadCsv} leftIcon={<Download className="w-4 h-4" />}>
            Export CSV
          </Button>
        </div>
      </Card>
    </ReportLayout>
  );
}
