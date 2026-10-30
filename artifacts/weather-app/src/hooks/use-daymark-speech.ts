import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';

import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

import { DaymarkVoice } from '@/lib/daymark-voice';
import type { SpeechEngine } from '@/lib/speech-engine';
import { createSpeechRouter } from '@/lib/speech-router';
import { initialSpeechUiState, reduceSpeechUi } from '@/lib/speech-ui-state';

/*
 * Android narration hook.
 *
 * The web/PWA demo has no voice features. On Android, English narration uses
 * the bundled Kokoro engine. French and Spanish narration is unavailable in
 * V2 (planned V2.2) and intentionally has no Android system-TTS or browser
 * fallback.
 */
export function useDaymarkSpeech() {
  const androidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  const router = useMemo(
    () => androidNative
      ? createSpeechRouter(
          { isNativePlatform: true, platform: 'android' },
          {
            isAvailable: async () => (await DaymarkVoice.isAvailable()).available,
            speak: async (text, lang, segments) => {
              await DaymarkVoice.speak({ text, lang, segments });
            },
            stop: async () => {
              await DaymarkVoice.stop();
            },
          },
        )
      : null,
    [androidNative],
  );

  const [ui, dispatch] = useReducer(reduceSpeechUi, initialSpeechUiState);
  const [engine, setEngine] = useState<SpeechEngine | null>(null);
  const [errorCode, setErrorCode] = useState('');

  // The native engine reports when synthesis actually starts, which moves the
  // UI out of the "Preparing voice…" state.
  useEffect(() => {
    if (!androidNative) return;
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
  }, [androidNative]);

  useEffect(() => () => router?.stop(), [router]);

  const speak = useCallback(
    (text: string, lang?: string) => {
      const spoken = text?.trim();
      if (!router || !spoken) return false;
      setErrorCode('');
      void router.speak(spoken, lang, {
        onEngine: (selection) => {
          setEngine(selection.engine);
          if (selection.engine === 'kokoro') {
            dispatch({ type: 'speakStarted', engine: 'kokoro' });
          }
        },
        onEnd: () => dispatch({ type: 'finished' }),
        onError: (reason) => {
          setErrorCode(reason ?? '');
          dispatch({ type: 'failed' });
        },
      });
      return true;
    },
    [router],
  );

  const stop = useCallback(() => {
    router?.stop();
    setErrorCode('');
    dispatch({ type: 'stopped' });
  }, [router]);

  return {
    supported: router?.supported() ?? false,
    status: ui.status,
    error: ui.error,
    errorCode,
    isSpeaking: ui.status === 'speaking',
    isPreparing: ui.status === 'preparing',
    isActive: ui.status !== 'idle',
    speak,
    stop,
    engine,
  };
}
