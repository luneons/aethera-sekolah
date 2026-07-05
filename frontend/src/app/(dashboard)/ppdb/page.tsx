'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Award,
  Check,
  ClipboardCheck,
  Eye,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import {
  createPeriod,
  decideApplication,
  enrollApplication,
  fetchApplications,
  fetchPeriods,
  updatePeriod,
  type AdmissionPeriod,
  type Application,
  type PeriodInput,
} from '@/lib/admissionsApi';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn, formatDate } from '@/lib/utils';

const STATUS_COLOR: Record<string, string> = {
  submitted: 'bg-blue-500/15 text-blue-300',
  reviewing: 'bg-amber-500/15 text-amber-300',
  accepted: 'bg-emerald-500/15 text-emerald-300',
  rejected: 'bg-rose-500/15 text-rose-300',
  enrolled: 'bg-violet-500/15 text-violet-300',
  cancelled: 'bg-text-muted/15 text-text-muted',
};

export default function PpdbPage() {
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.role === 'super_admin';
  const [tab, setTab] = useState<'applications' | 'periods'>('applications');

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Award className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            PPDB Online
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">
          Penerimaan Peserta Didik Baru
        </h1>
        <p className="font-body text-text-muted mt-1">
          Kelola gelombang pendaftaran, review aplikasi, dan auto-enroll calon siswa
          jadi user aktif.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-surface-border">
        <button
          onClick={() => setTab('applications')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
            tab === 'applications'
              ? 'border-primary-500 text-primary-300'
              : 'border-transparent text-text-muted'
          )}
        >
          Aplikasi
        </button>
        <button
          onClick={() => setTab('periods')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
            tab === 'periods'
              ? 'border-primary-500 text-primary-300'
              : 'border-transparent text-text-muted'
          )}
        >
          Periode
        </button>
      </div>

      {tab === 'applications' && <ApplicationsTab />}
      {tab === 'periods' && <PeriodsTab isSuperAdmin={isSuperAdmin} />}
    </div>
  );
}

function ApplicationsTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');
  const [viewing, setViewing] = useState<Application | null>(null);

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['ppdb-applications', statusFilter, q],
    queryFn: () =>
      fetchApplications({
        status: statusFilter || undefined,
        q: q || undefined,
      }),
  });

  const decideMut = useMutation({
    mutationFn: ({ id, status, note }: { id: number; status: string; note?: string }) =>
      decideApplication(id, { status, note }),
    onSuccess: () => {
      toast.success('Keputusan tersimpan');
      qc.invalidateQueries({ queryKey: ['ppdb-applications'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const enrollMut = useMutation({
    mutationFn: enrollApplication,
    onSuccess: (data) => {
      toast.success(
        `Enrolled! NIS ${data.employee_id}, password: ${data.initial_password}`,
        { duration: 30000 }
      );
      qc.invalidateQueries({ queryKey: ['ppdb-applications'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Cari nama / NISN / nomor reg..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Semua Status</option>
          {Object.keys(STATUS_COLOR).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {isLoading && <div className="text-text-muted">Memuat...</div>}

      <div className="rounded-lg bg-surface-raised border border-surface-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">No Reg</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Nama</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Periode</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Daftar</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase text-text-muted">Status</th>
              <th className="px-3 py-2 text-right font-mono text-2xs uppercase text-text-muted">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className="border-t border-surface-border">
                <td className="px-3 py-2 font-mono text-xs">{a.registration_number}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{a.full_name}</div>
                  {a.nisn && <div className="text-2xs text-text-muted">NISN {a.nisn}</div>}
                </td>
                <td className="px-3 py-2 text-xs text-text-muted">{a.period_name}</td>
                <td className="px-3 py-2 text-xs text-text-muted">{formatDate(a.submitted_at)}</td>
                <td className="px-3 py-2">
                  <span className={cn('font-mono text-2xs px-2 py-0.5 rounded uppercase', STATUS_COLOR[a.status])}>
                    {a.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right space-x-1">
                  <button
                    onClick={() => setViewing(a)}
                    className="px-2 py-1 text-2xs bg-surface-muted text-text-muted hover:text-text-primary rounded inline-flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                  {a.status === 'submitted' && (
                    <button
                      onClick={() => decideMut.mutate({ id: a.id, status: 'reviewing' })}
                      className="px-2 py-1 text-2xs bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 rounded"
                    >
                      Review
                    </button>
                  )}
                  {(a.status === 'reviewing' || a.status === 'submitted') && (
                    <>
                      <button
                        onClick={() => decideMut.mutate({ id: a.id, status: 'accepted' })}
                        className="px-2 py-1 text-2xs bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 rounded"
                      >
                        Terima
                      </button>
                      <button
                        onClick={() => {
                          const note = prompt('Alasan ditolak (opsional):') || '';
                          decideMut.mutate({ id: a.id, status: 'rejected', note });
                        }}
                        className="px-2 py-1 text-2xs bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 rounded"
                      >
                        Tolak
                      </button>
                    </>
                  )}
                  {a.status === 'accepted' && (
                    <button
                      onClick={() => {
                        if (confirm(`Enroll ${a.full_name} jadi user aktif?`))
                          enrollMut.mutate(a.id);
                      }}
                      className="px-2 py-1 text-2xs bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 rounded"
                    >
                      Enroll
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-text-muted">
                  Belum ada aplikasi
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {viewing && <ApplicationModal application={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function ApplicationModal({
  application,
  onClose,
}: {
  application: Application;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">{application.full_name}</h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex gap-4">
            {application.photo_url && (
              <img
                src={application.photo_url}
                alt={application.full_name}
                className="w-24 h-32 object-cover rounded"
              />
            )}
            <div className="flex-1 grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-text-muted text-xs">No Reg:</span> {application.registration_number}</div>
              <div><span className="text-text-muted text-xs">Status:</span> <span className={cn('font-mono text-2xs px-2 py-0.5 rounded uppercase', STATUS_COLOR[application.status])}>{application.status}</span></div>
              <div><span className="text-text-muted text-xs">NISN:</span> {application.nisn || '-'}</div>
              <div><span className="text-text-muted text-xs">NIK:</span> {application.nik || '-'}</div>
              <div><span className="text-text-muted text-xs">JK:</span> {application.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</div>
              <div><span className="text-text-muted text-xs">Agama:</span> {application.religion || '-'}</div>
              <div><span className="text-text-muted text-xs">TTL:</span> {application.birth_place}, {application.birth_date}</div>
              <div><span className="text-text-muted text-xs">Asal Sekolah:</span> {application.previous_school || '-'}</div>
            </div>
          </div>

          <div className="text-sm">
            <h4 className="font-display font-semibold text-xs uppercase text-text-muted mb-1">Kontak</h4>
            <div>HP: {application.phone || '-'}</div>
            <div>Email: {application.email || '-'}</div>
            <div>Alamat: {application.address || '-'}</div>
          </div>

          <div className="text-sm">
            <h4 className="font-display font-semibold text-xs uppercase text-text-muted mb-1">Orang Tua</h4>
            <div>Ayah: {application.father_name || '-'}</div>
            <div>Ibu: {application.mother_name || '-'}</div>
            <div>HP Ortu: {application.parent_phone || '-'}</div>
            <div>Pekerjaan: {application.parent_occupation || '-'}</div>
          </div>

          <div className="text-sm">
            <h4 className="font-display font-semibold text-xs uppercase text-text-muted mb-1">Dokumen</h4>
            <div className="flex flex-wrap gap-2">
              {application.kk_url && (
                <a href={application.kk_url} target="_blank" rel="noreferrer" className="px-3 py-1 text-xs bg-surface-muted text-primary-300 rounded">
                  Kartu Keluarga
                </a>
              )}
              {application.akta_url && (
                <a href={application.akta_url} target="_blank" rel="noreferrer" className="px-3 py-1 text-xs bg-surface-muted text-primary-300 rounded">
                  Akta Lahir
                </a>
              )}
              {application.raport_url && (
                <a href={application.raport_url} target="_blank" rel="noreferrer" className="px-3 py-1 text-xs bg-surface-muted text-primary-300 rounded">
                  Rapor
                </a>
              )}
            </div>
          </div>

          {application.decision_note && (
            <div className="rounded bg-surface-base/50 p-3 text-sm">
              <h4 className="font-display font-semibold text-xs uppercase text-text-muted mb-1">Catatan Keputusan</h4>
              <p>{application.decision_note}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PeriodsTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdmissionPeriod | null>(null);

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['ppdb-periods'],
    queryFn: fetchPeriods,
  });

  return (
    <div className="space-y-3">
      {isSuperAdmin && (
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-2 bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg text-sm font-medium flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> Periode Baru
        </button>
      )}

      {isLoading && <div className="text-text-muted">Memuat...</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {list.map((p) => (
          <div key={p.id} className="rounded-lg bg-surface-raised border border-surface-border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono text-2xs text-text-muted">{p.school_year}</div>
                <h3 className="font-display font-bold">{p.name}</h3>
              </div>
              {p.is_active && (
                <span className="font-mono text-2xs px-2 py-0.5 rounded bg-success/15 text-success">AKTIF</span>
              )}
            </div>
            <div className="text-xs text-text-muted mt-2">
              {formatDate(p.start_at)} → {formatDate(p.end_at)}
            </div>
            <div className="flex gap-3 text-xs mt-2">
              <span>📋 {p.applications_count} daftar</span>
              <span>✓ {p.accepted_count} terima</span>
              <span>👥 {p.enrolled_count}/{p.quota || '∞'}</span>
            </div>
            {isSuperAdmin && (
              <div className="mt-2 pt-2 border-t border-surface-border">
                <button
                  onClick={() => setEditing(p)}
                  className="px-2 py-1 text-2xs bg-surface-muted text-text-muted hover:text-text-primary rounded"
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {creating && <PeriodModal onClose={() => setCreating(false)} />}
      {editing && <PeriodModal existing={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PeriodModal({
  existing,
  onClose,
}: {
  existing?: AdmissionPeriod;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toLocalIso = (s: string) => {
    const d = new Date(s);
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 16);
  };

  const [form, setForm] = useState<PeriodInput>({
    name: existing?.name ?? '',
    school_year: existing?.school_year ?? '2025/2026',
    start_at: existing?.start_at ? toLocalIso(existing.start_at) : new Date().toISOString().slice(0, 16),
    end_at: existing?.end_at ? toLocalIso(existing.end_at) : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16),
    quota: existing?.quota ?? null,
    registration_fee: existing?.registration_fee ?? 0,
    is_active: existing?.is_active ?? true,
    description: existing?.description ?? '',
  });

  const mut = useMutation({
    mutationFn: () => {
      const payload: PeriodInput = {
        ...form,
        start_at: new Date(form.start_at).toISOString(),
        end_at: new Date(form.end_at).toISOString(),
      };
      return existing ? updatePeriod(existing.id, payload) : createPeriod(payload);
    },
    onSuccess: () => {
      toast.success('Tersimpan');
      qc.invalidateQueries({ queryKey: ['ppdb-periods'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">
            {existing ? 'Edit Periode' : 'Periode Baru'}
          </h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <input
            placeholder="Nama (mis. Gelombang 1 2025/2026)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <input
            placeholder="Tahun Ajaran (2025/2026)"
            value={form.school_year}
            onChange={(e) => setForm({ ...form, school_year: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-text-muted">Mulai</label>
              <input
                type="datetime-local"
                value={form.start_at}
                onChange={(e) => setForm({ ...form, start_at: e.target.value })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Selesai</label>
              <input
                type="datetime-local"
                value={form.end_at}
                onChange={(e) => setForm({ ...form, end_at: e.target.value })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-text-muted">Kuota</label>
              <input
                type="number"
                value={form.quota ?? ''}
                onChange={(e) => setForm({ ...form, quota: e.target.value ? Number(e.target.value) : null })}
                placeholder="Tidak terbatas"
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Biaya Pendaftaran</label>
              <input
                type="number"
                value={form.registration_fee}
                onChange={(e) => setForm({ ...form, registration_fee: Number(e.target.value) })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
          </div>
          <textarea
            placeholder="Deskripsi/keterangan"
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span>Aktif (terima pendaftaran)</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted">Batal</button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !form.name}
            className="px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg disabled:opacity-50"
          >
            {mut.isPending ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}
