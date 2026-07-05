'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertCircle,
  Check,
  Edit3,
  School,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import {
  assignHomeroom,
  fetchClassNames,
  fetchHomeroomCandidates,
  type HomeroomCandidate,
} from '@/lib/disciplineApi';
import api, { getErrorMessage, type Envelope } from '@/lib/api';
import { cn } from '@/lib/utils';

interface SchoolClass {
  id: number;
  name: string;
  grade?: string | null;
  major?: string | null;
}

/**
 * Halaman assignment wali kelas — exclusive untuk kepsek.
 *
 * List semua user dengan role "admin" (wali kelas), tampilkan kelas
 * yang dipegang saat ini (atau "Belum diassign"), kepsek bisa pilih
 * kelas baru lewat dropdown.
 */
export default function HomeroomAssignPage() {
  const queryClient = useQueryClient();

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ['homeroom-candidates'],
    queryFn: fetchHomeroomCandidates,
  });

  const { data: classes = [] } = useQuery({
    queryKey: ['school-classes-list'],
    queryFn: async () => {
      const r = await api.get<Envelope<SchoolClass[]>>('/org/school-classes');
      return r.data.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Hitung kelas yang sudah ada wali-nya (selain candidate yang sedang di-edit)
  const classOwnership: Record<number, HomeroomCandidate> = {};
  candidates.forEach((c) => {
    if (c.homeroom_class_id) {
      classOwnership[c.homeroom_class_id] = c;
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <UserCheck className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Tugas Wali Kelas
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">
          Penugasan Wali Kelas
        </h1>
        <p className="font-body text-text-muted mt-1">
          Tetapkan setiap guru pegang kelas mana sebagai wali kelas. Setelah
          ditetapkan, mereka akan langsung lihat data kelasnya di Dashboard.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat
          label="Total Wali Kelas"
          value={candidates.length}
          icon={<UserCheck className="w-5 h-5" />}
          tone="role-accent-text"
        />
        <Stat
          label="Sudah Bertugas"
          value={candidates.filter((c) => c.homeroom_class_id).length}
          icon={<Check className="w-5 h-5" />}
          tone="text-success"
        />
        <Stat
          label="Belum Bertugas"
          value={candidates.filter((c) => !c.homeroom_class_id).length}
          icon={<AlertCircle className="w-5 h-5" />}
          tone="text-amber-400"
        />
      </div>

      {isLoading ? (
        <p className="text-center font-body text-text-muted py-12">
          Memuat daftar wali kelas...
        </p>
      ) : candidates.length === 0 ? (
        <Card padding="lg" className="text-center">
          <Users className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="font-display font-semibold">Belum ada akun wali kelas</p>
          <p className="font-body text-sm text-text-muted mt-1">
            Buat user baru dengan role "Wali Kelas" di menu Siswa &raquo; Kelola User.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {candidates.map((c) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              classes={classes}
              classOwnership={classOwnership}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ['homeroom-candidates'] });
                queryClient.invalidateQueries({ queryKey: ['my-homeroom-class'] });
                queryClient.invalidateQueries({ queryKey: ['exec-dashboard'] });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  classes,
  classOwnership,
  onSaved,
}: {
  candidate: HomeroomCandidate;
  classes: SchoolClass[];
  classOwnership: Record<number, HomeroomCandidate>;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(
    candidate.homeroom_class_id ?? null
  );

  const mutation = useMutation({
    mutationFn: () => assignHomeroom(candidate.id, selectedClassId),
    onSuccess: (res) => {
      toast.success(res.message ?? 'Tugas wali kelas diperbarui');
      setEditing(false);
      onSaved();
    },
    onError: (err) =>
      toast.error('Gagal menyimpan', { description: getErrorMessage(err) }),
  });

  const isAssigned = !!candidate.homeroom_class_id;

  return (
    <Card
      padding="md"
      className={cn(
        'transition-all',
        isAssigned ? 'border-success/30' : 'border-amber-500/30 bg-amber-500/5'
      )}
    >
      <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
        <Avatar name={candidate.full_name} size="md" />
        <div className="flex-1 min-w-0">
          <p className="font-display font-semibold text-text-primary truncate">
            {candidate.full_name}
          </p>
          {candidate.email && (
            <p className="font-mono text-2xs text-text-muted truncate">
              {candidate.email}
            </p>
          )}
        </div>

        {!editing && (
          <>
            <span
              className={cn(
                'font-mono text-2xs uppercase tracking-widest font-bold px-2.5 py-1 rounded-full border',
                isAssigned
                  ? 'bg-success/10 text-success border-success/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              )}
            >
              {isAssigned ? (
                <>
                  <School className="inline w-3 h-3 mr-1" />
                  {candidate.homeroom_class_name}
                </>
              ) : (
                <>
                  <AlertCircle className="inline w-3 h-3 mr-1" />
                  Belum bertugas
                </>
              )}
            </span>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Edit3 className="w-3.5 h-3.5" />}
              onClick={() => setEditing(true)}
            >
              {isAssigned ? 'Ubah' : 'Tugaskan'}
            </Button>
          </>
        )}

        {editing && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={selectedClassId ?? ''}
              onChange={(e) =>
                setSelectedClassId(e.target.value ? Number(e.target.value) : null)
              }
              className="flex-1 sm:flex-none bg-surface-base border border-surface-border rounded-lg px-3 py-2 text-sm font-body text-text-primary focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 min-w-[180px]"
            >
              <option value="">— Tidak bertugas —</option>
              {classes.map((cls) => {
                const owner = classOwnership[cls.id];
                const ownerLabel =
                  owner && owner.id !== candidate.id
                    ? ` (sedang dipegang ${owner.full_name})`
                    : '';
                return (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                    {ownerLabel}
                  </option>
                );
              })}
            </select>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelectedClassId(candidate.homeroom_class_id ?? null);
                setEditing(false);
              }}
              leftIcon={<X className="w-3.5 h-3.5" />}
            >
              Batal
            </Button>
            <Button
              size="sm"
              isLoading={mutation.isPending}
              onClick={() => mutation.mutate()}
              leftIcon={<Check className="w-3.5 h-3.5" />}
            >
              Simpan
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <Card padding="md">
      <div className="flex items-center gap-2 mb-1 text-text-muted">
        <span className={cn('inline-flex', tone)}>{icon}</span>
        <span className="font-mono text-2xs uppercase tracking-widest">{label}</span>
      </div>
      <p className={cn('font-display font-bold text-3xl', tone)}>{value}</p>
    </Card>
  );
}
