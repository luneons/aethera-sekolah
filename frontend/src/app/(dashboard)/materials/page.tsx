'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Calendar,
  Download,
  FileText,
  Library,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { fetchSubjects, fetchMaterials, uploadMaterial, deleteMaterial } from '@/lib/lmsApi';
import { getErrorMessage } from '@/lib/api';
import api, { type Envelope } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface SchoolClass {
  id: number;
  name: string;
}

/**
 * Materi Pembelajaran — guru upload PDF/Word/PPT/dll.
 * - Guru lihat hanya material miliknya
 * - Kepsek lihat semua di sekolah
 */
export default function MaterialsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    subject_id: 0,
    school_class_id: 0,
  });
  const [file, setFile] = useState<File | null>(null);

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ['materials'],
    queryFn: () => fetchMaterials(),
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: fetchSubjects,
  });

  const { data: classes = [] } = useQuery<SchoolClass[]>({
    queryKey: ['school-classes-list'],
    queryFn: async () => {
      const r = await api.get<Envelope<SchoolClass[]>>('/org/school-classes');
      return r.data.data ?? [];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Pilih file dulu');
      if (!form.subject_id) throw new Error('Pilih mata pelajaran');
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('subject_id', String(form.subject_id));
      if (form.school_class_id) fd.append('school_class_id', String(form.school_class_id));
      if (form.description) fd.append('description', form.description);
      fd.append('file', file);
      return uploadMaterial(fd);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      toast.success('Materi berhasil diunggah');
      setOpen(false);
      setForm({ title: '', description: '', subject_id: 0, school_class_id: 0 });
      setFile(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMaterial(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      toast.success('Materi dihapus');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Library className="w-5 h-5 role-accent-text" />
            <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
              Pembelajaran
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-display-md font-bold">Materi Pelajaran</h1>
          <p className="font-body text-text-muted mt-1">
            Upload PDF, PPT, Word, atau video untuk diakses siswa kapanpun.
          </p>
        </div>
        <Button leftIcon={<Upload className="w-4 h-4" />} onClick={() => setOpen(true)}>
          Upload Materi
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center font-body text-text-muted py-12">Memuat...</p>
      ) : materials.length === 0 ? (
        <Card padding="lg" className="text-center">
          <FileText className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="font-display font-semibold">Belum ada materi</p>
          <p className="font-body text-sm text-text-muted mt-1">
            Upload materi pertama untuk dibagikan ke siswa.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {materials.map((m) => (
            <Card key={m.id} padding="md" className="flex flex-col">
              <div className="flex items-start gap-3 flex-1">
                <span className="inline-flex w-10 h-10 rounded-lg role-accent-bg-soft role-accent-text items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-text-primary line-clamp-2">
                    {m.title}
                  </p>
                  <p className="font-mono text-2xs text-text-muted mt-0.5">
                    {m.subject_name} · {m.school_class_name ?? 'Semua kelas'}
                  </p>
                  {m.description && (
                    <p className="font-body text-xs text-text-secondary mt-1 line-clamp-2">
                      {m.description}
                    </p>
                  )}
                  <p className="font-mono text-2xs text-text-muted mt-2 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {formatDate(m.created_at)}
                    {m.file_size && (
                      <span className="ml-2">
                        {(m.file_size / 1024).toFixed(0)} KB
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-surface-border">
                <a
                  href={m.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-md text-text-muted hover:text-primary-400 hover:bg-primary-500/10 transition-colors"
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  onClick={() => {
                    if (confirm(`Hapus materi "${m.title}"?`)) deleteMutation.mutate(m.id);
                  }}
                  className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Upload Materi" size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            uploadMutation.mutate();
          }}
          className="space-y-4"
        >
          <Input
            label="Judul"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Contoh: Ringkasan Bab 3 - Persamaan Linear"
          />
          <div>
            <label className="block font-body text-sm font-medium text-text-secondary mb-1.5">
              Mata Pelajaran *
            </label>
            <select
              required
              value={form.subject_id}
              onChange={(e) => setForm({ ...form, subject_id: Number(e.target.value) })}
              className="w-full bg-surface-raised border border-surface-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
            >
              <option value={0}>— Pilih —</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-body text-sm font-medium text-text-secondary mb-1.5">
              Kelas (opsional, kosong = semua kelas)
            </label>
            <select
              value={form.school_class_id}
              onChange={(e) =>
                setForm({ ...form, school_class_id: Number(e.target.value) })
              }
              className="w-full bg-surface-raised border border-surface-border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
            >
              <option value={0}>— Semua kelas —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-body text-sm font-medium text-text-secondary mb-1.5">
              Deskripsi (opsional)
            </label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full font-body text-sm bg-surface-raised border border-surface-border rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block font-body text-sm font-medium text-text-secondary mb-1.5">
              File (PDF, DOCX, PPT, Video, dll, max 50MB) *
            </label>
            <input
              type="file"
              required
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
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" isLoading={uploadMutation.isPending} disabled={!file}>
              Upload
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
