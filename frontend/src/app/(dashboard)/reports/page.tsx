'use client';

import Link from 'next/link';
import {
  Award,
  BarChart3,
  BookOpen,
  Boxes,
  CalendarRange,
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  Heart,
  Library,
  Receipt,
  Shield,
  ShieldAlert,
  Stethoscope,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReportCategory {
  title: string;
  description: string;
  items: Array<{
    href: string;
    icon: React.ElementType;
    label: string;
    desc: string;
  }>;
}

const CATEGORIES: ReportCategory[] = [
  {
    title: 'Akademik',
    description: 'Performa kelas, mata pelajaran, dan ranking siswa',
    items: [
      {
        href: '/reports/academic/class-performance',
        icon: GraduationCap,
        label: 'Performa per Kelas',
        desc: 'Rerata nilai, % tuntas KKM, GPA per kelas',
      },
      {
        href: '/reports/academic/subject-performance',
        icon: BookOpen,
        label: 'Performa per Mapel',
        desc: 'Rerata, min/max nilai, jumlah ujian',
      },
      {
        href: '/reports/academic/top-students',
        icon: Trophy,
        label: 'Top & Bottom Students',
        desc: 'Ranking GPA — siswa berprestasi & yang butuh perhatian',
      },
    ],
  },
  {
    title: 'Disiplin',
    description: 'Insiden, apresiasi, dan tren perilaku',
    items: [
      {
        href: '/reports/discipline/incidents',
        icon: ShieldAlert,
        label: 'Statistik Insiden KTS',
        desc: 'Distribusi pelanggaran, recidivist, by severity',
      },
      {
        href: '/reports/discipline/appreciation',
        icon: Award,
        label: 'Leaderboard Apresiasi',
        desc: 'Top siswa dengan poin apresiasi tertinggi',
      },
    ],
  },
  {
    title: 'Kehadiran',
    description: 'Rekap absensi harian dan bulanan',
    items: [
      {
        href: '/reports/attendance',
        icon: CalendarRange,
        label: 'Rekap Bulanan',
        desc: 'Per siswa: hadir, telat, izin, alpa + total telat',
      },
    ],
  },
  {
    title: 'Keuangan',
    description: 'Tagihan, pembayaran, dan koleksi',
    items: [
      {
        href: '/reports/finance/billing',
        icon: CreditCard,
        label: 'Ringkasan Tagihan',
        desc: 'Outstanding, collection rate, breakdown per kategori',
      },
      {
        href: '/reports/finance/payments',
        icon: Receipt,
        label: 'Riwayat Pembayaran',
        desc: 'Log semua transaksi pembayaran',
      },
    ],
  },
  {
    title: 'Operasional',
    description: 'UKS, perpustakaan, dan inventaris',
    items: [
      {
        href: '/reports/operational/uks',
        icon: Stethoscope,
        label: 'Ringkasan UKS',
        desc: 'Kunjungan, by class, stok obat low/expiring',
      },
      {
        href: '/reports/operational/library',
        icon: Library,
        label: 'Statistik Perpustakaan',
        desc: 'Aktif loans, telat, top books, top readers',
      },
      {
        href: '/reports/operational/inventory',
        icon: Boxes,
        label: 'Inventaris',
        desc: 'Total nilai aset, by condition, by category, by location',
      },
    ],
  },
  {
    title: 'PPDB',
    description: 'Statistik penerimaan siswa baru',
    items: [
      {
        href: '/reports/ppdb',
        icon: ClipboardList,
        label: 'Statistik per Gelombang',
        desc: 'Conversion rate, status distribusi, total registration fee',
      },
    ],
  },
  {
    title: 'Sistem',
    description: 'Aktivitas user dan audit log',
    items: [
      {
        href: '/reports/audit-activity',
        icon: Shield,
        label: 'Aktivitas User',
        desc: 'Daily login, active users, audit trail summary',
      },
    ],
  },
];

export default function ReportsHubPage() {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Laporan & Analitik
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Pusat Laporan</h1>
        <p className="font-body text-text-muted mt-1">
          Berbagai laporan komprehensif untuk monitoring & decision-making.
        </p>
      </div>

      <div className="space-y-6">
        {CATEGORIES.map((cat) => (
          <section key={cat.title}>
            <div className="mb-3">
              <h2 className="font-display font-bold text-lg">{cat.title}</h2>
              <p className="text-sm text-text-muted">{cat.description}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {cat.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group rounded-lg bg-surface-raised border border-surface-border p-4',
                      'hover:border-primary-500/50 hover:bg-surface-muted/40 transition-colors'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-md bg-primary-500/10 text-primary-300 flex items-center justify-center shrink-0 group-hover:bg-primary-500/20 transition-colors">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-display font-semibold text-text-primary">
                          {item.label}
                        </h3>
                        <p className="text-xs text-text-muted mt-1 line-clamp-2">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
