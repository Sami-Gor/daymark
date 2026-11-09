import type {
  VoicePackInfo,
  VoicePackInstallResult,
  VoicePackPhase,
  VoicePackProgressEvent,
} from '@/lib/daymark-voice';
import type { Locale, TranslationKey } from '@/lib/i18n';

/**
 * Framework-free state machine behind the narration settings row.
 *
 * Keeping the bridge orchestration outside React means the stale-event,
 * listener-cleanup, consent and READY-gating rules are testable in a plain Node
 * test environment, while the React component only renders this snapshot. The
 * bridge is injected so tests never touch Capacitor.
 */

export const ENGLISH_VOICE = 'bm_fable';
export const FRENCH_VOICE = 'ff_siwis';

export type NarrationPhase =
  | 'idle'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'activating'
  | 'registering'
  | 'ready'
  | 'failed';

export interface NarrationSettingsState {
  started: boolean;
  loading: boolean;
  /** False when this build has no pinned pack source; the row offers nothing. */
  sourceConfigured: boolean;
  nativeAvailable: boolean;
  info: VoicePackInfo | null;
  infoErrorCode: string;
  states: Record<string, string>;
  stateError: boolean;
  selectedVoice: string;
  consentOpen: boolean;
  phase: NarrationPhase;
  operationId: string | null;
  bytesReceived: number;
  totalBytes: number;
  /** Null unless the total size is known. */
  percentage: number | null;
  errorCode: string;
}

export interface NarrationBridge {
  getVoicePackInfo(): Promise<{
    sourceConfigured: boolean;
    nativeAvailable?: boolean;
    errorCode?: string;
    voices: VoicePackInfo[];
  }>;
  getVoiceStates(): Promise<{ states: Record<string, string> }>;
  installVoicePack(options: {
    voiceId: string;
    operationId?: string;
  }): Promise<VoicePackInstallResult>;
  cancelVoicePackInstall(options: { operationId: string }): Promise<{ cancelled: boolean }>;
  addListener(
    eventName: 'voicePackProgress',
    listener: (event: VoicePackProgressEvent) => void,
  ): Promise<{ remove: () => Promise<void> | void }>;
}

export interface NarrationSettingsOptions {
  createOperationId?: () => string;
}

const INSTALL_PHASES: ReadonlySet<NarrationPhase> = new Set<NarrationPhase>([
  'downloading',
  'verifying',
  'installing',
  'activating',
  'registering',
]);

const KNOWN_PHASES: ReadonlySet<string> = new Set<string>([
  'downloading',
  'verifying',
  'installing',
  'activating',
  'registering',
  'ready',
  'failed',
]);

const INITIAL_STATE: NarrationSettingsState = {
  started: false,
  loading: true,
  sourceConfigured: false,
  nativeAvailable: false,
  info: null,
  infoErrorCode: '',
  states: {},
  stateError: false,
  selectedVoice: ENGLISH_VOICE,
  consentOpen: false,
  phase: 'idle',
  operationId: null,
  bytesReceived: 0,
  totalBytes: 0,
  percentage: null,
  errorCode: '',
};

export function isFrenchReady(state: Pick<NarrationSettingsState, 'states'>): boolean {
  return state.states[FRENCH_VOICE] === 'ready';
}

export function isInstalling(state: Pick<NarrationSettingsState, 'phase'>): boolean {
  return INSTALL_PHASES.has(state.phase);
}

export function formatBytes(bytes: number, locale: Locale): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '';
  }
  if (bytes < 1024) {
    try {
      return `${new Intl.NumberFormat(locale).format(Math.round(bytes))} B`;
    } catch {
      return `${Math.round(bytes)} B`;
    }
  }
  const kilobytes = bytes / 1024;
  const useMegabytes = kilobytes >= 1024;
  const value = useMegabytes ? kilobytes / 1024 : kilobytes;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: useMegabytes ? 'megabyte' : 'kilobyte',
      unitDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return `${Math.round(value)} ${useMegabytes ? 'MB' : 'KB'}`;
  }
}

export function normalizeErrorCode(error: unknown): string {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.trim().length > 0) {
      return code.trim();
    }
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message.trim();
    }
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim();
  }
  return 'pack-install-failed';
}

export function narrationErrorKey(code: string): TranslationKey {
  switch (code) {
    case 'cancelled':
      return 'narration.error.cancelled';
    case 'signature-mismatch':
    case 'malformed-signature':
    case 'missing-signature':
    case 'invalid-manifest':
    case 'hash-mismatch':
    case 'size-mismatch':
    case 'voice-hash-mismatch':
    case 'pack-mismatch':
      return 'narration.error.integrity';
    case 'insufficient-storage':
      return 'narration.error.storage';
    case 'packs-unconfigured':
      return 'narration.error.unconfigured';
    case 'unsupported-voice':
    case 'invalid-voice':
      return 'narration.error.unsupported';
    case 'native-unavailable':
    case 'voice-not-loaded':
    case 'registration-failed':
    case 'registration-timeout':
    case 'reload-failed':
    case 'reload-failed-unrecovered':
    case 'operation-conflict':
    case 'state-not-ready':
      return 'narration.error.registration';
    case 'io':
    case 'network':
    case 'too-many-redirects':
      return 'narration.error.network';
    default:
      return code.startsWith('http-')
        ? 'narration.error.network'
        : 'narration.error.unknown';
  }
}

