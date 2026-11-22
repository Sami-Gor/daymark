/*
 * Pure engine-selection rules for Daymark narration.
 *
 * Narration is Android-only and fully offline:
 * - English uses the bundled Kokoro engine and the bm_fable voice.
 * - French uses the same engine and the ff_siwis voice.
 * - Spanish uses the same engine and the em_alex voice.
 * - The web/PWA demo has no narration or speech-synthesis path.
 *
 * The selected Daymark interface language is the single language selection:
 * the caller passes the locale language tag and the native engine maps it to
 * the matching bundled voice. Returning 'unavailable' is intentional: callers
 * must surface an explicit message rather than falling back to browser speech,
 * Android system TTS, or a different language.
 */

export type SpeechEngine = 'kokoro' | 'unavailable';
export type SpeechLocale = 'en' | 'fr' | 'es';

/**
 * Voice packaged for each supported narration language.
 *
 * This mirrors the native NarrationVoicePolicy; the native side remains
 * authoritative (it owns the asset pins), and the mirrored table is pinned by
 * the host tests and the six-combination evidence matrix.
 */
export const NARRATION_VOICES: Record<SpeechLocale, string> = {
  en: 'bm_fable',
  fr: 'ff_siwis',
  es: 'em_alex',
};

export type SpeechSelectionInputs = {
  isNativePlatform: boolean;
  platform: string;
  lang?: string;
  nativeAvailable: boolean;
  /** Availability reason reported by the native engine, when any. */
  nativeReason?: string;
};

export type SpeechSelection = {
  engine: SpeechEngine;
  reason: string;
  locale?: SpeechLocale;
  voice?: string;
};

/** Base narration language tag, or null when the language is unsupported. */
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

/** The bundled voice for a narration language, or null when unsupported. */
export function voiceForLanguage(lang?: string): string | null {
  const locale = speechLocale(lang);
  return locale ? NARRATION_VOICES[locale] : null;
}

export function selectSpeechEngine({
  isNativePlatform,
  platform,
  lang,
  nativeAvailable,
  nativeReason,
}: SpeechSelectionInputs): SpeechSelection {
  if (!isNativePlatform || platform !== 'android') {
    return { engine: 'unavailable', reason: 'not-android' };
  }
  const locale = speechLocale(lang);
  if (!locale) {
    // No silent fallback: an unknown language is an explicit failure, never
    // English and never another speech service.
    return { engine: 'unavailable', reason: 'unsupported-language' };
  }
  if (!nativeAvailable) {
    return { engine: 'unavailable', reason: nativeReason || 'native-unavailable' };
  }
  const label = locale === 'en' ? 'english' : locale === 'fr' ? 'french' : 'spanish';
  return {
    engine: 'kokoro',
    reason: 'native-' + label,
    locale,
    voice: NARRATION_VOICES[locale],
  };
}
