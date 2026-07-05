'use client';

import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { setTtsEnabled, ttsEnabled, ttsSupported } from '@/lib/tts';
import { cn } from '@/lib/utils';

/**
 * Toggle voice greeting di kiosk. State dipersist di localStorage,
 * jadi pengaturan tetap bertahan setelah refresh.
 */
export function TtsToggle() {
  const [mounted, setMounted] = useState(false);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setMounted(true);
    setEnabled(ttsEnabled());
  }, []);

  if (!mounted || !ttsSupported()) return null;

  return (
    <button
      type="button"
      onClick={() => {
        const next = !enabled;
        setEnabled(next);
        setTtsEnabled(next);
      }}
      title={enabled ? 'Matikan suara' : 'Aktifkan suara'}
      className={cn(
        'inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-200',
        enabled
          ? 'border-primary-500/40 text-primary-300 bg-primary-500/10 hover:bg-primary-500/20'
          : 'border-surface-border text-text-muted hover:text-text-secondary'
      )}
    >
      {enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
    </button>
  );
}
