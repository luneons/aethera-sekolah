/**
 * Text-to-speech utility — Web Speech API.
 *
 * Strategi:
 * 1. Cari voice Bahasa Indonesia yang tersedia di browser (lang=id-ID atau id_ID)
 * 2. Fallback ke voice default kalau ga ada
 * 3. Setting rate sedikit lebih lambat (0.95) supaya kedengaran natural di kiosk
 * 4. Toggle on/off via localStorage (kepsek bisa matikan kalau sekolah tidak ingin berisik)
 *
 * Dipakai oleh: kiosk page setelah scan wajah berhasil.
 */

const SETTINGS_KEY = 'aethera-tts-enabled';

/** Cek apakah browser support Web Speech API. */
export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** User toggle untuk enable/disable TTS. Default: enabled. */
export function ttsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const v = window.localStorage.getItem(SETTINGS_KEY);
  return v !== '0';
}

export function setTtsEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SETTINGS_KEY, enabled ? '1' : '0');
}

/**
 * Pilih voice Bahasa Indonesia yang tersedia.
 * Voice list mungkin belum siap saat first call — perlu wait atau retry.
 */
function pickIndonesianVoice(): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  // Priority 1: id-ID exact match
  const idID = voices.find((v) => v.lang === 'id-ID');
  if (idID) return idID;

  // Priority 2: lang starts with 'id'
  const id = voices.find((v) => v.lang.toLowerCase().startsWith('id'));
  if (id) return id;

  // Priority 3: voice yang nama-nya mengandung "Indonesia" atau "Damayanti" atau "Andika"
  const byName = voices.find((v) =>
    /indonesia|damayanti|andika/i.test(v.name)
  );
  if (byName) return byName;

  return null;
}

/** Wait sampai voice list ready (Chrome async-load voices). */
function waitForVoices(timeoutMs = 1500): Promise<void> {
  return new Promise((resolve) => {
    if (!ttsSupported()) {
      resolve();
      return;
    }
    if (window.speechSynthesis.getVoices().length > 0) {
      resolve();
      return;
    }
    const handle = setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', onChange);
      resolve();
    }, timeoutMs);
    const onChange = () => {
      clearTimeout(handle);
      window.speechSynthesis.removeEventListener('voiceschanged', onChange);
      resolve();
    };
    window.speechSynthesis.addEventListener('voiceschanged', onChange);
  });
}

interface SpeakOptions {
  /** 0.1–10 (default 0.95 — sedikit lebih lambat & natural). */
  rate?: number;
  /** 0–2 (default 1.0). */
  pitch?: number;
  /** 0–1 (default 1.0). */
  volume?: number;
  /** Override pilihan voice. */
  voice?: SpeechSynthesisVoice;
}

/**
 * Ucapkan kalimat. Auto-cancel kalau ada speech yang sedang berjalan.
 *
 * Gracefully no-op kalau:
 * - Browser tidak support
 * - User mematikan TTS (via localStorage)
 * - Page tidak terinteraksi (sebagian browser block autoplay sampai user gesture)
 */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (!ttsSupported() || !ttsEnabled() || !text.trim()) return;

  await waitForVoices();
  const synth = window.speechSynthesis;
  // Cancel dulu kalau ada yang lagi jalan
  synth.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'id-ID';
  utter.rate = opts.rate ?? 0.95;
  utter.pitch = opts.pitch ?? 1.0;
  utter.volume = opts.volume ?? 1.0;

  const voice = opts.voice ?? pickIndonesianVoice();
  if (voice) utter.voice = voice;

  synth.speak(utter);
}

export function stopSpeaking() {
  if (!ttsSupported()) return;
  window.speechSynthesis.cancel();
}
