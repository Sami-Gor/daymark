import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchPlaces } from './weather';

/*
 * Negative-input / XSS regression guards.
 *
 * Daymark's security property is that all external strings (geocoding results,
 * speech transcripts, place names) are rendered by React as text nodes. Nothing
 * parses or injects HTML, evaluates code, or places user text into a URL sink.
 * These tests lock that property in:
 *  1. a static scan of production source for dangerous DOM/execution primitives
 *  2. proof that malicious strings pass through the geocoding Zod boundary, so
 *     the rendering layer (not the validator) is what keeps them inert.
 */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const DANGEROUS_PRIMITIVES: Array<{ name: string; pattern: RegExp }> = [
  { name: 'dangerouslySetInnerHTML', pattern: /dangerouslySetInnerHTML/ },
  { name: 'innerHTML assignment', pattern: /\.innerHTML\s*=/ },
  { name: 'outerHTML assignment', pattern: /\.outerHTML\s*=/ },
  { name: 'insertAdjacentHTML', pattern: /insertAdjacentHTML/ },
  { name: 'eval', pattern: /\beval\s*\(/ },
  { name: 'new Function', pattern: /new\s+Function\s*\(/ },
  { name: 'document.write', pattern: /document\.write\s*\(/ },
  { name: 'javascript: URL', pattern: /javascript:/i },
];

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

afterEach(() => vi.restoreAllMocks());

describe('dangerous DOM primitives', () => {
  it('are absent from production app source', () => {
    for (const file of productionSourceFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const { name, pattern } of DANGEROUS_PRIMITIVES) {
        expect(pattern.test(source), `${relative(file)} must not use ${name}`).toBe(false);
      }
    }
  });

  it('are absent from the service worker', () => {
    const serviceWorker = readFileSync(path.join(projectRoot, 'public/sw.js'), 'utf8');
    for (const { name, pattern } of DANGEROUS_PRIMITIVES) {
      expect(pattern.test(serviceWorker), `public/sw.js must not use ${name}`).toBe(false);
    }
  });
});

describe('Open-Meteo boundary', () => {
  it('accepts malicious strings as plain string data (rendering is the protection)', async () => {
    const malicious = [
      '<script>alert(1)</script>',
      '<img src=x onerror="window.__xss=1">',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '<b>Paris</b>',
    ];
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({
        results: malicious.map((value, index) => ({
          name: value,
          latitude: index,
          longitude: index,
          admin1: value,
          country: value,
        })),
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    ));

    const places = await searchPlaces('xss');
    expect(places.map((place) => place.name)).toEqual(malicious);
    expect(places[0].admin1).toBe(malicious[0]);
  });
});
