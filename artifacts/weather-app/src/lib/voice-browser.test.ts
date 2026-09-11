import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserSpeechController, isBrowserSpeechSupported } from './voice-browser';

class FakeUtterance {
  text: string;
  lang = '';
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function stubSpeechWindow(language = 'en-GB') {
  const utterances: FakeUtterance[] = [];
  const speechSynthesis = {
    speaking: false,
    speak: vi.fn((utterance: FakeUtterance) => {
      utterances.push(utterance);
    }),
    cancel: vi.fn(),
  };
  vi.stubGlobal('window', {
    speechSynthesis,
    SpeechSynthesisUtterance: FakeUtterance,
    navigator: { language },
  });
  return { speechSynthesis, utterances };
}

afterEach(() => vi.unstubAllGlobals());

describe('isBrowserSpeechSupported', () => {
  it('is false without a window (Node / SSR)', () => {
    expect(isBrowserSpeechSupported()).toBe(false);
  });

  it('is false when the browser lacks the speech API', () => {
    vi.stubGlobal('window', {});
    expect(isBrowserSpeechSupported()).toBe(false);
  });

  it('is true when speechSynthesis and the utterance constructor exist', () => {
    stubSpeechWindow();
    expect(isBrowserSpeechSupported()).toBe(true);
  });
});

describe('createBrowserSpeechController', () => {
  it('speaks the text with the device language and reports success', () => {
    const { speechSynthesis, utterances } = stubSpeechWindow('en-GB');
    const controller = createBrowserSpeechController();
    expect(controller.speak('Hello Daymark')).toBe(true);
    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1);
    expect(utterances[0].text).toBe('Hello Daymark');
    expect(utterances[0].lang).toBe('en-GB');
    expect(controller.isSpeaking()).toBe(true);
  });

  it('uses the requested language tag when provided', () => {
    const { utterances } = stubSpeechWindow('en-GB');
    const controller = createBrowserSpeechController();
    controller.speak('Bonjour', undefined, 'fr-FR');
    expect(utterances[0].lang).toBe('fr-FR');
  });

  it('does not speak in an unsupported environment or with empty text', () => {
    vi.stubGlobal('window', {});
    const unsupported = createBrowserSpeechController();
    expect(unsupported.speak('Hello')).toBe(false);
    vi.unstubAllGlobals();

    const { speechSynthesis } = stubSpeechWindow();
    const controller = createBrowserSpeechController();
    expect(controller.speak('   ')).toBe(false);
    expect(speechSynthesis.speak).not.toHaveBeenCalled();
    expect(controller.isSpeaking()).toBe(false);
  });

  it('stop cancels immediately and clears speaking state', () => {
    const { speechSynthesis } = stubSpeechWindow();
    const controller = createBrowserSpeechController();
    controller.speak('Hello');
    controller.stop();
    expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1);
    expect(controller.isSpeaking()).toBe(false);
  });

  it('never overlaps utterances', () => {
    const { speechSynthesis, utterances } = stubSpeechWindow();
    const onFirstEnd = vi.fn();
    const controller = createBrowserSpeechController();
    controller.speak('first', { onEnd: onFirstEnd });
    controller.speak('second');
    expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1);
    expect(utterances.map((utterance) => utterance.text)).toEqual(['first', 'second']);
    // The interrupted utterance's callbacks are stale and must be ignored.
    utterances[0].onend?.();
    expect(onFirstEnd).not.toHaveBeenCalled();
    expect(controller.isSpeaking()).toBe(true);
  });

  it('resets state when speech ends naturally', () => {
    const { utterances } = stubSpeechWindow();
    const onEnd = vi.fn();
    const controller = createBrowserSpeechController();
    controller.speak('hello', { onEnd });
    utterances[0].onstart?.();
    utterances[0].onend?.();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(controller.isSpeaking()).toBe(false);
  });

  it('resets state when speech errors', () => {
    const { utterances } = stubSpeechWindow();
    const onError = vi.fn();
    const controller = createBrowserSpeechController();
    controller.speak('hello', { onError });
    utterances[0].onerror?.();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(controller.isSpeaking()).toBe(false);
  });

  it('dispose cancels and detaches callbacks (unmount cleanup)', () => {
    const { speechSynthesis, utterances } = stubSpeechWindow();
    const onEnd = vi.fn();
    const controller = createBrowserSpeechController();
    controller.speak('hello', { onEnd });
    controller.dispose();
    expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1);
    expect(controller.isSpeaking()).toBe(false);
    utterances[0].onend?.();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('surfaces a speak failure through onError', () => {
    const { speechSynthesis } = stubSpeechWindow();
    speechSynthesis.speak.mockImplementation(() => {
      throw new Error('no audio device');
    });
    const onError = vi.fn();
    const controller = createBrowserSpeechController();
    expect(controller.speak('hello', { onError })).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(controller.isSpeaking()).toBe(false);
  });
});
