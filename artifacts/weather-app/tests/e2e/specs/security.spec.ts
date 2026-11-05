import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '../support/fixtures';

/*
 * Security surface: the header set served by the preview server, the shipped
 * `_headers` file, and hostile input rendered inert rather than executed.
 */

test.describe('security headers (preview server)', () => {
  test('serves the full security-header set and the app runs without CSP errors', async ({ browserLog, dashboard, page }) => {
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

    await expect(dashboard.currentTemperature).toBeVisible();
    expect(browserLog.cspErrors()).toEqual([]);
  });
});

test.describe('security headers in build output', () => {
  // tests/e2e/specs -> tests/e2e -> tests -> artifacts/weather-app
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

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

test.describe('hostile input is rendered inert (XSS)', () => {
  test('renders malicious geocoding results as inert text', async ({ api, dashboard, page, search }) => {
    await page.addInitScript(() => {
      (window as unknown as { __xss: number }).__xss = 0;
      window.alert = () => {
        (window as unknown as { __xss: number }).__xss = 1;
      };
    });
    await api.geocoding({
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
    });
    await page.goto('/');

    await search.search('xss');
    await expect(search.option(0)).toContainText('<script>alert(1)</script>');
    await expect(search.option(0)).toContainText('<img src=x');

    await search.selectOption(1);
    await dashboard.expectCity('<b>Paris</b>');
    await expect(dashboard.currentTemperature).toBeVisible();

    expect(await page.locator('img[src="x"]').count()).toBe(0);
    expect(await page.evaluate(() => Array.from(document.querySelectorAll('script'))
      .filter((script) => (script.textContent ?? '').includes('alert(1)')).length)).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __xss: number }).__xss)).toBe(0);
  });

  test('renders a malicious speech transcript as inert text', async ({ page, speech, voice }) => {
    await page.addInitScript(() => {
      (window as unknown as { __xss: number }).__xss = 0;
      window.alert = () => {
        (window as unknown as { __xss: number }).__xss = 1;
      };
    });
    await page.goto('/');

    await voice.toggleListening();
    await speech.emitResult('<img src=x onerror="window.__xss=1">');
    await speech.emitRecognitionEnd();

    // The displayed question is the normalized transcript (no markup characters).
    await expect(voice.askQuestion).toContainText('img src x onerror');
    expect(await voice.askQuestion.evaluate((element) => element.textContent ?? '')).not.toContain('<');
    await expect(voice.askAnswer).toContainText('I can help');
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __xss: number }).__xss)).toBe(0);
  });

  test('treats URL-like input as plain text with no navigation sink', async ({ page, search }) => {
    await page.addInitScript(() => {
      (window as unknown as { __xss: number }).__xss = 0;
      window.alert = () => {
        (window as unknown as { __xss: number }).__xss = 1;
      };
    });
    await page.goto('/');
    const startUrl = page.url();

    for (const value of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'https://evil.example/<script>',
    ]) {
      await search.search(value);
      await expect(search.input).toHaveValue(value);
    }

    expect(page.url()).toBe(startUrl);
    expect(await page.locator('a[href^="javascript:"]').count()).toBe(0);
    expect(await page.locator('a[href^="data:"]').count()).toBe(0);
    expect(await page.locator('img[src^="data:"]').count()).toBe(0);
    // Anchors are only the static app links (Open-Meteo attribution + Privacy);
    // no URL-like input became a link or navigation sink.
    const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map((anchor) => anchor.getAttribute('href')));
    expect(hrefs).toEqual(['https://open-meteo.com/', '/privacy']);
    expect(await page.evaluate(() => (window as unknown as { __xss: number }).__xss)).toBe(0);
  });
});
