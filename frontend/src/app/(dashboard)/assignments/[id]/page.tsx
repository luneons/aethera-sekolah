'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Download,
  FileSpreadsheet,
  Save,
  Upload,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import {
  downloadGradesTemplate,
  fetchAssignment,
  fetchGrades,
  importCommitGrades,
  importPreviewGrades,
  saveGradesBulk,
  type CsvPreview,
} from '@/lib/lmsApi';
import api, { getErrorMessage, type Envelope } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Student {
  id: number;
  full_name: string;
  employee_id: string;
  photo_url: string | null;
  school_class_id: number | null;
}

/**
 * Detail tugas — input nilai manual atau import CSV/XLSX.
 *
 * Tampilan: list semua siswa kelas target, kolom nilai bisa di-edit
 * langsung. Atau klik "Import CSV/XLSX" untuk upload + preview + commit.
 */
export default function AssignmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const assignmentId = Number(params.id);

  const [grades, setGrades] = useState<Record<number, { score: string; note: string }>>(
    {}
  );
  const [importOpen, setImportOpen] = useState(false);

  const { data: asg, isLoading: loadingAsg } = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: () => fetchAssignment(assignmentId),
    enabled: assignmentId > 0,
  });

  const { data: existingGrades = [], isLoading: loadingGrades } = useQuery({
    queryKey: ['assignment-grades', assignmentId],
    queryFn: () => fetchGrades(assignmentId),
    enabled: assignmentId > 0,
  });

  const { data: students = [] } = useQuery<Student[]>({
    queryKey: ['students-in-class', asg?.school_class_id],
    queryFn: async () => {
      if (!asg?.school_class_id) return [];
      const r = await api.get<Envelope<Student[]>>(
        `/users?per_page=200&show_all=true`
      );
      return (r.data.data ?? []).filter(
        (u: any) => u.school_class?.id === asg.school_class_id && u.role === 'employee'
      ) as Student[];
    },
    enabled: !!asg?.school_class_id,
  });

  // Sync existing grades ke state lokal
  useEffect(() => {
    const initial: Record<number, { score: string; note: string }> = {};
    for (const g of existingGrades) {
      initial[g.student_id] = {
        score: String(g.score),
        note: g.note ?? '',
      };
    }
    setGrades(initial);
  }, [existingGrades]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = Object.entries(grades)
        .filter(([_, v]) => v.score.trim() !== '')
        .map(([studentId, v]) => ({
          student_id: Number(studentId),
          score: Number(v.score.replace(',', '.')),
          note: v.note || undefined,
        }));
      return saveGradesBulk(assignmentId, payload);
    },
    onSuccess: (res) => {
      const data = res.data;
      const saved = data?.saved ?? 0;
      const skipped = data?.skipped ?? 0;
      if (skipped > 0) {
        toast.warning(`${saved} disimpan, ${skipped} dilewati`, {
          description: data?.errors?.[0],
        });
      } else {
        toast.success(`${saved} nilai disimpan`);
      }
      queryClient.invalidateQueries({ queryKey: ['assignment-grades', assignmentId] });
      queryClient.invalidateQueries({ queryKey: ['assignment', assignmentId] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['discipline-students'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (loadingAsg) {
    return (
      <p className="text-center font-body text-text-muted py-24">Memuat tugas...</p>
    );
  }

  if (!asg) {
    return (
      <div className="space-y-4">
        <p className="font-display text-xl text-text-secondary text-center py-12">
          Tugas tidak ditemukan
        </p>
        <div className="flex justify-center">
          <Link href="/assignments">
            <Button variant="outline" leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Kembali
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary-400 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali ke daftar tugas
      </button>

      {/* Hero */}
      <Card padding="lg" variant="glass">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mb-1">
              {asg.subject_code} · {asg.school_class_name} · {asg.assignment_type.toUpperCase()}
            </p>
            <h1 className="font-display text-2xl sm:text-display-md font-bold">
              {asg.title}
            </h1>
            {asg.description && (
              <p className="font-body text-sm text-text-secondary mt-2">{asg.description}</p>
            )}
            <div className="flex items-center gap-3 mt-3 font-mono text-2xs text-text-muted flex-wrap">
              <span>Nilai maks: {asg.max_score}</span>
              <span>·</span>
              <span>Bobot: {asg.weight}x</span>
              {asg.due_date && (
                <>
                  <span>·</span>
                  <span>Deadline: {asg.due_date}</span>
                </>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">
              Sudah dinilai
            </p>
            <p className="font-display text-3xl font-bold text-primary-300">
              {asg.graded_count}
              <span className="text-base text-text-muted ml-1">/ {asg.student_count}</span>
            </p>
            {asg.avg_score !== null && asg.avg_score !== undefined && (
              <p className="font-mono text-2xs text-text-muted mt-1">
                Rata-rata {asg.avg_score.toFixed(1)}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {asg.mode === 'quiz' ? (
          <>
            <Link
              href={`/assignments/${assignmentId}/quiz-edit`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Edit Soal Quiz
            </Link>
            <Link
              href={`/assignments/${assignmentId}/proctor`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-border text-sm hover:bg-surface-raised"
            >
              <AlertTriangle className="w-4 h-4" />
              Proctor (Pantau)
            </Link>
            <span className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/40 font-mono text-2xs uppercase tracking-widest font-bold">
              QUIZ ONLINE · {asg.duration_minutes ?? '∞'} mnt
            </span>
          </>
        ) : (
          <>
            <Button
              isLoading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              leftIcon={<Save className="w-4 h-4" />}
            >
              Simpan Semua Nilai
            </Button>
            <Button
              variant="outline"
              leftIcon={<Upload className="w-4 h-4" />}
              onClick={() => setImportOpen(true)}
            >
              Import CSV / XLSX
            </Button>
            <Button
              variant="ghost"
              leftIcon={<Download className="w-4 h-4" />}
              onClick={() =>
                downloadGradesTemplate(
                  assignmentId,
                  `template_${asg.title.replace(/\s+/g, '_')}.csv`
                )
              }
            >
              Download Template
            </Button>
          </>
        )}
      </div>

      {/* Grades table */}
      <Card padding="none" className="overflow-hidden">
        {loadingGrades ? (
          <p className="text-center font-body text-text-muted py-12">Memuat siswa...</p>
        ) : students.length === 0 ? (
          <p className="text-center font-body text-text-muted py-12">
            Tidak ada siswa di kelas ini.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-muted border-b border-surface-border">
                <tr>
                  <Th>NIS</Th>
                  <Th>Nama</Th>
                  <Th className="w-32">Nilai (0-{asg.max_score})</Th>
                  <Th>Catatan</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {students.map((s) => {
                  const v = grades[s.id] ?? { score: '', note: '' };
                  const numScore = Number(v.score.replace(',', '.'));
                  const invalid =
                    v.score.trim() !== '' &&
                    (Number.isNaN(numScore) || numScore < 0 || numScore > asg.max_score);
                  return (
                    <tr key={s.id} className="hover:bg-surface-muted/40">
                      <td className="px-3 py-2 font-mono text-xs text-text-muted">
                        {s.employee_id}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar name={s.full_name} src={s.photo_url ?? undefined} size="xs" />
                          <span className="font-body text-sm">{s.full_name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={v.score}
                          onChange={(e) =>
                            setGrades({
                              ...grades,
                              [s.id]: { ...v, score: e.target.value },
                            })
                          }
                          className={cn(
                            'w-24 bg-surface-raised border rounded-md px-2 py-1.5 text-sm font-mono text-text-primary outline-none focus:ring-2',
                            invalid
                              ? 'border-danger/60 focus:ring-danger/30'
                              : 'border-surface-border focus:border-primary-500 focus:ring-primary-500/30'
                          )}
                          placeholder="—"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={v.note}
                          onChange={(e) =>
                            setGrades({
                              ...grades,
                              [s.id]: { ...v, note: e.target.value },
                            })
                          }
                          className="w-full bg-surface-raised border border-surface-border rounded-md px-2 py-1.5 text-sm text-text-primary outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
                          placeholder="opsional"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        assignmentId={assignmentId}
        maxScore={asg.max_score}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['assignment-grades', assignmentId] });
          queryClient.invalidateQueries({ queryKey: ['assignment', assignmentId] });
          queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
          queryClient.invalidateQueries({ queryKey: ['discipline-students'] });
        }}
      />
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'text-left px-3 py-2.5 font-mono text-2xs text-text-muted uppercase tracking-widest',
        className
      )}
    >
      {children}
    </th>
  );
}

function ImportModal({
  open,
  onClose,
  assignmentId,
  maxScore,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  assignmentId: number;
  maxScore: number;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Pilih file dulu');
      return importPreviewGrades(assignmentId, file);
    },
    onSuccess: (res) => {
      setPreview(res.data ?? null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Pilih file dulu');
      return importCommitGrades(assignmentId, file);
    },
    onSuccess: (res) => {
      const d = res.data;
      toast.success(`${d?.saved ?? 0} nilai diimpor, ${d?.skipped ?? 0} dilewati`);
      onSuccess();
      handleClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleClose = () => {
    setFile(null);
    setPreview(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Import Nilai dari CSV / XLSX" size="xl">
      {!preview ? (
        <div className="space-y-4">
          <Card padding="md" className="bg-primary-500/5 border-primary-500/30">
            <p className="font-mono text-2xs uppercase tracking-widest text-primary-300 mb-2">
              Format File yang Diharapkan
            </p>
            <table className="w-full text-sm font-mono">
              <thead className="text-text-muted">
                <tr>
                  <td className="py-1 pr-3">Kolom A</td>
                  <td className="py-1 pr-3">Kolom B</td>
                  <td className="py-1 pr-3">Kolom C</td>
                  <td className="py-1">Kolom D</td>
                </tr>
              </thead>
              <tbody className="text-text-secondary">
                <tr className="border-t border-surface-border">
                  <td className="py-1 pr-3 font-bold">nis</td>
                  <td className="py-1 pr-3 font-bold">nama</td>
                  <td className="py-1 pr-3 font-bold">nilai</td>
                  <td className="py-1">catatan</td>
                </tr>
                <tr className="text-2xs text-text-muted">
                  <td className="py-1 pr-3">2024XXXX</td>
                  <td className="py-1 pr-3">Nama Siswa</td>
                  <td className="py-1 pr-3">0-{maxScore}</td>
                  <td className="py-1">opsional</td>
                </tr>
              </tbody>
            </table>
            <p className="font-body text-xs text-text-secondary mt-2">
              Header bisa dilewati. Nilai bisa pakai koma atau titik (85,5 atau 85.5).
              Hanya baris dengan NIS yang ada di kelas ini akan diterima.
            </p>
          </Card>

          <div>
            <label className="block font-body text-sm font-medium text-text-secondary mb-1.5">
              Pilih file CSV atau XLSX
            </label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-text-secondary file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-500/15 file:text-primary-300 hover:file:bg-primary-500/25"
            />
            {file && (
              <p className="font-mono text-2xs text-text-muted mt-1">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={handleClose}>
              Batal
            </Button>
            <Button
              isLoading={previewMutation.isPending}
              disabled={!file}
              onClick={() => previewMutation.mutate()}
              leftIcon={<FileSpreadsheet className="w-4 h-4" />}
            >
              Preview
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Card padding="sm" className="bg-surface-base/40">
              <p className="font-mono text-2xs uppercase tracking-widest text-text-muted">
                Total Baris
              </p>
              <p className="font-display font-bold text-2xl">{preview.total_rows}</p>
            </Card>
            <Card padding="sm" className="bg-success/5 border-success/30">
              <p className="font-mono text-2xs uppercase tracking-widest text-success">
                Valid
              </p>
              <p className="font-display font-bold text-2xl text-success">
                {preview.valid_rows}
              </p>
            </Card>
            <Card padding="sm" className="bg-rose-500/5 border-rose-500/30">
              <p className="font-mono text-2xs uppercase tracking-widest text-rose-400">
                Bermasalah
              </p>
              <p className="font-display font-bold text-2xl text-rose-400">
                {preview.invalid_rows}
              </p>
            </Card>
          </div>

          <Card padding="none" className="overflow-hidden">
            <div className="overflow-x-auto max-h-80">
              <table className="w-full">
                <thead className="bg-surface-muted border-b border-surface-border sticky top-0">
                  <tr>
                    <Th>#</Th>
                    <Th>Status</Th>
                    <Th>NIS</Th>
                    <Th>Nama</Th>
                    <Th>Nilai</Th>
                    <Th>Catatan</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {preview.rows.slice(0, 50).map((r) => (
                    <tr
                      key={r.row_num}
                      className={cn(
                        'text-sm',
                        !r.valid && 'bg-rose-500/5',
                        r.valid && r.error && 'bg-amber-500/5'
                      )}
                    >
                      <td className="px-3 py-1.5 font-mono text-2xs text-text-muted">
                        {r.row_num}
                      </td>
                      <td className="px-3 py-1.5">
                        {r.valid ? (
                          <span className="inline-flex items-center gap-1 text-success font-mono text-2xs">
                            <Check className="w-3 h-3" /> OK
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-rose-400 font-mono text-2xs"
                            title={r.error ?? ''}
                          >
                            <X className="w-3 h-3" /> {r.error}
                          </span>
                        )}
                        {r.valid && r.error && (
                          <span
                            className="inline-flex items-center gap-1 text-amber-400 font-mono text-2xs ml-1"
                            title={r.error}
                          >
                            <AlertTriangle className="w-3 h-3" />
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs">{r.nis ?? '—'}</td>
                      <td className="px-3 py-1.5">{r.nama ?? r.student_name_db ?? '—'}</td>
                      <td className="px-3 py-1.5 font-mono">{r.nilai ?? '—'}</td>
                      <td className="px-3 py-1.5 text-text-muted">{r.catatan ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.rows.length > 50 && (
              <p className="font-mono text-2xs text-text-muted text-center py-2 border-t border-surface-border">
                Menampilkan 50 dari {preview.rows.length} baris
              </p>
            )}
          </Card>

          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setPreview(null)}>
              Pilih File Lain
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleClose}>
                Batal
              </Button>
              <Button
                isLoading={commitMutation.isPending}
                disabled={preview.valid_rows === 0}
                onClick={() => commitMutation.mutate()}
                leftIcon={<Save className="w-4 h-4" />}
              >
                Simpan {preview.valid_rows} Nilai Valid
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
