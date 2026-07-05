'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, Trophy } from 'lucide-react';
import { ReportLayout } from '@/components/reports/ReportLayout';
import { fetchTopStudents } from '@/lib/reportsApi';
import { cn } from '@/lib/utils';

export default function TopStudentsPage() {
  const [bottom, setBottom] = useState(false);
  const [limit, setLimit] = useState(20);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['rpt-top-students', bottom, limit],
    queryFn: () => fetchTopStudents(limit, bottom),
  });

  return (
    <ReportLayout
      title="Ranking Siswa"
      description="Top performer & yang butuh perhatian khusus berdasarkan GPA"
      category="Akademik"
      icon={Trophy}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setBottom(false)}
          className={cn(
            'px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1',
            !bottom
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
              : 'bg-surface-muted text-text-muted'
          )}
        >
          <ArrowUpCircle className="w-4 h-4" />
          Top Performers
        </button>
        <button
          onClick={() => setBottom(true)}
          className={cn(
            'px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1',
            bottom
              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/40'
              : 'bg-surface-muted text-text-muted'
          )}
        >
          <ArrowDownCircle className="w-4 h-4" />
          Butuh Perhatian
        </button>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="ml-auto bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm"
        >
          <option value={10}>Top 10</option>
          <option value={20}>Top 20</option>
          <option value={50}>Top 50</option>
        </select>
      </div>

      {isLoading && <div className="text-text-muted">Memuat...</div>}

      <div className="rounded-lg bg-surface-raised border border-surface-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">#</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Nama</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">NIS</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Kelas</th>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">GPA</th>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">Sikap</th>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">Apresiasi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.student_id} className="border-t border-surface-border">
                <td className="px-3 py-2 text-center">
                  <span
                    className={cn(
                      'font-display font-bold',
                      i < 3 && !bottom && 'text-amber-300',
                      i < 3 && bottom && 'text-rose-300'
                    )}
                  >
                    {i + 1}
                  </span>
                </td>
                <td className="px-3 py-2 font-medium">{r.full_name}</td>
                <td className="px-3 py-2 font-mono text-xs text-text-muted">{r.employee_id}</td>
                <td className="px-3 py-2 text-text-muted">{r.class_name || '-'}</td>
                <td
                  className={cn(
                    'px-3 py-2 text-center font-mono font-bold text-lg',
                    (r.gpa ?? 0) >= 80
                      ? 'text-emerald-300'
                      : (r.gpa ?? 0) >= 70
                      ? 'text-amber-300'
                      : 'text-rose-300'
                  )}
                >
                  {r.gpa != null ? Number(r.gpa).toFixed(1) : '-'}
                </td>
                <td className="px-3 py-2 text-center font-mono">
                  {r.attitude_points}/100
                </td>
                <td className="px-3 py-2 text-center font-mono text-amber-300">
                  +{r.appreciation_points}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-text-muted">
                  Belum ada data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ReportLayout>
  );
}
