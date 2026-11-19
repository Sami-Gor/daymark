import { selectSpeechEngine, type SpeechEngine, type SpeechSelection } from './speech-engine';
import { segmentForSpeech } from './tts-segmentation';

/*
 * Routes narration to the bundled Android Kokoro engine only.
 *
 * The web/PWA demo has no narration path. Android French/Spanish narration is
 * deliberately unavailable in V2; there is no browser-speech or Android
 * system-TTS fallback. The router is injectable so engine selection and
 * cancellation can be tested without React or Capacitor.
 */

export type SpeechHandlers = {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (reason?: string) => void;
  onEngine?: (selection: SpeechSelection) => void;
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

  return {
    supported() {
      return env.isNativePlatform && env.platform === 'android';
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
      if (selection.engine !== 'kokoro') {
        active = null;
        handlers.onError?.(selection.reason);
        return false;
      }
      const token = ++generation;
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
        // Never fall back to system or network speech. Surface the failure.
        console.warn('DaymarkSpeech native speak failed', error);
        handlers.onError?.('native-failed');
        return false;
      }
    },
    stop() {
      generation++;
      if (active === 'kokoro') {
        void native.stop();
      }
      active = null;
    },
    activeEngine() {
      return active;
    },
  };
}
