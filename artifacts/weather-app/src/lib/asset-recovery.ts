import { Capacitor, registerPlugin } from '@capacitor/core';

type RecoveryPlugin = {
  reportAssetFailure(options: { kind: string }): Promise<void>;
};

const NativeRecovery = registerPlugin<RecoveryPlugin>('DaymarkRecovery');

/** Ask the native host to show the local-asset recovery screen, if present. */
export function reportAssetFailure(kind: string): void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
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

/** Install local application-asset failure reporting inside the native shell. */
export function installAssetRecovery(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }

  const reporter = createAssetRecoveryReporter({
    origin: window.location.origin,
    report: reportAssetFailure,
  });

  const onPreloadError = (event: Event) => {
    event.preventDefault();
    reporter.handlePreloadFailure();
  };
  const onResourceError = (event: Event) => {
    reporter.handleResourceFailure(event.target);
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    reporter.handleRejection(event.reason);
  };

  window.addEventListener('vite:preloadError', onPreloadError);
  window.addEventListener('error', onResourceError, true);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    window.removeEventListener('vite:preloadError', onPreloadError);
    window.removeEventListener('error', onResourceError, true);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
