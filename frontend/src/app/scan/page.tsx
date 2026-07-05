'use client';

import type { ComponentType, Ref } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { gsap } from 'gsap';
import { CheckCircle, Clock, ExternalLink, LocateFixed, MapPin, ScanFace, Wifi, XCircle } from 'lucide-react';
import api, { getErrorMessage, type Envelope } from '@/lib/api';
import { cn, formatTime } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { fetchVoiceGreeting } from '@/lib/disciplineApi';
import { speak } from '@/lib/tts';
import { triggerCelebration } from '@/lib/celebration';
import { TtsToggle } from '@/components/kiosk/TtsToggle';

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

type ScanState = 'idle' | 'scanning' | 'verifying' | 'success' | 'notice' | 'failed';
type LocationState = 'idle' | 'checking' | 'ok' | 'warning' | 'error' | 'off';

interface GeofenceResult {
  enabled: boolean;
  location_name?: string;
  distance_meters?: number;
  radius_meters?: number;
  accuracy_meters?: number;
  max_accuracy_meters?: number;
}

interface CheckinResult {
  action: 'checkin' | 'checkout';
  user: { id: number; name: string; employee_id: string; photo_url: string | null };
  timestamp: string;
  status?: string;
  late_minutes?: number;
  work_duration_min?: number;
  confidence: number;
  already_recorded?: boolean;
  geofence?: GeofenceResult | null;
}

interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface GeofenceInfo {
  enabled: boolean;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  max_accuracy_meters: number;
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);
  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mapsUrl(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null) return '#';
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export default function ScanPage() {
  const [state, setState] = useState<ScanState>('idle');
  const [mode, setMode] = useState<'checkin' | 'checkout'>('checkin');
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [time, setTime] = useState<Date | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [locationMsg, setLocationMsg] = useState('Menunggu izin lokasi');
  const [locationState, setLocationState] = useState<LocationState>('idle');
  const [deviceLocation, setDeviceLocation] = useState<DeviceLocation | null>(null);
  const [geofenceInfo, setGeofenceInfo] = useState<GeofenceInfo | null>(null);
  const [locationPanelOpen, setLocationPanelOpen] = useState(false);

  const webcamRef = useRef<WebcamHandle>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const scanLineRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const cornersRef = useRef<HTMLDivElement[]>([]);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const cooldownRef = useRef(false);
  const cameraErrorShown = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setTime(new Date());
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    api
      .get<Envelope<GeofenceInfo>>('/attendance/geofence-info')
      .then((res) => {
        if (res.data.data) setGeofenceInfo(res.data.data);
      })
      .catch(() => setLocationMsg('Gagal memuat titik sekolah'));
  }, []);

  useEffect(() => {
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 1, ease: 'power2.out' });
    gsap.fromTo(
      cornersRef.current,
      { scale: 0, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.6, stagger: 0.1, ease: 'back.out(2)' }
    );
  }, []);

  const startScanLoop = useCallback(() => {
    if (tlRef.current) tlRef.current.kill();
    tlRef.current = gsap.timeline({ repeat: -1 });
    tlRef.current.fromTo(
      scanLineRef.current,
      { yPercent: -5, opacity: 0.9 },
      { yPercent: 105, opacity: 0.4, duration: 1.6, ease: 'power1.inOut' }
    );
  }, []);

  const stopScanLoop = useCallback(() => {
    tlRef.current?.kill();
    tlRef.current = null;
    if (scanLineRef.current) gsap.set(scanLineRef.current, { opacity: 0 });
  }, []);

  const playSuccess = useCallback(() => {
    stopScanLoop();
    gsap.to(cornersRef.current, { borderColor: '#00e676', duration: 0.3, stagger: 0.05 });
    gsap.fromTo(
      resultRef.current,
      { scale: 0.85, opacity: 0, y: 20 },
      { scale: 1, opacity: 1, y: 0, duration: 0.5, ease: 'back.out(1.7)' }
    );
  }, [stopScanLoop]);

  const playFail = useCallback(() => {
    stopScanLoop();
    gsap.to(cornersRef.current, { borderColor: '#ff1744', duration: 0.3, stagger: 0.05 });
    gsap.fromTo(
      resultRef.current,
      { scale: 0.85, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.4, ease: 'power2.out' }
    );
  }, [stopScanLoop]);

  const reset = useCallback(() => {
    setState('idle');
    setResult(null);
    setErrorMsg('');
    gsap.to(cornersRef.current, { borderColor: '#00b8b8', duration: 0.3 });
  }, []);

  const isCameraLive = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    return Boolean(track && track.readyState === 'live' && track.enabled && !track.muted);
  }, []);

  const getDeviceLocation = useCallback((): Promise<DeviceLocation> => {
    if (!navigator.geolocation) {
      return Promise.reject(new Error('Browser tidak mendukung lokasi perangkat.'));
    }

    setLocationState('checking');
    setLocationMsg('Mengambil lokasi perangkat...');
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          setDeviceLocation(location);
          setLocationMsg(`GPS aktif, akurasi ${Math.round(location.accuracy)}m`);
          resolve(location);
        },
        (error) => {
          const message =
            error.code === error.PERMISSION_DENIED
              ? 'Izin lokasi ditolak. Aktifkan lokasi untuk absensi BYOD.'
              : error.code === error.TIMEOUT
              ? 'Gagal mengambil lokasi. Pastikan GPS aktif lalu coba lagi.'
              : 'Lokasi perangkat tidak tersedia. Pastikan GPS aktif.';
          setLocationState('error');
          setLocationMsg(message);
          reject(new Error(message));
        },
        { enableHighAccuracy: true, maximumAge: 15_000, timeout: 10_000 }
      );
    });
  }, []);

  const refreshLocationPanel = useCallback(async () => {
    try {
      await getDeviceLocation();
    } catch {
      // Message is already reflected in the location chip.
    }
  }, [getDeviceLocation]);

  const toggleLocationPanel = useCallback(() => {
    setLocationPanelOpen((open) => {
      const next = !open;
      if (next) refreshLocationPanel();
      return next;
    });
  }, [refreshLocationPanel]);

  const applyGeofenceStatus = useCallback((geofence?: GeofenceResult | null) => {
    if (!geofence) return;
    if (!geofence.enabled) {
      setLocationState('off');
      setLocationMsg('Geofence nonaktif');
      return;
    }

    const distance = Math.round(geofence.distance_meters ?? 0);
    const radius = geofence.radius_meters ?? 0;
    const accuracy = Math.round(geofence.accuracy_meters ?? 0);
    setLocationState('ok');
    setLocationMsg(`Dalam radius ${distance}m / ${radius}m, akurasi ${accuracy}m`);
  }, []);

  const applyGeofenceErrorStatus = useCallback((error?: { code?: string; message?: string; details?: Record<string, unknown> }) => {
    if (!error) return;
    const details = error.details ?? {};
    if (error.code === 'OUTSIDE_GEOFENCE') {
      const distance = Math.round(Number(details.distance_meters ?? 0));
      const radius = Math.round(Number(details.radius_meters ?? 0));
      setLocationState('error');
      setLocationMsg(`Di luar radius ${distance}m / ${radius}m`);
      return;
    }
    if (error.code === 'LOCATION_ACCURACY_LOW') {
      const accuracy = Math.round(Number(details.accuracy_meters ?? 0));
      const maxAccuracy = Math.round(Number(details.max_accuracy_meters ?? 0));
      setLocationState('warning');
      setLocationMsg(`Akurasi GPS ditolak ${accuracy}m / maks ${maxAccuracy}m`);
      return;
    }
    if (error.code === 'LOCATION_REQUIRED' || error.code === 'GEOFENCE_CONFIG_MISSING') {
      setLocationState('error');
      setLocationMsg(error.message || 'Lokasi belum valid untuk absensi.');
    }
  }, []);

  useEffect(() => {
    if (state === 'success' && result) {
      playSuccess();
    }
    if (state === 'notice') {
      stopScanLoop();
      gsap.to(cornersRef.current, { borderColor: '#ffb020', duration: 0.3, stagger: 0.05 });
      gsap.fromTo(
        resultRef.current,
        { scale: 0.85, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4, ease: 'power2.out' }
      );
    }
    if (state === 'failed') {
      playFail();
    }
  }, [playFail, playSuccess, result, state, stopScanLoop]);

  const handleCameraError = useCallback((error: string | DOMException) => {
    if (cameraErrorShown.current) return;
    cameraErrorShown.current = true;
    const message = typeof error === 'string' ? error : error.message;
    setCameraReady(false);
    setErrorMsg(message || 'Kamera tidak bisa diakses. Periksa izin kamera browser.');
    setState('failed');
  }, []);

  const captureAndVerify = useCallback(async () => {
    if (cooldownRef.current || state !== 'idle' || !webcamRef.current || !cameraReady || !isCameraLive()) return;

    cooldownRef.current = true;
    setState('scanning');
    startScanLoop();

    try {
      // Brief delay for visible scan animation
      await new Promise((r) => setTimeout(r, 500));
      setState('verifying');

      const location = await getDeviceLocation();
      const image = webcamRef.current.getScreenshot();
      if (!image) throw new Error('Gagal mengambil gambar kamera.');

      const r = await api.post<Envelope<CheckinResult>>(`/attendance/${mode}`, {
        image,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
      });
      if (!r.data.success) {
        applyGeofenceErrorStatus(r.data.error);
        const errCode = r.data.error?.code;
        // Wajah tidak dikenali / kualitas rendah → reset cepat tanpa tampilkan error
        if (errCode === 'FACE_NOT_RECOGNIZED' || errCode === 'QUALITY_LOW' || errCode === 'EMPTY_GALLERY') {
          cooldownRef.current = false;
          reset();
          return;
        }
        setErrorMsg(r.data.error?.message || r.data.message || 'Absensi ditolak');
        setState('failed');
        setTimeout(() => {
          cooldownRef.current = false;
          reset();
        }, 5000);
        return;
      }
      const data = r.data.data!;
      applyGeofenceStatus(data.geofence);
      if (data.already_recorded) {
        if (data.action === 'checkin') setMode('checkout');
        setErrorMsg(
          data.action === 'checkin'
            ? `${r.data.message || 'Sudah check-in hari ini'}. Mode diubah ke Check-out.`
            : r.data.message || 'Sudah check-out hari ini'
        );
        setState('notice');
        setTimeout(() => {
          cooldownRef.current = false;
          reset();
        }, 5000);
        return;
      }
      setResult(data);
      setState('success');
      // Voice greeting + confetti — fetch dari backend (HEADLINE personalized)
      void (async () => {
        try {
          const greeting = await fetchVoiceGreeting(data.user.id);
          speak(greeting.text);
          // Confetti hanya untuk momen membanggakan: lebih awal banyak, atau streak panjang
          const offset = greeting.arrival_offset_min ?? 0;
          const streak = greeting.streak_days ?? 0;
          if (offset <= -10 || streak >= 7 || (greeting.class_rank_today ?? 99) <= 3) {
            triggerCelebration({ intensity: streak >= 30 ? 'epic' : 'normal' });
          }
        } catch {
          // Fallback: pakai data yang sudah ada di hasil scan, biar tetap ada sapaan
          if (data.user.name) {
            speak(`Selamat datang ${data.user.name.split(' ')[0]}.`);
          }
        }
      })();
      setTimeout(() => {
        cooldownRef.current = false;
        reset();
      }, 4500);
    } catch (err) {
      const error = (err as { response?: { data?: { error?: { code?: string; details?: Record<string, unknown> } } } })
        .response?.data?.error;
      applyGeofenceErrorStatus(error);
      if (error?.code === 'ALREADY_CHECKED_IN') {
        setMode('checkout');
        setErrorMsg(`${getErrorMessage(err)}. Wajah dikenali, mode diubah ke Check-out.`);
        setState('notice');
      } else {
        setErrorMsg(getErrorMessage(err));
        setState('failed');
      }
      setTimeout(() => {
        cooldownRef.current = false;
        reset();
      }, error?.code === 'ALREADY_CHECKED_IN' ? 5000 : 3000);
    }
  }, [
    applyGeofenceErrorStatus,
    applyGeofenceStatus,
    cameraReady,
    getDeviceLocation,
    isCameraLive,
    mode,
    reset,
    startScanLoop,
    state,
  ]);

  // Auto-detect: coba scan otomatis setiap 2.5 detik saat kamera siap dan idle
  useEffect(() => {
    if (!cameraReady) return;
    const interval = setInterval(() => {
      if (!cooldownRef.current && state === 'idle') {
        captureAndVerify();
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [cameraReady, state, captureAndVerify]);

  const cornerPositions = ['top-4 left-4', 'top-4 right-4', 'bottom-4 left-4', 'bottom-4 right-4'];
  const isBusy = state === 'scanning' || state === 'verifying';
  const hasOfficePoint = geofenceInfo?.latitude != null && geofenceInfo.longitude != null;
  const liveDistance =
    deviceLocation && hasOfficePoint
      ? distanceMeters(deviceLocation.latitude, deviceLocation.longitude, geofenceInfo!.latitude!, geofenceInfo!.longitude!)
      : null;
  const liveWithinRadius =
    geofenceInfo?.enabled && liveDistance != null
      ? liveDistance <= geofenceInfo.radius_meters
      : false;
  const liveAccuracyLow =
    geofenceInfo?.enabled && deviceLocation
      ? deviceLocation.accuracy > geofenceInfo.max_accuracy_meters
      : false;
  const liveCanScan = liveWithinRadius && !liveAccuracyLow;
  const areaStatusText = !geofenceInfo?.enabled
    ? 'Geofence nonaktif'
    : !hasOfficePoint
    ? 'Lokasi acuan belum diatur'
    : !deviceLocation
    ? 'Lokasi device belum tersedia'
    : liveWithinRadius && liveAccuracyLow
    ? 'Dalam radius, akurasi rendah'
    : liveCanScan
    ? 'Di dalam area'
    : 'Belum masuk area';

  useEffect(() => {
    if (!deviceLocation || !geofenceInfo) return;
    if (!geofenceInfo.enabled) {
      setLocationState('off');
      setLocationMsg('Geofence nonaktif');
      return;
    }
    if (liveWithinRadius && liveAccuracyLow) {
      setLocationState('warning');
      setLocationMsg(
        `Dalam radius, akurasi rendah ${Math.round(deviceLocation.accuracy)}m / maks ${geofenceInfo.max_accuracy_meters}m`
      );
      return;
    }
    if (liveCanScan) {
      setLocationState('ok');
      setLocationMsg(`Dalam radius ${Math.round(liveDistance ?? 0)}m / ${geofenceInfo.radius_meters}m`);
      return;
    }
    if (liveDistance != null) {
      setLocationState('error');
      setLocationMsg(`Di luar radius ${Math.round(liveDistance)}m / ${geofenceInfo.radius_meters}m`);
    }
  }, [deviceLocation, geofenceInfo, liveAccuracyLow, liveCanScan, liveDistance, liveWithinRadius]);
  const locationTone =
    locationState === 'ok'
      ? 'text-success'
      : locationState === 'error'
      ? 'text-danger'
      : locationState === 'warning'
      ? 'text-accent-400'
      : locationState === 'off'
      ? 'text-text-muted'
      : 'text-primary-400';

  return (
    <div className="h-[100dvh] bg-surface-base flex flex-col items-center justify-center overflow-hidden relative px-4 py-3 sm:p-6">
      <div className="absolute inset-0 bg-grid-cyber bg-grid opacity-50 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-radial-primary pointer-events-none" />

      {/* Header - compact on mobile */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 sm:px-8 py-3 sm:py-6 z-20">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary-500 flex items-center justify-center shadow-glow-sm">
            <ScanFace className="w-4 h-4 sm:w-5 sm:h-5 text-text-inverse" />
          </div>
          <div className="hidden sm:block">
            <p className="font-display font-bold text-lg leading-none">
              Face<span className="text-primary-400">Track</span>
            </p>
            <p className="font-mono text-2xs text-text-muted tracking-widest uppercase">Kiosk Mode</p>
          </div>
        </div>

        <div className="font-mono text-text-muted text-sm flex items-center gap-2 sm:gap-5">
          <span className="hidden sm:flex items-center gap-1.5 text-success">
            <Wifi className="w-4 h-4" />
            <span className="text-xs">Online</span>
          </span>
          <TtsToggle />
          <button
            type="button"
            onClick={toggleLocationPanel}
            className={cn(
              'hidden md:flex items-center gap-1.5 max-w-[360px] rounded-full border border-current/20 px-3 py-1.5 bg-surface-raised/80 hover:bg-surface-raised transition-colors',
              locationTone
            )}
          >
            <MapPin className="w-4 h-4" />
            <span className="text-xs truncate">{locationMsg}</span>
          </button>
          {/* Mobile location indicator */}
          <button
            type="button"
            onClick={toggleLocationPanel}
            className={cn('md:hidden p-1.5 rounded-full', locationTone)}
          >
            <MapPin className="w-4 h-4" />
          </button>
          <span className="text-lg sm:text-2xl font-bold text-text-primary">
            {time
              ? time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : '--.--.--'}
          </span>
        </div>
      </div>

      {locationPanelOpen && (
        <div className="absolute top-14 sm:top-20 right-4 sm:right-8 z-30 w-[min(420px,calc(100vw-2rem))] rounded-xl border border-surface-border bg-surface-raised/95 backdrop-blur-xl shadow-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-2xs text-primary-400 tracking-widest uppercase">Status Area</p>
              <h2 className="font-display text-lg font-semibold text-text-primary mt-1">
                {areaStatusText}
              </h2>
            </div>
            <Button
              size="icon"
              variant="secondary"
              type="button"
              onClick={refreshLocationPanel}
              title="Refresh lokasi"
            >
              <LocateFixed className="w-4 h-4" />
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-surface-border bg-surface-base/60 p-3">
              <p className="font-mono text-2xs text-text-muted tracking-widest uppercase">Device</p>
              <p className="font-mono text-xs text-text-primary mt-2">
                {deviceLocation
                  ? `${deviceLocation.latitude.toFixed(6)}, ${deviceLocation.longitude.toFixed(6)}`
                  : 'Belum tersedia'}
              </p>
              <p className="text-xs text-text-muted mt-1">
                Akurasi {deviceLocation ? `${Math.round(deviceLocation.accuracy)}m` : '-'}
              </p>
            </div>
            <div className="rounded-lg border border-surface-border bg-surface-base/60 p-3">
              <p className="font-mono text-2xs text-text-muted tracking-widest uppercase">
                {geofenceInfo?.location_name || 'Sekolah'}
              </p>
              <p className="font-mono text-xs text-text-primary mt-2">
                {hasOfficePoint
                  ? `${geofenceInfo!.latitude!.toFixed(6)}, ${geofenceInfo!.longitude!.toFixed(6)}`
                  : 'Belum diatur'}
              </p>
              <p className="text-xs text-text-muted mt-1">
                Radius {geofenceInfo ? `${geofenceInfo.radius_meters}m` : '-'}
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-surface-border bg-surface-base/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-secondary">Jarak ke lokasi acuan</span>
              <span
                className={cn(
                  'font-mono text-sm font-semibold',
                  geofenceInfo?.enabled && liveCanScan
                    ? 'text-success'
                    : liveWithinRadius && liveAccuracyLow
                    ? 'text-accent-400'
                    : 'text-danger'
                )}
              >
                {liveDistance == null ? '-' : `${Math.round(liveDistance)}m`}
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-surface-border overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full',
                  liveCanScan ? 'bg-success' : liveWithinRadius && liveAccuracyLow ? 'bg-accent-500' : 'bg-danger'
                )}
                style={{
                  width:
                    liveDistance == null || !geofenceInfo
                      ? '0%'
                      : `${Math.max(4, Math.min(100, (geofenceInfo.radius_meters / Math.max(liveDistance, 1)) * 100))}%`,
                }}
              />
            </div>
            <p className={cn('text-xs mt-2', liveAccuracyLow ? 'text-accent-400' : 'text-text-muted')}>
              {liveWithinRadius && liveAccuracyLow
                ? `Jarak sudah masuk radius, tapi akurasi GPS ${Math.round(deviceLocation?.accuracy ?? 0)}m melebihi batas ${geofenceInfo?.max_accuracy_meters}m.`
                : liveAccuracyLow
                ? `Akurasi GPS terlalu rendah. Maks ${geofenceInfo?.max_accuracy_meters}m.`
                : geofenceInfo?.enabled
                ? `Batas akurasi GPS ${geofenceInfo.max_accuracy_meters}m.`
                : 'Aktifkan geofence di menu Organisasi untuk memblokir scan di luar area.'}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={mapsUrl(deviceLocation?.latitude, deviceLocation?.longitude)}
              target="_blank"
              rel="noreferrer"
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-xs text-text-secondary hover:text-primary-400 hover:border-primary-500 transition-colors',
                !deviceLocation && 'pointer-events-none opacity-50'
              )}
            >
              Device <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a
              href={mapsUrl(geofenceInfo?.latitude, geofenceInfo?.longitude)}
              target="_blank"
              rel="noreferrer"
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-xs text-text-secondary hover:text-primary-400 hover:border-primary-500 transition-colors',
                !hasOfficePoint && 'pointer-events-none opacity-50'
              )}
            >
              Sekolah <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-4 sm:mb-6 z-10">
        {(['checkin', 'checkout'] as const).map((m) => (
          <Button
            key={m}
            variant={mode === m ? 'primary' : 'outline'}
            onClick={() => setMode(m)}
            disabled={state !== 'idle'}
            size="lg"
          >
            {m === 'checkin' ? 'Check-in' : 'Check-out'}
          </Button>
        ))}
      </div>

      <div
        ref={overlayRef}
        className="relative w-[min(480px,85vw)] aspect-square rounded-2xl overflow-hidden shadow-card border border-surface-border"
      >
        <Webcam
          forwardedRef={webcamRef}
          className="w-full h-full object-cover"
          audio={false}
          onUserMedia={(stream) => {
            streamRef.current = stream;
            stream.getVideoTracks().forEach((track) => {
              track.onended = () => {
                setCameraReady(false);
                setErrorMsg('Kamera dimatikan. Aktifkan kamera lalu refresh halaman.');
                setState('failed');
              };
              track.onmute = () => {
                setCameraReady(false);
                setErrorMsg('Kamera tidak mengirim video. Aktifkan kamera lalu refresh halaman.');
                setState('failed');
              };
            });
            setCameraReady(true);
            cameraErrorShown.current = false;
          }}
          onUserMediaError={handleCameraError}
          screenshotFormat="image/jpeg"
          videoConstraints={{ facingMode: 'user', width: 640, height: 640 }}
          mirrored
        />

        <div
          ref={scanLineRef}
          className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary-300 to-transparent opacity-0 pointer-events-none"
          style={{ boxShadow: '0 0 12px 4px rgba(0,184,184,0.5)' }}
        />

        {cornerPositions.map((pos, i) => (
          <div
            key={i}
            ref={(el) => {
              if (el) cornersRef.current[i] = el;
            }}
            className={cn('absolute w-10 h-10 border-2 border-primary-500 rounded-sm pointer-events-none', pos)}
            style={{
              borderTopWidth: pos.includes('bottom') ? 0 : 2,
              borderBottomWidth: pos.includes('top') ? 0 : 2,
              borderLeftWidth: pos.includes('right') ? 0 : 2,
              borderRightWidth: pos.includes('left') ? 0 : 2,
            }}
          />
        ))}

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-56 h-72 rounded-full border-2 border-dashed border-primary-500/30" />
        </div>

        {(state === 'success' || state === 'notice' || state === 'failed') && (
          <div
            ref={resultRef}
            className={cn(
              'absolute inset-0 flex flex-col items-center justify-center backdrop-blur-md',
              state === 'success' ? 'bg-surface-base/80' : 'bg-surface-base/75'
            )}
          >
            {state === 'success' && result ? (
              <>
                <CheckCircle className="w-16 h-16 text-success mb-4" />
                <p className="font-mono text-xs text-success tracking-widest uppercase mb-2">
                  {result.action === 'checkin' ? 'Check-in Berhasil' : 'Check-out Berhasil'}
                </p>
                <p className="font-display font-bold text-2xl text-text-primary text-center px-4">
                  {result.user.name}
                </p>
                <p className="font-mono text-text-muted text-sm mt-1">{result.user.employee_id}</p>
                <div className="mt-4 flex items-center gap-2 text-success text-sm">
                  <Clock className="w-4 h-4" />
                  <span className="font-mono">{formatTime(result.timestamp)}</span>
                </div>
                {result.late_minutes ? (
                  <span className="mt-2 font-mono text-xs text-accent-400">
                    Terlambat {result.late_minutes} menit
                  </span>
                ) : null}
                {result.work_duration_min ? (
                  <span className="mt-2 font-mono text-xs text-text-secondary">
                    Durasi {Math.floor(result.work_duration_min / 60)}j {result.work_duration_min % 60}m
                  </span>
                ) : null}
              </>
            ) : state === 'notice' ? (
              <>
                <Clock className="w-16 h-16 text-accent-400 mb-4" />
                <p className="font-mono text-xs text-accent-400 tracking-widest uppercase mb-2">Sudah Tercatat</p>
                <p className="font-body text-text-secondary text-sm text-center max-w-sm px-4">
                  {errorMsg || 'Wajah dikenali, absensi sudah tercatat'}
                </p>
              </>
            ) : (
              <>
                <XCircle className="w-16 h-16 text-danger mb-4" />
                <p className="font-mono text-xs text-danger tracking-widest uppercase mb-2">Gagal</p>
                <p className="font-body text-text-secondary text-sm text-center max-w-sm px-4">
                  {errorMsg || 'Coba lagi atau hubungi HR'}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <p
        className={cn(
          'mt-4 sm:mt-8 font-body text-center transition-all duration-300 max-w-md text-sm sm:text-base px-4',
          state === 'idle' || state === 'scanning' ? 'text-text-secondary' : 'text-text-muted text-sm'
        )}
      >
        {state === 'idle' && (cameraReady ? 'Siapkan wajah di tengah lingkaran, lalu tekan Mulai Scan' : 'Izinkan kamera untuk mulai scan')}
        {state === 'scanning' && 'Mendeteksi wajah...'}
        {state === 'verifying' && 'Memverifikasi identitas...'}
        {state === 'success' && 'Absensi berhasil dicatat'}
        {state === 'notice' && 'Absensi sudah tercatat'}
        {state === 'failed' && 'Coba lagi sebentar lagi'}
      </p>

      <div className="mt-3 sm:mt-5 z-10">
        <Button
          size="lg"
          onClick={captureAndVerify}
          disabled={!cameraReady || state !== 'idle' || cooldownRef.current}
          isLoading={isBusy}
          leftIcon={<ScanFace className="w-5 h-5" />}
        >
          {isBusy ? 'Memproses...' : 'Mulai Scan'}
        </Button>
      </div>

      <div className="absolute bottom-3 sm:bottom-6 left-0 right-0 flex justify-center">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-raised border border-surface-border">
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              state === 'idle' && 'bg-primary-500 animate-status-blink',
              state === 'scanning' && 'bg-accent-500 animate-status-blink',
              state === 'verifying' && 'bg-accent-500 animate-status-blink',
              state === 'success' && 'bg-success',
              state === 'notice' && 'bg-accent-500',
              state === 'failed' && 'bg-danger'
            )}
          />
          <span className="font-mono text-xs text-text-muted tracking-widest uppercase">
            {state === 'idle' ? 'Siap Scan' : state}
          </span>
        </div>
      </div>
    </div>
  );
}
