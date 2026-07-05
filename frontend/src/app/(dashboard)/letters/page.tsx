'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Award,
  Calendar,
  Download,
  FileText,
  Loader2,
  Mail,
  Plus,
  Search,
  Send,
  ShieldAlert,
  Stethoscope,
  X,
} from 'lucide-react';
import api, { type Envelope, getErrorMessage } from '@/lib/api';
import {
  fetchLetterTypes,
  fetchLetters,
  issueLetter,
  type LetterType,
} from '@/lib/letterApi';
import { formatDate } from '@/lib/utils';

interface UserLite {
  id: number;
  full_name: string;
  employee_id: string;
}

const TYPE_ICONS: Record<LetterType, typeof FileText> = {
  keterangan_aktif: FileText,
  kelakuan_baik: Award,
  panggilan_ortu: ShieldAlert,
  sehat_jasmani: Stethoscope,
  rekomendasi: Mail,
};

const TYPE_LABELS: Record<LetterType, string> = {
  keterangan_aktif: 'Keterangan Aktif',
  kelakuan_baik: 'Kelakuan Baik',
  panggilan_ortu: 'Panggilan Ortu',
  sehat_jasmani: 'Sehat Jasmani',
  rekomendasi: 'Rekomendasi',
};

export default function LettersPage() {
  const qc = useQueryClient();
  const [openIssue, setOpenIssue] = useState(false);

  const { data: types = [] } = useQuery({
    queryKey: ['letter-types'],
    queryFn: fetchLetterTypes,
  });

  const { data: letters = [], isLoading } = useQuery({
    queryKey: ['letters'],
    queryFn: () => fetchLetters(),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-5 h-5 role-accent-text" />
            <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
              Administrasi
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-display-md font-bold">Surat Otomatis</h1>
          <p className="font-body text-text-muted mt-1">
            Generate PDF surat keterangan, kelakuan baik, panggilan ortu, dst dengan nomor urut otomatis & TTD kepala sekolah.
          </p>
        </div>
        <button
          onClick={() => setOpenIssue(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Terbitkan Surat Baru
        </button>
      </div>

      {/* Quick reference */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {types.map((t) => {
          const Icon = TYPE_ICONS[t.value];
          return (
            <div key={t.value} className="rounded-xl border border-surface-border bg-surface-muted p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4 text-primary-400" />
                <p className="font-display font-semibold">{t.label}</p>
              </div>
              <p className="text-xs text-text-muted">{t.for}</p>
            </div>
          );
        })}
      </div>

      {/* History */}
      <div>
        <p className="font-display font-semibold mb-3">Riwayat Surat</p>
        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary-400" />
          </div>
        ) : letters.length === 0 ? (
          <div className="rounded-xl border border-dashed border-surface-border p-10 text-center">
            <FileText className="w-10 h-10 text-text-muted mx-auto mb-2 opacity-50" />
            <p className="font-display font-semibold">Belum ada surat diterbitkan</p>
          </div>
        ) : (
          <div className="space-y-2">
            {letters.map((l) => {
              const Icon = TYPE_ICONS[l.letter_type];
              return (
                <div key={l.id} className="rounded-xl border border-surface-border bg-surface-muted p-3 sm:p-4 flex items-start gap-3 flex-wrap">
                  <div className="w-10 h-10 rounded-lg bg-primary-500/10 text-primary-400 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold">{TYPE_LABELS[l.letter_type]}</p>
                    <p className="font-mono text-2xs text-text-muted">No. {l.serial_number}</p>
                    <p className="text-sm text-text-secondary mt-1">
                      Untuk: <strong>{l.student_name}</strong>
                    </p>
                    {l.purpose && <p className="text-xs text-text-muted mt-0.5">Keperluan: {l.purpose}</p>}
                    <p className="text-2xs text-text-muted mt-1">
                      <Calendar className="inline w-3 h-3 mr-1" />
                      {formatDate(l.issued_at)} · oleh {l.issued_by_name ?? '—'}
                    </p>
                  </div>
                  {l.file_url && (
                    <a
                      href={l.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500/15 hover:bg-primary-500/25 text-primary-300 border border-primary-500/40 text-xs font-semibold"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PDF
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {openIssue && (
        <IssueLetterModal
          types={types.map((t) => ({ value: t.value, label: t.label }))}
          onClose={() => setOpenIssue(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['letters'] });
            setOpenIssue(false);
          }}
        />
      )}
    </div>
  );
}

function IssueLetterModal({
  types,
  onClose,
  onSaved,
}: {
  types: Array<{ value: LetterType; label: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [letterType, setLetterType] = useState<LetterType>('keterangan_aktif');
  const [studentQuery, setStudentQuery] = useState('');
  const [studentId, setStudentId] = useState<number | null>(null);
  const [studentName, setStudentName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [schoolYear, setSchoolYear] = useState('2025/2026');
  const [meetingDate, setMeetingDate] = useState('');

  const { data: searchResults = [] } = useQuery({
    queryKey: ['student-search', studentQuery],
    queryFn: async () => {
      if (studentQuery.trim().length < 2) return [];
      const r = await api.get<Envelope<UserLite[]>>('/users', {
        params: { role: 'employee', q: studentQuery.trim(), per_page: 8 },
      });
      return r.data.data ?? [];
    },
    enabled: studentQuery.trim().length >= 2,
  });

  const m = useMutation({
    mutationFn: () =>
      issueLetter({
        letter_type: letterType,
        student_id: studentId!,
        purpose: purpose || undefined,
        school_year: schoolYear || undefined,
        meeting_date: letterType === 'panggilan_ortu' && meetingDate ? meetingDate : undefined,
      }),
    onSuccess: (res) => {
      toast.success(`Surat ${res.serial_number} dibuat`);
      // Auto-open PDF
      if (res.file_url) {
        window.open(res.file_url, '_blank');
      }
      onSaved();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-surface-base/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-surface-border bg-surface-raised">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <p className="font-display font-bold">Terbitkan Surat Baru</p>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-xs text-text-secondary">Jenis Surat</label>
            <select value={letterType} onChange={(e) => setLetterType(e.target.value as LetterType)} className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm">
              {types.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-text-secondary">Cari Siswa (NIS atau Nama)</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                value={studentQuery}
                onChange={(e) => {
                  setStudentQuery(e.target.value);
                  setStudentId(null);
                  setStudentName('');
                }}
                placeholder="Mulai ketik..."
                className="w-full mt-1 pl-9 pr-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm"
              />
            </div>
            {studentId ? (
              <div className="mt-2 px-3 py-2 rounded-lg border border-success/40 bg-success/5 text-sm flex items-center justify-between">
                <span>✓ {studentName}</span>
                <button onClick={() => { setStudentId(null); setStudentName(''); setStudentQuery(''); }} className="text-text-muted">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              searchResults.length > 0 && (
                <div className="mt-1 border border-surface-border rounded-lg bg-surface-base max-h-40 overflow-y-auto">
                  {searchResults.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        setStudentId(u.id);
                        setStudentName(u.full_name);
                        setStudentQuery('');
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-surface-raised border-b border-surface-border last:border-b-0"
                    >
                      <p className="font-medium">{u.full_name}</p>
                      <p className="text-2xs text-text-muted font-mono">NIS {u.employee_id}</p>
                    </button>
                  ))}
                </div>
              )
            )}
          </div>

          <div>
            <label className="text-xs text-text-secondary">Keperluan</label>
            <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Contoh: Pendaftaran beasiswa KIP-K" className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm" />
          </div>

          {letterType === 'keterangan_aktif' && (
            <div>
              <label className="text-xs text-text-secondary">Tahun Ajaran</label>
              <input value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)} placeholder="2025/2026" className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm" />
            </div>
          )}

          {letterType === 'panggilan_ortu' && (
            <div>
              <label className="text-xs text-text-secondary">Tanggal Pertemuan</label>
              <input
                type="datetime-local"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm"
              />
            </div>
          )}

          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 text-xs text-cyan-200/90">
            <p>📄 Surat akan otomatis di-generate sebagai PDF dengan:</p>
            <ul className="list-disc pl-4 mt-1 space-y-0.5">
              <li>Nomor urut otomatis (format: NNNN/KODE/MM/YYYY)</li>
              <li>Header sekolah & TTD kepala sekolah</li>
              <li>Data siswa diisi otomatis dari profil</li>
            </ul>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-3 py-2 text-sm text-text-muted">Batal</button>
          <button
            onClick={() => m.mutate()}
            disabled={!studentId || m.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Terbitkan
          </button>
        </div>
      </div>
    </div>
  );
}
