import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/*
 * Deterministic Open-Meteo fixtures. Timestamps are fixed so the rendered
 * UI is stable; numbers are chosen to exercise rounding and unit conversion.
 */
const FORECAST = {
  latitude: 51.51,
  longitude: -0.13,
  current: {
    time: '2026-09-07T12:00',
    temperature_2m: 20.4,
    relative_humidity_2m: 62,
    apparent_temperature: 19.1,
    precipitation: 0,
    cloud_cover: 80,
    weather_code: 3,
    uv_index: 2.5,
  },
  hourly: {
    time: [
      '2026-09-07T12:00', '2026-09-07T13:00', '2026-09-07T14:00', '2026-09-07T15:00',
      '2026-09-07T16:00', '2026-09-07T17:00', '2026-09-07T18:00', '2026-09-07T19:00',
      '2026-09-07T20:00', '2026-09-07T21:00', '2026-09-07T22:00', '2026-09-07T23:00',
    ],
    temperature_2m: [20.4, 21, 21.2, 20.8, 20, 19, 18, 17, 16, 15, 14, 13],
    precipitation_probability: [10, 20, 10, 0, 0, 5, 10, 15, 20, 25, 30, 35],
    weather_code: [3, 2, 3, 3, 2, 1, 1, 0, 0, 1, 2, 3],
    uv_index: [2.5, 3, 2, 1, 0.5, 0.2, 0, 0, 0, 0, 0, 0],
  },
  daily: {
    time: ['2026-09-07', '2026-09-08', '2026-09-09'],
    weather_code: [3, 61, 0],
    temperature_2m_max: [21, 19, 22],
    temperature_2m_min: [12, 11, 13],
    precipitation_probability_max: [10, 90, 0],
    sunrise: ['2026-09-07T06:30'],
    sunset: ['2026-09-07T19:40'],
    uv_index_max: [3, 2, 4],
  },
};

const AIR = {
  current: { us_aqi: 33, pm10: 12, pm2_5: 6.5, nitrogen_dioxide: 9, ozone: 60 },
  hourly: { time: ['2026-09-07T12:00'], us_aqi: [33], pm10: [12], pm2_5: [6.5] },
};

const GEOCODE = {
  results: [{ name: 'Greenwich', latitude: 51.4789, longitude: 0.0107, country: 'United Kingdom' }],
};

/** Intercept all Open-Meteo calls with deterministic fixtures. */
async function mockOpenMeteo(page: Page, overrides: { forecast?: object; air?: object; status?: number; delay?: number } = {}) {
  const { forecast = FORECAST, air = AIR, status = 200, delay = 0 } = overrides;
  await page.route('**/api.open-meteo.com/**', async (route) => {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(forecast) });
  });
  await page.route('**/air-quality-api.open-meteo.com/**', async (route) => {
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(air) });
  });
  await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(GEOCODE) });
  });
}

test.describe('functional', () => {
  test('loads with Daymark branding, London default, and no geolocation request', async ({ page }) => {
    let geoCalls = 0;
    await page.addInitScript(() => {
      window.__geoCalls = 0;
      const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = (...args) => {
        window.__geoCalls++;
        return original(...args);
      };
    });
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-city')).toHaveText('London');
    await expect(page.locator('.brand-name')).toHaveText('daymark');
    await expect(page.getByTestId('text-current-temperature')).toHaveText('20°C');
    expect(page.getByTestId('text-current-temperature')).toBeVisible;
    await expect.poll(() => page.evaluate(() => window.__geoCalls)).toBe(0);
  });

  test('granted geolocation sends rounded coordinates and updates the place', async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: { latitude: 51.5074567, longitude: -0.12789012 },
    });
    const page = await context.newPage();
    const captured: string[] = [];
    await mockOpenMeteo(page);
    // Registered after mockOpenMeteo so this capture route wins (LIFO).
    await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
      captured.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GEOCODE) });
    });
    await page.goto('/');
    await expect(page.getByTestId('text-current-city')).toHaveText('London');
    await page.getByTestId('button-refresh-location').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Greenwich');
    expect(captured.length).toBeGreaterThan(0);
    for (const url of captured) {
      expect(url).toContain('latitude=51.51&longitude=-0.13');
      expect(url).not.toContain('5074567');
    }
    await context.close();
  });

  test('denied geolocation shows a toast and keeps the loaded weather', async ({ browser }) => {
    const context = await browser.newContext({ permissions: [] });
    const page = await context.newPage();
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-city')).toHaveText('London');
    // The click can be swallowed by the loading→content swap, so retry until
    // the toast appears. On a denied context no second prompt is shown.
    let toastShown = false;
    const caught: string[] = [];
    for (let attempt = 0; attempt < 3 && !toastShown; attempt++) {
      await page.getByTestId('button-refresh-location').click();
      try {
        await expect(page.getByTestId('toast')).toContainText('Location unavailable', { timeout: 2000 });
        toastShown = true;
      } catch (e) {
        caught.push(String(e).slice(0, 200));
      }
    }
    if (!toastShown) throw new Error('toast never appeared; caught: ' + JSON.stringify(caught, null, 2));
    await expect(page.getByTestId('text-current-temperature')).toHaveText('20°C');
    await context.close();
  });

  test('°C / °F toggle converts and updates aria-pressed', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toHaveText('20°C');
    await page.getByTestId('button-unit-fahrenheit').click();
    await expect(page.getByTestId('text-current-temperature')).toHaveText('69°F');
    await expect(page.getByTestId('button-unit-fahrenheit')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('button-unit-celsius')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('button-unit-celsius').click();
    await expect(page.getByTestId('text-current-temperature')).toHaveText('20°C');
  });

  test('renders hourly, 3-day forecast, 3-day UV, air quality, and micro-climate', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('list-hourly-forecast').locator('.hour-card')).toHaveCount(5);
    await expect(page.getByTestId('list-daily-forecast').locator('.day-row')).toHaveCount(3);
    await expect(page.getByTestId('list-daily-uv').locator('.uv-day')).toHaveCount(3);
    await expect(page.getByTestId('text-uv-protection-window')).toContainText('Sun protection recommended');
    await expect(page.getByTestId('uv-protection-timeline')).toBeVisible();
    await expect(page.getByTestId('panel-air-quality')).toBeVisible();
    await expect(page.getByTestId('air-context')).toBeVisible();
    await expect(page.getByTestId('panel-micro-climate')).toBeVisible();
  });

  test('shows a loading state first, then content', async ({ page }) => {
    await mockOpenMeteo(page, { delay: 600 });
    await page.goto('/');
    await expect(page.locator('.loading-layout')).toBeVisible();
    await expect(page.getByTestId('text-current-temperature')).toHaveText('20°C');
    await expect(page.locator('.loading-layout')).toHaveCount(0);
  });

  test('HTTP 500 shows the error panel and retry recovers', async ({ page }) => {
    let failing = true;
    await page.route('**/api.open-meteo.com/**', async (route) => {
      if (failing) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{"reason":"boom"}' });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FORECAST) });
      }
    });
    await page.route('**/air-quality-api.open-meteo.com/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(AIR) });
    });
    await page.goto('/');
    await expect(page.getByTestId('status-weather-error')).toBeVisible();
    await expect(page.locator('[data-testid="status-weather-error"]')).toContainText('Weather service returned 500');
    failing = false;
    await page.getByTestId('button-retry-weather').click();
    await expect(page.getByTestId('text-current-temperature')).toHaveText('20°C');
  });

  test('malformed API data shows a friendly error without crashing the page', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: { current: 'garbage', hourly: 42 } });
    await page.goto('/');
    await expect(page.getByTestId('status-weather-error')).toBeVisible();
    await expect(page.locator('[data-testid="status-weather-error"]')).toContainText('unexpected shape');
    // The page itself is alive: footer and error controls are present.
    await expect(page.locator('.brand-name')).toHaveText('daymark');
  });
});

test.describe('responsive', () => {
  const widths = [320, 375, 390, 430, 768, 1024, 1280, 1440];

  for (const width of widths) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await mockOpenMeteo(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.getByTestId('text-current-temperature')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const uvStrip = await page.evaluate(() => {
        const el = document.querySelector('.uv-days-wrap');
        return el ? el.scrollWidth <= el.clientWidth + 1 : true;
      });
      expect(uvStrip).toBe(true);
    });
  }

  test('hourly strip scrolls internally on mobile', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.getByTestId('list-hourly-forecast')).toBeVisible();
    const scrolls = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="list-hourly-forecast"]');
      return el ? el.scrollWidth > el.clientWidth : false;
    });
    expect(scrolls).toBe(true);
  });

  test('long location names wrap safely', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/');
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="text-current-city"]');
      if (el) el.textContent = 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch';
    });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('accessibility', () => {
  test('core a11y checks pass at desktop and mobile', async ({ page }) => {
    const { AxeBuilder } = await import('@axe-core/playwright');
    await mockOpenMeteo(page);
    // Settle entrance animations so axe measures final colors, not
    // mid-transition blends (the app honors prefers-reduced-motion).
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    await page.waitForTimeout(300);

    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious).toEqual([]);
    }
  });

  test('viewport allows pinch zoom and unit controls expose state', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    const content = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute('content'));
    expect(content).not.toContain('maximum-scale');
    expect(content).not.toContain('user-scalable=no');
    await expect(page.getByTestId('button-unit-celsius')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('text-current-city')).toBeVisible();
    const h1 = await page.evaluate(() => document.querySelectorAll('h1').length);
    expect(h1).toBeGreaterThanOrEqual(1);
  });
});

