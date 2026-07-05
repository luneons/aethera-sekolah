'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Copy,
  KeyRound,
  Loader2,
  Phone,
  Plus,
  Power,
  Search,
  ToggleLeft,
  ToggleRight,
  Trash2,
  User,
  UserPlus,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import {
  autoCreateParentAccounts,
  createParentAccount,
  deleteParentAccount,
  fetchParentAccounts,
  resetParentPassword,
  toggleParentActive,
} from '@/lib/parentApi';
import { cn, formatDate } from '@/lib/utils';

export default function ParentsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [openCreate, setOpenCreate] = useState(false);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<number, string>>({});

  const { data: parents = [], isLoading } = useQuery({
    queryKey: ['parents', q],
    queryFn: () => fetchParentAccounts(q || undefined),
    refetchInterval: 60_000,
  });

  const autoMutation = useMutation({
    mutationFn: () => autoCreateParentAccounts(),
    onSuccess: (res) => {
      toast.success(res.message ?? 'Selesai');
      // Save passwords to reveal
      const map: Record<number, string> = {};
      res.data?.created.forEach((c, idx) => {
        map[idx] = `${c.phone} | ${c.name} | ${c.password}`;
      });
      qc.invalidateQueries({ queryKey: ['parents'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const resetMutation = useMutation({
    mutationFn: (id: number) => resetParentPassword(id),
    onSuccess: (newPw, id) => {
      setRevealedPasswords({ ...revealedPasswords, [id]: newPw });
      toast.success('Password baru: ' + newPw, { duration: 8000 });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => toggleParentActive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parents'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteParentAccount(id),
    onSuccess: () => {
      toast.success('Akun ortu dihapus');
      qc.invalidateQueries({ queryKey: ['parents'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 role-accent-text" />
            <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
              Akun Ortu
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-display-md font-bold">Portal Orang Tua</h1>
          <p className="font-body text-text-muted mt-1">
            Kelola akun login orang tua. Mereka pakai HP + password untuk pantau anaknya: kehadiran, nilai, tagihan, izin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              if (confirm(
                'Auto-generate akun ortu dari semua siswa yang punya nomor HP ortu di profilnya?\n\n' +
                'Anak-anak dengan HP ortu sama akan ke-link ke 1 akun otomatis. Password akan ditampilkan setelah selesai.'
              )) {
                autoMutation.mutate();
              }
            }}
            disabled={autoMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 text-sm font-medium disabled:opacity-50"
          >
            {autoMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            Auto-Generate dari Data Siswa
          </button>
          <button
            onClick={() => setOpenCreate(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Buat Manual
          </button>
        </div>
      </div>

      {/* Auto-create result */}
      {autoMutation.data && autoMutation.data.data && autoMutation.data.data.created.length > 0 && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-2">
          <p className="font-display font-semibold text-violet-300">
            {autoMutation.data.data.created.length} akun ortu di-generate · {autoMutation.data.data.skipped} sudah ada
          </p>
          <p className="text-xs text-text-muted">
            Salin daftar password ini & sampaikan ke ortu via WhatsApp / SMS sekolah:
          </p>
          <div className="bg-surface-base/60 rounded-lg p-3 font-mono text-xs max-h-60 overflow-y-auto whitespace-pre-line">
            {autoMutation.data.data.created
              .map((c) => `${c.phone} → ${c.name} (password: ${c.password})${c.children ? ` · anak: ${c.children.join(', ')}` : ''}`)
              .join('\n')}
          </div>
          <button
            onClick={() => {
              const text = autoMutation.data!.data!.created
                .map((c) => `${c.phone} → ${c.name} (${c.password})`)
                .join('\n');
              navigator.clipboard.writeText(text);
              toast.success('Disalin ke clipboard');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-border text-xs hover:bg-surface-raised"
          >
            <Copy className="w-3.5 h-3.5" />
            Salin Semua
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama atau HP..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-surface-border bg-surface-muted text-sm"
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary-400" />
        </div>
      ) : parents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border p-10 text-center">
          <Users className="w-10 h-10 text-text-muted mx-auto mb-2 opacity-50" />
          <p className="font-display font-semibold">Belum ada akun ortu</p>
          <p className="text-sm text-text-muted mt-1">
            Klik "Auto-Generate dari Data Siswa" untuk bikin sekaligus dari data NIS yang ada.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {parents.map((p) => (
            <div key={p.id} className="rounded-xl border border-surface-border bg-surface-muted p-3 sm:p-4">
              <div className="flex items-start gap-3 flex-wrap">
                <div className="w-10 h-10 rounded-lg bg-primary-500/10 text-primary-400 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-display font-semibold">{p.full_name}</p>
                    {!p.is_active && (
                      <span className="font-mono text-2xs uppercase px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/40">
                        nonaktif
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-2xs text-text-muted">
                    <Phone className="inline w-3 h-3 mr-1" />
                    {p.phone}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.children.map((c) => (
                      <span key={c.student_id} className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                        {c.full_name} ({c.relationship})
                      </span>
                    ))}
                  </div>
                  {p.last_login_at && (
                    <p className="text-2xs text-text-muted mt-1.5">
                      Login terakhir: {formatDate(p.last_login_at)}
                    </p>
                  )}
                  {revealedPasswords[p.id] && (
                    <div className="mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs flex items-center justify-between gap-2">
                      <span className="font-mono">Password: <strong>{revealedPasswords[p.id]}</strong></span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(revealedPasswords[p.id]);
                          toast.success('Disalin');
                        }}
                        className="text-amber-300"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => {
                      if (confirm(`Reset password ${p.full_name}? Password baru akan di-generate.`)) {
                        resetMutation.mutate(p.id);
                      }
                    }}
                    title="Reset password"
                    className="p-2 rounded-lg border border-surface-border text-text-muted hover:text-amber-400"
                  >
                    <KeyRound className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleMutation.mutate(p.id)}
                    title={p.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    className="p-2 rounded-lg border border-surface-border text-text-muted hover:text-cyan-400"
                  >
                    {p.is_active ? <ToggleRight className="w-4 h-4 text-success" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Hapus akun ${p.full_name}? Tindakan ini tidak bisa dibatalkan.`)) {
                        deleteMutation.mutate(p.id);
                      }
                    }}
                    title="Hapus"
                    className="p-2 rounded-lg border border-surface-border text-text-muted hover:text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {openCreate && (
        <CreateParentModal
          onClose={() => setOpenCreate(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['parents'] });
            setOpenCreate(false);
          }}
        />
      )}
    </div>
  );
}

function CreateParentModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [relationship, setRelationship] = useState<'ayah' | 'ibu' | 'wali'>('wali');
  const [studentQuery, setStudentQuery] = useState('');
  const [linkedStudents, setLinkedStudents] = useState<Array<{ id: number; name: string }>>([]);

  const { data: searchResults = [] } = useQuery({
    queryKey: ['p-student-search', studentQuery],
    queryFn: async () => {
      if (studentQuery.trim().length < 2) return [];
      const r = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/v1'}/users?role=employee&q=${encodeURIComponent(studentQuery.trim())}&per_page=10`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('aethera_access_token') || ''}`,
          },
        }
      );
      const d = await r.json();
      return (d.data ?? []) as Array<{ id: number; full_name: string; employee_id: string }>;
    },
    enabled: studentQuery.trim().length >= 2,
  });

  const m = useMutation({
    mutationFn: () =>
      createParentAccount({
        phone: phone.trim(),
        full_name: fullName.trim(),
        relationship,
        student_ids: linkedStudents.map((s) => s.id),
      }),
    onSuccess: (data) => {
      toast.success(`Akun dibuat. Password awal: ${data.initial_password}`, { duration: 10000 });
      onSaved();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-surface-base/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-surface-border bg-surface-raised">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <p className="font-display font-bold">Buat Akun Ortu Baru</p>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-xs text-text-secondary">Nama Lengkap</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Bpk Hari Pratama" className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm" />
          </div>
          <div>
            <label className="text-xs text-text-secondary">Nomor HP (untuk login)</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08123456789" className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm" />
          </div>
          <div>
            <label className="text-xs text-text-secondary">Hubungan dengan Anak</label>
            <select value={relationship} onChange={(e) => setRelationship(e.target.value as any)} className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm">
              <option value="ayah">Ayah</option>
              <option value="ibu">Ibu</option>
              <option value="wali">Wali</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-text-secondary">Tambah Anak (NIS / Nama)</label>
            <input value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} placeholder="Mulai ketik..." className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-border bg-surface-base text-sm" />
            {searchResults.length > 0 && (
              <div className="mt-1 border border-surface-border rounded-lg bg-surface-base max-h-32 overflow-y-auto">
                {searchResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      if (!linkedStudents.find((s) => s.id === u.id)) {
                        setLinkedStudents([...linkedStudents, { id: u.id, name: u.full_name }]);
                      }
                      setStudentQuery('');
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-surface-raised border-b border-surface-border last:border-b-0"
                  >
                    <span className="font-medium">{u.full_name}</span>
                    <span className="text-2xs text-text-muted ml-2">NIS {u.employee_id}</span>
                  </button>
                ))}
              </div>
            )}
            {linkedStudents.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {linkedStudents.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 text-xs">
                    {s.name}
                    <button onClick={() => setLinkedStudents(linkedStudents.filter((x) => x.id !== s.id))}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-3 py-2 text-sm text-text-muted">Batal</button>
          <button
            onClick={() => m.mutate()}
            disabled={!phone.trim() || !fullName.trim() || linkedStudents.length === 0 || m.isPending}
            className="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buat Akun'}
          </button>
        </div>
      </div>
    </div>
  );
}
