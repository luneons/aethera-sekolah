'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Edit,
  Library,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import api, { type Envelope, getErrorMessage } from '@/lib/api';
import {
  createBook,
  createLoan,
  deleteBook,
  fetchBooks,
  fetchCategories,
  fetchLibraryStats,
  fetchLoans,
  returnLoan,
  updateBook,
  type LibraryBook,
  type LibraryLoan,
  type BookInput,
} from '@/lib/libraryApi';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn, formatDate } from '@/lib/utils';

interface SimpleStudent { id: number; full_name: string; employee_id: string; school_class_id?: number | null }

function formatRp(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID');
}

export default function LibraryPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const [tab, setTab] = useState<'books' | 'loans'>('books');

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Library className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Perpustakaan Digital
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Perpustakaan</h1>
        <p className="font-body text-text-muted mt-1">
          Manajemen koleksi buku, peminjaman, denda telat (Rp 1.000/hari).
        </p>
      </div>

      {isAdmin && <LibraryStatsBlock />}

      <div className="flex flex-wrap gap-2 border-b border-surface-border">
        <button
          onClick={() => setTab('books')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
            tab === 'books' ? 'border-primary-500 text-primary-300' : 'border-transparent text-text-muted'
          )}
        >
          Katalog Buku
        </button>
        <button
          onClick={() => setTab('loans')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
            tab === 'loans' ? 'border-primary-500 text-primary-300' : 'border-transparent text-text-muted'
          )}
        >
          {isAdmin ? 'Peminjaman' : 'Pinjaman Saya'}
        </button>
      </div>

      {tab === 'books' && <BooksTab isAdmin={isAdmin} />}
      {tab === 'loans' && <LoansTab isAdmin={isAdmin} />}
    </div>
  );
}

