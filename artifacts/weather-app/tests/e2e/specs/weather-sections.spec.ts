import { expect, test } from '../support/fixtures';
import { CANONICAL_FORECAST } from '../support/test-data';

/*
 * The weather sections below the hero: humidity/dew point details, the
 * simplified UV forecast and the UK regional (micro-climate) comparison.
 *
 * Default mocks come from the `api` fixture. Tests that need bespoke payloads
 * register an override before navigating; layout maths uses raw page evaluate
 * where no page-object helper exists.
 */

test.describe('weather details (humidity and dew point)', () => {
  const forecastWithWind = {
    ...CANONICAL_FORECAST,
    current: { ...CANONICAL_FORECAST.current, wind_speed_10m: 14, wind_gusts_10m: 22 },
  };

  test('shows humidity and dew point, drops wind, with explanatory copy', async ({ api, page, dashboard, sections }) => {
    await api.forecast(forecastWithWind);
    await dashboard.open();

    await expect(sections.weatherDetailsPanel).toBeVisible();

    await expect(sections.humidity).toContainText('62%');
    await expect(sections.humidity).toContainText('relative humidity');
    await expect(sections.dewPoint).toContainText('12°');
    await expect(sections.dewPoint).toContainText('Comfortable');
    await expect(sections.dewPoint).toContainText('How humid the air feels.');
    await expect(sections.dewPoint).toContainText('Dew point measures the amount of moisture in the air. Higher values feel more humid.');

    // Vertical comfort scale: every band label plus a live marker at the value.
    const scale = sections.dewScale;
    await expect(scale).toBeVisible();
    await expect(scale).toHaveAttribute('aria-label', 'Dew point scale, currently 12° (Comfortable)');
    for (const band of ['Dry', 'Comfortable', 'Slightly humid', 'Humid', 'Very humid', 'Muggy']) {
      await expect(scale.getByText(band, { exact: true })).toHaveCount(1);
    }
    await expect
      .poll(async () => {
        const top = await sections.dewMarker.evaluate((element) => (element as HTMLElement).style.top);
        return Math.abs(parseFloat(top) - (12.1 / 26) * 100) < 1;
      })
      .toBe(true);

    // °F display still maps to the Celsius-based interpretation.
    await dashboard.selectUnit('fahrenheit');
    await expect(sections.dewPoint).toContainText('54°');
    await expect(sections.dewPoint).toContainText('Comfortable');

    // Wind is no longer part of The useful bits.
    await expect(page.getByTestId('detail-wind')).toHaveCount(0);
    await expect(sections.sunrise).toBeVisible();
    await expect(sections.sunset).toBeVisible();

    await expect(page.getByTestId('detail-feels-like')).toHaveCount(0);
    await expect(page.getByTestId('detail-rain-now')).toHaveCount(0);
    await expect(page.getByTestId('detail-day-ahead')).toHaveCount(0);
  });

  test('falls back to a computed dew point when the API value is absent', async ({ api, dashboard, sections }) => {
    await api.forecast({
      ...CANONICAL_FORECAST,
      current: { ...CANONICAL_FORECAST.current, temperature_2m: 10, relative_humidity_2m: 50, dew_point_2m: undefined },
    });
    await dashboard.open();
    await expect(sections.dewPoint).toContainText('0°');
    await expect(sections.dewPoint).toContainText('Dry');
  });

  test('stays localized and overflow-free at 320px', async ({ api, page, dashboard, sections }) => {
    await api.forecast(forecastWithWind);
    await page.setViewportSize({ width: 320, height: 900 });
    await dashboard.open();

    await dashboard.setLanguage('fr');
    await expect(sections.weatherDetailsPanel).toContainText('Humidité');
    await expect(sections.weatherDetailsPanel).toContainText('Point de rosée');
    expect(await dashboard.horizontalOverflow()).toBeLessThanOrEqual(0);

    await dashboard.setLanguage('es');
    await expect(sections.weatherDetailsPanel).toContainText('Humedad');
    await expect(sections.weatherDetailsPanel).toContainText('Punto de rocío');
    expect(await dashboard.horizontalOverflow()).toBeLessThanOrEqual(0);
  });
});

