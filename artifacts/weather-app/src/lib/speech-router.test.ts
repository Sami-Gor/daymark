import { afterEach, describe, expect, it, vi } from 'vitest';

const { getInfoMock } = vi.hoisted(() => ({ getInfoMock: vi.fn() }));

vi.mock('@capacitor/app', () => ({
  App: { getInfo: getInfoMock },
}));

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

const pocApplicationId = 'io.github.sami_gor.daymark.pocmultilingual';
const productionApplicationId = 'io.github.sami_gor.daymark';
const android = { isNativePlatform: true, platform: 'android' };
const androidPoc = { ...android, applicationId: pocApplicationId };
const androidRelease = { ...android, applicationId: productionApplicationId };

describe('createSpeechRouter', () => {
  afterEach(() => {
    getInfoMock.mockReset();
  });

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

  it('routes French narration to the local engine with its locale', async () => {
    const native = makeNative();
    const router = createSpeechRouter(androidPoc, native);
    const onError = vi.fn();
    const onEngine = vi.fn();

    await router.speak('Bonjour.', 'fr-FR', { onError, onEngine });
    expect(onError).not.toHaveBeenCalled();
    expect(onEngine).toHaveBeenCalledWith({ engine: 'kokoro', reason: 'native-french' });
    expect(native.speak).toHaveBeenCalledWith('Bonjour.', 'fr-FR', undefined);
  });

  it('routes Spanish narration to the local engine with its locale', async () => {
    const native = makeNative();
    const router = createSpeechRouter(androidPoc, native);
    const onError = vi.fn();
    await router.speak('Buenos días.', 'es-419', { onError });
    expect(onError).not.toHaveBeenCalled();
    expect(native.speak).toHaveBeenCalledWith('Buenos días.', 'es-419', undefined);
  });

  it('normalises French numbers before native phonemisation', async () => {
    const native = makeNative();
    const router = createSpeechRouter(androidPoc, native);
    await router.speak('Il fait 12 degrés avec 25 km/h.', 'fr-FR', {});
    expect(native.speak).toHaveBeenCalledWith(
      'Il fait douze degrés avec vingt-cinq kilomètres par heure.',
      'fr-FR',
      undefined,
    );
  });

  it('normalises Spanish numbers before native phonemisation', async () => {
    const native = makeNative();
    const router = createSpeechRouter(androidPoc, native);
    await router.speak('Hace 12 grados con 25 km/h.', 'es-419', {});
    expect(native.speak).toHaveBeenCalledWith(
      'Hace doce grados con veinticinco kilómetros por hora.',
      'es-419',
      undefined,
    );
  });

  it('cancels French narration during the availability check', async () => {
    const availability = deferred<{ available: boolean }>();
    const native = makeNative();
    native.isAvailable.mockReturnValue(availability.promise);
    const router = createSpeechRouter(androidPoc, native);
    void router.speak('Bonjour.', 'fr-FR', {});
    router.stop();
    availability.resolve({ available: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(native.speak).not.toHaveBeenCalled();
  });

  it('surfaces a Spanish native failure without a fallback', async () => {
    const native = makeNative();
    native.speak.mockRejectedValue(new Error('engine error'));
    const router = createSpeechRouter(androidPoc, native);
    const onError = vi.fn();
    await router.speak('Buenos días.', 'es-419', { onError });
    expect(onError).toHaveBeenCalledWith('native-failed');
  });

  it('rejects unsupported languages explicitly', async () => {
    const native = makeNative();
    const router = createSpeechRouter(android, native);
    const onError = vi.fn();
    const onEngine = vi.fn();
    await router.speak('Guten Morgen.', 'de-DE', { onError, onEngine });
    expect(onError).toHaveBeenCalledWith('unsupported-language');
    expect(onEngine).toHaveBeenCalledWith({ engine: 'unavailable', reason: 'unsupported-language' });
    expect(native.speak).not.toHaveBeenCalled();
  });

  it('keeps unsupported languages explicit inside the multilingual POC', async () => {
    const native = makeNative();
    const router = createSpeechRouter(androidPoc, native);
    const onError = vi.fn();
    await router.speak('Guten Morgen.', 'de-DE', { onError });
    expect(onError).toHaveBeenCalledWith('unsupported-language');
    expect(native.speak).not.toHaveBeenCalled();
  });

  it('keeps French and Spanish narration disabled in a production release', async () => {
    for (const [text, lang] of [['Bonjour.', 'fr-FR'], ['Buenos días.', 'es-419']] as const) {
      const native = makeNative();
      const router = createSpeechRouter(androidRelease, native);
      const onError = vi.fn();
      const onEngine = vi.fn();
      await router.speak(text, lang, { onError, onEngine });
      expect(onEngine).toHaveBeenCalledWith({ engine: 'unavailable', reason: 'french-spanish-unavailable' });
      expect(onError).toHaveBeenCalledWith('french-spanish-unavailable');
      expect(native.speak).not.toHaveBeenCalled();
    }
  });

  it('keeps English narration available in a production release', async () => {
    const native = makeNative();
    const router = createSpeechRouter(androidRelease, native);
    const onError = vi.fn();
    await router.speak('Good morning.', 'en-GB', { onError });
    expect(onError).not.toHaveBeenCalled();
    expect(native.speak).toHaveBeenCalledWith('Good morning.', 'en-GB', undefined);
  });

  it('reads the installed application ID from the native App plugin', async () => {
    getInfoMock.mockResolvedValue({
      id: pocApplicationId,
      name: 'Daymark',
      build: '2',
      version: '2.0.0',
    });
    const native = makeNative();
    const router = createSpeechRouter(android, native);
    await router.speak('Bonjour.', 'fr-FR', {});
    expect(getInfoMock).toHaveBeenCalledTimes(1);
    expect(native.speak).toHaveBeenCalledWith('Bonjour.', 'fr-FR', undefined);
  });

  it('fails closed when the installed application ID cannot be read', async () => {
    getInfoMock.mockRejectedValue(new Error('unavailable'));
    const native = makeNative();
    const router = createSpeechRouter(android, native);
    const onError = vi.fn();
    await router.speak('Bonjour.', 'fr-FR', { onError });
    expect(onError).toHaveBeenCalledWith('french-spanish-unavailable');
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

  it('preserves a stable native availability reason', async () => {
    const native = makeNative(false, 'model-init-failed');
    const router = createSpeechRouter(android, native);
    const onError = vi.fn();

    await router.speak('Good morning.', 'en-GB', { onError });
    expect(onError).toHaveBeenCalledWith('model-init-failed');
    expect(native.speak).not.toHaveBeenCalled();
  });

  it('maps native failures to actionable narration states without fallback', async () => {
    expect(classifyNativeNarrationFailure(new Error('Kokoro asset integrity mismatch for em_alex.bin')))
      .toBe('voice-asset-invalid');
    expect(classifyNativeNarrationFailure(new Error('Synthesis returned no audio')))
      .toBe('synthesis-failed');
    expect(classifyNativeNarrationFailure(new Error('AudioTrack.write failed: -4')))
      .toBe('playback-failed');
    expect(classifyNativeNarrationFailure(new Error('Unsupported narration language: de-DE')))
      .toBe('unsupported-language');
    expect(classifyNativeNarrationFailure(new Error('engine not ready')))
      .toBe('model-init-failed');
    expect(classifyNativeNarrationFailure(new Error('opaque failure'))).toBe('native-failed');
  });

  it('passes stable native failure codes through classification unchanged', () => {
    const codes = [
      'unsupported-language',
      'voice-asset-invalid',
      'playback-failed',
      'synthesis-failed',
      'model-init-failed',
      'native-unavailable',
      'native-failed',
    ];
    for (const code of codes) {
      expect(classifyNativeNarrationFailure(new Error(code))).toBe(code);
      expect(classifyNativeNarrationFailure(code)).toBe(code);
    }
  });

  it('surfaces a stable native rejection code unchanged', async () => {
    const native = makeNative();
    native.speak.mockRejectedValue(new Error('model-init-failed'));
    const router = createSpeechRouter(androidRelease, native);
    const onError = vi.fn();
    await router.speak('Good morning.', 'en-GB', { onError });
    expect(onError).toHaveBeenCalledWith('model-init-failed');
  });

  it('surfaces an error when native playback fails', async () => {
    const native = makeNative();
    native.speak.mockRejectedValue(new Error('engine error'));
    const router = createSpeechRouter(android, native);
    const onError = vi.fn();

    await router.speak('Good morning.', 'en-GB', { onError });
    expect(onError).toHaveBeenCalledWith('native-failed');
  });

  it('recovers after a native synthesis failure', async () => {
    const native = makeNative();
    native.speak.mockRejectedValueOnce(new Error('engine error'));
    const router = createSpeechRouter(android, native);
    const firstError = vi.fn();
    const secondEnd = vi.fn();
    await router.speak('First.', 'en-GB', { onError: firstError });
    await router.speak('Second.', 'en-GB', { onEnd: secondEnd });
    expect(firstError).toHaveBeenCalledWith('native-failed');
    expect(secondEnd).toHaveBeenCalledTimes(1);
    expect(native.speak).toHaveBeenCalledTimes(2);
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
