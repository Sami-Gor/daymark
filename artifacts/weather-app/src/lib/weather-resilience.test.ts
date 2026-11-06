/*
 * Negative API coverage for the weather request boundary.
 *
 * Complements weather.test.ts (which covers 500, timeout and air-quality
 * degradation) with the remaining deterministic failure shapes plus recovery.
 * No test here touches the network: every response is a mocked `fetch`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWeather } from './weather';

const PLACE = { name: 'London', latitude: 51.51, longitude: -0.13 };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const validForecast = () => ({
  latitude: 51.51,
  longitude: -0.13,
  current: {
    time: '2026-09-07T12:00',
    temperature_2m: 20.4,
    relative_humidity_2m: 62,
    apparent_temperature: 19.1,
    precipitation: 0,
    cloud_cover: 80,
    weather_code: 3,
    uv_index: 2.5,
  },
  hourly: {
    time: ['2026-09-07T12:00', '2026-09-07T13:00'],
    temperature_2m: [20.4, 21],
    precipitation_probability: [10, 20],
    weather_code: [3, 2],
    uv_index: [2.5, 3],
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
});

const validAir = () => ({
  current: { us_aqi: 33, pm10: 12, pm2_5: 6.5, nitrogen_dioxide: 9, ozone: 60 },
  hourly: { time: ['2026-09-07T12:00'], us_aqi: [33], pm10: [12], pm2_5: [6.5] },
});

/** Route by URL: forecast vs air quality, so one endpoint can fail alone. */
function mockFetch(forecast: () => Response | Promise<Response>, air?: () => Response | Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('air-quality')) {
      return Promise.resolve((air ?? (() => json(validAir())))());
    }
    return Promise.resolve(forecast());
  });
}

function expectCode(promise: Promise<unknown>, code: string) {
  return expect(promise).rejects.toMatchObject({ name: 'WeatherFetchError', code });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('negative weather API responses', () => {
  it('API-02: HTTP 429 is a graceful http failure with no retry loop', async () => {
    const fetchSpy = mockFetch(() => json({ reason: 'rate limited' }, 429));
    await expectCode(fetchWeather(PLACE), 'http');
    // One forecast + one air-quality request; nothing retried automatically.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect((await fetchSpy.mock.results[0].value).status).toBe(429);
  });

  it('API-05: a body that is not JSON is reported as malformed', async () => {
    mockFetch(() => new Response('<html>gateway</html>', { status: 200 }));
    await expectCode(fetchWeather(PLACE), 'malformed');
  });

  it('API-06: syntactically valid JSON with the wrong shape is rejected by the schema', async () => {
    mockFetch(() => json({ current: { temperature_2m: 'warm' }, hourly: {}, daily: {} }));
    await expectCode(fetchWeather(PLACE), 'malformed');
  });

  it('API-07: a partially-typed forecast (string inside a number array) is rejected', async () => {
    mockFetch(() => {
      const payload = validForecast() as Record<string, unknown> & {
        hourly: Record<string, unknown>;
      };
      payload.hourly.temperature_2m = [20.4, 'warm'];
      return json(payload);
    });
    await expectCode(fetchWeather(PLACE), 'malformed');
  });

  it('API-07b: the schema is deliberately lenient about omitted blocks and empty arrays', async () => {
    // Documents actual behaviour: Open-Meteo may omit blocks (night-time UV,
    // partial payloads) and the UI must tolerate it. Tightening this would be
    // a deliberate schema change, not a test-driven patch.
    mockFetch(() => json({ latitude: 51.51, longitude: -0.13, hourly: { time: [], temperature_2m: [] } }));
    const payload = await fetchWeather(PLACE);
    expect(payload.hourly?.time).toEqual([]);
    expect(payload.current).toBeUndefined();
  });

  it('API-03: a network rejection surfaces as a friendly network error', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    await expectCode(fetchWeather(PLACE), 'network');
  });

  it('API-08: a failed request does not prevent a later successful retry', async () => {
    let failNext = true;
    mockFetch(() => {
      if (failNext) {
        failNext = false;
        throw new TypeError('Failed to fetch');
      }
      return json(validForecast());
    });

    await expectCode(fetchWeather(PLACE), 'network');
    const payload = await fetchWeather(PLACE);
    expect(payload.current.temperature_2m).toBe(20.4);
  });
});
