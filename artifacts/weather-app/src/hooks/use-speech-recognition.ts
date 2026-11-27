import { useCallback, useEffect, useMemo, useState } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { describeRecognitionError } from '@/lib/speech-errors';
import { recognitionOutcomeFor, type RecognitionOutcomeKind } from '@/lib/recognition-errors';
import { createParakeetRecognitionController } from '@/lib/voice-input-native';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n';

type RecognitionHandlers = {
  onStart?: () => void;
  onResult?: (transcript: string) => void;
  onError?: (code: string) => void;
  onEnd?: () => void;
};

type RecognitionController = {
  readonly supported: boolean;
  initialize?: () => Promise<boolean>;
  start: (handlers: RecognitionHandlers, lang?: string) => boolean;
  stop: () => void;
  dispose: () => void;
  isListening: () => boolean;
};

/*
 * Android uses the bundled on-device recognizer only; if it cannot start, the
 * feature is unavailable. The web/PWA demo has no recognition path and this
 * hook never constructs a browser SpeechRecognition controller.
 */
export function useSpeechRecognition() {
  const androidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  const controller = useMemo<RecognitionController | null>(() => {
    return androidNative ? createParakeetRecognitionController() : null;
  }, [androidNative]);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState('');
  // the code (not only the localized copy) is kept so the app can tell a
  // failure from silence and can render a code-specific state.
  const [errorCode, setErrorCode] = useState('');
  const [supported, setSupported] = useState(controller?.supported ?? false);
  const [supportResolved, setSupportResolved] = useState(!controller?.initialize);

  useEffect(() => {
    if (!controller) {
      setSupported(false);
      setSupportResolved(true);
      return;
    }
    let active = true;
    let appStateHandle: PluginListenerHandle | undefined;

    const initialize = controller.initialize;
    if (initialize) {
      void initialize().then((available) => {
        if (active) {
          setSupported(available);
          setSupportResolved(true);
        }
      }).catch(() => {
        if (active) {
          setSupported(false);
          setSupportResolved(true);
        }
      });
    } else {
      setSupported(controller.supported);
      setSupportResolved(true);
    }

    const cancelIfBackgrounded = () => {
      controller.stop();
      setIsListening(false);
    };
    const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    const onVisibilityChange = () => {
      if (isAndroidNative && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        cancelIfBackgrounded();
      }
    };
    if (isAndroidNative && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    if (isAndroidNative) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) cancelIfBackgrounded();
      }).then((handle) => {
        if (active) appStateHandle = handle;
        else void handle.remove();
      }).catch(() => undefined);
    }

    return () => {
      active = false;
      if (isAndroidNative && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      if (appStateHandle) void appStateHandle.remove();
      controller.dispose();
    };
  }, [controller]);

  const start = useCallback((options: { onTranscript?: (transcript: string) => void; lang?: string; locale?: Locale } = {}) => {
    setError('');
    setErrorCode('');
    if (!controller || !supported) {
      setErrorCode('offline-unavailable');
      setError(describeRecognitionError('offline-unavailable', options.locale ?? DEFAULT_LOCALE));
      return false;
    }
    const started = controller.start({
      onStart: () => setIsListening(true),
      onResult: (transcript) => options.onTranscript?.(transcript),
      onError: (code) => {
        setIsListening(false);
        setErrorCode(code);
        setError(describeRecognitionError(code, options.locale ?? DEFAULT_LOCALE));
      },
      onEnd: () => setIsListening(false),
    }, options.lang);
    return started;
  }, [controller, supported]);

  const stop = useCallback(() => {
    controller?.stop();
    setIsListening(false);
  }, [controller]);

  const clearError = useCallback(() => {
    setError('');
    setErrorCode('');
  }, []);

  return {
    supported,
    supportResolved,
    isListening,
    error,
    errorCode,
    // 'silence' for no-speech vs 'failure' for refused/empty/failed decodes:
    // the app can branch on this without parsing localized copy.
    errorKind: recognitionOutcomeFor(errorCode) as RecognitionOutcomeKind,
    start,
    stop,
    clearError,
  };
}
