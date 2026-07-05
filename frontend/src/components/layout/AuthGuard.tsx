'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api, { type Envelope } from '@/lib/api';
import { useAuthStore, type AuthUser } from '@/stores/useAuthStore';

// Halaman yang HANYA boleh diakses admin/hr/super_admin
const ADMIN_ONLY_PATHS = ['/dashboard', '/attendance', '/employees', '/reports', '/organization', '/face-test'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!accessToken) {
      router.replace('/login');
    }
  }, [accessToken, router]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['me'],
    enabled: !!accessToken,
    queryFn: async () => {
      const r = await api.get<Envelope<AuthUser>>('/auth/me');
      return r.data.data;
    },
  });

  useEffect(() => {
    if (data) setUser(data);
  }, [data, setUser]);

  // Redirect employee yang coba akses halaman admin
  useEffect(() => {
    if (!user) return;
    if (user.role !== 'employee') return;

    const currentPath = window.location.pathname;
    const isAdminPage = ADMIN_ONLY_PATHS.some((p) => currentPath.startsWith(p));
    if (isAdminPage) {
      router.replace('/my-attendance');
    }
  }, [user, router]);

  if (!accessToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-base">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-base">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin mx-auto" />
          <p className="font-mono text-xs text-text-muted tracking-widest uppercase">Memuat sesi...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-base">
        <p className="text-text-muted">Sesi tidak valid. Mengarahkan ke login...</p>
      </div>
    );
  }

  return <>{children}</>;
}
