'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * Sync role saat ini ke <html data-role="..."> supaya CSS variables
 * accent berubah otomatis. Mount sekali di dashboard layout.
 */
export function RoleAccent() {
  const role = useAuthStore((s) => s.user?.role);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    if (role) {
      html.setAttribute('data-role', role);
    } else {
      html.removeAttribute('data-role');
    }
    return () => {
      html.removeAttribute('data-role');
    };
  }, [role]);

  return null;
}