test.describe('PWA + service worker (production build)', () => {
  test('registers with root scope, caches the shell, and serves it offline', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return reg?.active ? 'active' : (reg ? 'installing' : 'none');
      }),
    ).toBe('active');

    const sw = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const entries = [];
      for (const key of await caches.keys()) {
        for (const r of await (await caches.open(key)).keys()) entries.push(new URL(r.url).pathname);
      }
      return { scope: reg?.scope, entries };
    });
    expect(sw.scope).toBe('http://localhost:5177/');
    expect(sw.entries).toContain('/');
    expect(sw.entries.some((p) => p.endsWith('.js'))).toBe(true);

    // Manifest is served and parseable with the required fields.
    const manifest = await page.evaluate(async () => {
      const res = await fetch('./manifest.webmanifest');
      return { status: res.status, body: await res.json() };
    });
    expect(manifest.status).toBe(200);
    expect(manifest.body.name).toBe('Daymark — weather, simply');
    expect(manifest.body.display).toBe('standalone');
    expect(manifest.body.icons.length).toBeGreaterThanOrEqual(3);

    // Open-Meteo traffic is never placed in the shell cache.
    expect(sw.entries.some((p) => p.includes('open-meteo'))).toBe(false);

    // First online reload through the active worker settles its claim;
    // going offline straight after activation would race it.
    await page.reload();
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    // Offline: the shell still loads; live weather degrades to the error panel.
    await page.context().setOffline(true);
    await page.reload();
    await expect(page.locator('.weather-app')).toBeVisible();
    await page.context().setOffline(false);
    await page.reload();
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
  });
});

test.describe('security headers (preview environment)', () => {
  test('serves the full security-header set and the app runs without CSP errors', async ({ page }) => {
    const cspErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('Content-Security-Policy')) cspErrors.push(msg.text());
    });
    const response = await page.goto('/');
    expect(response?.headers()['content-security-policy']).toContain("default-src 'none'");
    expect(response?.headers()['content-security-policy']).toContain('frame-ancestors ' + "'none'");
    expect(response?.headers()['content-security-policy']).not.toContain('unsafe-eval');
    expect(response?.headers()['x-content-type-options']).toBe('nosniff');
    expect(response?.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(response?.headers()['permissions-policy']).toContain('geolocation=(self)');
    expect(response?.headers()['permissions-policy']).toContain('microphone=(self)');
    expect(response?.headers()['permissions-policy']).not.toContain('microphone=()');
    expect(response?.headers()['permissions-policy']).toContain('camera=()');
    expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin');
    await mockOpenMeteo(page);
    await page.reload();
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    expect(cspErrors).toEqual([]);
  });
});

test.describe('built security headers (dist/public)', () => {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

  test('build output ships the production _headers file unchanged', async () => {
    const sourcePath = path.join(projectRoot, 'public', '_headers');
    const builtPath = path.join(projectRoot, 'dist', 'public', '_headers');
    expect(
      existsSync(builtPath),
      `built _headers not found at ${builtPath} — run "pnpm run build" before the e2e suite`,
    ).toBe(true);

    const source = readFileSync(sourcePath, 'utf8');
    const built = readFileSync(builtPath, 'utf8');
    // Byte-for-byte parity: the build must copy public/_headers verbatim.
    expect(built).toBe(source);

    const criticalHeaders: Array<[name: string, value: string]> = [
      ['Permissions-Policy', 'geolocation=(self)'],
      ['Permissions-Policy', 'camera=()'],
      ['Permissions-Policy', 'microphone=(self)'],
      ['Content-Security-Policy', "default-src 'none'"],
      ['Strict-Transport-Security', 'max-age=63072000'],
      ['Referrer-Policy', 'strict-origin-when-cross-origin'],
      ['X-Content-Type-Options', 'nosniff'],
      ['Cross-Origin-Opener-Policy', 'same-origin'],
      ['Cross-Origin-Resource-Policy', 'same-origin'],
    ];
    for (const [name, value] of criticalHeaders) {
      expect(built, `built _headers is missing ${name}: ${value}`).toContain(value);
    }
    expect(built, 'built _headers must not disallow the microphone').not.toContain('microphone=()');
  });
});

/** Stub the Web Speech playback API before app scripts run. */
async function stubSpeechPlayback(page: Page) {
  await page.addInitScript(() => {
    class FakeUtterance {
      text: string;
      lang = '';
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    const state = { spoken: [] as string[], cancelCount: 0, last: null as { onend?: () => void } | null };
    const synthesis = {
      speaking: false,
      speak(utterance: { text: string }) {
        state.last = utterance as { onend?: () => void };
        state.spoken.push(utterance.text);
      },
      cancel() {
        state.cancelCount += 1;
      },
      getVoices() {
        return [];
      },
    };
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', { value: synthesis, configurable: true });
    (window as any).__speech = state;
  });
}

/** Stub the SpeechRecognition API before app scripts run. */
async function stubSpeechRecognition(page: Page, supported = true) {
  await page.addInitScript((isSupported: boolean) => {
    const state = { starts: 0, stops: 0, aborts: 0, instance: null as any };
    class FakeRecognition {
      lang = '';
      continuous = true;
      interimResults = true;
      maxAlternatives = 1;
      onstart: (() => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      constructor() {
        state.instance = this;
      }
      start() {
        state.starts += 1;
      }
      stop() {
        state.stops += 1;
      }
      abort() {
        state.aborts += 1;
      }
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: isSupported ? FakeRecognition : undefined, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
    (window as any).__recognition = state;
  }, supported);
}

function emitRecognitionResult(page: Page, transcript: string) {
  return page.evaluate((text: string) => {
    const instance = (window as any).__recognition?.instance;
    if (!instance?.onresult) return false;
    instance.onresult({ resultIndex: 0, results: [{ 0: { transcript: text }, isFinal: true }] });
    return true;
  }, transcript);
}

function emitRecognitionEnd(page: Page) {
  return page.evaluate(() => {
    (window as any).__recognition?.instance?.onend?.();
  });
}

test.describe('voice controls', () => {
  test('Hear today speaks the briefing and toggles to Stop', async ({ page }) => {
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    await page.goto('/');
    const button = page.getByTestId('button-hear-today');
    await expect(button).toBeVisible();
    await expect(button).toHaveText(/Hear today/);
    await button.click();
    await expect(button).toHaveText(/Stop/);
    await expect(button).toHaveAttribute('aria-label', /Stop reading/);
    const spoken = await page.evaluate(() => (window as any).__speech.spoken);
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toContain('degrees');
    await button.click();
    await expect(button).toHaveText(/Hear today/);
    expect(await page.evaluate(() => (window as any).__speech.cancelCount)).toBeGreaterThanOrEqual(1);
  });

  test('speech end resets the playback control', async ({ page }) => {
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    await page.goto('/');
    const button = page.getByTestId('button-hear-today');
    await button.click();
    await expect(button).toHaveText(/Stop/);
    await page.evaluate(() => (window as any).__speech.last?.onend?.());
    await expect(button).toHaveText(/Hear today/);
  });

  test('Ask Daymark hides when speech recognition is unsupported', async ({ page }) => {
    await stubSpeechRecognition(page, false);
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('button-ask-daymark')).toHaveCount(0);
    await expect(page.getByTestId('ask-privacy')).toHaveCount(0);
    await expect(page.getByTestId('button-hear-today')).toBeVisible();
  });

  test('shows a localized voice privacy disclosure when voice is available', async ({ page }) => {
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    await page.goto('/');

    const note = page.getByTestId('ask-privacy');
    await expect(note).toBeVisible();
    await expect(note).toContainText('handled by your browser or device');
    expect(await note.evaluate((element) => element.tabIndex)).toBe(-1);

    await page.getByTestId('select-language').selectOption('fr');
    await expect(note).toContainText('assurée par votre navigateur');

    await page.getByTestId('select-language').selectOption('es');
    await expect(note).toContainText('navegador o dispositivo');
  });

  test('does not request the microphone on load', async ({ page }) => {
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await page.addInitScript(() => {
      (window as any).__mediaRequests = 0;
      const media = navigator.mediaDevices;
      if (media?.getUserMedia) {
        const original = media.getUserMedia.bind(media);
        media.getUserMedia = (constraints) => {
          (window as any).__mediaRequests += 1;
          return original(constraints);
        };
      }
    });
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__recognition.starts)).toBe(0);
    expect(await page.evaluate(() => (window as any).__mediaRequests)).toBe(0);
  });

  test('Ask Daymark resolves a rain question and shows the answer', async ({ page }) => {
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    await page.goto('/');
    const button = page.getByTestId('button-ask-daymark');
    await expect(button).toHaveText(/Ask Daymark/);
    await button.click();
    await expect(button).toHaveText(/Stop/);
    await expect(page.getByTestId('ask-status')).toHaveText(/Listening/);
    expect(await page.evaluate(() => (window as any).__recognition.starts)).toBe(1);

    expect(await emitRecognitionResult(page, 'When will it rain?')).toBe(true);
    await emitRecognitionEnd(page);
    await expect(button).toHaveText(/Ask Daymark/);
    await expect(page.getByTestId('ask-question')).toContainText('when will it rain');
    await expect(page.getByTestId('ask-answer')).toContainText('chance of rain');
    await expect(page.getByTestId('ask-answer')).toContainText('11 PM');

    const spoken = await page.evaluate(() => (window as any).__speech.spoken);
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toContain('chance of rain');

    // No transcript or question is persisted anywhere.
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  });

  test('unknown questions get the deterministic fallback, not a made-up answer', async ({ page }) => {
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    await page.goto('/');
    await page.getByTestId('button-ask-daymark').click();
    await emitRecognitionResult(page, 'what is the meaning of life');
    await emitRecognitionEnd(page);
    await expect(page.getByTestId('ask-answer')).toContainText('I can help with');
    expect(await page.evaluate(() => (window as any).__speech.spoken)).toHaveLength(0);
  });

  test('Stop ends recognition and returns the control to idle', async ({ page }) => {
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    await page.goto('/');
    const button = page.getByTestId('button-ask-daymark');
    await button.click();
    await expect(button).toHaveText(/Stop/);
    await button.click();
    await expect(button).toHaveText(/Ask Daymark/);
    await expect(page.getByTestId('ask-status')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__recognition.stops)).toBe(1);
  });

  test('permission errors are readable and return the UI to idle', async ({ page }) => {
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    await page.goto('/');
    const button = page.getByTestId('button-ask-daymark');
    await button.click();
    await page.evaluate(() => (window as any).__recognition.instance.onerror?.({ error: 'not-allowed' }));
    await expect(page.getByTestId('ask-error')).toContainText('blocked');
    await expect(button).toHaveText(/Ask Daymark/);
    expect(await page.evaluate(() => (window as any).__recognition.starts)).toBe(1);
  });

  test('starting recognition stops playback and stale sessions cannot update the UI', async ({ page }) => {
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    await page.goto('/');
    const hear = page.getByTestId('button-hear-today');
    const ask = page.getByTestId('button-ask-daymark');

    await hear.click();
    await expect(hear).toHaveText(/Stop/);
    await ask.click();
    await expect(hear).toHaveText(/Hear today/);
    expect(await page.evaluate(() => (window as any).__speech.cancelCount)).toBeGreaterThanOrEqual(1);

    await page.evaluate(() => {
      (window as any).__staleResult = (window as any).__recognition.instance.onresult;
    });
    await ask.click(); // stop the first session
    await ask.click(); // start a new session
    expect(await page.evaluate(() => (window as any).__recognition.starts)).toBe(2);
    await page.evaluate(() => {
      (window as any).__staleResult?.({ resultIndex: 0, results: [{ 0: { transcript: 'will it rain' }, isFinal: true }] });
    });
    await expect(page.getByTestId('ask-question')).toHaveCount(0);

    await emitRecognitionResult(page, "what's the uv");
    await emitRecognitionEnd(page);
    await expect(page.getByTestId('ask-question')).toContainText("what's the uv");
    await expect(page.getByTestId('ask-answer')).toContainText('UV index');
  });

  test('unmounting aborts recognition and stops background listening', async ({ page }) => {
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    await page.goto('/');
    const ask = page.getByTestId('button-ask-daymark');
    await ask.click();
    await expect(ask).toHaveText(/Stop/);

    await page.evaluate(() => {
      window.history.pushState({}, '', '/missing');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByTestId('button-ask-daymark')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__recognition.stops)).toBeGreaterThanOrEqual(1);
    const detached = await page.evaluate(() => {
      const instance = (window as any).__recognition.instance;
      return instance ? { onresult: instance.onresult, onerror: instance.onerror, onend: instance.onend } : null;
    });
    expect(detached).not.toBeNull();
    expect(detached?.onresult).toBeNull();
    expect(detached?.onerror).toBeNull();
    expect(detached?.onend).toBeNull();
  });
});

