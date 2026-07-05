'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';

export default function HomePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) {
      router.replace('/login');
      return;
    }
    if (user?.role === 'employee') {
      router.replace('/my-attendance');
    } else {
      router.replace('/dashboard');
    }
  }, [accessToken, user, router]);

  return null;
}
