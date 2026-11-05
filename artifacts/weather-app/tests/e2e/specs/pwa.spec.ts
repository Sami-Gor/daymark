import { expect, test } from '../support/fixtures';

/*
 * Production service-worker lifecycle: registration scope, shell precache,
 * manifest metadata and offline shell serving.
 *
 * The service worker's root scope is built from the runtime origin so the suite
 * follows the configurable E2E_PORT instead of hard-coding localhost:5177. The
 * canonical mocks come from the automatic `api` fixture; the shared navigation
 * lives in a beforeEach.
 */

test.describe('PWA service-worker lifecycle (production build)', () => {
  test.beforeEach(async ({ dashboard }) => {
    await dashboard.open();
  });

  test('registers with root scope, caches the shell, and serves it offline', async ({ page }) => {
    await expect.poll(async () =>
      page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return reg?.active ? 'active' : (reg ? 'installing' : 'none');
      }),
    ).toBe('active');

    const sw = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const entries: string[] = [];
      for (const key of await caches.keys()) {
        for (const r of await (await caches.open(key)).keys()) entries.push(new URL(r.url).pathname);
      }
      return { scope: reg?.scope, entries };
    });
    const origin = new URL('/', page.url()).origin;
    expect(sw.scope).toBe(`${origin}/`);
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
