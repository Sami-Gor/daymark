/*
 * Pure engine-selection rules for Daymark narration.
 *
 * V2.1 narration is Android-only and offline:
 * - English uses the bundled Kokoro engine and the existing bm_fable path.
 * - French uses the bundled Kokoro engine and ff_siwis.
 * - Spanish uses the bundled Kokoro engine and em_alex with Latin American
 *   Spanish phonemisation.
 * - The web/PWA demo has no narration or speech-synthesis path.
 *
 * Returning `unavailable` is intentional: callers must surface an explicit
 * message rather than falling back to browser speech or Android system TTS.
 */

export type SpeechEngine = 'kokoro' | 'unavailable';
export type SpeechLocale = 'en' | 'fr' | 'es';

export type SpeechSelectionInputs = {
  isNativePlatform: boolean;
  platform: string;
  lang?: string;
  nativeAvailable: boolean;
};

export type SpeechSelection = {
  engine: SpeechEngine;
  reason: string;
};

export function speechLocale(lang?: string): SpeechLocale | null {
  const base = (lang ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return base === 'en' || base === 'fr' || base === 'es' ? base : null;
}

export function isEnglish(lang?: string): boolean {
  return speechLocale(lang) === 'en';
}

export function isSupportedSpeechLocale(lang?: string): boolean {
  return speechLocale(lang) !== null;
}

export function selectSpeechEngine({
  isNativePlatform,
  platform,
  lang,
  nativeAvailable,
}: SpeechSelectionInputs): SpeechSelection {
  if (!isNativePlatform || platform !== 'android') {
    return { engine: 'unavailable', reason: 'not-android' };
  }
  const locale = speechLocale(lang);
  if (!locale) {
    return { engine: 'unavailable', reason: 'unsupported-language' };
  }
  if (!nativeAvailable) {
    return { engine: 'unavailable', reason: 'native-unavailable' };
  }
  const label = locale === 'en' ? 'english' : locale === 'fr' ? 'french' : 'spanish';
  return { engine: 'kokoro', reason: `native-${label}` };
}
