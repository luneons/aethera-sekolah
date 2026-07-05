/**
 * Helper Web Push API.
 *
 * Pattern:
 * - registerServiceWorker() : pastikan sw.js sudah register & ready.
 * - getSubscription()       : ambil subscription saat ini (kalau ada).
 * - subscribeUser(vapidKey) : minta permission + register + push payload ke API.
 * - unsubscribeUser()       : opsional saat user matikan notif.
 *
 * Disengaja dipisah dari pushApi.ts agar logic browser-API terisolasi.
 */
import { fetchVapidPublicKey, subscribePush, unsubscribePush } from './pushApi';

export type PushSupport =
  | 'unsupported'
  | 'denied'
  | 'default'
  | 'granted';

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getPermissionState(): PushSupport {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission as PushSupport;
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  // pastikan SW ada (next.js layout sudah register di awal, fallback di sini)
  try {
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = await navigator.serviceWorker.register('/sw.js');
    }
    await navigator.serviceWorker.ready;
    return reg;
  } catch (e) {
    console.warn('[push] service worker register gagal', e);
    return null;
  }
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const reg = await ensureServiceWorker();
  if (!reg) return null;
  return await reg.pushManager.getSubscription();
}

export async function subscribeUser(): Promise<PushSubscription | null> {
  if (!isPushSupported()) {
    throw new Error('Browser ini tidak mendukung Web Push');
  }

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    throw new Error('Izin notifikasi ditolak');
  }

  const reg = await ensureServiceWorker();
  if (!reg) throw new Error('Service worker tidak tersedia');

  const vapidPublicKey = await fetchVapidPublicKey();
  if (!vapidPublicKey) {
    throw new Error('Server belum mengaktifkan Web Push');
  }

  let sub = await reg.pushManager.getSubscription();

  // Kalau sudah ada subscription tapi key-nya berbeda dari VAPID server sekarang
  // (mis. server di-regenerate VAPID baru), un-subscribe dulu agar push baru
  // pakai key terbaru. Tanpa ini Android akan keep subscription lama yang
  // tidak akan pernah deliver push lagi.
  if (sub) {
    const opts = sub.options;
    const existingKey = opts.applicationServerKey;
    if (!existingKey || !appServerKeyMatch(existingKey, vapidPublicKey)) {
      try {
        await sub.unsubscribe();
      } catch (_) {}
      sub = null;
    }
  }

  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gagal subscribe';
      // Diagnostik: kasih pesan yang lebih jelas
      if (msg.includes('permission') || msg.includes('NotAllowed')) {
        throw new Error('Izin notifikasi tidak diberikan oleh sistem operasi');
      }
      if (msg.includes('Registration failed') || msg.includes('Service Worker')) {
        throw new Error('Service worker belum siap. Reload halaman lalu coba lagi.');
      }
      throw new Error(`Subscribe gagal: ${msg}`);
    }
  }

  if (!sub) throw new Error('Subscription tidak terbuat');

  // Encode keys ke base64-url
  const json = sub.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Subscription tidak punya keys (p256dh/auth) yang valid');
  }

  await subscribePush({
    endpoint: sub.endpoint,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 240) : undefined,
  });

  // Best-effort: register background + periodic sync (didukung browser tertentu).
  void registerBackgroundSync();
  void registerPeriodicSync();

  return sub;
}

function appServerKeyMatch(buf: ArrayBuffer | null, b64: string): boolean {
  if (!buf) return false;
  try {
    const a = new Uint8Array(buf);
    const b = urlBase64ToUint8Array(b64);
    if (a.byteLength !== b.byteLength) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  } catch (_) {
    return false;
  }
}

export async function unsubscribeUser(): Promise<void> {
  const sub = await getCurrentSubscription();
  if (!sub) return;
  try {
    await unsubscribePush(sub.endpoint);
  } catch (_) {
    /* ignore */
  }
  try {
    await sub.unsubscribe();
  } catch (_) {
    /* ignore */
  }
}


/**
 * Daftarin Background Sync (one-shot replay queue) — dipanggil setiap kali
 * client antri request offline.
 */
export async function registerBackgroundSync(tag = 'aethera-replay-queue') {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    // SyncManager ada di tipe Workbox, di TS lib bawaan Next belum ada.
    const syncReg = (reg as unknown as { sync?: { register: (t: string) => Promise<void> } }).sync;
    if (!syncReg) return false;
    await syncReg.register(tag);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Daftarin Periodic Sync — supaya cache notifikasi auto-refresh tiap N menit.
 * Browser yang support: Chrome/Edge desktop (perlu permission `periodic-background-sync`).
 */
export async function registerPeriodicSync(
  tag = 'aethera-refresh-notifications',
  minIntervalMs = 60 * 60 * 1000 // 1 jam
) {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const periodic = (reg as unknown as {
      periodicSync?: { register: (t: string, opts: { minInterval: number }) => Promise<void> };
    }).periodicSync;
    if (!periodic) return false;
    // permission 'periodic-background-sync'
    const status = await (navigator.permissions as unknown as {
      query: (p: { name: string }) => Promise<{ state: string }>;
    }).query({ name: 'periodic-background-sync' });
    if (status.state !== 'granted') return false;
    await periodic.register(tag, { minInterval: minIntervalMs });
    return true;
  } catch (_) {
    return false;
  }
}
