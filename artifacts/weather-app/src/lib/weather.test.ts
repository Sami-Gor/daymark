import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addLocationHours,
  airContext,
  airLevel,
  calculateDewPointCelsius,
  compareLocationTimes,
  distanceKm,
  displayTemp,
  dewPointComfort,
  fetchMicroClimate,
  fetchWeather,
  formatLocationDate,
  formatLocationTime,
  getCurrentLocationTime,
  getLocationLocalDate,
  getLocationLocalHour,
  getSunProtectionWindow,
  getUmbrellaAdvice,
  getSunglassesAdvice,
  isMicroClimateSupported,
  isSameLocationDay,
  locationTimeMs,
  searchPlaces,
  shortDay,
  SUN_PROTECTION_UV_THRESHOLD,
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

  it('starts the forecast and air-quality requests in parallel', async () => {
    const started: string[] = [];
    const pending: Array<{ url: string; resolve: (response: Response) => void }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      started.push(url.includes('air-quality') ? 'air' : 'forecast');
      return new Promise<Response>((resolve) => {
        pending.push({ url, resolve });
      });
    });

    const result = fetchWeather(PLACE);
    await Promise.resolve();
    // Both requests are issued before either response resolves.
    expect(started).toEqual(['forecast', 'air']);

    for (const request of pending) {
      request.resolve(json(request.url.includes('air-quality') ? validAir : validForecast));
    }
    await expect(result).resolves.toMatchObject({ current: { temperature_2m: 20.4 } });
  });

  it('keeps forecast failure primary even when air quality succeeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => Promise.resolve(
      String(input).includes('air-quality') ? json(validAir) : json({ reason: 'nope' }, 500),
    ));
    await expect(fetchWeather(PLACE)).rejects.toThrow('Weather service returned 500');
  });

  it('issues exactly one forecast and one air-quality request with the same coordinates', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      return Promise.resolve(json(url.includes('air-quality') ? validAir : validForecast));
    });
    await fetchWeather(PLACE);
    expect(calls).toHaveLength(2);
    expect(calls.filter((url) => new URL(url).hostname === 'air-quality-api.open-meteo.com')).toHaveLength(1);
    expect(calls.filter((url) => {
      const parsed = new URL(url);
      return parsed.hostname === 'api.open-meteo.com' && parsed.pathname === '/v1/forecast';
    })).toHaveLength(1);
    for (const url of calls) {
      expect(url).toContain('latitude=51.51');
      expect(url).toContain('longitude=-0.13');
    }
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

