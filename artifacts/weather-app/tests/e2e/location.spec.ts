import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { FORECAST, PARIS_RESULT, mockLocations, mockOpenMeteo } from './helpers';
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

test.describe('geolocation flow', () => {
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

  /** Typed place search returns the given results; device location must not call geocoding. */
  async function routeSearchGeocoding(page: Page, searchBody: object) {
    await page.route('**/geocoding-api.open-meteo.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(searchBody) }),
    );
  }

  test('a search made while geolocation is pending is not overwritten by the older location result', async ({ page }) => {
    await mockOpenMeteo(page);
    await routeSearchGeocoding(page, PARIS);
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
    await routeSearchGeocoding(page, PARIS);
    await stubDeferredGeolocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('input-location-search').fill('paris');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');

    await page.getByTestId('button-refresh-location').click();
    await resolveGeolocation(page, 51.5074567, -0.12789012);
    await expect(page.getByTestId('text-current-city')).toHaveText('Your location');
  });

  test('rapid double-click settles cleanly without duplicate final-state corruption', async ({ page }) => {
    await mockOpenMeteo(page);
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
    await expect(page.getByTestId('text-current-city')).toHaveText('Your location');
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
    await expect(page.getByTestId('location-notice')).toContainText('took too long');
    await expect(page.getByTestId('location-notice')).not.toContainText('Allow location access');
    await expect(page.getByTestId('button-refresh-location')).toHaveText('Use my location');
  });

  test('reports position-unavailable distinctly from permission denial', async ({ page }) => {
    await mockOpenMeteo(page);
    await stubDeferredGeolocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await failGeolocation(page, 2);
    await expect(page.getByTestId('location-notice')).toContainText('determine your location');
    await expect(page.getByTestId('location-notice')).not.toContainText('Allow location access');
  });

  test('keeps the existing permission-denied message for code 1', async ({ page }) => {
    await mockOpenMeteo(page);
    await stubDeferredGeolocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await failGeolocation(page, 1);
    await expect(page.getByTestId('location-notice')).toContainText('Allow location access');
  });

  test('retry after a denial recovers once permission is granted, without any precise-location request', async ({ browser }) => {
    // Browser-context permissions machinery (no JS stubs): an empty permission
    // set auto-denies geolocation without a prompt surface, mirroring the
    // Android "denied once" state; grantPermissions() then plays the user
    // later allowing the coarse fix, and the same retry must recover.
    const context = await browser.newContext({
      permissions: [],
      geolocation: { latitude: 51.5074567, longitude: -0.12789012 },
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      (window as any).__geoSurface = {
        calls: 0,
        highAccuracy: [] as boolean[],
        permissionQueries: [] as string[],
        mediaRequests: 0,
      };
      const surface = (window as any).__geoSurface;
      // Count every geolocation request and whether it asks for a precise fix.
      const originalPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = ((
        success: PositionCallback,
        error: PositionErrorCallback,
        options?: PositionOptions,
      ) => {
        surface.calls += 1;
        surface.highAccuracy.push(Boolean(options?.enableHighAccuracy));
        return originalPosition(success, error, options);
      }) as typeof navigator.geolocation.getCurrentPosition;
      // Record any other permission surface the app might touch.
      if (navigator.permissions?.query) {
        const originalQuery = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = ((descriptor: PermissionDescriptor) => {
          surface.permissionQueries.push(String(descriptor?.name));
          return originalQuery(descriptor);
        }) as typeof navigator.permissions.query;
      }
      if (navigator.mediaDevices?.getUserMedia) {
        const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = ((constraints: MediaStreamConstraints) => {
          surface.mediaRequests += 1;
          return originalGetUserMedia(constraints);
        }) as typeof navigator.mediaDevices.getUserMedia;
      }
    });
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__geoSurface.calls), 'no location request on load').toBe(0);

    // First attempt: the context denies geolocation (code 1), no prompt shown.
    requests.length = 0;
    await page.getByTestId('button-refresh-location').click();
    await expect(page.getByTestId('location-notice')).toContainText('Allow location access');
    await expect(page.getByTestId('text-current-city')).toHaveText('London');
    await expect(page.getByTestId('button-refresh-location')).toHaveText('Use my location');
    expect(await page.evaluate(() => (window as any).__geoSurface.calls)).toBe(1);
    expect(requests.filter((url) => new URL(url).hostname === 'api.open-meteo.com')).toEqual([]);

    // The user later grants permission (the coarse-only fix on Android) and
    // retries the same button: the recovery must succeed.
    requests.length = 0;
    await context.grantPermissions(['geolocation']);
    await page.getByTestId('button-refresh-location').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Your location');
    await expect(page.getByTestId('button-refresh-location')).toHaveText('Use my location');
    await expect(page.getByTestId('location-notice')).toBeHidden();
    const forecasts = requests.filter((url) => new URL(url).hostname === 'api.open-meteo.com');
    expect(forecasts.length).toBeGreaterThan(0);
    // The web platform snaps the fix to the privacy grid (Android passes the
    // approximate fix through unchanged — covered by the native-shell test).
    for (const url of forecasts) {
      expect(url).toContain('latitude=51.5');
      expect(url).toContain('longitude=-0.125');
    }

    // No fine-location escalation appeared anywhere in the deny→grant→retry
    // cycle: only the approximate-fix request was made, never a precise one,
    // and no other permission surface was touched.
    const surface = await page.evaluate(() => (window as any).__geoSurface);
    expect(surface.calls).toBe(2);
    expect(surface.highAccuracy, 'every geolocation request must be approximate (enableHighAccuracy=false)').toEqual([false, false]);
    expect(
      surface.permissionQueries.filter((name: string) => name && name.toLowerCase() !== 'geolocation'),
      'no permission other than geolocation may be queried',
    ).toEqual([]);
    expect(surface.mediaRequests, 'no getUserMedia in the location flow').toBe(0);
    await context.close();
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
    await stubTimedGeolocation(page, 10000);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Your location');
    await expect(page.getByTestId('button-refresh-location')).toHaveText('Use my location');
  });

  test('a fix slower than the configured timeout reports a timeout and clears loading', async ({ page }) => {
    await mockOpenMeteo(page);
    await stubTimedGeolocation(page, 60000);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await expect(page.getByTestId('location-notice')).toContainText('took too long');
    await expect(page.getByTestId('button-refresh-location')).toHaveText('Use my location');
    await expect(page.getByTestId('text-current-city')).toHaveText('London');
  });

  test('the topbar crosshair uses the same location flow', async ({ page }) => {
    await mockOpenMeteo(page);
    await stubDeferredGeolocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-use-location').click();
    await expect(page.getByTestId('button-refresh-location')).toHaveText('Finding you…');
    await resolveGeolocation(page, 51.5074567, -0.12789012);
    await expect(page.getByTestId('text-current-city')).toHaveText('Your location');
    await expect(page.getByTestId('button-refresh-location')).toHaveText('Use my location');
  });

  test('device location makes no reverse geocoding request while typed search still does', async ({ page }) => {
    await mockOpenMeteo(page);
    await routeSearchGeocoding(page, PARIS);
    await stubDeferredGeolocation(page);
    const geocodingRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).hostname === 'geocoding-api.open-meteo.com') geocodingRequests.push(request.url());
    });
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    geocodingRequests.length = 0;

    await page.getByTestId('button-refresh-location').click();
    await resolveGeolocation(page, 51.5074567, -0.12789012);
    await expect(page.getByTestId('text-current-city')).toHaveText('Your location');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    expect(geocodingRequests, 'no reverse lookup after device location').toEqual([]);

    await page.getByTestId('input-location-search').fill('paris');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');
    expect(geocodingRequests.some((url) => new URL(url).searchParams.has('name')), 'typed search still uses geocoding').toBe(true);
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
      await expect(page.getByTestId('location-notice')).toBeVisible();
      await expect(page.getByTestId('button-refresh-location')).toHaveText('Use my location');
    }
  });
});

