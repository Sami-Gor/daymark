import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  airContext,
  airLevel,
  calculateDewPointCelsius,
  compass,
  distanceKm,
  displayTemp,
  dewPointComfort,
  fetchMicroClimate,
  fetchWeather,
  getUmbrellaAdvice,
  getSunglassesAdvice,
  reverseGeocode,
  uvLevel,
  uvValue,
} from './weather';

/* ---------- fetch plumbing ---------- */

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input: RequestInfo | URL) =>
      Promise.resolve(handler(String(input))),
    );
}

const PLACE = { name: 'London', latitude: 51.51, longitude: -0.13 };

const validForecast = {
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
};

const validAir = {
  current: { us_aqi: 33, pm10: 12, pm2_5: 6.5, nitrogen_dioxide: 9, ozone: 60 },
  hourly: { time: ['2026-09-07T12:00'], us_aqi: [33], pm10: [12], pm2_5: [6.5] },
};

describe('fetchWeather', () => {
  const OriginalAbortSignal = globalThis.AbortSignal;

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) =>
        Promise.resolve(
          json(String(input).includes('air-quality') ? validAir : validForecast),
        ),
    );
    return () => {
      vi.restoreAllMocks();
      globalThis.AbortSignal = OriginalAbortSignal;
    };
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns a valid forecast merged with air quality', async () => {
    const result = await fetchWeather(PLACE);
    expect(result.current?.temperature_2m).toBe(20.4);
    expect(result.airQuality?.current?.us_aqi).toBe(33);
  });

  it('tolerates missing optional fields', async () => {
    stubFetch((url) =>
      json(url.includes('air-quality') ? {} : { current: { temperature_2m: 10 } }),
    );
    const result = await fetchWeather(PLACE);
    expect(result.current?.temperature_2m).toBe(10);
    expect(result.daily).toBeUndefined();
  });

  it('tolerates null values and nulls inside arrays', async () => {
    stubFetch((url) =>
      json(
        url.includes('air-quality')
          ? { current: { us_aqi: null } }
          : {
              current: { temperature_2m: null, uv_index: null },
              hourly: { time: ['a', 'b'], uv_index: [null, 1] },
            },
      ),
    );
    const result = await fetchWeather(PLACE);
    expect(result.hourly?.uv_index).toEqual([null, 1]);
  });

  it('tolerates truncated and unexpectedly large arrays', async () => {
    stubFetch((url) =>
      json(
        url.includes('air-quality')
          ? validAir
          : {
              daily: { time: ['2026-09-07'] },
              hourly: {
                time: Array.from({ length: 5000 }, (_, i) => `h${i}`),
                temperature_2m: Array.from({ length: 5000 }, () => 1),
              },
            },
      ),
    );
    const result = await fetchWeather(PLACE);
    expect(result.hourly?.time).toHaveLength(5000);
    expect(result.daily?.time).toEqual(['2026-09-07']);
  });

  it('ignores unknown fields from the API', async () => {
    stubFetch((url) =>
      json(
        url.includes('air-quality')
          ? validAir
          : { ...validForecast, something_new: { nested: true } },
      ),
    );
    const result = await fetchWeather(PLACE);
    expect(result.current?.weather_code).toBe(3);
  });

  it('rejects malformed field types with a friendly error', async () => {
    stubFetch(() => json({ current: 'not-an-object', hourly: 42 }));
    await expect(fetchWeather(PLACE)).rejects.toThrow(
      'Weather service sent data in an unexpected shape.',
    );
  });

  it('rejects a scalar body', async () => {
    stubFetch(() => json(42));
    await expect(fetchWeather(PLACE)).rejects.toThrow(
      'Weather service sent data in an unexpected shape.',
    );
  });

  it('degrades gracefully when only air quality fails', async () => {
    stubFetch((url) => {
      if (url.includes('air-quality')) return json({ bad: true }, 500);
      return json(validForecast);
    });
    const result = await fetchWeather(PLACE);
    expect(result.current?.temperature_2m).toBe(20.4);
    expect(result.airQuality).toBeUndefined();
  });

  it('throws a friendly message for HTTP 4xx/5xx', async () => {
    stubFetch(() => json({ reason: 'nope' }, 500));
    await expect(fetchWeather(PLACE)).rejects.toThrow(
      'Weather service returned 500',
    );
    stubFetch(() => json({ reason: 'nope' }, 404));
    await expect(fetchWeather(PLACE)).rejects.toThrow(
      'Weather service returned 404',
    );
  });

  it('throws a friendly message for malformed JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response('<html>oops</html>', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await expect(fetchWeather(PLACE)).rejects.toThrow(
      'Weather service sent a response we could not read.',
    );
  });

  it('surfaces timeouts as a friendly message', async () => {
    // Replace AbortSignal.timeout with an already-aborted TimeoutError signal
    // so the 10s timeout path is exercised instantly.
    const fakeTimeoutSignal = () => {
      const controller = new AbortController();
      controller.abort(new DOMException('The operation was aborted.', 'TimeoutError'));
      return controller.signal;
    };
    globalThis.AbortSignal = { timeout: fakeTimeoutSignal } as unknown as typeof AbortSignal;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal?.aborted) {
          const err = new Error('The operation was aborted.');
          err.name = init.signal.reason?.name ?? 'AbortError';
          return Promise.reject(err);
        }
        return new Promise(() => {});
      },
    );
    await expect(fetchWeather(PLACE)).rejects.toThrow(
      'The weather service took too long to respond.',
    );
  });

  it('passes an abort signal to fetch', async () => {
    let sawSignal = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal) sawSignal = true;
        return Promise.resolve(
          json(String(input).includes('air-quality') ? validAir : validForecast),
        );
      },
    );
    await fetchWeather(PLACE);
    expect(sawSignal).toBe(true);
  });
});

