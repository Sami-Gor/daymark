import { registerPlugin } from '@capacitor/core';

/*
 * Legacy platform TextToSpeech wrapper, retained only for source-level offline
 * voice guards. It is not imported by the narration path and must not be used
 * as a fallback: Daymark has no system-TTS or browser-speech narration path.
 */

export interface SystemSpeechPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  speak(options: { text: string; lang?: string }): Promise<void>;
  stop(): Promise<void>;
  isSpeaking(): Promise<{ speaking: boolean }>;
}

export const SystemSpeech = registerPlugin<SystemSpeechPlugin>('SystemSpeech', {
  web: () => import('./web').then((m) => new m.SystemSpeechWeb()),
});
