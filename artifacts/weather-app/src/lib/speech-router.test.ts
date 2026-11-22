import { describe, expect, it, vi } from 'vitest';

import { classifyNativeNarrationFailure, createSpeechRouter } from './speech-router';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
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

  it('routes English narration to native Kokoro and stop to the same engine', async () => {
    const pending = deferred<void>();
    const native = makeNative();
    native.speak.mockReturnValue(pending.promise);
    const router = createSpeechRouter(android, native);
    const handlers = { onEnd: vi.fn(), onError: vi.fn() };

    void router.speak('Good morning.', 'en-GB', handlers);
    await Promise.resolve();
    await Promise.resolve();

    expect(native.speak).toHaveBeenCalledWith('Good morning.', 'en-GB', undefined);
    router.stop();
    expect(native.stop).toHaveBeenCalledTimes(1);

    pending.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(handlers.onEnd).not.toHaveBeenCalled();
  });

  it('routes French narration to native Kokoro with the selected language, never a fallback', async () => {
    const native = makeNative();
    const router = createSpeechRouter(android, native);
    const onEngine = vi.fn();
    const onError = vi.fn();

    await router.speak('Bonjour.', 'fr-FR', { onEngine, onError });

    expect(onError).not.toHaveBeenCalled();
    expect(onEngine).toHaveBeenCalledWith({
      engine: 'kokoro',
      reason: 'native-french',
      locale: 'fr',
      voice: 'ff_siwis',
    });
    expect(native.speak).toHaveBeenCalledWith('Bonjour.', 'fr-FR', undefined);
  });

  it('routes Spanish narration to native Kokoro with the selected language, never a fallback', async () => {
    const native = makeNative();
    const router = createSpeechRouter(android, native);
    const onEngine = vi.fn();

    await router.speak('Buenos días.', 'es-419', { onEngine });

    expect(onEngine).toHaveBeenCalledWith({
      engine: 'kokoro',
      reason: 'native-spanish',
      locale: 'es',
      voice: 'em_alex',
    });
    expect(native.speak).toHaveBeenCalledWith('Buenos días.', 'es-419', undefined);
  });

  it('normalizes numeric weather values before French and Spanish synthesis', async () => {
    const native = makeNative();
    const router = createSpeechRouter(android, native);

    await router.speak('Il fait 23 degrés, 20 % de pluie.', 'fr-FR', {});
    await router.speak('Hace 23 grados, 20 % de lluvia.', 'es-419', {});

    const french = native.speak.mock.calls[0] as unknown as [string, string];
    const spanish = native.speak.mock.calls[1] as unknown as [string, string];
    expect(french[1]).toBe('fr-FR');
    expect(spanish[1]).toBe('es-419');
    expect(french[0]).not.toMatch(/\d/);
    expect(spanish[0]).not.toMatch(/\d/);
    expect(french[0]).toContain('vingt-trois');
    expect(spanish[0]).toContain('veintitrés');
  });

  it('passes a TTS-only segmentation plan that concatenates to the narration', async () => {
    const native = makeNative();
    const router = createSpeechRouter(android, native);
    const text =
      "It's 23 degrees in London, mostly clear, feels like 22 degrees. Rain isn't expected for the rest of today.";
    await router.speak(text, 'en-GB', {});
    expect(native.speak).toHaveBeenCalledTimes(1);
    const [sentText, sentLang, sentSegments] = native.speak.mock.calls[0] as unknown as [string, string, string[]];
    expect(sentText).toBe(text);
    expect(sentLang).toBe('en-GB');
    expect(sentSegments.length).toBeGreaterThan(1);
    expect(sentSegments.join('')).toBe(text);
  });

  it('reports an unsupported language explicitly without calling the native engine', async () => {
    const native = makeNative();
    const router = createSpeechRouter(android, native);
    const onError = vi.fn();

    await router.speak('Guten Tag.', 'de-DE', { onError });
    expect(onError).toHaveBeenCalledWith('unsupported-language');
    expect(native.speak).not.toHaveBeenCalled();
  });

  it('surfaces the native unavailability reason instead of a generic error', async () => {
    const native = makeNative(false, 'model-missing');
    const router = createSpeechRouter(android, native);
    const onError = vi.fn();

    await router.speak('Good morning.', 'en-GB', { onError });
    expect(onError).toHaveBeenCalledWith('model-missing');
    expect(native.speak).not.toHaveBeenCalled();
  });

  it('surfaces an error when native playback fails and never falls back', async () => {
    const native = makeNative();
    native.speak.mockRejectedValue(new Error('engine error'));
    const router = createSpeechRouter(android, native);
    const onError = vi.fn();

    await router.speak('Good morning.', 'en-GB', { onError });
    expect(onError).toHaveBeenCalledWith('native-failed');
  });

  it('classifies stable native failure codes without re-deriving them', () => {
    for (const code of [
      'unsupported-language',
      'voice-asset-invalid',
      'playback-failed',
      'synthesis-failed',
      'model-init-failed',
      'native-unavailable',
    ]) {
      expect(classifyNativeNarrationFailure(new Error(code))).toBe(code);
    }
    expect(classifyNativeNarrationFailure(new Error('Kokoro asset integrity mismatch for ff_siwis.bin'))).toBe('voice-asset-invalid');
    expect(classifyNativeNarrationFailure(new Error('Unsupported narration language: de-DE'))).toBe('unsupported-language');
    expect(classifyNativeNarrationFailure('AudioTrack.write failed')).toBe('playback-failed');
    expect(classifyNativeNarrationFailure(new Error('Synthesis returned no audio'))).toBe('synthesis-failed');
    expect(classifyNativeNarrationFailure(new Error('engine not ready'))).toBe('model-init-failed');
  });

  it('cancel during the availability check prevents any speech starting', async () => {
    const availability = deferred<{ available: boolean }>();
    const native = makeNative();
    native.isAvailable.mockReturnValue(availability.promise);
    const router = createSpeechRouter(android, native);

    void router.speak('Good morning.', 'en-GB', {});
    router.stop();
    availability.resolve({ available: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(native.speak).not.toHaveBeenCalled();
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
    await Promise.resolve();
    await Promise.resolve();
    void router.speak('Second.', 'en-GB', secondHandlers);
    await Promise.resolve();
    await Promise.resolve();

    first.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(firstHandlers.onEnd).not.toHaveBeenCalled();

    second.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(secondHandlers.onEnd).toHaveBeenCalledTimes(1);
    expect(firstHandlers.onEnd).not.toHaveBeenCalled();
  });

  it('reports an error for every unsupported platform', async () => {
    const native = makeNative();
    const onError = vi.fn();
    const web = createSpeechRouter({ isNativePlatform: false, platform: 'web' }, native);
    await web.speak('Good morning.', 'en-GB', { onError });
    expect(onError).toHaveBeenCalledWith('not-android');
    expect(native.speak).not.toHaveBeenCalled();
  });
});
