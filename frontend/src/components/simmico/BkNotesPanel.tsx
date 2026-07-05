'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  EyeOff,
  Pin,
  PinOff,
  Plus,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  addBkNote,
  deleteBkNote,
  fetchBkNotes,
  type BkNote,
} from '@/lib/disciplineApi';
import { getErrorMessage } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';

interface BkNotesPanelProps {
  studentId: number;
}

/**
 * Panel catatan privat BK — hanya muncul untuk hr & super_admin.
 * Catatan tidak terlihat oleh siswa, wali kelas lain, atau guru lain.
 */
export function BkNotesPanel({ studentId }: BkNotesPanelProps) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['bk-notes', studentId],
    queryFn: () => fetchBkNotes(studentId),
  });

  const addMutation = useMutation({
    mutationFn: () => addBkNote(studentId, body, pinned),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bk-notes', studentId] });
      queryClient.invalidateQueries({ queryKey: ['bk-cases'] });
      setBody('');
      setPinned(false);
      toast.success('Catatan ditambahkan');
    },
    onError: (err) =>
      toast.error('Gagal menambah catatan', { description: getErrorMessage(err) }),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: number) => deleteBkNote(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bk-notes', studentId] });
      queryClient.invalidateQueries({ queryKey: ['bk-cases'] });
      toast.success('Catatan dihapus');
    },
    onError: (err) =>
      toast.error('Gagal menghapus', { description: getErrorMessage(err) }),
  });

  return (
    <Card padding="lg" className="border-rose-500/30 bg-rose-500/5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <StickyNote className="w-4 h-4 text-rose-400" />
            <h3 className="font-display font-semibold text-base text-rose-300">
              Catatan Privat BK
            </h3>
          </div>
          <p className="flex items-center gap-1 font-mono text-2xs uppercase tracking-widest text-rose-400/80">
            <EyeOff className="w-3 h-3" /> Hanya guru BK & kepala sekolah
          </p>
        </div>
        <span className="font-mono text-2xs text-text-muted">
          {notes.length} catatan
        </span>
      </div>

      {/* New note form */}
      <div className="mb-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Tulis catatan kontekstual untuk handover atau intervensi..."
          className="w-full font-body text-sm bg-surface-base border border-surface-border rounded-lg px-3 py-2 outline-none focus:border-rose-500/60 focus:ring-2 focus:ring-rose-500/20"
        />
        <div className="flex items-center justify-between gap-2 mt-2">
          <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="rounded border-surface-border text-rose-500 focus:ring-rose-500/30 bg-surface-base"
            />
            <Pin className="w-3.5 h-3.5" />
            Pin ke atas
          </label>
          <Button
            size="sm"
            isLoading={addMutation.isPending}
            disabled={body.trim().length < 2}
            onClick={() => addMutation.mutate()}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Tambah Catatan
          </Button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="font-body text-sm text-text-muted text-center py-4">
          Memuat catatan...
        </p>
      ) : notes.length === 0 ? (
        <p className="font-body text-sm text-text-muted text-center py-4">
          Belum ada catatan untuk siswa ini.
        </p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
          {notes.map((n) => (
            <NoteRow key={n.id} note={n} onDelete={() => deleteMutation.mutate(n.id)} />
          ))}
        </div>
      )}
    </Card>
  );
}

function NoteRow({ note, onDelete }: { note: BkNote; onDelete: () => void }) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-surface-base/60 p-3 transition-colors',
        note.pinned ? 'border-rose-500/30' : 'border-surface-border'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {note.pinned ? (
            <Pin className="w-3 h-3 text-rose-400" />
          ) : (
            <PinOff className="w-3 h-3 text-text-muted" />
          )}
          <span className="font-display font-semibold text-sm text-text-primary">
            {note.author_name ?? '—'}
          </span>
          <span className="font-mono text-2xs text-text-muted">
            {formatDateTime(note.created_at)}
          </span>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="p-1 rounded text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          title="Hapus catatan"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="font-body text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
        {note.body}
      </p>
    </div>
  );
}
