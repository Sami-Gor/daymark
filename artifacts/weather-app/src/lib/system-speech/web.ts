import { WebPlugin } from '@capacitor/core';

import type { SystemSpeechPlugin } from './index';

/*
 * Browser placeholder: system TTS is only used inside the native shell. The
 * web build keeps the Web Speech API instead.
 */
export class SystemSpeechWeb extends WebPlugin implements SystemSpeechPlugin {
  async isAvailable(): Promise<{ available: boolean }> {
    return { available: false };
  }

  async speak(): Promise<void> {
    throw this.unavailable('SystemSpeech is not available on the web');
  }

  async stop(): Promise<void> {
    // Nothing to stop.
  }

  async isSpeaking(): Promise<{ speaking: boolean }> {
    return { speaking: false };
  }
}
