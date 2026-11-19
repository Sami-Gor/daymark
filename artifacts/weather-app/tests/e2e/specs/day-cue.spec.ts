import { expect, test } from '../support/fixtures';
import { CANONICAL_FORECAST } from '../support/test-data';

/*
 * The Today hero day cue: a single emoji cue (sun, rain, mixed or neutral) with
 * an accessible label, no explanatory advice cards, and the narration control
 * beneath it. Custom forecasts are registered through the `api` fixture before
 * navigation so the cue logic is exercised with wet, mixed and neutral days.
 *
 * The canonical mocks are installed automatically; overrides below are
 * registered before navigating and therefore take precedence.
 */

test.describe('day cue hero', () => {
  const rainEverywhere = {
    ...CANONICAL_FORECAST,
    current: { ...CANONICAL_FORECAST.current, cloud_cover: 90, uv_index: 1 },
    hourly: {
      ...CANONICAL_FORECAST.hourly,
      precipitation_probability: CANONICAL_FORECAST.hourly.time.map(() => 80),
      weather_code: CANONICAL_FORECAST.hourly.time.map(() => 61),
    },
  };
  const mixedDay = {
    ...CANONICAL_FORECAST,
    hourly: {
      ...CANONICAL_FORECAST.hourly,
      precipitation_probability: CANONICAL_FORECAST.hourly.time.map((_, index) => (index % 2 ? 50 : 5)),
      weather_code: CANONICAL_FORECAST.hourly.time.map((_, index) => (index % 2 ? 61 : 0)),
    },
  };
  const dryOvercast = {
    ...CANONICAL_FORECAST,
    hourly: {
      ...CANONICAL_FORECAST.hourly,
      precipitation_probability: CANONICAL_FORECAST.hourly.time.map(() => 10),
      weather_code: CANONICAL_FORECAST.hourly.time.map(() => 3),
    },
  };

  test('shows one visual cue with no explanatory text and Hear today underneath', async ({ page, dashboard, voice, speech }) => {
    // Requesting `speech` installs the playback stub before navigation.
    void speech;
    await dashboard.open();

    await expect(dashboard.dayCue).toBeVisible();
    await expect(dashboard.dayCue).toHaveText('😎');
    await expect(dashboard.dayCue).toHaveAttribute('aria-label', 'Sunny conditions today');
    const hero = page.locator('.today-hero');
    await expect(hero).not.toContainText('Sunglasses');
    await expect(hero).not.toContainText('Umbrella?');
    const cueBox = await dashboard.dayCue.boundingBox();
    const hearBox = await voice.hearTodayButton.boundingBox();
    expect(hearBox!.y).toBeGreaterThan(cueBox!.y);
    await expect(voice.hearTodayButton).toBeVisible();
    await expect(voice.hearTodayButton).toHaveText(/Hear today/);
  });

  test('renders the rain cue for a wet day', async ({ api, dashboard }) => {
    await api.forecast(rainEverywhere);
    await dashboard.open();
    await expect(dashboard.dayCue).toHaveText('☔');
    await expect(dashboard.dayCue).toHaveAttribute('aria-label', 'Rain expected today');
  });

  test('renders the mixed cue when sun and showers share the day', async ({ api, dashboard }) => {
    await api.forecast(mixedDay);
    await dashboard.open();
    await expect(dashboard.dayCue).toHaveText('😎☔');
    await expect(dashboard.dayCue).toHaveAttribute('aria-label', 'Sunshine and rain expected today');
  });

  test('renders the neutral cue when neither sunglasses nor umbrella is warranted', async ({ api, dashboard }) => {
    await api.forecast(dryOvercast);
    await dashboard.open();
    await expect(dashboard.dayCue).toHaveText('☁️');
    await expect(dashboard.dayCue).toHaveAttribute('aria-label', 'Cloudy conditions today');
  });

  test('localizes the cue label in EN, FR and ES', async ({ dashboard }) => {
    await dashboard.open();
    await expect(dashboard.dayCue).toHaveAttribute('aria-label', 'Sunny conditions today');
    await dashboard.setLanguage('fr');
    await expect(dashboard.dayCue).toHaveAttribute('aria-label', 'Temps ensoleillé aujourd’hui');
    await dashboard.setLanguage('es');
    await expect(dashboard.dayCue).toHaveAttribute('aria-label', 'Condiciones soleadas hoy');
  });

  test('does not render the redundant umbrella or sunglasses advice cards', async ({ page, dashboard }) => {
    await dashboard.open();
    await expect(page.getByTestId('card-umbrella-advice')).toHaveCount(0);
    await expect(page.getByTestId('card-sunglasses-advice')).toHaveCount(0);
    await expect(page.getByTestId('text-umbrella-advice')).toHaveCount(0);
    await expect(page.getByTestId('text-sunglasses-advice')).toHaveCount(0);
    await expect(page.locator('.advice-card, .advice-row')).toHaveCount(0);
  });

  test('keeps the detailed forecast stack reachable below the hero', async ({ dashboard, sections }) => {
    await dashboard.open();
    const panels = [
      sections.hourlyForecast,
      sections.dailyForecast,
      sections.weatherDetailsPanel,
      sections.microClimatePanel,
      sections.uvPanel,
      sections.airQualityPanel,
    ];
    for (const panel of panels) {
      await panel.scrollIntoViewIfNeeded();
      await expect(panel).toBeVisible();
    }
  });

  test('renders the cue without animation under reduced motion', async ({ page, dashboard }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dashboard.open();
    const emoji = dashboard.dayCue.locator('.day-cue-emoji').first();
    await expect(emoji).toBeVisible();
    const duration = await emoji.evaluate((element) => getComputedStyle(element).animationDuration);
    expect(parseFloat(duration)).toBeLessThanOrEqual(0.01);
  });
});
