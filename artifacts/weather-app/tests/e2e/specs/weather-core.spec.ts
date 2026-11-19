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
    await expect(dashboard.errorPanel).toBeVisible();
    await expect(dashboard.errorPanel).toContainText("Weather data isn't available right now");

    failing = false;
    await dashboard.retryWeather();
    await dashboard.expectTemperature('20°C');
  });

  test('network failure shows friendly copy without raw browser text', async ({ api, dashboard }) => {
    await api.offline();
    await dashboard.goto('/');
    await expect(dashboard.errorPanel).toBeVisible();
    await expect(dashboard.errorPanel).toContainText("We couldn't reach the weather service");
    await expect(dashboard.errorPanel).not.toContainText('Failed to fetch');
    await expect(dashboard.errorRetryButton).toBeVisible();
  });

  test('malformed API data shows a friendly error without crashing the page', async ({ api, dashboard }) => {
    await api.forecast({ current: 'garbage', hourly: 42 });
    await dashboard.goto('/');
    await expect(dashboard.errorPanel).toBeVisible();
    await expect(dashboard.errorPanel).toContainText('unexpected shape');
    // The page itself is alive: footer and error controls are present.
    await dashboard.expectBrand();
  });
});

test.describe('hero action hierarchy', () => {
  test.beforeEach(async ({ dashboard }) => {
    await dashboard.open();
  });

  test('keeps the search and location actions with no web voice controls', async ({ page, dashboard, search }) => {
    await expect(search.input).toBeVisible();
    await expect(dashboard.heroLocationButton).toBeVisible();
    await expect(dashboard.celsiusButton).toBeVisible();
    await expect(dashboard.webDemoNote).toBeVisible();
    // V2 voice is Android-native only: the web hero has no Hear today/Ask Daymark.
    await dashboard.expectVoiceControlsHidden();

    const cuePrecedesSearch = await page.evaluate(() => {
      const cue = document.querySelector('[data-testid="day-cue"]');
      const searchInput = document.querySelector('[data-testid="input-location-search"]');
      if (!cue || !searchInput) return false;
      return (cue.compareDocumentPosition(searchInput) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    expect(cuePrecedesSearch).toBe(true);

    const searchPrecedesTools = await page.evaluate(() => {
      const searchInput = document.querySelector('[data-testid="input-location-search"]');
      // The hero tools row puts the search field before the "Use my location"
      // action. (The topbar crosshair is a separate, earlier control.)
      const locationAction = document.querySelector('[data-testid="button-refresh-location"]');
      if (!searchInput || !locationAction) return false;
      return (searchInput.compareDocumentPosition(locationAction) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    expect(searchPrecedesTools).toBe(true);
  });

  test('keeps every hero control visible and unclipped at 320px', async ({ page, dashboard, search }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    // Re-navigate at the narrow viewport so the assertion sees the real layout.
    await dashboard.goto('/');
    await dashboard.expectReady();

    expect(await dashboard.horizontalOverflow()).toBeLessThanOrEqual(0);
    await expect(search.input).toBeVisible();
    await expect(dashboard.heroLocationButton).toBeVisible();
    await expect(dashboard.webDemoNote).toBeVisible();
    await dashboard.expectVoiceControlsHidden();
  });

  test('keeps localized hero labels visible in French and Spanish', async ({ dashboard }) => {
    await dashboard.setLanguage('fr');
    await expect(dashboard.heroLocationButton).toHaveText(/Utiliser ma position/);
    await expect(dashboard.webDemoNote).toContainText('Démo web');
    await dashboard.expectVoiceControlsHidden();

    await dashboard.setLanguage('es');
    await expect(dashboard.heroLocationButton).toHaveText(/Usar mi ubicación/);
    await expect(dashboard.webDemoNote).toContainText('Demo web');
    await dashboard.expectVoiceControlsHidden();
  });
});
