import { expect, test } from '../support/fixtures';
import { CANONICAL_FORECAST } from '../support/test-data';

/*
 * Core weather dashboard behaviour: first paint, the default location, unit
 * conversion, the live sections and the typed error states.
 *
 * Network stubbing is provided by the `api` fixture; tests that need different
 * data register an override before navigating. The canonical default tests use
 * a beforeEach for the shared navigation step.
 */

test.describe('weather dashboard', () => {
  test('loads with Daymark branding, London default, and no geolocation request', async ({ page, dashboard }) => {
    await page.addInitScript(() => {
      const state = { calls: 0 };
      (window as unknown as { __geoCalls: number }).__geoCalls = 0;
      const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = (...args) => {
        state.calls += 1;
        (window as unknown as { __geoCalls: number }).__geoCalls = state.calls;
        return original(...args);
      };
    });
    // The init script must be in place before the app's first render.
    await dashboard.open();

    await dashboard.expectCity('London');
    await dashboard.expectBrand();
    await dashboard.expectTemperature('20°C');
    // Regression guard for the original missing-await finding: this assertion
    // must be awaited or it never runs.
    await expect(dashboard.currentTemperature).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(0);
  });

  test.describe('with the canonical forecast', () => {
    test.beforeEach(async ({ dashboard }) => {
      await dashboard.open();
    });

    test('°C / °F toggle converts and updates aria-pressed', async ({ dashboard }) => {
      await dashboard.expectTemperature('20°C');

      await dashboard.selectUnit('fahrenheit');
      await dashboard.expectTemperature('69°F');
      await expect(dashboard.fahrenheitButton).toHaveAttribute('aria-pressed', 'true');
      await expect(dashboard.celsiusButton).toHaveAttribute('aria-pressed', 'false');

      await dashboard.selectUnit('celsius');
      await dashboard.expectTemperature('20°C');
    });

    test('renders hourly, 3-day forecast, 3-day UV, air quality, and micro-climate', async ({ page, sections }) => {
      await expect(sections.temperatureDots).toHaveCount(5);
      await expect(sections.rainPoints).toHaveCount(5);
      await expect(page.getByTestId('list-daily-forecast').locator('.day-row')).toHaveCount(3);
      await expect(sections.uvDailyRows).toHaveCount(3);
      await expect(sections.uvProtectionWindow).toContainText('Sun protection recommended');
      await expect(sections.uvProtectionTimeline).toBeVisible();
      await expect(sections.airQualityPanel).toBeVisible();
      await expect(sections.airContext).toBeVisible();
      await expect(sections.microClimatePanel).toBeVisible();
    });
  });

  test('shows a loading state first, then content', async ({ api, dashboard }) => {
    await api.delayForecast(600);
    await dashboard.goto('/');
    await expect(dashboard.loadingLayout).toBeVisible();
    await dashboard.expectTemperature('20°C');
    await expect(dashboard.loadingLayout).toHaveCount(0);
  });

  test('HTTP 500 shows the error panel and retry recovers', async ({ page, dashboard }) => {
    let failing = true;
    await page.route('**/api.open-meteo.com/**', async (route) => {
      if (failing) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{"reason":"boom"}' });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CANONICAL_FORECAST) });
      }
    });
    await dashboard.goto('/');
    await dashboard.expectWeatherError("Weather data isn't available right now");

    failing = false;
    await dashboard.retryWeather();
    await dashboard.expectWeatherRecovered();
    await dashboard.expectTemperature('20°C');
  });

  test('network failure shows friendly copy without raw browser text', async ({ api, dashboard }) => {
    await api.offline();
    await dashboard.goto('/');
    await dashboard.expectWeatherError("We couldn't reach the weather service");
    await expect(dashboard.errorPanel).not.toContainText('Failed to fetch');
    await expect(dashboard.errorRetryButton).toBeVisible();
  });

  test('malformed API data shows a friendly error without crashing the page', async ({ api, dashboard }) => {
    await api.forecast({ current: 'garbage', hourly: 42 });
    await dashboard.goto('/');
    await dashboard.expectWeatherError('unexpected shape');
    // The page itself is alive: footer and error controls are present.
    await dashboard.expectBrand();
  });

  test('HTTP 429 is handled without a retry loop', async ({ page, dashboard }) => {
    let calls = 0;
    await page.route('**/api.open-meteo.com/**', async (route) => {
      calls += 1;
      await route.fulfill({ status: 429, contentType: 'application/json', body: '{"reason":"rate limited"}' });
    });
    await dashboard.goto('/');
    await dashboard.expectWeatherError("Weather data isn't available right now");
    // Give the app a moment it would use for an automatic retry, then assert none happened.
    await page.waitForTimeout(1500);
    expect(calls).toBeLessThanOrEqual(2); // one forecast + one air-quality request, nothing more
  });
});

test.describe('hero action hierarchy', () => {
  test.beforeEach(async ({ dashboard, speech }) => {
    // Requesting `speech` in the hook installs the stubs before navigation.
    void speech;
    await dashboard.open();
  });

  test('keeps all four actions with Hear today under the cue and search first in the tools row', async ({ page, dashboard, voice, search }) => {
    await expect(search.input).toBeVisible();
    await expect(dashboard.heroLocationButton).toBeVisible();
    await expect(voice.hearTodayButton).toBeVisible();
    await expect(voice.askButton).toBeVisible();

    const cuePrecedesHearToday = await page.evaluate(() => {
      const cue = document.querySelector('[data-testid="day-cue"]');
      const hear = document.querySelector('[data-testid="button-hear-today"]');
      if (!cue || !hear) return false;
      return (cue.compareDocumentPosition(hear) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    expect(cuePrecedesHearToday).toBe(true);

    const searchPrecedesTools = await page.evaluate(() => {
      const searchInput = document.querySelector('[data-testid="input-location-search"]');
      const tools = ['button-refresh-location', 'button-ask-daymark']
        .map((id) => document.querySelector(`[data-testid="${id}"]`));
      if (!searchInput || tools.some((node) => !node)) return false;
      return tools.every((node) => (searchInput.compareDocumentPosition(node!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
    });
    expect(searchPrecedesTools).toBe(true);
  });

  test('keeps every hero control visible and unclipped at 320px', async ({ page, dashboard, voice, search }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    // Re-navigate at the narrow viewport so the assertion sees the real layout.
    await dashboard.goto('/');
    await dashboard.expectReady();

    expect(await dashboard.horizontalOverflow()).toBeLessThanOrEqual(0);
    await expect(search.input).toBeVisible();
    await expect(dashboard.heroLocationButton).toBeVisible();
    await expect(voice.hearTodayButton).toBeVisible();
    await expect(voice.askButton).toBeVisible();
    await expect(voice.askPrivacy).toBeVisible();
  });

  test('keeps localized hero labels visible in French and Spanish', async ({ dashboard, voice }) => {
    await dashboard.setLanguage('fr');
    await expect(dashboard.heroLocationButton).toHaveText(/Utiliser ma position/);
    await expect(voice.hearTodayButton).toContainText(/Écouter/);
    await expect(voice.askButton).toContainText(/Demander à Daymark/);

    await dashboard.setLanguage('es');
    await expect(dashboard.heroLocationButton).toHaveText(/Usar mi ubicación/);
    await expect(voice.hearTodayButton).toContainText(/Escuchar/);
    await expect(voice.askButton).toContainText(/Preguntar a Daymark/);
  });
});
