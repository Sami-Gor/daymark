import { WebPlugin } from '@capacitor/core';

import type { DaymarkVoicePlugin, DaymarkVoiceState } from './index';

/*
 * Browser placeholder: DaymarkVoice is a native-only capability. On the web
 * the speech layer keeps using the Web Speech API, so this implementation
 * only reports availability.
 */
export class DaymarkVoiceWeb extends WebPlugin implements DaymarkVoicePlugin {
  async isAvailable(): Promise<{ available: boolean }> {
    return { available: false };
  }

  async getStatus(): Promise<{ state: DaymarkVoiceState }> {
    return { state: 'uninitialized' };
  }

  async speak(): Promise<void> {
    throw this.unavailable('DaymarkVoice is not available on the web');
  }

  async stop(): Promise<void> {
    // Nothing to stop.
  }

  async isSpeaking(): Promise<{ speaking: boolean }> {
    return { speaking: false };
  }
}
