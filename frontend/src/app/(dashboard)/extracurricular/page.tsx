'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Award,
  Check,
  Clock,
  Edit,
  Loader2,
  Plus,
  Trash2,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import api, { type Envelope, getErrorMessage } from '@/lib/api';
import {
  addAchievement,
  cancelEnrollment,
  createEkskul,
  decideEnrollment,
  deleteEkskul,
  enrollEkskul,
  fetchAchievements,
  fetchEkskuls,
  fetchEnrollments,
  updateEkskul,
  type Ekskul,
  type EkskulInput,
} from '@/lib/ekskulApi';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn, formatDate } from '@/lib/utils';

const LEVELS = [
  { value: 'sekolah', label: 'Sekolah' },
  { value: 'kecamatan', label: 'Kecamatan' },
  { value: 'kabupaten', label: 'Kabupaten/Kota' },
  { value: 'provinsi', label: 'Provinsi' },
  { value: 'nasional', label: 'Nasional' },
  { value: 'internasional', label: 'Internasional' },
];

export default function ExtracurricularPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'hr';
  const isStudent = user?.role === 'employee';

  const [tab, setTab] = useState<'list' | 'enrollments' | 'achievements'>('list');
  const [editing, setEditing] = useState<Ekskul | null>(null);
  const [creating, setCreating] = useState(false);
  const [achModal, setAchModal] = useState<Ekskul | null>(null);

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['ekskul-list'],
    queryFn: () => fetchEkskuls(false),
  });

  const enrollMut = useMutation({
    mutationFn: (ekskul_id: number) => enrollEkskul(ekskul_id),
    onSuccess: () => {
      toast.success('Pendaftaran terkirim');
      qc.invalidateQueries({ queryKey: ['ekskul-list'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const removeMut = useMutation({
    mutationFn: (id: number) => deleteEkskul(id),
    onSuccess: () => {
      toast.success('Ekskul dihapus');
      qc.invalidateQueries({ queryKey: ['ekskul-list'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-5 h-5 role-accent-text" />
            <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
              Pengembangan Diri
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-display-md font-bold">Ekstrakurikuler</h1>
          <p className="font-body text-text-muted mt-1">
            Daftar ekskul + pendaftaran siswa + pencatatan prestasi (auto-bonus poin apresiasi).
          </p>
        </div>
        {user?.role === 'super_admin' && (
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg flex items-center gap-2 text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Ekskul Baru
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-surface-border">
        {[
          { id: 'list', label: 'Daftar' },
          { id: 'enrollments', label: isStudent ? 'Pendaftaran Saya' : 'Pendaftaran' },
          { id: 'achievements', label: 'Prestasi' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-primary-500 text-primary-300'
                : 'border-transparent text-text-muted hover:text-text-primary'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <>
          {isLoading && <div className="text-text-muted">Memuat...</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((ek) => (
              <div
                key={ek.id}
                className="rounded-lg bg-surface-raised border border-surface-border p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-2xs text-text-muted uppercase tracking-widest">
                      {ek.code}
                    </div>
                    <h3 className="font-display font-bold text-lg">{ek.name}</h3>
                  </div>
                  {!ek.is_active && (
                    <span className="font-mono text-2xs px-2 py-0.5 rounded bg-text-muted/15 text-text-muted">
                      NONAKTIF
                    </span>
                  )}
                </div>
                {ek.description && (
                  <p className="font-body text-sm text-text-muted line-clamp-2">{ek.description}</p>
                )}
                <div className="flex flex-wrap gap-3 text-xs text-text-muted">
                  {ek.coach_name && <span>👤 {ek.coach_name}</span>}
                  {ek.schedule_text && <span>🗓 {ek.schedule_text}</span>}
                  {ek.location && <span>📍 {ek.location}</span>}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Users className="w-3.5 h-3.5 text-primary-400" />
                  <span className="text-text-secondary">
                    {ek.approved_count}{ek.quota ? `/${ek.quota}` : ''} member
                  </span>
                  {ek.pending_count > 0 && (
                    <span className="ml-auto px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-2xs">
                      {ek.pending_count} pending
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-surface-border">
                  {isStudent && (
                    <>
                      {!ek.is_self_enrolled ? (
                        <button
                          onClick={() => enrollMut.mutate(ek.id)}
                          disabled={!ek.is_active || enrollMut.isPending}
                          className="px-3 py-1.5 text-xs font-medium bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-md disabled:opacity-50"
                        >
                          Daftar
                        </button>
                      ) : (
                        <span className="px-2 py-1 text-2xs rounded bg-success/15 text-success font-mono">
                          {ek.self_enrollment_status === 'pending' && 'MENUNGGU'}
                          {ek.self_enrollment_status === 'approved' && 'TERDAFTAR'}
                          {ek.self_enrollment_status === 'rejected' && 'DITOLAK'}
                        </span>
                      )}
                    </>
                  )}
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => setAchModal(ek)}
                        className="px-3 py-1.5 text-xs font-medium bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-md flex items-center gap-1"
                      >
                        <Award className="w-3 h-3" /> + Prestasi
                      </button>
                      <button
                        onClick={() => setEditing(ek)}
                        className="px-3 py-1.5 text-xs font-medium bg-surface-muted hover:bg-surface-border text-text-secondary rounded-md flex items-center gap-1"
                      >
                        <Edit className="w-3 h-3" /> Edit
                      </button>
                      {user?.role === 'super_admin' && (
                        <button
                          onClick={() => {
                            if (confirm(`Hapus ekskul ${ek.name}?`)) removeMut.mutate(ek.id);
                          }}
                          className="px-3 py-1.5 text-xs font-medium bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-md flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'enrollments' && <EnrollmentTab isAdmin={isAdmin} />}
      {tab === 'achievements' && <AchievementTab isAdmin={isAdmin} />}

      {creating && (
        <EkskulModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['ekskul-list'] });
            setCreating(false);
          }}
        />
      )}
      {editing && (
        <EkskulModal
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['ekskul-list'] });
            setEditing(null);
          }}
        />
      )}
      {achModal && (
        <AchievementModal
          ekskul={achModal}
          onClose={() => setAchModal(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['ekskul-list'] });
            setAchModal(null);
          }}
        />
      )}
    </div>
  );
}

function EnrollmentTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('pending');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['ekskul-enrollments', statusFilter],
    queryFn: () => fetchEnrollments({ status: statusFilter || undefined }),
  });

  const decideMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'approved' | 'rejected' }) =>
      decideEnrollment(id, status),
    onSuccess: () => {
      toast.success('Diputuskan');
      qc.invalidateQueries({ queryKey: ['ekskul-enrollments'] });
      qc.invalidateQueries({ queryKey: ['ekskul-list'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const cancelMut = useMutation({
    mutationFn: (id: number) => cancelEnrollment(id),
    onSuccess: () => {
      toast.success('Pendaftaran dibatalkan');
      qc.invalidateQueries({ queryKey: ['ekskul-enrollments'] });
      qc.invalidateQueries({ queryKey: ['ekskul-list'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {['', 'pending', 'approved', 'rejected', 'left'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-md font-medium',
              statusFilter === s
                ? 'bg-primary-500 text-text-inverse'
                : 'bg-surface-muted text-text-muted hover:text-text-primary'
            )}
          >
            {s ? s.toUpperCase() : 'SEMUA'}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-text-muted">Memuat...</div>}

      <div className="rounded-lg bg-surface-raised border border-surface-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-widest text-text-muted">Ekskul</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-widest text-text-muted">Siswa</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-widest text-text-muted">Tanggal</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-widest text-text-muted">Status</th>
              <th className="px-3 py-2 text-right font-mono text-2xs uppercase tracking-widest text-text-muted">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-surface-border">
                <td className="px-3 py-2 font-medium">{r.ekskul_name}</td>
                <td className="px-3 py-2">{r.student_name}</td>
                <td className="px-3 py-2 text-text-muted">{formatDate(r.enrolled_at)}</td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded font-mono text-2xs',
                      r.status === 'approved' && 'bg-success/15 text-success',
                      r.status === 'pending' && 'bg-amber-500/15 text-amber-300',
                      r.status === 'rejected' && 'bg-rose-500/15 text-rose-300',
                      r.status === 'left' && 'bg-text-muted/15 text-text-muted'
                    )}
                  >
                    {r.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-3 py-2 text-right space-x-1">
                  {isAdmin && r.status === 'pending' && (
                    <>
                      <button
                        onClick={() => decideMut.mutate({ id: r.id, status: 'approved' })}
                        className="px-2 py-1 text-2xs bg-success/15 text-success hover:bg-success/25 rounded"
                      >
                        ✓ Setujui
                      </button>
                      <button
                        onClick={() => decideMut.mutate({ id: r.id, status: 'rejected' })}
                        className="px-2 py-1 text-2xs bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 rounded"
                      >
                        ✗ Tolak
                      </button>
                    </>
                  )}
                  {r.status !== 'rejected' && (
                    <button
                      onClick={() => cancelMut.mutate(r.id)}
                      className="px-2 py-1 text-2xs bg-surface-muted text-text-muted hover:text-text-primary rounded"
                    >
                      Batal
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-text-muted">
                  Tidak ada data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AchievementTab({ isAdmin }: { isAdmin: boolean }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['achievements'],
    queryFn: () => fetchAchievements({ limit: 50 }),
  });

  const LEVEL_COLORS: Record<string, string> = {
    sekolah: 'bg-text-muted/15 text-text-muted',
    kecamatan: 'bg-blue-500/15 text-blue-300',
    kabupaten: 'bg-cyan-500/15 text-cyan-300',
    provinsi: 'bg-violet-500/15 text-violet-300',
    nasional: 'bg-amber-500/15 text-amber-300',
    internasional: 'bg-emerald-500/15 text-emerald-300',
  };

  return (
    <div className="space-y-3">
      {isLoading && <div className="text-text-muted">Memuat...</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map((a) => (
          <div
            key={a.id}
            className="rounded-lg bg-surface-raised border border-surface-border p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('font-mono text-2xs px-2 py-0.5 rounded uppercase', LEVEL_COLORS[a.level])}>
                    {a.level}
                  </span>
                  {a.rank && (
                    <span className="font-mono text-2xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-300">
                      🏆 {a.rank}
                    </span>
                  )}
                  <span className="text-text-muted text-xs">{a.ekskul_name}</span>
                </div>
                <h3 className="font-display font-bold text-lg mt-1">{a.title}</h3>
              </div>
              <span className="font-mono text-2xs text-text-muted">
                +{a.appreciation_points} pts
              </span>
            </div>
            {a.description && (
              <p className="font-body text-sm text-text-muted">{a.description}</p>
            )}
            <div className="text-xs text-text-muted">
              {formatDate(a.achievement_date)} • {a.member_count} anggota
            </div>
            {a.member_names.length > 0 && (
              <div className="text-2xs text-text-muted truncate">
                {a.member_names.slice(0, 5).join(', ')}
                {a.member_names.length > 5 && ` +${a.member_names.length - 5}`}
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && !isLoading && (
          <div className="col-span-full text-center text-text-muted py-8">
            Belum ada prestasi tercatat
          </div>
        )}
      </div>
    </div>
  );
}

function EkskulModal({
  existing,
  onClose,
  onSaved,
}: {
  existing?: Ekskul;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<EkskulInput>({
    code: existing?.code ?? '',
    name: existing?.name ?? '',
    description: existing?.description ?? '',
    schedule_text: existing?.schedule_text ?? '',
    location: existing?.location ?? '',
    quota: existing?.quota ?? null,
    is_active: existing?.is_active ?? true,
  });

  const mut = useMutation({
    mutationFn: (p: EkskulInput) =>
      existing ? updateEkskul(existing.id, p) : createEkskul(p),
    onSuccess: () => {
      toast.success('Tersimpan');
      onSaved();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">
            {existing ? 'Edit Ekskul' : 'Ekskul Baru'}
          </h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <input
            placeholder="Kode (mis. PRMK, BSKT)"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <input
            placeholder="Nama (mis. Pramuka)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <textarea
            placeholder="Deskripsi"
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <input
            placeholder="Jadwal (mis. Kamis 15:00-17:00)"
            value={form.schedule_text ?? ''}
            onChange={(e) => setForm({ ...form, schedule_text: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <input
            placeholder="Lokasi"
            value={form.location ?? ''}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <input
            type="number"
            placeholder="Kuota (kosongkan = tanpa batas)"
            value={form.quota ?? ''}
            onChange={(e) =>
              setForm({ ...form, quota: e.target.value ? Number(e.target.value) : null })
            }
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span>Aktif</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted">Batal</button>
          <button
            onClick={() => mut.mutate(form)}
            disabled={mut.isPending}
            className="px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg disabled:opacity-50"
          >
            {mut.isPending ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AchievementModal({
  ekskul,
  onClose,
  onSaved,
}: {
  ekskul: Ekskul;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    title: '',
    description: '',
    achievement_date: today,
    level: 'sekolah',
    rank: '',
    appreciation_points: 10,
    member_ids_text: '',
  });

  const mut = useMutation({
    mutationFn: () =>
      addAchievement({
        ekskul_id: ekskul.id,
        title: form.title,
        description: form.description || undefined,
        achievement_date: form.achievement_date,
        level: form.level,
        rank: form.rank || undefined,
        appreciation_points: form.appreciation_points,
        member_student_ids: form.member_ids_text
          .split(',')
          .map((s) => parseInt(s.trim()))
          .filter((n) => !isNaN(n)),
      }),
    onSuccess: () => {
      toast.success('Prestasi disimpan, poin apresiasi otomatis ditambahkan');
      onSaved();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">Catat Prestasi — {ekskul.name}</h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <input
            placeholder="Judul prestasi"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <textarea
            placeholder="Deskripsi"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-text-muted mb-1 text-xs">Tanggal</label>
              <input
                type="date"
                value={form.achievement_date}
                onChange={(e) => setForm({ ...form, achievement_date: e.target.value })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-text-muted mb-1 text-xs">Level</label>
              <select
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              >
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Peringkat (Juara 1, dll)"
              value={form.rank}
              onChange={(e) => setForm({ ...form, rank: e.target.value })}
              className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
            />
            <input
              type="number"
              placeholder="Poin apresiasi"
              value={form.appreciation_points}
              onChange={(e) =>
                setForm({ ...form, appreciation_points: Number(e.target.value) })
              }
              className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
            />
          </div>
          <textarea
            placeholder="ID siswa anggota (pisah koma, mis. 12,15,20)"
            value={form.member_ids_text}
            onChange={(e) => setForm({ ...form, member_ids_text: e.target.value })}
            rows={2}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2 font-mono text-xs"
          />
          <p className="text-2xs text-text-muted">
            Tip: Cek halaman Pengguna untuk lihat ID siswa. Setiap anggota otomatis dapat
            +{form.appreciation_points} poin apresiasi.
          </p>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted">Batal</button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !form.title}
            className="px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg disabled:opacity-50"
          >
            {mut.isPending ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}
