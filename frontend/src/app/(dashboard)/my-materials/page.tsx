'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  Download,
  FileText,
  Filter,
  Library,
  User,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { fetchMyMaterials } from '@/lib/lmsApi';
import { formatDate } from '@/lib/utils';

/**
 * Materi pelajaran untuk siswa.
 */
export default function MyMaterialsPage() {
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ['my-materials'],
    queryFn: fetchMyMaterials,
  });

  const subjects = useMemo(() => {
    const set = new Set<string>();
    materials.forEach((m) => m.subject_code && set.add(m.subject_code));
    return Array.from(set).sort();
  }, [materials]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return materials.filter((m) => {
      if (subjectFilter !== 'all' && m.subject_code !== subjectFilter) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        (m.description ?? '').toLowerCase().includes(q) ||
        (m.subject_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [materials, query, subjectFilter]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Library className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Pembelajaran
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">
          Materi Pelajaran
        </h1>
        <p className="font-body text-text-muted mt-1">
          Akses semua materi yang dibagikan guru kapanpun, dimanapun.
        </p>
      </div>

      <Card padding="md" className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <Input
            placeholder="Cari judul, mata pelajaran, atau topik..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-text-muted shrink-0" />
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="flex-1 bg-surface-raised border border-surface-border rounded-lg px-3 py-2.5 text-sm font-body text-text-primary focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
          >
            <option value="all">Semua Mata Pelajaran</option>
            {subjects.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-center font-body text-text-muted py-12">Memuat...</p>
      ) : filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <FileText className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="font-display font-semibold">
            {query || subjectFilter !== 'all'
              ? 'Tidak ada materi cocok'
              : 'Belum ada materi'}
          </p>
          <p className="font-body text-sm text-text-muted mt-1">
            {query || subjectFilter !== 'all'
              ? 'Coba ubah kata kunci atau filter.'
              : 'Guru-mu belum upload materi. Cek lagi nanti.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((m) => (
            <a
              key={m.id}
              href={m.file_url}
              target="_blank"
              rel="noreferrer"
              className="block group"
            >
              <Card padding="md" className="hover:border-primary-500/40 transition-all h-full">
                <div className="flex items-start gap-3">
                  <span className="inline-flex w-12 h-12 rounded-lg role-accent-bg-soft role-accent-text items-center justify-center shrink-0">
                    <FileText className="w-6 h-6" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold text-base text-text-primary group-hover:role-accent-text transition-colors line-clamp-2">
                      {m.title}
                    </p>
                    <p className="font-mono text-2xs uppercase tracking-widest text-text-muted mt-0.5">
                      {m.subject_code} · {m.subject_name}
                    </p>
                    {m.description && (
                      <p className="font-body text-xs text-text-secondary mt-1.5 line-clamp-2">
                        {m.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 font-mono text-2xs text-text-muted flex-wrap">
                      <span>
                        <User className="inline w-3 h-3 mr-1" /> {m.teacher_name}
                      </span>
                      <span>
                        <Calendar className="inline w-3 h-3 mr-1" /> {formatDate(m.created_at)}
                      </span>
                      {m.file_size && (
                        <span>{(m.file_size / 1024).toFixed(0)} KB</span>
                      )}
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-text-muted group-hover:text-primary-400 transition-colors shrink-0 mt-1" />
                </div>
              </Card>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
