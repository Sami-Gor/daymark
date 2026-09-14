import { describe, expect, it } from 'vitest';

import { isEnglish, selectSpeechEngine } from './speech-engine';

const android = { isNativePlatform: true, platform: 'android' };

describe('selectSpeechEngine', () => {
  it('selects Kokoro for English when the native engine is available on Android', () => {
    const selection = selectSpeechEngine({ ...android, lang: 'en-GB', nativeAvailable: true });
    expect(selection.engine).toBe('kokoro');
    expect(selection.reason).toBe('native-english');
  });

  it('falls back to the browser when the native engine is unavailable', () => {
    const selection = selectSpeechEngine({ ...android, lang: 'en', nativeAvailable: false });
    expect(selection.engine).toBe('browser');
    expect(selection.reason).toBe('native-unavailable');
  });

  it('keeps French on the browser path', () => {
    const selection = selectSpeechEngine({ ...android, lang: 'fr-FR', nativeAvailable: true });
    expect(selection.engine).toBe('browser');
    expect(selection.reason).toBe('non-english');
  });

  it('keeps Spanish on the browser path', () => {
    const selection = selectSpeechEngine({ ...android, lang: 'es-ES', nativeAvailable: true });
    expect(selection.engine).toBe('browser');
    expect(selection.reason).toBe('non-english');
  });

  it('falls back to the browser after a native initialization failure', () => {
    const selection = selectSpeechEngine({ ...android, lang: 'en-GB', nativeAvailable: false });
    expect(selection.engine).toBe('browser');
  });

  it('uses the browser on web and desktop', () => {
    const selection = selectSpeechEngine({
      isNativePlatform: false,
      platform: 'web',
      lang: 'en-GB',
      nativeAvailable: true,
    });
    expect(selection.engine).toBe('browser');
    expect(selection.reason).toBe('not-native');
  });

  it('uses the browser on iOS until a native implementation exists', () => {
    const selection = selectSpeechEngine({
      isNativePlatform: true,
      platform: 'ios',
      lang: 'en-GB',
      nativeAvailable: true,
    });
    expect(selection.engine).toBe('browser');
    expect(selection.reason).toBe('platform-not-android');
  });

  it('treats missing or non-English locales as browser speech', () => {
    expect(isEnglish(undefined)).toBe(false);
    expect(isEnglish('de-DE')).toBe(false);
    expect(isEnglish('EN-us')).toBe(true);
  });
});
