import { describe, expect, it, vi } from 'vitest';

import { pickFallbackAdapter } from './speech-adapters';
import type { BrowserSpeechAdapter } from './speech-router';

function adapter(supported: boolean): BrowserSpeechAdapter {
  return {
    supported,
    speak: vi.fn().mockReturnValue(supported),
    stop: vi.fn(),
  };
}

describe('pickFallbackAdapter', () => {
  it('uses the platform TTS bridge on Android when the WebView has no Web Speech API', () => {
    const webSpeech = adapter(false);
    const systemSpeech = adapter(true);
    const picked = pickFallbackAdapter({ isNativePlatform: true, platform: 'android', webSpeech, systemSpeech });
    expect(picked).toBe(systemSpeech);
  });

  it('uses the offline-gated platform bridge on Android even when Web Speech is available', () => {
    // A WebView that exposed speechSynthesis must not bypass the offline voice
    // gate: Web Speech voices may be served by a network provider.
    const webSpeech = adapter(true);
    const systemSpeech = adapter(true);
    const picked = pickFallbackAdapter({ isNativePlatform: true, platform: 'android', webSpeech, systemSpeech });
    expect(picked).toBe(systemSpeech);
  });

  it('falls back to Web Speech on Android when no platform bridge is provided', () => {
    const webSpeech = adapter(true);
    const picked = pickFallbackAdapter({ isNativePlatform: true, platform: 'android', webSpeech, systemSpeech: null });
    expect(picked).toBe(webSpeech);
  });

  it('keeps the Web Speech API on iOS, which has no system TTS bridge implementation', () => {
    const webSpeech = adapter(true);
    const systemSpeech = adapter(true);
    const picked = pickFallbackAdapter({ isNativePlatform: true, platform: 'ios', webSpeech, systemSpeech });
    expect(picked).toBe(webSpeech);
  });

  it('keeps the Web Speech API on the web', () => {
    const webSpeech = adapter(false);
    const systemSpeech = adapter(true);
    const picked = pickFallbackAdapter({ isNativePlatform: false, platform: 'web', webSpeech, systemSpeech });
    expect(picked).toBe(webSpeech);
  });
});
