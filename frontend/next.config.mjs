/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: '127.0.0.1' },
      { protocol: 'http', hostname: '192.168.100.142' },
      // Production: tambah domain VPS kamu di sini
      // { protocol: 'https', hostname: 'aethera.sekolahku.com' },
    ],
  },
  async headers() {
    return [
      {
        // Service Worker: no cache so updates apply immediately
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        // Manifest: short cache
        source: '/manifest.json',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
      {
        // Digital Asset Links — wajib MIME application/json + boleh dari mana saja
        // (Android Verifier fetch tanpa cookies). No-cache supaya update fingerprint
        // langsung kepakai.
        source: '/.well-known/assetlinks.json',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Cache-Control', value: 'public, max-age=300' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ];
  },
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
    return [
      { source: '/snapshots/:path*', destination: `${apiBase}/snapshots/:path*` },
      { source: '/photos/:path*', destination: `${apiBase}/photos/:path*` },
    ];
  },
};

export default nextConfig;
