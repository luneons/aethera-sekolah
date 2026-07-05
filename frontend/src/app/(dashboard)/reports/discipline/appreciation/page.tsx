'use client';

import { useQuery } from '@tanstack/react-query';
import { Award, Heart } from 'lucide-react';
import { ReportLayout } from '@/components/reports/ReportLayout';
import { fetchAppreciationLeaderboard } from '@/lib/reportsApi';
import { cn } from '@/lib/utils';

export default function AppreciationLeaderboardPage() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['rpt-appreciation-leaderboard'],
    queryFn: () => fetchAppreciationLeaderboard(30),
  });

  return (
    <ReportLayout
      title="Leaderboard Apresiasi"
      description="Siswa dengan poin apresiasi tertinggi — dari prestasi & perilaku positif"
      category="Disiplin"
      icon={Heart}
    >
      {isLoading && <div className="text-text-muted">Memuat...</div>}

      <div className="rounded-lg bg-surface-raised border border-surface-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">#</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Siswa</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Kelas</th>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">Apresiasi</th>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">Sikap</th>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">GPA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.student_id} className="border-t border-surface-border">
                <td className="px-3 py-2 text-center">
                  {i < 3 ? (
                    <span
                      className={cn(
                        'inline-flex items-center justify-center w-6 h-6 rounded-full font-bold',
                        i === 0 && 'bg-amber-500/20 text-amber-300',
                        i === 1 && 'bg-text-muted/20 text-text-secondary',
                        i === 2 && 'bg-orange-500/20 text-orange-300'
                      )}
                    >
                      {i + 1}
                    </span>
                  ) : (
                    <span className="font-mono text-text-muted">{i + 1}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.full_name}</div>
                  <div className="text-2xs text-text-muted font-mono">{r.employee_id}</div>
                </td>
                <td className="px-3 py-2 text-text-muted text-xs">{r.class_name || '-'}</td>
                <td className="px-3 py-2 text-center">
                  <span className="inline-flex items-center gap-1 font-mono font-bold text-amber-300">
                    <Award className="w-4 h-4" />
                    +{r.appreciation_points}
                  </span>
                </td>
                <td className="px-3 py-2 text-center font-mono">{r.attitude_points}/100</td>
                <td className="px-3 py-2 text-center font-mono">{r.gpa != null ? Number(r.gpa).toFixed(1) : '-'}</td>
              </tr>
            ))}
            {rows.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-text-muted">
                  Belum ada apresiasi tercatat
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ReportLayout>
  );
}
