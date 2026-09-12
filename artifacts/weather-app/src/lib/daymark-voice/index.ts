import { registerPlugin } from '@capacitor/core';

/*
 * Platform-neutral DaymarkVoice interface.
 *
 * Android implements this over the bundled Kokoro engine. iOS and web have
 * placeholder implementations for now; the React speech layer falls back to
 * the browser Web Speech API whenever the native engine is unavailable.
 * Model/voice paths, JNI and Rust details are deliberately not exposed.
 */

export type DaymarkVoiceState =
  | 'uninitialized'
  | 'loading'
  | 'ready'
  | 'speaking'
  | 'stopped'
  | 'error';

export interface DaymarkVoicePlugin {
  isAvailable(): Promise<{ available: boolean }>;
  getStatus(): Promise<{ state: DaymarkVoiceState }>;
  speak(options: { text: string; lang?: string }): Promise<void>;
  stop(): Promise<void>;
  isSpeaking(): Promise<{ speaking: boolean }>;
}

export const DaymarkVoice = registerPlugin<DaymarkVoicePlugin>('DaymarkVoice', {
  web: () => import('./web').then((m) => new m.DaymarkVoiceWeb()),
});
