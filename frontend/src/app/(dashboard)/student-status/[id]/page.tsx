'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, GraduationCap, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StudentStatusView } from '@/components/simmico/StudentStatusView';
import { BkNotesPanel } from '@/components/simmico/BkNotesPanel';
import { fetchIncidents, fetchStudent } from '@/lib/disciplineApi';
import { useAuthStore } from '@/stores/useAuthStore';

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const studentId = Number(params.id);
  const role = useAuthStore((s) => s.user?.role);
  const canSeeBkNotes = role === 'hr' || role === 'super_admin';

  const { data: student, isLoading, error } = useQuery({
    queryKey: ['discipline-student', studentId],
    queryFn: () => fetchStudent(studentId),
    enabled: Number.isFinite(studentId) && studentId > 0,
  });

  const { data: incidents = [] } = useQuery({
    queryKey: ['discipline-incidents', studentId],
    queryFn: () => fetchIncidents(studentId),
    enabled: Number.isFinite(studentId) && studentId > 0,
  });

  if (isLoading) {
    return (
      <p className="text-center font-body text-text-muted py-24">
        Memuat profil siswa...
      </p>
    );
  }

  if (error || !student) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="font-display text-xl text-text-secondary">
          Data siswa tidak ditemukan.
        </p>
        <Link href="/student-status">
          <Button variant="outline" leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Kembali ke daftar
          </Button>
        </Link>
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
        Kembali
      </button>

      <StudentStatusView
        student={student}
        incidents={incidents}
        topAction={
          <div className="flex flex-wrap gap-2">
            <Link href={`/grades/${student.user_id}`}>
              <Button variant="outline" leftIcon={<GraduationCap className="w-4 h-4" />}>
                Lihat Rapor Nilai
              </Button>
            </Link>
            <Link href={`/kts/new?student=${student.user_id}`}>
              <Button
                variant="outline"
                leftIcon={<ShieldAlert className="w-4 h-4" />}
              >
                Lapor KTS Siswa Ini
              </Button>
            </Link>
          </div>
        }
      />

      {canSeeBkNotes && <BkNotesPanel studentId={student.user_id} />}

      <div className="flex justify-end gap-3">
        <Link href="/student-status">
          <Button variant="ghost">Kembali ke Daftar</Button>
        </Link>
        <Link href={`/kts/new?student=${student.user_id}`}>
          <Button leftIcon={<ShieldAlert className="w-4 h-4" />}>Lapor KTS</Button>
        </Link>
      </div>
    </div>
  );
}
