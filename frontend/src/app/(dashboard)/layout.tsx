'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { RoleAccent } from '@/components/layout/RoleAccent';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const mainRef = useRef<HTMLElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!mainRef.current) return;
    gsap.fromTo(
      mainRef.current,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
    );
  }, []);

  return (
    <AuthGuard>
      <RoleAccent />
      <div className="flex h-[100dvh] bg-surface-base overflow-hidden">
        <div
          className="fixed inset-0 bg-grid-cyber bg-grid pointer-events-none opacity-100"
          aria-hidden
        />
        <div
          className="fixed inset-0 bg-gradient-radial-primary pointer-events-none"
          aria-hidden
        />
        <Sidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />
        <div className="flex-1 flex flex-col min-w-0 relative z-10">
          <TopBar onMenuClick={() => setSidebarOpen(true)} />
          <main ref={mainRef} className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
