import { describe, expect, it } from 'vitest';

import { isEnglish, isSupportedSpeechLocale, selectSpeechEngine } from './speech-engine';

const android = { isNativePlatform: true, platform: 'android' };
const pocApplicationId = 'io.github.sami_gor.daymark.pocmultilingual';
const productionApplicationId = 'io.github.sami_gor.daymark';

describe('selectSpeechEngine', () => {
  it('selects Kokoro for English when the native engine is available on Android', () => {
    const selection = selectSpeechEngine({ ...android, lang: 'en-GB', nativeAvailable: true });
    expect(selection.engine).toBe('kokoro');
    expect(selection.reason).toBe('native-english');
  });

  it('routes French to the local Kokoro engine in the POC debug build', () => {
    const selection = selectSpeechEngine({
      ...android,
      lang: 'fr-FR',
      nativeAvailable: true,
      applicationId: pocApplicationId,
    });
    expect(selection).toEqual({ engine: 'kokoro', reason: 'native-french' });
  });

  it('routes Latin American Spanish to the local Kokoro engine in the POC debug build', () => {
    const selection = selectSpeechEngine({
      ...android,
      lang: 'es-419',
      nativeAvailable: true,
      applicationId: pocApplicationId,
    });
    expect(selection).toEqual({ engine: 'kokoro', reason: 'native-spanish' });
    expect(selectSpeechEngine({
      ...android,
      lang: 'es-ES',
      nativeAvailable: true,
      applicationId: pocApplicationId,
    })).toEqual({ engine: 'kokoro', reason: 'native-spanish' });
  });

  it('selects the native engine for French and Spanish in a production release', () => {
    // V2.1 ships multilingual narration. Availability now depends on the
    // optional voice being installed and reported READY by the native runtime
    // (enforced in the narration UI), not on a debug application id.
    for (const lang of ['fr-FR', 'es-419']) {
      expect(selectSpeechEngine({
        ...android,
        lang,
        nativeAvailable: true,
        applicationId: productionApplicationId,
      })).toEqual({ engine: 'kokoro', reason: lang.startsWith('fr') ? 'native-french' : 'native-spanish' });
    }
    expect(selectSpeechEngine({ ...android, lang: 'fr-FR', nativeAvailable: true }))
      .toEqual({ engine: 'kokoro', reason: 'native-french' });
  });

  it('still fails closed when the native engine is unavailable', () => {
    expect(selectSpeechEngine({
      ...android,
      lang: 'fr-FR',
      nativeAvailable: false,
      nativeReason: 'native-unavailable',
      applicationId: productionApplicationId,
    })).toEqual({ engine: 'unavailable', reason: 'native-unavailable' });
  });

  it('leaves English narration unaffected by the POC release gate', () => {
    expect(selectSpeechEngine({
      ...android,
      lang: 'en-GB',
      nativeAvailable: true,
      applicationId: productionApplicationId,
    })).toEqual({ engine: 'kokoro', reason: 'native-english' });
  });

  it('returns unavailable, not browser speech, when native Kokoro is unavailable', () => {
    const selection = selectSpeechEngine({ ...android, lang: 'en', nativeAvailable: false });
    expect(selection.engine).toBe('unavailable');
    expect(selection.reason).toBe('native-unavailable');
  });

  it('keeps a native availability reason for actionable UI', () => {
    expect(selectSpeechEngine({
      ...android,
      lang: 'en',
      nativeAvailable: false,
      nativeReason: 'voice-asset-invalid',
    })).toEqual({ engine: 'unavailable', reason: 'voice-asset-invalid' });
  });

  it('rejects unsupported languages explicitly', () => {
    const selection = selectSpeechEngine({ ...android, lang: 'de-DE', nativeAvailable: true });
    expect(selection).toEqual({ engine: 'unavailable', reason: 'unsupported-language' });
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
