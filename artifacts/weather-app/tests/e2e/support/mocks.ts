import type { Page, Route } from '@playwright/test';
import {
  CANONICAL_AIR,
  CANONICAL_FORECAST,
  CANONICAL_GEOCODE,
  PARIS_FORECAST,
  PARIS_RESULT,
  SPRINGFIELD_ILLINOIS,
  SPRINGFIELD_MISSOURI,
  TOKYO_FORECAST,
  TOKYO_RESULT,
} from './test-data';

/*
 * Network stubbing for the weather app.
 *
 * Every E2E test gets the default fixtures installed automatically by the
 * `api` fixture (see fixtures.ts). Tests that need different data call one of
 * the methods below before navigating: Playwright resolves routes in reverse
 * registration order, so a later route wins over the suite defaults.
 */

export type RouteOptions = {
  status?: number;
  delay?: number;
  contentType?: string;
};

type ForecastByLatitude = { latitude: number; body: unknown };
type GeocodeByName = { name: string; body: unknown };

const OPEN_METEO = '**/api.open-meteo.com/**';
const AIR_QUALITY = '**/air-quality-api.open-meteo.com/**';
const GEOCODING = '**/geocoding-api.open-meteo.com/**';
const LOCALITY = '**/locality/**';

export class ApiMocks {
  constructor(private readonly page: Page) {}

  private async fulfill(route: Route, body: unknown, options: RouteOptions): Promise<void> {
    if (options.delay) {
      await new Promise((resolve) => setTimeout(resolve, options.delay));
    }
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    await route.fulfill({
      status: options.status ?? 200,
      contentType: options.contentType ?? (typeof body === 'string' ? 'text/plain' : 'application/json'),
      body: raw,
    }).catch(() => {
      // The client may abort a stale request; there is nothing left to fulfil.
    });
  }

  /** Route the forecast endpoint to a fixed payload. */
  async forecast(body: unknown = CANONICAL_FORECAST, options: RouteOptions = {}): Promise<void> {
    await this.page.route(OPEN_METEO, (route) => this.fulfill(route, body, options));
  }

  /** Route the air-quality endpoint to a fixed payload. */
  async airQuality(body: unknown = CANONICAL_AIR, options: RouteOptions = {}): Promise<void> {
    await this.page.route(AIR_QUALITY, (route) => this.fulfill(route, body, options));
  }

  /** Route the geocoding search endpoint to a fixed payload. */
  async geocoding(body: unknown = CANONICAL_GEOCODE, options: RouteOptions = {}): Promise<void> {
    await this.page.route(GEOCODING, (route) => this.fulfill(route, body, options));
  }

  /** Route the offline locality dataset. `null` (the default) means "unavailable". */
  async locality(body: string | null, options: RouteOptions = {}): Promise<void> {
    if (body == null) {
      await this.page.route(LOCALITY, (route) => route.fulfill({ status: 404, body: '' }));
      return;
    }
    await this.page.route(LOCALITY, (route) => this.fulfill(route, body, options));
  }

  /**
   * Replace all three Open-Meteo endpoints at once. Mirrors the original
   * `mockOpenMeteo(page, overrides)` helper: a single status/delay applies to
   * every endpoint.
   */
  async all(overrides: {
    forecast?: unknown;
    air?: unknown;
    geocode?: unknown;
    status?: number;
    delay?: number;
  } = {}): Promise<void> {
    const { status = 200, delay = 0 } = overrides;
    await this.forecast(overrides.forecast ?? CANONICAL_FORECAST, { status, delay });
    await this.airQuality(overrides.air ?? CANONICAL_AIR, { status, delay });
    await this.geocoding(overrides.geocode ?? CANONICAL_GEOCODE, { status, delay });
  }

  /** Install the deterministic defaults used by every test unless overridden. */
  async installDefaults(): Promise<void> {
    await this.all();
    await this.locality(null);
  }

  /** Add extra latency to the forecast endpoint only. */
  async delayForecast(delay: number, body: unknown = CANONICAL_FORECAST): Promise<void> {
    await this.forecast(body, { delay });
  }

  /** Simulate a network-level failure for every weather endpoint. */
  async offline(): Promise<void> {
    await this.page.route(OPEN_METEO, (route) => route.abort('failed'));
    await this.page.route(AIR_QUALITY, (route) => route.abort('failed'));
    await this.page.route(GEOCODING, (route) => route.abort('failed'));
  }

  /** Serve a different forecast per rounded request latitude, with a fallback. */
  async forecastByLatitude(cases: ForecastByLatitude[], fallback: unknown = CANONICAL_FORECAST): Promise<void> {
    await this.page.route(OPEN_METEO, async (route) => {
      const url = new URL(route.request().url());
      const latitude = Number(url.searchParams.get('latitude'));
      const match = cases.find((entry) => Math.abs(latitude - entry.latitude) < 0.5);
      await this.fulfill(route, match?.body ?? fallback, {});
    });
  }

  /** Serve different geocoding results per lower-cased search query. */
  async geocodeByName(cases: GeocodeByName[], fallback: unknown = { results: null }): Promise<void> {
    await this.page.route(GEOCODING, async (route) => {
      const url = new URL(route.request().url());
      const name = (url.searchParams.get('name') ?? '').toLowerCase();
      const match = cases.find((entry) => entry.name.toLowerCase() === name);
      await this.fulfill(route, match?.body ?? fallback, {});
    });
  }

  /**
   * Deterministic multi-location stubs used by location and alert suites.
   * Preserves the original 500 ms delay for "paris" so stale-search tests keep
   * exercising the in-flight abort path.
   */
  async locations(): Promise<void> {
    await this.page.route(GEOCODING, async (route) => {
      const url = new URL(route.request().url());
      const name = (url.searchParams.get('name') ?? '').toLowerCase();
      const results = name === 'paris'
        ? [PARIS_RESULT]
        : name === 'springfield'
          ? [SPRINGFIELD_ILLINOIS, SPRINGFIELD_MISSOURI]
          : name === 'tokyo'
            ? [TOKYO_RESULT]
            : null;
      if (name === 'paris') {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      await this.fulfill(route, { results }, {});
    });
    await this.forecastByLatitude(
      [
        { latitude: 48.8566, body: PARIS_FORECAST },
        { latitude: 35.6762, body: TOKYO_FORECAST },
      ],
      CANONICAL_FORECAST,
    );
  }
}
