'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  Receipt,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchBills,
  fetchMidtransConfig,
  payBillOnline,
  checkPaymentStatus,
} from '@/lib/billingApi';
import { loadSnapScript, openSnapPayment } from '@/lib/midtransSnap';
import { getErrorMessage } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';

function formatRp(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID');
}

export default function MyBillsPage() {
  const qc = useQueryClient();
  const [payingId, setPayingId] = useState<number | null>(null);

  const { data: billsData } = useQuery({
    queryKey: ['my-bills'],
    queryFn: () => fetchBills({ per_page: 100 }),
  });

  const { data: midtransCfg } = useQuery({
    queryKey: ['midtrans-config'],
    queryFn: fetchMidtransConfig,
    staleTime: 5 * 60 * 1000,
  });

  const bills = billsData?.items ?? [];
  const unpaid = bills.filter((b) => b.status === 'unpaid');
  const total = unpaid.reduce((s, b) => s + b.remaining, 0);
  const overdue = unpaid.filter((b) => b.due_date && new Date(b.due_date) < new Date());

  const onlineEnabled = midtransCfg?.enabled ?? false;

  const handlePayOnline = async (billId: number) => {
    if (!midtransCfg?.enabled) {
      toast.error('Pembayaran online belum aktif. Hubungi TU sekolah.');
      return;
    }
    setPayingId(billId);
    try {
      // 1. Minta token dari backend
      const result = await payBillOnline(billId);
      // 2. Load snap.js
      await loadSnapScript(result.client_key, result.is_production);
      // 3. Buka popup
      openSnapPayment(result.token, {
        onSuccess: async () => {
          toast.success('Pembayaran berhasil!');
          await syncStatus(billId);
        },
        onPending: async () => {
          toast.message('Menunggu pembayaran. Status akan otomatis terupdate.');
          await syncStatus(billId);
        },
        onError: () => {
          toast.error('Pembayaran gagal. Coba lagi.');
          setPayingId(null);
        },
        onClose: async () => {
          // User tutup popup tanpa bayar — cek status siapa tau sudah bayar
          await syncStatus(billId);
          setPayingId(null);
        },
      });
    } catch (e) {
      toast.error(getErrorMessage(e));
      setPayingId(null);
    }
  };

  const syncStatus = async (billId: number) => {
    try {
      const status = await checkPaymentStatus(billId);
      if (status.status === 'paid') {
        toast.success('Tagihan lunas!');
      }
    } catch {
      /* ignore */
    } finally {
      qc.invalidateQueries({ queryKey: ['my-bills'] });
      setPayingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Wallet className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Keuangan
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Tagihan Saya</h1>
        <p className="font-body text-text-muted mt-1">
          {onlineEnabled
            ? 'Bayar SPP langsung dari sini lewat transfer, QRIS, atau e-wallet.'
            : 'Daftar SPP dan tagihan lainnya. Hubungi TU sekolah untuk pembayaran.'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex items-center gap-1.5 text-amber-300">
            <Clock className="w-4 h-4" />
            <span className="font-mono text-2xs uppercase tracking-widest">Total Outstanding</span>
          </div>
          <p className="font-display font-bold text-2xl text-amber-300 mt-1 break-words">
            {formatRp(total)}
          </p>
        </div>
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/5 p-4">
          <div className="flex items-center gap-1.5 text-rose-400">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-mono text-2xs uppercase tracking-widest">Lewat Tempo</span>
          </div>
          <p className="font-display font-bold text-2xl text-rose-400 mt-1">
            {overdue.length} tagihan
          </p>
        </div>
        <div className="rounded-xl border border-success/40 bg-success/5 p-4">
          <div className="flex items-center gap-1.5 text-success">
            <CheckCircle2 className="w-4 h-4" />
            <span className="font-mono text-2xs uppercase tracking-widest">Sudah Lunas</span>
          </div>
          <p className="font-display font-bold text-2xl text-success mt-1">
            {bills.filter((b) => b.status === 'paid').length}
          </p>
        </div>
      </div>

      {bills.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border p-10 text-center">
          <Receipt className="w-10 h-10 text-text-muted mx-auto mb-2 opacity-50" />
          <p className="font-display font-semibold">Tidak ada tagihan</p>
        </div>
      ) : (
        <div className="space-y-2">
          {bills.map((b) => {
            const isOverdue = b.status === 'unpaid' && b.due_date && new Date(b.due_date) < new Date();
            const canPay = b.status === 'unpaid' && b.remaining > 0 && onlineEnabled;
            return (
              <div key={b.id} className={cn(
                'rounded-xl border p-3 sm:p-4',
                b.status === 'paid' && 'border-success/30 bg-success/5',
                b.status === 'unpaid' && !isOverdue && 'border-amber-500/30 bg-amber-500/5',
                isOverdue && 'border-rose-500/40 bg-rose-500/5',
                b.status === 'waived' && 'border-surface-border bg-surface-muted opacity-60'
              )}>
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold">{b.category_name}</p>
                    <p className="font-mono text-2xs text-text-muted">Periode {b.period}</p>
                    <div className="flex items-baseline gap-2 mt-2 flex-wrap">
                      <span className="font-display font-bold text-xl text-text-primary">
                        {formatRp(b.amount)}
                      </span>
                      {b.paid_amount > 0 && (
                        <>
                          <span className="text-text-muted text-xs">dibayar</span>
                          <span className="text-success font-bold">{formatRp(b.paid_amount)}</span>
                        </>
                      )}
                      {b.remaining > 0 && b.status !== 'waived' && (
                        <>
                          <span className="text-text-muted text-xs">sisa</span>
                          <span className={cn('font-bold', isOverdue ? 'text-rose-400' : 'text-amber-400')}>
                            {formatRp(b.remaining)}
                          </span>
                        </>
                      )}
                    </div>
                    {b.due_date && (
                      <p className={cn('text-2xs mt-1', isOverdue ? 'text-rose-400' : 'text-text-muted')}>
                        {isOverdue && '⚠ '}Jatuh tempo: {formatDate(b.due_date)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={cn(
                      'inline-flex items-center gap-1 font-mono text-2xs uppercase tracking-wider font-bold px-2 py-1 rounded-full border',
                      b.status === 'paid' && 'bg-success/15 text-success border-success/40',
                      b.status === 'unpaid' && 'bg-amber-500/15 text-amber-300 border-amber-500/40',
                      b.status === 'waived' && 'bg-text-muted/10 text-text-muted border-surface-border'
                    )}>
                      {b.status === 'paid' && 'Lunas'}
                      {b.status === 'unpaid' && (isOverdue ? 'Lewat Tempo' : 'Belum Lunas')}
                      {b.status === 'waived' && 'Dibebaskan'}
                    </span>
                    {canPay && (
                      <button
                        onClick={() => handlePayOnline(b.id)}
                        disabled={payingId === b.id}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold shadow-glow-primary transition-all disabled:opacity-60"
                      >
                        {payingId === b.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Memproses...
                          </>
                        ) : (
                          <>
                            <CreditCard className="w-4 h-4" />
                            Bayar Online
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {onlineEnabled && (
        <p className="text-2xs text-text-muted text-center">
          Pembayaran diproses aman oleh Midtrans. Mendukung transfer bank (VA), QRIS, GoPay, ShopeePay, dan kartu kredit.
        </p>
      )}
    </div>
  );
}
