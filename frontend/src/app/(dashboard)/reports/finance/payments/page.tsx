'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Receipt } from 'lucide-react';
import { ReportLayout } from '@/components/reports/ReportLayout';
import { fetchPaymentHistory, paymentsCsvUrl } from '@/lib/reportsApi';
import { useAuthStore } from '@/stores/useAuthStore';
import { formatDate } from '@/lib/utils';

function rp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID');
}

export default function PaymentsReportPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['rpt-payment-history', from, to],
    queryFn: () => fetchPaymentHistory({ from_date: from, to_date: to, limit: 500 }),
  });

  const total = rows.reduce((s, r) => s + r.amount, 0);

  const downloadCsv = async () => {
    const url = paymentsCsvUrl(from, to);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `payments_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <ReportLayout
      title="Riwayat Pembayaran"
      description="Log lengkap semua transaksi pembayaran tagihan"
      category="Keuangan"
      icon={Receipt}
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
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-text-muted mb-1">Dari</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Sampai</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="ml-auto rounded-lg bg-surface-raised border border-surface-border p-3">
          <div className="text-2xs uppercase font-mono text-text-muted">Total Periode</div>
          <div className="font-display font-bold text-emerald-300 text-lg">{rp(total)}</div>
        </div>
      </div>

      {isLoading && <div className="text-text-muted">Memuat...</div>}

      <div className="rounded-lg bg-surface-raised border border-surface-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Tanggal</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Siswa</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Periode</th>
              <th className="px-3 py-2 text-right font-mono text-2xs uppercase text-text-muted">Jumlah</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Metode</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Referensi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.payment_id} className="border-t border-surface-border">
                <td className="px-3 py-2 text-xs font-mono">{formatDate(r.paid_at)}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.student_name}</div>
                  <div className="text-2xs text-text-muted font-mono">{r.student_employee_id}</div>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.bill_period}</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-emerald-300">
                  {rp(r.amount)}
                </td>
                <td className="px-3 py-2 text-xs">{r.method || '-'}</td>
                <td className="px-3 py-2 text-xs font-mono text-text-muted">{r.reference || '-'}</td>
              </tr>
            ))}
            {rows.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-text-muted">
                  Tidak ada pembayaran di periode ini
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ReportLayout>
  );
}
