import { expect, type Page } from '@playwright/test';


/*
 * Deterministic Open-Meteo fixtures. Timestamps are fixed so the rendered
 * UI is stable; numbers are chosen to exercise rounding and unit conversion.
 */
export const FORECAST = {
  latitude: 51.51,
  longitude: -0.13,
  current: {
    time: '2026-09-07T12:00',
    temperature_2m: 20.4,
    relative_humidity_2m: 62,
    dew_point_2m: 12.1,
    apparent_temperature: 19.1,
    precipitation: 0,
    cloud_cover: 80,
    weather_code: 3,
    uv_index: 2.5,
  },
  hourly: {
    time: [
      '2026-09-07T12:00', '2026-09-07T13:00', '2026-09-07T14:00', '2026-09-07T15:00',
      '2026-09-07T16:00', '2026-09-07T17:00', '2026-09-07T18:00', '2026-09-07T19:00',
      '2026-09-07T20:00', '2026-09-07T21:00', '2026-09-07T22:00', '2026-09-07T23:00',
    ],
    temperature_2m: [20.4, 21, 21.2, 20.8, 20, 19, 18, 17, 16, 15, 14, 13],
    precipitation_probability: [10, 20, 10, 0, 0, 5, 10, 15, 20, 25, 30, 35],
    weather_code: [3, 2, 3, 3, 2, 1, 1, 0, 0, 1, 2, 3],
    uv_index: [2.5, 3, 2, 1, 0.5, 0.2, 0, 0, 0, 0, 0, 0],
  },
  daily: {
    time: ['2026-09-07', '2026-09-08', '2026-09-09'],
    weather_code: [3, 61, 0],
    temperature_2m_max: [21, 19, 22],
    temperature_2m_min: [12, 11, 13],
    precipitation_probability_max: [10, 90, 0],
    sunrise: ['2026-09-07T06:30'],
    sunset: ['2026-09-07T19:40'],
    uv_index_max: [3, 2, 4],
  },
};

export const AIR = {
  current: { us_aqi: 33, pm10: 12, pm2_5: 6.5, nitrogen_dioxide: 9, ozone: 60 },
  hourly: { time: ['2026-09-07T12:00'], us_aqi: [33], pm10: [12], pm2_5: [6.5] },
};

export const GEOCODE = {
  results: [{ name: 'Greenwich', latitude: 51.4789, longitude: 0.0107, country: 'United Kingdom' }],
};

/** Intercept all Open-Meteo calls with deterministic fixtures. */
export async function mockOpenMeteo(page: Page, overrides: { forecast?: object; air?: object; status?: number; delay?: number } = {}) {
  const { forecast = FORECAST, air = AIR, status = 200, delay = 0 } = overrides;
  await page.route('**/api.open-meteo.com/**', async (route) => {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(forecast) });
  });
  await page.route('**/air-quality-api.open-meteo.com/**', async (route) => {
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(air) });
  });
  await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(GEOCODE) });
  });
  // Device-location naming is enhancement-only: by default the locality
  // dataset is unavailable so existing suites keep exercising the
  // "Your location" fallback. Locality-specific tests register their own
  // fixture route afterwards (Playwright routes are LIFO, so theirs wins).
  await page.route('**/locality/**', (route) => route.fulfill({ status: 404, body: '' }));
}

export const PARIS_RESULT = { name: 'Paris', latitude: 48.8566, longitude: 2.3522, admin1: 'Île-de-France', country: 'France', country_code: 'FR', timezone: 'Europe/Paris' };
export const SPRINGFIELD_ILLINOIS = { name: 'Springfield', latitude: 39.7817, longitude: -89.6501, admin1: 'Illinois', country: 'United States', country_code: 'US', timezone: 'America/Chicago' };
export const SPRINGFIELD_MISSOURI = { name: 'Springfield', latitude: 37.2153, longitude: -93.2982, admin1: 'Missouri', country: 'United States', country_code: 'US', timezone: 'America/Chicago' };
export const TOKYO_RESULT = { name: 'Tokyo', latitude: 35.6762, longitude: 139.6503, admin1: 'Tokyo', country: 'Japan', country_code: 'JP', timezone: 'Asia/Tokyo' };

export const PARIS_FORECAST = {
  ...FORECAST,
  timezone: 'Europe/Paris',
  timezone_abbreviation: 'CEST',
  utc_offset_seconds: 7200,
  current: { ...FORECAST.current, temperature_2m: 12.4 },
};

export const TOKYO_FORECAST = {
  ...FORECAST,
  timezone: 'Asia/Tokyo',
  timezone_abbreviation: 'JST',
  utc_offset_seconds: 32400,
  current: { ...FORECAST.current, time: '2026-09-07T21:00', temperature_2m: 26.4 },
};

export const WINDY_FORECAST = {
  ...FORECAST,
  hourly: {
    ...FORECAST.hourly,
    precipitation: FORECAST.hourly.time.map(() => 0),
    snowfall: FORECAST.hourly.time.map(() => 0),
    wind_speed_10m: FORECAST.hourly.time.map(() => 10),
    wind_gusts_10m: FORECAST.hourly.time.map((_, index) => (index === 5 ? 110 : 15)),
  },
};

export const TOKYO_WINDY_FORECAST = {
  ...WINDY_FORECAST,
  timezone: 'Asia/Tokyo',
  timezone_abbreviation: 'JST',
  utc_offset_seconds: 32400,
  current: { ...WINDY_FORECAST.current, time: '2026-09-07T17:00' },
  hourly: {
    ...WINDY_FORECAST.hourly,
    wind_gusts_10m: WINDY_FORECAST.hourly.time.map((_, index) => (index === 9 ? 110 : 15)),
  },
};

/** Deterministic geocoding + per-location weather stubs. */
export async function mockLocations(page: Page) {
  await page.route('**/geocoding-api.open-meteo.com/**', async (route) => {
    const url = new URL(route.request().url());
    const name = (url.searchParams.get('name') ?? '').toLowerCase();
    const results = name === 'paris'
      ? [PARIS_RESULT]
      : name === 'springfield'
        ? [SPRINGFIELD_ILLINOIS, SPRINGFIELD_MISSOURI]
        : name === 'tokyo'
          ? [TOKYO_RESULT]
          : null;
    if (name === 'paris') await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results }) });
    } catch {
      // The client aborted a stale search; nothing to fulfil.
    }
  });
  await page.route('**/api.open-meteo.com/**', async (route) => {
    const url = new URL(route.request().url());
    const latitude = Number(url.searchParams.get('latitude'));
    const body = Math.abs(latitude - 48.8566) < 0.5
      ? PARIS_FORECAST
      : Math.abs(latitude - 35.6762) < 0.5
        ? TOKYO_FORECAST
        : FORECAST;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/air-quality-api.open-meteo.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(AIR),
  }));
}


export function byTestId(page: Page, id: string) {
  return page.getByTestId(id);
}

export async function expectWeatherReady(page: Page) {
  await expect(byTestId(page, 'text-current-temperature')).toBeVisible();
}

export async function expectNoWebVoiceControls(page: Page) {
  await expect(byTestId(page, 'button-hear-today')).toHaveCount(0);
  await expect(byTestId(page, 'button-ask-daymark')).toHaveCount(0);
  await expect(byTestId(page, 'ask-privacy')).toHaveCount(0);
  await expect(byTestId(page, 'voice-error')).toHaveCount(0);
}
