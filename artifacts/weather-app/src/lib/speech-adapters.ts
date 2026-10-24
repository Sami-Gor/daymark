import type { BrowserSpeechAdapter } from './speech-router';

/*
 * Picks the fallback speech adapter for non-Kokoro narration.
 *
 * On the web (and in iOS WebViews) the Web Speech API is used. On Android the
 * platform TextToSpeech bridge takes over for languages without a bundled
 * local voice, even if the WebView were to expose speechSynthesis: the bridge
 * is the only narration path gated on offline voices (a Web Speech voice may
 * be served by a network provider), so it must not be bypassed there.
 */
export function pickFallbackAdapter(input: {
  isNativePlatform: boolean;
  platform?: string;
  webSpeech: BrowserSpeechAdapter;
  systemSpeech: BrowserSpeechAdapter | null;
}): BrowserSpeechAdapter {
  const { isNativePlatform, platform, webSpeech, systemSpeech } = input;
  if (isNativePlatform && platform === 'android' && systemSpeech) {
    return systemSpeech;
  }
  return webSpeech;
}
