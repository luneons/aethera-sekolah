'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import {
  commitImportStudents,
  downloadImportTemplate,
  previewImportStudents,
  type CommitOut,
  type PreviewOut,
} from '@/lib/importApi';
import { cn } from '@/lib/utils';

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewOut | null>(null);
  const [commitResult, setCommitResult] = useState<CommitOut | null>(null);
  const [autoCreateClass, setAutoCreateClass] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(true);

  const previewMutation = useMutation({
    mutationFn: () => previewImportStudents(file!),
    onSuccess: (res) => {
      setPreview(res);
      setCommitResult(null);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const commitMutation = useMutation({
    mutationFn: () =>
      commitImportStudents(file!, {
        auto_create_class: autoCreateClass,
        update_existing: updateExisting,
      }),
    onSuccess: (res) => {
      setCommitResult(res.data!);
      toast.success(res.message || 'Import selesai');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <FileSpreadsheet className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Onboarding
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Import Siswa Massal</h1>
        <p className="font-body text-text-muted mt-1">
          Upload Excel atau CSV. Sistem auto-detect kolom (nama, NIS, kelas, dll). Kelas baru
          akan dibuat otomatis kalau belum ada.
        </p>
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-muted p-5 space-y-4">
        <div>
          <p className="font-display font-semibold mb-2">Step 1: Siapkan file</p>
          <button
            onClick={downloadImportTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-border text-sm hover:bg-surface-raised"
          >
            <Download className="w-3.5 h-3.5" />
            Download Template CSV
          </button>
          <p className="text-xs text-text-muted mt-2">
            Kolom wajib: <code className="bg-surface-base px-1 rounded">Nama</code> dan{' '}
            <code className="bg-surface-base px-1 rounded">NIS</code>. Lainnya opsional.
          </p>
          <p className="text-2xs text-text-muted mt-1">
            Alias yang dikenali: nama / name / full_name · nis / employee_id · kelas / class · ortu_hp / parent_phone · email · password
          </p>
        </div>

        <div className="border-t border-surface-border pt-4">
          <p className="font-display font-semibold mb-2">Step 2: Upload</p>
          <label className="flex items-center justify-center gap-2 px-4 py-6 rounded-lg border-2 border-dashed border-surface-border bg-surface-base/40 cursor-pointer hover:border-primary-500/40">
            <Upload className="w-5 h-5 text-text-muted" />
            <span className="text-sm text-text-secondary">
              {file ? file.name : 'Pilih file CSV atau XLSX'}
            </span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setCommitResult(null);
              }}
              className="hidden"
            />
          </label>

          <div className="flex flex-wrap gap-3 mt-3 text-xs text-text-secondary">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={autoCreateClass} onChange={(e) => setAutoCreateClass(e.target.checked)} className="accent-primary-500" />
              Auto-buat kelas baru kalau belum ada
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} className="accent-primary-500" />
              Update siswa existing (NIS sama)
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => previewMutation.mutate()}
              disabled={!file || previewMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {previewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Preview
            </button>
            {preview && (
              <button
                onClick={() => commitMutation.mutate()}
                disabled={preview.valid_rows === 0 || commitMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-success hover:bg-success/90 text-white text-sm font-medium disabled:opacity-50"
              >
                {commitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Commit Import ({preview.valid_rows} baris valid)
              </button>
            )}
          </div>
        </div>
      </div>

      {commitResult && (
        <div className="rounded-xl border border-success/40 bg-success/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5 text-success" />
            <p className="font-display font-bold text-success">Import berhasil</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <Stat label="Siswa Baru" value={commitResult.created} tone="text-success" />
            <Stat label="Diupdate" value={commitResult.updated} tone="text-cyan-300" />
            <Stat label="Kelas Baru" value={commitResult.classes_created} tone="text-violet-300" />
            <Stat label="Dilewati" value={commitResult.skipped} tone="text-text-muted" />
          </div>
          {commitResult.errors.length > 0 && (
            <div className="text-xs text-rose-300 max-h-32 overflow-y-auto">
              <p className="font-semibold mb-1">Error:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {commitResult.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {preview && !commitResult && (
        <div className="rounded-xl border border-surface-border bg-surface-muted p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Total Baris" value={preview.total_rows} />
            <Stat label="Valid" value={preview.valid_rows} tone="text-success" />
            <Stat label="Bermasalah" value={preview.invalid_rows} tone="text-rose-400" />
            <Stat label="Kelas Baru" value={preview.new_classes.length} tone="text-violet-300" />
          </div>

          <div className="text-sm">
            <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mb-1">
              Kolom terdeteksi
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(preview.detected_columns).map((k) => (
                <span key={k} className="font-mono text-2xs uppercase tracking-wider px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30">
                  ✓ {k}
                </span>
              ))}
              {!preview.detected_columns.email && (
                <span className="font-mono text-2xs uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  ⚠ email auto-generate
                </span>
              )}
              {!preview.detected_columns.password && (
                <span className="font-mono text-2xs uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  ⚠ password auto-generate
                </span>
              )}
            </div>
          </div>

          {preview.new_classes.length > 0 && (
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
              <p className="text-xs text-violet-300 mb-1.5">
                <AlertTriangle className="inline w-3.5 h-3.5 mr-1" />
                Kelas yang akan dibuat otomatis:
              </p>
              <div className="flex flex-wrap gap-1">
                {preview.new_classes.map((c) => (
                  <span key={c} className="text-xs px-2 py-0.5 bg-violet-500/15 text-violet-200 rounded">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-surface-border text-left">
                <tr className="text-text-muted">
                  <th className="px-2 py-2">#</th>
                  <th className="px-2 py-2">NIS</th>
                  <th className="px-2 py-2">Nama</th>
                  <th className="px-2 py-2">Kelas</th>
                  <th className="px-2 py-2">HP Ortu</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.row_num} className="border-b border-surface-border/40">
                    <td className="px-2 py-1.5 font-mono">{r.row_num}</td>
                    <td className="px-2 py-1.5 font-mono">{r.employee_id}</td>
                    <td className="px-2 py-1.5">{r.full_name}</td>
                    <td className="px-2 py-1.5 font-mono text-2xs">{r.school_class_name ?? '—'}</td>
                    <td className="px-2 py-1.5 font-mono text-2xs">{r.parent_phone ?? '—'}</td>
                    <td className="px-2 py-1.5">
                      {r.error ? (
                        <span className="text-rose-400">{r.error}</span>
                      ) : r.is_update ? (
                        <span className="text-cyan-300">Update</span>
                      ) : (
                        <span className="text-success">Baru</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.total_rows > preview.rows.length && (
              <p className="text-2xs text-text-muted mt-2">
                Menampilkan {preview.rows.length} dari {preview.total_rows} baris
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg bg-surface-base/40 border border-surface-border p-3">
      <p className="text-2xs text-text-muted uppercase tracking-widest font-mono">{label}</p>
      <p className={cn('font-display font-bold text-2xl mt-1', tone ?? 'text-text-primary')}>{value}</p>
    </div>
  );
}
