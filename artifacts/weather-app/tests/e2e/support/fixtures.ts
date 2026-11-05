import { test as base, expect } from '@playwright/test';
import { createSeededRandom, resolveSeed, type RandomSource } from './rng';
import { ApiMocks } from './mocks';
import { BrowserLog, RequestLog } from './network';
import { SpeechHarness } from './speech';
import { GeolocationHarness } from './geolocation';
import { DashboardPage } from '../pages/dashboard.page';
import { WeatherSectionsPage } from '../pages/weather-sections.page';
import { LocationSearchPage } from '../pages/location-search.page';
import { VoiceControlsPage } from '../pages/voice-controls.page';
import { WeatherAlertsPage } from '../pages/weather-alerts.page';
import { PrivacyPolicyPage } from '../pages/privacy-policy.page';
import { StorePromoPage } from '../pages/store-promo.page';

/*
 * Shared Playwright fixtures.
 *
 * Every spec imports { test, expect } from this file. That gives it:
 *  - deterministic default Open-Meteo + locality mocks (api), installed before
 *    the test body so a test can override any endpoint and then navigate;
 *  - request and browser-console logs (requests, browserLog);
 *  - a per-test seeded RNG (seed, random) that is recorded on failure;
 *  - focused page objects for each area of the app;
 *  - speech and geolocation harnesses for the tests that need them.
 *
 * Playwright creates a fresh context and page per test, so storage, cookies and
 * route handlers never leak between tests. Do not add module-level mutable
 * state to specs: test-order independence is part of the contract.
 */

export type DaymarkOptions = {
  /** Make speechSynthesis.speak throw, to cover the narration error path. */
  speechPlaybackFails: boolean;
  /** Install the recognition stub; false models a browser without the API. */
  speechRecognitionSupported: boolean;
};

export type DaymarkFixtures = {
  seed: number;
  random: RandomSource;
  api: ApiMocks;
  requests: RequestLog;
  browserLog: BrowserLog;
  dashboard: DashboardPage;
  sections: WeatherSectionsPage;
  search: LocationSearchPage;
  voice: VoiceControlsPage;
  alerts: WeatherAlertsPage;
  privacy: PrivacyPolicyPage;
  promo: StorePromoPage;
  geo: GeolocationHarness;
  speech: SpeechHarness;
};

export const test = base.extend<DaymarkFixtures & DaymarkOptions>({
  speechPlaybackFails: [false, { option: true }],
  speechRecognitionSupported: [true, { option: true }],

  // Deterministic per-test seed. Recorded as an annotation and attached to the
  // report when the test fails. The seed is derived from the test's title path
  // (or from DAYMARK_E2E_SEED when that is set), so simply rerunning the test
  // reproduces the data; the attachment also records which override was used.
  seed: [
    async ({}, use, testInfo) => {
      const envSeed = process.env.DAYMARK_E2E_SEED?.trim() || null;
      const seed = resolveSeed(testInfo.titlePath, envSeed ?? undefined);
      testInfo.annotations.push({ type: 'random-seed', description: String(seed) });
      await use(seed);
      if (testInfo.status !== testInfo.expectedStatus) {
        const provenance = envSeed ? `derived from DAYMARK_E2E_SEED=${envSeed}` : 'derived from the test title';
        // eslint-disable-next-line no-console
        console.log(`[daymark-e2e] RNG seed for "${testInfo.title}": ${seed} (${provenance})`);
        console.log('[daymark-e2e] Rerun this test with the same environment to reproduce the same data.');
        await testInfo.attach('random-seed', {
          body: JSON.stringify({ seed, envSeed, titlePath: testInfo.titlePath }, null, 2),
          contentType: 'application/json',
        });
      }
    },
    { auto: true },
  ],

  random: async ({ seed }, use) => {
    await use(createSeededRandom(seed));
  },

  // Canonical mocks are installed before every test. A test can register a
  // later, more specific route at any point before navigating; Playwright
  // gives the most recently registered matching route precedence.
  api: [
    async ({ page }, use) => {
      const api = new ApiMocks(page);
      await api.installDefaults();
      await use(api);
    },
    { auto: true },
  ],

  requests: [
    async ({ page }, use) => {
      await use(new RequestLog(page));
    },
    { auto: true },
  ],

  browserLog: [
    async ({ page }, use) => {
      await use(new BrowserLog(page));
    },
    { auto: true },
  ],

  dashboard: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  sections: async ({ page }, use) => {
    await use(new WeatherSectionsPage(page));
  },
  search: async ({ page }, use) => {
    await use(new LocationSearchPage(page));
  },
  voice: async ({ page }, use) => {
    await use(new VoiceControlsPage(page));
  },
  alerts: async ({ page }, use) => {
    await use(new WeatherAlertsPage(page));
  },
  privacy: async ({ page }, use) => {
    await use(new PrivacyPolicyPage(page));
  },
  promo: async ({ page }, use) => {
    await use(new StorePromoPage(page));
  },
  geo: async ({ page }, use) => {
    await use(new GeolocationHarness(page));
  },

  speech: async ({ page, speechPlaybackFails, speechRecognitionSupported }, use) => {
    const speech = new SpeechHarness(page);
    await speech.installPlayback({ failOnSpeak: speechPlaybackFails });
    await speech.installRecognition(speechRecognitionSupported);
    await use(speech);
  },
});

export { expect };
export type { Locator, Page } from '@playwright/test';