describe('fetchMicroClimate', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns null when the micro-climate request fails validation', async () => {
    stubFetch(() => json({ current: { temperature_2m: 'warm' } }));
    // Module-level cache is keyed by rounded coordinates: use one place here.
    await expect(fetchMicroClimate({ ...PLACE, latitude: 10.1, longitude: 0.1 })).resolves.toBeNull();
  });

  it('returns the payload when valid', async () => {
    stubFetch(() => json({ latitude: 51.5, current: { temperature_2m: 18 } }));
    // …and a different place here, because results are cached for 15 minutes.
    await expect(fetchMicroClimate({ ...PLACE, latitude: 20.2, longitude: 0.2 })).resolves.toMatchObject({
      current: { temperature_2m: 18 },
    });
  });
});

describe('reverseGeocode', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps the first result to a Place', async () => {
    stubFetch(() =>
      json({
        results: [
          { name: 'London', latitude: 51.51, longitude: -0.13, country: 'UK', extra: 1 },
        ],
      }),
    );
    await expect(reverseGeocode(51.51, -0.13)).resolves.toMatchObject({
      name: 'London',
    });
  });

  it('returns undefined when there are no results', async () => {
    stubFetch(() => json({ results: [] }));
    await expect(reverseGeocode(51.51, -0.13)).resolves.toBeUndefined();
  });

  it('rejects malformed geocoding payloads', async () => {
    stubFetch(() => json({ results: [{ nope: true }] }));
    await expect(reverseGeocode(51.51, -0.13)).rejects.toThrow(
      'unexpected shape',
    );
  });
});