describe('getSunProtectionWindow', () => {
  const day = '2026-09-07';
  const hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00']
    .map((time) => `${day}T${time}`);

  it('finds a continuous multi-hour window with its peak', () => {
    const result = getSunProtectionWindow(hours, [1, 2, 3, 5, 6, 5, 3, 2], `${day}T12:00`);
    expect(result).toEqual({
      status: 'window',
      window: { start: `${day}T10:00`, end: `${day}T15:00`, peak: 6 },
    });
  });

  it('returns none when UV never reaches the threshold', () => {
    expect(getSunProtectionWindow(hours, [0, 1, 2, 2.9, 2, 1, 0, 0], `${day}T12:00`)).toEqual({ status: 'none' });
  });

  it('handles a single qualifying hour', () => {
    expect(getSunProtectionWindow(hours.slice(0, 3), [1, 3, 1], `${day}T12:00`)).toEqual({
      status: 'window',
      window: { start: `${day}T09:00`, end: `${day}T10:00`, peak: 3 },
    });
  });

  it('treats missing values as a break and prefers the highest-peaking run', () => {
    const result = getSunProtectionWindow(hours.slice(0, 5), [3, null, 4, undefined, 6], `${day}T12:00`);
    expect(result).toEqual({
      status: 'window',
      window: { start: `${day}T12:00`, end: `${day}T13:00`, peak: 6 },
    });
  });

  it('returns unavailable when no usable UV values exist', () => {
    expect(getSunProtectionWindow([], [], `${day}T12:00`)).toEqual({ status: 'unavailable' });
    expect(getSunProtectionWindow(hours.slice(0, 3), [null, null, undefined], `${day}T12:00`)).toEqual({ status: 'unavailable' });
    expect(getSunProtectionWindow(undefined, undefined, `${day}T12:00`)).toEqual({ status: 'unavailable' });
  });

  it('handles a window that starts at the first available hour', () => {
    expect(getSunProtectionWindow(hours.slice(3, 6), [3, 5, 2], `${day}T12:00`)).toEqual({
      status: 'window',
      window: { start: `${day}T11:00`, end: `${day}T13:00`, peak: 5 },
    });
  });

  it('handles a window that reaches the last available hour', () => {
    expect(getSunProtectionWindow(hours.slice(0, 3), [2, 3, 4], `${day}T12:00`)).toEqual({
      status: 'window',
      window: { start: `${day}T09:00`, end: `${day}T11:00`, peak: 4 },
    });
  });

  it('ignores qualifying hours from other days', () => {
    const times = [`${day}T10:00`, `${day}T11:00`, '2026-09-08T12:00', '2026-09-08T13:00'];
    expect(getSunProtectionWindow(times, [1, 2, 8, 9], `${day}T12:00`)).toEqual({ status: 'none' });
  });

  it('tolerates a values array shorter than the times array', () => {
    expect(getSunProtectionWindow(hours.slice(0, 4), [1, 2], `${day}T12:00`)).toEqual({ status: 'none' });
  });

  it('uses the documented UV threshold of 3', () => {
    expect(SUN_PROTECTION_UV_THRESHOLD).toBe(3);
  });

  it('keeps the window on the location wall clock for London, New York and Tokyo', () => {
    const localDay = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
      '13:00', '14:00', '15:00', '16:00', '17:00'].map((time) => `2026-09-11T${time}`);
    const uv = [0, 0, 1, 2, 3, 5, 6, 5, 3, 2, 1, 0];
    const expected = { status: 'window', window: { start: '2026-09-11T10:00', end: '2026-09-11T15:00', peak: 6 } };
    // The same location-local forecast yields the same window regardless of
    // which instant "now" happens to be for the device.
    expect(getSunProtectionWindow(localDay, uv, '2026-09-11T09:00')).toEqual(expected);
    expect(getSunProtectionWindow(localDay, uv, '2026-09-11T04:00')).toEqual(expected);
    expect(getSunProtectionWindow(localDay, uv, '2026-09-11T18:00')).toEqual(expected);
  });

  it('scopes the window to the reference day when the forecast crosses local midnight', () => {
    const times = ['2026-09-11T22:00', '2026-09-11T23:00', '2026-09-12T00:00', '2026-09-12T01:00', '2026-09-12T02:00'];
    expect(getSunProtectionWindow(times, [0, 0, 1, 2, 3], '2026-09-11T23:30')).toEqual({ status: 'none' });
    expect(getSunProtectionWindow(times, [0, 0, 1, 2, 3], '2026-09-12T00:30')).toEqual({
      status: 'window',
      window: { start: '2026-09-12T02:00', end: '2026-09-12T03:00', peak: 3 },
    });
  });

  it('handles a DST transition day in the location wall clock', () => {
    // Europe/London springs forward on 2026-03-29; the wall clock stays linear.
    const times = ['2026-03-29T00:00', '2026-03-29T01:00', '2026-03-29T03:00', '2026-03-29T04:00'];
    expect(getSunProtectionWindow(times, [0, 0, 3, 4], '2026-03-29T00:30')).toEqual({
      status: 'window',
      window: { start: '2026-03-29T03:00', end: '2026-03-29T05:00', peak: 4 },
    });
  });
});

