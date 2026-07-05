'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  GraduationCap,
  Search,
  Upload,
} from 'lucide-react';
import api, { type Envelope, getErrorMessage } from '@/lib/api';
import {
  checkApplicationStatus,
  fetchActivePeriods,
  submitApplication,
  type AdmissionPeriod,
} from '@/lib/admissionsApi';
import { cn, formatDate } from '@/lib/utils';

// Default org_id 1 — sekolah utama. Untuk multi-tenant nanti bisa ambil dari subdomain.
const DEFAULT_ORG_ID = 1;

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Terkirim — Menunggu Review',
  reviewing: 'Sedang Direview',
  accepted: '✅ Diterima',
  rejected: '❌ Ditolak',
  enrolled: '🎓 Sudah Terdaftar Sebagai Siswa',
  cancelled: 'Dibatalkan',
};

export default function PpdbPublicPage() {
  const [tab, setTab] = useState<'apply' | 'check'>('apply');

  const { data: periods = [] } = useQuery({
    queryKey: ['ppdb-public-periods'],
    queryFn: () => fetchActivePeriods(DEFAULT_ORG_ID),
  });

  return (
    <div className="min-h-screen bg-surface-base relative">
      <div className="absolute inset-0 bg-grid-cyber bg-grid pointer-events-none opacity-30" aria-hidden />

      <header className="relative border-b border-surface-border bg-surface-raised/60 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-500 flex items-center justify-center shadow-glow-sm">
              <GraduationCap className="w-5 h-5 text-text-inverse" />
            </div>
            <div>
              <div className="font-display font-bold text-lg text-primary-400">AETHERA</div>
              <div className="text-2xs text-text-muted -mt-0.5">PPDB Online 2025/2026</div>
            </div>
          </Link>
          <Link
            href="/login"
            className="text-xs text-text-muted hover:text-primary-400"
          >
            Login Staff →
          </Link>
        </div>
      </header>

      <main className="relative max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center">
          <h1 className="font-display font-bold text-3xl sm:text-4xl">
            Pendaftaran Siswa Baru
          </h1>
          <p className="font-body text-text-muted mt-2">
            Pendaftaran online — daftar dari rumah, upload dokumen, langsung dapat nomor registrasi.
          </p>
        </div>

        {/* Active periods */}
        {periods.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {periods.map((p) => (
              <PeriodCard key={p.id} period={p} />
            ))}
          </div>
        )}

        {periods.length === 0 && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4 text-center text-amber-200">
            Belum ada periode pendaftaran yang aktif saat ini.
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-surface-border">
          <button
            onClick={() => setTab('apply')}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
              tab === 'apply'
                ? 'border-primary-500 text-primary-300'
                : 'border-transparent text-text-muted'
            )}
          >
            Daftar Sekarang
          </button>
          <button
            onClick={() => setTab('check')}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
              tab === 'check'
                ? 'border-primary-500 text-primary-300'
                : 'border-transparent text-text-muted'
            )}
          >
            Cek Status Pendaftaran
          </button>
        </div>

        {tab === 'apply' && periods.length > 0 && <ApplyForm periods={periods} />}
        {tab === 'apply' && periods.length === 0 && (
          <div className="text-text-muted text-center py-8">
            Tidak ada periode aktif. Cek lagi nanti atau hubungi sekolah.
          </div>
        )}
        {tab === 'check' && <CheckStatusForm />}
      </main>

      <footer className="relative max-w-5xl mx-auto px-4 py-6 text-center text-xs text-text-muted">
        © {new Date().getFullYear()} Aethera • Platform Manajemen Sekolah
      </footer>
    </div>
  );
}

function PeriodCard({ period }: { period: AdmissionPeriod }) {
  const remaining = period.quota
    ? Math.max(0, period.quota - period.enrolled_count)
    : null;
  return (
    <div className="rounded-lg bg-surface-raised border border-primary-500/30 p-4">
      <div className="font-mono text-2xs text-primary-300 uppercase">
        {period.school_year}
      </div>
      <h3 className="font-display font-bold text-lg">{period.name}</h3>
      <div className="text-xs text-text-muted mt-1">
        {formatDate(period.start_at)} → {formatDate(period.end_at)}
      </div>
      {period.description && (
        <p className="text-sm text-text-secondary mt-2">{period.description}</p>
      )}
      <div className="flex flex-wrap gap-3 text-xs mt-3">
        <span className="text-emerald-300">
          ✓ {period.applications_count} pendaftar
        </span>
        {remaining !== null && (
          <span className="text-amber-300">
            🪑 Sisa kuota: {remaining}
          </span>
        )}
        {period.registration_fee > 0 && (
          <span className="text-text-muted">
            💰 Rp {period.registration_fee.toLocaleString('id-ID')}
          </span>
        )}
      </div>
    </div>
  );
}

