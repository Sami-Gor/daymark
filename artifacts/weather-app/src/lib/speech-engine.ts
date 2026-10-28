/*
 * Pure engine-selection rules for Daymark narration.
 *
 * V2 narration is Android-only:
 * - English uses the bundled Kokoro engine when it is available.
 * - French and Spanish narration is not available in V2 and is planned for V2.2.
 * - The web/PWA demo has no narration or speech-synthesis path.
 *
 * Returning `unavailable` is intentional: callers must surface an explicit
 * message rather than falling back to browser speech or Android system TTS.
 */

export type SpeechEngine = 'kokoro' | 'unavailable';

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
  if (!isNativePlatform || platform !== 'android') {
    return { engine: 'unavailable', reason: 'not-android' };
  }
  if (!isEnglish(lang)) {
    return { engine: 'unavailable', reason: 'non-english-unavailable' };
  }
  if (!nativeAvailable) {
    return { engine: 'unavailable', reason: 'native-unavailable' };
  }
  return { engine: 'kokoro', reason: 'native-english' };
}
