import { App as CapacitorApp } from '@capacitor/app';

import { selectSpeechEngine, speechLocale, type SpeechEngine, type SpeechSelection } from './speech-engine';
import { normalizeNarrationText } from './speech-number-normalizer';
import { segmentForSpeech } from './tts-segmentation';

/*
 * Routes narration to the bundled Android Kokoro engine only.
 *
 * English keeps the existing Misaki path. French and Spanish are normalized
 * (including numeric weather values) and routed to the same local engine with
 * their own voices. There is no browser-speech or Android system-TTS fallback.
 * The router is injectable so engine selection and cancellation can be tested
 * without React or Capacitor.
 */

export type SpeechHandlers = {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (reason?: string) => void;
  onEngine?: (selection: SpeechSelection) => void;
};

export type NativeSpeechAvailability = {
  available: boolean;
  reason?: string;
};

export type NativeSpeechAdapter = {
  isAvailable: () => Promise<NativeSpeechAvailability>;
  speak: (text: string, lang?: string, segments?: string[]) => Promise<void>;
  stop: () => Promise<void>;
};

/**
 * Failure codes the native plugin already emits. They must pass through
 * classification unchanged so a stable code is never re-derived by message
 * heuristics (for example `model-init-failed` contains no "initializ").
 */
const NATIVE_NARRATION_FAILURE_CODES = new Set([
  'unsupported-language',
  'french-spanish-unavailable',
  'voice-asset-invalid',
  'playback-failed',
  'synthesis-failed',
  'model-init-failed',
  'native-unavailable',
  'native-failed',
]);

/** Maps a native rejection to a stable, user-facing narration failure code. */
export function classifyNativeNarrationFailure(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error ?? '')).trim();
  if (NATIVE_NARRATION_FAILURE_CODES.has(message)) {
    return message;
  }
  const normalized = message.toLowerCase();
  if (/unsupported narration language|unsupported-language|unsupported language/.test(normalized)) {
    return 'unsupported-language';
  }
  if (/integrity|asset.*(invalid|mismatch)|voice.*(invalid|missing|mismatch)/.test(normalized)) {
    return 'voice-asset-invalid';
  }
  if (/playback|audiotrack|audio track/.test(normalized)) {
    return 'playback-failed';
  }
  if (/synthesis|no audio|returned no audio/.test(normalized)) {
    return 'synthesis-failed';
  }
  if (/initializ|model.*(load|missing)|engine.*(not ready|unavailable)|not ready/.test(normalized)) {
    return 'model-init-failed';
  }
  return 'native-failed';
}

export type SpeechEnvironment = {
  isNativePlatform: boolean;
  platform: string;
  /**
   * Effective Android application ID. Tests and embedders may provide it;
   * otherwise the router reads it from the native App plugin. Without a known
   * ID the multilingual POC gate fails closed.
   */
  applicationId?: string;
};

async function resolveApplicationId(
  env: SpeechEnvironment,
  lang: string | undefined,
): Promise<string | undefined> {
  if (env.applicationId) return env.applicationId;
  const locale = speechLocale(lang);
  if (!env.isNativePlatform || env.platform !== 'android' || !locale || locale === 'en') {
    return undefined;
  }
  try {
    const info = await CapacitorApp.getInfo();
    return info.id;
  } catch {
    // Unknown application identity: the engine gate keeps French/Spanish off.
    return undefined;
  }
}

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
    let nativeReason: string | undefined;
    if (env.isNativePlatform && env.platform === 'android') {
      try {
        const availability = await native.isAvailable();
        nativeAvailable = availability?.available === true;
        nativeReason = availability?.reason;
      } catch {
        nativeAvailable = false;
        nativeReason = 'native-unavailable';
      }
    }
    const locale = speechLocale(lang);
    const applicationId = locale && locale !== 'en'
      ? await resolveApplicationId(env, lang)
      : env.applicationId;
    return selectSpeechEngine({
      isNativePlatform: env.isNativePlatform,
      platform: env.platform,
      lang,
      nativeAvailable,
      nativeReason,
      applicationId,
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
      const narration = normalizeNarrationText(spoken, lang);
      let segments: string[] | undefined;
      try {
        const plan = segmentForSpeech(narration);
        segments = plan.length > 1 ? plan : undefined;
      } catch (error) {
        console.warn('DaymarkSpeech segmentation failed; using whole-text synthesis', error);
      }
      try {
        await native.speak(narration, lang, segments);
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
        handlers.onError?.(classifyNativeNarrationFailure(error));
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
