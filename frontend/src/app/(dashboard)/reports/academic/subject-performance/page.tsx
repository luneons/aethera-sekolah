'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { ReportLayout } from '@/components/reports/ReportLayout';
import { fetchSubjectPerformance } from '@/lib/reportsApi';
import { cn } from '@/lib/utils';

export default function SubjectPerformancePage() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['rpt-subject-performance'],
    queryFn: () => fetchSubjectPerformance(),
  });

  return (
    <ReportLayout
      title="Performa per Mata Pelajaran"
      description="Rerata nilai, range, dan jumlah ujian per mapel"
      category="Akademik"
      icon={BookOpen}
    >
      {isLoading && <div className="text-text-muted">Memuat...</div>}

      <div className="rounded-lg bg-surface-raised border border-surface-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Kode</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Mata Pelajaran</th>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">Σ Nilai</th>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">Min</th>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">Rerata</th>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">Max</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Distribusi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const range = r.max_score - r.min_score;
              const avgPos = r.max_score > 0 ? ((r.avg_score - r.min_score) / range) * 100 : 50;
              return (
                <tr key={r.subject_id} className="border-t border-surface-border">
                  <td className="px-3 py-2 font-mono text-xs">{r.subject_code}</td>
                  <td className="px-3 py-2 font-medium">{r.subject_name}</td>
                  <td className="px-3 py-2 text-center font-mono">{r.graded_count}</td>
                  <td className="px-3 py-2 text-center font-mono text-rose-300">
                    {r.min_score != null ? Number(r.min_score).toFixed(1) : '-'}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2 text-center font-mono font-bold',
                      (r.avg_score ?? 0) >= 80
                        ? 'text-emerald-300'
                        : (r.avg_score ?? 0) >= 70
                        ? 'text-amber-300'
                        : 'text-rose-300'
                    )}
                  >
                    {r.avg_score != null ? Number(r.avg_score).toFixed(1) : '-'}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-emerald-300">
                    {r.max_score != null ? Number(r.max_score).toFixed(1) : '-'}
                  </td>
                  <td className="px-3 py-2 min-w-[160px]">
                    <div className="relative h-2 bg-surface-base rounded-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500"
                        style={{ left: '0%', right: '0%', opacity: 0.3 }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-text-primary"
                        style={{ left: `${Math.max(0, Math.min(100, avgPos))}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-2xs font-mono text-text-muted mt-0.5">
                      <span>{r.min_score != null ? Number(r.min_score).toFixed(0) : '-'}</span>
                      <span>{r.max_score != null ? Number(r.max_score).toFixed(0) : '-'}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
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
