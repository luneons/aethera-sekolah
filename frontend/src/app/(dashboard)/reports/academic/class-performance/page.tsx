'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, GraduationCap } from 'lucide-react';
import { ReportLayout } from '@/components/reports/ReportLayout';
import {
  classPerformanceCsvUrl,
  fetchClassPerformance,
} from '@/lib/reportsApi';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn } from '@/lib/utils';

export default function ClassPerformancePage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [semesterStart, setSemesterStart] = useState(
    new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10)
  );

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['rpt-class-performance', semesterStart],
    queryFn: () => fetchClassPerformance(semesterStart),
  });

  const downloadCsv = async () => {
    const url = classPerformanceCsvUrl();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `class_performance.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <ReportLayout
      title="Performa Akademik per Kelas"
      description="Rerata nilai, persentase tuntas KKM, dan GPA per kelas"
      category="Akademik"
      icon={GraduationCap}
      actions={
        <button
          onClick={downloadCsv}
          className="px-3 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 rounded-lg text-sm flex items-center gap-1"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      }
    >
      <div className="flex items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Periode dari</label>
          <input
            type="date"
            value={semesterStart}
            onChange={(e) => setSemesterStart(e.target.value)}
            className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <span className="text-xs text-text-muted">→ sampai sekarang</span>
      </div>

      {isLoading && <div className="text-text-muted">Memuat...</div>}

      <div className="rounded-lg bg-surface-raised border border-surface-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Kelas</th>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">Total Siswa</th>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">Σ Nilai</th>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">Rerata</th>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">Tuntas KKM</th>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">% Tuntas</th>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">GPA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.class_id} className="border-t border-surface-border">
                <td className="px-3 py-2 font-medium">{r.class_name}</td>
                <td className="px-3 py-2 text-center font-mono">{r.total_students}</td>
                <td className="px-3 py-2 text-center font-mono">{r.graded_count}</td>
                <td
                  className={cn(
                    'px-3 py-2 text-center font-mono font-bold',
                    r.avg_score >= 80
                      ? 'text-emerald-300'
                      : r.avg_score >= 70
                      ? 'text-amber-300'
                      : 'text-rose-300'
                  )}
                >
                  {r.avg_score != null ? Number(r.avg_score).toFixed(1) : '-'}
                </td>
                <td className="px-3 py-2 text-center font-mono">{r.above_kkm_count}</td>
                <td className="px-3 py-2 text-center font-mono">{r.above_kkm_pct}%</td>
                <td className="px-3 py-2 text-center font-mono">{r.avg_gpa != null ? Number(r.avg_gpa).toFixed(1) : '-'}</td>
              </tr>
            ))}
            {rows.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-text-muted">
                  Belum ada data nilai
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ReportLayout>
  );
}
