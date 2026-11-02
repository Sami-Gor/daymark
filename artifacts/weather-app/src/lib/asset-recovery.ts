import { Capacitor, registerPlugin } from '@capacitor/core';

type RecoveryPlugin = {
  reportAssetFailure(options: { kind: string }): Promise<void>;
};

const NativeRecovery = registerPlugin<RecoveryPlugin>('DaymarkRecovery');

/** The Android host is the only platform with a native recovery screen. */
function hasNativeRecovery(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/** Ask the native host to show the local-asset recovery screen, if present. */
export function reportAssetFailure(kind: string): void {
  if (!hasNativeRecovery()) return;
  void NativeRecovery.reportAssetFailure({ kind }).catch(() => {
    // The native WebViewClient is the fallback when the bridge cannot report.
  });
}

const CHUNK_ERROR_PATTERN =
  /(dynamically imported module|importing a module script failed|failed to load module script|chunkloaderror|loading chunk|unable to preload css|preloaderror)/i;

/** True only for a same-origin application asset, never an API or remote URL. */
export function isLocalAssetUrl(value: string | null | undefined, origin: string): boolean {
  if (!value) return false;
  try {
    const asset = new URL(value, origin);
    const app = new URL(origin);
    return asset.origin === app.origin;
  } catch {
    return false;
  }
}

/** True for JavaScript/CSS chunk-load failures, not ordinary API failures. */
export function isAssetLoadError(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value ?? '');
  return CHUNK_ERROR_PATTERN.test(message);
}

type RecoveryReporterOptions = {
  origin: string;
  report: (kind: string) => void;
};

export type AssetRecoveryReporter = {
  handlePreloadFailure: () => void;
  handleResourceFailure: (target: EventTarget | null) => void;
  handleRejection: (reason: unknown) => void;
};

/**
 * Deterministic reporting policy shared by the browser listeners and tests.
 * It deliberately ignores external resources and ordinary API/network errors.
 */
export function createAssetRecoveryReporter({
  origin,
  report,
}: RecoveryReporterOptions): AssetRecoveryReporter {
  let reported = false;
  const reportOnce = (kind: string) => {
    if (reported) return;
    reported = true;
    report(kind);
  };

  return {
    handlePreloadFailure() {
      reportOnce('vite-preload');
    },
    handleResourceFailure(target) {
      if (!target || typeof target !== 'object') return;
      const element = target as { tagName?: string; src?: string; href?: string };
      const tag = element.tagName?.toUpperCase();
      if (tag !== 'SCRIPT' && tag !== 'LINK') return;
      const url = tag === 'SCRIPT' ? element.src : element.href;
      if (isLocalAssetUrl(url, origin)) reportOnce(`local-${tag.toLowerCase()}`);
    },
    handleRejection(reason) {
      if (isAssetLoadError(reason)) reportOnce('dynamic-import');
    },
  };
}

type AssetRecoveryHandlerOptions = {
  reporter: AssetRecoveryReporter;
  /** True only when the native host can show the recovery screen. */
  nativeRecovery: boolean;
};

export type AssetRecoveryHandlers = {
  onPreloadError: (event: Event) => void;
  onResourceError: (event: Event) => void;
  onUnhandledRejection: (event: PromiseRejectionEvent) => void;
};

/**
 * Browser listeners for asset failures. A Vite preload error is cancelled only
 * when the Android host can recover; on the web/PWA the event is left alone so
 * Vite and the browser keep their normal error handling instead of the failure
 * being swallowed.
 */
export function createAssetRecoveryHandlers({
  reporter,
  nativeRecovery,
}: AssetRecoveryHandlerOptions): AssetRecoveryHandlers {
  return {
    onPreloadError(event) {
      if (!nativeRecovery) return;
      event.preventDefault();
      reporter.handlePreloadFailure();
    },
    onResourceError(event) {
      reporter.handleResourceFailure(event.target);
    },
    onUnhandledRejection(event) {
      reporter.handleRejection(event.reason);
    },
  };
}

/** Install local application-asset failure reporting inside the native shell. */
export function installAssetRecovery(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }

  const reporter = createAssetRecoveryReporter({
    origin: window.location.origin,
    report: reportAssetFailure,
  });
  const handlers = createAssetRecoveryHandlers({
    reporter,
    nativeRecovery: hasNativeRecovery(),
  });

  window.addEventListener('vite:preloadError', handlers.onPreloadError);
  window.addEventListener('error', handlers.onResourceError, true);
  window.addEventListener('unhandledrejection', handlers.onUnhandledRejection);

  return () => {
    window.removeEventListener('vite:preloadError', handlers.onPreloadError);
    window.removeEventListener('error', handlers.onResourceError, true);
    window.removeEventListener('unhandledrejection', handlers.onUnhandledRejection);
  };
}
