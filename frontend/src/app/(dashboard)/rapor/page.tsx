'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Award, Download, FileText, Search } from 'lucide-react';
import api, { type Envelope, getErrorMessage } from '@/lib/api';
import {
  downloadRapor,
  fetchRaporPreview,
  type RaporPreview,
} from '@/lib/raporApi';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn } from '@/lib/utils';

interface SimpleStudent {
  id: number;
  full_name: string;
  employee_id: string;
  school_class_id?: number | null;
}

const SEMESTERS = [
  { value: 'Ganjil', label: 'Ganjil' },
  { value: 'Genap', label: 'Genap' },
];

export default function RaporPage() {
  const user = useAuthStore((s) => s.user);
  const isStudent = user?.role === 'employee';
  const [selectedStudent, setSelectedStudent] = useState<number | null>(
    isStudent ? user?.id ?? null : null
  );
  const [semester, setSemester] = useState('Ganjil');
  const [schoolYear, setSchoolYear] = useState('2025/2026');
  const [catatan, setCatatan] = useState('');
  const [search, setSearch] = useState('');

  const { data: students = [] } = useQuery<SimpleStudent[]>({
    queryKey: ['students-rapor', search],
    queryFn: async () => {
      const r = await api.get<Envelope<{ items: SimpleStudent[] } | SimpleStudent[]>>(
        '/users',
        { params: { role: 'employee', q: search || undefined, per_page: 100 } }
      );
      const data = r.data.data as any;
      return Array.isArray(data) ? data : data?.items ?? [];
    },
    enabled: !isStudent,
  });

  const { data: preview, isLoading } = useQuery({
    queryKey: ['rapor-preview', selectedStudent, semester, schoolYear],
    queryFn: () => fetchRaporPreview(selectedStudent!, semester, schoolYear),
    enabled: !!selectedStudent,
  });

  const downloadMut = useMutation({
    mutationFn: () =>
      downloadRapor(selectedStudent!, semester, schoolYear, catatan || undefined),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Rapor_${preview?.student.name.replace(/\s+/g, '_')}_${semester}_${schoolYear.replace('/', '-')}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Rapor berhasil diunduh');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Award className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Akademik
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Rapor Siswa</h1>
        <p className="font-body text-text-muted mt-1">
          Generate rapor PDF resmi per semester. Otomatis include nilai, kehadiran,
          dan disiplin.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Filter panel */}
        <div className="lg:col-span-1 space-y-3">
          <div className="rounded-lg bg-surface-raised border border-surface-border p-4 space-y-3">
            <h3 className="font-display font-semibold">Pengaturan Rapor</h3>

            {!isStudent && (
              <div>
                <label className="text-xs text-text-muted">Cari Siswa</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    placeholder="Nama atau NIS..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-surface-base border border-surface-border rounded text-sm"
                  />
                </div>
                {search && students.length > 0 && (
                  <div className="mt-2 max-h-60 overflow-y-auto rounded border border-surface-border">
                    {students.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSelectedStudent(s.id);
                          setSearch(s.full_name);
                        }}
                        className={cn(
                          'w-full text-left px-3 py-2 text-xs hover:bg-surface-muted',
                          selectedStudent === s.id && 'bg-primary-500/15'
                        )}
                      >
                        <div className="font-medium">{s.full_name}</div>
                        <div className="text-2xs text-text-muted">{s.employee_id}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-text-muted">Semester</label>
                <select
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  className="w-full bg-surface-base border border-surface-border rounded px-3 py-2 text-sm"
                >
                  {SEMESTERS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-muted">Tahun Ajaran</label>
                <input
                  type="text"
                  value={schoolYear}
                  onChange={(e) => setSchoolYear(e.target.value)}
                  placeholder="2025/2026"
                  className="w-full bg-surface-base border border-surface-border rounded px-3 py-2 text-sm"
                />
              </div>
            </div>

            {!isStudent && (
              <div>
                <label className="text-xs text-text-muted">Catatan Wali Kelas (opsional)</label>
                <textarea
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  placeholder="Catatan untuk siswa..."
                  rows={3}
                  className="w-full bg-surface-base border border-surface-border rounded px-3 py-2 text-sm"
                />
              </div>
            )}

            <button
              onClick={() => downloadMut.mutate()}
              disabled={!selectedStudent || downloadMut.isPending}
              className="w-full px-4 py-2 bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {downloadMut.isPending ? 'Membuat PDF...' : 'Download Rapor PDF'}
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="lg:col-span-2">
          {!selectedStudent && (
            <div className="rounded-lg bg-surface-raised border border-surface-border p-12 text-center text-text-muted">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Pilih siswa untuk lihat preview rapor</p>
            </div>
          )}
          {selectedStudent && isLoading && (
            <div className="text-text-muted py-8 text-center">Memuat data...</div>
          )}
          {preview && <PreviewCard preview={preview} />}
        </div>
      </div>
    </div>
  );
}

function PreviewCard({ preview }: { preview: RaporPreview }) {
  const gpa =
    preview.grades.length > 0
      ? preview.grades.reduce((s, g) => s + g.average, 0) / preview.grades.length
      : 0;

  return (
    <div className="rounded-lg bg-surface-raised border border-surface-border p-5 space-y-4">
      <div>
        <div className="font-mono text-2xs uppercase tracking-widest text-text-muted">
          {preview.semester}
        </div>
        <h2 className="font-display font-bold text-xl">{preview.student.name}</h2>
        <div className="text-sm text-text-muted">
          NIS {preview.student.employee_id}
          {preview.student.class_name && ` • ${preview.student.class_name}`}
        </div>
      </div>

      <div>
        <h3 className="font-display font-semibold mb-2">Nilai Akademik</h3>
        <div className="rounded border border-surface-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted">
              <tr>
                <th className="px-3 py-2 text-left">Mapel</th>
                <th className="px-3 py-2 text-center">KKM</th>
                <th className="px-3 py-2 text-center">Nilai</th>
                <th className="px-3 py-2 text-center">Predikat</th>
              </tr>
            </thead>
            <tbody>
              {preview.grades.map((g) => {
                const predikat =
                  g.average >= 90 ? 'A' :
                  g.average >= 80 ? 'B' :
                  g.average >= 70 ? 'C' :
                  g.average >= 60 ? 'D' : 'E';
                return (
                  <tr key={g.code} className="border-t border-surface-border">
                    <td className="px-3 py-2">{g.subject}</td>
                    <td className="px-3 py-2 text-center text-text-muted">{g.kkm}</td>
                    <td className="px-3 py-2 text-center font-mono">
                      {g.average.toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={cn(
                          'font-mono font-bold',
                          predikat === 'A' && 'text-emerald-300',
                          predikat === 'B' && 'text-blue-300',
                          predikat === 'C' && 'text-amber-300',
                          predikat === 'D' && 'text-orange-300',
                          predikat === 'E' && 'text-rose-300'
                        )}
                      >
                        {predikat}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {preview.grades.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-text-muted">
                    Belum ada nilai
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {preview.grades.length > 0 && (
          <div className="mt-2 text-sm">
            <span className="text-text-muted">Rata-rata: </span>
            <span className="font-display font-bold text-lg">{gpa.toFixed(2)}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Hadir', value: preview.attendance.hadir, tone: 'text-emerald-300' },
          { label: 'Izin', value: preview.attendance.izin, tone: 'text-blue-300' },
          { label: 'Sakit', value: preview.attendance.sakit, tone: 'text-amber-300' },
          { label: 'Alpa', value: preview.attendance.alpa, tone: 'text-rose-300' },
        ].map((s) => (
          <div key={s.label} className="rounded-md bg-surface-base/50 p-3">
            <div className="text-2xs uppercase font-mono text-text-muted">{s.label}</div>
            <div className={cn('font-display text-xl font-bold', s.tone)}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-surface-border">
        <div>
          <div className="text-2xs uppercase font-mono text-text-muted">Poin Sikap</div>
          <div className="font-display font-bold text-lg">{preview.discipline.attitude_points}/100</div>
        </div>
        <div>
          <div className="text-2xs uppercase font-mono text-text-muted">Apresiasi</div>
          <div className="font-display font-bold text-lg text-amber-300">+{preview.discipline.appreciation_points}</div>
        </div>
        <div>
          <div className="text-2xs uppercase font-mono text-text-muted">Pelanggaran</div>
          <div className="font-display font-bold text-lg text-rose-300">{preview.discipline.kts_count}</div>
        </div>
      </div>
    </div>
  );
}
