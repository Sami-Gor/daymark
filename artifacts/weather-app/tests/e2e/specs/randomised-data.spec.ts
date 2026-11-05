import { expect, test } from '../support/fixtures';
import {
  buildForecastForScenario,
  CANONICAL_FORECAST,
  expectedTemperatureText,
  expectedUvText,
  generateWeatherScenario,
  pickLocationCase,
  type ForecastFixture,
  type WeatherScenario,
} from '../support/test-data';

/*
 * Randomised, boundary and invalid-input coverage.
 *
 * Every value here is generated from the per-test seeded RNG, so it is varied
 * between tests but fully reproducible. If one of these tests fails, the
 * fixture prints and attaches the seed; rerun with DAYMARK_E2E_SEED=<seed> to
 * get exactly the same data.
 *
 * The canonical regression fixtures remain untouched and continue to drive the
 * deterministic suites.
 */

function scenarioWith(overrides: Partial<WeatherScenario>): WeatherScenario {
  return {
    temperatureC: 18.3,
    apparentC: 17.5,
    humidity: 60,
    rainProbability: 25,
    uvIndex: 3,
    aqi: 40,
    ...overrides,
  };
}

/** Format a percentage exactly like the UI does in English. */
function formatPercent(value: number): string {
  return new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 0 }).format(value / 100);
}

function expectedUvLabel(value: number): string {
  if (value < 3) return 'Low';
  if (value < 6) return 'Moderate';
  if (value < 8) return 'High';
  if (value < 11) return 'Very high';
  return 'Extreme';
}

function forecastWithRain(probability: number): ForecastFixture {
  return {
    ...CANONICAL_FORECAST,
    hourly: {
      ...CANONICAL_FORECAST.hourly,
      precipitation_probability: CANONICAL_FORECAST.hourly.time.map(() => probability),
    },
    daily: {
      ...CANONICAL_FORECAST.daily,
      precipitation_probability_max: CANONICAL_FORECAST.daily.time.map(() => probability),
    },
  };
}

