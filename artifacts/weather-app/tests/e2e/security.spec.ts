import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { expectWeatherReady, mockOpenMeteo } from './helpers';
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
    await expectWeatherReady(page);
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
