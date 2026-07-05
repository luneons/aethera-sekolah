'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ScanFace,
  QrCode,
  Layers,
  FileSpreadsheet,
  Save,
  Search,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Printer,
  Upload,
  Settings as SettingsIcon,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  fetchMode,
  updateMode,
  fetchStudentsQr,
  bulkToggleQr,
  regenerateAllQr,
  qrPrintClassUrl,
  MODE_LABELS,
  type AttendanceMode,
  type StudentQrItem,
} from '@/lib/attendanceModeApi';

const MODE_ICONS: Record<AttendanceMode, typeof ScanFace> = {
  face: ScanFace,
  qr: QrCode,
  mixed: Layers,
  manual: FileSpreadsheet,
};

export default function AttendanceModePage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<number | undefined>(undefined);
  const [roleFilter, setRoleFilter] = useState<'all' | 'employee' | 'staff'>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data: setting, isLoading: settingLoading } = useQuery({
    queryKey: ['attendance-mode'],
    queryFn: fetchMode,
  });

  const [mode, setMode] = useState<AttendanceMode | null>(null);
  const [defaultEnabled, setDefaultEnabled] = useState(true);
  const [rotationDays, setRotationDays] = useState(0);

  // Sync local state with fetched
  const effectiveMode = mode ?? setting?.mode ?? 'face';
  const effectiveDefault = setting && mode === null ? setting.qr_default_enabled : defaultEnabled;
  const effectiveRotation = setting && mode === null ? setting.qr_rotation_days : rotationDays;

  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ['students-qr', classFilter, search, roleFilter],
    queryFn: () => {
      const params: { class_id?: number; search?: string; role?: 'employee' | 'admin' | 'hr' | 'super_admin' } = {
        class_id: classFilter,
        search: search || undefined,
      };
      // 'staff' = guru/staff/kepsek, kirim role=admin (paling banyak)
      // Untuk hr/super_admin user-nya sedikit, filter di frontend
      if (roleFilter === 'employee') params.role = 'employee';
      return fetchStudentsQr(params);
    },
  });

  // Untuk filter staff: tampilkan semua role kecuali 'employee'
  const filteredStudents = useMemo(() => {
    if (roleFilter === 'staff') {
      return students.filter((s) => {
        // school_class_name akan = "Guru"/"Staff TU"/"Kepala Sekolah" dari backend
        return s.school_class_name === 'Guru' ||
               s.school_class_name === 'Staff TU' ||
               s.school_class_name === 'Kepala Sekolah';
      });
    }
    return students;
  }, [students, roleFilter]);

  const classes = useMemo(() => {
    const m = new Map<number, string>();
    filteredStudents.forEach((s) => {
      if (s.school_class_id && s.school_class_name) {
        m.set(s.school_class_id, s.school_class_name);
      }
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [filteredStudents]);

  const saveMut = useMutation({
    mutationFn: () =>
      updateMode({
        mode: effectiveMode,
        qr_default_enabled: effectiveDefault,
        qr_rotation_days: effectiveRotation,
      }),
    onSuccess: () => {
      toast.success('Mode absensi disimpan');
      setMode(null);
      qc.invalidateQueries({ queryKey: ['attendance-mode'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const bulkMut = useMutation({
    mutationFn: ({ ids, enabled }: { ids: number[]; enabled: boolean }) =>
      bulkToggleQr(ids, enabled),
    onSuccess: (count) => {
      toast.success(`${count} siswa diperbarui`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['students-qr'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const regenAllMut = useMutation({
    mutationFn: () => regenerateAllQr(classFilter),
    onSuccess: (count) => {
      toast.success(`${count} QR token diperbarui`);
      qc.invalidateQueries({ queryKey: ['students-qr'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const toggleOne = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === filteredStudents.length) setSelected(new Set());
    else setSelected(new Set(filteredStudents.map((s) => s.user_id)));
  };

  const dirty = mode !== null;
  const enabledCount = filteredStudents.filter((s) => s.qr_enabled).length;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="font-display font-bold text-2xl flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-primary-400" />
          Mode Absensi
        </h1>
        <p className="text-text-muted text-sm mt-1">
          Atur metode absensi sekolah & akses QR per siswa
        </p>
      </div>

      {/* Mode selector cards */}
      {settingLoading && <div className="text-text-muted text-sm">Memuat pengaturan...</div>}
      {!settingLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(Object.keys(MODE_LABELS) as AttendanceMode[]).map((m) => {
              const Icon = MODE_ICONS[m];
              const active = effectiveMode === m;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'text-left rounded-2xl border-2 p-4 transition-all',
                    active
                      ? 'border-primary-500 bg-primary-500/10 shadow-glow-sm'
                      : 'border-surface-border bg-surface-raised hover:border-primary-500/30'
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon
                      className={cn(
                        'w-5 h-5',
                        active ? 'text-primary-400' : 'text-text-muted'
                      )}
                    />
                    {active && (
                      <CheckCircle2 className="w-4 h-4 text-primary-400 ml-auto" />
                    )}
                  </div>
                  <div
                    className={cn(
                      'font-display font-bold text-base',
                      active ? 'text-primary-400' : ''
                    )}
                  >
                    {MODE_LABELS[m].title}
                  </div>
                  <p className="text-2xs text-text-muted mt-1 leading-snug">
                    {MODE_LABELS[m].desc}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Sub options */}
          {(effectiveMode === 'qr' || effectiveMode === 'mixed') && (
            <div className="rounded-xl border border-surface-border bg-surface-raised p-4 space-y-3">
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  <span className="font-medium">Aktifkan QR untuk siswa baru</span>
                  <span className="block text-2xs text-text-muted mt-0.5">
                    Default saat siswa baru ditambahkan via import
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={effectiveDefault}
                  onChange={(e) => setDefaultEnabled(e.target.checked)}
                  className="w-5 h-5 accent-primary-500"
                />
              </label>
            </div>
          )}

          {dirty && (
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium text-sm shadow-glow-primary"
            >
              <Save className="w-4 h-4" />
              {saveMut.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          href="/scan-qr"
          target="_blank"
          className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-raised p-4 hover:border-primary-500/40 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-primary-500/15 text-primary-400 flex items-center justify-center group-hover:scale-110 transition-transform">
            <QrCode className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display font-semibold text-sm">Buka Kiosk QR</div>
            <div className="text-2xs text-text-muted">Scan kartu siswa</div>
          </div>
        </Link>

        <Link
          href="/attendance-import"
          className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-raised p-4 hover:border-primary-500/40 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Upload className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display font-semibold text-sm">Upload CSV</div>
            <div className="text-2xs text-text-muted">Import absensi manual</div>
          </div>
        </Link>

        <button
          onClick={() => regenAllMut.mutate()}
          disabled={regenAllMut.isPending}
          className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-raised p-4 hover:border-amber-500/40 transition-all group disabled:opacity-50"
        >
          <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
            <RefreshCw className={cn('w-5 h-5', regenAllMut.isPending && 'animate-spin')} />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="font-display font-semibold text-sm">Regenerate QR</div>
            <div className="text-2xs text-text-muted">
              {classFilter ? 'Untuk kelas terpilih' : 'Semua siswa'}
            </div>
          </div>
        </button>
      </div>

      {/* Student list */}
      <div className="rounded-2xl border border-surface-border bg-surface-raised overflow-hidden">
        {/* Role tabs */}
        <div className="px-4 pt-4 pb-2 flex gap-2 border-b border-surface-border bg-surface-muted/30">
          {(['all', 'employee', 'staff'] as const).map((r) => (
            <button
              key={r}
              onClick={() => {
                setRoleFilter(r);
                setSelected(new Set());
                setClassFilter(undefined);
              }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                roleFilter === r
                  ? 'bg-primary-500/15 text-primary-400 border border-primary-500/40'
                  : 'border border-transparent text-text-muted hover:text-text-secondary hover:bg-surface-overlay/40'
              )}
            >
              {r === 'all' && 'Semua'}
              {r === 'employee' && 'Siswa'}
              {r === 'staff' && 'Guru & Staff'}
            </button>
          ))}
        </div>

        <div className="p-4 border-b border-surface-border flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau NIS..."
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
          </div>

          <select
            value={classFilter ?? ''}
            onChange={(e) =>
              setClassFilter(e.target.value ? Number(e.target.value) : undefined)
            }
            className="bg-surface-base border border-surface-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary-500"
          >
            <option value="">Semua kelas</option>
            {classes.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>

          {classFilter && (
            <a
              href={qrPrintClassUrl(classFilter)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 text-violet-400 text-xs font-medium border border-violet-500/30"
            >
              <Printer className="w-3.5 h-3.5" />
              Cetak QR Kelas
            </a>
          )}
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="px-4 py-3 bg-primary-500/10 border-b border-primary-500/20 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm text-primary-400 font-medium">
              {selected.size} dipilih
            </span>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  bulkMut.mutate({ ids: Array.from(selected), enabled: true })
                }
                disabled={bulkMut.isPending}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-medium border border-emerald-500/30 flex items-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Aktifkan QR
              </button>
              <button
                onClick={() =>
                  bulkMut.mutate({ ids: Array.from(selected), enabled: false })
                }
                disabled={bulkMut.isPending}
                className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 text-xs font-medium border border-rose-500/30 flex items-center gap-1"
              >
                <XCircle className="w-3.5 h-3.5" />
                Nonaktifkan QR
              </button>
            </div>
          </div>
        )}

        {/* Stats bar */}
        <div className="px-4 py-2 bg-surface-muted/40 text-xs text-text-muted flex flex-wrap gap-4">
          <span>{filteredStudents.length} {roleFilter === 'staff' ? 'guru/staff' : roleFilter === 'employee' ? 'siswa' : 'orang'}</span>
          <span className="text-emerald-400">{enabledCount} aktif QR</span>
          <span className="text-rose-400">{filteredStudents.length - enabledCount} nonaktif</span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/40 text-text-muted text-2xs uppercase font-mono">
              <tr>
                <th className="px-4 py-2.5 text-left">
                  <input
                    type="checkbox"
                    checked={selected.size === filteredStudents.length && filteredStudents.length > 0}
                    onChange={toggleAll}
                    className="accent-primary-500"
                  />
                </th>
                <th className="px-4 py-2.5 text-left">Nama</th>
                <th className="px-4 py-2.5 text-left">NIS / NIP</th>
                <th className="px-4 py-2.5 text-left">Kelas / Jabatan</th>
                <th className="px-4 py-2.5 text-center">Status QR</th>
                <th className="px-4 py-2.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {studentsLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                    Memuat daftar...
                  </td>
                </tr>
              )}
              {!studentsLoading && filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                    Tidak ada data.
                  </td>
                </tr>
              )}
              {filteredStudents.map((s) => (
                <tr
                  key={s.user_id}
                  className="border-t border-surface-border hover:bg-surface-overlay/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(s.user_id)}
                      onChange={() => toggleOne(s.user_id)}
                      className="accent-primary-500"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">{s.full_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {s.employee_id}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {s.school_class_name ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.qr_enabled ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" />
                        AKTIF
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-mono bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        <XCircle className="w-3 h-3" />
                        NONAKTIF
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <QrViewBtn userId={s.user_id} hasToken={s.has_qr_token} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function QrViewBtn({ userId, hasToken }: { userId: number; hasToken: boolean }) {
  const [open, setOpen] = useState(false);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadQr = async () => {
    setLoading(true);
    try {
      const accessToken = useAuthStore.getState().accessToken;
      const r = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? '/api/v1'}/attendance-mode/qr/${userId}/png`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!r.ok) throw new Error('Gagal load QR');
      const blob = await r.blob();
      setImgUrl(URL.createObjectURL(blob));
    } catch (e) {
      toast.error('Gagal memuat QR');
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  if (!hasToken) {
    return <span className="text-2xs text-text-muted">Belum ada QR</span>;
  }
  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          if (!imgUrl) loadQr();
        }}
        className="px-2.5 py-1 rounded-md bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 text-xs border border-primary-500/30 inline-flex items-center gap-1"
      >
        <QrCode className="w-3 h-3" />
        Lihat QR
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-surface-base/80 backdrop-blur-md" />
          <div
            className="relative bg-white rounded-2xl p-6 max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {loading && <div className="aspect-square flex items-center justify-center text-gray-500">Memuat QR...</div>}
            {imgUrl && (
              <img
                src={imgUrl}
                alt="QR Code"
                className="w-full h-auto"
              />
            )}
            <button
              onClick={() => setOpen(false)}
              className="mt-4 w-full py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </>
  );
}
