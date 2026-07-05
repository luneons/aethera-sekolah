'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import { ReportLayout } from '@/components/reports/ReportLayout';
import { fetchBillingSummary } from '@/lib/reportsApi';
import { cn } from '@/lib/utils';

function rp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID');
}

export default function BillingReportPage() {
  const [period, setPeriod] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['rpt-billing-summary', period],
    queryFn: () => fetchBillingSummary(period || undefined),
  });

  return (
    <ReportLayout
      title="Ringkasan Tagihan & Koleksi"
      description="Outstanding, collection rate, dan breakdown per kategori"
      category="Keuangan"
      icon={CreditCard}
    >
      <div>
        <label className="text-xs text-text-muted">Filter Periode (kosong = semua)</label>
        <input
          type="text"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="Misal: 2026-05 atau 2025-2026"
          className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm w-64"
        />
      </div>

      {isLoading && <div className="text-text-muted">Memuat...</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBox
              label="Total Tagihan"
              value={rp(data.total_amount)}
              sub={`${data.total_bills} tagihan`}
            />
            <StatBox
              label="Sudah Dibayar"
              value={rp(data.total_paid)}
              sub={`${data.collection_rate}% kolek`}
              tone="text-emerald-300"
            />
            <StatBox
              label="Outstanding"
              value={rp(data.outstanding)}
              sub={`${data.unpaid_bills} belum lunas`}
              tone="text-amber-300"
            />
            <StatBox
              label="Lewat Tempo"
              value={data.overdue_bills.toString()}
              sub="prioritas"
              tone="text-rose-300"
            />
          </div>

          <div className="rounded-lg bg-surface-raised border border-surface-border p-4">
            <h3 className="font-display font-bold mb-3">Per Kategori</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-xs">
                  <th className="text-left pb-2">Kategori</th>
                  <th className="text-right pb-2">Σ Tagihan</th>
                  <th className="text-right pb-2">Total</th>
                  <th className="text-right pb-2">Dibayar</th>
                  <th className="text-right pb-2">Outstanding</th>
                  <th className="text-right pb-2">% Kolek</th>
                </tr>
              </thead>
              <tbody>
                {data.by_category.map((c) => {
                  const rate = c.amount > 0 ? (c.paid / c.amount) * 100 : 0;
                  return (
                    <tr key={c.category_id} className="border-t border-surface-border">
                      <td className="py-2 font-medium">{c.category_name}</td>
                      <td className="py-2 text-right font-mono">{c.count}</td>
                      <td className="py-2 text-right font-mono">{rp(c.amount)}</td>
                      <td className="py-2 text-right font-mono text-emerald-300">{rp(c.paid)}</td>
                      <td className="py-2 text-right font-mono text-amber-300">{rp(c.outstanding)}</td>
                      <td
                        className={cn(
                          'py-2 text-right font-mono font-bold',
                          rate >= 80
                            ? 'text-emerald-300'
                            : rate >= 50
                            ? 'text-amber-300'
                            : 'text-rose-300'
                        )}
                      >
                        {rate.toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
                {data.by_category.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-text-muted">
                      Belum ada tagihan
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ReportLayout>
  );
}

function StatBox({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg bg-surface-raised border border-surface-border p-3">
      <div className="text-2xs uppercase tracking-widest text-text-muted font-mono">{label}</div>
      <div className={cn('font-display font-bold text-base mt-1', tone)}>{value}</div>
      {sub && <div className="text-2xs text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
