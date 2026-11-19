import { expect, test, type Page } from '../support/fixtures';
import { PARIS_SEARCH } from '../support/test-data';

/*
 * Non-destructive weather refresh: once the dashboard has data, a location
 * change keeps the existing UI mounted (no full-page skeleton), preserves
 * scroll position and node identity, and surfaces refresh failures without
 * destroying the previous weather.
 *
 * `geo` provides the deferred fix; `api.delayForecast` adds latency to the
 * follow-up forecast so the in-place refresh state is observable.
 */

/*
 * Dispatch the click from inside the page: Playwright's locator.click() scrolls
 * the target into view first, which would invalidate the scroll-position
 * assertions below. Used only where a test asserts scroll stability.
 */
async function domClick(page: Page, testId: string): Promise<void> {
  await page.evaluate((id) => (document.querySelector(`[data-testid="${id}"]`) as HTMLElement).click(), testId);
}

test.describe('non-destructive weather refresh', () => {
  test('initial load still shows the full-page skeleton before first data', async ({ api, dashboard }) => {
    await api.delayForecast(1200);
    await dashboard.goto('/');
    await expect(dashboard.loadingLayout).toBeVisible();
    await dashboard.expectTemperature('20°C');
    await expect(dashboard.loadingLayout).toHaveCount(0);
  });

  test('location update keeps the existing UI mounted (no full-page skeleton)', async ({ api, dashboard, geo, sections }) => {
    await geo.defer();
    await dashboard.goto('/');
    await dashboard.expectCity('London');
    await api.delayForecast(1500);

    await dashboard.requestDeviceLocation();
    await geo.resolve(51.5074567, -0.12789012);
    await expect(dashboard.refreshIndicator).toBeVisible();
    await expect(dashboard.loadingLayout).toHaveCount(0);
    await expect(sections.hourlyForecast).toBeVisible();
    // Previous content stays visible until the new payload is ready.
    await dashboard.expectCity('London');
    await expect(dashboard.currentCity).toHaveText('Your location', { timeout: 15000 });
    await expect(dashboard.refreshIndicator).toHaveCount(0);
  });

  test('search update keeps the existing UI mounted until the new place is ready', async ({ api, dashboard, search, sections }) => {
    await dashboard.goto('/');
    await dashboard.expectCity('London');
    await api.geocoding(PARIS_SEARCH);
    await api.delayForecast(1200);

    await search.search('paris');
    await search.selectOption(0);
    await expect(dashboard.refreshIndicator).toBeVisible();
    await expect(dashboard.loadingLayout).toHaveCount(0);
    await expect(sections.hourlyForecast).toBeVisible();
    await dashboard.expectCity('London');
    await expect(dashboard.currentCity).toHaveText('Paris', { timeout: 15000 });
  });

  test('refresh keeps scroll position and document height', async ({ api, dashboard, geo, page }) => {
    await geo.defer();
    await page.setViewportSize({ width: 390, height: 844 });
    await dashboard.goto('/');
    await expect(dashboard.currentTemperature).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 900));
    const before = await page.evaluate(() => ({ y: window.scrollY, h: document.documentElement.scrollHeight }));
    await api.delayForecast(1200);

    await domClick(page, 'button-refresh-location');
    await geo.resolve(51.5074567, -0.12789012);
    await expect(dashboard.refreshIndicator).toBeVisible();
    const during = await page.evaluate(() => ({
      y: window.scrollY,
      h: document.documentElement.scrollHeight,
      skeletons: document.querySelectorAll('.skeleton').length,
    }));
    await expect(dashboard.currentCity).toHaveText('Your location', { timeout: 15000 });
    const after = await page.evaluate(() => ({ y: window.scrollY, h: document.documentElement.scrollHeight }));

    expect(during.skeletons, 'no skeleton takeover during refresh').toBe(0);
    expect(during.h, 'document height does not collapse').toBeGreaterThanOrEqual(before.h - 50);
    expect(Math.abs(during.y - before.y), 'scroll stable during refresh').toBeLessThanOrEqual(5);
    expect(Math.abs(after.y - before.y), 'scroll stable after refresh').toBeLessThanOrEqual(5);
  });

  test('refresh does not remount the main tree or replay entrance animations', async ({ api, dashboard, geo, page }) => {
    await geo.defer();
    await dashboard.goto('/');
    await expect(dashboard.currentTemperature).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __hero: Element | null }).__hero = document.querySelector('.hero-grid');
    });
    await api.delayForecast(1000);

    await dashboard.requestDeviceLocation();
    await geo.resolve(51.5074567, -0.12789012);
    await expect(dashboard.currentCity).toHaveText('Your location', { timeout: 15000 });
    expect(
      await page.evaluate(() => (window as unknown as { __hero?: Element | null }).__hero === document.querySelector('.hero-grid')),
      'hero node identity',
    ).toBe(true);
  });

  test('a failed refresh keeps the previous weather and shows a non-destructive error', async ({ api, dashboard, geo, sections }) => {
    await geo.defer();
    await dashboard.goto('/');
    await dashboard.expectTemperature('20°C');
    await api.forecast('{"reason":"boom"}', { status: 500, contentType: 'application/json' });

    await dashboard.requestDeviceLocation();
    await geo.resolve(51.5074567, -0.12789012);
    await expect(dashboard.refreshError).toBeVisible();
    await dashboard.expectCity('London');
    await dashboard.expectTemperature('20°C');
    await expect(sections.hourlyForecast).toBeVisible();
    await expect(dashboard.errorPanel).toHaveCount(0);
    await expect(dashboard.loadingLayout).toHaveCount(0);
  });

  test('a successful location clears the previous location error toast', async ({ dashboard, geo }) => {
    await geo.defer();
    await dashboard.goto('/');
    await expect(dashboard.currentTemperature).toBeVisible();

    await dashboard.requestDeviceLocation();
    await geo.fail(1);
    await expect(dashboard.toast).toBeVisible();

    await dashboard.requestDeviceLocation();
    await expect(dashboard.toast).toHaveCount(0);
    await geo.resolve(51.5074567, -0.12789012);
    await dashboard.expectCity('Your location');
    await expect(dashboard.toast).toHaveCount(0);
  });

  test('both location controls refresh without a reload', async ({ api, dashboard, geo, page }) => {
    for (const testId of ['button-refresh-location', 'button-use-location']) {
      await geo.defer();
      await dashboard.goto('/');
      await expect(dashboard.currentTemperature).toBeVisible();
      await api.delayForecast(800);
      await page.evaluate(() => {
        (window as unknown as { __hero: Element | null }).__hero = document.querySelector('.hero-grid');
      });

      if (testId === 'button-use-location') {
        await dashboard.clickTopbarLocation();
      } else {
        await dashboard.requestDeviceLocation();
      }
      await geo.resolve(51.5074567, -0.12789012);
      await expect(dashboard.refreshIndicator).toBeVisible();
      await expect(dashboard.loadingLayout).toHaveCount(0);
      await expect(dashboard.currentCity).toHaveText('Your location', { timeout: 15000 });
      expect(
        await page.evaluate(() => (window as unknown as { __hero?: Element | null }).__hero === document.querySelector('.hero-grid')),
        `${testId} node identity`,
      ).toBe(true);
    }
  });
});
