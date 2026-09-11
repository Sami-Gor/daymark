import { useCallback, useEffect, useMemo, useState } from 'react';
import { createBrowserRecognitionController, describeRecognitionError } from '@/lib/voice-input-browser';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n';

/*
 * React binding for the browser speech-recognition adapter. The controller owns
 * the session lifecycle and invalidates stale callbacks; this hook mirrors its
 * state and guarantees cleanup (stop + detach) on unmount.
 */
export function useSpeechRecognition() {
  const controller = useMemo(() => createBrowserRecognitionController(), []);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => controller.dispose(), [controller]);

  const start = useCallback((options: { onTranscript?: (transcript: string) => void; lang?: string; locale?: Locale } = {}) => {
    setError('');
    const started = controller.start({
      onStart: () => setIsListening(true),
      onResult: (transcript) => options.onTranscript?.(transcript),
      onError: (code) => {
        setIsListening(false);
        setError(describeRecognitionError(code, options.locale ?? DEFAULT_LOCALE));
      },
      onEnd: () => setIsListening(false),
    }, options.lang);
    if (started) setIsListening(true);
    return started;
  }, [controller]);

  const stop = useCallback(() => {
    controller.stop();
    setIsListening(false);
  }, [controller]);

  const clearError = useCallback(() => setError(''), []);

  return { supported: controller.supported, isListening, error, start, stop, clearError };
}
