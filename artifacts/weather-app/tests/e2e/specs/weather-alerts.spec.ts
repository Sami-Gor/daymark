import { expectAnimationsSettled } from '../support/animations';
import { expect, test } from '../support/fixtures';
import {
  PARIS_FORECAST,
  PARIS_SEARCH,
  TOKYO_RESULT,
  TOKYO_WINDY_FORECAST,
  WINDY_FORECAST,
} from '../support/test-data';

/*
 * Forecast-derived severe weather alerts: presence/absence, severity and
 * timing copy, narration and the Ask Daymark intent layer, location changes,
 * the selected location's clock, and the narrow-viewport accessibility pass.
 *
 * The default canonical forecast has no alert. Alert tests override the
 * forecast with WINDY_FORECAST before navigating; per-location tests use the
 * `api` fixture's geocoding + forecastByLatitude helpers.
 */

test.describe('weather alerts', () => {
  const TOKYO_SEARCH = { results: [TOKYO_RESULT] };

  test('shows nothing at all when there is no alert', async ({ alerts, dashboard, page }) => {
    await dashboard.goto('/');
    await expect(dashboard.currentTemperature).toBeVisible();
    await alerts.expectNone();
    await expect(page.getByText('No alerts')).toHaveCount(0);
    await expect(page.getByText('No warnings')).toHaveCount(0);
  });

  test('renders a forecast-derived risk with severity text and timing', async ({ alerts, api, dashboard }) => {
    await api.forecast(WINDY_FORECAST);
    await dashboard.goto('/');
    await alerts.expectAlert('wind');
    const alert = alerts.alert('wind');
    await expect(alert).toContainText('Strong winds expected');
    await expect(alert).toContainText('Severe risk');
    await expect(alert).toContainText('not an official warning');
    await expect(alerts.alertTime('wind')).toHaveText(/5 PM–6 PM/);
  });

  test('mentions the risk in the Hear today briefing', async ({ api, dashboard, speech, voice }) => {
    await api.forecast(WINDY_FORECAST);
    await dashboard.goto('/');
    await voice.startNarration();
    const spoken = await speech.spoken();
    expect(spoken[0]).toContain('Strong winds expected');
  });

  test('answers an alert question through the intent layer', async ({ api, dashboard, speech, voice }) => {
    await api.forecast(WINDY_FORECAST);
    await dashboard.goto('/');
    await voice.toggleListening();
    await speech.emitResult('Are there any warnings?');
    await speech.emitRecognitionEnd();
    await voice.expectAnswer('Strong winds expected');
  });

  test('replaces the alert when the selected location changes', async ({ alerts, api, dashboard, search }) => {
    await api.geocoding(PARIS_SEARCH);
    await api.forecastByLatitude([{ latitude: 48.8566, body: PARIS_FORECAST }], WINDY_FORECAST);
    await dashboard.goto('/');
    await alerts.expectAlert('wind');
    await search.search('paris');
    await search.selectOption(0);
    await dashboard.expectCity('Paris');
    await expect(alerts.list).toHaveCount(0);
  });

  test('uses the selected location clock for alert timing', async ({ alerts, api, dashboard, search }) => {
    await api.geocoding(TOKYO_SEARCH);
    await api.forecastByLatitude([{ latitude: 35.6762, body: TOKYO_WINDY_FORECAST }], WINDY_FORECAST);
    await dashboard.goto('/');
    await search.search('tokyo');
    await search.selectOption(0);
    await dashboard.expectCity('Tokyo');
    await expect(alerts.alertTime('wind')).toHaveText(/9 PM–10 PM/);
  });

  test('alert layout is clean at 320px with no serious accessibility issues', async ({ alerts, api, dashboard, page }) => {
    await api.forecast(WINDY_FORECAST);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dashboard.goto('/');
    await alerts.expectAlert('wind');
    expect(await dashboard.horizontalOverflow()).toBeLessThanOrEqual(0);
    const { AxeBuilder } = await import('@axe-core/playwright');
    // Reduced motion makes every animation a single 0.01 ms iteration; wait for
    // the browser to report no running/pending animation (finished ones stay in
    // document.getAnimations()) so axe measures final colours, not a blend.
    await expectAnimationsSettled(page);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious).toEqual([]);
  });
});
