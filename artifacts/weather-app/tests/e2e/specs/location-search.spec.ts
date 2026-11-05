import { expect, test } from '../support/fixtures';

/*
 * Location search: the debounced combobox, per-location weather updates,
 * keyboard selection, the no-results state and the stale-search guard.
 *
 * Multi-location stubs come from the `api` fixture's locations() helper. It
 * keeps the original 500 ms delay for the "paris" query so the in-flight abort
 * path is still exercised, and serves per-latitude forecasts (Paris, Tokyo,
 * canonical fallback). Tests that need to inspect traffic use `requests`.
 */

test.describe('location search', () => {
  test('search control is visible and shows region for results', async ({ api, dashboard, search }) => {
    await api.locations();
    await dashboard.goto('/');
    await expect(search.input).toBeVisible();
    await search.search('paris');
    await expect(search.option(0)).toContainText('Paris');
    await expect(search.option(0)).toContainText('Île-de-France, France');
  });

  test('selecting a result updates the weather for that location', async ({ api, dashboard, search }) => {
    await api.locations();
    await dashboard.goto('/');
    await dashboard.expectCity('London');
    await search.search('paris');
    await search.selectOption(0);
    await dashboard.expectCity('Paris');
    await dashboard.expectTemperature('12°C');
    await expect(search.input).toHaveValue('');
  });

  test('results are keyboard selectable', async ({ api, dashboard, search }) => {
    await api.locations();
    await dashboard.goto('/');
    await search.search('tokyo');
    await expect(search.option(0)).toBeVisible();
    await search.pressArrowDown();
    await expect(search.option(0)).toHaveAttribute('aria-selected', 'true');
    await search.pressEnter();
    await dashboard.expectCity('Tokyo');
  });

  test('duplicate names are disambiguated and the chosen one is used', async ({ api, dashboard, requests, search }) => {
    await api.locations();
    await dashboard.goto('/');
    requests.clear();
    await search.search('springfield');
    await expect(search.option(0)).toContainText('Illinois');
    await expect(search.option(1)).toContainText('Missouri');
    await search.selectOption(1);
    await dashboard.expectCity('Springfield');
    const chosen = requests.forecast().find((url) => url.includes('latitude=37.2153'));
    expect(chosen).toBeTruthy();
  });

  test('shows a no-results state', async ({ api, dashboard, search }) => {
    await api.locations();
    await dashboard.goto('/');
    await search.search('zzzzz');
    await expect(search.status).toHaveText('No places found');
  });

  test('the latest query wins when an older search is still in flight', async ({ api, dashboard, page, search }) => {
    await api.locations();
    await dashboard.goto('/');
    await search.search('paris');
    await page.waitForTimeout(300); // paris request is now in flight (delayed 500ms)
    await search.search('tokyo');
    await expect(search.option(0)).toContainText('Tokyo');
    await page.waitForTimeout(600); // paris would have resolved by now
    await expect(search.option(0)).toContainText('Tokyo');
    await expect(search.results).not.toContainText('Paris');
  });

  test('voice uses the selected location', async ({ api, dashboard, search, speech, voice }) => {
    await api.locations();
    await dashboard.goto('/');
    await search.search('tokyo');
    await search.selectOption(0);
    await dashboard.expectCity('Tokyo');

    await voice.startNarration();
    const spoken = await speech.spoken();
    expect(spoken[0]).toContain('in Tokyo');

    await voice.toggleListening();
    await speech.emitResult('When will it rain?');
    await speech.emitRecognitionEnd();
    await voice.expectAnswer('11 PM');
  });

  test('micro-climate is shown in the UK and hidden elsewhere', async ({ api, dashboard, search, sections }) => {
    await api.locations();
    await dashboard.goto('/');
    await expect(sections.microClimatePanel).toBeVisible();
    await search.search('paris');
    await search.selectOption(0);
    await dashboard.expectCity('Paris');
    await expect(sections.microClimatePanel).toHaveCount(0);
  });

  test('search results do not overflow at 320px', async ({ api, dashboard, page, search }) => {
    await api.locations();
    await page.setViewportSize({ width: 320, height: 900 });
    await dashboard.goto('/');
    await search.search('springfield');
    await expect(search.option(1)).toBeVisible();
    expect(await dashboard.horizontalOverflow()).toBeLessThanOrEqual(0);
  });
});

/*
 * "weather loading" in the source spec: a newer selection must win over an
 * older one that is still loading. Renamed to describe the behaviour.
 */
test.describe('location selection loading', () => {
  test('a later location selection wins over an earlier one', async ({ api, dashboard, search }) => {
    await api.locations();
    await dashboard.goto('/');

    await search.search('paris');
    await search.selectOption(0);
    await dashboard.expectCity('Paris');
    await dashboard.expectTemperature('12°C');

    await search.search('tokyo');
    await search.selectOption(0);
    await dashboard.expectCity('Tokyo');
    await dashboard.expectTemperature('26°C');
  });
});
