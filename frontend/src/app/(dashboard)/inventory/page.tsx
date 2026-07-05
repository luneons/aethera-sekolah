'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Boxes,
  CheckCircle2,
  Edit,
  History,
  Package,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import {
  auditItem,
  createItem,
  deleteItem,
  fetchInventory,
  fetchInventoryStats,
  fetchItemLogs,
  updateCondition,
  updateItem,
  type InventoryItem,
  type ItemInput,
} from '@/lib/inventoryApi';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn, formatDate } from '@/lib/utils';

const CONDITIONS = [
  { value: 'baik', label: 'Baik', color: 'bg-emerald-500/15 text-emerald-300' },
  { value: 'rusak_ringan', label: 'Rusak Ringan', color: 'bg-amber-500/15 text-amber-300' },
  { value: 'rusak_berat', label: 'Rusak Berat', color: 'bg-rose-500/15 text-rose-300' },
  { value: 'hilang', label: 'Hilang', color: 'bg-text-muted/15 text-text-muted' },
  { value: 'dijual', label: 'Dijual', color: 'bg-violet-500/15 text-violet-300' },
];

function rp(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID');
}

export default function InventoryPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.role === 'super_admin';
  const [q, setQ] = useState('');
  const [conditionFilter, setConditionFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [viewingLogs, setViewingLogs] = useState<InventoryItem | null>(null);

  const { data: stats } = useQuery({
    queryKey: ['inventory-stats'],
    queryFn: fetchInventoryStats,
    refetchInterval: 60_000,
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventory', q, conditionFilter],
    queryFn: () =>
      fetchInventory({
        q: q || undefined,
        condition: conditionFilter || undefined,
      }),
  });

  const removeMut = useMutation({
    mutationFn: deleteItem,
    onSuccess: () => {
      toast.success('Aset dihapus');
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-stats'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const auditMut = useMutation({
    mutationFn: auditItem,
    onSuccess: () => {
      toast.success('Aset di-audit');
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Boxes className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Inventaris
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Inventaris Sekolah</h1>
        <p className="font-body text-text-muted mt-1">
          Daftar aset, stocktake, log perubahan kondisi & lokasi.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Aset" value={stats.total_items} icon={<Package className="w-4 h-4" />} />
          <StatCard label="Total Unit" value={stats.total_quantity} />
          <StatCard label="Total Nilai" value={rp(stats.total_value)} small />
          <StatCard label="Aset Rusak" value={(stats.by_condition.rusak_ringan || 0) + (stats.by_condition.rusak_berat || 0)} tone="text-amber-300" />
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Cari kode / nama / lokasi..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-sm"
          />
        </div>
        <select
          value={conditionFilter}
          onChange={(e) => setConditionFilter(e.target.value)}
          className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Semua Kondisi</option>
          {CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-2 bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg text-sm font-medium flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> Aset Baru
        </button>
      </div>

      {isLoading && <div className="text-text-muted">Memuat...</div>}

      <div className="rounded-lg bg-surface-raised border border-surface-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Kode</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Nama</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Kategori</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Lokasi</th>
              <th className="px-3 py-2 text-center font-mono text-2xs uppercase text-text-muted">Qty</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Kondisi</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Audit</th>
              <th className="px-3 py-2 text-right font-mono text-2xs uppercase text-text-muted">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const cond = CONDITIONS.find((c) => c.value === i.condition);
              return (
                <tr key={i.id} className="border-t border-surface-border">
                  <td className="px-3 py-2 font-mono text-xs">{i.asset_code}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{i.name}</div>
                    {i.purchase_price && (
                      <div className="text-2xs text-text-muted">{rp(i.purchase_price)}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-text-muted text-xs">{i.category || '-'}</td>
                  <td className="px-3 py-2 text-text-muted text-xs">{i.location || '-'}</td>
                  <td className="px-3 py-2 text-center font-mono">{i.quantity}</td>
                  <td className="px-3 py-2">
                    <span className={cn('font-mono text-2xs px-2 py-0.5 rounded', cond?.color)}>
                      {cond?.label || i.condition}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-2xs text-text-muted">
                    {i.last_audit_at ? formatDate(i.last_audit_at) : '-'}
                  </td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <button
                      onClick={() => auditMut.mutate(i.id)}
                      title="Tandai sudah di-stocktake"
                      className="px-2 py-1 text-2xs bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 rounded"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setViewingLogs(i)}
                      className="px-2 py-1 text-2xs bg-surface-muted text-text-muted hover:text-text-primary rounded"
                    >
                      <History className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setEditing(i)}
                      className="px-2 py-1 text-2xs bg-surface-muted text-text-muted hover:text-text-primary rounded"
                    >
                      <Edit className="w-3 h-3" />
                    </button>
                    {isSuperAdmin && (
                      <button
                        onClick={() => {
                          if (confirm(`Hapus ${i.name}?`)) removeMut.mutate(i.id);
                        }}
                        className="px-2 py-1 text-2xs bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && !isLoading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-text-muted">
                  Belum ada aset
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && <ItemModal onClose={() => setCreating(false)} />}
      {editing && <ItemModal existing={editing} onClose={() => setEditing(null)} />}
      {viewingLogs && <LogsModal item={viewingLogs} onClose={() => setViewingLogs(null)} />}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
  small,
}: {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  tone?: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-lg bg-surface-raised border border-surface-border p-3">
      <div className="flex items-center gap-2">
        {icon}
        <div className="text-2xs uppercase tracking-widest text-text-muted font-mono">{label}</div>
      </div>
      <div className={cn('font-display font-bold mt-1', small ? 'text-base' : 'text-2xl', tone)}>
        {value}
      </div>
    </div>
  );
}

function ItemModal({
  existing,
  onClose,
}: {
  existing?: InventoryItem;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ItemInput>({
    asset_code: existing?.asset_code ?? '',
    name: existing?.name ?? '',
    category: existing?.category ?? '',
    location: existing?.location ?? '',
    purchase_date: existing?.purchase_date ?? undefined,
    purchase_price: existing?.purchase_price ?? undefined,
    quantity: existing?.quantity ?? 1,
    condition: existing?.condition ?? 'baik',
    description: existing?.description ?? '',
    photo_url: existing?.photo_url ?? '',
  });

  const mut = useMutation({
    mutationFn: () =>
      existing ? updateItem(existing.id, form) : createItem(form),
    onSuccess: () => {
      toast.success('Tersimpan');
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-stats'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">
            {existing ? 'Edit Aset' : 'Aset Baru'}
          </h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Kode (mis. PRJ-001)"
              value={form.asset_code}
              onChange={(e) => setForm({ ...form, asset_code: e.target.value.toUpperCase() })}
              className="bg-surface-base border border-surface-border rounded px-3 py-2"
            />
            <input
              placeholder="Kategori (Elektronik / Mebel)"
              value={form.category ?? ''}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="bg-surface-base border border-surface-border rounded px-3 py-2"
            />
          </div>
          <input
            placeholder="Nama Aset"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <input
            placeholder="Lokasi (Lab Komputer 1)"
            value={form.location ?? ''}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-text-muted">Tgl Beli</label>
              <input
                type="date"
                value={form.purchase_date ?? ''}
                onChange={(e) => setForm({ ...form, purchase_date: e.target.value || undefined })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Harga (Rp)</label>
              <input
                type="number"
                value={form.purchase_price ?? ''}
                onChange={(e) =>
                  setForm({ ...form, purchase_price: e.target.value ? Number(e.target.value) : undefined })
                }
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Qty</label>
              <input
                type="number"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                min={1}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-text-muted">Kondisi</label>
            <select
              value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value })}
              className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
            >
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <textarea
            placeholder="Deskripsi"
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <input
            placeholder="URL foto (opsional)"
            value={form.photo_url ?? ''}
            onChange={(e) => setForm({ ...form, photo_url: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted">Batal</button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !form.asset_code || !form.name}
            className="px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg disabled:opacity-50"
          >
            {mut.isPending ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogsModal({
  item,
  onClose,
}: {
  item: InventoryItem;
  onClose: () => void;
}) {
  const { data: logs = [] } = useQuery({
    queryKey: ['inventory-logs', item.id],
    queryFn: () => fetchItemLogs(item.id),
  });
  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-md max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">Riwayat Aset</h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-2 text-sm">
          <div className="text-xs text-text-muted mb-3">
            {item.asset_code} — {item.name}
          </div>
          {logs.length === 0 && <div className="text-text-muted">Belum ada riwayat</div>}
          {logs.map((l) => (
            <div key={l.id} className="border-l-2 border-primary-500/50 pl-3 py-1">
              <div className="font-mono text-2xs text-primary-300 uppercase">{l.action}</div>
              <div className="text-sm">{l.note}</div>
              <div className="text-2xs text-text-muted">
                {l.actor_name} • {formatDate(l.created_at)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
