/*
 * Pure engine-selection rules for Daymark speech.
 *
 * Native Kokoro is currently a single English voice (bm_fable), so it is only
 * selected on Android Capacitor builds, for English text, when the native
 * plugin reports itself available. Everything else keeps the existing Web
 * Speech API path: desktop/web/PWA, iOS (no native implementation yet),
 * French and Spanish, and any native failure.
 */

export type SpeechEngine = 'kokoro' | 'browser';

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

export function isEnglish(lang?: string): boolean {
  return (lang ?? '').trim().toLowerCase().startsWith('en');
}

export function selectSpeechEngine({
  isNativePlatform,
  platform,
  lang,
  nativeAvailable,
}: SpeechSelectionInputs): SpeechSelection {
  if (!isNativePlatform) {
    return { engine: 'browser', reason: 'not-native' };
  }
  if (platform !== 'android') {
    return { engine: 'browser', reason: 'platform-not-android' };
  }
  if (!nativeAvailable) {
    return { engine: 'browser', reason: 'native-unavailable' };
  }
  if (!isEnglish(lang)) {
    return { engine: 'browser', reason: 'non-english' };
  }
  return { engine: 'kokoro', reason: 'native-english' };
}
