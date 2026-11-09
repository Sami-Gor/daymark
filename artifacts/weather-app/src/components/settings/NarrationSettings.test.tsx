import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { translate, type Translate } from '@/lib/i18n';
import type {
  VoicePackInfo,
  VoicePackInfoResult,
  VoicePackInstallResult,
  VoicePackProgressEvent,
} from '@/lib/daymark-voice';
import { NarrationSettingsView, type NarrationSettingsActions } from './NarrationSettings';
import {
  ENGLISH_VOICE,
  FRENCH_VOICE,
  NarrationSettingsController,
  type NarrationBridge,
  type NarrationSettingsState,
} from './narration-settings-controller';

const t: Translate = (key, params) => translate('en', key, params);

function frenchInfo(overrides: Partial<VoicePackInfo> = {}): VoicePackInfo {
  return {
    voiceId: FRENCH_VOICE,
    packId: 'fr',
    language: 'fr',
    sizeBytes: 522_240,
    installedVersion: 0,
    installed: false,
    ready: false,
    state: 'available',
    licence: {
      spdx: 'CC-BY-4.0',
      name: 'Creative Commons Attribution 4.0 International',
      url: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: 'ff_siwis · SIWIS · DOI 10.7488/ds/1705',
      notice: 'CC BY 4.0 · SIWIS DOI 10.7488/ds/1705',
    },
    ...overrides,
  };
}

function infoResult(overrides: Partial<VoicePackInfoResult> = {}): VoicePackInfoResult {
  return {
    sourceConfigured: true,
    nativeAvailable: true,
    voices: [frenchInfo()],
    ...overrides,
  };
}

function baseState(overrides: Partial<NarrationSettingsState> = {}): NarrationSettingsState {
  return {
    started: true,
    loading: false,
    sourceConfigured: true,
    nativeAvailable: true,
    info: frenchInfo(),
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
    ...overrides,
  };
}

const noopActions: NarrationSettingsActions = {
  requestDownload: () => undefined,
  cancelConsent: () => undefined,
  confirmDownload: () => undefined,
  cancelInstall: () => undefined,
  retry: () => undefined,
  selectVoice: () => undefined,
};

function inputTag(markup: string, testId: string): string {
  const marker = `data-testid="${testId}"`;
  const at = markup.indexOf(marker);
  if (at < 0) {
    throw new Error(`missing input ${testId}`);
  }
  const start = markup.lastIndexOf('<input', at);
  const end = markup.indexOf('>', at);
  return markup.slice(start, end + 1);
}

function render(state: NarrationSettingsState, isAndroidNative = true): string {
  return renderToStaticMarkup(
    <NarrationSettingsView
      state={state}
      t={t}
      locale="en"
      actions={noopActions}
      isAndroidNative={isAndroidNative}
    />,
  );
}

type PendingInstall = {
  resolve: (value: VoicePackInstallResult) => void;
  reject: (reason?: unknown) => void;
};

class FakeBridge implements NarrationBridge {
  info: VoicePackInfoResult = infoResult();
  states: Record<string, string> = {};
  installCalls: Array<{ voiceId: string; operationId?: string }> = [];
  cancelCalls: string[] = [];
  listenerAdds = 0;
  listenerRemovals = 0;
  infoCalls = 0;
  stateCalls = 0;
  listener: ((event: VoicePackProgressEvent) => void) | null = null;
  delayListener: Promise<void> | null = null;
  private pending: PendingInstall | null = null;

  async getVoicePackInfo(): Promise<VoicePackInfoResult> {
    this.infoCalls += 1;
    return this.info;
  }

  async getVoiceStates(): Promise<{ states: Record<string, string> }> {
    this.stateCalls += 1;
    return { states: { ...this.states } };
  }

  installVoicePack(options: {
    voiceId: string;
    operationId?: string;
  }): Promise<VoicePackInstallResult> {
    this.installCalls.push(options);
    return new Promise<VoicePackInstallResult>((resolve, reject) => {
      this.pending = { resolve, reject };
    });
  }

  async cancelVoicePackInstall(options: {
    operationId: string;
  }): Promise<{ cancelled: boolean }> {
    this.cancelCalls.push(options.operationId);
    return { cancelled: true };
  }

  async addListener(
    _eventName: 'voicePackProgress',
    listener: (event: VoicePackProgressEvent) => void,
  ): Promise<{ remove: () => Promise<void> | void }> {
    this.listenerAdds += 1;
    if (this.delayListener) {
      await this.delayListener;
    }
    this.listener = listener;
    return {
      remove: async () => {
        this.listenerRemovals += 1;
      },
    };
  }

  emit(event: VoicePackProgressEvent): void {
    this.listener?.(event);
  }

