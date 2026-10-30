import { expect, test } from '@playwright/test';
import { mockOpenMeteo } from './helpers';
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