describe('display helpers', () => {
  it('converts temperatures between units', () => {
    expect(displayTemp(0, 'celsius')).toBe('0°');
    expect(displayTemp(100, 'fahrenheit')).toBe('212°');
    expect(displayTemp(20, 'fahrenheit')).toBe('68°');
    expect(displayTemp(-40, 'fahrenheit')).toBe('-40°');
    expect(displayTemp(undefined, 'celsius')).toBe('—');
    expect(displayTemp(null, 'celsius')).toBe('—');
    expect(displayTemp(Number.NaN, 'celsius')).toBe('—');
  });

  it('categorises the UV index at boundaries', () => {
    expect(uvLevel(0).label).toBe('Low');
    expect(uvLevel(2.9).label).toBe('Low');
    expect(uvLevel(3).label).toBe('Moderate');
    expect(uvLevel(5.9).label).toBe('Moderate');
    expect(uvLevel(6).label).toBe('High');
    expect(uvLevel(7.9).label).toBe('High');
    expect(uvLevel(8).label).toBe('Very high');
    expect(uvLevel(10.9).label).toBe('Very high');
    expect(uvLevel(11).label).toBe('Extreme');
    expect(uvLevel(null).label).toBe('Unavailable');
    expect(uvValue(2.5)).toBe('2.5');
    expect(uvValue(3)).toBe('3');
  });

  it('categorises US AQI at boundaries', () => {
    expect(airLevel(0).label).toBe('Good');
    expect(airLevel(50).label).toBe('Good');
    expect(airLevel(51).label).toBe('Moderate');
    expect(airLevel(100).label).toBe('Moderate');
    expect(airLevel(101).label).toBe('Sensitive groups');
    expect(airLevel(150).label).toBe('Sensitive groups');
    expect(airLevel(151).label).toBe('Unhealthy');
    expect(airLevel(200).label).toBe('Unhealthy');
    expect(airLevel(201).label).toBe('Very unhealthy');
    expect(airLevel(300).label).toBe('Very unhealthy');
    expect(airLevel(301).label).toBe('Hazardous');
    expect(airLevel(undefined).label).toBe('Unavailable');
    expect(airContext(400)).toContain('hazardous');
  });

  it('computes dew point and comfort bands', () => {
    // 20 °C at 50 % RH is roughly 9.3 °C.
    const dew = calculateDewPointCelsius(20, 50) ?? -999;
    expect(dew).toBeGreaterThan(8.8);
    expect(dew).toBeLessThan(9.8);
    expect(dewPointComfort(9.3).label).toBe('Dry');
    expect(dewPointComfort(12).label).toBe('Comfortable');
    expect(dewPointComfort(17).label).toBe('Noticeable');
    expect(dewPointComfort(19).label).toBe('Humid');
    expect(dewPointComfort(25).label).toBe('Oppressive');
    expect(calculateDewPointCelsius(undefined, 50)).toBeUndefined();
  });

  it('computes haversine distances', () => {
    // London -> Paris is roughly 344 km.
    const d = distanceKm(51.5074, -0.1278, 48.8566, 2.3522);
    expect(d).toBeGreaterThan(330);
    expect(d).toBeLessThan(360);
    expect(distanceKm(51.5, -0.13, 51.5, -0.13)).toBe(0);
  });

  it('maps wind degrees to compass points', () => {
    expect(compass(0)).toBe('N');
    expect(compass(90)).toBe('E');
    expect(compass(45)).toBe('NE');
    expect(compass(undefined)).toBe('—');
  });

  it('gives umbrella advice from precipitation probability', () => {
    expect(getUmbrellaAdvice(80).answer).toBe('Yes');
    expect(getUmbrellaAdvice(10).answer).toBe('No');
    expect(getUmbrellaAdvice(0).reason).toBe('Rain unlikely today');
    expect(getUmbrellaAdvice(undefined).reason).toBe('Rain forecast unavailable');
    expect(getUmbrellaAdvice(50, '2 PM').reason).toContain('2 PM');
  });

  it('gives sunglasses advice from UV and cloud cover', () => {
    expect(getSunglassesAdvice(6, 20).answer).toBe('Yes');
    expect(getSunglassesAdvice(6, 90).answer).toBe('No');
    expect(getSunglassesAdvice(1, 10).answer).toBe('No');
    expect(getSunglassesAdvice(null, 10).answer).toBe('No');
  });
});
