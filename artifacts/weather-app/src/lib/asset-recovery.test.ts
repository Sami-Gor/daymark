import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAssetRecoveryHandlers,
  createAssetRecoveryReporter,
  installAssetRecovery,
  isAssetLoadError,
  isLocalAssetUrl,
} from './asset-recovery';

const ORIGIN = 'https://localhost';

const platform = vi.hoisted(() => ({
  native: false,
  name: 'web',
  reportNative: vi.fn(async () => undefined),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    getPlatform: () => platform.name,
  },
  registerPlugin: () => ({ reportAssetFailure: platform.reportNative }),
}));

describe('local application asset recovery', () => {
  it('recognises only same-origin application assets', () => {
    expect(isLocalAssetUrl('/assets/index.js', ORIGIN)).toBe(true);
    expect(isLocalAssetUrl('https://localhost/assets/index.css', ORIGIN)).toBe(true);
    expect(isLocalAssetUrl('https://api.open-meteo.com/v1/forecast', ORIGIN)).toBe(false);
    expect(isLocalAssetUrl('https://cdn.example.com/chunk.js', ORIGIN)).toBe(false);
    expect(isLocalAssetUrl(null, ORIGIN)).toBe(false);
  });

  it('recognises chunk and preload errors but not ordinary network errors', () => {
    expect(isAssetLoadError(new Error('Failed to fetch dynamically imported module'))).toBe(true);
    expect(isAssetLoadError('Unable to preload CSS for /assets/index.css')).toBe(true);
    expect(isAssetLoadError(new Error('ChunkLoadError: Loading chunk 4 failed'))).toBe(true);
    expect(isAssetLoadError(new Error('Failed to fetch'))).toBe(false);
    expect(isAssetLoadError({ code: 'http-500' })).toBe(false);
  });

  it('reports local script and CSS failures, and suppresses duplicates', () => {
    const report = vi.fn();
    const reporter = createAssetRecoveryReporter({ origin: ORIGIN, report });

    reporter.handleResourceFailure({ tagName: 'SCRIPT', src: `${ORIGIN}/assets/index.js` } as EventTarget);
    reporter.handleResourceFailure({ tagName: 'LINK', href: `${ORIGIN}/assets/index.css` } as EventTarget);
    reporter.handlePreloadFailure();

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('local-script');
  });

  it('ignores external resources and ordinary API rejections', () => {
    const report = vi.fn();
    const reporter = createAssetRecoveryReporter({ origin: ORIGIN, report });

    reporter.handleResourceFailure({
      tagName: 'SCRIPT',
      src: 'https://api.open-meteo.com/v1/forecast',
    } as EventTarget);
    reporter.handleResourceFailure({
      tagName: 'LINK',
      href: 'https://cdn.example.com/index.css',
    } as EventTarget);
    reporter.handleRejection(new Error('Weather request failed'));

    expect(report).not.toHaveBeenCalled();
  });

  it('reports a dynamic import rejection once', () => {
    const report = vi.fn();
    const reporter = createAssetRecoveryReporter({ origin: ORIGIN, report });

    reporter.handleRejection(new Error('Failed to fetch dynamically imported module: /assets/page.js'));
    reporter.handleRejection(new Error('Failed to fetch dynamically imported module: /assets/page.js'));

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('dynamic-import');
  });
});

describe('Vite preload error handling by platform', () => {
  beforeEach(() => {
    platform.native = false;
    platform.name = 'web';
    vi.clearAllMocks();
  });

  it('leaves Vite preload errors untouched in a browser/PWA', () => {
    const report = vi.fn();
    const reporter = createAssetRecoveryReporter({ origin: ORIGIN, report });
    const handlers = createAssetRecoveryHandlers({ reporter, nativeRecovery: false });
    const event = new Event('vite:preloadError', { cancelable: true });

    handlers.onPreloadError(event);

    expect(event.defaultPrevented).toBe(false);
    expect(report).not.toHaveBeenCalled();
  });

  it('cancels and reports a Vite preload error when Android can recover', () => {
    const report = vi.fn();
    const reporter = createAssetRecoveryReporter({ origin: ORIGIN, report });
    const handlers = createAssetRecoveryHandlers({ reporter, nativeRecovery: true });
    const event = new Event('vite:preloadError', { cancelable: true });

    handlers.onPreloadError(event);

    expect(event.defaultPrevented).toBe(true);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('vite-preload');
  });

  it('does not cancel preload errors when the installed host is a browser', () => {
    const fakeWindow = Object.assign(new EventTarget(), { location: { origin: ORIGIN } });
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', {});

    const uninstall = installAssetRecovery();
    const event = new Event('vite:preloadError', { cancelable: true });
    fakeWindow.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(platform.reportNative).not.toHaveBeenCalled();
    uninstall();
    vi.unstubAllGlobals();
  });

  it('cancels preload errors and asks the Android host to recover', () => {
    platform.native = true;
    platform.name = 'android';
    const fakeWindow = Object.assign(new EventTarget(), { location: { origin: ORIGIN } });
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', {});

    const uninstall = installAssetRecovery();
    const event = new Event('vite:preloadError', { cancelable: true });
    fakeWindow.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(platform.reportNative).toHaveBeenCalledWith({ kind: 'vite-preload' });
    uninstall();
    vi.unstubAllGlobals();
  });

  it('does not cancel preload errors on a non-Android native host', () => {
    platform.native = true;
    platform.name = 'ios';
    const fakeWindow = Object.assign(new EventTarget(), { location: { origin: ORIGIN } });
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', {});

    const uninstall = installAssetRecovery();
    const event = new Event('vite:preloadError', { cancelable: true });
    fakeWindow.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(platform.reportNative).not.toHaveBeenCalled();
    uninstall();
    vi.unstubAllGlobals();
  });
});
