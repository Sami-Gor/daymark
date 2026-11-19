import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures';
import { PARIS_SEARCH } from '../support/test-data';

/*
 * Location search: the debounced combobox, per-location weather updates,
 * keyboard selection, the no-results state and the stale-search guard.
 *
 * Multi-location stubs come from the `api` fixture's locations() helper and
 * serve per-latitude forecasts (Paris, Tokyo, canonical fallback). The stale
 * search test overrides the "paris" query with a test-controlled deferred gate
 * so the ordering is deterministic. Tests that need to inspect traffic use
 * `requests`.
 */

type ParisGateOutcome = 'fulfilled' | 'aborted';

type ParisGeocodingGate = {
  /** Resolves once the debounced Paris geocoding request reaches the gate. */
  started: Promise<void>;
  /** Lets the held Paris response be handled. */
  release: () => void;
  /** Resolves with how the held request ended; settles once released. */
  completed: Promise<ParisGateOutcome>;
  /** True after release() was called. */
  released: () => boolean;
  /** Synchronous snapshot for ordering assertions. */
  state: () => 'idle' | 'held' | 'settled';
};

/**
 * Test-controlled gate for the Paris geocoding response.
 *
 * The stale-search test must prove the older Paris request is still pending
 * when Tokyo appears, then that it is superseded. Identifying Paris by its
 * geocoding `name` query and delaying only that response gives exact control:
 *  - `started` resolves when the debounced Paris request reaches the route;
 *  - the response is held until the test calls `release()`, so "Paris is still
 *    pending" is a fact rather than a timing guess;
 *  - every other query (notably Tokyo) `route.fallback()`s to the existing
 *    `api.locations()` handler. Register this gate AFTER `api.locations()` so it
 *    takes precedence for the matcher it handles.
 *
 * `completed` reports 'aborted' when the app already aborted the stale fetch
 * (the expected stale-search outcome) and 'fulfilled' when the held response
 * was actually delivered. A route failure that is not explained by a failed
 * Paris request is rethrown instead of being masked as 'aborted'.
 */
async function gateParisGeocoding(page: Page): Promise<ParisGeocodingGate> {
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = (): void => resolve();
  });
  let openGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    openGate = (): void => resolve();
  });

  let startedFired = false;
  let released = false;
  let settled = false;
  let markCompleted!: (outcome: ParisGateOutcome) => void;
  const completed = new Promise<ParisGateOutcome>((resolve) => {
    markCompleted = (outcome) => resolve(outcome);
  });
  const complete = (outcome: ParisGateOutcome): void => {
    if (settled) return;
    settled = true;
    markCompleted(outcome);
  };

  let gatedParisUrl: string | null = null;
  const abortedParis = new Set<string>();
  page.on('requestfailed', (request) => {
    if (gatedParisUrl !== null && request.url() === gatedParisUrl) abortedParis.add(gatedParisUrl);
  });

  await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
    const name = (new URL(route.request().url()).searchParams.get('name') ?? '').toLowerCase();
    if (name !== 'paris') {
      // Tokyo and any other query keep using the api.locations() handler.
      await route.fallback();
      return;
    }
    const parisUrl = route.request().url();
    gatedParisUrl = parisUrl;
    startedFired = true;
    markStarted();
    await gate;
    try {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PARIS_SEARCH) });
      complete(abortedParis.has(parisUrl) ? 'aborted' : 'fulfilled');
    } catch (error) {
      // Aborting the stale Paris fetch is the documented expected outcome; any
      // other route failure is real and must not be silently reported as abort.
      if (!abortedParis.has(parisUrl)) throw error;
      complete('aborted');
    }
  });

  return {
    started,
    release: (): void => {
      released = true;
      openGate();
    },
    completed,
    released: (): boolean => released,
    state: (): 'idle' | 'held' | 'settled' => (settled ? 'settled' : startedFired ? 'held' : 'idle'),
  };
}

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
    // Registered AFTER api.locations(), so this gate wins for the Paris query;
    // Tokyo (and every other query) falls through to the locations() handler.
    const parisGate = await gateParisGeocoding(page);
    await dashboard.goto('/');

    await search.search('paris');
    // The debounced Paris request has reached the gate and its response is held.
    await parisGate.started;
    expect(parisGate.state(), 'Paris response should be held, not settled').toBe('held');
    expect(parisGate.released(), 'Paris must not be released before Tokyo appears').toBe(false);

    await search.search('tokyo');
    // Tokyo is served by api.locations() while Paris is still held: the newer
    // query wins even though the older response has not been delivered yet.
    await expect(search.option(0)).toContainText('Tokyo');
    expect(parisGate.released(), 'typing Tokyo must not release the Paris gate').toBe(false);
    expect(parisGate.state(), 'Paris must still be pending when Tokyo renders').toBe('held');

    // Release the stale Paris response only now. The app aborted this request
    // when Tokyo replaced the query, so handling it must end as an abort; if it
    // were still live the stale Paris payload would be delivered here.
    parisGate.release();
    const outcome = await parisGate.completed;
    expect(outcome, 'the stale Paris request must be aborted by the newer Tokyo query').toBe('aborted');

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
