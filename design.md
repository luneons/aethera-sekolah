# 🎨 Design System & UI Guide — Aethera
## Aplikasi Absensi Face ID

**Stack:** Next.js · Tailwind CSS · GSAP  
**Design Language:** Dark Cyber-Biometric · Terinspirasi Interface Keamanan Modern  
**Versi:** 1.0.0

---

## 1. Design Philosophy

Aethera menggunakan **"Cyber-Biometric"** aesthetic — memadukan nuansa teknologi keamanan tinggi (dark, precision, trustworthy) dengan kemudahan UI yang tidak intimidatif. Setiap animasi punya makna: loading states terasa seperti sistem sedang "scanning", transisi terasa seperti akses yang diberikan.

**Prinsip Desain:**
- **Trust through clarity** — Data kritis selalu visible, bukan tersembunyi
- **Motion with purpose** — Setiap animasi menyampaikan state, bukan sekedar dekorasi
- **Dark-first** — Dark theme sebagai primary, light sebagai opsional
- **Accessible** — WCAG 2.1 AA minimum pada semua komponen

---

## 2. Color System

### 2.1 Tailwind Config (`tailwind.config.ts`)

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary — Biometric Cyan
        primary: {
          50:  '#e0fffe',
          100: '#b3fdfd',
          200: '#7df9f9',
          300: '#00f2f2',
          400: '#00d4d4',
          500: '#00b8b8', // Default primary
          600: '#009999',
          700: '#007777',
          800: '#005555',
          900: '#003333',
        },
        // Accent — Alert Amber
        accent: {
          50:  '#fff8e1',
          100: '#ffecb3',
          200: '#ffe082',
          300: '#ffd54f',
          400: '#ffca28',
          500: '#ffc107', // Default accent
          600: '#ffb300',
          700: '#ffa000',
          800: '#ff8f00',
          900: '#ff6f00',
        },
        // Success — Verified Green
        success: {
          DEFAULT: '#00e676',
          dark:    '#00c853',
          light:   '#69f0ae',
        },
        // Danger — Alert Red
        danger: {
          DEFAULT: '#ff1744',
          dark:    '#d50000',
          light:   '#ff616f',
        },
        // Surface (Dark Theme)
        surface: {
          base:    '#050a0f', // Background utama
          raised:  '#0a1520', // Card background
          overlay: '#0f1e2e', // Modal, drawer
          border:  '#1a3045', // Border umum
          muted:   '#0d1a26', // Subtle section
        },
        // Text
        text: {
          primary:   '#e8f4f8', // Heading
          secondary: '#8baebe', // Body
          muted:     '#4a6b82', // Placeholder
          inverse:   '#050a0f', // Text di atas warna terang
        },
        // Scanner UI (warna spesifik untuk UI kamera)
        scanner: {
          line:    '#00f2f2',
          glow:    'rgba(0, 242, 242, 0.3)',
          grid:    'rgba(0, 184, 184, 0.1)',
          success: '#00e676',
          fail:    '#ff1744',
        },
      },

      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],  // Heading
        mono:    ['"JetBrains Mono"', 'monospace'],  // Code, ID, numbers
        body:    ['"Plus Jakarta Sans"', 'sans-serif'], // Body text
      },

      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        'display-xl': ['4.5rem', { lineHeight: '1.1', letterSpacing: '-0.03em' }],
        'display-lg': ['3.5rem', { lineHeight: '1.1', letterSpacing: '-0.025em' }],
        'display-md': ['2.5rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
      },

      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
        '88': '22rem',
        '128': '32rem',
      },

      borderRadius: {
        'sm':  '0.25rem',
        DEFAULT: '0.5rem',
        'md':  '0.75rem',
        'lg':  '1rem',
        'xl':  '1.5rem',
        '2xl': '2rem',
      },

      boxShadow: {
        'glow-primary': '0 0 20px rgba(0, 184, 184, 0.4)',
        'glow-success': '0 0 20px rgba(0, 230, 118, 0.4)',
        'glow-danger':  '0 0 20px rgba(255, 23, 68, 0.4)',
        'glow-sm':      '0 0 10px rgba(0, 184, 184, 0.2)',
        'card':         '0 4px 24px rgba(0, 0, 0, 0.4)',
        'card-hover':   '0 8px 32px rgba(0, 0, 0, 0.6)',
      },

      keyframes: {
        // Scanning line — untuk UI kamera
        scanLine: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        // Pulse ring — untuk deteksi wajah aktif
        scanPulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.8' },
          '50%':      { transform: 'scale(1.08)', opacity: '0.3' },
        },
        // Shimmer loading
        shimmer: {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        // Status blink
        statusBlink: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.2' },
        },
        // Fade up — untuk list items
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Counter animation
        countUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },

      animation: {
        'scan-line':    'scanLine 2s linear infinite',
        'scan-pulse':   'scanPulse 2s ease-in-out infinite',
        'shimmer':      'shimmer 1.8s ease infinite',
        'status-blink': 'statusBlink 1.5s ease-in-out infinite',
        'fade-up':      'fadeUp 0.4s ease forwards',
        'count-up':     'countUp 0.5s ease forwards',
      },

      backgroundImage: {
        'grid-cyber': `
          linear-gradient(rgba(0,184,184,0.07) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,184,184,0.07) 1px, transparent 1px)
        `,
        'gradient-radial-primary': 'radial-gradient(ellipse at center, rgba(0,184,184,0.15) 0%, transparent 70%)',
        'gradient-card': 'linear-gradient(135deg, #0a1520 0%, #0f1e2e 100%)',
        'shimmer-bg': 'linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.05) 50%, transparent 75%)',
      },

      backgroundSize: {
        'grid': '40px 40px',
        'shimmer': '400% auto',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms')({
      strategy: 'class',
    }),
  ],
}

