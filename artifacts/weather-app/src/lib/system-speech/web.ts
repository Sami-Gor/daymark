import { WebPlugin } from '@capacitor/core';

import type { SystemSpeechPlugin } from './index';

/*
 * Inert placeholder for the legacy wrapper. The web/PWA has no narration path,
 * and Daymark never falls back to browser speech or platform TTS.
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