const PARIS_RESULT = { name: 'Paris', latitude: 48.8566, longitude: 2.3522, admin1: 'Île-de-France', country: 'France', country_code: 'FR', timezone: 'Europe/Paris' };
const SPRINGFIELD_ILLINOIS = { name: 'Springfield', latitude: 39.7817, longitude: -89.6501, admin1: 'Illinois', country: 'United States', country_code: 'US', timezone: 'America/Chicago' };
const SPRINGFIELD_MISSOURI = { name: 'Springfield', latitude: 37.2153, longitude: -93.2982, admin1: 'Missouri', country: 'United States', country_code: 'US', timezone: 'America/Chicago' };
const TOKYO_RESULT = { name: 'Tokyo', latitude: 35.6762, longitude: 139.6503, admin1: 'Tokyo', country: 'Japan', country_code: 'JP', timezone: 'Asia/Tokyo' };

const PARIS_FORECAST = {
  ...FORECAST,
  timezone: 'Europe/Paris',
  timezone_abbreviation: 'CEST',
  utc_offset_seconds: 7200,
  current: { ...FORECAST.current, temperature_2m: 12.4 },
};

const TOKYO_FORECAST = {
  ...FORECAST,
  timezone: 'Asia/Tokyo',
  timezone_abbreviation: 'JST',
  utc_offset_seconds: 32400,
  current: { ...FORECAST.current, time: '2026-09-07T21:00', temperature_2m: 26.4 },
};

/** Deterministic geocoding + per-location weather stubs. */
async function mockLocations(page: Page) {
  await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
    const url = new URL(route.request().url());
    const name = (url.searchParams.get('name') ?? '').toLowerCase();
    const results = name === 'paris'
      ? [PARIS_RESULT]
      : name === 'springfield'
        ? [SPRINGFIELD_ILLINOIS, SPRINGFIELD_MISSOURI]
        : name === 'tokyo'
          ? [TOKYO_RESULT]
          : null;
    if (name === 'paris') await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results }) });
    } catch {
      // The client aborted a stale search; nothing to fulfil.
    }
  });
  await page.route('**/api.open-meteo.com/**', async (route) => {
    const url = new URL(route.request().url());
    const latitude = Number(url.searchParams.get('latitude'));
    const body = Math.abs(latitude - 48.8566) < 0.5
      ? PARIS_FORECAST
      : Math.abs(latitude - 35.6762) < 0.5
        ? TOKYO_FORECAST
        : FORECAST;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/air-quality-api.open-meteo.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(AIR),
  }));
}

