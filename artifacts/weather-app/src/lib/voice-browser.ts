/*
 * Browser speech playback adapter.
 *
 * This module owns only speech synthesis: capability detection, creating
 * utterances, starting, stopping, and preventing overlapping playback. It has
 * no weather logic — callers pass the text to speak (for Daymark that text
 * comes from the intent layer, e.g. getIntentResponse('daymark.today')).
 *
 * It uses the built-in Web Speech API (window.speechSynthesis /
 * SpeechSynthesisUtterance): no cloud TTS, no SDK, no API keys, and no
 * microphone access (microphones use a different API and are never touched).
 */

export type SpeechHandlers = {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
};

export type BrowserSpeechController = {
  readonly supported: boolean;
  speak: (text: string, handlers?: SpeechHandlers, lang?: string) => boolean;
  stop: () => void;
  dispose: () => void;
  isSpeaking: () => boolean;
};

type SpeechWindow = Window & {
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
};

function browserWindow(): SpeechWindow | null {
  return typeof window === 'undefined' ? null : (window as SpeechWindow);
}

export function isBrowserSpeechSupported(): boolean {
  const target = browserWindow();
  return target != null
    && typeof target.speechSynthesis?.speak === 'function'
    && typeof target.SpeechSynthesisUtterance === 'function';
}

/*
 * Prefer the device/browser locale so the platform picks a matching voice.
 * A specific voice is never hard-coded; the browser default is used otherwise.
 */
function preferredLanguage(): string {
  const target = browserWindow();
  return target?.navigator?.language ?? '';
}

export function createBrowserSpeechController(): BrowserSpeechController {
  const target = browserWindow();
  const supported = isBrowserSpeechSupported();
  let current: SpeechSynthesisUtterance | null = null;

  const stop = () => {
    current = null;
    if (!supported) return;
    try {
      target?.speechSynthesis?.cancel();
    } catch {
      // Cancelling is best-effort; the UI resets regardless.
    }
  };

  return {
    supported,
    speak(text, handlers, lang) {
      const spoken = text?.trim();
      if (!supported || !target || !spoken) return false;

      // Never queue a second utterance behind an existing one.
      if (current || target.speechSynthesis?.speaking) stop();

      const Utterance = target.SpeechSynthesisUtterance;
      if (!Utterance) return false;

      const utterance = new Utterance(spoken);
      const language = lang?.trim() || preferredLanguage();
      if (language) utterance.lang = language;

      // Stale events from an interrupted utterance must not change UI state.
      utterance.onstart = () => {
        if (current === utterance) handlers?.onStart?.();
      };
      utterance.onend = () => {
        if (current !== utterance) return;
        current = null;
        handlers?.onEnd?.();
      };
      utterance.onerror = () => {
        if (current !== utterance) return;
        current = null;
        handlers?.onError?.();
      };

      current = utterance;
      try {
        target.speechSynthesis?.speak(utterance);
      } catch {
        current = null;
        handlers?.onError?.();
        return false;
      }
      return true;
    },
    stop,
    dispose() {
      stop();
      current = null;
    },
    isSpeaking() {
      return current != null;
    },
  };
}
