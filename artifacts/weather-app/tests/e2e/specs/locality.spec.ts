import { expect, test } from '../support/fixtures';
import { LocalityWorkerProbe } from '../support/locality-worker';
import {
  LOCALITY_LOW_CONFIDENCE_FIXTURE,
  LOCALITY_UXBRIDGE_FIXTURE,
  PARIS_SEARCH,
  UXBRIDGE,
} from '../support/test-data';

/*
 * Offline locality naming for the "use my location" flow: a local dataset
 * turns rounded device coordinates into a place label, but the weather load
 * must never wait for it and any failure/low-confidence result falls back to
 * the localized "Your location" text. `api.locality` serves (or rejects) the
 * dataset and `geo` supplies the deferred fix.
 */

test.describe('offline locality naming', () => {
  test('resolves the locality label once weather is ready', async ({ api, dashboard, geo }) => {
    await api.locality(LOCALITY_UXBRIDGE_FIXTURE);
    await geo.defer();
    await dashboard.goto('/');
    await expect(dashboard.currentTemperature).toBeVisible();

    await dashboard.requestDeviceLocation();
    await geo.resolve(UXBRIDGE.latitude, UXBRIDGE.longitude);
    await dashboard.expectCity('Uxbridge');
    await expect(dashboard.currentTemperature).toBeVisible();
  });

  test('weather is never delayed by the locality dataset and the label updates later', async ({ api, dashboard, geo, requests }) => {
    await api.locality(LOCALITY_UXBRIDGE_FIXTURE, { delay: 1500 });
    await geo.defer();
    await dashboard.goto('/');
    await expect(dashboard.currentTemperature).toBeVisible();
    requests.clear();

    await dashboard.requestDeviceLocation();
    await geo.resolve(UXBRIDGE.latitude, UXBRIDGE.longitude);
    // Weather is already rendered with the generic fallback while the dataset loads.
    await expect(dashboard.currentTemperature).toBeVisible();
    await expect(dashboard.currentCity).toHaveText('Your location', { timeout: 1000 });
    const forecastRequests = (): number => requests.forecast()
      .filter((url) => url.includes('/v1/forecast') && !url.includes('ukmo')).length;
    const requestsAtFallback = forecastRequests();
    // The label improves in place; no weather refetch happens for naming.
    await expect(dashboard.currentCity).toHaveText('Uxbridge', { timeout: 8000 });
    expect(forecastRequests()).toBe(requestsAtFallback);
  });

  test('falls back to the generic label when the dataset is unavailable', async ({ api, dashboard, geo }) => {
    await api.locality(LOCALITY_UXBRIDGE_FIXTURE, { status: 404 });
    await geo.defer();
    await dashboard.goto('/');
    await expect(dashboard.currentTemperature).toBeVisible();

    await dashboard.requestDeviceLocation();
    await geo.resolve(UXBRIDGE.latitude, UXBRIDGE.longitude);
    await dashboard.expectCity('Your location');
    await expect(dashboard.currentTemperature).toBeVisible();
  });

  test('suppresses LOW-confidence labels', async ({ api, dashboard, geo, page }) => {
    // Observe the worker's own completion signal instead of sleeping: the
    // test-only probe records the locality worker's `{type:'result'}` message,
    // so the "label stayed generic" assertion runs strictly after the lookup
    // really answered (and we can assert it was the low-confidence match).
    const localityWorker = new LocalityWorkerProbe(page);
    await localityWorker.install();
    await api.locality(LOCALITY_LOW_CONFIDENCE_FIXTURE);
    await geo.defer();
    await dashboard.goto('/');
    await expect(dashboard.currentTemperature).toBeVisible();

    await dashboard.requestDeviceLocation();
    await geo.resolve(UXBRIDGE.latitude, UXBRIDGE.longitude);
    await dashboard.expectCity('Your location');

    const result = await localityWorker.waitForResult();
    // The worker produced the low-confidence record rather than "no match":
    expect(result.match).toMatchObject({ name: 'Far Village', confidence: 'low' });
    // ...and the app still shows the generic label after that result was
    // delivered, so the suppression is real rather than "the lookup was slow".
    await dashboard.expectCity('Your location');
  });

  test('a search selection supersedes a pending locality lookup', async ({ api, dashboard, geo, page, search }) => {
    // The delay below is on the dataset response, so it determines when the
    // worker's lookup can answer - not the label. The probe lets us wait for
    // that stale result and assert the selection guard ignored it, instead of
    // sleeping through a guessed window.
    const localityWorker = new LocalityWorkerProbe(page);
    await localityWorker.install();
    await api.locality(LOCALITY_UXBRIDGE_FIXTURE, { delay: 1200 });
    await api.geocoding(PARIS_SEARCH);
    await geo.defer();
    await dashboard.goto('/');
    await expect(dashboard.currentTemperature).toBeVisible();

    await dashboard.requestDeviceLocation();
    await geo.resolve(UXBRIDGE.latitude, UXBRIDGE.longitude);
    await search.search('paris');
    await search.selectOption(0);
    await dashboard.expectCity('Paris');

    // Ordering is deterministic: the device lookup can only answer after the
    // 1200 ms dataset response, while the Paris search resolves in roughly a
    // debounce-plus-round-trip (<400 ms), so this stale result arrives after
    // Paris is selected. A missing/no-op intent guard would relabel the city to
    // Uxbridge here; with the guard it is ignored and Paris still wins.
    const staleResult = await localityWorker.waitForResult();
    expect(staleResult.match?.name).toBe('Uxbridge');
    await dashboard.expectCity('Paris');
  });

  test('repeated location taps settle on the latest intent', async ({ api, dashboard, geo }) => {
    await api.locality(LOCALITY_UXBRIDGE_FIXTURE);
    await geo.defer();
    await dashboard.goto('/');
    await expect(dashboard.currentTemperature).toBeVisible();

    await dashboard.requestDeviceLocation();
    await dashboard.requestDeviceLocation();
    // First (stale) fix somewhere else, then the latest fix near Uxbridge.
    await geo.resolveEach([{ latitude: 51.0, longitude: 0.0 }, UXBRIDGE]);
    await expect(dashboard.currentCity).toHaveText('Uxbridge', { timeout: 8000 });
  });

  test('makes no external reverse-geocoding request and no CSP violations', async ({ api, browserLog, dashboard, geo, requests }) => {
    await api.locality(LOCALITY_UXBRIDGE_FIXTURE);
    await geo.defer();
    await dashboard.goto('/');
    await expect(dashboard.currentTemperature).toBeVisible();

    await dashboard.requestDeviceLocation();
    await geo.resolve(UXBRIDGE.latitude, UXBRIDGE.longitude);
    await dashboard.expectCity('Uxbridge');

    const hosts = new Set(requests.all().map((url) => new URL(url).hostname));
    expect([...hosts].sort()).toEqual(['air-quality-api.open-meteo.com', 'api.open-meteo.com', 'localhost']);
    const cspErrors = browserLog.consoleErrors()
      .filter((entry) => /Content Security Policy|Refused to/i.test(entry.text))
      .map((entry) => entry.text);
    expect(cspErrors).toEqual([]);
  });

  test('shows localized fallback labels in EN, FR and ES', async ({ api, dashboard, geo }) => {
    await api.locality(LOCALITY_UXBRIDGE_FIXTURE, { status: 404 });
    await geo.defer();
    for (const [locale, expected] of [['en', 'Your location'], ['fr', 'Votre position'], ['es', 'Tu ubicación']] as const) {
      await dashboard.goto('/');
      await expect(dashboard.currentTemperature).toBeVisible();
      await dashboard.setLanguage(locale);
      await dashboard.requestDeviceLocation();
      await geo.resolve(UXBRIDGE.latitude, UXBRIDGE.longitude);
      await dashboard.expectCity(expected);
    }
  });

  test('keeps the non-destructive refresh behaviour during locality naming', async ({ api, dashboard, geo, sections }) => {
    await api.locality(LOCALITY_UXBRIDGE_FIXTURE, { delay: 1200 });
    await geo.defer();
    await dashboard.goto('/');
    await expect(dashboard.currentTemperature).toBeVisible();
    await api.delayForecast(1000);

    await dashboard.requestDeviceLocation();
    await geo.resolve(UXBRIDGE.latitude, UXBRIDGE.longitude);
    await expect(dashboard.refreshIndicator).toBeVisible();
    await expect(dashboard.loadingLayout).toHaveCount(0);
    await expect(sections.hourlyForecast).toBeVisible();
    await expect(dashboard.currentCity).toHaveText('Uxbridge', { timeout: 10000 });
  });
});