test.describe('UV forecast and protection window', () => {
  test('shows one current value, the window text, timeline and future hourly UV', async ({ page, dashboard, sections }) => {
    await dashboard.open();

    await expect(sections.uvPanel).toBeVisible();

    // A. Current UV appears once as the primary value.
    await expect(sections.currentUv).toHaveCount(1);
    await expect(sections.currentUv).toHaveText('2.5');

    // B. Protection window remains as text.
    await expect(sections.uvProtectionWindow).toContainText('Sun protection recommended');
    await expect(sections.uvProtectionWindow).toContainText('1 PM');

    // C. Timeline remains the single visual representation.
    await expect(sections.uvProtectionTimeline).toBeVisible();

    // D/F. Future hourly progression remains, without a duplicate "Now" chip.
    await expect(sections.uvHourlyList).toBeVisible();
    await expect(sections.uvHourlyList).toContainText('1 PM');
    await expect(sections.uvHourlyList).not.toContainText('Now');
    await expect(sections.uvPanel).not.toContainText('Now');

    // E. Compact 3-day outlook retained.
    await expect(sections.uvDailyRows).toHaveCount(3);
  });

  test('handles no-window and unavailable states', async ({ api, page, dashboard, sections }) => {
    const noWindow = {
      ...CANONICAL_FORECAST,
      current: { ...CANONICAL_FORECAST.current, uv_index: 1 },
      hourly: { ...CANONICAL_FORECAST.hourly, uv_index: CANONICAL_FORECAST.hourly.time.map(() => 1) },
    };
    await api.forecast(noWindow);
    await dashboard.open();
    await expect(sections.uvProtectionWindow).toContainText('No sun protection window expected today');

    const noUvData = {
      ...CANONICAL_FORECAST,
      hourly: {
        time: CANONICAL_FORECAST.hourly.time,
        temperature_2m: CANONICAL_FORECAST.hourly.temperature_2m,
        precipitation_probability: CANONICAL_FORECAST.hourly.precipitation_probability,
        weather_code: CANONICAL_FORECAST.hourly.weather_code,
      },
    };
    await api.forecast(noUvData);
    await page.reload();
    await expect(sections.uvProtectionWindow).toContainText('Sun protection window unavailable right now');
  });

  test('stays localized and overflow-free at 320px', async ({ page, dashboard, sections }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await dashboard.open();

    await dashboard.setLanguage('fr');
    await expect(sections.uvProtectionWindow).toContainText('Protection solaire conseillée');
    expect(await dashboard.horizontalOverflow()).toBeLessThanOrEqual(0);

    await dashboard.setLanguage('es');
    await expect(sections.uvProtectionWindow).toContainText('Protección solar recomendada');
    expect(await dashboard.horizontalOverflow()).toBeLessThanOrEqual(0);
  });
});

test.describe('regional model comparison', () => {
  test('shows a plain-language comparison for UK locations', async ({ page, dashboard, sections }) => {
    await dashboard.open();

    await expect(sections.microClimatePanel).toBeVisible();
    await expect(page.locator('#micro-title')).toHaveText('Regional comparison');
    const temperatureRow = sections.microRow('temperature');
    const rainfallRow = sections.microRow('rainfall');
    await expect(temperatureRow).toBeVisible();
    await expect(rainfallRow).toBeVisible();
    await expect(sections.microClimatePanel).toContainText('Forecast');
    await expect(sections.microClimatePanel).toContainText('Model');

    // Legacy / overclaiming copy must be gone.
    await expect(sections.microClimatePanel).not.toContainText('Your Micro-Climate');
    await expect(sections.microClimatePanel).not.toContainText('LOCAL VARIANCE CHECK');
    await expect(sections.microClimatePanel).not.toContainText('No nearby sensor');
    await expect(sections.microClimatePanel).not.toContainText('Regional only');
  });

  test('hides outside the UK and never requests the UKV model there', async ({ api, dashboard, requests, search, sections }) => {
    await api.locations();
    await dashboard.open();
    await expect(sections.microClimatePanel).toBeVisible();
    // Wait for the comparison itself so the London UKV request is certainly
    // already issued before we start watching for out-of-region requests.
    const temperatureRow = sections.microRow('temperature');
    await expect(temperatureRow).toBeVisible();

    requests.clear();
    await search.searchAndSelect('paris');
    await dashboard.expectCity('Paris');
    await expect(sections.microClimatePanel).toHaveCount(0);
    expect(requests.forecast().some((url) => url.includes('ukmo_seamless')), 'UKV request outside the UK').toBe(false);
  });

  test('renders no placeholder rows when model values are missing', async ({ page, dashboard, sections }) => {
    await page.route('**/api.open-meteo.com/**', (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('models') === 'ukmo_seamless') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ latitude: 51.51, longitude: -0.13, current: {} }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CANONICAL_FORECAST) });
    });
    // The air-quality endpoint keeps the canonical default from the api fixture.
    await dashboard.goto('/');
    await expect(sections.microClimatePanel).toHaveCount(0);
  });

  test('localizes the section title', async ({ page, dashboard }) => {
    await dashboard.open();
    await dashboard.setLanguage('fr');
    await expect(page.locator('#micro-title')).toHaveText('Comparaison régionale');
    await dashboard.setLanguage('es');
    await expect(page.locator('#micro-title')).toHaveText('Comparación regional');
  });
});
