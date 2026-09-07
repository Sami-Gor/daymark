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
    expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin');
    await mockOpenMeteo(page);
    await page.reload();
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    expect(cspErrors).toEqual([]);
  });
});
