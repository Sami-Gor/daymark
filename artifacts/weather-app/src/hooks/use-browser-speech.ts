import { useCallback, useEffect, useMemo, useState } from 'react';
import { createBrowserSpeechController } from '@/lib/voice-browser';

/*
 * React binding for the browser speech adapter. The controller owns playback;
 * this hook only mirrors its state and guarantees cleanup on unmount.
 */
export function useBrowserSpeech() {
  const controller = useMemo(() => createBrowserSpeechController(), []);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => () => controller.dispose(), [controller]);

  const speak = useCallback((text: string, lang?: string) => {
    const started = controller.speak(text, {
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    }, lang);
    setIsSpeaking(started);
    return started;
  }, [controller]);

  const stop = useCallback(() => {
    controller.stop();
    setIsSpeaking(false);
  }, [controller]);

  return { supported: controller.supported, isSpeaking, speak, stop };
}
