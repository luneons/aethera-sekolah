'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Key,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import {
  disable2FA,
  fetch2FAStatus,
  regenerateRecoveryCodes,
  setup2FAInit,
  setup2FAVerify,
  type SetupInitOut,
} from '@/lib/twoFactorApi';
import { cn } from '@/lib/utils';

export default function SecurityPage() {
  const qc = useQueryClient();
  const { data: status, isLoading } = useQuery({
    queryKey: ['2fa-status'],
    queryFn: fetch2FAStatus,
  });

  const [setupData, setSetupData] = useState<SetupInitOut | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [recoveryDisplay, setRecoveryDisplay] = useState<string[] | null>(null);
  const [showDisable, setShowDisable] = useState(false);

  const initMut = useMutation({
    mutationFn: setup2FAInit,
    onSuccess: (data) => {
      setSetupData(data);
      setVerifyCode('');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const verifyMut = useMutation({
    mutationFn: () => setup2FAVerify(verifyCode),
    onSuccess: (data) => {
      setRecoveryDisplay(data.recovery_codes);
      setSetupData(null);
      setVerifyCode('');
      qc.invalidateQueries({ queryKey: ['2fa-status'] });
      toast.success('2FA aktif!');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const regenMut = useMutation({
    mutationFn: regenerateRecoveryCodes,
    onSuccess: (data) => {
      setRecoveryDisplay(data.recovery_codes);
      qc.invalidateQueries({ queryKey: ['2fa-status'] });
      toast.success('Recovery codes baru di-generate');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const copyAllRecovery = () => {
    if (!recoveryDisplay) return;
    navigator.clipboard.writeText(recoveryDisplay.join('\n'));
    toast.success('Recovery codes disalin ke clipboard');
  };

  if (isLoading) return <div className="text-text-muted">Memuat...</div>;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-5 h-5 role-accent-text" />
          <span className="font-mono text-2xs uppercase tracking-widest role-accent-text">
            Keamanan Akun
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-display-md font-bold">2FA & Recovery</h1>
        <p className="font-body text-text-muted mt-1">
          Aktifkan Two-Factor Authentication untuk lapisan keamanan extra. Wajib khusus
          akun kepala sekolah & guru BK.
        </p>
      </div>

      {/* Status card */}
      <div
        className={cn(
          'rounded-lg border p-4',
          status?.enabled
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : 'bg-amber-500/10 border-amber-500/30'
        )}
      >
        <div className="flex items-start gap-3">
          {status?.enabled ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-300 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-300 mt-0.5" />
          )}
          <div className="flex-1">
            <h3 className="font-display font-bold">
              {status?.enabled ? '2FA Aktif' : '2FA Belum Aktif'}
            </h3>
            <p className="text-sm text-text-secondary">
              {status?.enabled
                ? `Recovery codes tersisa: ${status.recovery_codes_remaining}/10`
                : 'Tambahkan lapisan keamanan extra untuk akun Anda.'}
            </p>
          </div>
        </div>
      </div>

      {/* Setup flow */}
      {!status?.enabled && !setupData && !recoveryDisplay && (
        <div className="rounded-lg bg-surface-raised border border-surface-border p-5 space-y-3">
          <div className="flex items-start gap-3">
            <Smartphone className="w-6 h-6 text-primary-400 mt-1" />
            <div>
              <h3 className="font-display font-bold">Aktifkan 2FA</h3>
              <p className="text-sm text-text-muted mt-1">
                Anda butuh aplikasi authenticator (Google Authenticator, Microsoft
                Authenticator, Authy, atau 1Password). Install dulu kalau belum punya.
              </p>
            </div>
          </div>
          <button
            onClick={() => initMut.mutate()}
            disabled={initMut.isPending}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {initMut.isPending ? 'Memuat...' : 'Mulai Setup 2FA'}
          </button>
        </div>
      )}

      {setupData && (
        <div className="rounded-lg bg-surface-raised border border-surface-border p-5 space-y-4">
          <h3 className="font-display font-bold">Setup 2FA — Step 2: Scan QR</h3>
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <img
              src={setupData.qr_png_url}
              alt="QR Code"
              className="w-48 h-48 rounded bg-white p-2"
            />
            <div className="flex-1 space-y-2 text-sm">
              <p className="text-text-secondary">
                1. Scan QR di samping dengan aplikasi authenticator.
              </p>
              <p className="text-text-secondary">
                2. Atau ketik manual secret berikut:
              </p>
              <div className="flex items-center gap-2">
                <code className="font-mono text-xs bg-surface-base px-2 py-1 rounded break-all">
                  {setupData.secret}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(setupData.secret);
                    toast.success('Secret disalin');
                  }}
                  className="text-text-muted hover:text-text-primary"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <p className="text-text-secondary">
                3. Masukkan 6-digit code yang muncul di app:
              </p>
            </div>
          </div>
          <input
            type="text"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value)}
            placeholder="123456"
            maxLength={6}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2 font-mono text-lg text-center"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setSetupData(null)}
              className="px-4 py-2 text-sm text-text-muted hover:text-text-primary"
            >
              Batal
            </button>
            <button
              onClick={() => verifyMut.mutate()}
              disabled={verifyMut.isPending || verifyCode.length < 6}
              className="flex-1 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-text-inverse rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {verifyMut.isPending ? 'Memverifikasi...' : 'Aktifkan 2FA'}
            </button>
          </div>
        </div>
      )}

      {recoveryDisplay && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/40 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <Key className="w-6 h-6 text-amber-300 mt-1" />
            <div className="flex-1">
              <h3 className="font-display font-bold text-amber-200">
                Simpan Recovery Codes
              </h3>
              <p className="text-sm text-text-secondary mt-1">
                Setiap code hanya bisa dipakai sekali. Pakai untuk login darurat kalau
                HP Anda hilang. <strong>Tidak akan ditampilkan lagi setelah halaman ditutup.</strong>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-surface-base/60 rounded p-3">
            {recoveryDisplay.map((code) => (
              <div key={code} className="text-center">{code}</div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={copyAllRecovery}
              className="flex-1 px-3 py-2 bg-surface-muted hover:bg-surface-border text-text-primary rounded text-sm flex items-center justify-center gap-2"
            >
              <Copy className="w-4 h-4" />
              Salin Semua
            </button>
            <button
              onClick={() => setRecoveryDisplay(null)}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-text-inverse rounded text-sm"
            >
              Saya Sudah Simpan
            </button>
          </div>
        </div>
      )}

      {status?.enabled && !recoveryDisplay && (
        <div className="space-y-3">
          <div className="rounded-lg bg-surface-raised border border-surface-border p-5">
            <h3 className="font-display font-bold mb-2">Kelola 2FA</h3>
            <div className="space-y-2">
              <button
                onClick={() => regenMut.mutate()}
                disabled={regenMut.isPending}
                className="w-full px-4 py-2 bg-surface-muted hover:bg-surface-border text-text-primary rounded text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                Generate Recovery Codes Baru
              </button>
              <button
                onClick={() => setShowDisable(true)}
                className="w-full px-4 py-2 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 rounded text-sm"
              >
                Matikan 2FA
              </button>
            </div>
          </div>
        </div>
      )}

      {showDisable && <DisableModal onClose={() => setShowDisable(false)} />}
    </div>
  );
}

function DisableModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const mut = useMutation({
    mutationFn: () => disable2FA(password, code),
    onSuccess: () => {
      toast.success('2FA dinonaktifkan');
      qc.invalidateQueries({ queryKey: ['2fa-status'] });
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  return (
    <div className="fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-raised border border-surface-border rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <h2 className="font-display text-lg font-bold">Matikan 2FA</h2>
          <button onClick={onClose} className="text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <p className="text-text-muted text-xs">
            Untuk safety, masukkan password + kode TOTP atau recovery code.
          </p>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2"
          />
          <input
            type="text"
            placeholder="Kode TOTP / Recovery"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full bg-surface-base border border-surface-border rounded px-3 py-2 font-mono"
          />
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted">Batal</button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !password || !code}
            className="px-4 py-2 text-sm bg-rose-500 hover:bg-rose-600 text-text-inverse rounded-lg disabled:opacity-50"
          >
            Matikan 2FA
          </button>
        </div>
      </div>
    </div>
  );
}
