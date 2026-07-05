'use client';

import { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Info,
  Eye,
  RotateCcw,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/lib/api';
import {
  csvPreview,
  csvCommit,
  csvTemplateUrl,
  type CsvPreviewOut,
} from '@/lib/attendanceModeApi';

export default function AttendanceImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreviewOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [overwrite, setOverwrite] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  const onPickFile = (f: File) => {
    if (!f.name.endsWith('.csv')) {
      toast.error('File harus .csv');
      return;
    }
    setFile(f);
    setPreview(null);
    setResult(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onPickFile(f);
  };

  const doPreview = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await csvPreview(file);
      setPreview(r);
      toast.success(`${r.valid_rows} baris valid dari ${r.total_rows}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const doCommit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await csvCommit(file, overwrite);
      setResult(r);
      toast.success(`${r.created} baru • ${r.updated} update • ${r.skipped} dilewati`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const downloadTemplate = async () => {
    try {
      const accessToken = (await import('@/stores/useAuthStore')).useAuthStore.getState()
        .accessToken;
      const r = await fetch(csvTemplateUrl(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'template_absensi.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error('Gagal download template');
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-primary-400" />
          Import Absensi (CSV)
        </h1>
        <p className="text-text-muted text-sm mt-1">
          Upload file CSV berisi data absensi banyak siswa sekaligus
        </p>
      </div>

      {/* Format guide */}
      <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 sm:p-5 space-y-3">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-semibold text-blue-400">Format CSV</h3>
            <p className="text-xs text-text-muted mt-1">
              Kolom wajib: <code className="text-blue-400">NIS</code>,{' '}
              <code className="text-blue-400">Tanggal</code>,{' '}
              <code className="text-blue-400">Status</code>. Kolom opsional:{' '}
              <code className="text-text-secondary">Jam_Masuk</code>,{' '}
              <code className="text-text-secondary">Jam_Pulang</code>,{' '}
              <code className="text-text-secondary">Catatan</code>.
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-surface-base/60 border border-surface-border p-3 overflow-x-auto">
          <table className="w-full text-2xs font-mono">
            <thead>
              <tr className="text-text-muted">
                <th className="text-left py-1 pr-3">NIS</th>
                <th className="text-left py-1 pr-3">Tanggal</th>
                <th className="text-left py-1 pr-3">Status</th>
                <th className="text-left py-1 pr-3">Jam_Masuk</th>
                <th className="text-left py-1 pr-3">Jam_Pulang</th>
                <th className="text-left py-1">Catatan</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              <tr className="border-t border-surface-border/40">
                <td className="py-1 pr-3">20240099</td>
                <td className="py-1 pr-3">2026-05-28</td>
                <td className="py-1 pr-3 text-emerald-400">present</td>
                <td className="py-1 pr-3">07:15</td>
                <td className="py-1 pr-3">14:00</td>
                <td className="py-1">Hadir tepat waktu</td>
              </tr>
              <tr className="border-t border-surface-border/40">
                <td className="py-1 pr-3">20240100</td>
                <td className="py-1 pr-3">2026-05-28</td>
                <td className="py-1 pr-3 text-amber-400">late</td>
                <td className="py-1 pr-3">07:45</td>
                <td className="py-1 pr-3">14:00</td>
                <td className="py-1">Terlambat 15 menit</td>
              </tr>
              <tr className="border-t border-surface-border/40">
                <td className="py-1 pr-3">20240101</td>
                <td className="py-1 pr-3">2026-05-28</td>
                <td className="py-1 pr-3 text-rose-400">absent</td>
                <td className="py-1 pr-3"></td>
                <td className="py-1 pr-3"></td>
                <td className="py-1">Tanpa keterangan</td>
              </tr>
              <tr className="border-t border-surface-border/40">
                <td className="py-1 pr-3">20240102</td>
                <td className="py-1 pr-3">2026-05-28</td>
                <td className="py-1 pr-3 text-violet-400">excused</td>
                <td className="py-1 pr-3"></td>
                <td className="py-1 pr-3"></td>
                <td className="py-1">Sakit (surat dokter)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-2 text-2xs">
          <Tag color="emerald">present = hadir tepat waktu</Tag>
          <Tag color="amber">late = terlambat</Tag>
          <Tag color="rose">absent = tidak hadir</Tag>
          <Tag color="violet">excused = izin/sakit</Tag>
          <Tag color="text-muted">holiday = hari libur</Tag>
        </div>

        <button
          onClick={downloadTemplate}
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:underline"
        >
          <Download className="w-3.5 h-3.5" />
          Download template kosong
        </button>
      </div>

      {/* Drop zone */}
      {!preview && !result && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={cn(
            'rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all',
            dragOver
              ? 'border-primary-500 bg-primary-500/10'
              : 'border-surface-border bg-surface-raised hover:border-primary-500/40'
          )}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onPickFile(e.target.files[0])}
          />
          <Upload className="w-12 h-12 text-text-muted mx-auto mb-3" />
          {file ? (
            <>
              <p className="font-medium text-sm">{file.name}</p>
              <p className="text-2xs text-text-muted mt-1">
                {(file.size / 1024).toFixed(1)} KB • Klik untuk ganti
              </p>
            </>
          ) : (
            <>
              <p className="font-display font-semibold">Drag & drop file CSV di sini</p>
              <p className="text-xs text-text-muted mt-1">atau klik untuk pilih file</p>
            </>
          )}
        </div>
      )}

      {/* Action buttons */}
      {file && !result && (
        <div className="flex flex-wrap gap-2">
          {!preview ? (
            <button
              onClick={doPreview}
              disabled={busy}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium text-sm shadow-glow-primary disabled:opacity-50"
            >
              <Eye className="w-4 h-4" />
              {busy ? 'Memeriksa...' : 'Preview Data'}
            </button>
          ) : (
            <button
              onClick={doCommit}
              disabled={busy || preview.valid_rows === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-medium text-sm disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {busy ? 'Menyimpan...' : `Commit (${preview.valid_rows} baris)`}
            </button>
          )}
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2.5 border border-surface-border text-text-secondary rounded-xl font-medium text-sm hover:bg-surface-overlay"
          >
            <RotateCcw className="w-4 h-4" />
            Ganti file
          </button>
          {preview && (
            <label className="ml-auto flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                className="accent-primary-500"
              />
              Overwrite jika data sudah ada
            </label>
          )}
        </div>
      )}

      {/* Preview stats */}
      {preview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total Baris"
            value={preview.total_rows}
            icon={FileText}
            color="text-text-primary"
          />
          <StatCard
            label="Valid"
            value={preview.valid_rows}
            icon={CheckCircle2}
            color="text-emerald-400"
          />
          <StatCard
            label="Akan Dibuat"
            value={preview.will_create}
            icon={CheckCircle2}
            color="text-blue-400"
          />
          <StatCard
            label={overwrite ? 'Akan Diupdate' : 'Akan Dilewati'}
            value={preview.will_overwrite}
            icon={AlertCircle}
            color="text-amber-400"
          />
        </div>
      )}

      {/* Preview table */}
      {preview && (
        <div className="rounded-2xl border border-surface-border bg-surface-raised overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
            <h3 className="font-display font-semibold text-sm">Preview Data</h3>
            <span className="text-2xs text-text-muted">
              Menampilkan max 300 baris pertama
            </span>
          </div>
          <div className="overflow-x-auto max-h-[480px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-muted/80 backdrop-blur text-text-muted text-2xs uppercase font-mono">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">NIS</th>
                  <th className="px-3 py-2 text-left">Nama</th>
                  <th className="px-3 py-2 text-left">Tanggal</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-center">Masuk</th>
                  <th className="px-3 py-2 text-center">Pulang</th>
                  <th className="px-3 py-2 text-left">Validasi</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr
                    key={r.row_num}
                    className={cn(
                      'border-t border-surface-border',
                      !r.valid && 'bg-rose-500/5',
                      r.will_overwrite && 'bg-amber-500/5'
                    )}
                  >
                    <td className="px-3 py-2 font-mono text-text-muted">{r.row_num}</td>
                    <td className="px-3 py-2 font-mono">{r.nis ?? '-'}</td>
                    <td className="px-3 py-2 truncate max-w-[180px]">
                      {r.matched_name ?? <span className="text-text-muted">-</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.tanggal ?? '-'}</td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-xs">
                      {r.jam_masuk ?? '-'}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-xs">
                      {r.jam_pulang ?? '-'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.valid ? (
                        r.will_overwrite ? (
                          <span className="text-amber-400 inline-flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Akan diupdate
                          </span>
                        ) : (
                          <span className="text-emerald-400 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Akan dibuat
                          </span>
                        )
                      ) : (
                        <span className="text-rose-400 inline-flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          {r.error ?? 'Error'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            <div>
              <h2 className="font-display font-bold text-lg text-emerald-400">
                Import Berhasil
              </h2>
              <p className="text-xs text-text-muted">Data absensi sudah masuk ke sistem.</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <ResultStat label="Baru" value={result.created} color="text-emerald-400" />
            <ResultStat label="Diupdate" value={result.updated} color="text-amber-400" />
            <ResultStat label="Dilewati" value={result.skipped} color="text-text-muted" />
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs">
              <p className="font-semibold text-rose-400 mb-2">
                {result.errors.length} error:
              </p>
              <ul className="space-y-0.5 text-rose-300">
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i} className="font-mono">• {e}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={reset}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium text-sm"
          >
            <Upload className="w-4 h-4" />
            Upload Lagi
          </button>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Tag({
  children,
  color,
}: {
  children: React.ReactNode;
  color: 'emerald' | 'amber' | 'rose' | 'violet' | 'text-muted';
}) {
  const colorMap = {
    emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    rose: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    violet: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    'text-muted': 'bg-surface-muted text-text-muted border-surface-border',
  }[color];
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md font-mono border',
        colorMap
      )}
    >
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-text-muted">-</span>;
  const map: Record<string, string> = {
    present: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    late: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    absent: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    excused: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    holiday: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  };
  const cls = map[status] ?? 'bg-surface-muted text-text-muted border-surface-border';
  return (
    <span
      className={cn(
        'inline-block px-2 py-0.5 rounded-md text-2xs font-mono uppercase border',
        cls
      )}
    >
      {status}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof CheckCircle2;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-3">
      <div className="flex items-center gap-2 text-2xs text-text-muted font-mono uppercase mb-1">
        <Icon className={cn('w-3.5 h-3.5', color)} />
        {label}
      </div>
      <div className={cn('font-display font-bold text-2xl', color)}>{value}</div>
    </div>
  );
}

function ResultStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-surface-base border border-surface-border p-3 text-center">
      <div className="text-2xs text-text-muted uppercase font-mono">{label}</div>
      <div className={cn('font-display font-bold text-2xl mt-1', color)}>{value}</div>
    </div>
  );
}