function LibraryStatsBlock() {
  const { data } = useQuery({
    queryKey: ['library-stats'],
    queryFn: fetchLibraryStats,
    refetchInterval: 60_000,
  });
  if (!data) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { label: 'Total Judul', value: data.total_books, tone: 'text-text-secondary' },
        { label: 'Eksemplar Tersedia', value: `${data.available_copies}/${data.total_copies}`, tone: 'text-emerald-300' },
        { label: 'Aktif Dipinjam', value: data.active_loans, tone: 'text-blue-300' },
        { label: 'Telat Kembali', value: data.overdue, tone: 'text-amber-400' },
      ].map((s) => (
        <div key={s.label} className="rounded-lg bg-surface-raised border border-surface-border p-3">
          <div className="text-2xs uppercase tracking-widest text-text-muted font-mono">{s.label}</div>
          <div className={cn('font-display text-2xl font-bold mt-1', s.tone)}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

function BooksTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<LibraryBook | null>(null);
  const [loanFor, setLoanFor] = useState<LibraryBook | null>(null);

  const { data: books = [], isLoading } = useQuery({
    queryKey: ['library-books', q, category],
    queryFn: () => fetchBooks({ q: q || undefined, category: category || undefined }),
  });

  const { data: cats = [] } = useQuery({
    queryKey: ['library-cats'],
    queryFn: fetchCategories,
  });

  const removeMut = useMutation({
    mutationFn: (id: number) => deleteBook(id),
    onSuccess: () => {
      toast.success('Buku dihapus');
      qc.invalidateQueries({ queryKey: ['library-books'] });
      qc.invalidateQueries({ queryKey: ['library-stats'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Cari judul/penulis/kode..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-sm"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Semua Kategori</option>
          {cats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {isAdmin && (
          <button
            onClick={() => setOpenCreate(true)}
            className="px-3 py-2 bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg text-sm font-medium flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Buku Baru
          </button>
        )}
      </div>

      {isLoading && <div className="text-text-muted">Memuat...</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {books.map((b) => (
          <div
            key={b.id}
            className="rounded-lg bg-surface-raised border border-surface-border p-4 space-y-2"
          >
            <div className="flex gap-3">
              {b.cover_url ? (
                <img
                  src={b.cover_url}
                  alt={b.title}
                  className="w-16 h-20 rounded object-cover bg-surface-muted"
                />
              ) : (
                <div className="w-16 h-20 rounded bg-surface-muted flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-text-muted" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-mono text-2xs text-text-muted">{b.code}</div>
                <h3 className="font-display font-bold text-sm leading-tight line-clamp-2">
                  {b.title}
                </h3>
                {b.author && (
                  <p className="text-xs text-text-muted line-clamp-1">{b.author}</p>
                )}
                {b.category && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded bg-primary-500/15 text-primary-300 font-mono text-2xs">
                    {b.category}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span
                className={cn(
                  'font-mono',
                  b.available_copies > 0 ? 'text-emerald-300' : 'text-rose-300'
                )}
              >
                {b.available_copies}/{b.total_copies} tersedia
              </span>
              {!b.is_active && (
                <span className="font-mono text-2xs text-text-muted">NONAKTIF</span>
              )}
            </div>
            {isAdmin && (
              <div className="flex flex-wrap gap-1 pt-2 border-t border-surface-border">
                <button
                  onClick={() => setLoanFor(b)}
                  disabled={b.available_copies < 1}
                  className="px-2 py-1 text-2xs bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 rounded disabled:opacity-40"
                >
                  📚 Pinjam
                </button>
                <button
                  onClick={() => setEditing(b)}
                  className="px-2 py-1 text-2xs bg-surface-muted text-text-muted hover:text-text-primary rounded"
                >
                  <Edit className="w-3 h-3" />
                </button>
                {user?.role === 'super_admin' && (
                  <button
                    onClick={() => {
                      if (confirm(`Hapus buku "${b.title}"?`)) removeMut.mutate(b.id);
                    }}
                    className="px-2 py-1 text-2xs bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 rounded"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {books.length === 0 && !isLoading && (
          <div className="col-span-full text-center text-text-muted py-8">
            Belum ada buku
          </div>
        )}
      </div>

      {openCreate && <BookModal onClose={() => setOpenCreate(false)} />}
      {editing && <BookModal existing={editing} onClose={() => setEditing(null)} />}
      {loanFor && <LoanModal book={loanFor} onClose={() => setLoanFor(null)} />}
    </div>
  );
}

function LoansTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [returnFor, setReturnFor] = useState<LibraryLoan | null>(null);

  const { data: loans = [], isLoading } = useQuery({
    queryKey: ['library-loans', statusFilter, overdueOnly],
    queryFn: () =>
      fetchLoans({
        status: statusFilter || undefined,
        overdue_only: overdueOnly,
      }),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        {['', 'borrowed', 'overdue', 'returned', 'lost'].map((s) => (
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
        {isAdmin && (
          <label className="flex items-center gap-1 text-sm text-text-muted ml-auto">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
            />
            Telat saja
          </label>
        )}
      </div>

      {isLoading && <div className="text-text-muted">Memuat...</div>}

      <div className="rounded-lg bg-surface-raised border border-surface-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-widest text-text-muted">Buku</th>
              {isAdmin && (
                <th className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-widest text-text-muted">Siswa</th>
              )}
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-widest text-text-muted">Pinjam</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-widest text-text-muted">Kembali</th>
              <th className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-widest text-text-muted">Status</th>
              <th className="px-3 py-2 text-right font-mono text-2xs uppercase tracking-widest text-text-muted">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loans.map((l) => (
              <tr key={l.id} className="border-t border-surface-border">
                <td className="px-3 py-2">
                  <div className="font-medium">{l.book_title}</div>
                  <div className="text-2xs font-mono text-text-muted">{l.book_code}</div>
                </td>
                {isAdmin && (
                  <td className="px-3 py-2">
                    <div>{l.student_name}</div>
                    {l.student_class && (
                      <div className="text-2xs text-text-muted">{l.student_class}</div>
                    )}
                  </td>
                )}
                <td className="px-3 py-2 text-xs">{formatDate(l.loan_date)}</td>
                <td className="px-3 py-2 text-xs">
                  {formatDate(l.due_date)}
                  {l.days_overdue > 0 && (
                    <div className="text-2xs text-rose-300">+{l.days_overdue}h telat</div>
                  )}
                  {l.return_date && (
                    <div className="text-2xs text-emerald-300">
                      ✓ {formatDate(l.return_date)}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      'font-mono text-2xs px-2 py-0.5 rounded uppercase',
                      l.status === 'borrowed' && 'bg-blue-500/15 text-blue-300',
                      l.status === 'overdue' && 'bg-amber-500/15 text-amber-300',
                      l.status === 'returned' && 'bg-success/15 text-success',
                      l.status === 'lost' && 'bg-rose-500/15 text-rose-300'
                    )}
                  >
                    {l.status.toUpperCase()}
                  </span>
                  {l.fine_amount > 0 && (
                    <div className="text-2xs text-rose-300 mt-0.5">{formatRp(l.fine_amount)}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {isAdmin && (l.status === 'borrowed' || l.status === 'overdue') && (
                    <button
                      onClick={() => setReturnFor(l)}
                      className="px-2 py-1 text-2xs bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 rounded"
                    >
                      ✓ Kembali
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {loans.length === 0 && !isLoading && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-3 py-6 text-center text-text-muted">
                  Tidak ada peminjaman
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {returnFor && <ReturnModal loan={returnFor} onClose={() => setReturnFor(null)} />}
    </div>
  );
}

function BookModal({
  existing,
  onClose,
}: {
  existing?: LibraryBook;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<BookInput>({
    code: existing?.code ?? '',
    isbn: existing?.isbn ?? '',
    title: existing?.title ?? '',
    author: existing?.author ?? '',
    publisher: existing?.publisher ?? '',
    year: existing?.year ?? undefined,
    category: existing?.category ?? '',
    cover_url: existing?.cover_url ?? '',
    description: existing?.description ?? '',
    total_copies: existing?.total_copies ?? 1,
    is_active: existing?.is_active ?? true,
  });
  const mut = useMutation({
    mutationFn: (p: BookInput) =>
      existing ? updateBook(existing.id, p) : createBook(p),
    onSuccess: () => {
      toast.success('Tersimpan');
      qc.invalidateQueries({ queryKey: ['library-books'] });
      qc.invalidateQueries({ queryKey: ['library-cats'] });
      qc.invalidateQueries({ queryKey: ['library-stats'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">
            {existing ? 'Edit Buku' : 'Buku Baru'}
          </h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Kode unik"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="bg-surface-base border border-surface-border rounded px-3 py-2"
            />
            <input
              placeholder="ISBN"
              value={form.isbn ?? ''}
              onChange={(e) => setForm({ ...form, isbn: e.target.value })}
              className="bg-surface-base border border-surface-border rounded px-3 py-2"
            />
          </div>
          <input
            placeholder="Judul"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <input
            placeholder="Penulis"
            value={form.author ?? ''}
            onChange={(e) => setForm({ ...form, author: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Penerbit"
              value={form.publisher ?? ''}
              onChange={(e) => setForm({ ...form, publisher: e.target.value })}
              className="bg-surface-base border border-surface-border rounded px-3 py-2"
            />
            <input
              type="number"
              placeholder="Tahun"
              value={form.year ?? ''}
              onChange={(e) =>
                setForm({ ...form, year: e.target.value ? Number(e.target.value) : undefined })
              }
              className="bg-surface-base border border-surface-border rounded px-3 py-2"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Kategori (mis. Fiksi)"
              value={form.category ?? ''}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="bg-surface-base border border-surface-border rounded px-3 py-2"
            />
            <input
              type="number"
              placeholder="Jumlah eksemplar"
              value={form.total_copies}
              onChange={(e) =>
                setForm({ ...form, total_copies: Number(e.target.value) })
              }
              className="bg-surface-base border border-surface-border rounded px-3 py-2"
            />
          </div>
          <input
            placeholder="URL gambar cover"
            value={form.cover_url ?? ''}
            onChange={(e) => setForm({ ...form, cover_url: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <textarea
            placeholder="Deskripsi"
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span>Aktif (boleh dipinjam)</span>
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

function LoanModal({
  book,
  onClose,
}: {
  book: LibraryBook;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const dueDefault = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const [form, setForm] = useState({
    student_id: 0,
    loan_date: today,
    due_date: dueDefault,
    notes: '',
  });
  const [studentSearch, setStudentSearch] = useState('');

  const { data: students = [] } = useQuery<SimpleStudent[]>({
    queryKey: ['students-search', studentSearch],
    queryFn: async () => {
      const r = await api.get<Envelope<{ items: SimpleStudent[] } | SimpleStudent[]>>('/users', {
        params: { role: 'employee', q: studentSearch || undefined, per_page: 50 },
      });
      const data = r.data.data as any;
      return Array.isArray(data) ? data : data?.items ?? [];
    },
    enabled: studentSearch.length >= 2,
  });

  const mut = useMutation({
    mutationFn: () =>
      createLoan({
        book_id: book.id,
        student_id: form.student_id,
        loan_date: form.loan_date,
        due_date: form.due_date,
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      toast.success('Peminjaman tercatat');
      qc.invalidateQueries({ queryKey: ['library-books'] });
      qc.invalidateQueries({ queryKey: ['library-loans'] });
      qc.invalidateQueries({ queryKey: ['library-stats'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">Pinjam Buku</h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="rounded bg-surface-base/50 p-3">
            <div className="font-display font-bold">{book.title}</div>
            <div className="text-xs text-text-muted">{book.author}</div>
          </div>
          <div>
            <label className="block text-text-muted text-xs mb-1">Cari siswa</label>
            <input
              type="text"
              placeholder="Nama atau NIS..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
            />
            {students.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded border border-surface-border">
                {students.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setForm({ ...form, student_id: s.id });
                      setStudentSearch(s.full_name);
                    }}
                    className={cn(
                      'w-full text-left px-3 py-2 text-xs hover:bg-surface-muted',
                      form.student_id === s.id && 'bg-primary-500/15'
                    )}
                  >
                    <div className="font-medium">{s.full_name}</div>
                    <div className="text-2xs text-text-muted">{s.employee_id}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-text-muted">Tgl pinjam</label>
              <input
                type="date"
                value={form.loan_date}
                onChange={(e) => setForm({ ...form, loan_date: e.target.value })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Wajib kembali</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
              />
            </div>
          </div>
          <textarea
            placeholder="Catatan (opsional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted">Batal</button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !form.student_id}
            className="px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg disabled:opacity-50"
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

function ReturnModal({
  loan,
  onClose,
}: {
  loan: LibraryLoan;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    return_date: today,
    book_lost: false,
    notes: '',
  });
  const mut = useMutation({
    mutationFn: () =>
      returnLoan(loan.id, {
        return_date: form.return_date,
        book_lost: form.book_lost,
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      toast.success('Pengembalian tercatat');
      qc.invalidateQueries({ queryKey: ['library-books'] });
      qc.invalidateQueries({ queryKey: ['library-loans'] });
      qc.invalidateQueries({ queryKey: ['library-stats'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">Kembalikan Buku</h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="rounded bg-surface-base/50 p-3 text-xs">
            <div className="font-display font-bold">{loan.book_title}</div>
            <div className="text-text-muted">Pinjam: {loan.student_name}</div>
            <div className="text-text-muted">
              Wajib kembali: {formatDate(loan.due_date)}
              {loan.days_overdue > 0 && (
                <span className="text-rose-300"> (+{loan.days_overdue}h telat = {formatRp(loan.days_overdue * 1000)})</span>
              )}
            </div>
          </div>
          <input
            type="date"
            value={form.return_date}
            onChange={(e) => setForm({ ...form, return_date: e.target.value })}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <label className="flex items-center gap-2 text-rose-300">
            <input
              type="checkbox"
              checked={form.book_lost}
              onChange={(e) => setForm({ ...form, book_lost: e.target.checked })}
            />
            <span>Buku hilang (denda Rp 50.000)</span>
          </label>
          <textarea
            placeholder="Catatan (kondisi, dll)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted">Batal</button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="px-4 py-2 text-sm bg-emerald-500 hover:bg-emerald-600 text-text-inverse rounded-lg disabled:opacity-50"
          >
            {mut.isPending ? 'Menyimpan...' : 'Konfirmasi'}
          </button>
        </div>
      </div>
    </div>
  );
}
