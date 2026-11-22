import { describe, expect, it } from 'vitest';

import {
  NARRATION_VOICES,
  isEnglish,
  isSupportedSpeechLocale,
  selectSpeechEngine,
  speechLocale,
  voiceForLanguage,
} from './speech-engine';

const android = { isNativePlatform: true, platform: 'android' };

describe('selectSpeechEngine', () => {
  it('selects Kokoro with the packaged English voice when the engine is available', () => {
    expect(selectSpeechEngine({ ...android, lang: 'en-GB', nativeAvailable: true })).toEqual({
      engine: 'kokoro',
      reason: 'native-english',
      locale: 'en',
      voice: 'bm_fable',
    });
  });

  it('selects the packaged French voice for the active French UI language', () => {
    expect(selectSpeechEngine({ ...android, lang: 'fr-FR', nativeAvailable: true })).toEqual({
      engine: 'kokoro',
      reason: 'native-french',
      locale: 'fr',
      voice: 'ff_siwis',
    });
  });

  it('selects the packaged Spanish voice for the active Spanish UI language', () => {
    expect(selectSpeechEngine({ ...android, lang: 'es-ES', nativeAvailable: true })).toEqual({
      engine: 'kokoro',
      reason: 'native-spanish',
      locale: 'es',
      voice: 'em_alex',
    });
  });

  it('maps each supported language to exactly one packaged voice', () => {
    expect(NARRATION_VOICES).toEqual({ en: 'bm_fable', fr: 'ff_siwis', es: 'em_alex' });
    expect(voiceForLanguage('fr-CA')).toBe('ff_siwis');
    expect(voiceForLanguage('es-419')).toBe('em_alex');
    expect(voiceForLanguage('en-US')).toBe('bm_fable');
    expect(voiceForLanguage('de-DE')).toBeNull();
  });

  it('returns unavailable, not browser speech, when native Kokoro is unavailable', () => {
    const selection = selectSpeechEngine({ ...android, lang: 'en', nativeAvailable: false });
    expect(selection.engine).toBe('unavailable');
    expect(selection.reason).toBe('native-unavailable');
  });

  it('passes the native availability reason through instead of inventing one', () => {
    const selection = selectSpeechEngine({
      ...android,
      lang: 'fr-FR',
      nativeAvailable: false,
      nativeReason: 'model-missing',
    });
    expect(selection).toEqual({ engine: 'unavailable', reason: 'model-missing' });
  });

  it('reports an unsupported language explicitly instead of falling back to English', () => {
    for (const lang of ['de-DE', 'it-IT', '', undefined]) {
      const selection = selectSpeechEngine({ ...android, lang, nativeAvailable: true });
      expect(selection.engine).toBe('unavailable');
      expect(selection.reason).toBe('unsupported-language');
    }
  });

  it('has no web or iOS narration path', () => {
    expect(selectSpeechEngine({ isNativePlatform: false, platform: 'web', lang: 'en-GB', nativeAvailable: true }))
      .toEqual({ engine: 'unavailable', reason: 'not-android' });
    expect(selectSpeechEngine({ isNativePlatform: true, platform: 'ios', lang: 'en-GB', nativeAvailable: true }))
      .toEqual({ engine: 'unavailable', reason: 'not-android' });
  });

  it('parses language tags case-insensitively and by base tag', () => {
    expect(speechLocale('EN-us')).toBe('en');
    expect(speechLocale('fr_CA')).toBe('fr');
    expect(isEnglish(undefined)).toBe(false);
    expect(isEnglish('EN-us')).toBe(true);
    expect(isSupportedSpeechLocale('es-MX')).toBe(true);
    expect(isSupportedSpeechLocale('pt-BR')).toBe(false);
  });
});
