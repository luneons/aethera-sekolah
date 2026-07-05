'use client';

import { useQuery } from '@tanstack/react-query';
import { Library } from 'lucide-react';
import { ReportLayout } from '@/components/reports/ReportLayout';
import { fetchLibrarySummary } from '@/lib/reportsApi';
import { cn } from '@/lib/utils';

export default function LibraryReportPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['rpt-library-summary'],
    queryFn: fetchLibrarySummary,
  });

  return (
    <ReportLayout
      title="Statistik Perpustakaan"
      description="Koleksi, peminjaman aktif, telat, dan top performers"
      category="Operasional"
      icon={Library}
    >
      {isLoading && <div className="text-text-muted">Memuat...</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total Judul" value={data.total_books} />
            <Stat label="Eksemplar" value={data.total_copies} />
            <Stat label="Aktif Dipinjam" value={data.active_loans} tone="text-blue-300" />
            <Stat label="Telat Kembali" value={data.overdue} tone="text-rose-300" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg bg-surface-raised border border-surface-border p-4">
              <h3 className="font-display font-bold mb-3">📚 Top Buku Paling Sering Dipinjam</h3>
              <div className="space-y-2">
                {data.top_books.map((b, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span
                      className={cn(
                        'font-mono font-bold w-6',
                        i < 3 && 'text-amber-300'
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate">{b.title}</span>
                    <span className="font-mono text-text-muted">
                      {b.loan_count}×
                    </span>
                  </div>
                ))}
                {data.top_books.length === 0 && (
                  <p className="text-text-muted text-sm">Belum ada peminjaman</p>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-surface-raised border border-surface-border p-4">
              <h3 className="font-display font-bold mb-3">📖 Top Pembaca</h3>
              <div className="space-y-2">
                {data.top_readers.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span
                      className={cn(
                        'font-mono font-bold w-6',
                        i < 3 && 'text-amber-300'
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate">{r.name}</span>
                    <span className="font-mono text-text-muted">
                      {r.loan_count} pinjam
                    </span>
                  </div>
                ))}
                {data.top_readers.length === 0 && (
                  <p className="text-text-muted text-sm">Belum ada peminjaman</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </ReportLayout>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg bg-surface-raised border border-surface-border p-3">
      <div className="text-2xs uppercase tracking-widest text-text-muted font-mono">{label}</div>
      <div className={cn('font-display font-bold text-2xl mt-1', tone)}>{value}</div>
    </div>
  );
}
