import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Capacitor } from '@capacitor/core';

import { DaymarkVoice } from '@/lib/daymark-voice';
import type { BrowserSpeechAdapter } from '@/lib/speech-router';
import { pickFallbackAdapter } from '@/lib/speech-adapters';
import type { SpeechEngine } from '@/lib/speech-engine';
import { createSpeechRouter } from '@/lib/speech-router';
import { SystemSpeech } from '@/lib/system-speech';
import { createBrowserSpeechController } from '@/lib/voice-browser';

/*
 * Unified Daymark speech hook.
 *
 * Keeps the previous UI contract (supported / isSpeaking / speak / stop) while
 * routing English speech on Android Capacitor builds through the native
 * DaymarkVoice (Kokoro) engine and everything else through the Web Speech API.
 */
export function useDaymarkSpeech() {
  const controller = useMemo(() => createBrowserSpeechController(), []);
  const systemSpeech = useMemo<BrowserSpeechAdapter>(
    () => ({
      supported: Capacitor.isNativePlatform(),
      speak: (text, handlers, lang) => {
        SystemSpeech.speak({ text, lang })
          .then(() => handlers?.onEnd?.())
          .catch(() => handlers?.onError?.());
        return true;
      },
      stop: () => {
        void SystemSpeech.stop();
      },
    }),
    [],
  );
  const fallback = useMemo(
    () =>
      pickFallbackAdapter({
        isNativePlatform: Capacitor.isNativePlatform(),
        webSpeech: controller,
        systemSpeech,
      }),
    [controller, systemSpeech],
  );
  const router = useMemo(
    () =>
      createSpeechRouter(
        {
          isNativePlatform: Capacitor.isNativePlatform(),
          platform: Capacitor.getPlatform(),
        },
        fallback,
        {
          isAvailable: async () => (await DaymarkVoice.isAvailable()).available,
          speak: async (text, lang, segments) => {
            await DaymarkVoice.speak({ text, lang, segments });
          },
          stop: async () => {
            await DaymarkVoice.stop();
          },
        },
      ),
    [fallback],
  );

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [engine, setEngine] = useState<SpeechEngine | null>(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    console.info(
      `DaymarkSpeech platform=${Capacitor.getPlatform()} native=${Capacitor.isNativePlatform()} browserSpeech=${controller.supported}`,
    );
  }, [controller]);

  useEffect(() => () => router.stop(), [router]);

  const speak = useCallback(
    (text: string, lang?: string) => {
      const spoken = text?.trim();
      if (!spoken) return false;
      const token = ++tokenRef.current;
      setIsSpeaking(true);
      void router.speak(spoken, lang, {
        onEngine: (selection) => setEngine(selection.engine),
        onEnd: () => {
          if (tokenRef.current === token) setIsSpeaking(false);
        },
        onError: () => {
          if (tokenRef.current === token) setIsSpeaking(false);
        },
      });
      return true;
    },
    [router],
  );

  const stop = useCallback(() => {
    tokenRef.current++;
    router.stop();
    setIsSpeaking(false);
  }, [router]);

  return { supported: router.supported(), isSpeaking, speak, stop, engine };
}
