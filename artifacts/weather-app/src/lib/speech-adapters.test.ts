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
  it('uses the platform TTS bridge on native when the WebView has no Web Speech API', () => {
    const webSpeech = adapter(false);
    const systemSpeech = adapter(true);
    const picked = pickFallbackAdapter({ isNativePlatform: true, webSpeech, systemSpeech });
    expect(picked).toBe(systemSpeech);
  });

  it('keeps the Web Speech API when it is available in the WebView', () => {
    const webSpeech = adapter(true);
    const systemSpeech = adapter(true);
    const picked = pickFallbackAdapter({ isNativePlatform: true, webSpeech, systemSpeech });
    expect(picked).toBe(webSpeech);
  });

  it('never uses the platform bridge on the web', () => {
    const webSpeech = adapter(false);
    const systemSpeech = adapter(true);
    const picked = pickFallbackAdapter({ isNativePlatform: false, webSpeech, systemSpeech });
    expect(picked).toBe(webSpeech);
  });
});
