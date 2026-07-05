'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Lock, LogIn, Phone, ShieldCheck } from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import { parentLogin, setParentToken } from '@/lib/parentApi';

export default function ParentLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => parentLogin(phone.trim(), password),
    onSuccess: (data) => {
      setParentToken(data.access_token, {
        id: data.parent_id,
        name: data.parent_name,
      });
      router.push('/parent');
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-surface-base p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-primary-500/15 text-primary-400 items-center justify-center mb-3">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="font-display text-2xl font-bold">Portal Orang Tua</h1>
          <p className="text-text-muted text-sm mt-1">
            Pantau kehadiran, nilai, dan tagihan anak Anda
          </p>
        </div>

        <div className="rounded-2xl border border-surface-border bg-surface-muted p-6 space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              m.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <label className="text-xs text-text-secondary block mb-1.5">Nomor HP</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08123456789"
                  required
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-surface-border bg-surface-base text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-surface-border bg-surface-base text-sm"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!phone.trim() || !password || m.isPending}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-medium disabled:opacity-50"
            >
              {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              Masuk
            </button>
          </form>

          <div className="text-2xs text-text-muted text-center">
            Belum punya akun? Hubungi pihak sekolah untuk mendapatkan akses.
          </div>
        </div>

        <div className="text-center mt-4">
          <Link href="/login" className="text-xs text-text-muted hover:text-primary-400">
            Login sebagai staff sekolah →
          </Link>
        </div>
      </div>
    </div>
  );
}
