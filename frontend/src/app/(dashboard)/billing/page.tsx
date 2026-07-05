'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Loader2,
  Plus,
  Receipt,
  Tag,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import api, { type Envelope, getErrorMessage } from '@/lib/api';
import {
  bulkGenerateBills,
  createBillCategory,
  createPayment,
  fetchBillCategories,
  fetchBills,
  fetchBillingStats,
  waiveBill,
  type Bill,
  type BillCategory,
} from '@/lib/billingApi';
import { cn, formatDate } from '@/lib/utils';

interface SchoolClass { id: number; name: string }

const STATUS_CONFIG: Record<string, { label: string; tone: string }> = {
  unpaid: { label: 'Belum Lunas', tone: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  paid: { label: 'Lunas', tone: 'bg-success/15 text-success border-success/40' },
  waived: { label: 'Dibebaskan', tone: 'bg-text-muted/10 text-text-muted border-surface-border' },
};

function formatRp(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID');
}

export default function BillingPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'list' | 'categories'>('list');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid'>('unpaid');
  const [period, setPeriod] = useState<string>('');
  const [openCat, setOpenCat] = useState(false);
  const [openBulk, setOpenBulk] = useState(false);
  const [openPay, setOpenPay] = useState<Bill | null>(null);

  const { data: stats } = useQuery({
    queryKey: ['billing-stats', period],
    queryFn: () => fetchBillingStats(period || undefined),
    refetchInterval: 60_000,
  });

  const { data: cats = [] } = useQuery({
    queryKey: ['billing-cats'],
    queryFn: fetchBillCategories,
  });

  const { data: classes = [] } = useQuery<SchoolClass[]>({
    queryKey: ['school-classes-list'],
    queryFn: async () => {
      const r = await api.get<Envelope<SchoolClass[]>>('/school-classes');
      return r.data.data ?? [];
    },
  });

  const { data: billsData, isLoading } = useQuery({
    queryKey: ['bills', statusFilter, period],
    queryFn: () =>
      fetchBills({
        status: statusFilter === 'all' ? undefined : statusFilter,
        period: period || undefined,
        per_page: 200,
      }),
    refetchInterval: 30_000,
  });

  const bills = billsData?.items ?? [];

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <CreditCard className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Keuangan
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">SPP & Tagihan</h1>
        <p className="font-body text-text-muted mt-1">
          Kelola tagihan SPP, uang gedung, dan pembayaran. Data otomatis muncul di portal ortu.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Tagihan" value={formatRp(stats.total_amount)} sub={`${stats.total_bills} tagihan`} icon={<Receipt className="w-4 h-4" />} tone="text-text-secondary" />
          <StatCard label="Sudah Dibayar" value={formatRp(stats.total_paid)} sub={`${stats.collection_rate}% kolek`} icon={<CheckCircle2 className="w-4 h-4" />} tone="text-success" />
          <StatCard label="Outstanding" value={formatRp(stats.outstanding)} sub={`${stats.unpaid_bills} belum lunas`} icon={<Clock className="w-4 h-4" />} tone="text-amber-400" />
          <StatCard label="Lewat Tempo" value={String(stats.overdue_bills)} sub="prioritaskan" icon={<AlertTriangle className="w-4 h-4" />} tone="text-rose-400" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-surface-border">
        <button
          onClick={() => setTab('list')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === 'list' ? 'border-primary-500 text-primary-300' : 'border-transparent text-text-muted hover:text-text-primary'
          )}
        >
          Daftar Tagihan
        </button>
        <button
          onClick={() => setTab('categories')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === 'categories' ? 'border-primary-500 text-primary-300' : 'border-transparent text-text-muted hover:text-text-primary'
          )}
        >
          Kategori ({cats.length})
        </button>

        <div className="ml-auto flex gap-2">
          {tab === 'list' && (
            <button
              onClick={() => setOpenBulk(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              Generate Tagihan Massal
            </button>
          )}
          {tab === 'categories' && (
            <button
              onClick={() => setOpenCat(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Kategori
            </button>
          )}
        </div>
      </div>

      {tab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {cats.length === 0 ? (
            <p className="text-text-muted text-sm">Belum ada kategori. Tambahkan SPP, Uang Gedung, dll.</p>
          ) : (
            cats.map((c) => (
              <div key={c.id} className="rounded-xl border border-surface-border bg-surface-muted p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="w-4 h-4 text-primary-400" />
                  <span className="font-mono text-2xs uppercase tracking-widest text-text-muted">{c.code}</span>
                </div>
                <p className="font-display font-semibold">{c.name}</p>
                <p className="font-display text-xl font-bold text-primary-300 mt-1">
                  {formatRp(c.default_amount)}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  Recurring: {c.recurring}
                </p>
                {c.description && (
                  <p className="text-xs text-text-secondary mt-2">{c.description}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'list' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Filter periode (mis. 2026-05)"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-surface-border bg-surface-muted text-sm w-40"
            />
            <div className="inline-flex rounded-lg border border-surface-border overflow-hidden">
              {(['all', 'unpaid', 'paid'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setStatusFilter(k)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium transition-colors border-r border-surface-border last:border-r-0',
                    statusFilter === k
                      ? 'bg-primary-500/15 text-primary-300'
                      : 'text-text-muted hover:bg-surface-raised'
                  )}
                >
                  {k === 'all' ? 'Semua' : STATUS_CONFIG[k].label}
                </button>
              ))}
            </div>
            <span className="ml-auto text-2xs text-text-muted">{bills.length} tagihan</span>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary-400" />
            </div>
          ) : bills.length === 0 ? (
            <div className="rounded-xl border border-dashed border-surface-border p-10 text-center">
              <Receipt className="w-10 h-10 text-text-muted mx-auto mb-2 opacity-50" />
              <p className="font-display font-semibold">Belum ada tagihan</p>
              <p className="text-sm text-text-muted mt-1">Klik "Generate Tagihan Massal" untuk mulai.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {bills.map((b) => {
                const cfg = STATUS_CONFIG[b.status];
                return (
                  <div key={b.id} className="rounded-xl border border-surface-border bg-surface-muted p-3 sm:p-4">
                    <div className="flex items-start gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-display font-semibold">{b.student_name}</p>
                          <span className={cn(
                            'inline-flex items-center gap-1 font-mono text-2xs uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border',
                            cfg.tone
                          )}>
                            {cfg.label}
                          </span>
                        </div>
                        <p className="font-mono text-2xs text-text-muted">
                          {b.student_class ?? '—'} · {b.category_name} · Periode {b.period}
                        </p>
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
                              <span className="text-amber-400 font-bold">{formatRp(b.remaining)}</span>
                            </>
                          )}
                        </div>
                        {b.due_date && (
                          <p className="text-2xs text-text-muted mt-1">
                            Jatuh tempo: {formatDate(b.due_date)}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {b.status === 'unpaid' && (
                          <button
                            onClick={() => setOpenPay(b)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-success/15 hover:bg-success/25 text-success border border-success/40 text-xs font-semibold"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            Catat Bayar
                          </button>
                        )}
                        {b.status === 'unpaid' && (
                          <button
                            onClick={() => {
                              if (confirm(`Bebaskan tagihan ${b.student_name}? Tidak akan ditagihkan lagi.`)) {
                                waiveBill(b.id).then(() => {
                                  qc.invalidateQueries({ queryKey: ['bills'] });
                                  qc.invalidateQueries({ queryKey: ['billing-stats'] });
                                  toast.success('Tagihan dibebaskan');
                                });
                              }
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-surface-border text-text-muted text-xs hover:text-rose-400"
                          >
                            <X className="w-3.5 h-3.5" />
                            Bebaskan
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {openCat && <CategoryFormModal onClose={() => setOpenCat(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['billing-cats'] }); setOpenCat(false); }} />}
      {openBulk && <BulkGenerateModal cats={cats} classes={classes} onClose={() => setOpenBulk(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['bills'] }); qc.invalidateQueries({ queryKey: ['billing-stats'] }); setOpenBulk(false); }} />}
      {openPay && <PayModal bill={openPay} onClose={() => setOpenPay(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ['bills'] }); qc.invalidateQueries({ queryKey: ['billing-stats'] }); setOpenPay(null); }} />}
    </div>
  );
}

function StatCard({ label, value, sub, icon, tone }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; tone: string;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-muted p-3">
      <div className={cn('flex items-center gap-1.5', tone)}>
        {icon}
        <span className="font-mono text-2xs uppercase tracking-widest">{label}</span>
      </div>
      <p className={cn('font-display font-bold text-lg sm:text-xl mt-1 break-words', tone)}>{value}</p>
      {sub && <p className="text-2xs text-text-muted">{sub}</p>}
    </div>
  );
}

function CategoryFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(500000);
  const [recurring, setRecurring] = useState<'none' | 'monthly' | 'yearly'>('monthly');
  const [desc, setDesc] = useState('');

  const m = useMutation({
    mutationFn: () => createBillCategory({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      default_amount: amount,
      recurring,
      description: desc || undefined,
    }),
    onSuccess: () => {
      toast.success('Kategori dibuat');
      onSaved();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-surface-base/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-surface-border bg-surface-raised">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <p className="font-display font-bold">Tambah Kategori Tagihan</p>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-text-secondary">Kode (singkat)</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="SPP" className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm uppercase" maxLength={20} />
          </div>
          <div>
            <label className="text-xs text-text-secondary">Nama</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="SPP Bulanan" className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-secondary">Nominal Default</label>
              <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm" />
            </div>
            <div>
              <label className="text-xs text-text-secondary">Periode</label>
              <select value={recurring} onChange={(e) => setRecurring(e.target.value as any)} className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm">
                <option value="none">Sekali</option>
                <option value="monthly">Bulanan</option>
                <option value="yearly">Tahunan</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-text-secondary">Deskripsi (opsional)</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-3 py-2 text-sm text-text-muted">Batal</button>
          <button
            onClick={() => m.mutate()}
            disabled={!code.trim() || !name.trim() || amount <= 0 || m.isPending}
            className="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkGenerateModal({ cats, classes, onClose, onSaved }: {
  cats: BillCategory[]; classes: SchoolClass[];
  onClose: () => void; onSaved: () => void;
}) {
  const [catId, setCatId] = useState<number>(0);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [dueDate, setDueDate] = useState('');
  const [classIds, setClassIds] = useState<number[]>([]);
  const [notes, setNotes] = useState('');

  const cat = cats.find((c) => c.id === catId);

  const m = useMutation({
    mutationFn: () => bulkGenerateBills({
      category_id: catId,
      period,
      amount: amount || undefined,
      due_date: dueDate || undefined,
      target_class_ids: classIds.length > 0 ? classIds : undefined,
      notes: notes || undefined,
    }),
    onSuccess: (res) => {
      toast.success(res.message || 'Selesai');
      onSaved();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-surface-base/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-surface-border bg-surface-raised">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <p className="font-display font-bold">Generate Tagihan Massal</p>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-xs text-text-secondary">Kategori</label>
            <select value={catId} onChange={(e) => { setCatId(Number(e.target.value)); setAmount(undefined); }} className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm">
              <option value={0}>— Pilih —</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name} ({formatRp(c.default_amount)})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-secondary">Periode (YYYY-MM)</label>
              <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-05" className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm" />
            </div>
            <div>
              <label className="text-xs text-text-secondary">Override Nominal (opsional)</label>
              <input type="number" value={amount ?? ''} placeholder={cat ? String(cat.default_amount) : ''} onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : undefined)} className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-text-secondary">Jatuh Tempo (opsional)</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm" />
          </div>
          <div>
            <label className="text-xs text-text-secondary">Target Kelas (kosong = semua)</label>
            <div className="mt-1 max-h-40 overflow-y-auto border border-surface-border rounded-lg p-2 bg-surface-base">
              {classes.map((c) => {
                const checked = classIds.includes(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-2 text-sm py-0.5">
                    <input type="checkbox" checked={checked} onChange={(e) => {
                      if (e.target.checked) setClassIds([...classIds, c.id]);
                      else setClassIds(classIds.filter((x) => x !== c.id));
                    }} className="accent-primary-500" />
                    {c.name}
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs text-text-secondary">Catatan (opsional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-3 py-2 text-sm text-text-muted">Batal</button>
          <button
            onClick={() => m.mutate()}
            disabled={!catId || !period || m.isPending}
            className="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PayModal({ bill, onClose, onSaved }: { bill: Bill; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(bill.remaining);
  const [method, setMethod] = useState<'cash' | 'transfer' | 'qris' | 'manual'>('cash');
  const [ref, setRef] = useState('');
  const [notes, setNotes] = useState('');

  const m = useMutation({
    mutationFn: () => createPayment({
      bill_id: bill.id, amount, method,
      payment_ref: ref || undefined, notes: notes || undefined,
    }),
    onSuccess: () => { toast.success('Pembayaran tercatat'); onSaved(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-surface-base/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-surface-border bg-surface-raised">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <p className="font-display font-bold">Catat Pembayaran</p>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="rounded-lg bg-surface-muted p-3 text-sm">
            <p className="font-semibold">{bill.student_name}</p>
            <p className="text-text-muted text-xs">{bill.category_name} · {bill.period}</p>
            <p className="mt-1">Sisa: <span className="font-bold text-amber-400">{formatRp(bill.remaining)}</span></p>
          </div>
          <div>
            <label className="text-xs text-text-secondary">Nominal</label>
            <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} max={bill.remaining} className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm" />
          </div>
          <div>
            <label className="text-xs text-text-secondary">Metode</label>
            <select value={method} onChange={(e) => setMethod(e.target.value as any)} className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm">
              <option value="cash">Tunai</option>
              <option value="transfer">Transfer Bank</option>
              <option value="qris">QRIS</option>
              <option value="manual">Manual / Lainnya</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-text-secondary">No. Referensi (opsional)</label>
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="No. transfer / kuitansi" className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm" />
          </div>
          <div>
            <label className="text-xs text-text-secondary">Catatan (opsional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-3 py-2 text-sm text-text-muted">Batal</button>
          <button
            onClick={() => m.mutate()}
            disabled={amount <= 0 || amount > bill.remaining + 0.01 || m.isPending}
            className="px-4 py-2 rounded-lg bg-success text-white text-sm font-medium disabled:opacity-50"
          >
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Simpan ${formatRp(amount)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
