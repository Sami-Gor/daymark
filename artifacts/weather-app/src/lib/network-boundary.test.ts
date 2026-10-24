import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guard for the Daymark network boundary.
 *
 * The privacy model is: exactly three Open-Meteo endpoints are contacted from
 * the app (forecast, air quality, place search), every other fetch is
 * same-origin (bundled assets / locality data), and no analytics, crash or
 * update service exists. The CSP `connect-src` allowlist is enforced in three
 * places (hosting `_headers`, the Vite build, and the bundled Android WebView
 * shell) and must stay identical to the hosts actually used by `weather.ts`.
 */
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const EXPECTED_HOSTS = [
  'api.open-meteo.com',
  'air-quality-api.open-meteo.com',
  'geocoding-api.open-meteo.com',
] as const;

const headersFile = path.join(appRoot, 'public', '_headers');
const viteConfigFile = path.join(appRoot, 'vite.config.ts');
const weatherFile = path.join(appRoot, 'src', 'lib', 'weather.ts');
const bundledIndexFile = path.join(
  appRoot,
  'android',
  'app',
  'src',
  'main',
  'assets',
  'public',
  'index.html',
);

function connectSrcHosts(csp: string): string[] {
  const match = csp.match(/connect-src[^;]*/);
  expect(match).not.toBeNull();
  return (match![0] as string)
    .split(/\s+/)
    .slice(1)
    .filter((token) => token.startsWith('https://'))
    .map((token) => token.replace('https://', ''));
}

function collectSourceFiles(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'test-results') continue;
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (entry.endsWith('.test') || full.includes(`${path.sep}tests${path.sep}`)) continue;
      collectSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      out.push(full);
    }
  }
  return out;
}

describe('network boundary', () => {
  it('weather.ts declares exactly the three expected Open-Meteo endpoints', () => {
    const source = readFileSync(weatherFile, 'utf8');
    const urls = [...source.matchAll(/https:\/\/[a-z0-9.-]+/g)].map((match) => match[0].replace('https://', ''));
    expect(new Set(urls)).toEqual(new Set(EXPECTED_HOSTS));
  });

  it('the hosting _headers CSP allows exactly those hosts', () => {
    const csp = readFileSync(headersFile, 'utf8');
    expect(connectSrcHosts(csp).sort()).toEqual([...EXPECTED_HOSTS].sort());
  });

  it('the Vite build CSP allows exactly those hosts', () => {
    const config = readFileSync(viteConfigFile, 'utf8');
    const cspLine = config.split('\n').find((line) => line.includes('connect-src'));
    expect(cspLine).toBeDefined();
    expect(connectSrcHosts(cspLine!).sort()).toEqual([...EXPECTED_HOSTS].sort());
  });

  it('the bundled Android WebView CSP allows exactly those hosts', () => {
    const html = readFileSync(bundledIndexFile, 'utf8');
    const meta = html.split('\n').find((line) => line.includes('connect-src'));
    expect(meta).toBeDefined();
    expect(connectSrcHosts(meta!).sort()).toEqual([...EXPECTED_HOSTS].sort());
  });

  it('no non-test source file references any other https origin that could be fetched', () => {
    const files = collectSourceFiles(path.join(appRoot, 'src'));
    expect(files.length).toBeGreaterThan(50);
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      // Strip comments so documentation links do not count.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      for (const match of code.matchAll(/https:\/\/([a-z0-9.-]+)/g)) {
        const host = match[1];
        if (!(EXPECTED_HOSTS as readonly string[]).includes(host)) {
          offenders.push(`${path.relative(appRoot, file)}: ${host}`);
        }
      }
    }
    // Privacy/marketing pages contain documentation <a href> links; those are
    // user-clicked navigation, not fetched data, so they are excluded.
    const navigational = offenders.filter((line) => /\.tsx:/.test(line) && /pages|components/.test(line));
    const fetched = offenders.filter((line) => !navigational.includes(line));
    expect(fetched).toEqual([]);
  });
});
