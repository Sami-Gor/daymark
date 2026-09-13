import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBrowserRecognitionController,
  describeRecognitionError,
  isBrowserSpeechRecognitionSupported,
} from './voice-input-browser';

type FakeRecognitionEvent = {
  resultIndex: number;
  results: Array<{ 0: { transcript: string }; isFinal: boolean }>;
};

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  continuous = true;
  interimResults = true;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onresult: ((event: FakeRecognitionEvent) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  startCount = 0;
  stopCount = 0;
  abortCount = 0;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.startCount += 1;
  }
  stop() {
    this.stopCount += 1;
  }
  abort() {
    this.abortCount += 1;
  }
  emitStart() {
    this.onstart?.();
  }
  emitResult(transcript: string, isFinal = true) {
    this.onresult?.({ resultIndex: 0, results: [{ 0: { transcript }, isFinal }] });
  }
  emitError(error: string) {
    this.onerror?.({ error });
  }
  emitEnd() {
    this.onend?.();
  }
}

beforeEach(() => {
  FakeRecognition.instances = [];
});

afterEach(() => vi.unstubAllGlobals());

function stubRecognitionWindow(options: { ctor?: unknown; language?: string } = {}) {
  const target: Record<string, unknown> = { navigator: { language: options.language ?? 'en-GB' } };
  if (options.ctor !== null) target.SpeechRecognition = options.ctor ?? FakeRecognition;
  vi.stubGlobal('window', target);
}

describe('support detection', () => {
  it('detects the standard SpeechRecognition interface', () => {
    stubRecognitionWindow();
    expect(isBrowserSpeechRecognitionSupported()).toBe(true);
  });

  it('detects the webkit-prefixed interface', () => {
    vi.stubGlobal('window', { webkitSpeechRecognition: FakeRecognition, navigator: { language: 'en-US' } });
    expect(isBrowserSpeechRecognitionSupported()).toBe(true);
  });

  it('is false in an unsupported environment', () => {
    vi.stubGlobal('window', {});
    expect(isBrowserSpeechRecognitionSupported()).toBe(false);
    const controller = createBrowserRecognitionController();
    expect(controller.supported).toBe(false);
    expect(controller.start({})).toBe(false);
    expect(controller.isListening()).toBe(false);
  });
});

