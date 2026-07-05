'use client';

import type { ComponentType, Ref } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { CheckCircle, Clock, ScanFace, XCircle } from 'lucide-react';
import api, { getErrorMessage, type Envelope } from '@/lib/api';
import { cn, formatTime } from '@/lib/utils';
import { useOrgMode } from '@/stores/useOrgMode';
import { useAuthStore } from '@/stores/useAuthStore';

type WebcamHandle = { getScreenshot: () => string | null };
type WebcamComponentProps = {
  forwardedRef?: Ref<WebcamHandle>;
  className?: string;
  audio?: boolean;
  onUserMedia?: (stream: MediaStream) => void;
  onUserMediaError?: (error: string | DOMException) => void;
  screenshotFormat?: 'image/jpeg' | 'image/png' | 'image/webp';
  videoConstraints?: MediaTrackConstraints;
  mirrored?: boolean;
};

const Webcam = dynamic(
  async () => {
    const WebcamComponent = (await import('react-webcam')).default as unknown as ComponentType<
      Omit<WebcamComponentProps, 'forwardedRef'> & { ref?: Ref<WebcamHandle> }
    >;
    const WebcamWithRef = ({ forwardedRef, ...props }: WebcamComponentProps) => (
      <WebcamComponent {...props} ref={forwardedRef} />
    );
    WebcamWithRef.displayName = 'WebcamWithRef';
    return WebcamWithRef;
  },
  { ssr: false }
);

type ScanState = 'idle' | 'detecting' | 'scanning' | 'success' | 'failed' | 'already';

interface CheckinResult {
  action: 'checkin' | 'checkout';
  user: { id: number; name: string; employee_id: string };
  timestamp: string;
  status?: string;
  late_minutes?: number;
  work_duration_min?: number;
  confidence: number;
  already_recorded?: boolean;
}

// Interval auto-detect (ms) — cek wajah setiap 2.5 detik
const AUTO_DETECT_INTERVAL = 2500;

