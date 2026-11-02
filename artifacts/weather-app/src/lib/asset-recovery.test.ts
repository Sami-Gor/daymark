import { describe, expect, it, vi } from 'vitest';

import {
  createAssetRecoveryReporter,
  isAssetLoadError,
  isLocalAssetUrl,
} from './asset-recovery';

const ORIGIN = 'https://localhost';

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
