import { useCallback, useEffect, useMemo, useState } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { createBrowserRecognitionController, describeRecognitionError } from '@/lib/voice-input-browser';
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
 * Android uses the native on-device recognizer only; if the OS cannot provide
 * a compatible local recognizer, the feature is unavailable. Other platforms
 * preserve their previous browser-based behaviour.
 */
export function useSpeechRecognition() {
  const androidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  const controller = useMemo<RecognitionController>(() => {
    if (androidNative) {
      return createParakeetRecognitionController();
    }
    return createBrowserRecognitionController();
  }, [androidNative]);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(controller.supported);
  const [supportResolved, setSupportResolved] = useState(!controller.initialize);

  useEffect(() => {
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
    if (!supported) {
      setError(describeRecognitionError('offline-unavailable', options.locale ?? DEFAULT_LOCALE));
      return false;
    }
    const started = controller.start({
      onStart: () => setIsListening(true),
      onResult: (transcript) => options.onTranscript?.(transcript),
      onError: (code) => {
        setIsListening(false);
        setError(describeRecognitionError(code, options.locale ?? DEFAULT_LOCALE));
      },
      onEnd: () => setIsListening(false),
    }, options.lang);
    // Browser recognition has no native "started" event; keep its existing
    // immediate UI state. Android waits for the native capture-start event.
    if (started && !androidNative) setIsListening(true);
    return started;
  }, [controller, supported, androidNative]);

  const stop = useCallback(() => {
    controller.stop();
    setIsListening(false);
  }, [controller]);

  const clearError = useCallback(() => setError(''), []);

  return { supported, supportResolved, isListening, error, start, stop, clearError };
}
