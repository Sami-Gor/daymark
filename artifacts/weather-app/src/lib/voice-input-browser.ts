/*
 * Browser speech-recognition (speech-to-text) adapter for "Ask Daymark".
 *
 * Owns only the microphone capture lifecycle: support detection, start, stop,
 * transcript delivery and error reporting. There is no weather logic here, no
 * recording storage, no transcript logging and no third-party speech service —
 * it uses the browser's built-in SpeechRecognition / webkitSpeechRecognition.
 *
 * Privacy: capture begins only after an explicit user action (the Ask Daymark
 * control). Recognition is single-shot (no continuous/background listening),
 * and the transcript is handed to the caller without being stored. The browser
 * or platform may process speech with its own (possibly remote) implementation,
 * so Daymark makes no on-device-processing guarantee.
 *
 * Robustness: every session carries a monotonically increasing token. Stopping,
 * aborting or starting a new session invalidates the previous token, so an old
 * session can never deliver results, errors or end events to the UI.
 */

import { translate, type Locale } from './i18n';

export type RecognitionHandlers = {
  onStart?: () => void;
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
};

type RecognitionAlternative = { transcript?: string };
type RecognitionResult = { isFinal?: boolean; 0?: RecognitionAlternative };
type RecognitionResultList = ArrayLike<RecognitionResult>;
type RecognitionEvent = { resultIndex?: number; results?: RecognitionResultList | null };
type RecognitionErrorEvent = { error?: string };

type RecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type RecognitionConstructor = new () => RecognitionInstance;

type RecognitionWindow = Window & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

export type BrowserRecognitionController = {
  readonly supported: boolean;
  start: (handlers: RecognitionHandlers, lang?: string) => boolean;
  stop: () => void;
  dispose: () => void;
  isListening: () => boolean;
};

function browserWindow(): RecognitionWindow | null {
  return typeof window === 'undefined' ? null : (window as RecognitionWindow);
}

/* Feature-detect both the standard and the WebKit-prefixed interface. */
export function getSpeechRecognitionConstructor(): RecognitionConstructor | null {
  const target = browserWindow();
  if (!target) return null;
  return target.SpeechRecognition ?? target.webkitSpeechRecognition ?? null;
}

export function isBrowserSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() != null;
}

/* Friendly, non-repeating copy for recognition failures, localized. */
export function describeRecognitionError(error: string | null | undefined, locale: Locale = 'en'): string {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return translate(locale, 'ask.error.blocked');
    case 'no-speech':
      return translate(locale, 'ask.error.noSpeech');
    case 'audio-capture':
      return translate(locale, 'ask.error.audio');
    case 'network':
      return translate(locale, 'ask.error.network');
    case 'aborted':
      return translate(locale, 'ask.error.aborted');
    default:
      return translate(locale, 'ask.error.unknown');
  }
}

function extractTranscript(event: RecognitionEvent): string {
  const results = event.results;
  if (!results || !results.length) return '';
  const start = event.resultIndex ?? 0;
  for (let index = start; index < results.length; index += 1) {
    const result = results[index];
    if (result?.isFinal) return result[0]?.transcript ?? '';
  }
  return results[results.length - 1]?.[0]?.transcript ?? '';
}

export function createBrowserRecognitionController(): BrowserRecognitionController {
  const Constructor = getSpeechRecognitionConstructor();
  const supported = Constructor != null;
  let session = 0;
  let active: RecognitionInstance | null = null;

  const detach = (instance: RecognitionInstance) => {
    instance.onstart = null;
    instance.onresult = null;
    instance.onerror = null;
    instance.onend = null;
  };

  /* Stops the active session (if any) and invalidates its callbacks. Idempotent. */
  const stop = () => {
    session += 1;
    const instance = active;
    active = null;
    if (!instance) return;
    detach(instance);
    try {
      instance.stop();
    } catch {
      try {
        instance.abort?.();
      } catch {
        // Stopping is best-effort; the UI resets regardless.
      }
    }
  };

  return {
    supported,
    start(handlers, lang) {
      if (!supported || !Constructor) return false;
      if (active) stop();

      const mySession = (session += 1);
      let instance: RecognitionInstance;
      try {
        instance = new Constructor();
      } catch {
        handlers.onError?.('unavailable');
        return false;
      }

      instance.lang = lang?.trim() || browserWindow()?.navigator?.language || '';
      instance.continuous = false;
      instance.interimResults = false;
      instance.maxAlternatives = 1;

      let gotResult = false;
      instance.onstart = () => {
        if (session === mySession && active === instance) handlers.onStart?.();
      };
      instance.onresult = (event) => {
        if (session !== mySession || active !== instance) return;
        const transcript = extractTranscript(event);
        if (transcript) {
          gotResult = true;
          handlers.onResult?.(transcript);
        }
      };
      instance.onerror = (event) => {
        if (session !== mySession || active !== instance) return;
        session += 1;
        active = null;
        detach(instance);
        handlers.onError?.(event?.error ?? 'unknown');
      };
      instance.onend = () => {
        if (session !== mySession || active !== instance) return;
        session += 1;
        active = null;
        detach(instance);
        if (gotResult) {
          handlers.onEnd?.();
        } else {
          // Ended without a usable transcript and without an explicit error:
          // reuse the no-speech feedback instead of silently returning to idle.
          handlers.onError?.('no-speech');
        }
      };

      active = instance;
      try {
        instance.start();
      } catch {
        if (session === mySession) {
          session += 1;
          active = null;
        }
        detach(instance);
        handlers.onError?.('unknown');
        return false;
      }
      return true;
    },
    stop,
    dispose() {
      stop();
    },
    isListening() {
      return active != null;
    },
  };
}