export default function AbsenPage() {
  const user = useAuthStore((s) => s.user);
  const { t, isSchool } = useOrgMode();

  const [scanState, setScanState] = useState<ScanState>('idle');
  const [mode, setMode] = useState<'checkin' | 'checkout'>('checkin');
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraMsg, setCameraMsg] = useState('Menunggu izin kamera...');
  const [now, setNow] = useState(new Date());
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [countdown, setCountdown] = useState(0); // countdown sebelum scan berikutnya

  const webcamRef = useRef<WebcamHandle>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cooldownRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modeRef = useRef(mode);

  // Sync modeRef dengan state
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isCameraLive = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    return Boolean(track && track.readyState === 'live' && track.enabled);
  }, []);

  const startCountdown = useCallback((seconds: number) => {
    setCountdown(seconds);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, []);

  const reset = useCallback((delayNext = 0) => {
    setScanState('idle');
    setResult(null);
    setErrorMsg('');
    cooldownRef.current = false;
    if (delayNext > 0) startCountdown(delayNext);
  }, [startCountdown]);

  const doScan = useCallback(async () => {
    if (cooldownRef.current || !cameraReady || !isCameraLive() || countdown > 0) return;
    cooldownRef.current = true;
    setScanState('scanning');

    try {
      let latitude: number | undefined;
      let longitude: number | undefined;
      let accuracy: number | undefined;

      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true, timeout: 5000, maximumAge: 30000,
          })
        );
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
        accuracy = pos.coords.accuracy;
      } catch { /* lanjut tanpa lokasi */ }

      const image = webcamRef.current?.getScreenshot();
      if (!image) { cooldownRef.current = false; setScanState('idle'); return; }

      const r = await api.post<Envelope<CheckinResult>>(`/attendance/${modeRef.current}`, {
        image, latitude, longitude, accuracy,
      });

      if (!r.data.success) {
        const code = r.data.error?.code;
        // Kalau wajah tidak dikenali → reset cepat dan coba lagi
        if (code === 'FACE_NOT_RECOGNIZED' || code === 'QUALITY_LOW' || code === 'EMPTY_GALLERY') {
          setScanState('idle');
          cooldownRef.current = false;
          return;
        }
        setErrorMsg(r.data.error?.message || r.data.message || 'Absensi ditolak');
        setScanState('failed');
        setTimeout(() => reset(5), 3000);
        return;
      }

      const data = r.data.data!;
      if (data.already_recorded) {
        setErrorMsg(r.data.message || `Sudah tercatat hari ini`);
        setScanState('already');
        if (modeRef.current === 'checkin') setMode('checkout');
        setTimeout(() => reset(3), 3000);
        return;
      }

      setResult(data);
      setScanState('success');
      if (modeRef.current === 'checkin') setMode('checkout');
      setTimeout(() => reset(5), 5000);
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
      setScanState('failed');
      setTimeout(() => reset(5), 3000);
    }
  }, [cameraReady, isCameraLive, countdown, reset]);

  // Auto-detect loop
  useEffect(() => {
    if (!autoEnabled || !cameraReady) return;

    autoTimerRef.current = setInterval(() => {
      if (!cooldownRef.current && countdown === 0) {
        doScan();
      }
    }, AUTO_DETECT_INTERVAL);

    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    };
  }, [autoEnabled, cameraReady, doScan, countdown]);

  const checkinLabel = isSchool ? 'Masuk Sekolah' : 'Check-in';
  const checkoutLabel = isSchool ? 'Pulang Sekolah' : 'Check-out';
  const currentLabel = mode === 'checkin' ? checkinLabel : checkoutLabel;

  const isProcessing = scanState === 'scanning';

  return (
    <div className="space-y-4 sm:space-y-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center">
        <h1 className="font-display text-2xl sm:text-display-md font-bold">Absen Sekarang</h1>
        <p className="font-body text-text-muted mt-1 text-sm">
          Halo, <span className="text-text-primary font-medium">{user?.full_name}</span>
        </p>
      </div>

      {/* Clock + Mode toggle */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-surface-muted border border-surface-border">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-text-muted" />
          <span className="font-mono text-lg font-bold text-text-primary">
            {now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span className="font-mono text-xs text-text-muted hidden sm:block capitalize">
            {now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}
          </span>
        </div>
        <div className="flex rounded-lg border border-surface-border overflow-hidden">
          <button
            onClick={() => setMode('checkin')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors',
              mode === 'checkin' ? 'bg-primary-500 text-white' : 'text-text-muted hover:text-text-primary hover:bg-surface-raised'
            )}
          >
            {checkinLabel}
          </button>
          <button
            onClick={() => setMode('checkout')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors',
              mode === 'checkout' ? 'bg-primary-500 text-white' : 'text-text-muted hover:text-text-primary hover:bg-surface-raised'
            )}
          >
            {checkoutLabel}
          </button>
        </div>
      </div>

      {/* Camera */}
      <div className="relative rounded-2xl overflow-hidden border border-surface-border bg-surface-base aspect-[4/3]">
        <Webcam
          forwardedRef={webcamRef}
          className="w-full h-full object-cover"
          audio={false}
          onUserMedia={(stream) => {
            streamRef.current = stream;
            setCameraReady(true);
            setCameraMsg('');
          }}
          onUserMediaError={(err) => {
            setCameraReady(false);
            setCameraMsg(typeof err === 'string' ? err : 'Kamera tidak bisa diakses');
          }}
          screenshotFormat="image/jpeg"
          videoConstraints={{ facingMode: 'user', width: 480, height: 360 }}
          mirrored
        />

        {/* Camera not ready */}
        {!cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-base/80 backdrop-blur-sm">
            <p className="text-sm text-text-muted text-center px-6">{cameraMsg}</p>
          </div>
        )}

        {/* Face guide oval */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={cn(
            'w-44 h-56 rounded-full border-2 transition-all duration-300',
            isProcessing ? 'border-primary-400 animate-pulse scale-105' :
            scanState === 'success' ? 'border-success' :
            scanState === 'failed' ? 'border-danger' :
            'border-primary-400/50 border-dashed'
          )} />
        </div>

        {/* Scanning overlay */}
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-base/30 backdrop-blur-[1px]">
            <div className="text-center">
              <ScanFace className="w-10 h-10 text-primary-400 animate-pulse mx-auto mb-2" />
              <p className="font-mono text-sm text-primary-400">Memverifikasi...</p>
            </div>
          </div>
        )}

        {/* Success overlay */}
        {scanState === 'success' && result && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-base/85 backdrop-blur-sm">
            <div className="text-center space-y-3 px-6">
              <CheckCircle className="w-14 h-14 text-success mx-auto" />
              <div>
                <p className="font-display font-bold text-xl text-success">
                  {result.action === 'checkin' ? checkinLabel : checkoutLabel} Berhasil!
                </p>
                <p className="font-body font-medium text-text-primary mt-1">{result.user.name}</p>
                <p className="font-mono text-sm text-text-muted">{formatTime(result.timestamp)}</p>
                {result.status === 'late' && result.late_minutes && (
                  <p className="font-mono text-xs text-accent-400 mt-1">Terlambat {result.late_minutes} menit</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Failed/already overlay */}
        {(scanState === 'failed' || scanState === 'already') && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-base/85 backdrop-blur-sm">
            <div className="text-center space-y-3 px-6">
              <XCircle className={cn('w-14 h-14 mx-auto', scanState === 'already' ? 'text-accent-400' : 'text-danger')} />
              <div>
                <p className={cn('font-display font-bold text-lg', scanState === 'already' ? 'text-accent-400' : 'text-danger')}>
                  {scanState === 'already' ? 'Sudah Tercatat' : 'Gagal'}
                </p>
                <p className="font-body text-sm text-text-muted mt-1 max-w-xs">{errorMsg}</p>
              </div>
            </div>
          </div>
        )}

        {/* Mode badge */}
        <div className="absolute top-3 left-3">
          <span className={cn(
            'px-2.5 py-1 rounded-full text-xs font-mono font-medium border',
            mode === 'checkin' ? 'text-primary-400 bg-primary-500/20 border-primary-500/30' : 'text-accent-400 bg-accent-500/20 border-accent-500/30'
          )}>
            {currentLabel}
          </span>
        </div>

        {/* Auto status badge */}
        <div className="absolute top-3 right-3">
          {countdown > 0 ? (
            <span className="px-2 py-1 rounded-full text-xs font-mono bg-surface-base/80 text-text-muted border border-surface-border">
              {countdown}s
            </span>
          ) : cameraReady && scanState === 'idle' ? (
            <span className="px-2 py-1 rounded-full text-xs font-mono bg-success/20 text-success border border-success/30 animate-pulse">
              ● Auto
            </span>
          ) : null}
        </div>
      </div>

      {/* Status text */}
      <p className="text-center text-xs text-text-muted">
        {!cameraReady
          ? 'Aktifkan kamera untuk mulai absen'
          : scanState === 'idle' && countdown === 0
          ? '👁️ Posisikan wajah di dalam lingkaran — akan otomatis terdeteksi'
          : scanState === 'idle' && countdown > 0
          ? `⏳ Siap scan ulang dalam ${countdown} detik...`
          : isProcessing
          ? '🔍 Memverifikasi wajah...'
          : ''}
      </p>
    </div>
  );
}
