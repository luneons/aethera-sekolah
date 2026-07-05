'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { gsap } from 'gsap';
import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  Brain,
  Building2,
  Calendar,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  Eye,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Heart,
  LayoutDashboard,
  Library,
  LogOut,
  Mail,
  Megaphone,
  MessageCircle,
  QrCode,
  Receipt,
  School,
  ScanFace,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Trophy,
  UserCheck,
  UserCircle,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOrgMode } from '@/stores/useOrgMode';
import { getRoleLabel } from '@/lib/terminology';
import { ChatBadge } from './ChatBadge';
import { useQueryClient } from '@tanstack/react-query';

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  badge?: string;
  /** Sub-menu items (optional) — kalau ada, item ini jadi expandable group. */
  children?: NavItem[];
}

interface NavGroup {
  title: string | null;
  items: NavItem[];
}

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const ROLE_PERSONA: Record<
  string,
  { icon: LucideIcon; subtitle: string; accentLabel: string }
> = {
  super_admin: { icon: ShieldCheck, subtitle: 'Kepala Sekolah', accentLabel: 'Executive' },
  admin: { icon: School, subtitle: 'Wali Kelas', accentLabel: 'Homeroom' },
  hr: { icon: Stethoscope, subtitle: 'Guru BK', accentLabel: 'Konseling' },
  employee: { icon: GraduationCap, subtitle: 'Siswa', accentLabel: 'Personal' },
};

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);
  const user = useAuthStore((s) => s.user);
  const { mode, t, isSchool } = useOrgMode();
  const queryClient = useQueryClient();

  const role = user?.role ?? 'employee';
  const persona = ROLE_PERSONA[role] ?? ROLE_PERSONA.employee;

  // Expand-state untuk dropdown menu (key = href parent).
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Submenu untuk Pengguna — adaptif per role yang login.
  const usersSubmenu: NavItem[] = useMemo(() => {
    if (role === 'super_admin') {
      return [
        { href: '/employees?role=all', icon: Users, label: 'Semua' },
        { href: '/employees?role=employee', icon: GraduationCap, label: 'Siswa' },
        { href: '/employees?role=admin', icon: School, label: 'Wali Kelas / Guru' },
        { href: '/employees?role=hr', icon: Stethoscope, label: 'Guru BK' },
      ];
    }
    // Wali kelas & BK ga butuh lihat kepsek
    return [
      { href: '/employees?role=employee', icon: GraduationCap, label: 'Siswa' },
      { href: '/employees?role=admin', icon: School, label: 'Wali Kelas / Guru' },
      { href: '/employees?role=hr', icon: Stethoscope, label: 'Guru BK' },
    ];
  }, [role]);

  // Submenu Laporan — kategori per modul
  const reportsSubmenu: NavItem[] = useMemo(() => {
    const items: NavItem[] = [
      { href: '/reports', icon: BarChart3, label: 'Pusat Laporan' },
      { href: '/reports/attendance', icon: CalendarRange, label: 'Kehadiran' },
      { href: '/reports/academic/class-performance', icon: GraduationCap, label: 'Akademik: Kelas' },
      { href: '/reports/academic/subject-performance', icon: BookOpen, label: 'Akademik: Mapel' },
      { href: '/reports/academic/top-students', icon: Trophy, label: 'Akademik: Ranking' },
      { href: '/reports/discipline/incidents', icon: ShieldAlert, label: 'Disiplin: KTS' },
      { href: '/reports/discipline/appreciation', icon: Heart, label: 'Disiplin: Apresiasi' },
    ];
    if (role === 'super_admin' || role === 'admin') {
      items.push(
        { href: '/reports/finance/billing', icon: CreditCard, label: 'Keuangan: Tagihan' },
        { href: '/reports/finance/payments', icon: Receipt, label: 'Keuangan: Pembayaran' },
      );
    }
    items.push(
      { href: '/reports/operational/uks', icon: Stethoscope, label: 'UKS' },
      { href: '/reports/operational/library', icon: Library, label: 'Perpustakaan' },
    );
    if (role === 'super_admin' || role === 'admin') {
      items.push(
        { href: '/reports/operational/inventory', icon: Boxes, label: 'Inventaris' },
        { href: '/reports/ppdb', icon: ClipboardList, label: 'PPDB' },
      );
    }
    if (role === 'super_admin') {
      items.push(
        { href: '/reports/audit-activity', icon: Shield, label: 'Aktivitas Sistem' },
      );
    }
    return items;
  }, [role]);

  // Bangun nav groups berdasarkan role + mode organisasi.
  const navGroups: NavGroup[] = useMemo(() => {
    if (!user) return [];

    if (role === 'employee') {
      const groups: NavGroup[] = [
        {
          title: null,
          items: [
            { href: '/absen', icon: ScanFace, label: 'Absen Sekarang' },
            { href: '/my-attendance', icon: Calendar, label: 'Absensi Saya' },
            { href: '/leave', icon: ClipboardList, label: 'Izin / Sakit' },
          ],
        },
      ];
      if (isSchool) {
        groups.push({
          title: 'Pembelajaran',
          items: [
            { href: '/my-assignments', icon: BookOpen, label: 'Tugas Saya' },
            { href: '/my-materials', icon: Library, label: 'Materi Pelajaran' },
            { href: '/timetable', icon: Calendar, label: 'Jadwal Pelajaran' },
            { href: '/rapor', icon: Award, label: 'Rapor Saya' },
          ],
        });
        groups.push({
          title: 'Disiplin & Prestasi',
          items: [
            { href: '/my-status', icon: GraduationCap, label: 'Status Saya' },
            { href: '/leaderboard', icon: Trophy, label: 'Papan Peringkat' },
            { href: '/extracurricular', icon: Trophy, label: 'Ekstrakurikuler' },
          ],
        });
        groups.push({
          title: 'Layanan Sekolah',
          items: [
            { href: '/counseling', icon: Heart, label: 'Konsultasi BK' },
            { href: '/library', icon: Library, label: 'Perpustakaan' },
            { href: '/events', icon: CalendarDays, label: 'Acara Sekolah' },
          ],
        });
        groups.push({
          title: 'Keuangan',
          items: [
            { href: '/my-bills', icon: Wallet, label: 'Tagihan Saya' },
          ],
        });
      }
      groups.push({
        title: 'Komunikasi',
        items: [
          { href: '/chat', icon: MessageCircle, label: 'Chat' },
          { href: '/announcements', icon: Megaphone, label: 'Pengumuman' },
        ],
      });
      groups.push({
        title: 'Akun',
        items: [
          { href: '/notifications', icon: Bell, label: 'Notifikasi' },
          { href: '/profile', icon: UserCircle, label: 'Profil Saya' },
          { href: '/security', icon: ShieldCheck, label: 'Keamanan & 2FA' },
        ],
      });
      return groups;
    }

    // ── KEPSEK / SUPER ADMIN ─────────────────────────────────────────────
    if (role === 'super_admin') {
      const groups: NavGroup[] = [
        {
          title: null,
          items: [{ href: '/dashboard', icon: LayoutDashboard, label: 'Ringkasan Sekolah' }],
        },
      ];
      if (isSchool) {
        groups.push({
          title: 'Disiplin Sekolah',
          items: [
            { href: '/leaderboard', icon: Trophy, label: 'Papan Peringkat' },
            { href: '/approvals', icon: ShieldAlert, label: 'Persetujuan KTS' },
            { href: '/watchlist', icon: Eye, label: 'Watch List' },
          ],
        });
        groups.push({
          title: 'Pembelajaran',
          items: [
            { href: '/gradebook', icon: ClipboardCheck, label: 'Nilai Siswa' },
            { href: '/assignments', icon: BookOpen, label: 'Tugas & Nilai' },
            { href: '/materials', icon: Library, label: 'Materi' },
            { href: '/subjects', icon: GraduationCap, label: 'Mata Pelajaran' },
            { href: '/timetable', icon: Calendar, label: 'Jadwal Pelajaran' },
            { href: '/subject-attendance', icon: ClipboardList, label: 'Absensi Mapel' },
            { href: '/rapor', icon: Award, label: 'Rapor Siswa' },
          ],
        });
        groups.push({
          title: 'Aktivitas Sekolah',
          items: [
            { href: '/extracurricular', icon: Trophy, label: 'Ekstrakurikuler' },
            { href: '/library', icon: Library, label: 'Perpustakaan' },
            { href: '/events', icon: CalendarDays, label: 'Acara Sekolah' },
            { href: '/counseling', icon: Heart, label: 'Konsultasi BK' },
          ],
        });
      }
      groups.push({
        title: 'Manajemen',
        items: [
          { href: '/employees', icon: Users, label: 'Pengguna', children: usersSubmenu },
          { href: '/parents', icon: Heart, label: 'Akun Orang Tua' },
          { href: '/student-status', icon: ClipboardList, label: 'Status Disiplin' },
          { href: '/homeroom-assign', icon: UserCheck, label: 'Tugas Wali Kelas' },
          { href: '/attendance', icon: Calendar, label: t.nav_attendance },
          { href: '/leave', icon: Mail, label: 'Pengajuan Izin' },
          { href: '/import', icon: FileSpreadsheet, label: 'Import Siswa' },
          { href: '/ppdb', icon: Award, label: 'PPDB Online' },
        ],
      });
      groups.push({
        title: 'Keuangan',
        items: [
          { href: '/billing', icon: CreditCard, label: 'SPP & Tagihan' },
        ],
      });
      groups.push({
        title: 'Administrasi',
        items: [
          { href: '/letters', icon: FileText, label: 'Surat Otomatis' },
        ],
      });
      groups.push({
        title: 'Operasional',
        items: [
          { href: '/face-test', icon: ScanFace, label: 'Tes Wajah' },
          { href: '/schedule', icon: Clock, label: 'Jadwal Sekolah' },
          { href: '/attendance-mode', icon: QrCode, label: 'Mode Absensi & QR' },
          { href: '/attendance-import', icon: FileSpreadsheet, label: 'Import CSV Absensi' },
          { href: '/reports', icon: BarChart3, label: 'Laporan', children: reportsSubmenu },
          { href: '/digest', icon: Mail, label: 'Digest Mingguan' },
          { href: '/uks', icon: Stethoscope, label: 'UKS / Klinik' },
          { href: '/inventory', icon: Boxes, label: 'Inventaris' },
          { href: '/audit-log', icon: Shield, label: 'Audit Log' },
          { href: '/organization', icon: Building2, label: t.nav_organization },
        ],
      });
      groups.push({
        title: 'Komunikasi',
        items: [
          { href: '/chat', icon: MessageCircle, label: 'Chat' },
          { href: '/chat-monitor', icon: Eye, label: 'Monitor Chat' },
          { href: '/announcements', icon: Megaphone, label: 'Pengumuman' },
          { href: '/broadcast', icon: Megaphone, label: 'Broadcast Push' },
        ],
      });
      groups.push({
        title: 'Akun',
        items: [
          { href: '/notifications', icon: Bell, label: 'Notifikasi' },
          { href: '/profile', icon: UserCircle, label: 'Profil Saya' },
          { href: '/security', icon: ShieldCheck, label: 'Keamanan & 2FA' },
        ],
      });
      return groups;
    }

    // ── WALI KELAS / ADMIN ───────────────────────────────────────────────
    if (role === 'admin') {
      const groups: NavGroup[] = [
        {
          title: null,
          items: [{ href: '/dashboard', icon: LayoutDashboard, label: 'Kelas Saya' }],
        },
      ];
      if (isSchool) {
        groups.push({
          title: 'Pembelajaran',
          items: [
            { href: '/gradebook', icon: ClipboardCheck, label: 'Nilai Siswa' },
            { href: '/assignments', icon: BookOpen, label: 'Tugas & Nilai' },
            { href: '/materials', icon: Library, label: 'Materi Saya' },
            { href: '/timetable', icon: Calendar, label: 'Jadwal Pelajaran' },
            { href: '/subject-attendance', icon: ClipboardList, label: 'Absensi Mapel' },
            { href: '/rapor', icon: Award, label: 'Rapor Siswa' },
          ],
        });
        groups.push({
          title: 'Pantau Siswa',
          items: [
            { href: '/student-status', icon: ClipboardList, label: 'Status Siswa' },
            { href: '/leaderboard', icon: Trophy, label: 'Papan Peringkat' },
            { href: '/kts/new', icon: ShieldAlert, label: 'Lapor KTS' },
          ],
        });
        groups.push({
          title: 'Aktivitas Sekolah',
          items: [
            { href: '/extracurricular', icon: Trophy, label: 'Ekstrakurikuler' },
            { href: '/library', icon: Library, label: 'Perpustakaan' },
            { href: '/events', icon: CalendarDays, label: 'Acara Sekolah' },
          ],
        });
      }
      groups.push({
        title: 'Operasional',
        items: [
          { href: '/attendance', icon: Calendar, label: t.nav_attendance },
          { href: '/leave', icon: Mail, label: 'Pengajuan Izin' },
          { href: '/employees', icon: Users, label: 'Pengguna', children: usersSubmenu },
          { href: '/parents', icon: Heart, label: 'Akun Orang Tua' },
          { href: '/reports', icon: BarChart3, label: 'Laporan', children: reportsSubmenu },
        ],
      });
      groups.push({
        title: 'Keuangan & Surat',
        items: [
          { href: '/billing', icon: CreditCard, label: 'SPP & Tagihan' },
          { href: '/letters', icon: FileText, label: 'Surat Otomatis' },
        ],
      });
      groups.push({
        title: 'Komunikasi',
        items: [
          { href: '/chat', icon: MessageCircle, label: 'Chat' },
          { href: '/chat-monitor', icon: Eye, label: 'Monitor Chat' },
          { href: '/announcements', icon: Megaphone, label: 'Pengumuman' },
        ],
      });
      groups.push({
        title: 'Akun',
        items: [
          { href: '/notifications', icon: Bell, label: 'Notifikasi' },
          { href: '/profile', icon: UserCircle, label: 'Profil Saya' },
          { href: '/security', icon: ShieldCheck, label: 'Keamanan & 2FA' },
        ],
      });
      return groups;
    }

    // ── GURU BK / HR ─────────────────────────────────────────────────────
    if (role === 'hr') {
      const groups: NavGroup[] = [
        {
          title: null,
          items: [{ href: '/dashboard', icon: LayoutDashboard, label: 'Triage Kasus' }],
        },
      ];
      if (isSchool) {
        groups.push({
          title: 'Kasus & Intervensi',
          items: [
            { href: '/watchlist', icon: Eye, label: 'Watch List' },
            { href: '/mood-tracker', icon: Heart, label: 'Mood Tracker' },
            { href: '/counseling', icon: Heart, label: 'Konsultasi BK' },
            { href: '/student-status', icon: ClipboardList, label: 'Status Siswa' },
            { href: '/kts/new', icon: ShieldAlert, label: 'Lapor KTS' },
          ],
        });
        groups.push({
          title: 'Aktivitas Sekolah',
          items: [
            { href: '/extracurricular', icon: Trophy, label: 'Ekstrakurikuler' },
            { href: '/events', icon: CalendarDays, label: 'Acara Sekolah' },
          ],
        });
      }
      groups.push({
        title: 'Pendukung',
        items: [
          { href: '/leaderboard', icon: Trophy, label: 'Papan Peringkat' },
          { href: '/employees', icon: Users, label: 'Pengguna', children: usersSubmenu },
          { href: '/attendance', icon: Calendar, label: t.nav_attendance },
          { href: '/leave', icon: Mail, label: 'Pengajuan Izin' },
        ],
      });
      groups.push({
        title: 'Komunikasi',
        items: [
          { href: '/chat', icon: MessageCircle, label: 'Chat' },
          { href: '/chat-monitor', icon: Eye, label: 'Monitor Chat' },
          { href: '/announcements', icon: Megaphone, label: 'Pengumuman' },
        ],
      });
      groups.push({
        title: 'Akun',
        items: [
          { href: '/notifications', icon: Bell, label: 'Notifikasi' },
          { href: '/profile', icon: UserCircle, label: 'Profil Saya' },
          { href: '/security', icon: ShieldCheck, label: 'Keamanan & 2FA' },
        ],
      });
      return groups;
    }

    return [];
  }, [user, role, isSchool, usersSubmenu, reportsSubmenu, t.nav_attendance, t.nav_organization]);

  // Auto-expand parent kalau current pathname match salah satu child.
  useEffect(() => {
    const next: Record<string, boolean> = { ...expanded };
    let changed = false;
    for (const group of navGroups) {
      for (const item of group.items) {
        if (item.children && pathname.startsWith(item.href)) {
          if (!next[item.href]) {
            next[item.href] = true;
            changed = true;
          }
        }
      }
    }
    if (changed) setExpanded(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, navGroups.length]);

  useEffect(() => {
    gsap.fromTo(
      '.nav-item',
      { opacity: 0, x: -16 },
      { opacity: 1, x: 0, duration: 0.35, stagger: 0.04, ease: 'power2.out', delay: 0.08 }
    );
    gsap.fromTo(
      '.nav-section-title',
      { opacity: 0 },
      { opacity: 1, duration: 0.4, stagger: 0.06, ease: 'power2.out', delay: 0.05 }
    );
  }, [navGroups.length]);

  const handleLogout = () => {
    clear();
    queryClient.clear();
    router.push('/login');
  };

  const handleNavClick = () => {
    onMobileClose?.();
  };

  const PersonaIcon = persona.icon;

  // Determine kalau child item lagi aktif (pathname + searchParam role match).
  const isChildActive = (childHref: string): boolean => {
    const [path, query] = childHref.split('?');
    if (pathname !== path) return false;
    if (!query) return true;
    const target = new URLSearchParams(query);
    const current = searchParams;
    for (const [k, v] of target.entries()) {
      if (current.get(k) !== v) return false;
    }
    return true;
  };

  const sidebarContent = (
    <>
      <div className="px-5 py-5 border-b border-surface-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 shadow-glow-sm ring-1 ring-surface-border bg-surface-base">
              <img src="/logo.png" alt="Aethera" className="w-full h-full object-cover" />
            </div>
            <span className="font-display font-bold text-lg text-text-primary tracking-tight">
              <span className="text-primary-400">AETHERA</span>
            </span>
          </div>
          <button
            onClick={onMobileClose}
            className="lg:hidden p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-border transition-colors"
            aria-label="Tutup menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {user && (
          <div className="mt-4 flex items-center gap-2 rounded-lg role-accent-bg-soft border role-accent-border px-2.5 py-2">
            <PersonaIcon className="w-4 h-4 role-accent-text shrink-0" />
            <div className="min-w-0">
              <p className="font-mono text-2xs uppercase tracking-widest role-accent-text">
                {persona.accentLabel}
              </p>
              <p className="font-display font-semibold text-sm text-text-primary truncate leading-tight">
                {persona.subtitle}
              </p>
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {navGroups.map((group, groupIdx) => (
          <div key={group.title ?? `group-${groupIdx}`} className="mb-3">
            {group.title && (
              <p
                className={cn(
                  'nav-section-title px-3 pt-3 pb-1.5 font-mono text-2xs uppercase tracking-[0.2em] text-text-muted',
                  groupIdx > 0 && 'border-t border-surface-border/60 mt-1'
                )}
              >
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const hasChildren = !!item.children?.length;
                const isExpanded = !!expanded[item.href];
                const isActive =
                  !hasChildren &&
                  (pathname === item.href ||
                    (item.href !== '/' && pathname.startsWith(`${item.href}/`)));
                const childActive =
                  hasChildren &&
                  pathname.startsWith(item.href);

                if (hasChildren) {
                  return (
                    <div key={item.href}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded({ ...expanded, [item.href]: !isExpanded })
                        }
                        className={cn(
                          'nav-item w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group relative',
                          childActive
                            ? 'role-accent-bg-soft role-accent-text border role-accent-border'
                            : 'text-text-muted hover:text-text-secondary hover:bg-surface-raised border border-transparent'
                        )}
                      >
                        {childActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full role-accent-bar" />
                        )}
                        <item.icon className="w-[18px] h-[18px] shrink-0 transition-transform group-hover:scale-110" />
                        <span className="flex-1 text-left font-body font-medium text-sm truncate">
                          {item.label}
                        </span>
                        <ChevronDown
                          className={cn(
                            'w-4 h-4 transition-transform duration-200',
                            isExpanded && 'rotate-180'
                          )}
                        />
                      </button>
                      {isExpanded && item.children && (
                        <div className="ml-3 mt-1 mb-1 pl-3 border-l border-surface-border/60 space-y-0.5">
                          {item.children.map((child) => {
                            const active = isChildActive(child.href);
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                onClick={handleNavClick}
                                className={cn(
                                  'flex items-center gap-2 px-3 py-1.5 rounded-md transition-all duration-200 group',
                                  active
                                    ? 'role-accent-text bg-surface-raised'
                                    : 'text-text-muted hover:text-text-secondary hover:bg-surface-raised'
                                )}
                              >
                                <child.icon className="w-3.5 h-3.5 shrink-0" />
                                <span className="font-body text-2xs sm:text-xs truncate">
                                  {child.label}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleNavClick}
                    className={cn(
                      'nav-item flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group relative',
                      isActive
                        ? 'role-accent-bg-soft role-accent-text border role-accent-border'
                        : 'text-text-muted hover:text-text-secondary hover:bg-surface-raised border border-transparent'
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full role-accent-bar" />
                    )}
                    <item.icon className="w-[18px] h-[18px] shrink-0 transition-transform group-hover:scale-110" />
                    <span className="flex-1 font-body font-medium text-sm truncate">
                      {item.label}
                    </span>
                    {item.badge && (
                      <span className="font-mono text-2xs px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        {item.badge}
                      </span>
                    )}
                    {item.href === '/chat' && <ChatBadge />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-surface-border">
        {user && (
          <div className="px-3 py-2 mb-1">
            <p className="font-body font-medium text-sm text-text-primary truncate">
              {user.full_name}
            </p>
            <p className="font-mono text-2xs text-text-muted uppercase tracking-wider">
              {getRoleLabel(user.role, mode)}
            </p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="nav-item w-full flex items-center gap-3 px-3 py-2 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-all duration-200"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          <span className="font-body text-sm font-medium">Keluar</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside className="hidden lg:flex relative shrink-0 w-[240px] flex-col border-r border-surface-border bg-surface-muted/80 backdrop-blur-sm z-20">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-surface-base/60 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] flex flex-col bg-surface-muted border-r border-surface-border shadow-card-hover animate-slide-in-left">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
