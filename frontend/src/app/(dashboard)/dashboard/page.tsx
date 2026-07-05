'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import { ExecDashboard } from '@/components/dashboards/ExecDashboard';
import { HomeroomDashboard } from '@/components/dashboards/HomeroomDashboard';
import { BkDashboard } from '@/components/dashboards/BkDashboard';

/**
 * Dashboard router — render dashboard sesuai role.
 *
 * - super_admin : Executive view (KPI sekolah-wide, ranking kelas, heatmap)
 * - admin       : Homeroom view (kelas yang dipegang)
 * - hr          : BK triage view (kasus + risk score)
 * - employee    : redirect ke /my-status (sidebar siswa tidak punya menu Dashboard)
 */
export default function DashboardPage() {
  const role = useAuthStore((s) => s.user?.role);
  const router = useRouter();

  useEffect(() => {
    if (role === 'employee') {
      router.replace('/my-status');
    }
  }, [role, router]);

  switch (role) {
    case 'super_admin':
      return <ExecDashboard />;
    case 'admin':
      return <HomeroomDashboard />;
    case 'hr':
      return <BkDashboard />;
    default:
      return null;
  }
}
