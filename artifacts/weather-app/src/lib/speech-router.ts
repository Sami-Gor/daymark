import { isEnglish, selectSpeechEngine, type SpeechEngine, type SpeechSelection } from './speech-engine';
import { segmentForSpeech } from './tts-segmentation';

/*
 * Routes speech to the native DaymarkVoice engine or the browser Web Speech
 * API. Pure and injectable so engine selection, fallback and stop routing can
 * be unit tested without React or Capacitor.
 */

export type SpeechHandlers = {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (reason?: string) => void;
  onEngine?: (selection: SpeechSelection) => void;
};

export type BrowserSpeechAdapter = {
  readonly supported: boolean;
  speak: (
    text: string,
    handlers?: { onStart?: () => void; onEnd?: () => void; onError?: () => void },
    lang?: string,
  ) => boolean;
  stop: () => void;
};

export type NativeSpeechAdapter = {
  isAvailable: () => Promise<boolean>;
  speak: (text: string, lang?: string, segments?: string[]) => Promise<void>;
  stop: () => Promise<void>;
};

export type SpeechEnvironment = {
  isNativePlatform: boolean;
  platform: string;
};

export type SpeechRouter = {
  supported: () => boolean;
  select: (lang?: string) => Promise<SpeechSelection>;
  speak: (text: string, lang: string | undefined, handlers: SpeechHandlers) => Promise<boolean>;
  stop: () => void;
  activeEngine: () => SpeechEngine | null;
};

export function createSpeechRouter(
  env: SpeechEnvironment,
  browser: BrowserSpeechAdapter,
  native: NativeSpeechAdapter,
): SpeechRouter {
  let active: SpeechEngine | null = null;
  let generation = 0;

  async function select(lang?: string): Promise<SpeechSelection> {
    let nativeAvailable = false;
    if (env.isNativePlatform && env.platform === 'android') {
      try {
        nativeAvailable = await native.isAvailable();
      } catch {
        nativeAvailable = false;
      }
    }
    return selectSpeechEngine({
      isNativePlatform: env.isNativePlatform,
      platform: env.platform,
      lang,
      nativeAvailable,
    });
  }

  function speakWithBrowser(
    text: string,
    lang: string | undefined,
    handlers: SpeechHandlers,
    token: number,
  ): boolean {
    const started = browser.speak(
      text,
      {
        onStart: () => {
          if (generation === token) {
            active = 'browser';
            handlers.onStart?.();
          }
        },
        onEnd: () => {
          if (generation === token) {
            active = null;
            handlers.onEnd?.();
          }
        },
        onError: () => {
          if (generation === token) {
            active = null;
            handlers.onError?.('browser');
          }
        },
      },
      lang,
    );
    if (!started) {
      active = null;
      handlers.onError?.('browser-unavailable');
      return false;
    }
    active = 'browser';
    return true;
  }

  return {
    supported() {
      return env.isNativePlatform || browser.supported;
    },
    select,
    async speak(text, lang, handlers) {
      const spoken = text?.trim();
      if (!spoken) {
        return false;
      }
      const beforeSelect = generation;
      const selection = await select(lang);
      // Stop (or a newer utterance) during the availability check wins.
      if (generation !== beforeSelect) {
        return false;
      }
      handlers.onEngine?.(selection);
      const token = ++generation;

      if (selection.engine === 'kokoro') {
        active = 'kokoro';
        handlers.onStart?.();
        let segments: string[] | undefined;
        try {
          const plan = segmentForSpeech(spoken);
          segments = plan.length > 1 ? plan : undefined;
        } catch (error) {
          console.warn('DaymarkSpeech segmentation failed; using whole-text synthesis', error);
        }
        try {
          await native.speak(spoken, lang, segments);
          if (generation === token) {
            active = null;
            handlers.onEnd?.();
          }
          return true;
        } catch (error) {
          if (generation !== token) {
            return false;
          }
          active = null;
          // English narration is local-only by design: never switch it to the
          // device/system TTS engine (which may be cloud-backed). Surface the
          // failure instead so the UI can tell the user.
          if (isEnglish(lang)) {
            console.warn('DaymarkSpeech native speak failed', error);
            handlers.onError?.('native-failed');
            return false;
          }
          console.warn('DaymarkSpeech native speak failed; using browser fallback', error);
          return speakWithBrowser(spoken, lang, handlers, token);
        }
      }

      // Android English selected but the native engine is unavailable: the
      // whole point of the local engine, so no system-TTS fallback here.
      if (selection.reason === 'native-unavailable') {
        handlers.onError?.(selection.reason);
        return false;
      }

      return speakWithBrowser(spoken, lang, handlers, token);
    },
    stop() {
      generation++;
      if (active === 'kokoro') {
        void native.stop();
      } else if (active === 'browser') {
        browser.stop();
      }
      active = null;
    },
    activeEngine() {
      return active;
    },
  };
}
