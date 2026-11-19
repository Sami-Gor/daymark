import { expect, test } from '../support/fixtures';
import { ApiMocks } from '../support/mocks';
import { RequestLog } from '../support/network';
import { PARIS_SEARCH } from '../support/test-data';

/*
 * Device location: the deferred/timed/error geolocation flows and the two
 * browser-permission tests.
 *
 * Most tests drive the `geo` harness (defer, timed, resolve, fail) so the test
 * decides when a fix arrives. The two browser-context tests need the browser's
 * own permission emulation, so they create their own context/page and install
 * the canonical mocks with `new ApiMocks(page)`; request assertions use a
 * RequestLog attached to that page.
 */

test.describe('geolocation flow', () => {
  test('a search made while geolocation is pending is not overwritten by the older location result', async ({ api, dashboard, geo, page, search }) => {
    await api.geocoding(PARIS_SEARCH);
    await geo.defer();
    await dashboard.goto('/');
    await dashboard.expectReady();

    await dashboard.requestDeviceLocation();
    await expect(dashboard.heroLocationButton).toHaveText('Finding you…');
    await search.search('paris');
    await search.selectOption(0);
    await dashboard.expectCity('Paris');

    // The older location request resolves after the newer search selection.
    await geo.resolve(51.5074567, -0.12789012);
    // Bounded negative observation window: the stale fix takes the deliberate
    // "silently ignored" path, which emits no positive completion signal to
    // wait on. 500 ms is a generous multiple of the mocked forecast round-trip,
    // so a guard regression would have rendered "Your location" (and re-shown
    // locating state) in this window; the assertions below would then fail.
    await page.waitForTimeout(500);
    await dashboard.expectCity('Paris');
    await expect(dashboard.heroLocationButton).toHaveText('Use my location');
    expect(await geo.calls()).toBe(1);
  });

  test('geolocation wins when it is the most recent action', async ({ api, dashboard, geo, search }) => {
    await api.geocoding(PARIS_SEARCH);
    await geo.defer();
    await dashboard.goto('/');
    await dashboard.expectReady();

    await search.search('paris');
    await search.selectOption(0);
    await dashboard.expectCity('Paris');

    await dashboard.requestDeviceLocation();
    await geo.resolve(51.5074567, -0.12789012);
    await dashboard.expectCity('Your location');
  });

  test('rapid double-click settles cleanly without duplicate final-state corruption', async ({ dashboard, geo, requests }) => {
    await geo.defer();
    await dashboard.goto('/');
    await dashboard.expectReady();

    requests.clear();
    await dashboard.requestDeviceLocation();
    await dashboard.requestDeviceLocation();
    expect(await geo.calls()).toBe(2);
    await geo.resolve(51.5074567, -0.12789012);
    await dashboard.expectCity('Your location');
    await expect(dashboard.heroLocationButton).toHaveText('Use my location');
    // One weather load for the winning click, not one per click.
    expect(requests.forecast().filter((url) => !url.includes('ukmo')).length).toBe(1);
  });

  test('reports a geolocation timeout as a timeout, not a permission denial', async ({ dashboard, geo }) => {
    await geo.defer();
    await dashboard.goto('/');
    await dashboard.expectReady();

    await dashboard.requestDeviceLocation();
    await geo.fail(3);
    await expect(dashboard.toast).toContainText('took too long');
    await expect(dashboard.toast).not.toContainText('Allow location access');
    await expect(dashboard.heroLocationButton).toHaveText('Use my location');
  });

  test('reports position-unavailable distinctly from permission denial', async ({ dashboard, geo }) => {
    await geo.defer();
    await dashboard.goto('/');
    await dashboard.expectReady();

    await dashboard.requestDeviceLocation();
    await geo.fail(2);
    await expect(dashboard.toast).toContainText('determine your location');
    await expect(dashboard.toast).not.toContainText('Allow location access');
  });

  test('keeps the existing permission-denied message for code 1', async ({ dashboard, geo }) => {
    await geo.defer();
    await dashboard.goto('/');
    await dashboard.expectReady();

    await dashboard.requestDeviceLocation();
    await geo.fail(1);
    await expect(dashboard.toast).toContainText('Allow location access');
  });

  test('requests mobile-friendly geolocation options', async ({ dashboard, geo }) => {
    await geo.timed(0);
    await dashboard.goto('/');
    await dashboard.expectReady();

    await dashboard.requestDeviceLocation();
    const options = await geo.options();
    expect(options!.enableHighAccuracy, 'high accuracy off for a rounded purpose').toBe(false);
    expect(options!.maximumAge, 'recent cached fixes allowed').toBeGreaterThanOrEqual(60000);
    expect(options!.timeout, 'room for a cold mobile GPS fix').toBeGreaterThanOrEqual(10000);
    expect(options!.timeout, 'not an indefinite wait').toBeLessThanOrEqual(15000);
  });

  test('a simulated 10-second cold GPS fix resolves within the configured timeout', async ({ dashboard, geo }) => {
    await geo.timed(10000);
    await dashboard.goto('/');
    await dashboard.expectReady();

    await dashboard.requestDeviceLocation();
    await dashboard.expectCity('Your location');
    await expect(dashboard.heroLocationButton).toHaveText('Use my location');
  });

  test('a fix slower than the configured timeout reports a timeout and clears loading', async ({ dashboard, geo }) => {
    await geo.timed(60000);
    await dashboard.goto('/');
    await dashboard.expectReady();

    await dashboard.requestDeviceLocation();
    await expect(dashboard.toast).toContainText('took too long');
    await expect(dashboard.heroLocationButton).toHaveText('Use my location');
    await dashboard.expectCity('London');
  });

  test('the topbar crosshair uses the same location flow', async ({ dashboard, geo }) => {
    await geo.defer();
    await dashboard.goto('/');
    await dashboard.expectReady();

    await dashboard.clickTopbarLocation();
    await expect(dashboard.heroLocationButton).toHaveText('Finding you…');
    await geo.resolve(51.5074567, -0.12789012);
    await dashboard.expectCity('Your location');
    await expect(dashboard.heroLocationButton).toHaveText('Use my location');
  });

  test('device location makes no reverse geocoding request while typed search still does', async ({ api, dashboard, geo, requests, search }) => {
    await api.geocoding(PARIS_SEARCH);
    await geo.defer();
    await dashboard.goto('/');
    await dashboard.expectReady();
    requests.clear();

    await dashboard.requestDeviceLocation();
    await geo.resolve(51.5074567, -0.12789012);
    await dashboard.expectCity('Your location');
    await dashboard.expectReady();
    expect(requests.geocoding(), 'no reverse lookup after device location').toEqual([]);

    await search.search('paris');
    await search.selectOption(0);
    await dashboard.expectCity('Paris');
    expect(requests.geocoding().some((url) => new URL(url).searchParams.has('name')), 'typed search still uses geocoding').toBe(true);
  });

  test('loading clears after denied, unavailable and timeout errors', async ({ dashboard, geo }) => {
    await geo.defer();
    await dashboard.goto('/');
    await dashboard.expectReady();

    for (const code of [1, 2, 3]) {
      await dashboard.requestDeviceLocation();
      await expect(dashboard.heroLocationButton).toHaveText('Finding you…');
      await geo.fail(code);
      await expect(dashboard.toast).toBeVisible();
      await expect(dashboard.heroLocationButton).toHaveText('Use my location');
    }
  });

  // Browser-permission tests: the app must use the browser's real geolocation
  // permission model, so these own their context instead of the `geo` harness.
  test('granted geolocation loads weather from rounded coordinates without reverse geocoding', async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: { latitude: 51.5074567, longitude: -0.12789012 },
    });
    const page = await context.newPage();
    const pageRequests = new RequestLog(page);
    const api = new ApiMocks(page);
    await api.installDefaults();
    await page.goto('/');
    await expect(page.getByTestId('text-current-city')).toHaveText('London');
    await page.waitForLoadState('networkidle');
    pageRequests.clear();
    await page.getByTestId('button-refresh-location').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Your location');
    const forecasts = pageRequests.forecast();
    expect(forecasts.length).toBeGreaterThan(0);
    for (const url of forecasts) {
      expect(url).toContain('latitude=51.51');
      expect(url).toContain('longitude=-0.13');
      expect(url).not.toContain('5074567');
    }
    expect(pageRequests.geocoding()).toEqual([]);
    await context.close();
  });

  test('denied geolocation shows a toast and keeps the loaded weather', async ({ browser }) => {
    const context = await browser.newContext({ permissions: [] });
    const page = await context.newPage();
    const api = new ApiMocks(page);
    await api.installDefaults();
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
});
