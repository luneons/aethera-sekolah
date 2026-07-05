import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700'],
});
const body = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600'],
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '700'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  // Aktifkan keduanya — browser pilih sesuai prefers-color-scheme (kita override via class).
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fef9f3' },
    { media: '(prefers-color-scheme: dark)', color: '#050a0f' },
  ],
};

export const metadata: Metadata = {
  title: 'Aethera — Platform Sekolah Modern',
  description: 'Platform manajemen sekolah modern dengan absensi pengenalan wajah, gamifikasi, dan LMS terintegrasi',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Aethera',
    startupImage: [
      // iPhone 14 Pro Max
      { url: '/icons/splash-1290x2796.png', media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)' },
      // iPhone 14 / 13 / 12
      { url: '/icons/splash-1170x2532.png', media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)' },
      // iPhone SE / 8
      { url: '/icons/splash-750x1334.png', media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)' },
    ],
  },
  icons: {
    apple: [
      { url: '/icons/icon-152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply auto-theme based on time of day SEBELUM React hydrate.
            Ini mencegah flash of wrong theme saat first paint.
            Logic: kalau user belum override manual, set theme by current hour. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var manual = localStorage.getItem('aethera-theme-manual');
                  var saved = localStorage.getItem('theme');
                  var theme;
                  if (manual === '1' && (saved === 'light' || saved === 'dark')) {
                    theme = saved;
                  } else {
                    var hour = new Date().getHours();
                    theme = (hour >= 6 && hour < 18) ? 'light' : 'dark';
                  }
                  var d = document.documentElement;
                  d.classList.remove('light', 'dark');
                  d.classList.add(theme);
                  d.style.colorScheme = theme;
                  // Sync ke next-themes localStorage agar tidak override saat hydrate
                  localStorage.setItem('theme', theme);
                } catch(e){}
              })();
            `,
          }}
        />
        {/* Register service worker as early as possible — supaya PWA tools
            (PWABuilder, Lighthouse) langsung detect saat halaman pertama load. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .catch(function (e) { console.warn('[PWA] SW register failed', e); });
                });
              }
            `,
          }}
        />
      </head>
      <body className="font-body bg-surface-base text-text-primary antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
