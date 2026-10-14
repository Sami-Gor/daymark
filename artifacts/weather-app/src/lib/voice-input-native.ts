import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type OnDeviceRecognitionHandlers = {
  onStart?: () => void;
  onResult?: (transcript: string) => void;
  onError?: (code: string) => void;
  onEnd?: () => void;
};

type NativeResult = { sessionId: number; transcript: string };
type NativeError = { sessionId: number; code: string };
type NativeEnd = { sessionId: number };

interface OnDeviceSpeechRecognitionPlugin {
  isAvailable(): Promise<{ available: boolean; reason?: string }>;
  start(options: { sessionId: number; lang: string }): Promise<void>;
  cancel(options: { sessionId: number }): Promise<void>;
  addListener(eventName: 'result', listenerFunc: (event: NativeResult) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'error', listenerFunc: (event: NativeError) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'end', listenerFunc: (event: NativeEnd) => void): Promise<PluginListenerHandle>;
}

const NativeRecognizer = registerPlugin<OnDeviceSpeechRecognitionPlugin>('OnDeviceSpeechRecognition');
const RECOGNITION_TIMEOUT_MS = 30_000;

export type OnDeviceRecognitionController = {
  readonly supported: boolean;
  initialize: () => Promise<boolean>;
  start: (handlers: OnDeviceRecognitionHandlers, lang?: string) => boolean;
  stop: () => void;
  dispose: () => void;
  isListening: () => boolean;
};

export function createOnDeviceRecognitionController(): OnDeviceRecognitionController {
  let supported = false;
  let initialized = false;
  let disposed = false;
  let sessionSequence = 0;
  let activeSessionId: number | null = null;
  let activeHandlers: OnDeviceRecognitionHandlers | null = null;
  let recognitionTimeout: ReturnType<typeof setTimeout> | null = null;
  const listeners: PluginListenerHandle[] = [];

  const clearRecognitionTimeout = () => {
    if (recognitionTimeout !== null) {
      clearTimeout(recognitionTimeout);
      recognitionTimeout = null;
    }
  };

  const detachSession = (sessionId: number) => {
    if (activeSessionId !== sessionId) return null;
    const handlers = activeHandlers;
    activeSessionId = null;
    activeHandlers = null;
    clearRecognitionTimeout();
    return handlers;
  };

  const handlesEvent = (sessionId: number) => !disposed && activeSessionId === sessionId;

  const initialize = async () => {
    if (initialized) return supported;
    initialized = true;
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return false;
    }

    try {
      const registered = await Promise.all([
        NativeRecognizer.addListener('result', (event) => {
          if (!handlesEvent(event.sessionId)) return;
          const handlers = activeHandlers;
          if (event.transcript) handlers?.onResult?.(event.transcript);
          const finished = detachSession(event.sessionId);
          finished?.onEnd?.();
        }),
        NativeRecognizer.addListener('error', (event) => {
          if (!handlesEvent(event.sessionId)) return;
          const handlers = detachSession(event.sessionId);
          handlers?.onError?.(event.code || 'unknown');
        }),
        NativeRecognizer.addListener('end', (event) => {
          if (!handlesEvent(event.sessionId)) return;
          const handlers = detachSession(event.sessionId);
          handlers?.onEnd?.();
        }),
      ]);
      listeners.push(...registered);

      const result = await NativeRecognizer.isAvailable();
      supported = result.available === true;
    } catch {
      supported = false;
    }
    return supported;
  };

  return {
    get supported() {
      return supported;
    },
    initialize,
    start(handlers, lang) {
      if (!initialized || !supported || disposed) {
        handlers.onError?.('offline-unavailable');
        return false;
      }

      if (activeSessionId !== null) {
        const previous = activeSessionId;
        activeSessionId = null;
        activeHandlers = null;
        clearRecognitionTimeout();
        void NativeRecognizer.cancel({ sessionId: previous }).catch(() => undefined);
      }

      const sessionId = ++sessionSequence;
      activeSessionId = sessionId;
      activeHandlers = handlers;
      recognitionTimeout = setTimeout(() => {
        if (!handlesEvent(sessionId)) return;
        void NativeRecognizer.cancel({ sessionId }).catch(() => undefined);
        const timedOut = detachSession(sessionId);
        timedOut?.onError?.('timeout');
      }, RECOGNITION_TIMEOUT_MS);
      void NativeRecognizer.start({ sessionId, lang: lang?.trim() || 'en-GB' }).then(() => {
        if (handlesEvent(sessionId)) handlers.onStart?.();
      }).catch((error: unknown) => {
        if (!handlesEvent(sessionId)) return;
        const finished = detachSession(sessionId);
        const message = error instanceof Error ? error.message : String(error ?? '');
        const code = /permission/i.test(message) ? 'not-allowed'
          : /offline-unavailable|api-unsupported/i.test(message) ? 'offline-unavailable'
          : /cancel/i.test(message) ? 'aborted'
          : 'unknown';
        finished?.onError?.(code);
      });
      return true;
    },
    stop() {
      if (activeSessionId === null) return;
      const sessionId = activeSessionId;
      activeSessionId = null;
      activeHandlers = null;
      clearRecognitionTimeout();
      void NativeRecognizer.cancel({ sessionId }).catch(() => undefined);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (activeSessionId !== null) {
        const sessionId = activeSessionId;
        activeSessionId = null;
        activeHandlers = null;
        clearRecognitionTimeout();
        void NativeRecognizer.cancel({ sessionId }).catch(() => undefined);
      }
      for (const listener of listeners.splice(0)) {
        void listener.remove();
      }
    },
    isListening() {
      return activeSessionId !== null;
    },
  };
}
