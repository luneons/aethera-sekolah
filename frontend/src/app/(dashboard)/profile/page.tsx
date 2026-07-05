'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, KeyRound, Save, ScanFace, ShieldCheck, ShieldX, User } from 'lucide-react';
import { toast } from 'sonner';
import api, { getErrorMessage, type Envelope } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOrgMode } from '@/stores/useOrgMode';
import { getRoleLabel } from '@/lib/terminology';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { FaceEnrollModal } from '@/components/employees/FaceEnrollModal';

export default function ProfilePage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { mode, t } = useOrgMode();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile form
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    phone: '',
    parent_phone: '',
    parent_name: '',
  });

  // Password form
  const [pwForm, setPwForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  // Init form dari user store
  useEffect(() => {
    if (user) {
      setProfileForm({
        full_name: user.full_name || '',
        phone: user.phone || '',
        parent_phone: user.parent_phone || '',
        parent_name: user.parent_name || '',
      });
    }
  }, [user]);

  // Mutation: update profil
  const updateProfileMut = useMutation({
    mutationFn: async (data: typeof profileForm) => {
      const r = await api.patch<Envelope<any>>('/users/me/profile', {
        full_name: data.full_name || undefined,
        phone: data.phone || null,
        parent_phone: data.parent_phone || null,
        parent_name: data.parent_name || null,
      });
      return r.data.data;
    },
    onSuccess: (data) => {
      toast.success('Profil berhasil diperbarui');
      if (data && user) {
        setUser({ ...user, full_name: data.full_name, photo_url: data.photo_url });
      }
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Mutation: ganti password
  const changePwMut = useMutation({
    mutationFn: async () => {
      await api.post('/users/me/change-password', {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
    },
    onSuccess: () => {
      toast.success('Password berhasil diubah');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Mutation: upload foto
  const uploadPhotoMut = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const r = await api.post<Envelope<{ photo_url: string }>>('/users/me/photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return r.data.data;
    },
    onSuccess: (data) => {
      toast.success('Foto profil diperbarui');
      if (data && user) {
        setUser({ ...user, photo_url: data.photo_url });
      }
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('File harus berupa gambar');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran foto maksimal 5MB');
      return;
    }
    uploadPhotoMut.mutate(file);
    // Reset input
    e.target.value = '';
  };

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.full_name.trim()) {
      toast.error('Nama tidak boleh kosong');
      return;
    }
    updateProfileMut.mutate(profileForm);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.new_password.length < 6) {
      toast.error('Password baru minimal 6 karakter');
      return;
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      toast.error('Konfirmasi password tidak cocok');
      return;
    }
    changePwMut.mutate();
  };

  const isSchool = mode === 'school';
  const [openEnroll, setOpenEnroll] = useState(false);

  // Query: status enrollment wajah
  const { data: faceStatus, refetch: refetchFace } = useQuery({
    queryKey: ['my-face-status'],
    queryFn: async () => {
      if (!user?.id) return null;
      const r = await api.get<Envelope<any>>(`/face/enroll/${user.id}/status`);
      return r.data.data;
    },
    enabled: !!user?.id,
  });

  // Mutation: hapus data wajah sendiri
  const deleteFaceMut = useMutation({
    mutationFn: async () => {
      await api.delete(`/face/enroll/${user?.id}`);
    },
    onSuccess: () => {
      toast.success('Data wajah dihapus');
      refetchFace();
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Profil Saya</h1>
        <p className="font-body text-text-muted mt-1 text-sm">Kelola informasi akun dan keamanan</p>
      </div>

      {/* Foto Profil */}
      <Card padding="lg">
        <div className="flex items-center gap-6">
          <div className="relative group">
            <Avatar
              name={user?.full_name ?? '?'}
              src={user?.photo_url}
              size="xl"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadPhotoMut.isPending}
              className="absolute inset-0 rounded-full bg-surface-base/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              title="Ganti foto"
            >
              {uploadPhotoMut.isPending
                ? <div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                : <Camera className="w-5 h-5 text-primary-400" />
              }
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          <div>
            <p className="font-display font-bold text-xl">{user?.full_name}</p>
            <p className="font-mono text-sm text-text-muted">{user?.email}</p>
            <p className="font-mono text-xs text-primary-400 uppercase tracking-widest mt-1">
              {getRoleLabel(user?.role ?? '', mode)}
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadPhotoMut.isPending}
              className="mt-2 text-xs text-text-muted hover:text-primary-400 transition-colors flex items-center gap-1"
            >
              <Camera className="w-3 h-3" />
              {uploadPhotoMut.isPending ? 'Mengupload...' : 'Ganti foto profil'}
            </button>
          </div>
        </div>
      </Card>

      {/* Edit Profil */}
      <Card padding="lg">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-primary-500/10">
            <User className="w-4 h-4 text-primary-400" />
          </div>
          <h3 className="font-display font-semibold text-lg">Informasi Profil</h3>
        </div>

        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <Input
            label="Nama Lengkap"
            value={profileForm.full_name}
            onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={isSchool ? 'HP Siswa (Opsional)' : 'Nomor Telepon'}
              type="tel"
              value={profileForm.phone}
              onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
              placeholder="08xxxxxxxxxx"
            />
            <Input
              label={t.parent_phone_label}
              type="tel"
              value={profileForm.parent_phone}
              onChange={(e) => setProfileForm({ ...profileForm, parent_phone: e.target.value })}
              placeholder="628xxxxxxxxxx"
              hint={isSchool ? 'Untuk notifikasi kehadiran' : 'Kontak darurat'}
            />
          </div>

          {isSchool && (
            <Input
              label="Nama Orang Tua/Wali"
              value={profileForm.parent_name}
              onChange={(e) => setProfileForm({ ...profileForm, parent_name: e.target.value })}
              placeholder="Contoh: Bapak Ahmad Santoso"
            />
          )}

          {/* Read-only fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block font-body text-sm font-medium text-text-secondary">
                {t.employee_id_label}
              </label>
              <div className="px-4 py-2.5 rounded-lg bg-surface-muted border border-surface-border font-mono text-sm text-text-muted">
                {user?.employee_id}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block font-body text-sm font-medium text-text-secondary">Email</label>
              <div className="px-4 py-2.5 rounded-lg bg-surface-muted border border-surface-border font-mono text-sm text-text-muted">
                {user?.email}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-surface-border">
            <Button
              type="submit"
              isLoading={updateProfileMut.isPending}
              leftIcon={<Save className="w-4 h-4" />}
            >
              Simpan Profil
            </Button>
          </div>
        </form>
      </Card>

      {/* Face ID */}
      <Card padding="lg">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-success/10">
            <ScanFace className="w-4 h-4 text-success" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-lg">Face ID</h3>
            <p className="text-sm text-text-muted">Daftarkan wajah untuk absensi otomatis</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl border border-surface-border bg-surface-muted/50">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {faceStatus?.enrolled ? (
              <>
                <ShieldCheck className="w-8 h-8 text-success shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-success text-sm">Wajah Sudah Terdaftar</p>
                  <p className="font-mono text-xs text-text-muted truncate">
                    Kualitas: {faceStatus.quality_score ? `${(faceStatus.quality_score * 100).toFixed(0)}%` : '-'}
                    {faceStatus.enrolled_at && ` · ${new Date(faceStatus.enrolled_at).toLocaleDateString('id-ID')}`}
                  </p>
                </div>
              </>
            ) : (
              <>
                <ShieldX className="w-8 h-8 text-text-muted shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text-secondary text-sm">Wajah Belum Terdaftar</p>
                  <p className="font-mono text-xs text-text-muted truncate">Daftarkan wajah untuk bisa absen</p>
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            <Button
              size="sm"
              onClick={() => setOpenEnroll(true)}
              leftIcon={<ScanFace className="w-4 h-4" />}
            >
              {faceStatus?.enrolled ? 'Perbarui' : 'Daftarkan'}
            </Button>
            {faceStatus?.enrolled && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (confirm('Hapus data wajah? Kamu tidak bisa absen sampai daftar ulang.')) {
                    deleteFaceMut.mutate();
                  }
                }}
                isLoading={deleteFaceMut.isPending}
                className="text-danger hover:text-danger"
              >
                Hapus
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Face Enroll Modal */}
      <FaceEnrollModal
        open={openEnroll}
        onClose={() => setOpenEnroll(false)}
        userId={user?.id ?? null}
        userName={user?.full_name}
        onSuccess={() => {
          refetchFace();
          setOpenEnroll(false);
        }}
      />

      {/* Ganti Password */}
      <Card padding="lg">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-accent-500/10">
            <KeyRound className="w-4 h-4 text-accent-400" />
          </div>
          <h3 className="font-display font-semibold text-lg">Ganti Password</h3>
        </div>

        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <Input
            label="Password Lama"
            type="password"
            value={pwForm.current_password}
            onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
            placeholder="Masukkan password saat ini"
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Password Baru"
              type="password"
              value={pwForm.new_password}
              onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
              placeholder="Minimal 6 karakter"
              required
              minLength={6}
            />
            <Input
              label="Konfirmasi Password Baru"
              type="password"
              value={pwForm.confirm_password}
              onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })}
              placeholder="Ulangi password baru"
              required
            />
          </div>

          <div className="flex justify-end pt-2 border-t border-surface-border">
            <Button
              type="submit"
              isLoading={changePwMut.isPending}
              leftIcon={<KeyRound className="w-4 h-4" />}
            >
              Ganti Password
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
