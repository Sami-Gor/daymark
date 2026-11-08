import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { DaymarkVoice } from '@/lib/daymark-voice';

const VOICE_FOR_LOCALE: Record<string, string> = {
  en: 'bm_fable',
  fr: 'ff_siwis',
  es: 'em_alex',
};

export type VoicePackStates = Record<string, string>;

/**
 * Reads the native per-voice lifecycle state (available/installed/activating/
 * ready/failed) for the narration UI.
 *
 * The UI must never infer readiness from a file existing on disk: READY is the
 * only state in which an optional French/Spanish voice may be selected or
 * synthesised. English remains built in.
 */
export function useVoicePackState() {
  const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  const [states, setStates] = useState<VoicePackStates>({});
  const [loading, setLoading] = useState(isAndroidNative);

  useEffect(() => {
    if (!isAndroidNative) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    DaymarkVoice.getVoiceStates()
      .then((result) => {
        if (!cancelled) setStates(result.states ?? {});
      })
      .catch(() => {
        // Missing native support keeps optional voices unavailable rather than
        // pretending they are ready.
        if (!cancelled) setStates({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAndroidNative]);

  const isReady = (locale: string): boolean => {
    const base = locale.split(/[-_]/)[0];
    if (base === 'en') return true;
    const voice = VOICE_FOR_LOCALE[base];
    return voice !== undefined && states[voice] === 'ready';
  };

  return { states, loading, isReady, isAndroidNative };
}