test.describe('location search', () => {
  test('search control is visible and shows region for results', async ({ page }) => {
    await mockLocations(page);
    await page.goto('/');
    const input = page.getByTestId('input-location-search');
    await expect(input).toBeVisible();
    await input.fill('paris');
    await expect(page.getByTestId('location-option-0')).toContainText('Paris');
    await expect(page.getByTestId('location-option-0')).toContainText('Île-de-France, France');
  });

  test('selecting a result updates the weather for that location', async ({ page }) => {
    await mockLocations(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-city')).toHaveText('London');
    await page.getByTestId('input-location-search').fill('paris');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');
    await expect(page.getByTestId('text-current-temperature')).toHaveText('12°C');
    await expect(page.getByTestId('input-location-search')).toHaveValue('');
  });

  test('results are keyboard selectable', async ({ page }) => {
    await mockLocations(page);
    await page.goto('/');
    const input = page.getByTestId('input-location-search');
    await input.fill('tokyo');
    await expect(page.getByTestId('location-option-0')).toBeVisible();
    await input.press('ArrowDown');
    await expect(page.getByTestId('location-option-0')).toHaveAttribute('aria-selected', 'true');
    await input.press('Enter');
    await expect(page.getByTestId('text-current-city')).toHaveText('Tokyo');
  });

  test('duplicate names are disambiguated and the chosen one is used', async ({ page }) => {
    await mockLocations(page);
    await page.goto('/');
    const requested: string[] = [];
    page.on('request', (request) => {
      const parsed = new URL(request.url());
      if (parsed.hostname === 'api.open-meteo.com' && parsed.pathname === '/v1/forecast') requested.push(request.url());
    });
    await page.getByTestId('input-location-search').fill('springfield');
    await expect(page.getByTestId('location-option-0')).toContainText('Illinois');
    await expect(page.getByTestId('location-option-1')).toContainText('Missouri');
    await page.getByTestId('location-option-1').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Springfield');
    const chosen = requested.find((url) => url.includes('latitude=37.2153'));
    expect(chosen).toBeTruthy();
  });

  test('shows a no-results state', async ({ page }) => {
    await mockLocations(page);
    await page.goto('/');
    await page.getByTestId('input-location-search').fill('zzzzz');
    await expect(page.getByTestId('location-status')).toHaveText('No places found');
  });

  test('the latest query wins when an older search is still in flight', async ({ page }) => {
    await mockLocations(page);
    await page.goto('/');
    const input = page.getByTestId('input-location-search');
    await input.fill('paris');
    await page.waitForTimeout(300); // paris request is now in flight (delayed 500ms)
    await input.fill('tokyo');
    await expect(page.getByTestId('location-option-0')).toContainText('Tokyo');
    await page.waitForTimeout(600); // paris would have resolved by now
    await expect(page.getByTestId('location-option-0')).toContainText('Tokyo');
    await expect(page.getByTestId('location-results')).not.toContainText('Paris');
  });

  test('voice uses the selected location', async ({ page }) => {
    await stubSpeechPlayback(page);
    await stubSpeechRecognition(page);
    await mockLocations(page);
    await page.goto('/');
    await page.getByTestId('input-location-search').fill('tokyo');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Tokyo');

    await page.getByTestId('button-hear-today').click();
    const spoken = await page.evaluate(() => (window as any).__speech.spoken);
    expect(spoken[0]).toContain('in Tokyo');

    await page.getByTestId('button-ask-daymark').click();
    await emitRecognitionResult(page, 'When will it rain?');
    await emitRecognitionEnd(page);
    await expect(page.getByTestId('ask-answer')).toContainText('11 PM');
  });

  test('micro-climate is shown in the UK and hidden elsewhere', async ({ page }) => {
    await mockLocations(page);
    await page.goto('/');
    await expect(page.getByTestId('panel-micro-climate')).toBeVisible();
    await page.getByTestId('input-location-search').fill('paris');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');
    await expect(page.getByTestId('panel-micro-climate')).toHaveCount(0);
  });

  test('search results do not overflow at 320px', async ({ page }) => {
    await mockLocations(page);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');
    await page.getByTestId('input-location-search').fill('springfield');
    await expect(page.getByTestId('location-option-1')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

const WINDY_FORECAST = {
  ...FORECAST,
  hourly: {
    ...FORECAST.hourly,
    precipitation: FORECAST.hourly.time.map(() => 0),
    snowfall: FORECAST.hourly.time.map(() => 0),
    wind_speed_10m: FORECAST.hourly.time.map(() => 10),
    wind_gusts_10m: FORECAST.hourly.time.map((_, index) => (index === 5 ? 110 : 15)),
  },
};

const TOKYO_WINDY_FORECAST = {
  ...WINDY_FORECAST,
  timezone: 'Asia/Tokyo',
  timezone_abbreviation: 'JST',
  utc_offset_seconds: 32400,
  current: { ...WINDY_FORECAST.current, time: '2026-09-07T17:00' },
  hourly: {
    ...WINDY_FORECAST.hourly,
    wind_gusts_10m: WINDY_FORECAST.hourly.time.map((_, index) => (index === 9 ? 110 : 15)),
  },
};

test.describe('severe weather alerts', () => {
  test('shows nothing at all when there is no alert', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    await expect(page.getByTestId('list-weather-alerts')).toHaveCount(0);
    await expect(page.getByText('No alerts')).toHaveCount(0);
    await expect(page.getByText('No warnings')).toHaveCount(0);
  });

  test('renders a forecast-derived risk with severity text and timing', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: WINDY_FORECAST });
    await page.goto('/');
    const alert = page.getByTestId('alert-wind');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Strong winds expected');
    await expect(alert).toContainText('Severe risk');
    await expect(alert).toContainText('not an official warning');
    await expect(page.getByTestId('alert-time-wind')).toHaveText(/5 PM–6 PM/);
  });

  test('mentions the risk in the Hear today briefing', async ({ page }) => {
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page, { forecast: WINDY_FORECAST });
    await page.goto('/');
    await page.getByTestId('button-hear-today').click();
    const spoken = await page.evaluate(() => (window as any).__speech.spoken);
    expect(spoken[0]).toContain('Strong winds expected');
  });

  test('answers an alert question through the intent layer', async ({ page }) => {
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page, { forecast: WINDY_FORECAST });
    await page.goto('/');
    await page.getByTestId('button-ask-daymark').click();
    await emitRecognitionResult(page, 'Are there any warnings?');
    await emitRecognitionEnd(page);
    await expect(page.getByTestId('ask-answer')).toContainText('Strong winds expected');
  });

  test('replaces the alert when the selected location changes', async ({ page }) => {
    await page.route('**/geocoding-api.open-meteo.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [PARIS_RESULT] }),
    }));
    await page.route('**/api.open-meteo.com/**', (route) => {
      const url = new URL(route.request().url());
      const latitude = Number(url.searchParams.get('latitude'));
      const body = Math.abs(latitude - 48.8566) < 0.5 ? PARIS_FORECAST : WINDY_FORECAST;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route('**/air-quality-api.open-meteo.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AIR),
    }));
    await page.goto('/');
    await expect(page.getByTestId('alert-wind')).toBeVisible();
    await page.getByTestId('input-location-search').fill('paris');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');
    await expect(page.getByTestId('list-weather-alerts')).toHaveCount(0);
  });

  test('uses the selected location clock for alert timing', async ({ page }) => {
    await page.route('**/geocoding-api.open-meteo.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [TOKYO_RESULT] }),
    }));
    await page.route('**/api.open-meteo.com/**', (route) => {
      const url = new URL(route.request().url());
      const latitude = Number(url.searchParams.get('latitude'));
      const body = Math.abs(latitude - 35.6762) < 0.5 ? TOKYO_WINDY_FORECAST : WINDY_FORECAST;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route('**/air-quality-api.open-meteo.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AIR),
    }));
    await page.goto('/');
    await page.getByTestId('input-location-search').fill('tokyo');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Tokyo');
    await expect(page.getByTestId('alert-time-wind')).toHaveText(/9 PM–10 PM/);
  });

  test('alert layout is clean at 320px with no serious accessibility issues', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: WINDY_FORECAST });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByTestId('alert-wind')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const { AxeBuilder } = await import('@axe-core/playwright');
    await page.waitForTimeout(200);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious).toEqual([]);
  });
});

