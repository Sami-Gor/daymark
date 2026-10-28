import { expect, test, type Page } from '@playwright/test';
import { AIR, FORECAST, PARIS_RESULT, TOKYO_RESULT, PARIS_FORECAST, WINDY_FORECAST, TOKYO_WINDY_FORECAST, mockLocations, mockOpenMeteo } from './helpers';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      // Storage can be unavailable in a browser error state.
    }
  });
});



test.describe('weather dashboard', () => {
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
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__geoCalls)).toBe(0);
  });

  test('granted web geolocation loads weather from grid-rounded coordinates without reverse geocoding', async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: { latitude: 51.5074567, longitude: -0.12789012 },
    });
    const page = await context.newPage();
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-city')).toHaveText('London');
    await page.waitForLoadState('networkidle');
    requests.length = 0;
    await page.getByTestId('button-refresh-location').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Your location');
    const locationRequests = requests.filter((url) => {
      const host = new URL(url).hostname;
      return host === 'api.open-meteo.com' || host === 'air-quality-api.open-meteo.com';
    });
    expect(locationRequests.length).toBeGreaterThan(1);
    for (const url of locationRequests) {
      expect(url).toContain('latitude=51.5');
      expect(url).toContain('longitude=-0.125');
      expect(url).not.toContain('5074567');
      expect(url).not.toContain('12789012');
    }
    expect(requests.filter((url) => new URL(url).hostname === 'geocoding-api.open-meteo.com')).toEqual([]);
    await context.close();
  });

  test('android native shell sends the same grid-rounded fix as the web/PWA', async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: { latitude: 51.5074567, longitude: -0.12789012 },
    });
    const page = await context.newPage();
    // Capacitor reports the platform as 'android' through its custom-platform
    // hook. The manifest grants ACCESS_COARSE_LOCATION only, and the app also
    // applies the shared latitude-aware on-device grid before requesting weather.
    await page.addInitScript(() => {
      (window as unknown as { CapacitorCustomPlatform: { name: string } }).CapacitorCustomPlatform = {
        name: 'android',
      };
    });
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-city')).toHaveText('London');
    await page.waitForLoadState('networkidle');
    requests.length = 0;
    await page.getByTestId('button-refresh-location').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Your location');
    const locationRequests = requests.filter((url) => {
      const host = new URL(url).hostname;
      return host === 'api.open-meteo.com' || host === 'air-quality-api.open-meteo.com';
    });
    expect(locationRequests.length).toBeGreaterThan(1);
    for (const url of locationRequests) {
      // The Android path must never transmit the raw browser/OS fix through
      // either the forecast or air-quality request. It uses the same grid as
      // the web build, independent of the permission level.
      expect(url).toContain('latitude=51.5');
      expect(url).toContain('longitude=-0.125');
      expect(url).not.toContain('5074567');
      expect(url).not.toContain('12789012');
    }
    await context.close();
  });

  test('denied geolocation shows a persistent notice and keeps the loaded weather', async ({ browser }) => {
    const context = await browser.newContext({ permissions: [] });
    const page = await context.newPage();
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-city')).toHaveText('London');
    await page.getByTestId('button-refresh-location').click();
    const notice = page.getByTestId('location-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("couldn't access your location");
    await expect(notice).toContainText('London');
    await expect(page.getByTestId('button-location-retry')).toBeVisible();
    await expect(page.getByTestId('text-current-temperature')).toHaveText('20°C');
    await context.close();
  });

  test('geolocation timeout shows a timeout notice with a retry action', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = ((_ok, error) => {
        error?.({
          code: 3,
          message: 'timeout',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError);
      }) as typeof navigator.geolocation.getCurrentPosition;
    });
    await mockOpenMeteo(page);
    await page.goto('/');
    await page.getByTestId('button-refresh-location').click();
    const notice = page.getByTestId('location-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('took too long');
    await expect(page.getByTestId('button-location-retry')).toBeVisible();
  });

  test('granting permission after denial recovers through the retry button', async ({ browser }) => {
    const context = await browser.newContext({ permissions: [] });
    const page = await context.newPage();
    await mockOpenMeteo(page);
    await page.goto('/');
    await page.getByTestId('button-refresh-location').click();
    await expect(page.getByTestId('location-notice')).toBeVisible();

    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 51.5074567, longitude: -0.12789012 });
    await page.getByTestId('button-location-retry').click();
    await expect(page.getByTestId('location-notice')).toHaveCount(0);
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
    await expect(page.getByTestId('list-hourly-forecast').locator('.temp-dot')).toHaveCount(5);
    await expect(page.getByTestId('list-rain-probability').locator('.rain-point')).toHaveCount(5);
    await expect(page.getByTestId('list-daily-forecast').locator('.day-row')).toHaveCount(3);
    await expect(page.getByTestId('list-daily-uv').locator('.uv-day')).toHaveCount(3);
    await expect(page.getByTestId('text-uv-protection-window')).toContainText('Sun protection recommended');
    await expect(page.getByTestId('uv-protection-timeline')).toBeVisible();
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
    await expect(page.locator('[data-testid="status-weather-error"]')).toContainText("Weather data isn't available right now");
    failing = false;
    await page.getByTestId('button-retry-weather').click();
    await expect(page.getByTestId('text-current-temperature')).toHaveText('20°C');
  });

  test('network failure shows friendly copy without raw browser text', async ({ page }) => {
    await page.route('**/api.open-meteo.com/**', (route) => route.abort());
    await page.route('**/air-quality-api.open-meteo.com/**', (route) => route.abort());
    await page.goto('/');
    const panel = page.locator('[data-testid="status-weather-error"]');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("We couldn't reach the weather service");
    await expect(panel).not.toContainText('Failed to fetch');
    await expect(page.getByTestId('button-retry-weather')).toBeVisible();
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

test.describe('day cue hero', () => {
  const rainEverywhere = {
    ...FORECAST,
    current: { ...FORECAST.current, cloud_cover: 90, uv_index: 1 },
    hourly: {
      ...FORECAST.hourly,
      precipitation_probability: FORECAST.hourly.time.map(() => 80),
      weather_code: FORECAST.hourly.time.map(() => 61),
    },
  };
  const mixedDay = {
    ...FORECAST,
    hourly: {
      ...FORECAST.hourly,
      precipitation_probability: FORECAST.hourly.time.map((_, index) => (index % 2 ? 50 : 5)),
      weather_code: FORECAST.hourly.time.map((_, index) => (index % 2 ? 61 : 0)),
    },
  };
  const dryOvercast = {
    ...FORECAST,
    hourly: {
      ...FORECAST.hourly,
      precipitation_probability: FORECAST.hourly.time.map(() => 10),
      weather_code: FORECAST.hourly.time.map(() => 3),
    },
  };

  test('shows one visual cue with no explanatory text or web voice controls', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    const cue = page.getByTestId('day-cue');
    await expect(cue).toBeVisible();
    await expect(cue).toHaveText('😎');
    await expect(cue).toHaveAttribute('aria-label', 'Sunny conditions today');
    const hero = page.locator('.today-hero');
    await expect(hero).not.toContainText('Sunglasses');
    await expect(hero).not.toContainText('Umbrella?');
    await expect(page.getByTestId('button-hear-today')).toHaveCount(0);
    await expect(page.getByTestId('button-ask-daymark')).toHaveCount(0);
    await expect(page.getByTestId('web-demo-note')).toBeVisible();
  });

  test('renders the rain cue for a wet day', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: rainEverywhere });
    await page.goto('/');
    const cue = page.getByTestId('day-cue');
    await expect(cue).toHaveText('☔');
    await expect(cue).toHaveAttribute('aria-label', 'Rain expected today');
  });

  test('renders the mixed cue when sun and showers share the day', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: mixedDay });
    await page.goto('/');
    const cue = page.getByTestId('day-cue');
    await expect(cue).toHaveText('😎☔');
    await expect(cue).toHaveAttribute('aria-label', 'Sunshine and rain expected today');
  });

  test('renders the neutral cue when neither sunglasses nor umbrella is warranted', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: dryOvercast });
    await page.goto('/');
    const cue = page.getByTestId('day-cue');
    await expect(cue).toHaveText('☁️');
    await expect(cue).toHaveAttribute('aria-label', 'Cloudy conditions today');
  });

  test('localizes the cue label in EN, FR and ES', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    const cue = page.getByTestId('day-cue');
    await expect(cue).toHaveAttribute('aria-label', 'Sunny conditions today');
    await page.getByTestId('select-language').selectOption('fr');
    await expect(cue).toHaveAttribute('aria-label', 'Temps ensoleillé aujourd’hui');
    await page.getByTestId('select-language').selectOption('es');
    await expect(cue).toHaveAttribute('aria-label', 'Condiciones soleadas hoy');
  });

  test('does not render the redundant umbrella or sunglasses advice cards', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('card-umbrella-advice')).toHaveCount(0);
    await expect(page.getByTestId('card-sunglasses-advice')).toHaveCount(0);
    await expect(page.getByTestId('text-umbrella-advice')).toHaveCount(0);
    await expect(page.getByTestId('text-sunglasses-advice')).toHaveCount(0);
    await expect(page.locator('.advice-card, .advice-row')).toHaveCount(0);
  });

  test('keeps the detailed forecast stack reachable below the hero', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    for (const id of ['list-hourly-forecast', 'list-daily-forecast', 'panel-weather-details', 'panel-micro-climate', 'panel-uv-forecast', 'panel-air-quality']) {
      await page.getByTestId(id).scrollIntoViewIfNeeded();
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });

  test('renders the cue without animation under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockOpenMeteo(page);
    await page.goto('/');
    const emoji = page.getByTestId('day-cue').locator('.day-cue-emoji').first();
    await expect(emoji).toBeVisible();
    const duration = await emoji.evaluate((element) => getComputedStyle(element).animationDuration);
    expect(parseFloat(duration)).toBeLessThanOrEqual(0.01);
  });
});