function ApplyForm({ periods }: { periods: AdmissionPeriod[] }) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    registration_number: string;
    id: number;
  } | null>(null);

  const [form, setForm] = useState({
    period_id: periods[0]?.id ?? 0,
    full_name: '',
    nisn: '',
    nik: '',
    birth_place: '',
    birth_date: '',
    gender: 'L',
    religion: '',
    address: '',
    phone: '',
    email: '',
    previous_school: '',
    father_name: '',
    mother_name: '',
    parent_phone: '',
    parent_occupation: '',
  });

  const [files, setFiles] = useState<{
    photo?: File;
    kk?: File;
    akta?: File;
    raport?: File;
  }>({});

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form)) {
        if (v) fd.append(k, String(v));
      }
      if (files.photo) fd.append('photo', files.photo);
      if (files.kk) fd.append('kk', files.kk);
      if (files.akta) fd.append('akta', files.akta);
      if (files.raport) fd.append('raport', files.raport);

      const data = await submitApplication(fd);
      setResult(data);
      toast.success('Pendaftaran terkirim!');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/40 p-6 text-center space-y-3">
        <CheckCircle2 className="w-16 h-16 text-emerald-300 mx-auto" />
        <h2 className="font-display font-bold text-2xl">Pendaftaran Berhasil!</h2>
        <p className="text-text-secondary">
          Simpan nomor registrasi berikut untuk cek status:
        </p>
        <div className="flex items-center justify-center gap-2">
          <code className="font-mono text-xl bg-surface-base px-4 py-2 rounded">
            {result.registration_number}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(result.registration_number);
              toast.success('Disalin');
            }}
            className="text-text-muted hover:text-text-primary"
          >
            <Copy className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-text-muted">
          Sekolah akan menghubungi Anda via WhatsApp/email setelah review.
        </p>
        <button
          onClick={() => {
            setResult(null);
            setForm({ ...form, full_name: '', nisn: '', nik: '' });
            setFiles({});
          }}
          className="text-sm text-primary-400 hover:underline"
        >
          Daftar lagi (untuk siswa lain)
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg bg-surface-raised border border-surface-border p-5 space-y-5"
    >
      <Section title="Pilih Gelombang">
        <select
          value={form.period_id}
          onChange={(e) => setForm({ ...form, period_id: Number(e.target.value) })}
          required
          className="w-full bg-surface-base border border-surface-border rounded px-3 py-2 text-sm"
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.school_year})
            </option>
          ))}
        </select>
      </Section>

      <Section title="Data Diri Calon Siswa">
        <Input2 label="Nama Lengkap *" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} required />
        <Grid2>
          <Input2 label="NISN" value={form.nisn} onChange={(v) => setForm({ ...form, nisn: v })} />
          <Input2 label="NIK" value={form.nik} onChange={(v) => setForm({ ...form, nik: v })} />
        </Grid2>
        <Grid2>
          <Input2 label="Tempat Lahir" value={form.birth_place} onChange={(v) => setForm({ ...form, birth_place: v })} />
          <div>
            <label className="block text-xs text-text-muted mb-1">Tanggal Lahir</label>
            <input
              type="date"
              value={form.birth_date}
              onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
              className="w-full bg-surface-base border border-surface-border rounded px-3 py-2 text-sm"
            />
          </div>
        </Grid2>
        <Grid2>
          <div>
            <label className="block text-xs text-text-muted mb-1">Jenis Kelamin *</label>
            <select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              className="w-full bg-surface-base border border-surface-border rounded px-3 py-2 text-sm"
            >
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
          </div>
          <Input2 label="Agama" value={form.religion} onChange={(v) => setForm({ ...form, religion: v })} />
        </Grid2>
        <Input2 label="Alamat" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
        <Grid2>
          <Input2 label="HP" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <Input2 label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
        </Grid2>
        <Input2 label="Asal Sekolah" value={form.previous_school} onChange={(v) => setForm({ ...form, previous_school: v })} />
      </Section>

      <Section title="Data Orang Tua / Wali">
        <Grid2>
          <Input2 label="Nama Ayah" value={form.father_name} onChange={(v) => setForm({ ...form, father_name: v })} />
          <Input2 label="Nama Ibu" value={form.mother_name} onChange={(v) => setForm({ ...form, mother_name: v })} />
        </Grid2>
        <Grid2>
          <Input2 label="HP Ortu/Wali *" value={form.parent_phone} onChange={(v) => setForm({ ...form, parent_phone: v })} required />
          <Input2 label="Pekerjaan Ortu" value={form.parent_occupation} onChange={(v) => setForm({ ...form, parent_occupation: v })} />
        </Grid2>
      </Section>

      <Section title="Dokumen Pendukung">
        <p className="text-xs text-text-muted mb-2">
          Format: JPG / PNG / PDF. Maks 5MB per file.
        </p>
        <FileInput
          label="Foto Calon Siswa"
          accept="image/*"
          file={files.photo}
          onChange={(f) => setFiles({ ...files, photo: f })}
        />
        <FileInput
          label="Kartu Keluarga"
          accept="image/*,application/pdf"
          file={files.kk}
          onChange={(f) => setFiles({ ...files, kk: f })}
        />
        <FileInput
          label="Akta Kelahiran"
          accept="image/*,application/pdf"
          file={files.akta}
          onChange={(f) => setFiles({ ...files, akta: f })}
        />
        <FileInput
          label="Rapor Terakhir"
          accept="image/*,application/pdf"
          file={files.raport}
          onChange={(f) => setFiles({ ...files, raport: f })}
        />
      </Section>

      <button
        type="submit"
        disabled={submitting}
        className="w-full px-4 py-3 bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg font-display font-bold disabled:opacity-50"
      >
        {submitting ? 'Mengirim...' : 'Kirim Pendaftaran'}
      </button>
    </form>
  );
}

