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

/** Optional narration pack lifecycle phases emitted by the native install. */
export type VoicePackPhase =
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'activating'
  | 'registering'
  | 'ready'
  | 'failed';

/**
 * One progress snapshot for a user-initiated narration pack install.
 *
 * `operationId` scopes the event: the UI must ignore events whose operation id
 * is not the install it started. `percentage` is present only when the total
 * size is known. `getVoiceStates()` remains the authoritative readiness source;
 * a `ready` phase event is not a substitute for it.
 */
export interface VoicePackProgressEvent {
  voiceId: string;
  operationId: string;
  phase: VoicePackPhase;
  bytesReceived: number;
  totalBytes: number;
  percentage?: number;
  errorCode?: string;
}

export interface VoicePackLicence {
  spdx: string;
  name: string;
  url: string;
  attribution: string;
  notice: string;
}

/** Local pack metadata returned by `getVoicePackInfo()`. Never downloads. */
export interface VoicePackInfo {
  voiceId: string;
  packId: string;
  language: string;
  /** Known catalog payload size in bytes; the signed manifest wins at install. */
  sizeBytes: number;
  installedVersion: number;
  installed: boolean;
  ready: boolean;
  state: string;
  licence: VoicePackLicence;
}

export interface VoicePackInfoResult {
  /** False when this build has no pinned pack source (fail-closed production). */
  sourceConfigured: boolean;
  nativeAvailable?: boolean;
  errorCode?: string;
  voices: VoicePackInfo[];
}

export interface VoicePackInstallResult {
  voiceId: string;
  operationId: string;
  ready: boolean;
  states: Record<string, string>;
}

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
  /** Per-voice lifecycle state: available/downloading/verifying/installed/activating/ready/failed. */
  getVoiceStates(): Promise<{ states: Record<string, string> }>;
  /** Optional narration voices currently installed on disk. */
  getInstalledVoices(): Promise<{ voices: string[] }>;
  /** Local metadata for downloadable narration packs (size, licence, readiness). */
  getVoicePackInfo(): Promise<VoicePackInfoResult>;
  /**
   * Starts a user-initiated install of an allow-listed optional voice. Only the
   * voice id is accepted; the native layer derives every URL from build config.
   * Resolves only when the runtime reports the voice READY, otherwise rejects
   * with a stable error code.
   */
  installVoicePack(options: { voiceId: string; operationId?: string }): Promise<VoicePackInstallResult>;
  /** Cancels the active install if `operationId` still owns it. */
  cancelVoicePackInstall(options: { operationId: string }): Promise<{ cancelled: boolean }>;
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
  /** Install progress for the user-initiated pack download. */
  addListener(
    eventName: 'voicePackProgress',
    listener: (event: VoicePackProgressEvent) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export const DaymarkVoice = registerPlugin<DaymarkVoicePlugin>('DaymarkVoice', {
  web: () => import('./web').then((m) => new m.DaymarkVoiceWeb()),
});
