'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, GraduationCap, Pencil, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import {
  createSubject,
  deleteSubject,
  fetchSubjects,
  updateSubject,
  type Subject,
} from '@/lib/lmsApi';
import { getErrorMessage } from '@/lib/api';

/**
 * Manajemen mata pelajaran — kepsek/admin only.
 * Sederhana: kode + nama + deskripsi opsional.
 */
export default function SubjectsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [form, setForm] = useState({ code: '', name: '', description: '' });

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ['subjects'],
    queryFn: fetchSubjects,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? updateSubject(editing.id, form)
        : createSubject(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
      setOpen(false);
      setEditing(null);
      setForm({ code: '', name: '', description: '' });
      toast.success(editing ? 'Mata pelajaran diperbarui' : 'Mata pelajaran ditambahkan');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSubject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
      toast.success('Mata pelajaran dinonaktifkan');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ code: '', name: '', description: '' });
    setOpen(true);
  };

  const openEdit = (s: Subject) => {
    setEditing(s);
    setForm({ code: s.code, name: s.name, description: s.description || '' });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <GraduationCap className="w-5 h-5 role-accent-text" />
            <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
              Kurikulum
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-display-md font-bold">Mata Pelajaran</h1>
          <p className="font-body text-text-muted mt-1">
            Daftar mata pelajaran sekolah. Dipakai saat guru bikin tugas atau upload materi.
          </p>
        </div>
        <Button leftIcon={<Plus className="w-4 h-4" />} onClick={openCreate}>
          Tambah Mata Pelajaran
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center font-body text-text-muted py-12">Memuat...</p>
      ) : subjects.length === 0 ? (
        <Card padding="lg" className="text-center">
          <BookOpen className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="font-display font-semibold">Belum ada mata pelajaran</p>
          <p className="font-body text-sm text-text-muted mt-1">
            Tambahkan minimal satu mata pelajaran untuk mulai bikin tugas.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {subjects.map((s) => (
            <Card key={s.id} padding="md">
              <div className="flex items-start gap-3">
                <span className="inline-flex w-10 h-10 rounded-lg role-accent-bg-soft role-accent-text items-center justify-center shrink-0 font-mono font-bold">
                  {s.code}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-text-primary truncate">
                    {s.name}
                  </p>
                  <p className="font-mono text-2xs text-text-muted">{s.code}</p>
                  {s.description && (
                    <p className="font-body text-xs text-text-secondary mt-1.5 line-clamp-2">
                      {s.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-surface-border">
                <button
                  onClick={() => openEdit(s)}
                  className="p-1.5 rounded-md text-text-muted hover:text-primary-400 hover:bg-primary-500/10 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Nonaktifkan ${s.code} - ${s.name}?`))
                      deleteMutation.mutate(s.id);
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

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran'}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="space-y-4"
        >
          <Input
            label="Kode"
            placeholder="MTK, IPA, BIN, ..."
            required
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          />
          <Input
            label="Nama Mata Pelajaran"
            placeholder="Matematika, IPA, Bahasa Indonesia, ..."
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div>
            <label className="block font-body text-sm font-medium text-text-secondary mb-1.5">
              Deskripsi (opsional)
            </label>
            <textarea
              rows={3}
              className="w-full font-body text-sm text-text-primary bg-surface-raised border border-surface-border rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" isLoading={saveMutation.isPending}>
              Simpan
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