test.describe('randomised and boundary weather data', () => {
  test('renders generated temperatures in °C and °F', async ({ api, dashboard, random }) => {
    for (let sample = 0; sample < 3; sample += 1) {
      const scenario = generateWeatherScenario(random);
      await api.forecast(buildForecastForScenario(scenario));
      await dashboard.goto('/');
      await dashboard.expectReady();
      await dashboard.expectTemperature(expectedTemperatureText(scenario.temperatureC));

      await dashboard.selectUnit('fahrenheit');
      await dashboard.expectTemperature(expectedTemperatureText(scenario.temperatureC, 'fahrenheit'));

      // A reload returns to the default Celsius unit for the next sample.
      await dashboard.selectUnit('celsius');
      await dashboard.expectTemperature(expectedTemperatureText(scenario.temperatureC));
    }
  });

  test('renders generated rain probabilities and highlights the peak', async ({ api, dashboard, sections, random }) => {
    const scenario = generateWeatherScenario(random);
    const forecast = buildForecastForScenario(scenario);
    const displayed = forecast.hourly.precipitation_probability.slice(0, 5);
    const expected = displayed.map((value) => formatPercent(value!));
    const peak = Math.max(...displayed.map((value) => value!));

    await api.forecast(forecast);
    await dashboard.goto('/');
    await dashboard.expectReady();

    await sections.expectRainValues(expected);
    await expect(sections.rainPeak).toHaveText(formatPercent(peak));
    if (peak > 0) {
      await expect(sections.rainPeakNote).toContainText('Highest around');
    } else {
      await expect(sections.rainPeakNote).toContainText('No rain expected');
    }
  });

  test('renders generated UV values with the expected level', async ({ api, dashboard, sections, random }) => {
    const scenario = generateWeatherScenario(random);
    await api.forecast(buildForecastForScenario(scenario));
    await dashboard.goto('/');
    await dashboard.expectReady();

    await sections.expectCurrentUv(expectedUvText(scenario.uvIndex));
    await expect(sections.uvPanel.locator('.uv-badge')).toHaveText(expectedUvLabel(scenario.uvIndex));
  });

  test('handles temperature boundaries without layout overflow on a narrow phone', async ({ api, page, dashboard, random }) => {
    const boundaries = [-50, -0.4, 0, 60];
    for (const temperatureC of boundaries) {
      const scenario = generateWeatherScenario(random);
      await api.forecast(buildForecastForScenario({ ...scenario, temperatureC }));
      await page.setViewportSize({ width: 320, height: 900 });
      await dashboard.goto('/');
      await dashboard.expectReady();

      await dashboard.expectTemperature(expectedTemperatureText(temperatureC));
      await dashboard.selectUnit('fahrenheit');
      await dashboard.expectTemperature(expectedTemperatureText(temperatureC, 'fahrenheit'));
      expect(await dashboard.horizontalOverflow()).toBeLessThanOrEqual(0);
    }
  });

  test('handles no-rain and all-rain boundaries', async ({ api, dashboard, sections }) => {
    await api.forecast(forecastWithRain(0));
    await dashboard.goto('/');
    await dashboard.expectReady();
    await expect(sections.rainPeak).toHaveText('0%');
    await expect(sections.rainPeakNote).toContainText('No rain expected');
    await sections.expectRainValues(['0%', '0%', '0%', '0%', '0%']);

    await api.forecast(forecastWithRain(100));
    await dashboard.goto('/');
    await dashboard.expectReady();
    await expect(sections.rainPeak).toHaveText('100%');
    await expect(sections.rainPeakNote).toContainText('Highest around');
    await sections.expectRainValues(['100%', '100%', '100%', '100%', '100%']);
  });

  test('shows a friendly error instead of crashing on non-numeric API values', async ({ api, dashboard }) => {
    await api.forecast({
      ...CANONICAL_FORECAST,
      current: { ...CANONICAL_FORECAST.current, temperature_2m: 'hot' },
    });
    await dashboard.goto('/');
    await expect(dashboard.errorPanel).toBeVisible();
    await expect(dashboard.errorPanel).toContainText('unexpected shape');
    await dashboard.expectBrand();
  });

  test('renders empty states when the API omits its optional series', async ({ api, dashboard, sections }) => {
    await api.forecast({
      current: CANONICAL_FORECAST.current,
      hourly: { time: [], temperature_2m: [], precipitation_probability: [], weather_code: [], uv_index: [] },
      daily: {
        time: [],
        weather_code: [],
        temperature_2m_max: [],
        temperature_2m_min: [],
        precipitation_probability_max: [],
        sunrise: [],
        sunset: [],
        uv_index_max: [],
      },
    });
    await dashboard.goto('/');
    await dashboard.expectReady();

    await expect(dashboard.errorPanel).toHaveCount(0);
    await expect(sections.hourlyForecast.locator('.atmos-empty')).toBeVisible();
    await expect(sections.rainProbability.locator('.atmos-empty')).toBeVisible();
    await expect(sections.dailyForecast).toContainText('extended outlook');
  });

  test('renders a missing current temperature as unavailable', async ({ api, dashboard }) => {
    await api.forecast({
      ...CANONICAL_FORECAST,
      current: { ...CANONICAL_FORECAST.current, temperature_2m: null },
    });
    await dashboard.goto('/');
    await dashboard.expectCity('London');
    await expect(dashboard.currentTemperature).toContainText('—');
    await expect(dashboard.errorPanel).toHaveCount(0);
  });

  test('loads the location produced by the seeded random choice', async ({ api, dashboard, search, random }) => {
    const location = pickLocationCase(random);
    await api.locations();
    await dashboard.goto('/');
    await dashboard.expectReady();

    await search.searchAndSelect(location.query);
    await dashboard.expectCity(location.city);
    await dashboard.expectTemperature(expectedTemperatureText(location.forecast.current.temperature_2m!));
  });

  test('ignores search queries shorter than two characters', async ({ dashboard, search, requests }) => {
    await dashboard.goto('/');
    await dashboard.expectReady();
    requests.clear();

    await search.search('a');
    await search.input.press(' ');
    await dashboard.page.waitForTimeout(500);

    expect(requests.geocoding()).toEqual([]);
    await expect(search.results).toHaveCount(0);
  });

  test('shows a search error for malformed geocoding results', async ({ api, dashboard, search }) => {
    await api.geocoding({ results: [{ name: 'Broken' }] });
    await dashboard.goto('/');
    await dashboard.expectReady();

    await search.search('broken');
    await expect(search.status).toContainText('Location search is unavailable right now.');
  });
});