function CheckStatusForm() {
  const [regNo, setRegNo] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    registration_number: string;
    full_name: string;
    period_name?: string;
    status: string;
    decision_note?: string;
    submitted_at: string;
  } | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await checkApplicationStatus(regNo.trim(), email.trim());
      setResult(data);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={onSubmit}
        className="rounded-lg bg-surface-raised border border-surface-border p-5 space-y-3"
      >
        <h3 className="font-display font-semibold flex items-center gap-2">
          <Search className="w-4 h-4" />
          Cek Status
        </h3>
        <Input2
          label="Nomor Registrasi"
          value={regNo}
          onChange={setRegNo}
          required
          placeholder="PPDB-1-XXXXXXXX"
        />
        <Input2
          label="Email"
          value={email}
          onChange={setEmail}
          type="email"
          required
          placeholder="email@contoh.com"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg disabled:opacity-50"
        >
          {loading ? 'Memeriksa...' : 'Cek Status'}
        </button>
      </form>

      {result && (
        <div className="rounded-lg bg-surface-raised border border-surface-border p-5 space-y-2">
          <div className="text-2xs uppercase font-mono text-text-muted">
            {result.period_name}
          </div>
          <h3 className="font-display font-bold text-lg">{result.full_name}</h3>
          <div className="font-mono text-xs text-text-muted">
            {result.registration_number}
          </div>
          <div className="pt-2 border-t border-surface-border">
            <div className="text-xs text-text-muted">Status:</div>
            <div className="font-display font-bold text-lg">
              {STATUS_LABEL[result.status] || result.status}
            </div>
            {result.decision_note && (
              <p className="text-sm text-text-secondary mt-1">
                {result.decision_note}
              </p>
            )}
          </div>
          <div className="text-2xs text-text-muted">
            Didaftarkan: {formatDate(result.submitted_at)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers UI ────────────────────────────────────────────────────────────


function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="font-display font-semibold text-sm text-primary-300 uppercase tracking-wider">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function Input2({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-text-muted mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full bg-surface-base border border-surface-border rounded px-3 py-2 text-sm"
      />
    </div>
  );
}

function FileInput({
  label,
  accept,
  file,
  onChange,
}: {
  label: string;
  accept: string;
  file?: File;
  onChange: (f: File | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex-1">
        <span className="block text-xs text-text-muted mb-1">{label}</span>
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded border text-sm cursor-pointer transition-colors',
            file
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-surface-border hover:bg-surface-muted/40'
          )}
        >
          <Upload className="w-4 h-4" />
          <span className="truncate flex-1">
            {file ? file.name : 'Pilih file...'}
          </span>
          {file && (
            <span className="font-mono text-2xs text-text-muted">
              {(file.size / 1024).toFixed(0)}KB
            </span>
          )}
        </div>
        <input
          type="file"
          accept={accept}
          onChange={(e) => onChange(e.target.files?.[0])}
          className="sr-only"
        />
      </label>
      {file && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-xs text-rose-300 hover:underline"
        >
          Hapus
        </button>
      )}
    </div>
  );
}
