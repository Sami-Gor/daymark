import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { events, native } = vi.hoisted(() => {
  const events: Record<string, Array<(payload: any) => void>> = {
    result: [],
    error: [],
    end: [],
  };
  const native = {
    isAvailable: vi.fn(),
    start: vi.fn(),
    cancel: vi.fn(),
    addListener: vi.fn((eventName: string, listener: (payload: any) => void) => {
      events[eventName]?.push(listener);
      return Promise.resolve({ remove: vi.fn() });
    }),
  };
  return { events, native };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
  registerPlugin: () => native,
}));

import { createOnDeviceRecognitionController } from './voice-input-native';

function resetEvents() {
  for (const key of Object.keys(events)) events[key] = [];
}

beforeEach(() => {
  resetEvents();
  native.isAvailable.mockReset();
  native.start.mockReset().mockResolvedValue(undefined);
  native.cancel.mockReset().mockResolvedValue(undefined);
  native.addListener.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('createOnDeviceRecognitionController', () => {
  it('refuses to start when local recognition is unavailable', async () => {
    native.isAvailable.mockResolvedValue({ available: false, reason: 'offline-unavailable' });
    const controller = createOnDeviceRecognitionController();

    expect(await controller.initialize()).toBe(false);
    expect(controller.start({ onError: vi.fn() }, 'en-GB')).toBe(false);
    expect(native.start).not.toHaveBeenCalled();
  });

  it('delivers a single result from the native local-recognition plugin', async () => {
    native.isAvailable.mockResolvedValue({ available: true });
    const controller = createOnDeviceRecognitionController();
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
    native.isAvailable.mockResolvedValue({ available: true });
    const controller = createOnDeviceRecognitionController();
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

  it('cancels and clears a recognition session when its timeout expires', async () => {
    vi.useFakeTimers();
    native.isAvailable.mockResolvedValue({ available: true });
    const controller = createOnDeviceRecognitionController();
    await controller.initialize();

    const onError = vi.fn();
    expect(controller.start({ onError }, 'en-GB')).toBe(true);
    await Promise.resolve();
    expect(controller.isListening()).toBe(true);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(native.cancel).toHaveBeenCalledWith({ sessionId: 1 });
    expect(onError).toHaveBeenCalledWith('timeout');
    expect(controller.isListening()).toBe(false);
  });

  it('maps native service errors to a terminal error without any retry', async () => {
    native.isAvailable.mockResolvedValue({ available: true });
    const controller = createOnDeviceRecognitionController();
    await controller.initialize();

    const onError = vi.fn();
    expect(controller.start({ onError }, 'es-ES')).toBe(true);
    await Promise.resolve();
    events.error[0]?.({ sessionId: 1, code: 'offline-unavailable' });

    expect(onError).toHaveBeenCalledWith('offline-unavailable');
    expect(native.start).toHaveBeenCalledTimes(1);
    expect(controller.isListening()).toBe(false);
  });
});
