import { describe, expect, it } from 'vitest';

import { isEnglish, selectSpeechEngine } from './speech-engine';

const android = { isNativePlatform: true, platform: 'android' };

describe('selectSpeechEngine', () => {
  it('selects Kokoro for English when the native engine is available on Android', () => {
    const selection = selectSpeechEngine({ ...android, lang: 'en-GB', nativeAvailable: true });
    expect(selection.engine).toBe('kokoro');
    expect(selection.reason).toBe('native-english');
  });

  it('returns unavailable, not browser speech, when native Kokoro is unavailable', () => {
    const selection = selectSpeechEngine({ ...android, lang: 'en', nativeAvailable: false });
    expect(selection.engine).toBe('unavailable');
    expect(selection.reason).toBe('native-unavailable');
  });

  it('reports French as unavailable in V2', () => {
    const selection = selectSpeechEngine({ ...android, lang: 'fr-FR', nativeAvailable: true });
    expect(selection.engine).toBe('unavailable');
    expect(selection.reason).toBe('non-english-unavailable');
  });

  it('reports Spanish as unavailable in V2', () => {
    const selection = selectSpeechEngine({ ...android, lang: 'es-ES', nativeAvailable: true });
    expect(selection.engine).toBe('unavailable');
    expect(selection.reason).toBe('non-english-unavailable');
  });

  it('has no web or iOS narration path', () => {
    expect(selectSpeechEngine({ isNativePlatform: false, platform: 'web', lang: 'en-GB', nativeAvailable: true }))
      .toEqual({ engine: 'unavailable', reason: 'not-android' });
    expect(selectSpeechEngine({ isNativePlatform: true, platform: 'ios', lang: 'en-GB', nativeAvailable: true }))
      .toEqual({ engine: 'unavailable', reason: 'not-android' });
  });

  it('treats missing or non-English locales as unavailable', () => {
    expect(isEnglish(undefined)).toBe(false);
    expect(isEnglish('de-DE')).toBe(false);
    expect(isEnglish('EN-us')).toBe(true);
  });
});
