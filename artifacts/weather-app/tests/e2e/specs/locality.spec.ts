import type { Page } from '@playwright/test';
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

type HeldLocalityDataset = {
  /** Resolves when the app's dataset request reaches the route (not when it is served). */
  started: Promise<void>;
  /** Fulfils the held dataset response so the worker can answer the pending lookup. */
  release: () => void;
};

/**
 * Hold the offline locality dataset response until the test releases it.
 *
 * The production flow starts the dataset request when "Use my location" is
 * pressed but only calls lookupLocality() after the device forecast has swapped
 * in. A fixed response delay made the supersede test race that ordering: if the
 * device forecast was still pending when Paris was selected, the intent guard
 * skipped lookupLocality() and no worker result could ever arrive. Gating the
 * response instead makes "a lookup is pending at selection time" explicit and
 * deterministic: the request starts, the test controls exactly when it can
 * finish, and the stale result is guaranteed to be produced afterwards.
 */
async function holdLocalityDataset(page: Page, body: string): Promise<HeldLocalityDataset> {
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = (): void => resolve();
  });
  let openGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    openGate = (): void => resolve();
  });

  await page.route('**/locality/**', async (route) => {
    markStarted();
    await gate;
    await route.fulfill({ status: 200, contentType: 'application/json', body }).catch(() => {
      // The worker may already be gone when the page is torn down.
    });
  });

  return { started, release: (): void => openGate() };
}

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
    // Deterministic replacement for the old 1200 ms-delay race: the dataset
    // response is held until AFTER Paris is selected, so a lookup is provably
    // pending at selection time and its stale Uxbridge answer is guaranteed to
    // arrive later instead of racing the device forecast.
    const localityWorker = new LocalityWorkerProbe(page);
    await localityWorker.install();
    const localityDataset = await holdLocalityDataset(page, LOCALITY_UXBRIDGE_FIXTURE);
    await api.geocoding(PARIS_SEARCH);
    await geo.defer();
    await dashboard.goto('/');
    await expect(dashboard.currentTemperature).toBeVisible();

    await dashboard.requestDeviceLocation();
    await geo.resolve(UXBRIDGE.latitude, UXBRIDGE.longitude);
    // Wait for the device forecast itself to swap in: the city label becomes
    // the device payload's fallback (not the initial London one), which proves
    // the app has moved past loadWeather() and is now awaiting the held
    // locality dataset inside lookupLocality().
    await dashboard.expectCity('Your location');
    // The dataset request is now in flight but held, so the lookup stays
    // pending while the search runs.
    await localityDataset.started;

    await search.search('paris');
    await search.selectOption(0);
    await dashboard.expectCity('Paris');

    // The lookup is still pending. Release the dataset without a timer: the
    // worker can only answer now, i.e. strictly after the Paris selection, so
    // this result is genuinely stale. If the app had skipped lookupLocality()
    // because the device forecast was still pending (the old delay-based race),
    // no new result would appear and this would time out. The city must still be
    // Paris afterwards: the stale result is delivered but must not win.
    const countBefore = await localityWorker.resultCount();
    localityDataset.release();
    const staleResult = await localityWorker.waitForResult({ since: countBefore });
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
