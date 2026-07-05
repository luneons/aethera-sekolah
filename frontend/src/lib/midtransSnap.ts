/**
 * Loader untuk Midtrans Snap.js — script popup pembayaran.
 *
 * Snap.js di-load dinamis (bukan di <head>) supaya hanya ke-load saat
 * user benar-benar mau bayar. URL berbeda untuk sandbox vs production.
 */

const SANDBOX_URL = 'https://app.sandbox.midtrans.com/snap/snap.js';
const PRODUCTION_URL = 'https://app.midtrans.com/snap/snap.js';

interface SnapCallbacks {
  onSuccess?: (result: unknown) => void;
  onPending?: (result: unknown) => void;
  onError?: (result: unknown) => void;
  onClose?: () => void;
}

interface SnapInstance {
  pay: (token: string, callbacks: SnapCallbacks) => void;
}

declare global {
  interface Window {
    snap?: SnapInstance;
  }
}

let _loadingPromise: Promise<void> | null = null;
let _loadedClientKey: string | null = null;

/**
 * Pastikan snap.js sudah ke-load dengan client key yang benar.
 * Idempotent — kalau sudah load dengan key yang sama, langsung resolve.
 */
export function loadSnapScript(clientKey: string, isProduction: boolean): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Snap hanya bisa di-load di browser'));
  }

  // Sudah loaded dengan key sama → langsung pakai
  if (window.snap && _loadedClientKey === clientKey) {
    return Promise.resolve();
  }

  if (_loadingPromise && _loadedClientKey === clientKey) {
    return _loadingPromise;
  }

  // Hapus script lama kalau key berubah
  const existing = document.getElementById('midtrans-snap-script');
  if (existing) existing.remove();

  _loadedClientKey = clientKey;
  _loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'midtrans-snap-script';
    script.src = isProduction ? PRODUCTION_URL : SANDBOX_URL;
    script.setAttribute('data-client-key', clientKey);
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Gagal memuat Midtrans Snap'));
    document.body.appendChild(script);
  });

  return _loadingPromise;
}

/**
 * Buka popup pembayaran Snap.
 */
export function openSnapPayment(token: string, callbacks: SnapCallbacks) {
  if (typeof window === 'undefined' || !window.snap) {
    callbacks.onError?.(new Error('Snap belum siap'));
    return;
  }
  window.snap.pay(token, callbacks);
}
