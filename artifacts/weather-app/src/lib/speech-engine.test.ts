import { describe, expect, it } from 'vitest';

import { isEnglish, isSupportedSpeechLocale, selectSpeechEngine } from './speech-engine';

const android = { isNativePlatform: true, platform: 'android' };

describe('selectSpeechEngine', () => {
  it('routes all three production locales to local Kokoro', () => {
    expect(selectSpeechEngine({ ...android, lang: 'en-GB', nativeAvailable: true }))
      .toEqual({ engine: 'kokoro', reason: 'native-english' });
    expect(selectSpeechEngine({ ...android, lang: 'fr-FR', nativeAvailable: true }))
      .toEqual({ engine: 'kokoro', reason: 'native-french' });
    expect(selectSpeechEngine({ ...android, lang: 'es-ES', nativeAvailable: true }))
      .toEqual({ engine: 'kokoro', reason: 'native-spanish' });
    expect(selectSpeechEngine({ ...android, lang: 'es-419', nativeAvailable: true }))
      .toEqual({ engine: 'kokoro', reason: 'native-spanish' });
  });

  it('returns unavailable, never browser/system speech, when native Kokoro is unavailable', () => {
    expect(selectSpeechEngine({ ...android, lang: 'en-GB', nativeAvailable: false }))
      .toEqual({ engine: 'unavailable', reason: 'native-unavailable' });
    expect(selectSpeechEngine({ ...android, lang: 'fr-FR', nativeAvailable: false, nativeReason: 'voice-asset-invalid' }))
      .toEqual({ engine: 'unavailable', reason: 'voice-asset-invalid' });
  });

  it('rejects unsupported languages explicitly', () => {
    expect(selectSpeechEngine({ ...android, lang: 'de-DE', nativeAvailable: true }))
      .toEqual({ engine: 'unavailable', reason: 'unsupported-language' });
  });

  it('has no web or iOS narration path', () => {
    expect(selectSpeechEngine({ isNativePlatform: false, platform: 'web', lang: 'en-GB', nativeAvailable: true }))
      .toEqual({ engine: 'unavailable', reason: 'not-android' });
    expect(selectSpeechEngine({ isNativePlatform: true, platform: 'ios', lang: 'en-GB', nativeAvailable: true }))
      .toEqual({ engine: 'unavailable', reason: 'not-android' });
  });

  it('handles supported and unsupported locale helpers', () => {
    expect(isEnglish(undefined)).toBe(false);
    expect(isEnglish('de-DE')).toBe(false);
    expect(isEnglish('EN-us')).toBe(true);
    expect(isSupportedSpeechLocale('fr-CA')).toBe(true);
    expect(isSupportedSpeechLocale('es-419')).toBe(true);
    expect(isSupportedSpeechLocale('it-IT')).toBe(false);
  });
});