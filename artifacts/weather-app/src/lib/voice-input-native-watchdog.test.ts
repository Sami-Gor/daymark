import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { events, native, registrationOrder } = vi.hoisted(() => {
  const events: Record<string, Array<(payload: any) => void>> = {
    result: [],
    error: [],
    end: [],
    started: [],
    captureEnd: [],
  };
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
  return { events, native, registrationOrder };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
  registerPlugin: (name: string) => {
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
  registrationOrder.length = 0;
  native.isAvailable.mockReset();
  native.start.mockReset().mockResolvedValue(undefined);
  native.cancel.mockReset().mockResolvedValue(undefined);
  native.addListener.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

/** A controller whose model is ready and whose listeners are registered. */
async function readyController() {
  native.isAvailable.mockResolvedValue({ available: true, reason: '' });
  const controller = createParakeetRecognitionController();
  await controller.initialize();
  return controller;
}

/** A listening session: started, capture watchdog armed, decode watchdog not yet. */
async function listeningSession() {
  const controller = await readyController();
  const onError = vi.fn();
  expect(controller.start({ onError }, 'en-GB')).toBe(true);
  await Promise.resolve();
  events.started[0]?.({ sessionId: 1 });
  return { controller, onError };
}

describe('createParakeetRecognitionController watchdogs', () => {
  it('replaces the capture watchdog with the scaled decode watchdog instead of stacking them', async () => {
    vi.useFakeTimers();
    const { controller, onError } = await listeningSession();

    // One second before the 32 s capture watchdog would fire, the capture
    // ends and reports a full 30 s utterance.
    await vi.advanceTimersByTimeAsync(31_000);
    events.captureEnd[0]?.({ sessionId: 1, capturedMs: 30_000 });

    // Crossing the stale 32 s capture deadline must do nothing: the capture
    // timer was cleared before the decode timer was armed.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(onError).not.toHaveBeenCalled();
    expect(native.cancel).not.toHaveBeenCalled();

    // The single remaining watchdog is the scaled decode budget: still
    // nothing one millisecond short of 15 s + 30 s after captureEnd.
    await vi.advanceTimersByTimeAsync(42_999);
    expect(onError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onError).toHaveBeenCalledWith('timeout');
    expect(native.cancel).toHaveBeenCalledWith({ sessionId: 1 });
    expect(controller.isListening()).toBe(false);
  });

  it('an explicitly zero capturedMs keeps the 15 s decode floor', async () => {
    vi.useFakeTimers();
    const { onError } = await listeningSession();

    events.captureEnd[0]?.({ sessionId: 1, capturedMs: 0 });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(onError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onError).toHaveBeenCalledWith('timeout');
  });

  it('a one-millisecond capture extends the decode budget by exactly one millisecond', async () => {
    vi.useFakeTimers();
    const { onError } = await listeningSession();

    events.captureEnd[0]?.({ sessionId: 1, capturedMs: 1 });

    // 15 s + 1 ms: the plain 15 s floor must not fire here.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(onError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onError).toHaveBeenCalledWith('timeout');
  });

  it('clamps a negative capturedMs to the 15 s floor', async () => {
    vi.useFakeTimers();
    const { onError } = await listeningSession();

    events.captureEnd[0]?.({ sessionId: 1, capturedMs: -30_000 });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(onError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onError).toHaveBeenCalledWith('timeout');
  });

  it('treats an unparseable capturedMs as absent and keeps the 15 s floor', async () => {
    vi.useFakeTimers();
    const { onError } = await listeningSession();

    events.captureEnd[0]?.({ sessionId: 1, capturedMs: 'not-a-number' });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(onError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onError).toHaveBeenCalledWith('timeout');
  });

  it('ignores a result that arrives after the decode watchdog fired', async () => {
    vi.useFakeTimers();
    const controller = await readyController();
    const onResult = vi.fn();
    const onError = vi.fn();
    const onEnd = vi.fn();
    expect(controller.start({ onResult, onError, onEnd }, 'en-GB')).toBe(true);
    await Promise.resolve();
    events.started[0]?.({ sessionId: 1 });
    events.captureEnd[0]?.({ sessionId: 1, capturedMs: 2_000 });

    await vi.advanceTimersByTimeAsync(17_000);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(controller.isListening()).toBe(false);

    events.result[0]?.({ sessionId: 1, transcript: 'a stale transcript' });
    expect(onResult).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('ignores a captureEnd that arrives after the capture watchdog fired and arms nothing', async () => {
    vi.useFakeTimers();
    const { onError } = await listeningSession();

    await vi.advanceTimersByTimeAsync(32_000);
    expect(onError).toHaveBeenCalledTimes(1);

    events.captureEnd[0]?.({ sessionId: 1, capturedMs: 30_000 });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(native.cancel).toHaveBeenCalledTimes(1);
  });

  it('stopping the session disarms every watchdog', async () => {
    vi.useFakeTimers();
    const { controller, onError } = await listeningSession();

    controller.stop();
    expect(native.cancel).toHaveBeenCalledWith({ sessionId: 1 });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(onError).not.toHaveBeenCalled();

    events.captureEnd[0]?.({ sessionId: 1, capturedMs: 30_000 });
    await vi.advanceTimersByTimeAsync(45_000);
    expect(onError).not.toHaveBeenCalled();
    expect(controller.isListening()).toBe(false);
  });

  it('disposing the controller disarms every watchdog', async () => {
    vi.useFakeTimers();
    const { controller, onError } = await listeningSession();

    controller.dispose();
    expect(native.cancel).toHaveBeenCalledWith({ sessionId: 1 });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(onError).not.toHaveBeenCalled();

    events.captureEnd[0]?.({ sessionId: 1, capturedMs: 30_000 });
    await vi.advanceTimersByTimeAsync(45_000);
    expect(onError).not.toHaveBeenCalled();
  });

  it('a superseding start disarms the previous session’s watchdogs', async () => {
    vi.useFakeTimers();
    const controller = await readyController();
    const firstOnStart = vi.fn();
    const firstOnError = vi.fn();
    expect(controller.start({ onStart: firstOnStart, onError: firstOnError }, 'en-GB')).toBe(true);
    await Promise.resolve();
    events.started[0]?.({ sessionId: 1 });
    expect(firstOnStart).toHaveBeenCalledTimes(1);

    const secondOnError = vi.fn();
    expect(controller.start({ onError: secondOnError }, 'en-GB')).toBe(true);
    await Promise.resolve();
    expect(native.cancel).toHaveBeenCalledWith({ sessionId: 1 });

    // Past the first session's 32 s capture deadline: its watchdog was
    // cleared by the supersede, and the new session has no timer yet.
    await vi.advanceTimersByTimeAsync(33_000);
    expect(firstOnError).not.toHaveBeenCalled();
    expect(secondOnError).not.toHaveBeenCalled();

    // The new session arms its own capture watchdog on its own started.
    events.started[0]?.({ sessionId: 2 });
    await vi.advanceTimersByTimeAsync(31_999);
    expect(secondOnError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(secondOnError).toHaveBeenCalledWith('timeout');
    expect(native.cancel).toHaveBeenCalledWith({ sessionId: 2 });
    expect(firstOnError).not.toHaveBeenCalled();
    expect(controller.isListening()).toBe(false);
  });

  it('ignores an error that arrives after a completed result', async () => {
    vi.useFakeTimers();
    const controller = await readyController();
    const onResult = vi.fn();
    const onEnd = vi.fn();
    const onError = vi.fn();
    expect(controller.start({ onResult, onEnd, onError }, 'en-GB')).toBe(true);
    await Promise.resolve();
    events.started[0]?.({ sessionId: 1 });

    events.result[0]?.({ sessionId: 1, transcript: 'the weather is clear' });
    expect(onResult).toHaveBeenCalledWith('the weather is clear');
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(controller.isListening()).toBe(false);

    // A stray error for the finished session must not run any handler, and
    // the capture timer the result cleared must stay cleared.
    events.error[0]?.({ sessionId: 1, code: 'aborted' });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(onError).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('cancels the native session before reporting the timeout', async () => {
    vi.useFakeTimers();
    const { onError } = await listeningSession();

    events.captureEnd[0]?.({ sessionId: 1, capturedMs: 2_000 });
    await vi.advanceTimersByTimeAsync(17_000);

    expect(native.cancel).toHaveBeenCalledWith({ sessionId: 1 });
    const cancelOrder = native.cancel.mock.invocationCallOrder[0];
    const errorOrder = onError.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(errorOrder);
  });
});