test.describe('multilingual interface', () => {
  test('switches English → French and updates the UI immediately', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('button-refresh-location')).toHaveText(/Use my location/);
    await page.getByTestId('select-language').selectOption('fr');
    await expect(page.getByTestId('button-refresh-location')).toHaveText(/Utiliser ma position/);
    await expect(page.getByTestId('input-location-search')).toHaveAttribute('placeholder', 'Rechercher un lieu');
    await expect(page.getByTestId('text-current-temperature')).toHaveText('20°C');
  });

  test('switches English → Spanish', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await page.getByTestId('select-language').selectOption('es');
    await expect(page.getByTestId('button-refresh-location')).toHaveText(/Usar mi ubicación/);
    await expect(page.getByTestId('text-current-temperature')).toHaveText('20°C');
  });

  test('reload preserves the selected language', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await page.getByTestId('select-language').selectOption('fr');
    await expect(page.getByTestId('button-refresh-location')).toHaveText(/Utiliser ma position/);
    await page.reload();
    await expect(page.getByTestId('select-language')).toHaveValue('fr');
    await expect(page.getByTestId('button-refresh-location')).toHaveText(/Utiliser ma position/);
  });

  test('weather stays on the same location after switching language', async ({ page }) => {
    await mockLocations(page);
    await page.goto('/');
    await page.getByTestId('input-location-search').fill('paris');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');
    await page.getByTestId('select-language').selectOption('es');
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');
    await expect(page.getByTestId('text-current-temperature')).toHaveText('12°C');
  });

  test('Tokyo keeps Tokyo local time after switching language', async ({ page }) => {
    await page.route('**/geocoding-api.open-meteo.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [TOKYO_RESULT] }),
    }));
    await page.route('**/api.open-meteo.com/**', (route) => {
      const url = new URL(route.request().url());
      const latitude = Number(url.searchParams.get('latitude'));
      const body = Math.abs(latitude - 35.6762) < 0.5 ? TOKYO_FORECAST : FORECAST;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route('**/air-quality-api.open-meteo.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AIR),
    }));
    await page.goto('/');
    await page.getByTestId('input-location-search').fill('tokyo');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Tokyo');
    const windowBefore = await page.getByTestId('text-uv-protection-window').innerText();
    await page.getByTestId('select-language').selectOption('fr');
    await expect(page.getByTestId('text-current-city')).toHaveText('Tokyo');
    // Same location clock: the protection window covers the same hours, only the wording changes.
    const windowAfter = await page.getByTestId('text-uv-protection-window').innerText();
    expect(windowAfter).not.toBe(windowBefore);
    expect(windowAfter).toMatch(/Protection solaire conseillée/);
  });

  test('Hear today speaks the localized briefing', async ({ page }) => {
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    await page.goto('/');
    await page.getByTestId('select-language').selectOption('fr');
    await page.getByTestId('button-hear-today').click();
    const spoken = await page.evaluate(() => (window as any).__speech.spoken);
    expect(spoken[0]).toContain('Il fait');
    expect(spoken[0]).toContain('London');
  });

  test('Ask Daymark accepts a French phrase', async ({ page }) => {
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    await page.goto('/');
    await page.getByTestId('select-language').selectOption('fr');
    await page.getByTestId('button-ask-daymark').click();
    await emitRecognitionResult(page, 'Va-t-il pleuvoir ?');
    await emitRecognitionEnd(page);
    await expect(page.getByTestId('ask-question')).toContainText('pleuvoir');
    await expect(page.getByTestId('ask-answer')).toContainText('pluie');
  });

  test('Ask Daymark accepts a Spanish phrase', async ({ page }) => {
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    await page.goto('/');
    await page.getByTestId('select-language').selectOption('es');
    await page.getByTestId('button-ask-daymark').click();
    await emitRecognitionResult(page, '¿Va a llover?');
    await emitRecognitionEnd(page);
    await expect(page.getByTestId('ask-answer')).toContainText('lluvia');
  });

  test('alert UI translates', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: WINDY_FORECAST });
    await page.goto('/');
    await expect(page.getByTestId('alert-wind')).toContainText('Strong winds expected');
    await page.getByTestId('select-language').selectOption('es');
    await expect(page.getByTestId('alert-wind')).toContainText('Se esperan vientos fuertes');
    await expect(page.getByTestId('alert-wind')).toContainText('no es un aviso oficial');
  });

  test('French layout stays clean at 320px', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');
    await page.getByTestId('select-language').selectOption('fr');
    await expect(page.getByTestId('button-refresh-location')).toHaveText(/Utiliser ma position/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('persisted storage', () => {
  test('stores only the language preference after switching language', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('select-language').selectOption('es');
    await expect(page.getByTestId('select-language')).toHaveValue('es');

    const state = await page.evaluate(() => ({
      keys: Object.keys(window.localStorage).sort(),
      locale: window.localStorage.getItem('daymark.locale'),
      sessionKeys: Object.keys(window.sessionStorage),
      cookie: document.cookie,
    }));
    expect(state.keys).toEqual(['daymark.locale']);
    expect(state.locale).toBe('es');
    expect(state.sessionKeys).toEqual([]);
    expect(state.cookie).toBe('');
  });

  test('does not persist location, search, transcript, weather or alert state', async ({ page }) => {
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await mockLocations(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    // Search + select a location.
    await page.getByTestId('input-location-search').fill('paris');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');

    // Voice interaction with a mocked transcript.
    await page.getByTestId('button-ask-daymark').click();
    await emitRecognitionResult(page, 'Will it rain later?');
    await emitRecognitionEnd(page);
    await expect(page.getByTestId('ask-answer')).toBeVisible();

    // Language was never changed, so no localStorage entries at all are valid.
    const state = await page.evaluate(() => ({
      keys: Object.keys(window.localStorage),
      dump: JSON.stringify(window.localStorage),
      sessionKeys: Object.keys(window.sessionStorage),
      cookie: document.cookie,
    }));
    expect(state.keys).toEqual([]);
    expect(state.sessionKeys).toEqual([]);
    expect(state.cookie).toBe('');
    for (const forbidden of ['Paris', '48.85', 'latitude', 'longitude', 'rain later', 'transcript', 'weather']) {
      expect(state.dump).not.toContain(forbidden);
    }
  });
});

test.describe('negative input / XSS', () => {
  test('renders malicious geocoding results as inert text', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__xss = 0;
      window.alert = () => {
        (window as any).__xss = 1;
      };
    });
    await mockOpenMeteo(page);
    await page.route('**/geocoding-api.open-meteo.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [
          {
            name: '<script>alert(1)</script>',
            latitude: 51.1,
            longitude: 0.1,
            admin1: '<img src=x onerror="window.__xss=1">',
            country: 'javascript:alert(1)',
          },
          { name: '<b>Paris</b>', latitude: 48.1, longitude: 2.1, admin1: 'data:text/html,<script>alert(1)</script>', country: 'France' },
        ],
      }),
    }));
    await page.goto('/');

    const input = page.getByTestId('input-location-search');
    await input.fill('xss');
    const first = page.getByTestId('location-option-0');
    await expect(first).toContainText('<script>alert(1)</script>');
    await expect(first).toContainText('<img src=x');

    await page.getByTestId('location-option-1').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('<b>Paris</b>');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    expect(await page.locator('img[src="x"]').count()).toBe(0);
    expect(await page.evaluate(() => Array.from(document.querySelectorAll('script'))
      .filter((script) => (script.textContent ?? '').includes('alert(1)')).length)).toBe(0);
    expect(await page.evaluate(() => (window as any).__xss)).toBe(0);
  });

  test('renders a malicious speech transcript as inert text', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__xss = 0;
      window.alert = () => {
        (window as any).__xss = 1;
      };
    });
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    await page.goto('/');

    await page.getByTestId('button-ask-daymark').click();
    await emitRecognitionResult(page, '<img src=x onerror="window.__xss=1">');
    await emitRecognitionEnd(page);

    // The displayed question is the normalized transcript (no markup characters).
    const question = page.getByTestId('ask-question');
    await expect(question).toContainText('img src x onerror');
    expect(await question.evaluate((element) => element.textContent ?? '')).not.toContain('<');
    await expect(page.getByTestId('ask-answer')).toContainText('I can help');
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    expect(await page.evaluate(() => (window as any).__xss)).toBe(0);
  });

  test('treats URL-like input as plain text with no navigation sink', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__xss = 0;
      window.alert = () => {
        (window as any).__xss = 1;
      };
    });
    await mockOpenMeteo(page);
    await page.goto('/');
    const startUrl = page.url();

    const input = page.getByTestId('input-location-search');
    for (const value of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'https://evil.example/<script>',
    ]) {
      await input.fill(value);
      await expect(input).toHaveValue(value);
    }

    expect(page.url()).toBe(startUrl);
    expect(await page.locator('a[href^="javascript:"]').count()).toBe(0);
    expect(await page.locator('a[href^="data:"]').count()).toBe(0);
    expect(await page.locator('img[src^="data:"]').count()).toBe(0);
    // Anchors are only the static app links (Open-Meteo attribution + Privacy);
    // no URL-like input became a link or navigation sink.
    const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map((anchor) => anchor.getAttribute('href')));
    expect(hrefs).toEqual(['https://open-meteo.com/', '/privacy']);
    expect(await page.evaluate(() => (window as any).__xss)).toBe(0);
  });
});

