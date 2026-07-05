'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Edit,
  Heart,
  Pill,
  Plus,
  Stethoscope,
  Trash2,
  X,
} from 'lucide-react';
import api, { type Envelope, getErrorMessage } from '@/lib/api';
import {
  adjustMedicineStock,
  createMedicine,
  createVisit,
  deleteMedicine,
  deleteVisit,
  fetchMedicines,
  fetchUksStats,
  fetchVisits,
  updateMedicine,
  type Medicine,
  type MedicineInput,
  type UksVisit,
  type VisitInput,
} from '@/lib/uksApi';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn, formatDate } from '@/lib/utils';

const OUTCOMES = [
  { value: 'kembali_kelas', label: 'Kembali ke Kelas' },
  { value: 'istirahat_uks', label: 'Istirahat di UKS' },
  { value: 'pulang', label: 'Dijemput / Pulang' },
  { value: 'rujuk_rs', label: 'Rujuk Rumah Sakit' },
];

interface SimpleStudent {
  id: number;
  full_name: string;
  employee_id: string;
}

export default function UksPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'hr';
  const [tab, setTab] = useState<'visits' | 'medicines'>('visits');

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Stethoscope className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            UKS / Klinik
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">UKS Sekolah</h1>
        <p className="font-body text-text-muted mt-1">
          Catat kunjungan UKS, kelola stok obat, monitor expiry.
        </p>
      </div>

      {isAdmin && <UksStatsBlock />}

      <div className="flex flex-wrap gap-2 border-b border-surface-border">
        <button
          onClick={() => setTab('visits')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
            tab === 'visits'
              ? 'border-primary-500 text-primary-300'
              : 'border-transparent text-text-muted'
          )}
        >
          Kunjungan
        </button>
        <button
          onClick={() => setTab('medicines')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
            tab === 'medicines'
              ? 'border-primary-500 text-primary-300'
              : 'border-transparent text-text-muted'
          )}
        >
          Stok Obat
        </button>
      </div>

      {tab === 'visits' && <VisitsTab isAdmin={isAdmin} />}
      {tab === 'medicines' && <MedicinesTab isAdmin={isAdmin} />}
    </div>
  );
}

