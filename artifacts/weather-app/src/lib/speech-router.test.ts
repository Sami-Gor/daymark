import { describe, expect, it, vi } from 'vitest';

import { createSpeechRouter } from './speech-router';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeNative(available = true) {
  return {
    isAvailable: vi.fn().mockResolvedValue(available),
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

  it('passes a TTS-only segmentation plan to the native engine for long briefings', async () => {
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

  it('reports French narration as unavailable without inventing a fallback', async () => {
    const native = makeNative();
    const router = createSpeechRouter(android, native);
    const onError = vi.fn();
    const onEngine = vi.fn();

    await router.speak('Bonjour.', 'fr-FR', { onError, onEngine });
    expect(onError).toHaveBeenCalledWith('non-english-unavailable');
    expect(onEngine).toHaveBeenCalledWith({ engine: 'unavailable', reason: 'non-english-unavailable' });
    expect(native.speak).not.toHaveBeenCalled();
  });

  it('reports Spanish narration as unavailable without a system-TTS fallback', async () => {
    const native = makeNative();
    const router = createSpeechRouter(android, native);
    const onError = vi.fn();
    await router.speak('Buenos días.', 'es-ES', { onError });
    expect(onError).toHaveBeenCalledWith('non-english-unavailable');
    expect(native.speak).not.toHaveBeenCalled();
  });

  it('surfaces an error when English Kokoro is unavailable', async () => {
    const native = makeNative(false);
    const router = createSpeechRouter(android, native);
    const onError = vi.fn();

    await router.speak('Good morning.', 'en-GB', { onError });
    expect(onError).toHaveBeenCalledWith('native-unavailable');
    expect(native.speak).not.toHaveBeenCalled();
  });

  it('surfaces an error when native playback fails', async () => {
    const native = makeNative();
    native.speak.mockRejectedValue(new Error('engine error'));
    const router = createSpeechRouter(android, native);
    const onError = vi.fn();

    await router.speak('Good morning.', 'en-GB', { onError });
    expect(onError).toHaveBeenCalledWith('native-failed');
  });

  it('cancel during the availability check prevents any speech starting', async () => {
    const availability = deferred<boolean>();
    const native = makeNative();
    native.isAvailable.mockReturnValue(availability.promise);
    const router = createSpeechRouter(android, native);

    void router.speak('Good morning.', 'en-GB', {});
    router.stop();
    availability.resolve(true);
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