test.describe('clean card redesign', () => {
  test('renders exactly five live hourly points and five live rain bars', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');

    const tempDots = page.getByTestId('list-hourly-forecast').locator('.temp-dot');
    await expect(tempDots).toHaveCount(5);
    const tempValues = await page.locator('.temp-value').allTextContents();
    expect(tempValues).toEqual(['20°', '21°', '21°', '21°', '20°']);
    const tempTimes = await page.locator('.temp-time').allTextContents();
    expect(tempTimes).toEqual(['Now', '1 PM', '2 PM', '3 PM', '4 PM']);

    const points = page.getByTestId('list-rain-probability').locator('.rain-point');
    await expect(points).toHaveCount(5);
    const rainValues = await page.locator('.rain-point-value').allTextContents();
    expect(rainValues).toEqual(['10%', '20%', '10%', '0%', '0%']);
    const rainTimes = await page.locator('.rain-point-time').allTextContents();
    expect(rainTimes).toEqual(['Now', '1 PM', '2 PM', '3 PM', '4 PM']);
    await expect(page.getByTestId('text-rain-peak')).toHaveText('20%');
    await expect(page.getByTestId('text-rain-peak-note')).toHaveText('Highest around 1 PM');
    await expect(points.nth(1)).toHaveClass(/rain-point-peak/);
    await expect(page.getByTestId('list-rain-probability').getByRole('listitem').first()).toHaveAttribute('aria-label', 'Now: 10% chance');

    await expect(page.getByTestId('text-current-aqi')).toHaveText('33');
    await expect(page.getByTestId('detail-sunrise')).toContainText('6:30 AM');
    await expect(page.getByTestId('detail-sunset')).toContainText('7:40 PM');
    await expect(page.locator('.sun-noon')).toHaveText('1:05 PM');
    await expect(page.locator('.sun-total strong')).toHaveText('13h 10m');

    const body = await page.locator('body').innerText();
    for (const fabricated of ['15h 51m', '5:12am', '1:48pm', '9:03pm', '32 AQI']) {
      expect(body).not.toContain(fabricated);
    }
  });

  test('builds a peak-first droplet timeline with no bar-chart elements', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await expect(page.locator('.rain-chart, .rain-bar, .rain-value')).toHaveCount(0);
    const timeline = page.locator('.rain-timeline');
    await expect(timeline).toBeVisible();
    const points = timeline.locator('.rain-point');
    await expect(points).toHaveCount(5);
    await expect(points.nth(1)).toHaveClass(/rain-point-peak/);

    const lefts = await points.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().x)));
    for (let index = 1; index < lefts.length; index += 1) expect(lefts[index]).toBeGreaterThan(lefts[index - 1]);
    const dropCenters = await timeline.locator('.rain-drop-wrap').evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return rect.x + rect.width / 2;
    }));
    const labelCenters = await timeline.locator('.rain-point-value').evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return rect.x + rect.width / 2;
    }));
    for (let index = 0; index < dropCenters.length; index += 1) {
      expect(Math.abs(labelCenters[index] - dropCenters[index])).toBeLessThanOrEqual(2);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.setViewportSize({ width: 1280, height: 900 });
    const timelineWidth = await timeline.evaluate((element) => element.getBoundingClientRect().width);
    expect(timelineWidth).toBeLessThanOrEqual(440);
  });

  test('handles tied peaks, zero-rain windows and localized peak copy', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: { ...FORECAST, hourly: { ...FORECAST.hourly, precipitation_probability: [10, 20, 20, 5, 0, 0, 0, 0] } } });
    await page.goto('/');
    await expect(page.getByTestId('text-rain-peak')).toHaveText('20%');
    await expect(page.getByTestId('text-rain-peak-note')).toHaveText('Highest around 1 PM');
    await expect(page.locator('.rain-point').nth(1)).toHaveClass(/rain-point-peak/);
    await expect(page.locator('.rain-point').nth(2)).not.toHaveClass(/rain-point-peak/);

    await page.getByTestId('select-language').selectOption('fr');
    await expect(page.getByTestId('text-rain-peak-note')).toContainText('Maximum vers');
    await page.getByTestId('select-language').selectOption('en');

    await page.route('**/api.open-meteo.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...FORECAST, hourly: { ...FORECAST.hourly, precipitation_probability: [0, 0, 0, 0, 0, 0, 0, 0] } }),
    }));
    await page.reload();
    await expect(page.getByTestId('text-rain-peak')).toHaveText('0%');
    await expect(page.getByTestId('text-rain-peak-note')).toHaveText('No rain expected in the next 5 hours');
    await expect(page.locator('.rain-point')).toHaveCount(5);
  });

  test('live cards use clean surfaces with no scenic artwork', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.locator('.promo-card')).toHaveCount(4);
    await expect(page.locator('.atmos-bg')).toHaveCount(0);
    await expect(page.locator('img[src*="weather-art"], img[src*="store-assets"]')).toHaveCount(0);
    const backgrounds = await page.locator('.promo-card').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundImage));
    for (const image of backgrounds) expect(image).not.toContain('url(');
  });

  test('useful bits follows chance of rain and pairs daily with regional comparison', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');

    const rainBox = await page.getByTestId('list-rain-probability').boundingBox();
    const detailsBox = await page.getByTestId('panel-weather-details').boundingBox();
    const airBox = await page.getByTestId('panel-air-quality').boundingBox();
    expect(rainBox && detailsBox && airBox).toBeTruthy();
    expect(detailsBox!.y).toBeGreaterThan(rainBox!.y);
    expect(airBox!.y).toBeGreaterThan(detailsBox!.y);

    const pair = page.getByTestId('forecast-pair');
    await expect(pair).toBeVisible();
    await expect(pair).toHaveClass(/pair-card/);
    await expect(pair.getByTestId('list-daily-forecast')).toBeVisible();
    await expect(pair.getByTestId('panel-micro-climate')).toBeVisible();
    const wideColumns = await pair.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(wideColumns).toBe(2);
    const wideXs = await pair.evaluate((element) => Array.from(element.children).map((child) => Math.round(child.getBoundingClientRect().x)));
    expect(wideXs[1]).toBeGreaterThan(wideXs[0]);

    await page.setViewportSize({ width: 390, height: 844 });
    const narrowColumns = await pair.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(narrowColumns).toBe(1);
    const narrowXs = await pair.evaluate((element) => Array.from(element.children).map((child) => Math.round(child.getBoundingClientRect().x)));
    expect(narrowXs[1]).toBe(narrowXs[0]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('renders Air around you once, after every other main section', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await expect(page.getByTestId('panel-air-quality')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Air around you' })).toHaveCount(1);

    const airBox = await page.getByTestId('panel-air-quality').boundingBox();
    const pairBox = await page.getByTestId('forecast-pair').boundingBox();
    const uvBox = await page.getByTestId('panel-uv-forecast').boundingBox();
    expect(airBox && pairBox && uvBox).toBeTruthy();
    expect(airBox!.y).toBeGreaterThan(pairBox!.y);
    expect(airBox!.y).toBeGreaterThan(uvBox!.y);

    await page.setViewportSize({ width: 1280, height: 900 });
    const airWide = await page.getByTestId('panel-air-quality').boundingBox();
    const pairWide = await page.getByTestId('forecast-pair').boundingBox();
    const uvWide = await page.getByTestId('panel-uv-forecast').boundingBox();
    expect(airWide && pairWide && uvWide).toBeTruthy();
    expect(airWide!.y).toBeGreaterThan(pairWide!.y);
    expect(airWide!.y).toBeGreaterThan(uvWide!.y);
  });

  test('collapses redesigned section animation under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockOpenMeteo(page);
    await page.goto('/');
    const dot = page.locator('.temp-dot').first();
    const duration = await dot.evaluate((element) => getComputedStyle(element).animationDuration);
    expect(parseFloat(duration)).toBeLessThanOrEqual(0.01);
  });
});

