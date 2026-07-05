'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  QrCode,
  CheckCircle2,
  XCircle,
  Camera,
  LogIn,
  LogOut,
  Loader2,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { checkinQr, checkoutQr } from '@/lib/attendanceModeApi';
import { getErrorMessage } from '@/lib/api';

type Action = 'checkin' | 'checkout';
type ScanState = 'idle' | 'scanning' | 'success' | 'error';

interface ResultData {
  user: {
    id: number;
    name: string;
    employee_id: string;
    photo_url?: string;
  };
  timestamp: string;
  status?: string;
  late_minutes?: number;
  work_duration_min?: number;
  already_recorded?: boolean;
}

export default function KioskQrPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanRef = useRef<string>('');
  const lastScanAtRef = useRef<number>(0);

  const [action, setAction] = useState<Action>('checkin');
  const [state, setState] = useState<ScanState>('idle');
  const [message, setMessage] = useState<string>('');
  const [result, setResult] = useState<ResultData | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Start camera + scanning
  useEffect(() => {
    let raf = 0;
    let mounted = true;

    const startCam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: 640, height: 480 },
        });
        streamRef.current = stream;
        if (videoRef.current && mounted) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setState('scanning');
          tick();
        }
      } catch (e) {
        setState('error');
        setMessage('Kamera tidak bisa diakses. Pastikan izin diberikan.');
      }
    };

    const tick = () => {
      if (!mounted || state === 'success') return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        raf = requestAnimationFrame(tick);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, imgData.width, imgData.height);

      if (code && code.data) {
        const data = code.data;
        const now = Date.now();
        // Debounce same scan
        if (data === lastScanRef.current && now - lastScanAtRef.current < 3000) {
          raf = requestAnimationFrame(tick);
          return;
        }
        lastScanRef.current = data;
        lastScanAtRef.current = now;
        handleScan(data);
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    startCam();
    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  const handleScan = async (qrData: string) => {
    setState('idle');
    setMessage('Memproses...');
    try {
      const fn = action === 'checkin' ? checkinQr : checkoutQr;
      const res = await fn(qrData);
      setResult(res.data);
      setState('success');
      setMessage(res.message ?? 'Berhasil');

      // Auto reset setelah 4 detik
      setTimeout(() => {
        setState('scanning');
        setResult(null);
        setMessage('');
      }, 4000);
    } catch (e) {
      setState('error');
      setMessage(getErrorMessage(e));
      setTimeout(() => {
        setState('scanning');
        setMessage('');
      }, 3000);
    }
  };

  const dateStr = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="min-h-[100dvh] bg-surface-base flex flex-col">
      {/* Top bar */}
      <header className="border-b border-surface-border px-4 py-3 flex items-center justify-between bg-surface-raised">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-primary-500 flex items-center justify-center">
            <QrCode className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-display font-bold text-base">Kiosk QR Absen</div>
            <div className="text-2xs font-mono text-text-muted">{dateStr}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono font-bold text-2xl text-primary-400 tabular-nums">
            {timeStr}
          </div>
        </div>
      </header>

      {/* Mode selector */}
      <div className="px-4 py-3 flex gap-2 border-b border-surface-border bg-surface-raised">
        <button
          onClick={() => setAction('checkin')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all',
            action === 'checkin'
              ? 'bg-emerald-500/15 text-emerald-400 border-2 border-emerald-500'
              : 'bg-surface-base border-2 border-surface-border text-text-muted hover:border-emerald-500/30'
          )}
        >
          <LogIn className="w-4 h-4" />
          Absen Masuk
        </button>
        <button
          onClick={() => setAction('checkout')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all',
            action === 'checkout'
              ? 'bg-rose-500/15 text-rose-400 border-2 border-rose-500'
              : 'bg-surface-base border-2 border-surface-border text-text-muted hover:border-rose-500/30'
          )}
        >
          <LogOut className="w-4 h-4" />
          Absen Pulang
        </button>
      </div>

      {/* Camera viewport */}
      <div className="flex-1 relative flex items-center justify-center p-4 overflow-hidden">
        <div className="relative w-full max-w-md aspect-square">
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover rounded-3xl bg-black"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Scanning overlay */}
          {state === 'scanning' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3/4 aspect-square border-4 border-primary-400 rounded-2xl relative">
                <div className="absolute -top-1 -left-1 w-12 h-12 border-t-4 border-l-4 border-primary-400 rounded-tl-2xl" />
                <div className="absolute -top-1 -right-1 w-12 h-12 border-t-4 border-r-4 border-primary-400 rounded-tr-2xl" />
                <div className="absolute -bottom-1 -left-1 w-12 h-12 border-b-4 border-l-4 border-primary-400 rounded-bl-2xl" />
                <div className="absolute -bottom-1 -right-1 w-12 h-12 border-b-4 border-r-4 border-primary-400 rounded-br-2xl" />
                {/* Sweeping line */}
                <div className="absolute inset-x-0 h-0.5 bg-primary-400 shadow-[0_0_20px_rgba(0,184,184,0.8)] animate-scan-line" />
              </div>
            </div>
          )}

          {/* Idle (loading) */}
          {state === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-base/90 rounded-3xl">
              <Loader2 className="w-8 h-8 text-primary-400 animate-spin mb-3" />
              <p className="text-sm text-text-muted">{message || 'Menyiapkan kamera...'}</p>
            </div>
          )}

          {/* Error */}
          {state === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-500/10 backdrop-blur-md rounded-3xl border-4 border-rose-500">
              <XCircle className="w-16 h-16 text-rose-400 mb-3" />
              <p className="text-base font-medium text-rose-400 px-4 text-center">
                {message}
              </p>
            </div>
          )}

          {/* Success */}
          {state === 'success' && result && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/15 backdrop-blur-lg rounded-3xl border-4 border-emerald-500 px-6 text-center">
              <CheckCircle2 className="w-20 h-20 text-emerald-400 mb-3" />
              <h2 className="font-display font-bold text-2xl text-emerald-400 mb-1">
                {result.user.name}
              </h2>
              <p className="font-mono text-sm text-text-muted mb-3">
                {result.user.employee_id}
              </p>
              <div className="flex items-center gap-1 text-2xl font-mono font-bold tabular-nums">
                <Clock className="w-5 h-5" />
                {new Date(result.timestamp).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              {result.status === 'late' && (
                <p className="mt-2 text-sm text-amber-400 font-medium">
                  ⚠ Terlambat {result.late_minutes} menit
                </p>
              )}
              {result.status === 'present' && (
                <p className="mt-2 text-sm text-emerald-400 font-medium">
                  ✓ Tepat waktu
                </p>
              )}
              {result.work_duration_min != null && (
                <p className="mt-2 text-sm text-text-muted">
                  Lama hadir: {Math.floor(result.work_duration_min / 60)}j{' '}
                  {result.work_duration_min % 60}m
                </p>
              )}
              {result.already_recorded && (
                <p className="mt-2 text-xs text-amber-400">{message}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer instruction */}
      <footer className="px-4 py-3 border-t border-surface-border bg-surface-raised text-center">
        <p className="text-xs text-text-muted">
          <Camera className="w-3.5 h-3.5 inline mr-1" />
          Arahkan QR siswa ke kamera • Mode:{' '}
          <strong className={action === 'checkin' ? 'text-emerald-400' : 'text-rose-400'}>
            {action === 'checkin' ? 'Absen Masuk' : 'Absen Pulang'}
          </strong>
        </p>
      </footer>

      {/* Inline keyframes */}
      <style jsx>{`
        @keyframes scan-line {
          0% {
            top: 0%;
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
          100% {
            top: 100%;
            opacity: 1;
          }
        }
        .animate-scan-line {
          animation: scan-line 2s ease-in-out infinite alternate;
        }
      `}</style>
    </div>
  );
}
