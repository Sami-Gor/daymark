import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Offline / network boundary guard.
 *
 * Daymark is offline-first only for its shell and its bundled locality data:
 * live weather must always come from the three Open-Meteo hosts, and no other
 * origin may be contacted. This test pins the exact connect-src allowlist in
 * both header sources and checks that the service worker never intercepts or
 * caches a cross-origin (weather) request.
 *
 * The e2e suite checks that headers are served; this check is about which
 * hosts the policy permits and which requests the worker may cache, so a new
 * endpoint or a wildcard cannot be added unnoticed.
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function read(relativePath: string): string {
  return readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

const ALLOWED_CONNECT_SOURCES = [
  "'self'",
  'https://api.open-meteo.com',
  'https://air-quality-api.open-meteo.com',
  'https://geocoding-api.open-meteo.com',
];

const ALLOWED_HOSTS = [
  'air-quality-api.open-meteo.com',
  'api.open-meteo.com',
  'geocoding-api.open-meteo.com',
];

function productionPolicy(): string {
  const match = read('public/_headers').match(/^\s*Content-Security-Policy:\s*(.+?)\s*$/m);
  if (!match) throw new Error('Content-Security-Policy not found in public/_headers');
  return match[1];
}

function previewPolicy(): string {
  const match = read('vite.config.ts').match(/'Content-Security-Policy':\s*"([^"]+)"/);
  if (!match) throw new Error('Content-Security-Policy not found in vite.config.ts');
  return match[1];
}

function connectSources(policy: string): string[] {
  const directive = policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('connect-src'));
  if (!directive) throw new Error('connect-src missing from the policy');
  return directive.split(/\s+/).slice(1);
}

describe('network boundary', () => {
  it('allows only the app origin and the three Open-Meteo hosts to be contacted', () => {
    expect(connectSources(productionPolicy())).toEqual(ALLOWED_CONNECT_SOURCES);
    expect(connectSources(previewPolicy())).toEqual(ALLOWED_CONNECT_SOURCES);
  });

  it('never allows a wildcard or cleartext host in connect-src', () => {
    for (const policy of [productionPolicy(), previewPolicy()]) {
      for (const source of connectSources(policy)) {
        expect(source).not.toMatch(/^\*|:\/\/\*|^http:/);
        expect(source).not.toMatch(/^ws:/);
      }
    }
  });

  it('keeps every weather request on the approved Open-Meteo hosts', () => {
    const source = read('src/lib/weather.ts');
    const hosts = [...new Set(
      [...source.matchAll(/https:\/\/([a-z0-9.-]+)/gi)].map((match) => match[1].toLowerCase()),
    )].sort();
    expect(hosts).toEqual(ALLOWED_HOSTS);
    expect(source).not.toMatch(/http:\/\//);
  });

  it('leaves cross-origin weather requests entirely to the network', () => {
    const serviceWorker = read('public/sw.js');
    const code = serviceWorker
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    // The early return is what keeps weather and font requests out of the cache.
    expect(code).toContain('url.origin !== self.location.origin');
    expect(code).toContain('request.method !== "GET"');
    // Comments may explain the policy; executable code must not name a weather host.
    expect(code).not.toMatch(/open-meteo|air-quality-api|geocoding-api/i);
  });

  it('precaches only same-origin shell files', () => {
    const serviceWorker = read('public/sw.js');
    const block = serviceWorker.match(/const SHELL_ASSETS = \[([\s\S]*?)\];/);
    expect(block).not.toBeNull();
    const listed = [...(block?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect(listed.length).toBeGreaterThan(0);
    for (const url of listed) {
      expect(url.startsWith('./'), url).toBe(true);
      expect(url).not.toContain('://');
    }
  });
});
