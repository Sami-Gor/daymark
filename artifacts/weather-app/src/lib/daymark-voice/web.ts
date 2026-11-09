import { WebPlugin } from '@capacitor/core';

import type {
  DaymarkVoicePlugin,
  DaymarkVoiceState,
  VoicePackInfoResult,
  VoicePackInstallResult,
} from './index';

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

  async getVoiceStates(): Promise<{ states: Record<string, string> }> {
    return { states: {} };
  }

  async getInstalledVoices(): Promise<{ voices: string[] }> {
    return { voices: [] };
  }

  async getVoicePackInfo(): Promise<VoicePackInfoResult> {
    // The web demo has no on-device narration, so no pack can be offered. This
    // is a fail-closed response, not an invitation to download.
    return {
      sourceConfigured: false,
      nativeAvailable: false,
      errorCode: 'native-unavailable',
      voices: [],
    };
  }

  async installVoicePack(): Promise<VoicePackInstallResult> {
    throw this.unavailable('Optional narration voices are Android-only');
  }

  async cancelVoicePackInstall(): Promise<{ cancelled: boolean }> {
    return { cancelled: false };
  }

  async registerVoice(): Promise<{ voices: string[] }> {
    throw this.unavailable('Optional narration voices are Android-only');
  }

  async activateVoice(): Promise<{ voices: string[] }> {
    throw this.unavailable('Optional narration voices are Android-only');
  }
}