function defaultOperationId(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `narration-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export class NarrationSettingsController {
  private readonly bridge: NarrationBridge;
  private readonly createOperationId: () => string;
  private readonly listeners = new Set<() => void>();

  private state: NarrationSettingsState = INITIAL_STATE;
  private listenerHandle: { remove: () => Promise<void> | void } | null = null;
  private disposed = false;
  private started = false;
  private installSequence = 0;
  private lastProgressKey = '';
  private readonly readyChecks = new Set<string>();

  constructor(bridge: NarrationBridge, options: NarrationSettingsOptions = {}) {
    this.bridge = bridge;
    this.createOperationId = options.createOperationId ?? defaultOperationId;
  }

  getSnapshot = (): NarrationSettingsState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Loads authoritative native state and subscribes exactly once. No download. */
  start(): void {
    if (this.started || this.disposed) {
      return;
    }
    this.started = true;
    this.patch({ started: true, loading: true });
    void this.subscribeToProgress();
    void this.loadInitialState();
  }

  /**
   * Removes the native listener. An in-flight download is not cancelled here:
   * the plugin owns it and a remounted row recovers via getVoiceStates().
   */
  dispose(): void {
    this.disposed = true;
    const handle = this.listenerHandle;
    this.listenerHandle = null;
    if (handle) {
      try {
        void handle.remove();
      } catch {
        // Listener teardown is best effort; the controller is already inert.
      }
    }
    this.listeners.clear();
  }

  /** Opens the consent dialog. Never starts a download by itself. */
  requestDownload(): void {
    if (this.disposed || this.state.loading || !this.state.sourceConfigured) {
      return;
    }
    if (!this.state.info || isFrenchReady(this.state) || isInstalling(this.state)) {
      return;
    }
    this.patch({ consentOpen: true, errorCode: '' });
  }

  cancelConsent(): void {
    if (!this.state.consentOpen) {
      return;
    }
    this.patch({ consentOpen: false });
  }

  /** User accepted the network-use consent dialog. Starts the install. */
  confirmDownload(): void {
    if (!this.state.consentOpen) {
      return;
    }
    this.patch({ consentOpen: false });
    this.beginInstall();
  }

  /** Cancels the active install; late events from it are ignored. */
  cancelInstall(): void {
    const operationId = this.state.operationId;
    if (!operationId || !isInstalling(this.state)) {
      return;
    }
    this.installSequence += 1;
    this.patch({
      phase: 'failed',
      errorCode: 'cancelled',
      operationId: null,
      percentage: null,
    });
    void Promise.resolve(
      this.bridge.cancelVoicePackInstall({ operationId }),
    ).catch(() => undefined);
    void this.refreshStates();
  }

  /** Retries after a failure. Consent for this session is still standing. */
  retry(): void {
    if (this.disposed || this.state.phase !== 'failed' || !this.state.sourceConfigured) {
      return;
    }
    this.beginInstall();
  }

  /** French can only be selected when the native loaded set says READY. */
  selectVoice(voiceId: string): void {
    if (voiceId === ENGLISH_VOICE) {
      this.patch({ selectedVoice: ENGLISH_VOICE });
      return;
    }
    if (voiceId === FRENCH_VOICE && isFrenchReady(this.state)) {
      this.patch({ selectedVoice: FRENCH_VOICE });
    }
  }

  private beginInstall(): void {
    if (this.disposed || this.state.operationId !== null) {
      return;
    }
    const operationId = this.createOperationId();
    this.installSequence += 1;
    const sequence = this.installSequence;
    this.lastProgressKey = '';
    this.patch({
      phase: 'verifying',
      operationId,
      bytesReceived: 0,
      totalBytes: this.state.info?.sizeBytes ?? 0,
      percentage: null,
      errorCode: '',
    });
    Promise.resolve(
      this.bridge.installVoicePack({ voiceId: FRENCH_VOICE, operationId }),
    ).then(
      (result) => {
        if (this.isCurrent(sequence, operationId)) {
          void this.finishReady(sequence, operationId, result.states);
        }
      },
      (error: unknown) => {
        if (this.isCurrent(sequence, operationId)) {
          this.fail(operationId, normalizeErrorCode(error));
        }
      },
    );
  }

  private async loadInitialState(): Promise<void> {
    const [infoResult, stateResult] = await Promise.allSettled([
      this.bridge.getVoicePackInfo(),
      this.bridge.getVoiceStates(),
    ]);
    if (this.disposed) {
      return;
    }
    const info = infoResult.status === 'fulfilled' ? infoResult.value : null;
    const states = stateResult.status === 'fulfilled'
      ? stateResult.value.states ?? {}
      : {};
    this.patch({
      loading: false,
      sourceConfigured: info?.sourceConfigured ?? false,
      nativeAvailable: info?.nativeAvailable ?? true,
      info: info?.voices?.find((voice) => voice.voiceId === FRENCH_VOICE)
        ?? info?.voices?.[0]
        ?? null,
      infoErrorCode: info
        ? info.errorCode ?? ''
        : normalizeErrorCode(infoResult.status === 'rejected' ? infoResult.reason : ''),
      states,
      stateError: stateResult.status === 'rejected',
    });
  }

  private async subscribeToProgress(): Promise<void> {
    try {
      const handle = await this.bridge.addListener('voicePackProgress', (event) => {
        this.onProgress(event);
      });
      if (this.disposed) {
        try {
          await handle.remove();
        } catch {
          // The controller is already inert.
        }
        return;
      }
      this.listenerHandle = handle;
    } catch {
      // Progress is an enhancement; READY still arrives through the install
      // promise and getVoiceStates().
    }
  }

  private onProgress(event: VoicePackProgressEvent): void {
    if (this.disposed || !event || typeof event !== 'object') {
      return;
    }
    // Stale operation ids are ignored: a late event from a cancelled or
    // superseded install must never move the current row.
    if (this.state.operationId === null || event.operationId !== this.state.operationId) {
      return;
    }
    if (event.voiceId !== FRENCH_VOICE || !KNOWN_PHASES.has(event.phase)) {
      return;
    }
    const key = `${event.operationId}|${event.phase}|${event.bytesReceived}|${event.totalBytes}|${event.errorCode ?? ''}`;
    if (key === this.lastProgressKey) {
      return;
    }
    this.lastProgressKey = key;
    if (event.phase === 'failed') {
      this.fail(event.operationId, event.errorCode || 'pack-install-failed');
      return;
    }
    if (event.phase === 'ready') {
      void this.finishReady(this.installSequence, event.operationId);
      return;
    }
    const totalBytes = nonNegative(event.totalBytes);
    const bytesReceived = nonNegative(event.bytesReceived);
    const percentage = totalBytes > 0
      ? Math.min(100, Math.max(0, typeof event.percentage === 'number'
        ? event.percentage
        : (bytesReceived * 100) / totalBytes))
      : null;
    this.patch({
      phase: event.phase as NarrationPhase,
      bytesReceived,
      totalBytes,
      percentage,
      errorCode: '',
    });
  }

  /**
   * Confirms READY against getVoiceStates(), the authoritative source. An event
   * or resolved install promise alone never unlocks French selection.
   */
  private async finishReady(
    sequence: number,
    operationId: string,
    statesHint?: Record<string, string>,
  ): Promise<void> {
    if (this.readyChecks.has(operationId)) {
      return;
    }
    this.readyChecks.add(operationId);
    let states: Record<string, string> = statesHint ?? {};
    try {
      states = (await this.bridge.getVoiceStates()).states ?? {};
    } catch {
      states = statesHint ?? {};
    } finally {
      this.readyChecks.delete(operationId);
    }
    if (this.disposed || sequence !== this.installSequence
        || this.state.operationId !== operationId) {
      return;
    }
    if (states[FRENCH_VOICE] !== 'ready') {
      this.fail(operationId, 'state-not-ready', states);
      return;
    }
    this.patch({
      phase: 'ready',
      operationId: null,
      states,
      stateError: false,
      errorCode: '',
      percentage: this.state.totalBytes > 0 ? 100 : this.state.percentage,
    });
    void this.refreshInfo();
  }

  private fail(
    operationId: string,
    errorCode: string,
    states?: Record<string, string>,
  ): void {
    if (this.state.operationId !== operationId) {
      return;
    }
    this.patch({
      phase: 'failed',
      operationId: null,
      errorCode,
      states: states ?? this.state.states,
      percentage: null,
    });
    void this.refreshStates();
  }

  private async refreshStates(): Promise<void> {
    try {
      const result = await this.bridge.getVoiceStates();
      if (!this.disposed) {
        this.patch({ states: result.states ?? {}, stateError: false });
      }
    } catch {
      if (!this.disposed) {
        this.patch({ stateError: true });
      }
    }
  }

  private async refreshInfo(): Promise<void> {
    try {
      const result = await this.bridge.getVoicePackInfo();
      if (this.disposed) {
        return;
      }
      this.patch({
        sourceConfigured: result.sourceConfigured,
        nativeAvailable: result.nativeAvailable ?? this.state.nativeAvailable,
        info: result.voices?.find((voice) => voice.voiceId === FRENCH_VOICE)
          ?? result.voices?.[0]
          ?? this.state.info,
        infoErrorCode: result.errorCode ?? '',
      });
    } catch {
      // Keep the last known metadata; states stay authoritative for selection.
    }
  }

  private isCurrent(sequence: number, operationId: string): boolean {
    return !this.disposed
      && sequence === this.installSequence
      && this.state.operationId === operationId;
  }

  private patch(patch: Partial<NarrationSettingsState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of Array.from(this.listeners)) {
      listener();
    }
  }
}
