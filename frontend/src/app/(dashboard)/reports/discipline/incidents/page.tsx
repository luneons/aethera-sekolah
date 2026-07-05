'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { ReportLayout } from '@/components/reports/ReportLayout';
import { fetchIncidentStats } from '@/lib/reportsApi';
import { cn } from '@/lib/utils';

const SEVERITY_COLOR: Record<string, string> = {
  ringan: 'bg-blue-500/15 text-blue-300',
  sedang: 'bg-amber-500/15 text-amber-300',
  berat: 'bg-rose-500/15 text-rose-300',
};

export default function IncidentReportPage() {
  const [days, setDays] = useState(90);
  const { data, isLoading } = useQuery({
    queryKey: ['rpt-incident-stats', days],
    queryFn: () => fetchIncidentStats(days),
  });

  return (
    <ReportLayout
      title="Statistik Insiden Kedisiplinan"
      description="Distribusi pelanggaran, repeat offender, dan tipe insiden"
      category="Disiplin"
      icon={ShieldAlert}
    >
      <div className="flex gap-2 items-center">
        <span className="text-sm text-text-muted">Periode:</span>
        {[30, 60, 90, 180].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={cn(
              'px-3 py-1 text-xs rounded font-mono',
              days === d
                ? 'bg-primary-500 text-text-inverse'
                : 'bg-surface-muted text-text-muted'
            )}
          >
            {d}H
          </button>
        ))}
      </div>

      {isLoading && <div className="text-text-muted">Memuat...</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg bg-surface-raised border border-surface-border p-4">
              <div className="text-2xs uppercase font-mono text-text-muted">
                Total Insiden
              </div>
              <div className="font-display font-bold text-3xl mt-1">
                {data.total_incidents}
              </div>
              <div className="text-2xs text-text-muted mt-1">{data.period_days} hari terakhir</div>
            </div>
            {data.by_severity.map((s) => (
              <div
                key={s.severity}
                className="rounded-lg bg-surface-raised border border-surface-border p-4"
              >
                <div className="text-2xs uppercase font-mono text-text-muted">
                  Severity {s.severity}
                </div>
                <div
                  className={cn(
                    'font-display font-bold text-3xl mt-1',
                    s.severity === 'berat'
                      ? 'text-rose-300'
                      : s.severity === 'sedang'
                      ? 'text-amber-300'
                      : 'text-blue-300'
                  )}
                >
                  {s.count}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg bg-surface-raised border border-surface-border p-4">
              <h3 className="font-display font-bold mb-3">Top 10 Jenis Pelanggaran</h3>
              <div className="space-y-2">
                {data.by_type.map((t) => {
                  const max = data.by_type[0]?.count || 1;
                  const pct = (t.count / max) * 100;
                  return (
                    <div key={t.type}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{t.type}</span>
                        <span className="font-mono text-text-muted">{t.count}</span>
                      </div>
                      <div className="h-2 bg-surface-base rounded-full overflow-hidden">
                        <div
                          className="h-full bg-rose-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {data.by_type.length === 0 && (
                  <p className="text-text-muted text-sm">Tidak ada insiden</p>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-surface-raised border border-surface-border p-4">
              <h3 className="font-display font-bold mb-3">Repeat Offender (Top 10)</h3>
              {data.recidivists.length === 0 ? (
                <p className="text-text-muted text-sm">Tidak ada</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-text-muted text-xs">
                      <th className="text-left pb-2">#</th>
                      <th className="text-left pb-2">Siswa</th>
                      <th className="text-left pb-2">Kelas</th>
                      <th className="text-right pb-2">Insiden</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recidivists.map((r, i) => (
                      <tr key={r.student_id} className="border-t border-surface-border">
                        <td className="py-2 font-mono">{i + 1}</td>
                        <td className="py-2">
                          <div className="font-medium">{r.full_name}</div>
                          <div className="text-2xs text-text-muted font-mono">
                            {r.employee_id}
                          </div>
                        </td>
                        <td className="py-2 text-xs text-text-muted">{r.class_name || '-'}</td>
                        <td className="py-2 text-right font-mono font-bold text-rose-300">
                          {r.incident_count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </ReportLayout>
  );
}