function UksStatsBlock() {
  const { data } = useQuery({
    queryKey: ['uks-stats'],
    queryFn: fetchUksStats,
    refetchInterval: 60_000,
  });
  if (!data) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {[
        { label: 'Hari Ini', value: data.visits_today, tone: 'text-primary-300' },
        { label: 'Pekan Ini', value: data.visits_this_week, tone: 'text-emerald-300' },
        { label: 'Bulan Ini', value: data.visits_this_month, tone: 'text-text-secondary' },
        { label: 'Stok Rendah', value: data.low_stock_count, tone: 'text-amber-300' },
        { label: 'Expiring 30hr', value: data.expiring_soon_count, tone: 'text-rose-300' },
      ].map((s) => (
        <div key={s.label} className="rounded-lg bg-surface-raised border border-surface-border p-3">
          <div className="text-2xs uppercase font-mono text-text-muted">{s.label}</div>
          <div className={cn('font-display text-2xl font-bold mt-1', s.tone)}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

function VisitsTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [creating, setCreating] = useState(false);

  const { data: visits = [], isLoading } = useQuery({
    queryKey: ['uks-visits'],
    queryFn: () => fetchVisits({ limit: 100 }),
  });

  const removeMut = useMutation({
    mutationFn: deleteVisit,
    onSuccess: () => {
      toast.success('Catatan dihapus');
      qc.invalidateQueries({ queryKey: ['uks-visits'] });
      qc.invalidateQueries({ queryKey: ['uks-stats'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="space-y-3">
      {isAdmin && (
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-2 bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg text-sm font-medium flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> Catat Kunjungan
        </button>
      )}

      {isLoading && <div className="text-text-muted">Memuat...</div>}

      <div className="space-y-2">
        {visits.map((v) => (
          <div
            key={v.id}
            className="rounded-lg bg-surface-raised border border-surface-border p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-2xs uppercase tracking-widest text-text-muted">
                    {OUTCOMES.find((o) => o.value === v.outcome)?.label || v.outcome}
                  </span>
                  {v.notify_parent && (
                    <span className="font-mono text-2xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-300">
                      ORTU DIKABARI
                    </span>
                  )}
                </div>
                <h3 className="font-display font-semibold">{v.student_name}</h3>
                <div className="text-xs text-text-muted">
                  {v.student_class && `${v.student_class} • `}
                  {formatDate(v.visit_date)} {v.arrival_time?.slice(0, 5)}
                  {v.departure_time && ` – ${v.departure_time.slice(0, 5)}`}
                </div>
              </div>
              {isAdmin && user?.role === 'super_admin' && (
                <button
                  onClick={() => {
                    if (confirm('Hapus catatan?')) removeMut.mutate(v.id);
                  }}
                  className="text-rose-300 hover:text-rose-200"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm pt-2 border-t border-surface-border">
              <div>
                <div className="text-2xs text-text-muted uppercase">Keluhan</div>
                <p>{v.complaint}</p>
              </div>
              {v.diagnosis && (
                <div>
                  <div className="text-2xs text-text-muted uppercase">Diagnosis</div>
                  <p>{v.diagnosis}</p>
                </div>
              )}
              {v.treatment && (
                <div>
                  <div className="text-2xs text-text-muted uppercase">Penanganan</div>
                  <p>{v.treatment}</p>
                </div>
              )}
              {(v.body_temp || v.blood_pressure) && (
                <div>
                  <div className="text-2xs text-text-muted uppercase">Vital Signs</div>
                  <p>
                    {v.body_temp && `Suhu ${v.body_temp}°C`}
                    {v.body_temp && v.blood_pressure && ' • '}
                    {v.blood_pressure && `TD ${v.blood_pressure}`}
                  </p>
                </div>
              )}
            </div>
            {Array.isArray(v.medicines_json) && v.medicines_json.length > 0 && (
              <div className="text-xs">
                <span className="text-2xs uppercase text-text-muted">Obat: </span>
                {v.medicines_json
                  .map((m: any) => `${m.name} ×${m.qty || 1}`)
                  .join(', ')}
              </div>
            )}
            {v.handled_by_name && (
              <div className="text-2xs text-text-muted">
                Ditangani oleh {v.handled_by_name}
              </div>
            )}
          </div>
        ))}
        {visits.length === 0 && !isLoading && (
          <div className="text-center text-text-muted py-8">
            Belum ada catatan kunjungan
          </div>
        )}
      </div>

      {creating && <VisitModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function VisitModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const [studentSearch, setStudentSearch] = useState('');
  const [form, setForm] = useState<VisitInput>({
    student_id: 0,
    visit_date: today,
    arrival_time: nowStr,
    departure_time: undefined,
    complaint: '',
    diagnosis: '',
    treatment: '',
    body_temp: undefined,
    blood_pressure: '',
    outcome: 'kembali_kelas',
    notify_parent: false,
  });

  const { data: students = [] } = useQuery<SimpleStudent[]>({
    queryKey: ['students-search-uks', studentSearch],
    queryFn: async () => {
      const r = await api.get<Envelope<{ items: SimpleStudent[] } | SimpleStudent[]>>(
        '/users',
        { params: { role: 'employee', q: studentSearch || undefined, per_page: 50 } }
      );
      const data = r.data.data as any;
      return Array.isArray(data) ? data : data?.items ?? [];
    },
    enabled: studentSearch.length >= 2,
  });

  const mut = useMutation({
    mutationFn: () => createVisit(form),
    onSuccess: () => {
      toast.success('Kunjungan tercatat');
      qc.invalidateQueries({ queryKey: ['uks-visits'] });
      qc.invalidateQueries({ queryKey: ['uks-stats'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">Catat Kunjungan UKS</h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div>
            <label className="text-xs text-text-muted">Cari Siswa</label>
            <input
              type="text"
              placeholder="Nama atau NIS..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
            />
            {students.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded border border-surface-border">
                {students.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setForm({ ...form, student_id: s.id });
                      setStudentSearch(s.full_name);
                    }}
                    className={cn(
                      'w-full text-left px-3 py-2 text-xs hover:bg-surface-muted',
                      form.student_id === s.id && 'bg-primary-500/15'
                    )}
                  >
                    <div className="font-medium">{s.full_name}</div>
                    <div className="text-2xs text-text-muted">{s.employee_id}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-text-muted">Tanggal</label>
              <input
                type="date"
                value={form.visit_date}
                onChange={(e) => setForm({ ...form, visit_date: e.target.value })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Datang</label>
              <input
                type="time"
                value={form.arrival_time}
                onChange={(e) => setForm({ ...form, arrival_time: e.target.value })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Pulang</label>
              <input
                type="time"
                value={form.departure_time ?? ''}
                onChange={(e) =>
                  setForm({ ...form, departure_time: e.target.value || undefined })
                }
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
          </div>
          <textarea
            placeholder="Keluhan utama"
            value={form.complaint}
            onChange={(e) => setForm({ ...form, complaint: e.target.value })}
            rows={2}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <textarea
            placeholder="Diagnosis (opsional)"
            value={form.diagnosis}
            onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
            rows={2}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <textarea
            placeholder="Penanganan / obat yang diberikan"
            value={form.treatment}
            onChange={(e) => setForm({ ...form, treatment: e.target.value })}
            rows={2}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-text-muted">Suhu (°C)</label>
              <input
                type="number"
                step="0.1"
                value={form.body_temp ?? ''}
                onChange={(e) =>
                  setForm({ ...form, body_temp: e.target.value ? Number(e.target.value) : undefined })
                }
                placeholder="36.5"
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Tekanan Darah</label>
              <input
                type="text"
                value={form.blood_pressure ?? ''}
                onChange={(e) => setForm({ ...form, blood_pressure: e.target.value })}
                placeholder="120/80"
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-text-muted">Tindak Lanjut</label>
            <select
              value={form.outcome}
              onChange={(e) => setForm({ ...form, outcome: e.target.value })}
              className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
            >
              {OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.notify_parent}
              onChange={(e) => setForm({ ...form, notify_parent: e.target.checked })}
            />
            <span>Kirim notifikasi ke orang tua</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted">
            Batal
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !form.student_id || !form.complaint}
            className="px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg disabled:opacity-50"
          >
            {mut.isPending ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MedicinesTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [adjusting, setAdjusting] = useState<Medicine | null>(null);
  const [lowOnly, setLowOnly] = useState(false);
  const [q, setQ] = useState('');

  const { data: meds = [], isLoading } = useQuery({
    queryKey: ['uks-medicines', q, lowOnly],
    queryFn: () => fetchMedicines({ q: q || undefined, low_stock_only: lowOnly }),
  });

  const removeMut = useMutation({
    mutationFn: deleteMedicine,
    onSuccess: () => {
      toast.success('Obat dihapus');
      qc.invalidateQueries({ queryKey: ['uks-medicines'] });
      qc.invalidateQueries({ queryKey: ['uks-stats'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama / kode obat..."
          className="flex-1 min-w-[200px] bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-1 text-sm text-text-muted">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
          />
          Stok rendah saja
        </label>
        {isAdmin && (
          <button
            onClick={() => setCreating(true)}
            className="px-3 py-2 bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg text-sm font-medium flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Obat Baru
          </button>
        )}
      </div>

      {isLoading && <div className="text-text-muted">Memuat...</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {meds.map((m) => (
          <div
            key={m.id}
            className={cn(
              'rounded-lg border p-4 space-y-2',
              m.is_low_stock || m.is_expiring_soon
                ? 'border-amber-500/40 bg-amber-500/5'
                : 'border-surface-border bg-surface-raised'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono text-2xs text-text-muted">{m.code}</div>
                <h3 className="font-display font-bold text-sm">{m.name}</h3>
                {m.category && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded bg-primary-500/15 text-primary-300 font-mono text-2xs">
                    {m.category}
                  </span>
                )}
              </div>
              <Pill className="w-5 h-5 text-text-muted" />
            </div>
            <div className="flex items-center justify-between">
              <div className="font-display text-xl font-bold">
                {m.stock} <span className="text-xs text-text-muted">{m.unit}</span>
              </div>
              {m.is_low_stock && (
                <span className="font-mono text-2xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  STOK RENDAH
                </span>
              )}
            </div>
            {m.expire_date && (
              <div
                className={cn(
                  'text-2xs',
                  m.is_expiring_soon ? 'text-rose-300' : 'text-text-muted'
                )}
              >
                Expire: {formatDate(m.expire_date)}
                {m.is_expiring_soon && ' ⚠️'}
              </div>
            )}
            {isAdmin && (
              <div className="flex gap-1 pt-2 border-t border-surface-border">
                <button
                  onClick={() => setAdjusting(m)}
                  className="px-2 py-1 text-2xs bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 rounded"
                >
                  +/- Stok
                </button>
                <button
                  onClick={() => setEditing(m)}
                  className="px-2 py-1 text-2xs bg-surface-muted text-text-muted hover:text-text-primary rounded"
                >
                  <Edit className="w-3 h-3" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Hapus ${m.name}?`)) removeMut.mutate(m.id);
                  }}
                  className="px-2 py-1 text-2xs bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 rounded"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        ))}
        {meds.length === 0 && !isLoading && (
          <div className="col-span-full text-center text-text-muted py-8">
            Tidak ada obat
          </div>
        )}
      </div>

      {creating && <MedicineModal onClose={() => setCreating(false)} />}
      {editing && (
        <MedicineModal existing={editing} onClose={() => setEditing(null)} />
      )}
      {adjusting && (
        <AdjustStockModal
          medicine={adjusting}
          onClose={() => setAdjusting(null)}
        />
      )}
    </div>
  );
}

function MedicineModal({
  existing,
  onClose,
}: {
  existing?: Medicine;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<MedicineInput>({
    code: existing?.code ?? '',
    name: existing?.name ?? '',
    category: existing?.category ?? '',
    unit: existing?.unit ?? 'butir',
    stock: existing?.stock ?? 0,
    low_stock_threshold: existing?.low_stock_threshold ?? 10,
    expire_date: existing?.expire_date ?? undefined,
    notes: existing?.notes ?? '',
  });

  const mut = useMutation({
    mutationFn: () =>
      existing ? updateMedicine(existing.id, form) : createMedicine(form),
    onSuccess: () => {
      toast.success('Tersimpan');
      qc.invalidateQueries({ queryKey: ['uks-medicines'] });
      qc.invalidateQueries({ queryKey: ['uks-stats'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">
            {existing ? 'Edit Obat' : 'Obat Baru'}
          </h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Kode (PCM-001)"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className="bg-surface-base border border-surface-border rounded px-3 py-2"
            />
            <input
              placeholder="Kategori"
              value={form.category ?? ''}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="bg-surface-base border border-surface-border rounded px-3 py-2"
            />
          </div>
          <input
            placeholder="Nama Obat"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number"
              placeholder="Stok"
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
              className="bg-surface-base border border-surface-border rounded px-3 py-2"
            />
            <input
              placeholder="Satuan"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              className="bg-surface-base border border-surface-border rounded px-3 py-2"
            />
            <input
              type="number"
              placeholder="Min stok"
              value={form.low_stock_threshold}
              onChange={(e) =>
                setForm({ ...form, low_stock_threshold: Number(e.target.value) })
              }
              className="bg-surface-base border border-surface-border rounded px-3 py-2"
            />
          </div>
          <input
            type="date"
            value={form.expire_date ?? ''}
            onChange={(e) =>
              setForm({ ...form, expire_date: e.target.value || undefined })
            }
            placeholder="Tanggal expire"
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <textarea
            placeholder="Catatan"
            value={form.notes ?? ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted">
            Batal
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !form.code || !form.name}
            className="px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg disabled:opacity-50"
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

function AdjustStockModal({
  medicine,
  onClose,
}: {
  medicine: Medicine;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState('');
  const mut = useMutation({
    mutationFn: () => adjustMedicineStock(medicine.id, delta, reason || undefined),
    onSuccess: () => {
      toast.success('Stok diperbarui');
      qc.invalidateQueries({ queryKey: ['uks-medicines'] });
      qc.invalidateQueries({ queryKey: ['uks-stats'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">Adjust Stok</h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="rounded bg-surface-base/50 p-3 text-xs">
            <div className="font-display font-bold">{medicine.name}</div>
            <div className="text-text-muted">
              Stok sekarang: {medicine.stock} {medicine.unit}
            </div>
          </div>
          <input
            type="number"
            placeholder="Delta (+ tambah, - kurang)"
            value={delta || ''}
            onChange={(e) => setDelta(Number(e.target.value))}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2 text-lg text-center"
          />
          <div className="text-xs text-text-muted text-center">
            Stok baru: {medicine.stock + delta} {medicine.unit}
          </div>
          <input
            type="text"
            placeholder="Alasan (opsional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted">
            Batal
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || delta === 0}
            className="px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg disabled:opacity-50"
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

// End of file

