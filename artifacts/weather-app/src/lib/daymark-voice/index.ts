import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/*
 * Platform-neutral DaymarkVoice interface.
 *
 * Android implements this over the bundled Kokoro engine. iOS and web have
 * placeholder implementations for now. Android narration uses only this local
 * engine (never the system TTS or browser speech), including French and
 * Spanish in the unreleased POC. Model/voice paths, JNI and Rust details are
 * deliberately not exposed.
 */

export type DaymarkVoiceState =
  | 'uninitialized'
  | 'loading'
  | 'ready'
  | 'speaking'
  | 'stopped'
  | 'error';

export interface DaymarkVoicePlugin {
  isAvailable(): Promise<{ available: boolean; reason?: string }>;
  getStatus(): Promise<{ state: DaymarkVoiceState }>;
  /**
   * `text` is always the complete narration. `segments` is an optional TTS-only
   * plan whose concatenation equals `text`; the native side falls back to
   * `text` when segments are missing or do not match.
   */
  speak(options: { text: string; lang?: string; segments?: string[] }): Promise<void>;
  stop(): Promise<void>;
  isSpeaking(): Promise<{ speaking: boolean }>;
  /** Optional narration voices currently installed on disk. */
  getInstalledVoices(): Promise<{ voices: string[] }>;
  /**
   * Registers a voice file the pack manager has already verified and installed.
   * The engine reloads its native voice set; the returned list is what is now
   * loaded. Never falls back to English: failures reject with a stable code.
   */
  registerVoice(options: { voiceId: string }): Promise<{ voices: string[] }>;
  /** Activating an installed voice uses the same guarded reload. */
  activateVoice(options: { voiceId: string }): Promise<{ voices: string[] }>;
  /** Engine state transitions, used to move the UI from preparing to speaking. */
  addListener(
    eventName: 'stateChanged',
    listener: (event: { state: DaymarkVoiceState }) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export const DaymarkVoice = registerPlugin<DaymarkVoicePlugin>('DaymarkVoice', {
  web: () => import('./web').then((m) => new m.DaymarkVoiceWeb()),
});