  resolveInstall(overrides: Partial<VoicePackInstallResult> = {}): void {
    const last = this.installCalls[this.installCalls.length - 1];
    this.pending?.resolve({
      voiceId: FRENCH_VOICE,
      operationId: last?.operationId ?? 'op',
      ready: true,
      states: { ...this.states },
      ...overrides,
    });
    this.pending = null;
  }

  rejectInstall(error: unknown): void {
    this.pending?.reject(error);
    this.pending = null;
  }
}

let operationCounter = 0;

function controllerFor(bridge: FakeBridge): NarrationSettingsController {
  operationCounter = 0;
  return new NarrationSettingsController(bridge, {
    createOperationId: () => `op-${++operationCounter}`,
  });
}

function progress(
  operationId: string,
  overrides: Partial<VoicePackProgressEvent> = {},
): VoicePackProgressEvent {
  return {
    voiceId: FRENCH_VOICE,
    operationId,
    phase: 'downloading',
    bytesReceived: 0,
    totalBytes: 0,
    errorCode: '',
    ...overrides,
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('NarrationSettings metadata and row', () => {
  it('shows the real native size and licence without downloading on open', async () => {
    const bridge = new FakeBridge();
    const controller = controllerFor(bridge);
    controller.start();
    await flush();

    expect(bridge.installCalls).toHaveLength(0);
    expect(controller.getSnapshot().info?.sizeBytes).toBe(522_240);
    expect(controller.getSnapshot().consentOpen).toBe(false);

    const markup = render(controller.getSnapshot());
    expect(markup).toContain('data-testid="narration-settings"');
    expect(markup).toContain('French');
    expect(markup).toContain('English');
    expect(markup).toContain('Built in');
    expect(markup).toContain('510 kB');
    expect(markup).toContain('CC BY 4.0');
    expect(markup).toContain('10.7488/ds/1705');
    expect(markup).toContain('data-testid="narration-radio-french"');
    // French is not selectable before getVoiceStates() reports ready.
    expect(inputTag(markup, 'narration-radio-french')).toContain('disabled');
    expect(inputTag(markup, 'narration-radio-english')).not.toContain('disabled');
  });

  it('shows a fail-closed note when the build has no pack source', async () => {
    const bridge = new FakeBridge();
    bridge.info = {
      sourceConfigured: false,
      nativeAvailable: true,
      errorCode: 'packs-unconfigured',
      voices: [],
    };
    const controller = controllerFor(bridge);
    controller.start();
    await flush();

    const markup = render(controller.getSnapshot());
    expect(markup).toContain('data-testid="narration-unconfigured"');
    expect(markup).toContain('not configured');
    expect(markup).not.toContain('data-testid="narration-download"');
    expect(bridge.installCalls).toHaveLength(0);
  });
});

describe('NarrationSettings consent', () => {
  it('opens a consent dialog that discloses network use and never auto-downloads', async () => {
    const bridge = new FakeBridge();
    const controller = controllerFor(bridge);
    controller.start();
    await flush();

    controller.requestDownload();
    expect(controller.getSnapshot().consentOpen).toBe(true);
    expect(bridge.installCalls).toHaveLength(0);

    const markup = render(controller.getSnapshot());
    expect(markup).toContain('data-testid="narration-consent-dialog"');
    expect(markup).toContain('internet connection');
    expect(markup).toContain('Mobile data charges');
    expect(markup).toContain('CC BY 4.0');
    expect(markup).toContain('510 kB');
    expect(markup).toContain('data-testid="narration-consent-cancel"');
    expect(markup).toContain('data-testid="narration-consent-confirm"');

    controller.cancelConsent();
    expect(controller.getSnapshot().consentOpen).toBe(false);
    expect(bridge.installCalls).toHaveLength(0);
  });

  it('starts exactly one install after the user confirms', async () => {
    const bridge = new FakeBridge();
    const controller = controllerFor(bridge);
    controller.start();
    await flush();
    controller.requestDownload();
    controller.confirmDownload();

    expect(bridge.installCalls).toHaveLength(1);
    expect(bridge.installCalls[0]).toEqual({
      voiceId: FRENCH_VOICE,
      operationId: 'op-1',
    });
    expect(controller.getSnapshot().operationId).toBe('op-1');
    expect(controller.getSnapshot().phase).toBe('verifying');

    controller.confirmDownload();
    expect(bridge.installCalls).toHaveLength(1);
  });
});

describe('NarrationSettings progress', () => {
  it('shows bytes and percentage only when the total is known', async () => {
    const bridge = new FakeBridge();
    const controller = controllerFor(bridge);
    controller.start();
    await flush();
    controller.requestDownload();
    controller.confirmDownload();

    bridge.emit(progress('op-1', { totalBytes: 1000, bytesReceived: 100, percentage: 10 }));
    expect(controller.getSnapshot().bytesReceived).toBe(100);
    expect(controller.getSnapshot().totalBytes).toBe(1000);
    expect(controller.getSnapshot().percentage).toBe(10);

    let markup = render(controller.getSnapshot());
    expect(markup).toContain('data-testid="narration-progressbar"');
    expect(markup).toContain('aria-valuenow="10"');
    expect(markup).toContain('10%');
    expect(markup).toContain('100 B');

    bridge.emit(progress('op-1', { phase: 'verifying', totalBytes: 0, bytesReceived: 0 }));
    expect(controller.getSnapshot().percentage).toBeNull();
    markup = render(controller.getSnapshot());
    expect(markup).not.toContain('aria-valuenow');
    expect(markup).toContain('narration-progressbar');
  });

  it('ignores duplicate snapshots and stale operation ids', async () => {
    const bridge = new FakeBridge();
    const controller = controllerFor(bridge);
    controller.start();
    await flush();
    controller.requestDownload();
    controller.confirmDownload();

    let changes = 0;
    const unsubscribe = controller.subscribe(() => {
      changes += 1;
    });
    bridge.emit(progress('op-1', { totalBytes: 100, bytesReceived: 10 }));
    expect(changes).toBe(1);

    bridge.emit(progress('op-1', { totalBytes: 100, bytesReceived: 10 }));
    bridge.emit(progress('op-1', { totalBytes: 100, bytesReceived: 10 }));
    expect(changes).toBe(1);

    bridge.emit(progress('op-old', { totalBytes: 100, bytesReceived: 90, percentage: 90 }));
    expect(changes).toBe(1);
    expect(controller.getSnapshot().bytesReceived).toBe(10);

    bridge.emit(progress('op-1', { totalBytes: 100, bytesReceived: 20, percentage: 20 }));
    expect(changes).toBe(2);
    expect(controller.getSnapshot().bytesReceived).toBe(20);
    unsubscribe();
  });

  it('cancels the active install and ignores its late events', async () => {
    const bridge = new FakeBridge();
    const controller = controllerFor(bridge);
    controller.start();
    await flush();
    controller.requestDownload();
    controller.confirmDownload();
    bridge.emit(progress('op-1', { totalBytes: 100, bytesReceived: 10 }));

    controller.cancelInstall();
    expect(bridge.cancelCalls).toEqual(['op-1']);
    expect(controller.getSnapshot().phase).toBe('failed');
    expect(controller.getSnapshot().errorCode).toBe('cancelled');
    expect(controller.getSnapshot().operationId).toBeNull();

    bridge.emit(progress('op-1', { phase: 'ready', totalBytes: 100, bytesReceived: 100 }));
    expect(controller.getSnapshot().phase).toBe('failed');
    expect(controller.getSnapshot().errorCode).toBe('cancelled');
  });
});

describe('NarrationSettings READY gating', () => {
  it('does not unlock French from a ready event when getVoiceStates disagrees', async () => {
    const bridge = new FakeBridge();
    const controller = controllerFor(bridge);
    controller.start();
    await flush();
    controller.requestDownload();
    controller.confirmDownload();

    bridge.states = { [FRENCH_VOICE]: 'installed' };
    bridge.emit(progress('op-1', { phase: 'ready', totalBytes: 100, bytesReceived: 100 }));
    await flush();

    expect(controller.getSnapshot().phase).toBe('failed');
    expect(controller.getSnapshot().errorCode).toBe('state-not-ready');
    expect(controller.getSnapshot().operationId).toBeNull();
    const markup = render(controller.getSnapshot());
    expect(inputTag(markup, 'narration-radio-french')).toContain('disabled');
  });

  it('unlocks French only after getVoiceStates reports ready', async () => {
    const bridge = new FakeBridge();
    const controller = controllerFor(bridge);
    controller.start();
    await flush();
    controller.requestDownload();
    controller.confirmDownload();

    bridge.states = { [FRENCH_VOICE]: 'ready' };
    bridge.emit(progress('op-1', { phase: 'ready', totalBytes: 100, bytesReceived: 100 }));
    await flush();

    expect(controller.getSnapshot().phase).toBe('ready');
    expect(controller.getSnapshot().states[FRENCH_VOICE]).toBe('ready');
    controller.selectVoice(FRENCH_VOICE);
    expect(controller.getSnapshot().selectedVoice).toBe(FRENCH_VOICE);

    const markup = render(controller.getSnapshot());
    expect(inputTag(markup, 'narration-radio-french')).not.toContain('disabled');
    expect(inputTag(markup, 'narration-radio-french')).toContain('checked');
    expect(markup).toContain('data-testid="narration-ready-note"');

    // English remains unaffected by a ready French pack.
    controller.selectVoice(ENGLISH_VOICE);
    expect(controller.getSnapshot().selectedVoice).toBe(ENGLISH_VOICE);
    const englishMarkup = render(controller.getSnapshot());
    expect(inputTag(englishMarkup, 'narration-radio-english')).not.toContain('disabled');
  });

  it('confirms readiness through getVoiceStates when the install promise resolves', async () => {
    const bridge = new FakeBridge();
    const controller = controllerFor(bridge);
    controller.start();
    await flush();
    controller.requestDownload();
    controller.confirmDownload();

    bridge.states = { [FRENCH_VOICE]: 'ready' };
    bridge.resolveInstall();
    await flush();

    expect(controller.getSnapshot().phase).toBe('ready');
    expect(controller.getSnapshot().operationId).toBeNull();
    expect(bridge.stateCalls).toBeGreaterThan(1);
  });

  it('recovers a previously READY voice from getVoiceStates without downloading', async () => {
    const bridge = new FakeBridge();
    bridge.info = infoResult({ voices: [frenchInfo({ installed: true, ready: true, installedVersion: 1 })] });
    bridge.states = { [FRENCH_VOICE]: 'ready' };
    const controller = controllerFor(bridge);
    controller.start();
    await flush();

    expect(bridge.installCalls).toHaveLength(0);
    expect(controller.getSnapshot().phase).toBe('idle');
    expect(controller.getSnapshot().states[FRENCH_VOICE]).toBe('ready');
    controller.selectVoice(FRENCH_VOICE);
    expect(controller.getSnapshot().selectedVoice).toBe(FRENCH_VOICE);

    const markup = render(controller.getSnapshot());
    expect(inputTag(markup, 'narration-radio-french')).not.toContain('disabled');
  });
});

describe('NarrationSettings retry and cleanup', () => {
  it('retries with a new operation id and ignores the failed operation', async () => {
    const bridge = new FakeBridge();
    const controller = controllerFor(bridge);
    controller.start();
    await flush();
    controller.requestDownload();
    controller.confirmDownload();

    bridge.emit(progress('op-1', { phase: 'failed', errorCode: 'hash-mismatch' }));
    await flush();
    expect(controller.getSnapshot().phase).toBe('failed');
    expect(controller.getSnapshot().errorCode).toBe('hash-mismatch');
    const failedMarkup = render(controller.getSnapshot());
    expect(failedMarkup).toContain('data-testid="narration-retry"');
    expect(failedMarkup).toContain('security check');

    controller.retry();
    expect(bridge.installCalls).toHaveLength(2);
    expect(bridge.installCalls[1].operationId).toBe('op-2');
    expect(controller.getSnapshot().operationId).toBe('op-2');

    bridge.emit(progress('op-1', { totalBytes: 100, bytesReceived: 90, percentage: 90 }));
    expect(controller.getSnapshot().bytesReceived).toBe(0);

    bridge.emit(progress('op-2', { totalBytes: 100, bytesReceived: 15, percentage: 15 }));
    expect(controller.getSnapshot().bytesReceived).toBe(15);
    expect(controller.getSnapshot().phase).toBe('downloading');
  });

  it('subscribes once and removes the native listener on dispose', async () => {
    const bridge = new FakeBridge();
    const controller = controllerFor(bridge);
    controller.start();
    controller.start();
    await flush();
    expect(bridge.listenerAdds).toBe(1);

    controller.dispose();
    await flush();
    expect(bridge.listenerRemovals).toBe(1);

    const snapshot = controller.getSnapshot();
    bridge.emit(progress('op-1', { totalBytes: 100, bytesReceived: 10 }));
    expect(controller.getSnapshot()).toBe(snapshot);
  });

  it('removes a listener that resolves after the row was disposed', async () => {
    const bridge = new FakeBridge();
    let release!: () => void;
    bridge.delayListener = new Promise<void>((resolve) => {
      release = resolve;
    });
    const controller = controllerFor(bridge);
    controller.start();
    await flush();
    controller.dispose();
    release();
    await flush();
    expect(bridge.listenerRemovals).toBe(1);
  });

  it('renders the web-only note without offering a download', () => {
    const markup = render(baseState(), false);
    expect(markup).toContain('data-testid="narration-android-only"');
    expect(markup).not.toContain('data-testid="narration-download"');
  });

  it('renders the failure state with a mapped error and retry action', () => {
    const markup = render(baseState({
      phase: 'failed',
      errorCode: 'insufficient-storage',
    }));
    expect(markup).toContain('data-testid="narration-error"');
    expect(markup).toContain('not enough free space');
    expect(markup).toContain('data-testid="narration-retry"');
    expect(inputTag(markup, 'narration-radio-french')).toContain('disabled');
  });
});
