import type { BrowserSpeechAdapter } from './speech-router';

/*
 * Picks the fallback speech adapter for non-Kokoro narration.
 *
 * On the web (and in iOS WebViews) the Web Speech API is used. In the Android
 * Capacitor shell the WebView has no speechSynthesis, so the platform
 * TextToSpeech bridge takes over for languages without a bundled local voice.
 */
export function pickFallbackAdapter(input: {
  isNativePlatform: boolean;
  webSpeech: BrowserSpeechAdapter;
  systemSpeech: BrowserSpeechAdapter | null;
}): BrowserSpeechAdapter {
  const { isNativePlatform, webSpeech, systemSpeech } = input;
  if (isNativePlatform && !webSpeech.supported && systemSpeech) {
    return systemSpeech;
  }
  return webSpeech;
}