test.describe('severe weather alerts', () => {
  test('shows nothing at all when there is no alert', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await expect(page.getByTestId('text-current-temperature')).toBeVisible();
    await expect(page.getByTestId('list-weather-alerts')).toHaveCount(0);
    await expect(page.getByText('No alerts')).toHaveCount(0);
    await expect(page.getByText('No warnings')).toHaveCount(0);
  });

  test('renders a forecast-derived risk with severity text and timing', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: WINDY_FORECAST });
    await page.goto('/');
    const alert = page.getByTestId('alert-wind');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Strong winds expected');
    await expect(alert).toContainText('Severe risk');
    await expect(alert).toContainText('not an official warning');
    await expect(page.getByTestId('alert-time-wind')).toHaveText(/5 PM–6 PM/);
  });



  test('replaces the alert when the selected location changes', async ({ page }) => {
    await page.route('**/geocoding-api.open-meteo.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [PARIS_RESULT] }),
    }));
    await page.route('**/api.open-meteo.com/**', (route) => {
      const url = new URL(route.request().url());
      const latitude = Number(url.searchParams.get('latitude'));
      const body = Math.abs(latitude - 48.8566) < 0.5 ? PARIS_FORECAST : WINDY_FORECAST;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route('**/air-quality-api.open-meteo.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AIR),
    }));
    await page.goto('/');
    await expect(page.getByTestId('alert-wind')).toBeVisible();
    await page.getByTestId('input-location-search').fill('paris');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');
    await expect(page.getByTestId('list-weather-alerts')).toHaveCount(0);
  });

  test('uses the selected location clock for alert timing', async ({ page }) => {
    await page.route('**/geocoding-api.open-meteo.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [TOKYO_RESULT] }),
    }));
    await page.route('**/api.open-meteo.com/**', (route) => {
      const url = new URL(route.request().url());
      const latitude = Number(url.searchParams.get('latitude'));
      const body = Math.abs(latitude - 35.6762) < 0.5 ? TOKYO_WINDY_FORECAST : WINDY_FORECAST;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route('**/air-quality-api.open-meteo.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AIR),
    }));
    await page.goto('/');
    await page.getByTestId('input-location-search').fill('tokyo');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Tokyo');
    await expect(page.getByTestId('alert-time-wind')).toHaveText(/9 PM–10 PM/);
  });

  test('alert layout is clean at 320px with no serious accessibility issues', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: WINDY_FORECAST });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByTestId('alert-wind')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const { AxeBuilder } = await import('@axe-core/playwright');
    await page.waitForTimeout(200);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious).toEqual([]);
  });
});