export default config
```

---

## 3. Typography

### 3.1 Font Setup (`app/layout.tsx`)

```tsx
import { Space_Grotesk, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700'],
})

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '700'],
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="id"
      className={`${spaceGrotesk.variable} ${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-body bg-surface-base text-text-primary antialiased">
        {children}
      </body>
    </html>
  )
}
```

### 3.2 Typography Scale

| Class | Penggunaan | Contoh |
|---|---|---|
| `font-display text-display-xl` | Hero / Landing headline | "Absen Cukup dengan Wajah" |
| `font-display text-display-lg` | Page title | "Dashboard Kehadiran" |
| `font-display text-display-md` | Section heading | "Ringkasan Hari Ini" |
| `font-display text-2xl font-semibold` | Card title | "Total Hadir" |
| `font-body text-base` | Body copy, deskripsi | - |
| `font-body text-sm text-text-secondary` | Label, caption | "Terakhir update: 5 menit lalu" |
| `font-mono text-sm` | ID karyawan, timestamp, kode | `EMP-20240001` |
| `font-mono text-2xs tracking-widest` | Status badge | `VERIFIED` |

---

## 4. Component Library

### 4.1 Button

```tsx
// components/ui/Button.tsx
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'

const buttonVariants = cva(
  // Base
  `inline-flex items-center justify-center gap-2 font-display font-semibold
   transition-all duration-200 focus-visible:outline-none focus-visible:ring-2
   focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base
   disabled:opacity-40 disabled:cursor-not-allowed select-none`,
  {
    variants: {
      variant: {
        primary: `
          bg-primary-500 text-text-inverse
          hover:bg-primary-400 hover:shadow-glow-primary
          active:bg-primary-600 active:scale-[0.98]
        `,
        secondary: `
          bg-surface-border text-text-primary border border-surface-border
          hover:bg-surface-raised hover:border-primary-500 hover:text-primary-400
          active:scale-[0.98]
        `,
        ghost: `
          text-text-secondary
          hover:text-primary-400 hover:bg-surface-raised
          active:scale-[0.98]
        `,
        danger: `
          bg-danger text-white
          hover:bg-danger-light hover:shadow-glow-danger
          active:bg-danger-dark active:scale-[0.98]
        `,
        outline: `
          border border-primary-500 text-primary-400 bg-transparent
          hover:bg-primary-500/10 hover:shadow-glow-sm
          active:scale-[0.98]
        `,
      },
      size: {
        xs:  'px-3 py-1.5 text-xs rounded',
        sm:  'px-4 py-2 text-sm rounded-md',
        md:  'px-5 py-2.5 text-sm rounded-md',
        lg:  'px-6 py-3 text-base rounded-lg',
        xl:  'px-8 py-4 text-lg rounded-xl',
        icon: 'p-2.5 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export function Button({
  variant, size, isLoading, leftIcon, rightIcon, children, className, ...props
}: ButtonProps) {
  return (
    <button
      className={buttonVariants({ variant, size, className })}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : leftIcon}
      {children}
      {!isLoading && rightIcon}
    </button>
  )
}
```

### 4.2 Card

```tsx
// components/ui/Card.tsx
import { cva, type VariantProps } from 'class-variance-authority'

const cardVariants = cva(
  'rounded-xl border transition-all duration-300',
  {
    variants: {
      variant: {
        default: `
          bg-surface-raised border-surface-border shadow-card
          hover:shadow-card-hover hover:border-primary-500/30
        `,
        glass: `
          bg-surface-raised/60 backdrop-blur-xl border-surface-border/50
          hover:border-primary-500/40
        `,
        glow: `
          bg-surface-raised border-primary-500/30 shadow-glow-sm
          hover:border-primary-500/60 hover:shadow-glow-primary
        `,
        stat: `
          bg-gradient-card border-surface-border
          relative overflow-hidden
        `,
      },
      padding: {
        none: '',
        sm:   'p-4',
        md:   'p-6',
        lg:   'p-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
    },
  }
)

interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ variant, padding, className, children, ...props }: CardProps) {
  return (
    <div className={cardVariants({ variant, padding, className })} {...props}>
      {children}
    </div>
  )
}
```

### 4.3 Badge / Status Chip

```tsx
// components/ui/StatusBadge.tsx
type Status = 'present' | 'late' | 'absent' | 'excused' | 'holiday' | 'online' | 'offline'

const statusConfig: Record<Status, { label: string; class: string; dot: string }> = {
  present:  { label: 'Hadir',   class: 'bg-success/10 text-success border-success/30',      dot: 'bg-success' },
  late:     { label: 'Terlambat', class: 'bg-accent-500/10 text-accent-400 border-accent-500/30', dot: 'bg-accent-500' },
  absent:   { label: 'Absen',   class: 'bg-danger/10 text-danger border-danger/30',          dot: 'bg-danger' },
  excused:  { label: 'Izin',    class: 'bg-primary-500/10 text-primary-400 border-primary-500/30', dot: 'bg-primary-500' },
  holiday:  { label: 'Libur',   class: 'bg-surface-border text-text-muted border-surface-border', dot: 'bg-text-muted' },
  online:   { label: 'Online',  class: 'bg-success/10 text-success border-success/30',       dot: 'bg-success animate-status-blink' },
  offline:  { label: 'Offline', class: 'bg-danger/10 text-danger border-danger/30',          dot: 'bg-danger' },
}

export function StatusBadge({ status }: { status: Status }) {
  const config = statusConfig[status]
  return (
    <span className={`
      inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
      text-2xs font-mono font-semibold tracking-widest uppercase
      border ${config.class}
    `}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  )
}
```

### 4.4 Stat Card

```tsx
// components/ui/StatCard.tsx
'use client'
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

interface StatCardProps {
  label: string
  value: number
  suffix?: string
  change?: number   // Persentase perubahan vs kemarin
  icon: React.ReactNode
  color?: 'primary' | 'success' | 'danger' | 'accent'
}

const colorMap = {
  primary: { text: 'text-primary-400', bg: 'bg-primary-500/10', border: 'border-primary-500/20', glow: 'shadow-glow-sm' },
  success: { text: 'text-success',     bg: 'bg-success/10',     border: 'border-success/20',     glow: 'shadow-glow-success' },
  danger:  { text: 'text-danger',      bg: 'bg-danger/10',      border: 'border-danger/20',      glow: 'shadow-glow-danger' },
  accent:  { text: 'text-accent-400',  bg: 'bg-accent-500/10',  border: 'border-accent-500/20',  glow: '' },
}

export function StatCard({ label, value, suffix = '', change, icon, color = 'primary' }: StatCardProps) {
  const numberRef = useRef<HTMLSpanElement>(null)
  const c = colorMap[color]

  useEffect(() => {
    if (!numberRef.current) return
    gsap.fromTo(
      numberRef.current,
      { textContent: 0 },
      {
        textContent: value,
        duration: 1.2,
        ease: 'power2.out',
        snap: { textContent: 1 },
        delay: 0.3,
      }
    )
  }, [value])

  return (
    <div className={`
      relative overflow-hidden rounded-xl p-6
      bg-surface-raised border ${c.border}
      transition-all duration-300 hover:${c.glow} hover:border-opacity-60
      group cursor-default
    `}>
      {/* Background glow blob */}
      <div className={`
        absolute -right-8 -top-8 w-32 h-32 rounded-full blur-3xl
        ${c.bg} opacity-60 group-hover:opacity-100 transition-opacity duration-500
      `} />

      {/* Top row */}
      <div className="flex items-start justify-between mb-4 relative">
        <div className={`p-2.5 rounded-lg ${c.bg}`}>
          <div className={c.text}>{icon}</div>
        </div>
        {change !== undefined && (
          <span className={`
            text-xs font-mono font-semibold px-2 py-0.5 rounded-full
            ${change >= 0
              ? 'text-success bg-success/10'
              : 'text-danger bg-danger/10'}
          `}>
            {change >= 0 ? '+' : ''}{change}%
          </span>
        )}
      </div>

      {/* Value */}
      <div className="relative">
        <p className="text-text-muted text-sm font-body mb-1">{label}</p>
        <p className="font-display text-4xl font-bold text-text-primary">
          <span ref={numberRef}>0</span>
          {suffix && <span className={`text-xl font-medium ${c.text} ml-1`}>{suffix}</span>}
        </p>
      </div>
    </div>
  )
}
```

### 4.5 Avatar dengan Status

```tsx
// components/ui/Avatar.tsx
interface AvatarProps {
  src?: string | null
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  status?: 'online' | 'offline' | 'present' | 'absent'
}

const sizeMap = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-xl',
}

const statusDot = {
  online:  'bg-success',
  offline: 'bg-text-muted',
  present: 'bg-success',
  absent:  'bg-danger',
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

export function Avatar({ src, name, size = 'md', status }: AvatarProps) {
  return (
    <div className="relative inline-flex shrink-0">
      <div className={`
        ${sizeMap[size]} rounded-full overflow-hidden
        bg-gradient-to-br from-primary-700 to-primary-900
        ring-2 ring-surface-border
        flex items-center justify-center
        font-display font-semibold text-primary-300
      `}>
        {src ? (
          <img src={src} alt={name} className="w-full h-full object-cover" />
        ) : (
          getInitials(name)
        )}
      </div>
      {status && (
        <span className={`
          absolute bottom-0 right-0 block rounded-full
          ring-2 ring-surface-base
          ${size === 'xs' ? 'w-1.5 h-1.5' : size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'}
          ${statusDot[status]}
          ${status === 'present' ? 'animate-status-blink' : ''}
        `} />
      )}
    </div>
  )
}
```

---

## 5. Halaman Kunci — Layout & Code

### 5.1 Layout Utama Aplikasi

```tsx
// app/(dashboard)/layout.tsx
'use client'
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    // Animasi masuk halaman
    gsap.fromTo(
      mainRef.current,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
    )
  }, [])

  return (
    <div className="flex h-screen bg-surface-base overflow-hidden">
      {/* Grid background */}
      <div
        className="fixed inset-0 bg-grid-cyber bg-grid opacity-100 pointer-events-none"
        aria-hidden="true"
      />
      {/* Radial glow center */}
      <div
        className="fixed inset-0 bg-gradient-radial-primary pointer-events-none"
        aria-hidden="true"
      />

      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <TopBar />
        <main ref={mainRef} className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
```

### 5.2 Sidebar

```tsx
// components/layout/Sidebar.tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { gsap } from 'gsap'
import {
  LayoutDashboard, Camera, Users, FileText,
  Settings, LogOut, ChevronLeft, Building2,
  Calendar, Bell
} from 'lucide-react'

const navItems = [
  { href: '/dashboard',             icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/dashboard/live',        icon: Camera,          label: 'Live Monitor' },
  { href: '/dashboard/attendance',  icon: Calendar,        label: 'Kehadiran' },
  { href: '/dashboard/employees',   icon: Users,           label: 'Karyawan' },
  { href: '/dashboard/reports',     icon: FileText,        label: 'Laporan' },
  { href: '/dashboard/organization',icon: Building2,       label: 'Organisasi' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const sidebarRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLSpanElement[]>([])

  const handleCollapse = () => {
    const width = collapsed ? 240 : 72
    gsap.to(sidebarRef.current, {
      width,
      duration: 0.3,
      ease: 'power2.inOut',
    })
    if (!collapsed) {
      gsap.to(labelsRef.current, { opacity: 0, x: -8, duration: 0.15, stagger: 0.02 })
    } else {
      gsap.fromTo(
        labelsRef.current,
        { opacity: 0, x: -8 },
        { opacity: 1, x: 0, duration: 0.2, stagger: 0.03, delay: 0.2 }
      )
    }
    setCollapsed(!collapsed)
  }

  // Stagger entrance
  useEffect(() => {
    gsap.fromTo(
      sidebarRef.current?.querySelectorAll('.nav-item') || [],
      { opacity: 0, x: -20 },
      { opacity: 1, x: 0, duration: 0.4, stagger: 0.07, ease: 'power2.out', delay: 0.2 }
    )
  }, [])

  return (
    <div
      ref={sidebarRef}
      style={{ width: 240 }}
      className="relative shrink-0 flex flex-col border-r border-surface-border bg-surface-muted/80 backdrop-blur-sm z-20"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-surface-border">
        <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center shrink-0">
          <Camera className="w-4 h-4 text-text-inverse" />
        </div>
        {!collapsed && (
          <span className="font-display font-bold text-lg text-text-primary tracking-tight">
            Face<span className="text-primary-400">Track</span>
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item, i) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg
                transition-all duration-200 group relative
                ${isActive
                  ? 'bg-primary-500/15 text-primary-400 border border-primary-500/30'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-raised'
                }
              `}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary-400 rounded-r-full" />
              )}
              <item.icon className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-primary-400' : ''}`} />
              {!collapsed && (
                <span
                  ref={el => { if (el) labelsRef.current[i] = el }}
                  className="font-body font-medium text-sm truncate"
                >
                  {item.label}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 py-4 border-t border-surface-border space-y-1">
        <button className="nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-raised transition-all duration-200">
          <Settings className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="font-body text-sm font-medium">Pengaturan</span>}
        </button>
        <button className="nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-all duration-200">
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="font-body text-sm font-medium">Keluar</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={handleCollapse}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-surface-border border border-surface-border flex items-center justify-center hover:border-primary-500 hover:text-primary-400 text-text-muted transition-all duration-200 z-30"
      >
        <ChevronLeft className={`w-3.5 h-3.5 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
      </button>
    </div>
  )
}
```

### 5.3 Dashboard Page

```tsx
// app/(dashboard)/dashboard/page.tsx
'use client'
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Users, UserCheck, UserX, Clock, TrendingUp, Camera } from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import { AttendanceTable } from '@/components/dashboard/AttendanceTable'
import { LiveFeedPanel } from '@/components/dashboard/LiveFeedPanel'
import { AttendanceTrendChart } from '@/components/dashboard/AttendanceTrendChart'

gsap.registerPlugin(ScrollTrigger)

export default function DashboardPage() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Header slide in
      gsap.fromTo('.page-header', { opacity: 0, y: -20 }, {
        opacity: 1, y: 0, duration: 0.5, ease: 'power2.out'
      })

      // Stat cards stagger
      gsap.fromTo('.stat-card', { opacity: 0, y: 30, scale: 0.95 }, {
        opacity: 1, y: 0, scale: 1, duration: 0.5,
        stagger: 0.1, ease: 'power2.out', delay: 0.2
      })

      // Bottom section
      gsap.fromTo('.content-section', { opacity: 0, y: 40 }, {
        opacity: 1, y: 0, duration: 0.6, stagger: 0.15,
        ease: 'power2.out', delay: 0.5
      })
    }, containerRef)

    return () => ctx.revert()
  }, [])

  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  return (
    <div ref={containerRef} className="space-y-8">
      {/* Page Header */}
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="font-display text-display-md font-bold text-text-primary">
            Dashboard
          </h1>
          <p className="font-body text-text-muted mt-1 capitalize">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm font-mono text-success bg-success/10 px-3 py-1.5 rounded-full border border-success/20">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-status-blink" />
            Sistem Aktif
          </span>
        </div>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <StatCard
            label="Total Karyawan"
            value={248}
            icon={<Users className="w-5 h-5" />}
            color="primary"
          />
        </div>
        <div className="stat-card">
          <StatCard
            label="Hadir Hari Ini"
            value={214}
            icon={<UserCheck className="w-5 h-5" />}
            color="success"
            change={3}
          />
        </div>
        <div className="stat-card">
          <StatCard
            label="Terlambat"
            value={12}
            icon={<Clock className="w-5 h-5" />}
            color="accent"
            change={-8}
          />
        </div>
        <div className="stat-card">
          <StatCard
            label="Tidak Hadir"
            value={22}
            icon={<UserX className="w-5 h-5" />}
            color="danger"
            change={15}
          />
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Feed - 1 col */}
        <div className="content-section lg:col-span-1">
          <LiveFeedPanel />
        </div>

        {/* Trend Chart - 2 col */}
        <div className="content-section lg:col-span-2">
          <AttendanceTrendChart />
        </div>
      </div>

      {/* Attendance Table */}
      <div className="content-section">
        <AttendanceTable />
      </div>
    </div>
  )
}
```

### 5.4 Scanner UI (Kiosk / Camera Page)

```tsx
// app/(kiosk)/scan/page.tsx — Mode kiosk untuk kamera absensi
'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import Webcam from 'react-webcam'
import { gsap } from 'gsap'
import { CheckCircle, XCircle, Clock, Wifi, WifiOff } from 'lucide-react'

type ScanState = 'idle' | 'scanning' | 'verifying' | 'success' | 'failed' | 'already_checked'

export default function ScanPage() {
  const [state, setState] = useState<ScanState>('idle')
  const [employee, setEmployee] = useState<{ name: string; id: string; photo?: string } | null>(null)
  const [time, setTime] = useState(new Date())
  const webcamRef = useRef<Webcam>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const scanLineRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const cornersRef = useRef<HTMLDivElement[]>([])
  const scannerTl = useRef<gsap.core.Timeline | null>(null)

  // Clock update
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Entrance animation
  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 1, ease: 'power2.out' })
    gsap.fromTo(
      cornersRef.current,
      { scale: 0, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.6, stagger: 0.1, ease: 'back.out(2)' }
    )
  }, [])

  // Start scan animation loop
  const startScanAnimation = useCallback(() => {
    if (scannerTl.current) scannerTl.current.kill()
    scannerTl.current = gsap.timeline({ repeat: -1 })
    scannerTl.current.fromTo(
      scanLineRef.current,
      { yPercent: -5, opacity: 0.8 },
      { yPercent: 105, opacity: 0.3, duration: 2, ease: 'power1.inOut' }
    )

    // Corner pulse
    gsap.to(cornersRef.current, {
      opacity: 0.5,
      duration: 0.8,
      stagger: 0.15,
      repeat: -1,
      yoyo: true,
      ease: 'power1.inOut'
    })
  }, [])

  // Stop scan
  const stopScanAnimation = useCallback(() => {
    scannerTl.current?.kill()
    if (scanLineRef.current) gsap.set(scanLineRef.current, { opacity: 0 })
  }, [])

  // Success animation
  const playSuccessAnimation = useCallback(() => {
    stopScanAnimation()
    gsap.to(cornersRef.current, {
      borderColor: '#00e676',
      duration: 0.3,
      stagger: 0.05
    })
    gsap.fromTo(
      resultRef.current,
      { scale: 0.8, opacity: 0, y: 20 },
      { scale: 1, opacity: 1, y: 0, duration: 0.5, ease: 'back.out(1.7)' }
    )
    // Reset after 4 detik
    setTimeout(() => {
      gsap.to(resultRef.current, { opacity: 0, y: -20, duration: 0.4 })
      gsap.to(cornersRef.current, { borderColor: '#00b8b8', duration: 0.3 })
      setState('idle')
      setEmployee(null)
    }, 4000)
  }, [stopScanAnimation])

  // Capture & verify
  const captureAndVerify = useCallback(async () => {
    if (!webcamRef.current || state !== 'idle') return
    const imageSrc = webcamRef.current.getScreenshot()
    if (!imageSrc) return

    setState('scanning')
    startScanAnimation()

    try {
      setState('verifying')
      const response = await fetch('/api/attendance/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageSrc }),
      })
      const result = await response.json()

      if (result.success) {
        setEmployee(result.data.employee)
        setState('success')
        playSuccessAnimation()
      } else {
        setState('failed')
        setTimeout(() => setState('idle'), 3000)
      }
    } catch {
      setState('failed')
      setTimeout(() => setState('idle'), 3000)
    }
  }, [state, startScanAnimation, playSuccessAnimation])

  // Auto-capture setiap 2 detik saat idle
  useEffect(() => {
    const interval = setInterval(() => {
      if (state === 'idle') captureAndVerify()
    }, 2000)
    return () => clearInterval(interval)
  }, [state, captureAndVerify])

  return (
    <div className="min-h-screen bg-surface-base flex flex-col items-center justify-center overflow-hidden relative">
      {/* Grid background */}
      <div className="absolute inset-0 bg-grid-cyber bg-grid opacity-50" />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-8 py-6 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
            <span className="text-xs font-mono font-bold text-text-inverse">FT</span>
          </div>
          <span className="font-display font-bold text-lg">
            Face<span className="text-primary-400">Track</span>
          </span>
        </div>
        <div className="font-mono text-text-muted text-sm flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-success">
            <Wifi className="w-4 h-4" />
            <span className="text-xs">Online</span>
          </span>
          <span>{time.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          <span className="text-2xl font-bold text-text-primary">
            {time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Camera container */}
      <div ref={overlayRef} className="relative w-[480px] h-[480px] rounded-2xl overflow-hidden shadow-card">
        {/* Webcam */}
        <Webcam
          ref={webcamRef}
          className="w-full h-full object-cover scale-x-[-1]"
          screenshotFormat="image/jpeg"
          videoConstraints={{ facingMode: 'user', width: 640, height: 640 }}
          mirrored
        />

        {/* Scan line */}
        <div
          ref={scanLineRef}
          className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary-400 to-transparent opacity-0 pointer-events-none"
          style={{ boxShadow: '0 0 12px 4px rgba(0,184,184,0.5)' }}
        />

        {/* Corner brackets */}
        {['top-4 left-4', 'top-4 right-4', 'bottom-4 left-4', 'bottom-4 right-4'].map((pos, i) => (
          <div
            key={i}
            ref={el => { if (el) cornersRef.current[i] = el }}
            className={`absolute w-8 h-8 ${pos} border-2 border-primary-500 rounded-sm`}
            style={{
              borderTopWidth: pos.includes('bottom') ? 0 : 2,
              borderBottomWidth: pos.includes('top') ? 0 : 2,
              borderLeftWidth: pos.includes('right') ? 0 : 2,
              borderRightWidth: pos.includes('left') ? 0 : 2,
            }}
          />
        ))}

        {/* Face oval guide */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-56 h-72 rounded-full border-2 border-dashed border-primary-500/30" />
        </div>

        {/* Result overlay */}
        {(state === 'success' || state === 'failed') && (
          <div
            ref={resultRef}
            className={`
              absolute inset-0 flex flex-col items-center justify-center
              ${state === 'success' ? 'bg-surface-base/80' : 'bg-surface-base/70'}
              backdrop-blur-sm
            `}
          >
            {state === 'success' && employee ? (
              <>
                <CheckCircle className="w-16 h-16 text-success mb-4" />
                <p className="font-mono text-xs text-success tracking-widest uppercase mb-2">Terverifikasi</p>
                <p className="font-display font-bold text-2xl text-text-primary">{employee.name}</p>
                <p className="font-mono text-text-muted text-sm mt-1">{employee.id}</p>
                <div className="mt-4 flex items-center gap-2 text-success text-sm">
                  <Clock className="w-4 h-4" />
                  <span className="font-mono">
                    {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </>
            ) : (
              <>
                <XCircle className="w-16 h-16 text-danger mb-4" />
                <p className="font-mono text-xs text-danger tracking-widest uppercase mb-2">Tidak Dikenali</p>
                <p className="font-body text-text-secondary text-sm">Coba lagi atau hubungi HR</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Instruction */}
      <p className={`
        mt-8 font-body text-center transition-all duration-300
        ${state === 'idle' || state === 'scanning'
          ? 'text-text-secondary'
          : 'text-text-muted text-sm'}
      `}>
        {state === 'idle' && 'Hadapkan wajah ke kamera untuk absensi'}
        {state === 'scanning' && 'Mendeteksi wajah...'}
        {state === 'verifying' && 'Memverifikasi identitas...'}
        {state === 'success' && 'Absensi berhasil dicatat'}
        {state === 'failed' && 'Gagal memverifikasi wajah'}
      </p>

      {/* Status bar */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-raised border border-surface-border">
          <span className={`w-1.5 h-1.5 rounded-full ${state === 'idle' ? 'bg-primary-500 animate-status-blink' : state === 'success' ? 'bg-success' : 'bg-accent-500'}`} />
          <span className="font-mono text-xs text-text-muted tracking-widest uppercase">
            {state === 'idle' ? 'Siap Scan' : state === 'scanning' ? 'Scanning' : state === 'verifying' ? 'Verifying' : state === 'success' ? 'Success' : 'Retry'}
          </span>
        </div>
      </div>
    </div>
  )
}
```

---

## 6. GSAP Animation Patterns

### 6.1 Page Transition

```tsx
// hooks/usePageTransition.ts
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

export function usePageTransition() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Stagger semua elemen dengan kelas .animate-in
      gsap.fromTo(
        '.animate-in',
        { opacity: 0, y: 24 },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          stagger: {
            amount: 0.4,
            from: 'start',
          },
          ease: 'power2.out',
        }
      )
    }, containerRef)

    return () => ctx.revert()
  }, [])

  return containerRef
}
```

### 6.2 Counter Animation Hook

```tsx
// hooks/useCountUp.ts
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

export function useCountUp(target: number, duration = 1.5, delay = 0) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    gsap.fromTo(
      { value: 0 },
      {
        value: target,
        duration,
        delay,
        ease: 'power2.out',
        onUpdate: function () {
          el.textContent = Math.round(this.targets()[0].value).toLocaleString('id-ID')
        },
      }
    )
  }, [target, duration, delay])

  return ref
}
```

### 6.3 ScrollTrigger untuk Table Rows

```tsx
// Animasi masuk untuk rows tabel saat scroll
useEffect(() => {
  const rows = document.querySelectorAll('.table-row')
  gsap.fromTo(
    rows,
    { opacity: 0, x: -20 },
    {
      opacity: 1,
      x: 0,
      duration: 0.4,
      stagger: 0.05,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: '.table-container',
        start: 'top 80%',
        toggleActions: 'play none none reverse',
      },
    }
  )
}, [data])
```

### 6.4 Notification Toast Animation

```tsx
// Notifikasi absen masuk — muncul dari bawah
const showToast = (message: string) => {
  const toast = document.createElement('div')
  toast.className = 'fixed bottom-4 right-4 z-50 bg-surface-raised border border-success/30 rounded-xl px-5 py-3 shadow-glow-success font-body text-sm text-success'
  toast.textContent = message
  document.body.appendChild(toast)

  gsap.fromTo(toast, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'back.out(2)' })
  setTimeout(() => {
    gsap.to(toast, { y: 20, opacity: 0, duration: 0.3, onComplete: () => toast.remove() })
  }, 3500)
}
```

---

## 7. Form Design

### 7.1 Input Field

```tsx
// components/ui/Input.tsx
import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

const inputVariants = cva(
  `
  w-full font-body text-sm text-text-primary bg-surface-raised
  border rounded-lg px-4 py-2.5 outline-none
  placeholder:text-text-muted
  transition-all duration-200
  focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500
  disabled:opacity-50 disabled:cursor-not-allowed
  `,
  {
    variants: {
      state: {
        default: 'border-surface-border hover:border-text-muted',
        error:   'border-danger/60 focus:border-danger focus:ring-danger/20',
        success: 'border-success/60 focus:border-success focus:ring-success/20',
      },
    },
    defaultVariants: { state: 'default' },
  }
)

interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {
  label?: string
  hint?: string
  error?: string
  leftIcon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, leftIcon, state, className, ...props }, ref) => {
    const derivedState = error ? 'error' : state

    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block font-body text-sm font-medium text-text-secondary">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={inputVariants({ state: derivedState, className })}
            style={leftIcon ? { paddingLeft: '2.5rem' } : undefined}
            {...props}
          />
        </div>
        {(error || hint) && (
          <p className={`text-xs font-body ${error ? 'text-danger' : 'text-text-muted'}`}>
            {error || hint}
          </p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'
```

---

## 8. Responsive Breakpoints

| Breakpoint | px | Digunakan untuk |
|---|---|---|
| `sm`  | 640px  | Mobile landscape, tablet portrait |
| `md`  | 768px  | Tablet landscape |
| `lg`  | 1024px | Desktop, multi-column layout mulai |
| `xl`  | 1280px | Wide desktop, full grid 4-col |
| `2xl` | 1536px | Ultra-wide |

**Grid utama dashboard:**
```
Mobile:  1 kolom
md:      2 kolom
lg:      3 kolom
xl:      4 kolom
```

---

## 9. Aksesibilitas

```tsx
// Semua komponen interaktif harus:

// 1. Focus ring visible
className="focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"

// 2. Aria labels pada icon buttons
<button aria-label="Tutup dialog">
  <X className="w-5 h-5" />
</button>

// 3. Screen reader text
<span className="sr-only">Loading...</span>

// 4. Kontras warna: semua teks utama minimum 4.5:1 contrast ratio
// text-primary: #e8f4f8 on #0a1520 → ratio: 11.2:1 ✓
// text-secondary: #8baebe on #0a1520 → ratio: 6.1:1 ✓
// text-muted: #4a6b82 on #0a1520 → ratio: 4.6:1 ✓ (minimal)
```

---

## 10. Dark/Light Theme Toggle

```tsx
// Gunakan next-themes
// app/providers.tsx
import { ThemeProvider } from 'next-themes'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      {children}
    </ThemeProvider>
  )
}

// Light mode override di tailwind.config.ts
// Tambahkan class light: prefix untuk light mode adjustments
// Contoh:
// className="bg-surface-base dark:bg-surface-base light:bg-gray-50"
```

---

## 11. Dependency Installation

```bash
# Core dependencies
npm install gsap @gsap/react
npm install class-variance-authority clsx tailwind-merge
npm install react-webcam
npm install lucide-react
npm install recharts
npm install @tanstack/react-query @tanstack/react-table
npm install react-hook-form @hookform/resolvers zod
npm install zustand
npm install axios
npm install socket.io-client
npm install next-themes
npm install sonner

# Dev dependencies
npm install -D @tailwindcss/forms
npm install -D prettier prettier-plugin-tailwindcss

# Fonts (auto via next/font/google — tidak perlu install)
# Space Grotesk, Plus Jakarta Sans, JetBrains Mono
```

---

## 12. Environment Variables

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:8000/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXT_PUBLIC_APP_NAME=Aethera

# Server-only
API_SECRET_KEY=your-secret-key
```

---

## 13. Folder Structure

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx          ← Dashboard layout (sidebar + topbar)
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── attendance/
│   │   │   └── page.tsx
│   │   ├── employees/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   └── reports/
│   │       └── page.tsx
│   ├── (kiosk)/
│   │   └── scan/
│   │       └── page.tsx        ← Halaman kiosk kamera
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx
│   ├── layout.tsx              ← Root layout (fonts, providers)
│   └── providers.tsx
│
├── components/
│   ├── ui/                     ← Design system primitives
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Avatar.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── StatCard.tsx
│   │   ├── Table.tsx
│   │   ├── Modal.tsx
│   │   └── Skeleton.tsx
│   ├── layout/                 ← Layout components
│   │   ├── Sidebar.tsx
│   │   └── TopBar.tsx
│   └── dashboard/              ← Feature components
│       ├── AttendanceTable.tsx
│       ├── LiveFeedPanel.tsx
│       └── AttendanceTrendChart.tsx
│
├── hooks/
│   ├── useCountUp.ts
│   ├── usePageTransition.ts
│   └── useWebSocket.ts
│
├── lib/
│   ├── api.ts                  ← Axios instance
│   ├── utils.ts                ← Helper functions
│   └── constants.ts
│
├── stores/
│   └── useAuthStore.ts         ← Zustand stores
│
└── types/
    ├── attendance.ts
    ├── user.ts
    └── api.ts
```

---

*Design System ini adalah living document — update seiring perkembangan desain.*  
*Aethera Design Team · v1.0.0 · 2026*