'use client';

import { useQuery } from '@tanstack/react-query';
import { Boxes } from 'lucide-react';
import { ReportLayout } from '@/components/reports/ReportLayout';
import { fetchInventorySummary } from '@/lib/reportsApi';
import { cn } from '@/lib/utils';

const COND_LABEL: Record<string, { label: string; color: string }> = {
  baik: { label: 'Baik', color: 'text-emerald-300' },
  rusak_ringan: { label: 'Rusak Ringan', color: 'text-amber-300' },
  rusak_berat: { label: 'Rusak Berat', color: 'text-rose-300' },
  hilang: { label: 'Hilang', color: 'text-text-muted' },
  dijual: { label: 'Dijual', color: 'text-violet-300' },
};

function rp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID');
}

export default function InventoryReportPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['rpt-inventory-summary'],
    queryFn: fetchInventorySummary,
  });

  return (
    <ReportLayout
      title="Ringkasan Inventaris"
      description="Kondisi aset, distribusi kategori & lokasi, total nilai"
      category="Operasional"
      icon={Boxes}
    >
      {isLoading && <div className="text-text-muted">Memuat...</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="rounded-lg bg-surface-raised border border-surface-border p-3">
              <div className="text-2xs uppercase font-mono text-text-muted">Total Aset</div>
              <div className="font-display font-bold text-2xl mt-1">{data.total_items}</div>
            </div>
            <div className="rounded-lg bg-surface-raised border border-surface-border p-3">
              <div className="text-2xs uppercase font-mono text-text-muted">Total Unit</div>
              <div className="font-display font-bold text-2xl mt-1">{data.total_quantity}</div>
            </div>
            <div className="rounded-lg bg-surface-raised border border-surface-border p-3">
              <div className="text-2xs uppercase font-mono text-text-muted">Nilai Aset</div>
              <div className="font-display font-bold text-base mt-1 text-emerald-300">
                {rp(data.total_value)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-lg bg-surface-raised border border-surface-border p-4">
              <h3 className="font-display font-bold mb-3">Per Kondisi</h3>
              <div className="space-y-2">
                {Object.entries(data.by_condition).map(([cond, info]) => {
                  const meta = COND_LABEL[cond] || { label: cond, color: 'text-text-secondary' };
                  return (
                    <div key={cond} className="flex justify-between text-sm">
                      <span className={meta.color}>{meta.label}</span>
                      <div className="text-right">
                        <span className="font-mono">{info.qty}</span>
                        <span className="text-2xs text-text-muted block">{rp(info.value)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg bg-surface-raised border border-surface-border p-4">
              <h3 className="font-display font-bold mb-3">Per Kategori</h3>
              <div className="space-y-1.5">
                {data.by_category.map((c) => {
                  const max = data.by_category[0]?.qty || 1;
                  return (
                    <div key={c.category}>
                      <div className="flex justify-between text-sm mb-0.5">
                        <span>{c.category}</span>
                        <span className="font-mono text-text-muted">{c.qty}</span>
                      </div>
                      <div className="h-1 bg-surface-base rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-400"
                          style={{ width: `${(c.qty / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg bg-surface-raised border border-surface-border p-4">
              <h3 className="font-display font-bold mb-3">Per Lokasi (Top 10)</h3>
              <div className="space-y-1.5">
                {data.by_location.map((l) => (
                  <div key={l.location} className="flex justify-between text-sm">
                    <span className="truncate">{l.location}</span>
                    <span className="font-mono text-text-muted">{l.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </ReportLayout>
  );
}
