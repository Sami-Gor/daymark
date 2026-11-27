import { describe, expect, it, vi } from 'vitest';

import { classifyNativeNarrationFailure, createSpeechRouter } from './speech-router';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function makeNative(available = true, reason?: string) {
  return {
    isAvailable: vi.fn().mockResolvedValue({ available, reason }),
    speak: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

const android = { isNativePlatform: true, platform: 'android' };

describe('createSpeechRouter', () => {
  it('is supported only on Android', () => {
    expect(createSpeechRouter(android, makeNative()).supported()).toBe(true);
    expect(createSpeechRouter({ isNativePlatform: false, platform: 'web' }, makeNative()).supported()).toBe(false);
    expect(createSpeechRouter({ isNativePlatform: true, platform: 'ios' }, makeNative()).supported()).toBe(false);
  });

  it('routes English to native Kokoro and stop to the same engine', async () => {
    const pending = deferred<void>();
    const native = makeNative();
    native.speak.mockReturnValue(pending.promise);
    const router = createSpeechRouter(android, native);
    const handlers = { onEnd: vi.fn(), onError: vi.fn() };
    void router.speak('Good morning.', 'en-GB', handlers);
    await Promise.resolve(); await Promise.resolve();
    expect(native.speak).toHaveBeenCalledWith('Good morning.', 'en-GB', undefined);
    router.stop();
    expect(native.stop).toHaveBeenCalledTimes(1);
    pending.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(handlers.onEnd).not.toHaveBeenCalled();
  });

  it('routes French and Spanish to local Kokoro with their locales', async () => {
    const native = makeNative();
    const router = createSpeechRouter(android, native);
    await router.speak('Bonjour.', 'fr-FR', {});
    await router.speak('Buenos días.', 'es-ES', {});
    expect(native.speak).toHaveBeenNthCalledWith(1, 'Bonjour.', 'fr-FR', undefined);
    expect(native.speak).toHaveBeenNthCalledWith(2, 'Buenos días.', 'es-ES', undefined);
  });

  it('normalises numbers before native phonemisation', async () => {
    const native = makeNative();
    const router = createSpeechRouter(android, native);
    await router.speak('Il fait 12 degrés avec 25 km/h.', 'fr-FR', {});
    await router.speak('Hace 12 grados con 25 km/h.', 'es-ES', {});
    expect(native.speak.mock.calls[0][0]).toContain('douze');
    expect(native.speak.mock.calls[0][0]).toContain('vingt-cinq');
    expect(native.speak.mock.calls[1][0]).toContain('doce');
    expect(native.speak.mock.calls[1][0]).toContain('veinticinco');
  });

  it('passes a TTS segmentation plan for a long briefing', async () => {
    const native = makeNative();
    const router = createSpeechRouter(android, native);
    const text = "It's 23 degrees in London, mostly clear, feels like 22 degrees. Rain isn't expected for the rest of today.";
    await router.speak(text, 'en-GB', {});
    const [, , segments] = native.speak.mock.calls[0] as unknown as [string, string, string[] | undefined];
    expect(segments?.length).toBeGreaterThan(1);
    expect(segments?.join('')).toBe(text);
  });

  it('cancels during availability check', async () => {
    const availability = deferred<{ available: boolean }>();
    const native = makeNative();
    native.isAvailable.mockReturnValue(availability.promise);
    const router = createSpeechRouter(android, native);
    void router.speak('Bonjour.', 'fr-FR', {});
    router.stop();
    availability.resolve({ available: true });
    await Promise.resolve(); await Promise.resolve();
    expect(native.speak).not.toHaveBeenCalled();
  });

  it('surfaces native failures and preserves stable codes', async () => {
    const native = makeNative();
    native.speak.mockRejectedValue(new Error('Kokoro asset integrity mismatch for em_alex.bin'));
    const router = createSpeechRouter(android, native);
    const onError = vi.fn();
    await router.speak('Buenos días.', 'es-ES', { onError });
    expect(onError).toHaveBeenCalledWith('voice-asset-invalid');
    expect(classifyNativeNarrationFailure(new Error('AudioTrack.write failed: -4'))).toBe('playback-failed');
  });

  it('rejects unsupported languages and unavailable native without fallback', async () => {
    const router = createSpeechRouter(android, makeNative());
    const onError = vi.fn();
    await router.speak('Guten Morgen.', 'de-DE', { onError });
    expect(onError).toHaveBeenCalledWith('unsupported-language');
    const unavailable = createSpeechRouter(android, makeNative(false, 'model-init-failed'));
    const onError2 = vi.fn();
    await unavailable.speak('Good morning.', 'en-GB', { onError: onError2 });
    expect(onError2).toHaveBeenCalledWith('model-init-failed');
  });

  it('does not emit completion for superseded speech', async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const native = makeNative();
    native.speak.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const router = createSpeechRouter(android, native);
    const firstHandlers = { onEnd: vi.fn(), onError: vi.fn() };
    const secondHandlers = { onEnd: vi.fn(), onError: vi.fn() };
    void router.speak('First.', 'en-GB', firstHandlers);
    await Promise.resolve(); await Promise.resolve();
    void router.speak('Second.', 'en-GB', secondHandlers);
    await Promise.resolve(); await Promise.resolve();
    first.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(firstHandlers.onEnd).not.toHaveBeenCalled();
    second.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(secondHandlers.onEnd).toHaveBeenCalledTimes(1);
  });
});