test.describe('non-destructive weather refresh', () => {
  const PARIS = {
    results: [{ name: 'Paris', latitude: 48.8566, longitude: 2.3522, admin1: 'Île-de-France', country: 'France', country_code: 'FR', timezone: 'Europe/Paris' }],
  };

  async function stubDeferredGeolocation(page: Page) {
    await page.addInitScript(() => {
      (window as any).__geo = { calls: 0, pending: [] };
      navigator.geolocation.getCurrentPosition = ((success: PositionCallback, error: PositionErrorCallback) => {
        (window as any).__geo.calls += 1;
        (window as any).__geo.pending.push({ success, error });
      }) as typeof navigator.geolocation.getCurrentPosition;
    });
  }

  async function resolveGeolocation(page: Page) {
    await page.evaluate(() => {
      for (const entry of (window as any).__geo.pending.splice(0)) {
        entry.success({ coords: { latitude: 51.5074567, longitude: -0.12789012 } });
      }
    });
  }

  async function failGeolocation(page: Page, code: number) {
    await page.evaluate((errorCode) => {
      for (const entry of (window as any).__geo.pending.splice(0)) entry.error({ code: errorCode, message: 'stub' });
    }, code);
  }

  async function delayForecast(page: Page, delay: number) {
    await page.route('**/api.open-meteo.com/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FORECAST) });
    });
  }

  const clickByTestId = (page: Page, testId: string) =>
    page.evaluate((id) => (document.querySelector(`[data-testid="${id}"]`) as HTMLElement).click(), testId);

  test('initial load still shows the full-page skeleton before first data', async ({ page }) => {
    await mockOpenMeteo(page, { delay: 1200 });
    await page.goto('/');
    await expect(page.locator('.loading-layout')).toBeVisible();
    await expect(page.getByTestId('text-current-temperature')).toHaveText('20°C');
    await expect(page.locator('.loading-layout')).toHaveCount(0);
  });

  test('location update keeps the existing UI mounted (no full-page skeleton)', async ({ page }) => {
    await mockOpenMeteo(page);
    await stubDeferredGeolocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-city')).toHaveText('London');
    await delayForecast(page, 1500);

    await page.getByTestId('button-refresh-location').click();
    await resolveGeolocation(page);
    await expect(page.getByTestId('refresh-indicator')).toBeVisible();
    await expect(page.locator('.loading-layout')).toHaveCount(0);
    await expect(page.getByTestId('list-hourly-forecast')).toBeVisible();
    // Previous content stays visible until the new payload is ready.
    await expect(page.getByTestId('text-current-city')).toHaveText('London');
    await expect(page.getByTestId('text-current-city')).toHaveText('Your location', { timeout: 15000 });
    await expect(page.getByTestId('refresh-indicator')).toHaveCount(0);
  });

  test('search update keeps the existing UI mounted until the new place is ready', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-city')).toHaveText('London');
    await page.route('**/geocoding-api.open-meteo.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PARIS) }),
    );
    await delayForecast(page, 1200);

    await page.getByTestId('input-location-search').fill('paris');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('refresh-indicator')).toBeVisible();
    await expect(page.locator('.loading-layout')).toHaveCount(0);
    await expect(page.getByTestId('list-hourly-forecast')).toBeVisible();
    await expect(page.getByTestId('text-current-city')).toHaveText('London');
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris', { timeout: 15000 });
  });

  test('refresh keeps scroll position and document height', async ({ page }) => {
    await mockOpenMeteo(page);
    await stubDeferredGeolocation(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 900));
    const before = await page.evaluate(() => ({ y: window.scrollY, h: document.documentElement.scrollHeight }));
    await delayForecast(page, 1200);

    await clickByTestId(page, 'button-refresh-location');
    await resolveGeolocation(page);
    await expect(page.getByTestId('refresh-indicator')).toBeVisible();
    const during = await page.evaluate(() => ({ y: window.scrollY, h: document.documentElement.scrollHeight, skeletons: document.querySelectorAll('.skeleton').length }));
    await expect(page.getByTestId('text-current-city')).toHaveText('Your location', { timeout: 15000 });
    const after = await page.evaluate(() => ({ y: window.scrollY, h: document.documentElement.scrollHeight }));

    expect(during.skeletons, 'no skeleton takeover during refresh').toBe(0);
    expect(during.h, 'document height does not collapse').toBeGreaterThanOrEqual(before.h - 50);
    expect(Math.abs(during.y - before.y), 'scroll stable during refresh').toBeLessThanOrEqual(5);
    expect(Math.abs(after.y - before.y), 'scroll stable after refresh').toBeLessThanOrEqual(5);
  });

  test('refresh does not remount the main tree or replay entrance animations', async ({ page }) => {
    await mockOpenMeteo(page);
    await stubDeferredGeolocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    await page.evaluate(() => { (window as any).__hero = document.querySelector('.hero-grid'); });
    await delayForecast(page, 1000);

    await page.getByTestId('button-refresh-location').click();
    await resolveGeolocation(page);
    await expect(page.getByTestId('text-current-city')).toHaveText('Your location', { timeout: 15000 });
    expect(await page.evaluate(() => (window as any).__hero === document.querySelector('.hero-grid')), 'hero node identity').toBe(true);
  });

  test('a failed refresh keeps the previous weather and shows a non-destructive error', async ({ page }) => {
    await mockOpenMeteo(page);
    await stubDeferredGeolocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toHaveText('20°C');
    await page.route('**/api.open-meteo.com/**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"reason":"boom"}' }),
    );

    await page.getByTestId('button-refresh-location').click();
    await resolveGeolocation(page);
    await expect(page.getByTestId('refresh-error')).toBeVisible();
    await expect(page.getByTestId('text-current-city')).toHaveText('London');
    await expect(page.getByTestId('text-current-temperature')).toHaveText('20°C');
    await expect(page.getByTestId('list-hourly-forecast')).toBeVisible();
    await expect(page.getByTestId('status-weather-error')).toHaveCount(0);
    await expect(page.locator('.loading-layout')).toHaveCount(0);
  });

  test('a successful location clears the previous location error notice', async ({ page }) => {
    await mockOpenMeteo(page);
    await stubDeferredGeolocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await failGeolocation(page, 1);
    await expect(page.getByTestId('location-notice')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await expect(page.getByTestId('location-notice')).toHaveCount(0);
    await resolveGeolocation(page);
    await expect(page.getByTestId('text-current-city')).toHaveText('Your location');
    await expect(page.getByTestId('location-notice')).toHaveCount(0);
  });

  test('both location controls refresh without a reload', async ({ page }) => {
    for (const testId of ['button-refresh-location', 'button-use-location']) {
      await mockOpenMeteo(page);
      await stubDeferredGeolocation(page);
      await page.goto('/');
      await expect(page.getByTestId('text-current-temperature')).toBeVisible();
      await delayForecast(page, 800);
      await page.evaluate(() => { (window as any).__hero = document.querySelector('.hero-grid'); });

      await clickByTestId(page, testId);
      await resolveGeolocation(page);
      await expect(page.getByTestId('refresh-indicator')).toBeVisible();
      await expect(page.locator('.loading-layout')).toHaveCount(0);
      await expect(page.getByTestId('text-current-city')).toHaveText('Your location', { timeout: 15000 });
      expect(await page.evaluate(() => (window as any).__hero === document.querySelector('.hero-grid')), `${testId} node identity`).toBe(true);
    }
  });
});