describe('location time utilities', () => {
  it('parses offset-less Open-Meteo timestamps as wall clock in the forecast location', () => {
    expect(getLocationLocalDate('2026-09-11T15:00')).toBe('2026-09-11');
    expect(getLocationLocalHour('2026-09-11T15:00')).toBe(15);
    expect(locationTimeMs('2026-09-11T15:00')).toBe(Date.UTC(2026, 8, 11, 15, 0));
  });

  it('formats location wall-clock times with the requested locale', () => {
    expect(formatLocationTime('2026-09-11T15:00', 'en-GB')).toBe('15');
    expect(formatLocationTime('2026-09-11T15:00', 'en-US')).toBe('3 PM');
    expect(formatLocationTime(undefined)).toBe('—');
  });

  it('formats location dates without shifting the calendar day', () => {
    expect(formatLocationDate('2026-09-11', { weekday: 'short' }, 'en-US')).toBe('Fri');
    expect(formatLocationDate('2026-09-11T23:30', { month: 'short', day: 'numeric' }, 'en-US')).toBe('Sep 11');
  });

  it('compares and orders location times', () => {
    expect(compareLocationTimes('2026-09-11T09:00', '2026-09-11T15:00')).toBe(-1);
    expect(compareLocationTimes('2026-09-11T15:00', '2026-09-11T15:00')).toBe(0);
    expect(compareLocationTimes('2026-09-12T00:00', '2026-09-11T23:00')).toBe(1);
    expect(compareLocationTimes(undefined, '2026-09-11T15:00')).toBe(-1);
    expect(compareLocationTimes('2026-09-11T15:00', null)).toBe(1);
  });

  it('detects day boundaries around local midnight', () => {
    expect(isSameLocationDay('2026-09-11T23:59', '2026-09-12T00:00')).toBe(false);
    expect(isSameLocationDay('2026-09-11T00:00', '2026-09-11T23:59')).toBe(true);
  });

  it('adds hours in wall-clock time, including across midnight and DST', () => {
    expect(addLocationHours('2026-09-11T23:00', 1)).toBe('2026-09-12T00:00');
    expect(addLocationHours('2026-09-11T10:00', 2)).toBe('2026-09-11T12:00');
    expect(addLocationHours('2026-03-29T00:30', 2)).toBe('2026-03-29T02:30');
  });

  it('derives the current location time from the IANA timezone, not the device', () => {
    const now = Date.UTC(2026, 8, 11, 6, 0);
    expect(getCurrentLocationTime(undefined, { timezone: 'Asia/Tokyo' }, now)).toBe('2026-09-11T15:00');
    expect(getCurrentLocationTime(undefined, { timezone: 'America/New_York' }, now)).toBe('2026-09-11T02:00');
    expect(getCurrentLocationTime(undefined, { timezone: 'Europe/London' }, now)).toBe('2026-09-11T07:00');
  });

  it('handles a DST transition when converting an instant to location time', () => {
    // 01:30 UTC on the UK spring-forward day is 02:30 BST in London.
    expect(getCurrentLocationTime(undefined, { timezone: 'Europe/London' }, Date.UTC(2026, 2, 29, 1, 30))).toBe('2026-03-29T02:30');
  });

  it('falls back to utc_offset_seconds when the IANA zone is missing or unknown', () => {
    const now = Date.UTC(2026, 8, 11, 6, 0);
    expect(getCurrentLocationTime(undefined, { timezone: null, utc_offset_seconds: 32400 }, now)).toBe('2026-09-11T15:00');
    expect(getCurrentLocationTime(undefined, { timezone: 'Not/AZone', utc_offset_seconds: -14400 }, now)).toBe('2026-09-11T02:00');
    expect(getCurrentLocationTime(undefined, {}, now)).toBeNull();
  });

  it('prefers the API current time when present', () => {
    expect(getCurrentLocationTime('2026-09-11T15:00', { timezone: 'UTC' }, 0)).toBe('2026-09-11T15:00');
  });

  it('selects Today and Tomorrow from the location daily list', () => {
    expect(shortDay('2026-09-11', 0)).toBe('Today');
    expect(shortDay('2026-09-12', 1)).toBe('Tomorrow');
    expect(formatLocationDate('2026-09-13', { weekday: 'short' }, 'en-US')).toBe('Sun');
  });

  it('returns identical results whatever the device timezone is', () => {
    const original = process.env.TZ;
    const times = ['2026-09-11T08:00', '2026-09-11T09:00', '2026-09-11T10:00', '2026-09-11T11:00', '2026-09-11T12:00'];
    const values = [1, 2, 3, 5, 4];
    try {
      const baseline = getSunProtectionWindow(times, values, '2026-09-11T12:00');
      for (const timeZone of ['UTC', 'America/New_York', 'Asia/Tokyo', 'Europe/London']) {
        process.env.TZ = timeZone;
        expect(getSunProtectionWindow(times, values, '2026-09-11T12:00')).toEqual(baseline);
        expect(formatLocationTime('2026-09-11T15:00', 'en-US')).toBe('3 PM');
        expect(getLocationLocalDate('2026-09-11T23:30')).toBe('2026-09-11');
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe('searchPlaces', () => {
  afterEach(() => vi.restoreAllMocks());

  it('parses results with region, country, country code and timezone', async () => {
    stubFetch(() => json({
      results: [
        {
          name: 'Paris',
          latitude: 48.8566,
          longitude: 2.3522,
          admin1: 'Île-de-France',
          country: 'France',
          country_code: 'FR',
          timezone: 'Europe/Paris',
        },
      ],
    }));
    await expect(searchPlaces('paris')).resolves.toEqual([
      {
        name: 'Paris',
        latitude: 48.8566,
        longitude: 2.3522,
        admin1: 'Île-de-France',
        country: 'France',
        countryCode: 'FR',
        timezone: 'Europe/Paris',
      },
    ]);
  });

  it('keeps duplicate place names distinct and in order', async () => {
    stubFetch(() => json({
      results: [
        { name: 'Springfield', latitude: 39.78, longitude: -89.65, admin1: 'Illinois', country: 'United States', country_code: 'US' },
        { name: 'Springfield', latitude: 37.22, longitude: -93.3, admin1: 'Missouri', country: 'United States', country_code: 'US' },
      ],
    }));
    const results = await searchPlaces('springfield');
    expect(results).toHaveLength(2);
    expect(results[0].admin1).toBe('Illinois');
    expect(results[1].admin1).toBe('Missouri');
  });

  it('does not search empty or single-character queries', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(searchPlaces('')).resolves.toEqual([]);
    await expect(searchPlaces(' ')).resolves.toEqual([]);
    await expect(searchPlaces('a')).resolves.toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns an empty list when there are no matches', async () => {
    stubFetch(() => json({}));
    await expect(searchPlaces('zzzzz')).resolves.toEqual([]);
    stubFetch(() => json({ results: null }));
    await expect(searchPlaces('zzzzz')).resolves.toEqual([]);
  });

  it('rejects when the geocoding service fails', async () => {
    stubFetch(() => json({ reason: 'nope' }, 500));
    await expect(searchPlaces('paris')).rejects.toThrow('Weather service returned 500');
  });

  it('propagates an abort so stale searches can be discarded', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    }));
    const controller = new AbortController();
    const pending = searchPlaces('paris', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('isMicroClimateSupported', () => {
  it('supports the UK and rejects locations outside the UKV domain', () => {
    expect(isMicroClimateSupported(51.5074, -0.1278)).toBe(true); // London
    expect(isMicroClimateSupported(55.9533, -3.1883)).toBe(true); // Edinburgh
    expect(isMicroClimateSupported(48.8566, 2.3522)).toBe(false); // Paris
    expect(isMicroClimateSupported(40.7128, -74.006)).toBe(false); // New York
    expect(isMicroClimateSupported(35.6762, 139.6503)).toBe(false); // Tokyo
    expect(isMicroClimateSupported(-33.8688, 151.2093)).toBe(false); // Sydney
    expect(isMicroClimateSupported(25.2048, 55.2708)).toBe(false); // Dubai
    expect(isMicroClimateSupported(Number.NaN, 0)).toBe(false);
  });
});
