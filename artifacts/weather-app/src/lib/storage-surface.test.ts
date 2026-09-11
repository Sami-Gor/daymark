import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LOCALE_STORAGE_KEY } from './i18n';

/*
 * Regression guard for the persisted-storage surface.
 *
 * Daymark is allowed exactly one app-controlled persistence key:
 * `daymark.locale` (a non-sensitive display preference) owned by lib/i18n.ts.
 * Location, search queries, transcripts, weather payloads and alert data must
 * never be persisted.
 *
 * The service worker intentionally uses Cache Storage for static app-shell
 * assets; that is PWA asset caching, not user-state persistence, and is only
 * checked for the absence of user-state storage APIs here.
 */
const APPROVED_LOCALE_KEY = 'daymark.locale';
const USER_STATE_APIS = ['sessionStorage', 'indexedDB', 'document.cookie', 'navigator.storage'];
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function collectFiles(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) collectFiles(full, out);
    else out.push(full);
  }
  return out;
}

function productionSourceFiles(): string[] {
  return collectFiles(path.join(projectRoot, 'src'))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\./.test(file));
}

function relative(file: string): string {
  return path.relative(projectRoot, file).split(path.sep).join('/');
}

describe('persisted storage surface', () => {
  it('approves only the locale preference as the app-controlled localStorage key', () => {
    expect(LOCALE_STORAGE_KEY).toBe(APPROVED_LOCALE_KEY);
    const owners = productionSourceFiles()
      .filter((file) => readFileSync(file, 'utf8').includes('localStorage'))
      .map(relative);
    // One owner only: a new module touching localStorage must fail this test.
    expect(owners).toEqual(['src/lib/i18n.ts']);
    for (const file of owners) {
      const source = readFileSync(path.join(projectRoot, file), 'utf8');
      // No raw literal keys — the approved constant must be used.
      expect(source).not.toMatch(/localStorage\.\w+\(\s*['"]/);
      expect(source).toContain('LOCALE_STORAGE_KEY');
    }
  });

  it('does not introduce sessionStorage, IndexedDB, cookies or storage APIs in production source', () => {
    for (const file of productionSourceFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const api of USER_STATE_APIS) {
        expect(source.includes(api), `${relative(file)} must not use ${api}`).toBe(false);
      }
    }
  });

  it('keeps the service worker on static asset caching without user-state storage APIs', () => {
    const serviceWorker = readFileSync(path.join(projectRoot, 'public/sw.js'), 'utf8');
    expect(serviceWorker).toMatch(/caches\.open\(CACHE_NAME\)/);
    for (const api of ['localStorage', ...USER_STATE_APIS]) {
      expect(serviceWorker.includes(api), `public/sw.js must not use ${api}`).toBe(false);
    }
  });
});
