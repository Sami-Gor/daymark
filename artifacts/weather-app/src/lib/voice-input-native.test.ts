import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { events, native, registered, registrationOrder } = vi.hoisted(() => {
  const events: Record<string, Array<(payload: any) => void>> = {
    result: [],
    error: [],
    end: [],
    started: [],
    captureEnd: [],
  };
  const registered: string[] = [];
  const registrationOrder: string[] = [];
  const native = {
    isAvailable: vi.fn(),
    start: vi.fn(),
    cancel: vi.fn(),
    addListener: vi.fn((eventName: string, listener: (payload: any) => void) => {
      events[eventName]?.push(listener);
      return Promise.resolve({ remove: vi.fn() });
    }),
  };
  return { events, native, registered, registrationOrder };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
  registerPlugin: (name: string) => {
    registered.push(name);
    registrationOrder.push(name);
    return native;
  },
}));

import { createParakeetRecognitionController } from './voice-input-native';

function resetEvents() {
  for (const key of Object.keys(events)) events[key] = [];
}

beforeEach(() => {
  resetEvents();
  registered.length = 0;
  native.isAvailable.mockReset();
  native.start.mockReset().mockResolvedValue(undefined);
  native.cancel.mockReset().mockResolvedValue(undefined);
  native.addListener.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('createParakeetRecognitionController', () => {
  it('registers the Parakeet plugin, not an Android speech recogniser', () => {
    // registerPlugin is called when the module is loaded, so the captured
    // registration is checked before the per-test reset clears the spy.
    expect(registrationOrder).toEqual(['ParakeetSpeechRecognition']);
    expect(registrationOrder).not.toContain('OnDeviceSpeechRecognition');
  });

  it('refuses to start when the model is unavailable', async () => {
    native.isAvailable.mockResolvedValue({ available: false, reason: 'model-missing' });
    const controller = createParakeetRecognitionController();

    expect(await controller.initialize()).toBe(false);
    expect(controller.start({ onError: vi.fn() }, 'en-GB')).toBe(false);
    expect(native.start).not.toHaveBeenCalled();
  });

  it('does not wait for a reason that waiting cannot fix', async () => {
    native.isAvailable.mockResolvedValue({ available: false, reason: 'model-missing' });
    const controller = createParakeetRecognitionController();

    expect(await controller.initialize()).toBe(false);
    // One probe: a missing model is permanent, so it is not polled.
    expect(native.isAvailable).toHaveBeenCalledTimes(1);
  });

  it('waits while the model is still being prepared', async () => {
    vi.useFakeTimers();
    native.isAvailable
      .mockResolvedValueOnce({ available: false, reason: 'model-preparing' })
      .mockResolvedValue({ available: true, reason: '' });
    const controller = createParakeetRecognitionController();

    const pending = controller.initialize();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await pending).toBe(true);
    expect(native.isAvailable).toHaveBeenCalledTimes(2);
  });

  it('delivers a single result from the native plugin', async () => {
    native.isAvailable.mockResolvedValue({ available: true, reason: '' });
    const controller = createParakeetRecognitionController();
    await controller.initialize();

    const onResult = vi.fn();
    const onEnd = vi.fn();
    const onError = vi.fn();
    expect(controller.start({ onResult, onEnd, onError }, 'fr-FR')).toBe(true);
    await Promise.resolve();

    expect(native.start).toHaveBeenCalledWith({ sessionId: 1, lang: 'fr-FR' });
    events.result[0]?.({ sessionId: 1, transcript: 'Quel temps fera-t-il ?' });

    expect(onResult).toHaveBeenCalledWith('Quel temps fera-t-il ?');
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(controller.isListening()).toBe(false);
  });

  it('ignores stale results after cancellation and asks the native plugin to cancel', async () => {
    native.isAvailable.mockResolvedValue({ available: true, reason: '' });
    const controller = createParakeetRecognitionController();
    await controller.initialize();

    const onResult = vi.fn();
    expect(controller.start({ onResult }, 'en-GB')).toBe(true);
    await Promise.resolve();
    controller.stop();

    events.result[0]?.({ sessionId: 1, transcript: 'should not appear' });
    expect(native.cancel).toHaveBeenCalledWith({ sessionId: 1 });
    expect(onResult).not.toHaveBeenCalled();
    expect(controller.isListening()).toBe(false);
  });

  it('does not start the watchdog while the permission prompt/start is pending', async () => {
    vi.useFakeTimers();
    native.isAvailable.mockResolvedValue({ available: true, reason: '' });
    const controller = createParakeetRecognitionController();
    await controller.initialize();

    let resolveStart!: () => void;
    native.start.mockReturnValue(new Promise<void>((resolve) => { resolveStart = resolve; }));
    const onStart = vi.fn();
    const onError = vi.fn();
    expect(controller.start({ onStart, onError }, 'en-GB')).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(onError).not.toHaveBeenCalled();

    resolveStart();
    await Promise.resolve();
    await Promise.resolve();
    expect(onStart).not.toHaveBeenCalled();
    events.started[0]?.({ sessionId: 1 });
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('cancels and clears a recognition session when the capture watchdog expires', async () => {
    vi.useFakeTimers();
    native.isAvailable.mockResolvedValue({ available: true, reason: '' });
    const controller = createParakeetRecognitionController();
    await controller.initialize();

    const onError = vi.fn();
    expect(controller.start({ onError }, 'en-GB')).toBe(true);
    await Promise.resolve();
    events.started[0]?.({ sessionId: 1 });
    expect(controller.isListening()).toBe(true);

    await vi.advanceTimersByTimeAsync(32_000);

    expect(native.cancel).toHaveBeenCalledWith({ sessionId: 1 });
    expect(onError).toHaveBeenCalledWith('timeout');
    expect(controller.isListening()).toBe(false);
  });

  it('allows a long capture and decode inside the phase watchdogs', async () => {
    vi.useFakeTimers();
    native.isAvailable.mockResolvedValue({ available: true, reason: '' });
    const controller = createParakeetRecognitionController();
    await controller.initialize();

    const onResult = vi.fn();
    const onError = vi.fn();
    expect(controller.start({ onResult, onError }, 'en-GB')).toBe(true);
    await Promise.resolve();
    events.started[0]?.({ sessionId: 1 });
    await vi.advanceTimersByTimeAsync(30_000);
    events.captureEnd[0]?.({ sessionId: 1 });
    await vi.advanceTimersByTimeAsync(7_000);
    events.result[0]?.({ sessionId: 1, transcript: 'a long utterance' });

    expect(onResult).toHaveBeenCalledWith('a long utterance');
    expect(onError).not.toHaveBeenCalled();
    expect(controller.isListening()).toBe(false);
  });

  it('ignores a native start that resolves after the user stopped the session', async () => {
    native.isAvailable.mockResolvedValue({ available: true, reason: '' });
    const controller = createParakeetRecognitionController();
    await controller.initialize();

    let resolveStart!: () => void;
    native.start.mockReturnValue(new Promise<void>((resolve) => { resolveStart = resolve; }));
    const onStart = vi.fn();
    expect(controller.start({ onStart }, 'en-GB')).toBe(true);
    controller.stop();
    resolveStart();
    await Promise.resolve();
    await Promise.resolve();

    expect(native.cancel).toHaveBeenCalledWith({ sessionId: 1 });
    expect(onStart).not.toHaveBeenCalled();
    expect(controller.isListening()).toBe(false);
  });

  it('lets a newer request supersede a pending native start', async () => {
    native.isAvailable.mockResolvedValue({ available: true, reason: '' });
    const controller = createParakeetRecognitionController();
    await controller.initialize();

    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    native.start
      .mockReturnValueOnce(new Promise<void>((resolve) => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise<void>((resolve) => { resolveSecond = resolve; }));
    const firstStart = vi.fn();
    const secondStart = vi.fn();
    controller.start({ onStart: firstStart }, 'en-GB');
    controller.start({ onStart: secondStart }, 'en-GB');
    expect(native.cancel).toHaveBeenCalledWith({ sessionId: 1 });

    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();
    expect(firstStart).not.toHaveBeenCalled();

    resolveSecond();
    await Promise.resolve();
    await Promise.resolve();
    events.started[0]?.({ sessionId: 2 });
    expect(secondStart).toHaveBeenCalledTimes(1);
  });

  it('maps native permission codes without falling back to web copy', async () => {
    native.isAvailable.mockResolvedValue({ available: true, reason: '' });
    const controller = createParakeetRecognitionController();
    await controller.initialize();

    native.start.mockRejectedValueOnce(new Error('permission-blocked'));
    const blocked = vi.fn();
    expect(controller.start({ onError: blocked }, 'en-GB')).toBe(true);
    await Promise.resolve();
    expect(blocked).toHaveBeenCalledWith('permission-blocked');

    native.start.mockRejectedValueOnce(new Error('permission-denied'));
    const denied = vi.fn();
    expect(controller.start({ onError: denied }, 'en-GB')).toBe(true);
    await Promise.resolve();
    expect(denied).toHaveBeenCalledWith('permission-denied');
  });

  it('maps native service errors to a terminal error without any retry', async () => {
    native.isAvailable.mockResolvedValue({ available: true, reason: '' });
    const controller = createParakeetRecognitionController();
    await controller.initialize();

    const onError = vi.fn();
    expect(controller.start({ onError }, 'es-ES')).toBe(true);
    await Promise.resolve();
    events.error[0]?.({ sessionId: 1, code: 'offline-unavailable' });

    expect(onError).toHaveBeenCalledWith('offline-unavailable');
    expect(native.start).toHaveBeenCalledTimes(1);
    expect(controller.isListening()).toBe(false);
  });

  it('maps a missing model to the offline-unavailable error code', async () => {
    native.isAvailable.mockResolvedValue({ available: true, reason: '' });
    const controller = createParakeetRecognitionController();
    await controller.initialize();

    const onError = vi.fn();
    expect(controller.start({ onError }, 'en-GB')).toBe(true);
    await Promise.resolve();
    events.error[0]?.({ sessionId: 1, code: 'model-missing' });

    expect(onError).toHaveBeenCalledWith('model-missing');
  });
});