test.describe('offline locality naming', () => {
  const LOCALITY_FIXTURE = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'lib', '__fixtures__', 'uxbridge-sample.json'), 'utf8');
  const UXBRIDGE = { latitude: 51.5462123, longitude: -0.4787123 };
  const PARIS_RESULT = {
    results: [{ name: 'Paris', latitude: 48.8566, longitude: 2.3522, admin1: 'Île-de-France', country: 'France', country_code: 'FR', timezone: 'Europe/Paris' }],
  };
  // One synthetic record ~11 km from the rounded Uxbridge coordinates, so the
  // lookup must return LOW confidence and the caller must suppress the label.
  const LOW_ONLY_INDEX = JSON.stringify({
    cellSize: 0.25,
    count: 1,
    cells: { '566_718': [0, 1] },
    records: [['Far Village', 51.6458, -0.4787, 'GB', '', 'PPL', 800]],
  });

  async function stubLocation(page: Page) {
    await page.addInitScript(() => {
      (window as any).__geo = { calls: 0, pending: [] };
      navigator.geolocation.getCurrentPosition = ((success: PositionCallback, error: PositionErrorCallback) => {
        (window as any).__geo.calls += 1;
        (window as any).__geo.pending.push({ success, error });
      }) as typeof navigator.geolocation.getCurrentPosition;
    });
  }

  async function resolveLocation(page: Page, coords: { latitude: number; longitude: number }) {
    await page.evaluate((value) => {
      for (const entry of (window as any).__geo.pending.splice(0)) entry.success({ coords: value });
    }, coords);
  }

  async function routeLocality(page: Page, body: string, options: { delay?: number; status?: number } = {}) {
    await page.route('**/locality/**', async (route) => {
      if (options.delay) await new Promise((resolve) => setTimeout(resolve, options.delay));
      if (options.status && options.status !== 200) {
        await route.fulfill({ status: options.status, body: '' });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body });
    });
  }

  test('resolves the locality label once weather is ready', async ({ page }) => {
    await mockOpenMeteo(page);
    await routeLocality(page, LOCALITY_FIXTURE);
    await stubLocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await resolveLocation(page, UXBRIDGE);
    await expect(page.getByTestId('text-current-city')).toHaveText('Uxbridge');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
  });

  test('weather is never delayed by the locality dataset and the label updates later', async ({ page }) => {
    await mockOpenMeteo(page);
    await routeLocality(page, LOCALITY_FIXTURE, { delay: 1500 });
    await stubLocation(page);
    let forecastRequests = 0;
    page.on('request', (request) => {
      if (request.url().includes('/v1/forecast') && !request.url().includes('ukmo')) forecastRequests += 1;
    });
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await resolveLocation(page, UXBRIDGE);
    // Weather is already rendered with the generic fallback while the dataset loads.
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    await expect(page.getByTestId('text-current-city')).toHaveText('Your location', { timeout: 1000 });
    const requestsAtFallback = forecastRequests;
    // The label improves in place; no weather refetch happens for naming.
    await expect(page.getByTestId('text-current-city')).toHaveText('Uxbridge', { timeout: 8000 });
    expect(forecastRequests).toBe(requestsAtFallback);
  });

  test('falls back to the generic label when the dataset is unavailable', async ({ page }) => {
    await mockOpenMeteo(page);
    await routeLocality(page, LOCALITY_FIXTURE, { status: 404 });
    await stubLocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await resolveLocation(page, UXBRIDGE);
    await expect(page.getByTestId('text-current-city')).toHaveText('Your location');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
  });

  test('suppresses LOW-confidence labels', async ({ page }) => {
    await mockOpenMeteo(page);
    await routeLocality(page, LOW_ONLY_INDEX);
    await stubLocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await resolveLocation(page, UXBRIDGE);
    await expect(page.getByTestId('text-current-city')).toHaveText('Your location');
    await page.waitForTimeout(800);
    await expect(page.getByTestId('text-current-city')).toHaveText('Your location');
  });

  test('a search selection supersedes a pending locality lookup', async ({ page }) => {
    await mockOpenMeteo(page);
    await routeLocality(page, LOCALITY_FIXTURE, { delay: 1200 });
    await page.route('**/geocoding-api.open-meteo.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PARIS_RESULT) }),
    );
    await stubLocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await resolveLocation(page, UXBRIDGE);
    await page.getByTestId('input-location-search').fill('paris');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');
  });

  test('repeated location taps settle on the latest intent', async ({ page }) => {
    await mockOpenMeteo(page);
    await routeLocality(page, LOCALITY_FIXTURE);
    await stubLocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await page.getByTestId('button-refresh-location').click();
    await page.evaluate((second) => {
      const pending = (window as any).__geo.pending.splice(0);
      // First (stale) fix somewhere else, then the latest fix near Uxbridge.
      if (pending[0]) pending[0].success({ coords: { latitude: 51.0, longitude: 0.0 } });
      if (pending[1]) pending[1].success({ coords: second });
    }, UXBRIDGE);
    await expect(page.getByTestId('text-current-city')).toHaveText('Uxbridge', { timeout: 8000 });
  });

  test('makes no external reverse-geocoding request and no CSP violations', async ({ page }) => {
    await mockOpenMeteo(page);
    await routeLocality(page, LOCALITY_FIXTURE);
    await stubLocation(page);
    const hosts = new Set<string>();
    const cspErrors: string[] = [];
    page.on('request', (request) => {
      try { hosts.add(new URL(request.url()).hostname); } catch { /* ignore */ }
    });
    page.on('console', (message) => {
      if (message.type() === 'error' && /Content Security Policy|Refused to/i.test(message.text())) cspErrors.push(message.text());
    });
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();

    await page.getByTestId('button-refresh-location').click();
    await resolveLocation(page, UXBRIDGE);
    await expect(page.getByTestId('text-current-city')).toHaveText('Uxbridge');

    expect([...hosts].sort()).toEqual(['air-quality-api.open-meteo.com', 'api.open-meteo.com', 'localhost']);
    expect(cspErrors).toEqual([]);
  });

  test('shows localized fallback labels in EN, FR and ES', async ({ page }) => {
    await mockOpenMeteo(page);
    await routeLocality(page, LOCALITY_FIXTURE, { status: 404 });
    await stubLocation(page);
    for (const [locale, expected] of [['en', 'Your location'], ['fr', 'Votre position'], ['es', 'Tu ubicación']] as const) {
      await page.goto('/');
      await expect(page.getByTestId('text-current-temperature')).toBeVisible();
      await page.getByTestId('select-language').selectOption(locale);
      await page.getByTestId('button-refresh-location').click();
      await resolveLocation(page, UXBRIDGE);
      await expect(page.getByTestId('text-current-city')).toHaveText(expected);
    }
  });

  test('keeps the non-destructive refresh behaviour during locality naming', async ({ page }) => {
    await mockOpenMeteo(page);
    await routeLocality(page, LOCALITY_FIXTURE, { delay: 1200 });
    await stubLocation(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    await page.route('**/api.open-meteo.com/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FORECAST) });
    });

    await page.getByTestId('button-refresh-location').click();
    await resolveLocation(page, UXBRIDGE);
    await expect(page.getByTestId('refresh-indicator')).toBeVisible();
    await expect(page.locator('.loading-layout')).toHaveCount(0);
    await expect(page.getByTestId('list-hourly-forecast')).toBeVisible();
    await expect(page.getByTestId('text-current-city')).toHaveText('Uxbridge', { timeout: 10000 });
  });
});

test('repeated location denial keeps the notice and recovery route without a prompt loop', async ({ browser }) => {
  const context = await browser.newContext({ permissions: [] });
  const page = await context.newPage();
  await mockOpenMeteo(page);
  await page.goto('/');
  await page.getByTestId('button-refresh-location').click();
  await expect(page.getByTestId('location-notice')).toBeVisible();
  // Retry is denied again: the notice must stay stable, not disappear or loop.
  await page.getByTestId('button-location-retry').click();
  await expect(page.getByTestId('location-notice')).toBeVisible();
  await page.getByTestId('button-refresh-location').click();
  await expect(page.getByTestId('location-notice')).toBeVisible();
  await expect(page.getByTestId('button-location-retry')).toBeVisible();
  await expect(page.getByTestId('text-current-city')).toHaveText('London');
  await context.close();
});
