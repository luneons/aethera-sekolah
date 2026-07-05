'use client';

import dynamic from 'next/dynamic';
import type { ComponentType, Ref } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle, RotateCcw, ScanFace } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import api, { getErrorMessage, type Envelope } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useOrgMode } from '@/stores/useOrgMode';

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

interface Props {
  open: boolean;
  onClose: () => void;
  userId: number | null;
  userName?: string;
  onSuccess?: () => void;
}

const DEFAULT_MIN_FRAMES = 3;
const TARGET_FRAMES = 5;

const POSE_GUIDES = [
  'Hadapkan wajah LURUS ke kamera',
  'Sedikit SERONG ke KIRI',
  'Sedikit SERONG ke KANAN',
  'Sedikit MENUNDUK',
  'Kembali LURUS ke kamera',
];

export function FaceEnrollModal({ open, onClose, userId, userName, onSuccess }: Props) {
  const { t } = useOrgMode();
  const [frames, setFrames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<'capturing' | 'processing' | 'done'>('capturing');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('Menunggu izin kamera...');
  const [minFrames, setMinFrames] = useState(DEFAULT_MIN_FRAMES);
  const [lastCapture, setLastCapture] = useState<string | null>(null);
  const webcamRef = useRef<WebcamHandle>(null);
  const cameraErrorShown = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!open) {
      setFrames([]);
      setPhase('capturing');
      setLoading(false);
      setCameraReady(false);
      setCameraMessage('Menunggu izin kamera...');
      setLastCapture(null);
      streamRef.current = null;
      setMinFrames(DEFAULT_MIN_FRAMES);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    api
      .get<Envelope<{ min_enrollment_frames: number }>>('/org/face-settings')
      .then((res) => {
        const next = res.data.data?.min_enrollment_frames;
        if (next) setMinFrames(next);
      })
      .catch(() => setMinFrames(DEFAULT_MIN_FRAMES));
  }, [open]);

  const isCameraLive = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    return Boolean(track && track.readyState === 'live' && track.enabled && !track.muted);
  }, []);

  const captureFrame = useCallback(() => {
    if (!isCameraLive()) {
      toast.error('Kamera tidak aktif');
      return;
    }
    const shot = webcamRef.current?.getScreenshot();
    if (!shot) {
      toast.error('Gagal mengambil foto');
      return;
    }
    setLastCapture(shot);
    setFrames((prev) => [...prev, shot]);
    toast.success(`Foto ${frames.length + 1} diambil`);
  }, [frames.length, isCameraLive]);

  const removeLastFrame = useCallback(() => {
    setFrames((prev) => {
      const next = prev.slice(0, -1);
      setLastCapture(next.length > 0 ? next[next.length - 1] : null);
      return next;
    });
  }, []);

  const resetFrames = useCallback(() => {
    setFrames([]);
    setLastCapture(null);
  }, []);

  const submit = useCallback(async () => {
    if (!userId) return;
    if (frames.length < minFrames) {
      toast.error(`Minimal ${minFrames} foto diperlukan`);
      return;
    }
    setLoading(true);
    setPhase('processing');
    try {
      await api.post<Envelope<unknown>>('/face/enroll', { user_id: userId, images: frames });
      setPhase('done');
      toast.success('Wajah berhasil didaftarkan');
      onSuccess?.();
      setTimeout(onClose, 1500);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setPhase('capturing');
    } finally {
      setLoading(false);
    }
  }, [frames, minFrames, onClose, onSuccess, userId]);

  const handleCameraError = useCallback((error: string | DOMException) => {
    setCameraReady(false);
    setCameraMessage('Kamera tidak bisa diakses. Periksa izin kamera browser.');
    setFrames([]);
    if (cameraErrorShown.current) return;
    cameraErrorShown.current = true;
    const message = typeof error === 'string' ? error : error.message;
    toast.error(message || 'Kamera tidak bisa diakses');
  }, []);

  const targetFrames = Math.max(TARGET_FRAMES, minFrames);
  const progress = (frames.length / targetFrames) * 100;
  const currentPoseIndex = Math.min(frames.length, POSE_GUIDES.length - 1);
  const canSubmit = cameraReady && frames.length >= minFrames && phase === 'capturing';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Daftarkan Wajah"
      description={userName ? `${t.Employee}: ${userName}` : 'Ambil foto dari beberapa sudut'}
      size="lg"
    >
      <div className="space-y-3 sm:space-y-5">
        {/* Camera view */}
        <div className="relative w-full aspect-[4/3] sm:aspect-video rounded-xl overflow-hidden bg-surface-base border border-surface-border">
          {open && (
            <Webcam
              forwardedRef={webcamRef}
              className="w-full h-full object-cover"
              audio={false}
              onUserMedia={(stream) => {
                streamRef.current = stream;
                stream.getVideoTracks().forEach((track) => {
                  track.onended = () => {
                    setCameraReady(false);
                    setCameraMessage('Kamera dimatikan.');
                    setFrames([]);
                  };
                  track.onmute = () => {
                    setCameraReady(false);
                    setCameraMessage('Kamera tidak mengirim video.');
                    setFrames([]);
                  };
                });
                setCameraReady(true);
                setCameraMessage('');
                cameraErrorShown.current = false;
              }}
              onUserMediaError={handleCameraError}
              screenshotFormat="image/jpeg"
              videoConstraints={{ facingMode: 'user', width: 640, height: 480 }}
              mirrored
            />
          )}

          {/* Face guide oval */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className={cn(
                'w-48 h-64 rounded-full border-2 transition-colors',
                phase === 'done'
                  ? 'border-success'
                  : phase === 'processing'
                  ? 'border-accent-400 animate-pulse'
                  : 'border-primary-400/60 border-dashed'
              )}
            />
          </div>

          {/* Frame counter */}
          <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-surface-base/80 backdrop-blur font-mono text-xs text-text-secondary border border-surface-border">
            {frames.length} / {targetFrames}
          </div>

          {/* Pose guide */}
          {cameraReady && phase === 'capturing' && (
            <div className="absolute bottom-3 left-3 right-3 px-3 py-2 rounded-lg bg-surface-base/85 backdrop-blur border border-surface-border text-center">
              <p className="text-sm font-medium text-primary-400">
                📸 {POSE_GUIDES[currentPoseIndex]}
              </p>
            </div>
          )}

          {/* Camera not ready overlay */}
          {!cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface-base/70 backdrop-blur-sm px-8 text-center">
              <p className="text-sm text-text-secondary">{cameraMessage}</p>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-text-muted">
            <span className="uppercase tracking-widest">
              {phase === 'capturing' && `Foto ${frames.length} dari ${targetFrames}`}
              {phase === 'processing' && 'Memproses embedding...'}
              {phase === 'done' && 'Selesai'}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-300',
                phase === 'done' ? 'bg-success' : 'bg-primary-500'
              )}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>

        {/* Thumbnail strip */}
        {frames.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {frames.map((frame, idx) => (
              <div
                key={idx}
                className="relative flex-shrink-0 w-10 h-10 sm:w-14 sm:h-14 rounded-lg overflow-hidden border border-surface-border"
              >
                <img src={frame} alt={`Frame ${idx + 1}`} className="w-full h-full object-cover" />
                <span className="absolute bottom-0 right-0 bg-surface-base/80 text-[9px] font-mono px-0.5">
                  {idx + 1}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Instructions - compact on mobile */}
        <p className="text-xs text-text-muted">
          Ambil min. {minFrames} foto dari berbagai sudut (lurus, kiri, kanan). Ikuti panduan di layar.
        </p>

        {/* Action buttons */}
        <div className="flex flex-col gap-3 pt-2 border-t border-surface-border">
          {/* Main capture/submit buttons - always visible */}
          <div className="flex gap-2">
            {phase === 'capturing' && frames.length < targetFrames && (
              <Button
                onClick={captureFrame}
                disabled={!cameraReady || loading}
                leftIcon={<Camera className="w-4 h-4" />}
                className="flex-1"
              >
                Ambil Foto
              </Button>
            )}

            {phase === 'capturing' && (
              <Button
                onClick={submit}
                disabled={!canSubmit}
                isLoading={loading}
                leftIcon={<ScanFace className="w-4 h-4" />}
                className={frames.length >= targetFrames ? 'flex-1' : ''}
              >
                {frames.length >= targetFrames ? 'Submit' : `Submit (${frames.length}/${minFrames})`}
              </Button>
            )}

            {phase === 'done' && (
              <Button disabled leftIcon={<CheckCircle className="w-4 h-4" />} className="flex-1">
                Berhasil
              </Button>
            )}
          </div>

          {/* Secondary actions */}
          <div className="flex gap-2 justify-between">
            <div className="flex gap-2">
              {frames.length > 0 && phase === 'capturing' && (
                <>
                  <Button variant="ghost" size="sm" onClick={removeLastFrame} disabled={loading}>
                    Hapus Terakhir
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetFrames}
                    disabled={loading}
                    leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                  >
                    Reset
                  </Button>
                </>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
              Batal
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
