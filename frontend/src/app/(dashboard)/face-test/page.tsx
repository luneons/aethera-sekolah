'use client';

import dynamic from 'next/dynamic';
import type { ComponentType, Ref } from 'react';
import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, Clock, History, RefreshCw, ScanFace, UserRound, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import api, { getErrorMessage, type Envelope } from '@/lib/api';
import { cn, formatTime } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';

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

interface FaceTestUser {
  id: number;
  full_name: string;
  employee_id: string;
  role: string;
  status: string;
  department_name?: string | null;
  photo_url?: string | null;
}

interface FaceTestResult {
  matched: boolean;
  confidence: number;
  quality_score: number;
  user?: FaceTestUser | null;
}

interface FaceTestLogEntry {
  id: number;
  tested_by: { id: number; full_name: string; employee_id: string };
  matched: boolean;
  matched_user: { id: number; full_name: string; employee_id: string } | null;
  confidence: number;
  quality_score: number;
  ip_address: string | null;
  user_agent: string | null;
  error_message: string | null;
  created_at: string | null;
}

type TestState = 'idle' | 'ready' | 'scanning' | 'matched' | 'unmatched' | 'error';

export default function FaceTestPage() {
  const webcamRef = useRef<WebcamHandle>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [state, setState] = useState<TestState>('idle');
  const [result, setResult] = useState<FaceTestResult | null>(null);
  const [message, setMessage] = useState('Izinkan kamera untuk mulai tes wajah.');
  const qc = useQueryClient();

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['face-test-history'],
    queryFn: async () => {
      const r = await api.get<Envelope<FaceTestLogEntry[]>>('/face/test/history', {
        params: { per_page: 30 },
      });
      return r.data.data ?? [];
    },
  });

  const isCameraLive = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    return Boolean(track && track.readyState === 'live' && track.enabled && !track.muted);
  }, []);

  const handleCameraError = useCallback((error: string | DOMException) => {
    const msg = typeof error === 'string' ? error : error.message;
    setCameraReady(false);
    setState('error');
    setMessage(msg || 'Kamera tidak bisa diakses. Periksa izin kamera browser.');
  }, []);

  const handleScan = useCallback(async () => {
    if (!cameraReady || !isCameraLive()) {
      setState('error');
      setMessage('Kamera tidak aktif. Aktifkan kamera lalu refresh halaman.');
      return;
    }

    const image = webcamRef.current?.getScreenshot();
    if (!image) {
      setState('error');
      setMessage('Gagal mengambil frame kamera.');
      return;
    }

    setState('scanning');
    setResult(null);
    setMessage('Memindai dan mencocokkan wajah...');

    try {
      const res = await api.post<Envelope<FaceTestResult>>('/face/test', { image });
      const data = res.data.data;
      if (!data) throw new Error('Response test wajah kosong');
      setResult(data);

      if (data.matched && data.user) {
        setState('matched');
        setMessage(res.data.message || 'Wajah berhasil dikenali.');
      } else {
        setState('unmatched');
        setMessage(res.data.message || 'Wajah tidak cocok dengan data terdaftar.');
      }
      qc.invalidateQueries({ queryKey: ['face-test-history'] });
    } catch (err) {
      setState('error');
      setMessage(getErrorMessage(err));
      toast.error(getErrorMessage(err));
      qc.invalidateQueries({ queryKey: ['face-test-history'] });
    }
  }, [cameraReady, isCameraLive]);

  const resetResult = () => {
    setResult(null);
    setState(cameraReady ? 'ready' : 'idle');
    setMessage(cameraReady ? 'Kamera siap. Klik Scan Sekarang.' : 'Izinkan kamera untuk mulai tes wajah.');
  };

  const statusTone =
    state === 'matched'
      ? 'border-success/40 bg-success/10 text-success'
      : state === 'unmatched'
      ? 'border-accent-500/40 bg-accent-500/10 text-accent-400'
      : state === 'error'
      ? 'border-danger/40 bg-danger/10 text-danger'
      : 'border-primary-500/30 bg-primary-500/10 text-primary-400';

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <p className="font-mono text-xs text-primary-400 tracking-widest uppercase mb-2">Face Recognition Test</p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-text-primary">Tes Wajah</h1>
        <p className="text-text-muted mt-2 max-w-2xl text-sm sm:text-base">
          Scan wajah untuk melihat apakah data enrollment sudah bisa dikenali tanpa mencatat absensi.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(360px,520px)_1fr] gap-6 items-start">
        <Card variant="glass" padding="md">
          <div className="relative aspect-square rounded-xl overflow-hidden bg-surface-base border border-surface-border">
            <Webcam
              forwardedRef={webcamRef}
              className="w-full h-full object-cover"
              audio={false}
              onUserMedia={(stream) => {
                streamRef.current = stream;
                stream.getVideoTracks().forEach((track) => {
                  track.onended = () => {
                    setCameraReady(false);
                    setState('error');
                    setMessage('Kamera dimatikan. Aktifkan kamera lalu refresh halaman.');
                  };
                  track.onmute = () => {
                    setCameraReady(false);
                    setState('error');
                    setMessage('Kamera tidak mengirim video. Aktifkan kamera lalu refresh halaman.');
                  };
                });
                setCameraReady(true);
                setState('ready');
                setMessage('Kamera siap. Klik Scan Sekarang.');
              }}
              onUserMediaError={handleCameraError}
              screenshotFormat="image/jpeg"
              videoConstraints={{ facingMode: 'user', width: 640, height: 640 }}
              mirrored
            />

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className={cn(
                  'w-56 h-72 rounded-full border-2 border-dashed',
                  state === 'matched'
                    ? 'border-success/70'
                    : state === 'error'
                    ? 'border-danger/70'
                    : 'border-primary-400/60'
                )}
              />
            </div>

            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-base/75 backdrop-blur-sm px-8 text-center">
                <p className="text-sm text-text-secondary">{message}</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mt-4">
            <Button
              onClick={handleScan}
              disabled={!cameraReady || state === 'scanning'}
              isLoading={state === 'scanning'}
              leftIcon={<ScanFace className="w-4 h-4" />}
            >
              Scan Sekarang
            </Button>
            <Button variant="secondary" onClick={resetResult} leftIcon={<RefreshCw className="w-4 h-4" />}>
              Reset
            </Button>
          </div>
        </Card>

        <div className="space-y-4">
          <div className={cn('rounded-lg border px-4 py-3 flex items-start gap-3', statusTone)}>
            {state === 'matched' ? (
              <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />
            ) : state === 'error' ? (
              <XCircle className="w-5 h-5 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
            )}
            <div>
              <p className="font-display font-semibold">
                {state === 'matched'
                  ? 'Berhasil dikenali'
                  : state === 'unmatched'
                  ? 'Tidak cocok'
                  : state === 'error'
                  ? 'Tidak bisa scan'
                  : 'Menunggu scan'}
              </p>
              <p className="text-sm opacity-90 mt-1">{message}</p>
            </div>
          </div>

          {result?.matched && result.user ? (
            <Card variant="glow" padding="md">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-lg bg-primary-500/15 border border-primary-500/30 flex items-center justify-center shrink-0">
                  <UserRound className="w-7 h-7 text-primary-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-xs text-success tracking-widest uppercase">Match Found</p>
                  <h2 className="font-display text-2xl font-bold text-text-primary mt-1">{result.user.full_name}</h2>
                  <p className="font-mono text-sm text-text-muted mt-1">{result.user.employee_id}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                <Info label="Kelas" value={result.user.department_name || '-'} />
                <Info label="Role" value={result.user.role} />
                <Info label="Status" value={result.user.status} />
                <Info label="User ID" value={String(result.user.id)} />
                <Info label="Confidence" value={`${Math.round(result.confidence * 100)}%`} />
                <Info label="Quality Score" value={`${Math.round(result.quality_score * 100)}%`} />
              </div>
            </Card>
          ) : (
            <Card variant="glass" padding="md">
              <p className="font-mono text-xs text-text-muted tracking-widest uppercase">Hasil Scan</p>
              <p className="text-text-secondary mt-3">
                Informasi siswa akan muncul di sini setelah wajah berhasil dikenali.
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* History Section */}
      <Card padding="lg">
        <div className="flex items-center gap-3 mb-4">
          <History className="w-5 h-5 text-primary-400" />
          <div>
            <h3 className="font-display font-semibold text-lg">Riwayat Tes Wajah</h3>
            <p className="text-sm text-text-muted">Log semua percobaan pengenalan wajah</p>
          </div>
        </div>

        <div className="overflow-x-auto -mx-6">
          <table className="w-full min-w-[700px]">
            <thead className="bg-surface-muted border-y border-surface-border">
              <tr>
                <th className="text-left px-4 py-2.5 font-mono text-2xs text-text-muted uppercase tracking-widest">Waktu</th>
                <th className="text-left px-4 py-2.5 font-mono text-2xs text-text-muted uppercase tracking-widest">Tester</th>
                <th className="text-left px-4 py-2.5 font-mono text-2xs text-text-muted uppercase tracking-widest">Hasil</th>
                <th className="text-left px-4 py-2.5 font-mono text-2xs text-text-muted uppercase tracking-widest">Cocok Dengan</th>
                <th className="text-right px-4 py-2.5 font-mono text-2xs text-text-muted uppercase tracking-widest">Confidence</th>
                <th className="text-left px-4 py-2.5 font-mono text-2xs text-text-muted uppercase tracking-widest">IP</th>
                <th className="text-left px-4 py-2.5 font-mono text-2xs text-text-muted uppercase tracking-widest">Device</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {historyLoading && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-text-muted">Memuat...</td>
                </tr>
              )}
              {!historyLoading && (!history || history.length === 0) && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-text-muted">Belum ada riwayat tes wajah</td>
                </tr>
              )}
              {history?.map((log) => (
                <tr key={log.id} className="hover:bg-surface-muted/50 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-text-secondary whitespace-nowrap">
                    {log.created_at ? new Date(log.created_at).toLocaleString('id-ID', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit'
                    }) : '-'}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-sm font-medium">{log.tested_by.full_name}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    {log.error_message ? (
                      <span className="inline-flex items-center gap-1 text-xs text-danger">
                        <XCircle className="w-3.5 h-3.5" /> Error
                      </span>
                    ) : log.matched ? (
                      <span className="inline-flex items-center gap-1 text-xs text-success">
                        <CheckCircle className="w-3.5 h-3.5" /> Cocok
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-accent-400">
                        <XCircle className="w-3.5 h-3.5" /> Tidak cocok
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-sm">
                    {log.matched_user ? (
                      <span>{log.matched_user.full_name} <span className="text-text-muted text-xs">({log.matched_user.employee_id})</span></span>
                    ) : log.error_message ? (
                      <span className="text-xs text-text-muted truncate max-w-[200px] block">{log.error_message}</span>
                    ) : (
                      <span className="text-text-muted">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {log.confidence > 0 ? `${Math.round(log.confidence * 100)}%` : '-'}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-text-muted">
                    {log.ip_address || '-'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-text-muted max-w-[150px] truncate">
                    {log.user_agent ? parseUserAgent(log.user_agent) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function parseUserAgent(ua: string): string {
  if (ua.includes('iPhone')) return 'iPhone';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'Mac';
  if (ua.includes('Linux')) return 'Linux';
  return ua.slice(0, 30);
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-base/60 px-4 py-3">
      <p className="font-mono text-2xs text-text-muted tracking-widest uppercase">{label}</p>
      <p className="text-text-primary font-medium mt-1 truncate">{value}</p>
    </div>
  );
}
