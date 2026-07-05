'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log ke console untuk debugging — di production bisa kirim ke Sentry/dsb
    console.error('[Dashboard Error]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-rose-500/15 flex items-center justify-center">
        <AlertTriangle className="w-8 h-8 text-rose-400" />
      </div>
      <div>
        <h2 className="font-display font-bold text-xl mb-2">Terjadi Kesalahan</h2>
        <p className="text-text-muted text-sm max-w-sm leading-relaxed">
          Halaman ini mengalami error. Coba muat ulang — kalau masih bermasalah,
          hubungi admin.
        </p>
        {error.message && (
          <p className="mt-3 font-mono text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 max-w-sm mx-auto break-all">
            {error.message}
          </p>
        )}
      </div>
      <button
        onClick={reset}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium text-sm shadow-glow-primary transition-all"
      >
        <RefreshCw className="w-4 h-4" />
        Coba Lagi
      </button>
    </div>
  );
}
