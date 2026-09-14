import { registerPlugin } from '@capacitor/core';

/*
 * Platform TextToSpeech bridge. Used as the fallback for languages without a
 * bundled DaymarkVoice (French, Spanish) on Android, where the Capacitor
 * WebView has no speechSynthesis.
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
