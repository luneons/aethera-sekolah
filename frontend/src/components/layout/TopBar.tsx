'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound, LogOut, Menu, ScanFace, Settings, User } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { NotificationBell } from './NotificationBell';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOrgMode } from '@/stores/useOrgMode';
import { getRoleLabel } from '@/lib/terminology';
import { useQueryClient } from '@tanstack/react-query';

interface TopBarProps {
  onMenuClick?: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const [now, setNow] = useState(new Date());
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const { mode } = useOrgMode();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Close dropdown saat klik di luar
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    if (profileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileOpen]);

  const handleLogout = () => {
    setProfileOpen(false);
    clear();
    queryClient.clear();
    router.push('/login');
  };

  const isEmployee = user?.role === 'employee';

  return (
    <header className="h-14 sm:h-16 border-b border-surface-border bg-surface-muted/60 backdrop-blur-sm flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10">
      <div className="flex items-center gap-3">
        {/* Hamburger menu - mobile only */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-2 rounded-md text-text-muted hover:text-primary-400 hover:bg-surface-raised transition-colors"
          aria-label="Buka menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <span className="font-mono text-xs text-text-muted tracking-widest uppercase hidden md:block">
          {now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
        <span className="font-mono text-lg sm:text-xl font-bold text-text-primary">
          {now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Theme toggle */}
        <ThemeToggle />

        {/* Notifications */}
        <NotificationBell />

        {/* Mode Kiosk — hanya untuk admin */}
        {!isEmployee && (
          <Link
            href="/scan"
            target="_blank"
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-primary-500/40 text-primary-400 hover:bg-primary-500/10 hover:shadow-glow-sm transition-all text-sm font-display font-semibold"
          >
            <ScanFace className="w-4 h-4" />
            Mode Kiosk
          </Link>
        )}

        {/* Profile dropdown */}
        {user && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setProfileOpen((o) => !o)}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-raised transition-colors"
              aria-label="Menu profil"
            >
              <Avatar name={user.full_name} src={user.photo_url} size="sm" status="online" />
              <div className="hidden md:block text-left">
                <p className="font-body font-medium text-sm leading-tight">{user.full_name}</p>
                <p className="font-mono text-2xs text-text-muted uppercase tracking-widest">
                  {getRoleLabel(user.role, mode)}
                </p>
              </div>
              {/* Chevron */}
              <svg
                className={`w-3.5 h-3.5 text-text-muted transition-transform hidden md:block ${profileOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown menu */}
            {profileOpen && (
              <>
                <div
                  className="lg:hidden fixed inset-0 z-[9998] bg-surface-base/40"
                  onClick={() => setProfileOpen(false)}
                />
                <div className="fixed left-2 right-2 top-[3.75rem] lg:absolute lg:left-auto lg:right-0 lg:top-full lg:mt-2 lg:w-56 rounded-xl border border-surface-border bg-surface-raised shadow-card-hover z-[9999] overflow-hidden animate-fade-up">
                {/* User info header */}
                <div className="px-4 py-3 border-b border-surface-border">
                  <p className="font-body font-semibold text-sm text-text-primary truncate">{user.full_name}</p>
                  <p className="font-mono text-xs text-text-muted truncate">{user.email}</p>
                  <span className="inline-block mt-1 font-mono text-2xs text-primary-400 bg-primary-500/10 px-2 py-0.5 rounded-full uppercase tracking-widest">
                    {getRoleLabel(user.role, mode)}
                  </span>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <Link
                    href="/profile"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors"
                  >
                    <User className="w-4 h-4 text-text-muted" />
                    Profil Saya
                  </Link>

                  <Link
                    href="/profile#password"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors"
                  >
                    <KeyRound className="w-4 h-4 text-text-muted" />
                    Ganti Password
                  </Link>

                  {!isEmployee && (
                    <Link
                      href="/organization"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors"
                    >
                      <Settings className="w-4 h-4 text-text-muted" />
                      Pengaturan
                    </Link>
                  )}
                </div>

                <div className="border-t border-surface-border py-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Keluar
                  </button>
                </div>
              </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
