import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';

import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

import { DaymarkVoice } from '@/lib/daymark-voice';
import type { BrowserSpeechAdapter } from '@/lib/speech-router';
import { pickFallbackAdapter } from '@/lib/speech-adapters';
import type { SpeechEngine } from '@/lib/speech-engine';
import { createSpeechRouter } from '@/lib/speech-router';
import { initialSpeechUiState, reduceSpeechUi } from '@/lib/speech-ui-state';
import { SystemSpeech } from '@/lib/system-speech';
import { createBrowserSpeechController } from '@/lib/voice-browser';

/*
 * Unified Daymark speech hook.
 *
 * Keeps the existing UI contract (supported / speak / stop) and adds an
 * explicit status machine: idle → preparing (local engine loading) → speaking
 * → idle, plus a localized error flag when narration cannot start.
 *
 * Routing rules (see speech-router): English on Android only ever uses the
 * local Kokoro engine; French/Spanish use the system TTS; the web keeps the
 * Web Speech API.
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

  const [ui, dispatch] = useReducer(reduceSpeechUi, initialSpeechUiState);
  const [engine, setEngine] = useState<SpeechEngine | null>(null);

  // The native engine reports when synthesis actually starts, which moves the
  // UI out of the "Preparing voice…" state.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    let handle: PluginListenerHandle | undefined;
    void DaymarkVoice.addListener('stateChanged', (event) => {
      if (event.state === 'speaking') dispatch({ type: 'audioStarted' });
    }).then((created) => {
      if (active) {
        handle = created;
      } else {
        void created.remove();
      }
    });
    return () => {
      active = false;
      void handle?.remove();
    };
  }, []);

  useEffect(() => () => router.stop(), [router]);

  const speak = useCallback(
    (text: string, lang?: string) => {
      const spoken = text?.trim();
      if (!spoken) return false;
      void router.speak(spoken, lang, {
        onEngine: (selection) => {
          setEngine(selection.engine);
          dispatch({ type: 'speakStarted', engine: selection.engine });
        },
        onEnd: () => dispatch({ type: 'finished' }),
        onError: () => dispatch({ type: 'failed' }),
      });
      return true;
    },
    [router],
  );

  const stop = useCallback(() => {
    router.stop();
    dispatch({ type: 'stopped' });
  }, [router]);

  return {
    supported: router.supported(),
    status: ui.status,
    error: ui.error,
    isSpeaking: ui.status === 'speaking',
    isPreparing: ui.status === 'preparing',
    isActive: ui.status !== 'idle',
    speak,
    stop,
    engine,
  };
}
