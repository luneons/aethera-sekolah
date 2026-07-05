'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { ReportLayout } from '@/components/reports/ReportLayout';
import { fetchPpdbStats } from '@/lib/reportsApi';
import { cn, formatDate } from '@/lib/utils';

const STATUS_COLOR: Record<string, string> = {
  submitted: 'bg-blue-500/15 text-blue-300',
  reviewing: 'bg-amber-500/15 text-amber-300',
  accepted: 'bg-emerald-500/15 text-emerald-300',
  rejected: 'bg-rose-500/15 text-rose-300',
  enrolled: 'bg-violet-500/15 text-violet-300',
  cancelled: 'bg-text-muted/15 text-text-muted',
};

function rp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID');
}

export default function PpdbReportPage() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['rpt-ppdb-stats'],
    queryFn: fetchPpdbStats,
  });

  return (
    <ReportLayout
      title="Statistik PPDB"
      description="Per gelombang: pendaftaran, conversion rate, dan total registration fee"
      category="PPDB"
      icon={ClipboardList}
    >
      {isLoading && <div className="text-text-muted">Memuat...</div>}

      <div className="space-y-3">
        {rows.map((p) => (
          <div
            key={p.period_id}
            className={cn(
              'rounded-lg border p-4',
              p.is_active
                ? 'bg-emerald-500/5 border-emerald-500/30'
                : 'bg-surface-raised border-surface-border'
            )}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="font-mono text-2xs text-text-muted uppercase">
                  {p.school_year}
                </div>
                <h3 className="font-display font-bold text-lg">{p.period_name}</h3>
                <div className="text-xs text-text-muted mt-1">
                  {formatDate(p.start_at)} → {formatDate(p.end_at)}
                </div>
              </div>
              {p.is_active && (
                <span className="font-mono text-2xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                  AKTIF
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <Stat label="Total Pendaftar" value={p.total_applications} />
              <Stat
                label="Conversion Rate"
                value={`${p.conversion_rate}%`}
                tone={
                  p.conversion_rate >= 70
                    ? 'text-emerald-300'
                    : p.conversion_rate >= 40
                    ? 'text-amber-300'
                    : 'text-rose-300'
                }
              />
              <Stat
                label="Kuota"
                value={p.quota ? `${p.by_status.enrolled || 0}/${p.quota}` : 'Tak terbatas'}
              />
              <Stat
                label="Pendapatan Pendaftaran"
                value={rp(p.registration_fee_total)}
                tone="text-emerald-300"
                small
              />
            </div>

            {Object.keys(p.by_status).length > 0 && (
              <div className="mt-3 pt-3 border-t border-surface-border">
                <div className="text-xs text-text-muted mb-2">Distribusi Status</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(p.by_status).map(([status, count]) => (
                    <span
                      key={status}
                      className={cn(
                        'font-mono text-2xs px-2 py-1 rounded uppercase',
                        STATUS_COLOR[status] || 'bg-text-muted/15 text-text-muted'
                      )}
                    >
                      {status}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && !isLoading && (
          <div className="text-center text-text-muted py-8">
            Belum ada periode PPDB
          </div>
        )}
      </div>
    </ReportLayout>
  );
}

function Stat({
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
    <div className="rounded bg-surface-base/50 p-2">
      <div className="text-2xs uppercase font-mono text-text-muted">{label}</div>
      <div className={cn('font-display font-bold mt-0.5', small ? 'text-base' : 'text-xl', tone)}>
        {value}
      </div>
    </div>
  );
}