describe('createBrowserRecognitionController', () => {
  it('starts a single-shot session with the device language', () => {
    stubRecognitionWindow({ language: 'en-GB' });
    const controller = createBrowserRecognitionController();
    const onStart = vi.fn();
    expect(controller.start({ onStart })).toBe(true);
    const instance = FakeRecognition.instances[0];
    expect(instance.startCount).toBe(1);
    expect(instance.lang).toBe('en-GB');
    expect(instance.continuous).toBe(false);
    expect(instance.interimResults).toBe(false);
    expect(instance.maxAlternatives).toBe(1);
    expect(controller.isListening()).toBe(true);
    instance.emitStart();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('uses the requested recognition language tag', () => {
    stubRecognitionWindow({ language: 'en-GB' });
    const controller = createBrowserRecognitionController();
    controller.start({}, 'es-ES');
    expect(FakeRecognition.instances[0].lang).toBe('es-ES');
  });

  it('returns the final transcript', () => {
    stubRecognitionWindow();
    const controller = createBrowserRecognitionController();
    const onResult = vi.fn();
    controller.start({ onResult });
    FakeRecognition.instances[0].emitResult('Will it rain later?');
    expect(onResult).toHaveBeenCalledWith('Will it rain later?');
  });

  it('falls back to the latest partial transcript', () => {
    stubRecognitionWindow();
    const controller = createBrowserRecognitionController();
    const onResult = vi.fn();
    controller.start({ onResult });
    FakeRecognition.instances[0].emitResult('what about', false);
    expect(onResult).toHaveBeenCalledWith('what about');
  });

  it('surfaces errors and stops listening', () => {
    stubRecognitionWindow();
    const controller = createBrowserRecognitionController();
    const onError = vi.fn();
    const onEnd = vi.fn();
    controller.start({ onError, onEnd });
    const instance = FakeRecognition.instances[0];
    instance.emitError('not-allowed');
    expect(onError).toHaveBeenCalledWith('not-allowed');
    expect(controller.isListening()).toBe(false);
    // The session token is invalidated: a late end event must be ignored.
    instance.emitEnd();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('reports no-speech when recognition ends without a transcript', () => {
    stubRecognitionWindow();
    const controller = createBrowserRecognitionController();
    const onError = vi.fn();
    const onEnd = vi.fn();
    controller.start({ onError, onEnd });
    FakeRecognition.instances[0].emitEnd();
    expect(onError).toHaveBeenCalledWith('no-speech');
    expect(onEnd).not.toHaveBeenCalled();
    expect(controller.isListening()).toBe(false);
  });

  it('resets internal state when recognition ends after a transcript', () => {
    stubRecognitionWindow();
    const controller = createBrowserRecognitionController();
    const onError = vi.fn();
    const onEnd = vi.fn();
    controller.start({ onError, onEnd });
    const instance = FakeRecognition.instances[0];
    instance.emitResult('Will it rain later?');
    instance.emitEnd();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(controller.isListening()).toBe(false);
  });

  it('stop ends listening immediately and detaches callbacks', () => {
    stubRecognitionWindow();
    const controller = createBrowserRecognitionController();
    const onResult = vi.fn();
    const onEnd = vi.fn();
    controller.start({ onResult, onEnd });
    const instance = FakeRecognition.instances[0];
    controller.stop();
    expect(instance.stopCount).toBe(1);
    expect(controller.isListening()).toBe(false);
    instance.emitResult('too late');
    instance.emitEnd();
    expect(onResult).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('is idempotent when stopped repeatedly', () => {
    stubRecognitionWindow();
    const controller = createBrowserRecognitionController();
    controller.start({});
    const instance = FakeRecognition.instances[0];
    controller.stop();
    controller.stop();
    controller.dispose();
    expect(instance.stopCount).toBe(1);
    expect(controller.isListening()).toBe(false);
  });

  it('prevents duplicate simultaneous sessions and ignores stale callbacks', () => {
    stubRecognitionWindow();
    const controller = createBrowserRecognitionController();
    const firstResult = vi.fn();
    const secondResult = vi.fn();
    controller.start({ onResult: firstResult });
    const first = FakeRecognition.instances[0];
    controller.start({ onResult: secondResult });
    const second = FakeRecognition.instances[1];
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(first.stopCount).toBe(1);
    first.emitResult('stale');
    expect(firstResult).not.toHaveBeenCalled();
    second.emitResult('fresh');
    expect(secondResult).toHaveBeenCalledWith('fresh');
    expect(controller.isListening()).toBe(true);
  });

  it('falls back to abort when stop throws', () => {
    stubRecognitionWindow();
    const controller = createBrowserRecognitionController();
    controller.start({});
    const instance = FakeRecognition.instances[0];
    instance.stop = () => {
      instance.stopCount += 1;
      throw new Error('stop failed');
    };
    expect(() => controller.stop()).not.toThrow();
    expect(instance.abortCount).toBe(1);
    expect(controller.isListening()).toBe(false);
  });

  it('reports a constructor/start failure and does not listen', () => {
    class BrokenRecognition extends FakeRecognition {
      start() {
        throw new Error('cannot start');
      }
    }
    stubRecognitionWindow({ ctor: BrokenRecognition });
    const controller = createBrowserRecognitionController();
    const onError = vi.fn();
    expect(controller.start({ onError })).toBe(false);
    expect(onError).toHaveBeenCalledWith('unknown');
    expect(controller.isListening()).toBe(false);
  });

  it('dispose cancels the active session and detaches callbacks (unmount cleanup)', () => {
    stubRecognitionWindow();
    const controller = createBrowserRecognitionController();
    const onResult = vi.fn();
    const onEnd = vi.fn();
    controller.start({ onResult, onEnd });
    const instance = FakeRecognition.instances[0];
    controller.dispose();
    expect(instance.stopCount).toBe(1);
    expect(controller.isListening()).toBe(false);
    instance.emitResult('after unmount');
    instance.emitEnd();
    expect(onResult).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });
});

describe('describeRecognitionError', () => {
  it('maps permission denial and other failures to friendly copy', () => {
    expect(describeRecognitionError('not-allowed')).toContain('blocked');
    expect(describeRecognitionError('service-not-allowed')).toContain('blocked');
    expect(describeRecognitionError('no-speech')).toContain("didn't catch that");
    expect(describeRecognitionError('audio-capture')).toContain('No microphone');
    expect(describeRecognitionError('network')).toContain('network');
    expect(describeRecognitionError('aborted')).toContain('stopped');
    expect(describeRecognitionError('weird')).toContain('unexpectedly');
  });
});