test.describe('useful bits', () => {
  const forecastWithWind = {
    ...FORECAST,
    current: { ...FORECAST.current, wind_speed_10m: 14, wind_gusts_10m: 22 },
  };

  test('shows humidity and dew point, drops wind, with explanatory copy', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: forecastWithWind });
    await page.goto('/');

    const panel = page.getByTestId('panel-weather-details');
    await expect(panel).toBeVisible();

    await expect(page.getByTestId('detail-humidity')).toContainText('62%');
    await expect(page.getByTestId('detail-humidity')).toContainText('relative humidity');
    await expect(page.getByTestId('detail-dew-point')).toContainText('12°');
    await expect(page.getByTestId('detail-dew-point')).toContainText('Comfortable');
    await expect(page.getByTestId('detail-dew-point')).toContainText('How humid the air feels.');
    await expect(page.getByTestId('detail-dew-point')).toContainText('Dew point measures the amount of moisture in the air. Higher values feel more humid.');

    // Vertical comfort scale: every band label plus a live marker at the value.
    const scale = page.locator('.dew-scale');
    await expect(scale).toBeVisible();
    await expect(scale).toHaveAttribute('aria-label', 'Dew point scale, currently 12° (Comfortable)');
    for (const band of ['Dry', 'Comfortable', 'Slightly humid', 'Humid', 'Very humid', 'Muggy']) {
      await expect(scale.getByText(band, { exact: true })).toHaveCount(1);
    }
    await expect
      .poll(async () => {
        const top = await page.locator('.dew-scale-marker').evaluate((element) => (element as HTMLElement).style.top);
        return Math.abs(parseFloat(top) - (12.1 / 26) * 100) < 1;
      })
      .toBe(true);

    // °F display still maps to the Celsius-based interpretation.
    await page.getByTestId('button-unit-fahrenheit').click();
    await expect(page.getByTestId('detail-dew-point')).toContainText('54°');
    await expect(page.getByTestId('detail-dew-point')).toContainText('Comfortable');

    // Wind is no longer part of The useful bits.
    await expect(page.getByTestId('detail-wind')).toHaveCount(0);
    await expect(page.getByTestId('detail-sunrise')).toBeVisible();
    await expect(page.getByTestId('detail-sunset')).toBeVisible();

    await expect(page.getByTestId('detail-feels-like')).toHaveCount(0);
    await expect(page.getByTestId('detail-rain-now')).toHaveCount(0);
    await expect(page.getByTestId('detail-day-ahead')).toHaveCount(0);
  });

  test('falls back to a computed dew point when the API value is absent', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: { ...FORECAST, current: { ...FORECAST.current, temperature_2m: 10, relative_humidity_2m: 50, dew_point_2m: undefined } } });
    await page.goto('/');
    await expect(page.getByTestId('detail-dew-point')).toContainText('0°');
    await expect(page.getByTestId('detail-dew-point')).toContainText('Dry');
  });

  test('stays localized and overflow-free at 320px', async ({ page }) => {
    await mockOpenMeteo(page, { forecast: forecastWithWind });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');

    const panel = page.getByTestId('panel-weather-details');
    await page.getByTestId('select-language').selectOption('fr');
    await expect(panel).toContainText('Humidité');
    await expect(panel).toContainText('Point de rosée');
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByTestId('select-language').selectOption('es');
    await expect(panel).toContainText('Humedad');
    await expect(panel).toContainText('Punto de rocío');
    overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('UV simplification', () => {
  test('shows one current value, the window text, timeline and future hourly UV', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');

    const panel = page.getByTestId('panel-uv-forecast');
    await expect(panel).toBeVisible();

    // A. Current UV appears once as the primary value.
    await expect(page.getByTestId('text-current-uv')).toHaveCount(1);
    await expect(page.getByTestId('text-current-uv')).toHaveText('2.5');

    // B. Protection window remains as text.
    await expect(page.getByTestId('text-uv-protection-window')).toContainText('Sun protection recommended');
    await expect(page.getByTestId('text-uv-protection-window')).toContainText('1 PM');

    // C. Timeline remains the single visual representation.
    await expect(page.getByTestId('uv-protection-timeline')).toBeVisible();

    // D/F. Future hourly progression remains, without a duplicate "Now" chip.
    await expect(page.getByTestId('list-hourly-uv')).toBeVisible();
    await expect(page.getByTestId('list-hourly-uv')).toContainText('1 PM');
    await expect(page.getByTestId('list-hourly-uv')).not.toContainText('Now');
    await expect(panel).not.toContainText('Now');

    // E. Compact 3-day outlook retained.
    await expect(page.getByTestId('list-daily-uv').locator('.uv-day')).toHaveCount(3);
  });

  test('handles no-window and unavailable states', async ({ page }) => {
    const noWindow = {
      ...FORECAST,
      current: { ...FORECAST.current, uv_index: 1 },
      hourly: { ...FORECAST.hourly, uv_index: FORECAST.hourly.time.map(() => 1) },
    };
    await mockOpenMeteo(page, { forecast: noWindow });
    await page.goto('/');
    await expect(page.getByTestId('text-uv-protection-window')).toContainText('No sun protection window expected today');

    const noUvData = {
      ...FORECAST,
      hourly: {
        time: FORECAST.hourly.time,
        temperature_2m: FORECAST.hourly.temperature_2m,
        precipitation_probability: FORECAST.hourly.precipitation_probability,
        weather_code: FORECAST.hourly.weather_code,
      },
    };
    await mockOpenMeteo(page, { forecast: noUvData });
    await page.reload();
    await expect(page.getByTestId('text-uv-protection-window')).toContainText('Sun protection window unavailable right now');
  });

  test('stays localized and overflow-free at 320px', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/');

    await page.getByTestId('select-language').selectOption('fr');
    await expect(page.getByTestId('text-uv-protection-window')).toContainText('Protection solaire conseillée');
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByTestId('select-language').selectOption('es');
    await expect(page.getByTestId('text-uv-protection-window')).toContainText('Protección solar recomendada');
    overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('regional comparison', () => {
  test('shows a plain-language comparison for UK locations', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');

    const panel = page.getByTestId('panel-micro-climate');
    await expect(panel).toBeVisible();
    await expect(page.locator('#micro-title')).toHaveText('Regional comparison');
    await expect(page.getByTestId('micro-row-temperature')).toBeVisible();
    await expect(page.getByTestId('micro-row-rainfall')).toBeVisible();
    await expect(panel).toContainText('Forecast');
    await expect(panel).toContainText('Model');

    // Legacy / overclaiming copy must be gone.
    await expect(panel).not.toContainText('Your Micro-Climate');
    await expect(panel).not.toContainText('LOCAL VARIANCE CHECK');
    await expect(panel).not.toContainText('No nearby sensor');
    await expect(panel).not.toContainText('Regional only');
  });

  test('hides outside the UK and never requests the UKV model there', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).hostname === 'api.open-meteo.com') requested.push(request.url());
    });
    await mockLocations(page);
    await page.goto('/');
    await expect(page.getByTestId('panel-micro-climate')).toBeVisible();
    // Wait for the comparison itself so the London UKV request is certainly
    // already issued before we start watching for out-of-region requests.
    await expect(page.getByTestId('micro-row-temperature')).toBeVisible();

    requested.length = 0;
    await page.getByTestId('input-location-search').fill('paris');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');
    await expect(page.getByTestId('panel-micro-climate')).toHaveCount(0);
    expect(requested.some((url) => url.includes('ukmo_seamless')), 'UKV request outside the UK').toBe(false);
  });

  test('renders no placeholder rows when model values are missing', async ({ page }) => {
    await page.route('**/api.open-meteo.com/**', (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('models') === 'ukmo_seamless') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ latitude: 51.51, longitude: -0.13, current: {} }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FORECAST) });
    });
    await page.route('**/air-quality-api.open-meteo.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(AIR),
    }));
    await page.goto('/');
    await expect(page.getByTestId('panel-micro-climate')).toHaveCount(0);
  });

  test('localizes the section title', async ({ page }) => {
    await mockOpenMeteo(page);
    await page.goto('/');
    await page.getByTestId('select-language').selectOption('fr');
    await expect(page.locator('#micro-title')).toHaveText('Comparaison régionale');
    await page.getByTestId('select-language').selectOption('es');
    await expect(page.locator('#micro-title')).toHaveText('Comparación regional');
  });
});

test.describe('weather loading', () => {
  test('a later location selection wins over an earlier one', async ({ page }) => {
    await mockLocations(page);
    await page.goto('/');

    await page.getByTestId('input-location-search').fill('paris');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Paris');
    await expect(page.getByTestId('text-current-temperature')).toHaveText('12°C');

    await page.getByTestId('input-location-search').fill('tokyo');
    await page.getByTestId('location-option-0').click();
    await expect(page.getByTestId('text-current-city')).toHaveText('Tokyo');
    await expect(page.getByTestId('text-current-temperature')).toHaveText('26°C');
  });
});