test.describe('hero action hierarchy', () => {
  test('keeps all four actions available with search first in reading order', async ({ page }) => {
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    await page.goto('/');

    await expect(page.getByTestId('input-location-search')).toBeVisible();
    await expect(page.getByTestId('button-refresh-location')).toBeVisible();
    await expect(page.getByTestId('button-hear-today')).toBeVisible();
    await expect(page.getByTestId('button-ask-daymark')).toBeVisible();

    const searchPrecedesSecondary = await page.evaluate(() => {
      const search = document.querySelector('[data-testid="input-location-search"]');
      const secondary = ['button-refresh-location', 'button-hear-today', 'button-ask-daymark']
        .map((id) => document.querySelector(`[data-testid="${id}"]`));
      if (!search || secondary.some((node) => !node)) return false;
      return secondary.every((node) => (search.compareDocumentPosition(node!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
    });
    expect(searchPrecedesSecondary).toBe(true);
  });

  test('keeps every hero control visible and unclipped at 320px', async ({ page }) => {
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const id of ['input-location-search', 'button-refresh-location', 'button-hear-today', 'button-ask-daymark']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await expect(page.getByTestId('ask-privacy')).toBeVisible();
  });

  test('keeps localized hero labels visible in French and Spanish', async ({ page }) => {
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    await page.goto('/');

    await page.getByTestId('select-language').selectOption('fr');
    await expect(page.getByTestId('button-refresh-location')).toHaveText(/Utiliser ma position/);
    await expect(page.getByTestId('button-hear-today')).toContainText(/Écouter/);
    await expect(page.getByTestId('button-ask-daymark')).toContainText(/Demander à Daymark/);

    await page.getByTestId('select-language').selectOption('es');
    await expect(page.getByTestId('button-refresh-location')).toHaveText(/Usar mi ubicación/);
    await expect(page.getByTestId('button-hear-today')).toContainText(/Escuchar/);
    await expect(page.getByTestId('button-ask-daymark')).toContainText(/Preguntar a Daymark/);
  });
});

test.describe('useful bits', () => {
  const forecastWithWind = {
    ...FORECAST,
    current: { ...FORECAST.current, wind_speed_10m: 14, wind_gusts_10m: 22 },
  };

  test('keeps unique secondary details and drops duplicated hero facts', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: forecastWithWind });
    await page.goto('/');

    const panel = page.getByTestId('panel-weather-details');
    await expect(panel).toBeVisible();

    // Retained: humidity + dew point, wind, sunrise/sunset.
    await expect(page.getByTestId('detail-humidity')).toContainText('62%');
    await expect(page.getByTestId('detail-dew-point')).toBeVisible();
    await expect(page.getByTestId('detail-wind')).toContainText('14 km/h');
    await expect(page.getByTestId('detail-wind')).toContainText('Gusts 22 km/h');
    await expect(page.getByTestId('detail-sunrise')).toBeVisible();
    await expect(page.getByTestId('detail-sunset')).toBeVisible();

    // Removed: facts already shown in the hero, advice cards or forecast.
    await expect(page.getByTestId('detail-feels-like')).toHaveCount(0);
    await expect(page.getByTestId('detail-rain-now')).toHaveCount(0);
    await expect(page.getByTestId('detail-day-ahead')).toHaveCount(0);
  });

  test('renders without a wind gust value when gusts are absent', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: { ...FORECAST, current: { ...FORECAST.current, wind_speed_10m: 9 } } });
    await page.goto('/');
    await expect(page.getByTestId('detail-wind')).toContainText('9 km/h');
    await expect(page.getByTestId('detail-wind')).toContainText('sustained speed');
    await expect(page.getByTestId('detail-wind')).not.toContainText('Gusts');
  });

  test('stays localized and overflow-free at 320px', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: forecastWithWind });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');

    const panel = page.getByTestId('panel-weather-details');
    await page.getByTestId('select-language').selectOption('fr');
    await expect(panel).toContainText('Humidité');
    await expect(panel).toContainText('Vent');
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByTestId('select-language').selectOption('es');
    await expect(panel).toContainText('Humedad');
    await expect(panel).toContainText('Viento');
    overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('UV simplification', () => {
  test('shows one current value, the window text, timeline and future hourly UV', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');

    const panel = page.getByTestId('panel-uv-forecast');
    await expect(panel).toBeVisible();

    // A. Current UV appears once as the primary value.
    await expect(page.getByTestId('text-current-uv')).toHaveCount(1);
    await expect(page.getByTestId('text-current-uv')).toHaveText('2.5');

    // B. Protection window remains as text.
    await expect(page.getByTestId('text-uv-protection-window')).toContainText('Sun protection recommended');
    await expect(page.getByTestId('text-uv-protection-window')).toContainText('1 PM');

    // C. Timeline remains the single visual representation.
    await expect(page.getByTestId('uv-protection-timeline')).toBeVisible();

    // D/F. Future hourly progression remains, without a duplicate "Now" chip.
    await expect(page.getByTestId('list-hourly-uv')).toBeVisible();
    await expect(page.getByTestId('list-hourly-uv')).toContainText('1 PM');
    await expect(page.getByTestId('list-hourly-uv')).not.toContainText('Now');
    await expect(panel).not.toContainText('Now');

    // E. Compact 3-day outlook retained.
    await expect(page.getByTestId('list-daily-uv').locator('.uv-day')).toHaveCount(3);
  });

  test('handles no-window and unavailable states', async ({ page }) => {
    const noWindow = {
      ...FORECAST,
      current: { ...FORECAST.current, uv_index: 1 },
      hourly: { ...FORECAST.hourly, uv_index: FORECAST.hourly.time.map(() => 1) },
    };
    await mockOpenMeteo(page, { forecast: noWindow });
    await page.goto('/');
    await expect(page.getByTestId('text-uv-protection-window')).toContainText('No sun protection window expected today');

    const noUvData = {
      ...FORECAST,
      hourly: {
        time: FORECAST.hourly.time,
        temperature_2m: FORECAST.hourly.temperature_2m,
        precipitation_probability: FORECAST.hourly.precipitation_probability,
        weather_code: FORECAST.hourly.weather_code,
      },
    };
    await mockOpenMeteo(page, { forecast: noUvData });
    await page.reload();
    await expect(page.getByTestId('text-uv-protection-window')).toContainText('Sun protection window unavailable right now');
  });

  test('stays localized and overflow-free at 320px', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');

    await page.getByTestId('select-language').selectOption('fr');
    await expect(page.getByTestId('text-uv-protection-window')).toContainText('Protection solaire conseillée');
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByTestId('select-language').selectOption('es');
    await expect(page.getByTestId('text-uv-protection-window')).toContainText('Protección solar recomendada');
    overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('mobile touch targets and legibility', () => {
  async function expectMinHeight(page: Page, selector: string, min: number) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box, `${selector} should be rendered`).not.toBeNull();
    // Allow sub-pixel rendering tolerance; this is a threshold, not a snapshot.
    expect(box!.height, `${selector} height`).toBeGreaterThanOrEqual(min - 0.5);
  }

  test('key mobile controls meet the ~40px target at 390px and 320px', async ({ page }) => {
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      for (const selector of [
        '[data-testid="select-language"]',
        '.icon-button',
        '.location-search-field',
        '[data-testid="button-refresh-location"]',
        '[data-testid="button-hear-today"]',
        '[data-testid="button-ask-daymark"]',
      ]) {
        await expectMinHeight(page, selector, 40);
      }
      const locate = await page.locator('.icon-button').first().boundingBox();
      expect(locate!.width, 'locate control width').toBeGreaterThanOrEqual(39.5);
      const celsius = await page.locator('[data-testid="button-unit-celsius"]').boundingBox();
      expect(celsius!.height, 'unit button height').toBeGreaterThanOrEqual(39.5);
    }
  });

  test('alert disclaimer, severity and voice privacy note are at least 11px', async ({ page }) => {
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page, { forecast: WINDY_FORECAST });
    await page.goto('/');

    const alertMeta = page.locator('.alert-meta').first();
    await expect(alertMeta).toBeVisible();
    await expect(alertMeta).toContainText('not an official warning');
    const alertMetaSize = await alertMeta.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(alertMetaSize, 'alert disclaimer font size').toBeGreaterThanOrEqual(11);

    const severitySize = await page.locator('.alert-severity').first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(severitySize, 'alert severity font size').toBeGreaterThanOrEqual(11);

    const privacySize = await page.getByTestId('ask-privacy').evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(privacySize, 'voice privacy note font size').toBeGreaterThanOrEqual(11);
  });

  test('search options are tappable and remain keyboard-selectable', async ({ page }) => {
    await mockLocations(page);
    await page.goto('/');
    const input = page.getByTestId('input-location-search');
    await input.fill('tokyo');
    const option = page.getByTestId('location-option-0');
    await expect(option).toBeVisible();
    const box = await option.boundingBox();
    expect(box!.height, 'location option height').toBeGreaterThanOrEqual(39.5);

    await input.press('ArrowDown');
    await input.press('Enter');
    await expect(page.getByTestId('text-current-city')).toHaveText('Tokyo');
  });

  test('EN, FR and ES stay overflow-free at 320px', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: WINDY_FORECAST });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');
    for (const locale of ['en', 'fr', 'es']) {
      await page.getByTestId('select-language').selectOption(locale);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `overflow for ${locale}`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('regional comparison', () => {
  test('shows a plain-language comparison for UK locations', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');

    const panel = page.getByTestId('panel-micro-climate');
    await expect(panel).toBeVisible();
    await expect(page.locator('#micro-title')).toHaveText('Regional comparison');
    await expect(page.getByTestId('micro-row-temperature')).toBeVisible();
    await expect(page.getByTestId('micro-row-rainfall')).toBeVisible();
    await expect(panel).toContainText('Forecast');
    await expect(panel).toContainText('Model');

    // Legacy / overclaiming copy must be gone.
    await expect(panel).not.toContainText('Your Micro-Climate');
    await expect(panel).not.toContainText('LOCAL VARIANCE CHECK');
    await expect(panel).not.toContainText('No nearby sensor');
    await expect(panel).not.toContainText('Regional only');
  });

  test('hides outside the UK and never requests the UKV model there', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).hostname === 'api.open-meteo.com') requested.push(request.url());
    });
    await mockLocations(page);
    await page.goto('/');
    await expect(page.getByTestId('panel-micro-climate')).toBeVisible();
    // Wait for the comparison itself so the London UKV request is certainly
    // already issued before we start watching for out-of-region requests.
    await expect(page.getByTestId('micro-row-temperature')).toBeVisible();

    requested.length = 0;
    await page.getByTestId('input-location-search').fill('paris');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');
    await expect(page.getByTestId('panel-micro-climate')).toHaveCount(0);
    expect(requested.some((url) => url.includes('ukmo_seamless')), 'UKV request outside the UK').toBe(false);
  });

  test('renders no placeholder rows when model values are missing', async ({ page }) => {
    await page.route('**/api.open-meteo.com/**', (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('models') === 'ukmo_seamless') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ latitude: 51.51, longitude: -0.13, current: {} }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FORECAST) });
    });
    await page.route('**/air-quality-api.open-meteo.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AIR),
    }));
    await page.goto('/');
    await expect(page.getByTestId('panel-micro-climate')).toHaveCount(0);
  });

  test('localizes the section title', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await page.getByTestId('select-language').selectOption('fr');
    await expect(page.locator('#micro-title')).toHaveText('Comparaison régionale');
    await page.getByTestId('select-language').selectOption('es');
    await expect(page.locator('#micro-title')).toHaveText('Comparación regional');
  });
});

test.describe('weather loading', () => {
  test('a later location selection wins over an earlier one', async ({ page }) => {
    await mockLocations(page);
    await page.goto('/');

    await page.getByTestId('input-location-search').fill('paris');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');
    await expect(page.getByTestId('text-current-temperature')).toHaveText('12°C');

    await page.getByTestId('input-location-search').fill('tokyo');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Tokyo');
    await expect(page.getByTestId('text-current-temperature')).toHaveText('26°C');
  });
});

