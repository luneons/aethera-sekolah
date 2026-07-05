'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { ReportLayout } from '@/components/reports/ReportLayout';
import { fetchAuditActivity } from '@/lib/reportsApi';
import { cn } from '@/lib/utils';

export default function AuditActivityReportPage() {
  const [days, setDays] = useState(7);
  const { data, isLoading } = useQuery({
    queryKey: ['rpt-audit-activity', days],
    queryFn: () => fetchAuditActivity(days),
  });

  return (
    <ReportLayout
      title="Aktivitas Sistem"
      description="Tren login harian dan user paling aktif"
      category="Sistem"
      icon={Shield}
    >
      <div className="flex gap-2 items-center">
        <span className="text-sm text-text-muted">Periode:</span>
        {[7, 14, 30, 60].map((d) => (
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg bg-surface-raised border border-surface-border p-4">
            <h3 className="font-display font-bold mb-3">Aktivitas Harian</h3>
            <div className="space-y-1.5">
              {data.daily.map((d) => {
                const max = Math.max(...data.daily.map((x) => x.count), 1);
                return (
                  <div key={d.date}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="font-mono">{d.date}</span>
                      <span className="font-mono text-text-muted">{d.count}</span>
                    </div>
                    <div className="h-1.5 bg-surface-base rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-400"
                        style={{ width: `${(d.count / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {data.daily.length === 0 && (
                <p className="text-text-muted text-sm">Tidak ada aktivitas</p>
              )}
            </div>
          </div>

          <div className="rounded-lg bg-surface-raised border border-surface-border p-4">
            <h3 className="font-display font-bold mb-3">User Paling Aktif</h3>
            <div className="space-y-2">
              {data.active_users.map((u, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span
                    className={cn(
                      'font-mono font-bold w-6',
                      i < 3 && 'text-amber-300'
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate">{u.name}</span>
                  <span className="font-mono text-text-muted">
                    {u.login_count}× login
                  </span>
                </div>
              ))}
              {data.active_users.length === 0 && (
                <p className="text-text-muted text-sm">Tidak ada login</p>
              )}
            </div>
          </div>
        </div>
      )}
    </ReportLayout>
  );
}
