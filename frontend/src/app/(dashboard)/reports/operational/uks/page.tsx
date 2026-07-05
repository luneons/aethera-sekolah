'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Stethoscope } from 'lucide-react';
import { ReportLayout } from '@/components/reports/ReportLayout';
import { fetchUksSummary } from '@/lib/reportsApi';
import { cn, formatDate } from '@/lib/utils';

const OUTCOME_LABEL: Record<string, string> = {
  kembali_kelas: 'Kembali ke Kelas',
  istirahat_uks: 'Istirahat di UKS',
  pulang: 'Dijemput / Pulang',
  rujuk_rs: 'Rujuk RS',
};

export default function UksReportPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ['rpt-uks-summary', days],
    queryFn: () => fetchUksSummary(days),
  });

  return (
    <ReportLayout
      title="Ringkasan UKS"
      description="Kunjungan klinik, distribusi outcome, dan kondisi stok obat"
      category="Operasional"
      icon={Stethoscope}
    >
      <div className="flex gap-2 items-center">
        <span className="text-sm text-text-muted">Periode:</span>
        {[7, 14, 30, 90].map((d) => (
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
              <div className="text-2xs uppercase font-mono text-text-muted">Total Kunjungan</div>
              <div className="font-display font-bold text-3xl mt-1">{data.total_visits}</div>
              <div className="text-2xs text-text-muted mt-1">{days} hari terakhir</div>
            </div>
            {Object.entries(data.by_outcome).map(([outcome, count]) => (
              <div
                key={outcome}
                className="rounded-lg bg-surface-raised border border-surface-border p-4"
              >
                <div className="text-2xs uppercase font-mono text-text-muted">
                  {OUTCOME_LABEL[outcome] || outcome}
                </div>
                <div className="font-display font-bold text-2xl mt-1">{count}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg bg-surface-raised border border-surface-border p-4">
              <h3 className="font-display font-bold mb-3">Per Kelas (Top 10)</h3>
              <div className="space-y-2">
                {data.by_class.map((c) => {
                  const max = data.by_class[0]?.count || 1;
                  return (
                    <div key={c.class_name}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{c.class_name}</span>
                        <span className="font-mono text-text-muted">{c.count}</span>
                      </div>
                      <div className="h-1.5 bg-surface-base rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-400"
                          style={{ width: `${(c.count / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {data.by_class.length === 0 && (
                  <p className="text-text-muted text-sm">Tidak ada kunjungan</p>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4">
              <h3 className="font-display font-bold mb-3">⚠ Stok Rendah & Expiring</h3>
              {data.low_stock_medicines.length > 0 && (
                <>
                  <h4 className="text-xs uppercase font-mono text-amber-300 mb-1">
                    Stok Menipis
                  </h4>
                  <ul className="text-sm space-y-1 mb-3">
                    {data.low_stock_medicines.map((m) => (
                      <li key={m.name} className="flex justify-between">
                        <span>{m.name}</span>
                        <span className="font-mono text-amber-300">
                          {m.stock}/{m.threshold}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {data.expiring_medicines.length > 0 && (
                <>
                  <h4 className="text-xs uppercase font-mono text-rose-300 mb-1">
                    Expiring (≤30 hari)
                  </h4>
                  <ul className="text-sm space-y-1">
                    {data.expiring_medicines.map((m) => (
                      <li key={m.name} className="flex justify-between">
                        <span>{m.name}</span>
                        <span className="font-mono text-rose-300">
                          {formatDate(m.expire_date)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {data.low_stock_medicines.length === 0 &&
                data.expiring_medicines.length === 0 && (
                  <p className="text-text-muted text-sm">Semua stok aman 👍</p>
                )}
            </div>
          </div>
        </>
      )}
    </ReportLayout>
  );
}