test.describe('privacy policy page', () => {
  const policies = [
    { lang: 'en', path: '/privacy', heading: 'Privacy Policy', effective: 'Effective date', back: 'Back to weather' },
    { lang: 'fr', path: '/fr/privacy', heading: 'Politique de confidentialité', effective: 'Date d’entrée en vigueur', back: 'Retour à la météo' },
    { lang: 'es', path: '/es/privacy', heading: 'Política de privacidad', effective: 'Fecha de entrada en vigor', back: 'Volver al tiempo' },
  ] as const;

  for (const policy of policies) {
    test(`direct ${policy.path} route loads the ${policy.lang} policy`, async ({ page }) => {
      await page.goto(policy.path);
      await expect(page.getByTestId('page-privacy')).toBeVisible();
      await expect(page.getByTestId('page-privacy')).toHaveAttribute('data-lang', policy.lang);
      await expect(page.getByRole('heading', { level: 1, name: policy.heading })).toBeVisible();
      await expect(page.getByTestId('text-privacy-effective')).toContainText(policy.effective);
      await expect(page.getByTestId('link-back-home')).toContainText(policy.back);
      await expect(page.getByTestId(`link-privacy-lang-${policy.lang}`)).toHaveAttribute('aria-current', 'page');
    });
  }

  test('does not call weather APIs or persist anything', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));
    await page.goto('/privacy');
    await expect(page.getByTestId('page-privacy')).toBeVisible();
    expect(requested.filter((url) => url.includes('open-meteo'))).toEqual([]);
    const state = await page.evaluate(() => ({
      local: Object.keys(window.localStorage),
      session: Object.keys(window.sessionStorage),
      cookies: document.cookie,
    }));
    expect(state).toEqual({ local: [], session: [], cookies: '' });
  });

  test('footer Privacy link follows the interface language', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('link-privacy')).toHaveAttribute('href', '/privacy');
    await page.getByTestId('select-language').selectOption('fr');
    await expect(page.getByTestId('link-privacy')).toHaveText('Confidentialité');
    await expect(page.getByTestId('link-privacy')).toHaveAttribute('href', '/fr/privacy');
    await page.getByTestId('link-privacy').click();
    await expect(page).toHaveURL(/\/fr\/privacy$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Politique de confidentialité' })).toBeVisible();
    await page.getByTestId('link-back-home').click();
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    await page.getByTestId('select-language').selectOption('es');
    await expect(page.getByTestId('link-privacy')).toHaveText('Privacidad');
    await expect(page.getByTestId('link-privacy')).toHaveAttribute('href', '/es/privacy');
  });

  test('language switcher navigates between concrete policy URLs and is keyboard accessible', async ({ page }) => {
    await page.goto('/privacy');
    await page.getByTestId('link-privacy-lang-fr').focus();
    await expect(page.getByTestId('link-privacy-lang-fr')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/fr\/privacy$/);
    await expect(page.getByTestId('page-privacy')).toHaveAttribute('data-lang', 'fr');
    await page.getByTestId('link-privacy-lang-es').click();
    await expect(page).toHaveURL(/\/es\/privacy$/);
    await expect(page.getByTestId('page-privacy')).toHaveAttribute('data-lang', 'es');
    await page.getByTestId('link-privacy-lang-en').click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByTestId('page-privacy')).toHaveAttribute('data-lang', 'en');
  });

  test('shows the confirmed operator and contact details in every language', async ({ page }) => {
    for (const policy of policies) {
      await page.goto(policy.path);
      const text = await page.getByTestId('page-privacy').innerText();
      expect(text).toContain('Sami Belhadj');
      expect(text).toContain('skylinelabdev@gmail.com');
    }
  });

  test('contains no placeholders or draft markers', async ({ page }) => {
    for (const policy of policies) {
      await page.goto(policy.path);
      const text = await page.getByTestId('page-privacy').innerText();
      for (const forbidden of ['[OPERATOR NAME]', '[CONTACT EMAIL]', 'DECISION REQUIRED', 'Draft notice', 'placeholder']) {
        expect(text).not.toContain(forbidden);
      }
    }
  });

  test('states the verified data practices in every language', async ({ page }) => {
    const expectations = {
      en: {
        location: 'rounded to two decimal places',
        speech: 'does not record or store your voice audio or speech transcripts',
        audience: 'general-audience weather utility',
      },
      fr: {
        location: 'arrondies à deux décimales',
        speech: 'n’enregistre ni ne conserve votre audio vocal ni vos transcriptions vocales',
        audience: 'grand public',
      },
      es: {
        location: 'se redondean a dos decimales',
        speech: 'no graba ni almacena tu audio de voz ni tus transcripciones',
        audience: 'público general',
      },
    } as const;
    for (const policy of policies) {
      await page.goto(policy.path);
      const text = await page.getByTestId('page-privacy').innerText();
      for (const host of ['api.open-meteo.com', 'air-quality-api.open-meteo.com', 'geocoding-api.open-meteo.com']) {
        expect(text).toContain(host);
      }
      expect(text).toContain('Open-Meteo');
      expect(text).toContain('daymark.locale');
      expect(text).toContain(expectations[policy.lang].location);
      expect(text).toContain(expectations[policy.lang].speech);
      expect(text).toContain(expectations[policy.lang].audience);
      expect(text).not.toMatch(/collects? no data/i);
    }
  });

  for (const policy of policies) {
    for (const width of [320, 390]) {
      test(`${policy.lang} policy has no horizontal overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(policy.path);
        await expect(page.getByTestId('page-privacy')).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
});

test.describe('geolocation flow', () => {
  const GREENWICH = {
    results: [{ name: 'Greenwich', latitude: 51.4789, longitude: 0.0107, country: 'United Kingdom', country_code: 'GB', timezone: 'Europe/London' }],
  };
  const PARIS = {
    results: [{ name: 'Paris', latitude: 48.8566, longitude: 2.3522, admin1: 'Île-de-France', country: 'France', country_code: 'FR', timezone: 'Europe/Paris' }],
  };

  /** Geolocation whose success/error callbacks only fire when the test says so. */
  async function stubDeferredGeolocation(page: Page) {
    await page.addInitScript(() => {
      (window as any).__geo = { calls: 0, pending: [] };
      navigator.geolocation.getCurrentPosition = ((success: PositionCallback, error: PositionErrorCallback) => {
        (window as any).__geo.calls += 1;
        (window as any).__geo.pending.push({ success, error });
      }) as typeof navigator.geolocation.getCurrentPosition;
    });
  }

  async function resolveGeolocation(page: Page, latitude: number, longitude: number) {
    await page.evaluate(([lat, lon]) => {
      const pending = (window as any).__geo.pending.splice(0);
      for (const entry of pending) entry.success({ coords: { latitude: lat, longitude: lon } });
    }, [latitude, longitude]);
  }

  async function failGeolocation(page: Page, code: number) {
    await page.evaluate((errorCode) => {
      const pending = (window as any).__geo.pending.splice(0);
      for (const entry of pending) entry.error({ code: errorCode, message: 'stub' });
    }, code);
  }

  /** Emulates a browser fix "taken" at simulatedDelayMs, honoring the app's own timeout option. */
  async function stubTimedGeolocation(page: Page, simulatedDelayMs: number) {
    await page.addInitScript((delay) => {
      (window as any).__geo = { calls: 0, options: null };
      navigator.geolocation.getCurrentPosition = ((success: PositionCallback, error: PositionErrorCallback, options?: PositionOptions) => {
        (window as any).__geo.calls += 1;
        (window as any).__geo.options = options;
        window.setTimeout(() => {
          if (options && delay > (options.timeout ?? 0)) error({ code: 3, message: 'simulated timeout' } as GeolocationPositionError);
          else success({ coords: { latitude: 51.5074567, longitude: -0.12789012 } } as GeolocationPosition);
        }, 10);
      }) as typeof navigator.geolocation.getCurrentPosition;
    }, simulatedDelayMs);
  }

  /** Reverse geocoding returns a place; forward (search) returns another. */
  async function routeGeocoding(page: Page, reverseBody: object, searchBody: object) {
    await page.route('**/geocoding-api.open-meteo.com/**', (route) => {
      const body = route.request().url().includes('count=1') ? reverseBody : searchBody;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
  }

  test('a search made while geolocation is pending is not overwritten by the older location result', async ({ page }) => {
    await mockOpenMeteo(page);
    await routeGeocoding(page, GREENWICH, PARIS);
    await stubDeferredGeolocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await expect(page.getByTestId('button-refresh-location')).toHaveText('Finding you…');
    await page.getByTestId('input-location-search').fill('paris');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');

    // The older location request resolves after the newer search selection.
    await resolveGeolocation(page, 51.5074567, -0.12789012);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');
    await expect(page.getByTestId('button-refresh-location')).toHaveText('Use my location');
    expect(await page.evaluate(() => (window as any).__geo.calls)).toBe(1);
  });

  test('geolocation wins when it is the most recent action', async ({ page }) => {
    await mockOpenMeteo(page);
    await routeGeocoding(page, GREENWICH, PARIS);
    await stubDeferredGeolocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('input-location-search').fill('paris');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');

    await page.getByTestId('button-refresh-location').click();
    await resolveGeolocation(page, 51.5074567, -0.12789012);
    await expect(page.getByTestId('text-current-city')).toHaveText('Greenwich');
  });

  test('rapid double-click settles cleanly without duplicate final-state corruption', async ({ page }) => {
    await mockOpenMeteo(page);
    await routeGeocoding(page, GREENWICH, PARIS);
    await stubDeferredGeolocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    let mainForecastRequests = 0;
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname === 'api.open-meteo.com' && !request.url().includes('ukmo')) mainForecastRequests += 1;
    });

    await page.getByTestId('button-refresh-location').click();
    await page.getByTestId('button-refresh-location').click();
    expect(await page.evaluate(() => (window as any).__geo.calls)).toBe(2);
    await resolveGeolocation(page, 51.5074567, -0.12789012);
    await expect(page.getByTestId('text-current-city')).toHaveText('Greenwich');
    await expect(page.getByTestId('button-refresh-location')).toHaveText('Use my location');
    // One weather load for the winning click, not one per click.
    expect(mainForecastRequests).toBe(1);
  });

  test('reports a geolocation timeout as a timeout, not a permission denial', async ({ page }) => {
    await mockOpenMeteo(page);
    await stubDeferredGeolocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await failGeolocation(page, 3);
    await expect(page.getByTestId('toast')).toContainText('took too long');
    await expect(page.getByTestId('toast')).not.toContainText('Allow location access');
    await expect(page.getByTestId('button-refresh-location')).toHaveText('Use my location');
  });

  test('reports position-unavailable distinctly from permission denial', async ({ page }) => {
    await mockOpenMeteo(page);
    await stubDeferredGeolocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await failGeolocation(page, 2);
    await expect(page.getByTestId('toast')).toContainText('determine your location');
    await expect(page.getByTestId('toast')).not.toContainText('Allow location access');
  });

  test('keeps the existing permission-denied message for code 1', async ({ page }) => {
    await mockOpenMeteo(page);
    await stubDeferredGeolocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await failGeolocation(page, 1);
    await expect(page.getByTestId('toast')).toContainText('Allow location access');
  });

  test('requests mobile-friendly geolocation options', async ({ page }) => {
    await mockOpenMeteo(page);
    await stubTimedGeolocation(page, 0);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    const options = await page.evaluate(() => (window as any).__geo.options);
    expect(options.enableHighAccuracy, 'high accuracy off for a rounded purpose').toBe(false);
    expect(options.maximumAge, 'recent cached fixes allowed').toBeGreaterThanOrEqual(60000);
    expect(options.timeout, 'room for a cold mobile GPS fix').toBeGreaterThanOrEqual(10000);
    expect(options.timeout, 'not an indefinite wait').toBeLessThanOrEqual(15000);
  });

  test('a simulated 10-second cold GPS fix resolves within the configured timeout', async ({ page }) => {
    await mockOpenMeteo(page);
    await routeGeocoding(page, GREENWICH, PARIS);
    await stubTimedGeolocation(page, 10000);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Greenwich');
    await expect(page.getByTestId('button-refresh-location')).toHaveText('Use my location');
  });

  test('a fix slower than the configured timeout reports a timeout and clears loading', async ({ page }) => {
    await mockOpenMeteo(page);
    await stubTimedGeolocation(page, 60000);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await expect(page.getByTestId('toast')).toContainText('took too long');
    await expect(page.getByTestId('button-refresh-location')).toHaveText('Use my location');
    await expect(page.getByTestId('text-current-city')).toHaveText('London');
  });

  test('the topbar crosshair uses the same location flow', async ({ page }) => {
    await mockOpenMeteo(page);
    await routeGeocoding(page, GREENWICH, PARIS);
    await stubDeferredGeolocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-use-location').click();
    await expect(page.getByTestId('button-refresh-location')).toHaveText('Finding you…');
    await resolveGeolocation(page, 51.5074567, -0.12789012);
    await expect(page.getByTestId('text-current-city')).toHaveText('Greenwich');
    await expect(page.getByTestId('button-refresh-location')).toHaveText('Use my location');
  });

  test('loads weather with the fallback label when reverse geocoding fails', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.route('**/geocoding-api.open-meteo.com/**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":true}' }),
    );
    await stubDeferredGeolocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await resolveGeolocation(page, 51.5074567, -0.12789012);
    await expect(page.getByTestId('text-current-city')).toHaveText('Your location');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    await expect(page.getByTestId('button-refresh-location')).toHaveText('Use my location');
  });

  test('loading clears after denied, unavailable and timeout errors', async ({ page }) => {
    await mockOpenMeteo(page);
    await stubDeferredGeolocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    for (const code of [1, 2, 3]) {
      await page.getByTestId('button-refresh-location').click();
      await expect(page.getByTestId('button-refresh-location')).toHaveText('Finding you…');
      await failGeolocation(page, code);
      await expect(page.getByTestId('toast')).toBeVisible();
      await expect(page.getByTestId('button-refresh-location')).toHaveText('Use my location');
    }
  });
});

test.describe('mobile layout', () => {
  test('header controls stay fully inside the viewport on narrow phones', async ({ page }) => {
    await mockOpenMeteo(page);
    for (const width of [320, 360, 390, 412]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await expect(page.getByTestId('text-current-temperature')).toBeVisible();
      for (const selector of ['.locale-select', '.unit-switch', '.icon-button']) {
        const box = await page.locator(selector).boundingBox();
        expect(box, `${selector} at ${width}px`).not.toBeNull();
        expect(box!.x, `${selector} left edge at ${width}px`).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width, `${selector} right edge at ${width}px`).toBeLessThanOrEqual(width + 0.5);
      }
    }
  });

  test('content keeps a comfortable inset and the search input avoids iOS zoom', async ({ page }) => {
    await mockOpenMeteo(page);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await expect(page.getByTestId('text-current-temperature')).toBeVisible();
      for (const selector of ['.place-title', '.location-search-field', '.forecast-panel', '.uv-panel']) {
        const box = await page.locator(selector).first().boundingBox();
        expect(box, `${selector} at ${width}px`).not.toBeNull();
        expect(box!.x, `${selector} left inset at ${width}px`).toBeGreaterThanOrEqual(16);
        expect(box!.x + box!.width, `${selector} right inset at ${width}px`).toBeLessThanOrEqual(width - 16 + 0.5);
      }
      const inputSize = await page.getByTestId('input-location-search').evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
      expect(inputSize, `search input size at ${width}px`).toBeGreaterThanOrEqual(16);
    }
  });

  test('hero temperature scales with narrow phones instead of overflowing its block', async ({ page }) => {
    await mockOpenMeteo(page);
    const sizes: number[] = [];
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await expect(page.getByTestId('text-current-temperature')).toBeVisible();
      const size = await page.locator('.current-temp').evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
      sizes.push(size);
      const box = await page.locator('.current-temp').boundingBox();
      expect(box!.x + box!.width, `temperature within viewport at ${width}px`).toBeLessThanOrEqual(width + 0.5);
    }
    expect(sizes[0], 'temperature at 320px').toBeLessThanOrEqual(96);
    expect(sizes[0]).toBeLessThanOrEqual(sizes[1]);
    expect(sizes[1]).toBeLessThanOrEqual(sizes[2]);
  });

  test('hero actions meet 44px and never clip their labels in EN/FR/ES', async ({ page }) => {
    await stubSpeechRecognition(page);
    await stubSpeechPlayback(page);
    await mockOpenMeteo(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');
    await expect(page.getByTestId('text-current-city')).toBeVisible();
    for (const locale of ['en', 'fr', 'es']) {
      await page.getByTestId('select-language').selectOption(locale);
      const buttons = page.locator('.hero-actions .local-button');
      const count = await buttons.count();
      expect(count, `${locale} action count`).toBeGreaterThanOrEqual(3);
      for (let index = 0; index < count; index += 1) {
        const button = buttons.nth(index);
        const box = await button.boundingBox();
        expect(box!.height, `${locale} button ${index} height`).toBeGreaterThanOrEqual(43.5);
        const labelFits = await button.evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
        expect(labelFits, `${locale} button ${index} label clipping`).toBe(true);
      }
    }
  });

  test('privacy pages keep header, text and language switcher inside 320px', async ({ page }) => {
    for (const path of ['/privacy', '/fr/privacy', '/es/privacy']) {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(path);
      await expect(page.getByTestId('page-privacy')).toBeVisible();
      const back = await page.getByTestId('link-back-home').boundingBox();
      expect(back!.x + back!.width, `${path} back link right edge`).toBeLessThanOrEqual(320.5);
      const paragraph = await page.locator('.privacy-policy p').first().boundingBox();
      expect(paragraph!.x, `${path} paragraph inset`).toBeGreaterThanOrEqual(16);
      const chip = await page.getByTestId('link-privacy-lang-es').boundingBox();
      expect(chip!.x + chip!.width, `${path} language chip right edge`).toBeLessThanOrEqual(320.5);
    }
  });

  test('search results panel aligns with the field and stays in view', async ({ page }) => {
    await mockLocations(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');
    await page.getByTestId('input-location-search').fill('tokyo');
    await expect(page.getByTestId('location-option-0')).toBeVisible();
    const field = await page.locator('.location-search-field').boundingBox();
    const panel = await page.getByTestId('location-results').boundingBox();
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(Math.abs(panel!.x - field!.x), 'panel left alignment').toBeLessThanOrEqual(1);
    expect(Math.abs(panel!.width - field!.width), 'panel width alignment').toBeLessThanOrEqual(1);
    expect(panel!.x, 'panel left inset').toBeGreaterThanOrEqual(15.5);
    expect(panel!.x + panel!.width, 'panel right inset').toBeLessThanOrEqual(viewportWidth - 16 + 0.5);
  });
});
