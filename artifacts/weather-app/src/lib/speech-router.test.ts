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

function makeBrowser(supported = true) {
  return {
    supported,
    speak: vi.fn().mockReturnValue(supported),
    stop: vi.fn(),
  };
}

function makeNative(available = true) {
  return {
    isAvailable: vi.fn().mockResolvedValue(available),
    speak: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createSpeechRouter', () => {
  it('routes stop to the active native engine', async () => {
    const pending = deferred<void>();
    const native = makeNative();
    native.speak.mockReturnValue(pending.promise);
    const browser = makeBrowser();
    const router = createSpeechRouter({ isNativePlatform: true, platform: 'android' }, browser, native);
    const handlers = { onEnd: vi.fn(), onError: vi.fn() };

    void router.speak('Good morning.', 'en-GB', handlers);
    await flush();

    expect(native.speak).toHaveBeenCalledWith('Good morning.', 'en-GB', undefined);
    expect(browser.speak).not.toHaveBeenCalled();

    router.stop();
    expect(native.stop).toHaveBeenCalledTimes(1);
    expect(browser.stop).not.toHaveBeenCalled();

    pending.resolve();
    await flush();
    expect(handlers.onEnd).not.toHaveBeenCalled();
  });

  it('routes stop to the browser engine on the web', async () => {
    const browser = makeBrowser();
    const native = makeNative();
    const router = createSpeechRouter({ isNativePlatform: false, platform: 'web' }, browser, native);

    await router.speak('Good morning.', 'en-GB', {});
    expect(browser.speak).toHaveBeenCalledTimes(1);

    router.stop();
    expect(browser.stop).toHaveBeenCalledTimes(1);
    expect(native.stop).not.toHaveBeenCalled();
  });

  it('passes a TTS-only segmentation plan to the native engine for long briefings', async () => {
    const native = makeNative();
    const router = createSpeechRouter({ isNativePlatform: true, platform: 'android' }, makeBrowser(), native);
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

  it('surfaces an error for English instead of falling back to system TTS when native playback fails', async () => {
    const native = makeNative();
    native.speak.mockRejectedValue(new Error('engine error'));
    const browser = makeBrowser();
    const router = createSpeechRouter({ isNativePlatform: true, platform: 'android' }, browser, native);
    const onError = vi.fn();

    await router.speak('Good morning.', 'en-GB', { onError });
    expect(onError).toHaveBeenCalledWith('native-failed');
    expect(browser.speak).not.toHaveBeenCalled();
  });

  it('surfaces an error for English without touching system TTS when the native engine is unavailable', async () => {
    const native = makeNative(false);
    const browser = makeBrowser();
    const router = createSpeechRouter({ isNativePlatform: true, platform: 'android' }, browser, native);
    const onError = vi.fn();

    await router.speak('Good morning.', 'en-GB', { onError });
    expect(onError).toHaveBeenCalledWith('native-unavailable');
    expect(browser.speak).not.toHaveBeenCalled();
    expect(native.speak).not.toHaveBeenCalled();
  });

  it('keeps French and Spanish on the system/browser engine', async () => {
    const native = makeNative();
    const browser = makeBrowser();
    const router = createSpeechRouter({ isNativePlatform: true, platform: 'android' }, browser, native);

    await router.speak('Bonjour.', 'fr-FR', {});
    await router.speak('Buenos días.', 'es-ES', {});
    expect(browser.speak).toHaveBeenCalledTimes(2);
    expect(native.speak).not.toHaveBeenCalled();
  });

  it('cancel during the availability check prevents any speech starting', async () => {
    const availability = deferred<boolean>();
    const native = makeNative();
    native.isAvailable.mockReturnValue(availability.promise);
    const browser = makeBrowser();
    const router = createSpeechRouter({ isNativePlatform: true, platform: 'android' }, browser, native);

    void router.speak('Good morning.', 'en-GB', {});
    router.stop();
    availability.resolve(true);
    await flush();
    expect(native.speak).not.toHaveBeenCalled();
    expect(browser.speak).not.toHaveBeenCalled();
  });

  it('does not emit completion for superseded speech', async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const native = makeNative();
    native.speak.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const router = createSpeechRouter({ isNativePlatform: true, platform: 'android' }, makeBrowser(), native);
    const firstHandlers = { onEnd: vi.fn(), onError: vi.fn() };
    const secondHandlers = { onEnd: vi.fn(), onError: vi.fn() };

    void router.speak('First.', 'en-GB', firstHandlers);
    await flush();
    void router.speak('Second.', 'en-GB', secondHandlers);
    await flush();

    first.resolve();
    await flush();
    expect(firstHandlers.onEnd).not.toHaveBeenCalled();

    second.resolve();
    await flush();
    expect(secondHandlers.onEnd).toHaveBeenCalledTimes(1);
    expect(firstHandlers.onEnd).not.toHaveBeenCalled();
  });

  it('reports the selected engine to the caller', async () => {
    const native = makeNative();
    const router = createSpeechRouter({ isNativePlatform: true, platform: 'android' }, makeBrowser(), native);
    const onEngine = vi.fn();

    await router.speak('Bonjour.', 'fr-FR', { onEngine });
    expect(onEngine).toHaveBeenCalledWith({ engine: 'browser', reason: 'non-english' });

    await router.speak('Good morning.', 'en-GB', { onEngine });
    expect(onEngine).toHaveBeenLastCalledWith({ engine: 'kokoro', reason: 'native-english' });
  });

  it('reports an error when no speech engine can start', async () => {
    const router = createSpeechRouter({ isNativePlatform: false, platform: 'web' }, makeBrowser(false), makeNative(false));
    const onError = vi.fn();

    await router.speak('Good morning.', 'en-GB', { onError });
    expect(onError).toHaveBeenCalledWith('browser-unavailable');
  });
});
