import { afterEach, describe, expect, it, vi } from 'vitest';

import { WEATHER_ERROR_KEYS, type WeatherErrorCode } from '@/components/weather/WeatherError';
import en from '@/locales/en';
import es from '@/locales/es';
import fr from '@/locales/fr';
import { fetchWeather, WeatherFetchError } from './weather';

/*
 * Typed weather failure contract.
 *
 * App.tsx stores `error.code` and WeatherError renders it through
 * WEATHER_ERROR_KEYS, so a new failure mode that forgets a code or a
 * translation key would silently render untranslated or undefined copy.
 * These tests pin the code set and the localized strings without touching the
 * network: fetch is stubbed for every failure path.
 */

const PLACE = { name: 'London', latitude: 51.51, longitude: -0.13 };
const validForecast = { current: { temperature_2m: 12, weather_code: 3 } };
const validAir = { current: { us_aqi: 20 } };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input: RequestInfo | URL) => Promise.resolve(handler(String(input))));
}

const originalAbortSignal = globalThis.AbortSignal;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.AbortSignal = originalAbortSignal;
});

describe('WeatherFetchError', () => {
  it('is a named Error carrying a stable code', () => {
    const error = new WeatherFetchError('timeout', 'too slow');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('WeatherFetchError');
    expect(error.code).toBe('timeout');
    expect(error.message).toBe('too slow');
  });

  it('reports an HTTP failure as the http code', async () => {
    stubFetch(() => json({ reason: 'unavailable' }, 503));
    await expect(fetchWeather(PLACE)).rejects.toMatchObject({
      name: 'WeatherFetchError',
      code: 'http',
    });
  });

  it('reports unreadable JSON as malformed', async () => {
    stubFetch(() => new Response('<html>oops</html>', { status: 200 }));
    await expect(fetchWeather(PLACE)).rejects.toMatchObject({ code: 'malformed' });
  });

  it('reports a schema mismatch as malformed', async () => {
    stubFetch((url) => json(url.includes('air-quality') ? validAir : 42));
    await expect(fetchWeather(PLACE)).rejects.toMatchObject({ code: 'malformed' });
  });

  it('reports a transport failure as network', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    );
    await expect(fetchWeather(PLACE)).rejects.toMatchObject({ code: 'network' });
  });

  it('reports an aborted request as timeout without leaking the raw message', async () => {
    const fakeTimeoutSignal = () => {
      const controller = new AbortController();
      controller.abort(new DOMException('The operation was aborted.', 'TimeoutError'));
      return controller.signal;
    };
    globalThis.AbortSignal = { timeout: fakeTimeoutSignal } as unknown as typeof AbortSignal;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal?.aborted) {
          const error = new Error('The operation was aborted.');
          error.name = init.signal.reason?.name ?? 'AbortError';
          return Promise.reject(error);
        }
        return new Promise(() => {});
      },
    );

    await expect(fetchWeather(PLACE)).rejects.toMatchObject({
      code: 'timeout',
      message: 'The weather service took too long to respond.',
    });
  });
});

describe('weather error copy', () => {
  const CODES: WeatherErrorCode[] = ['network', 'timeout', 'http', 'malformed', 'unknown'];

  it('maps exactly the typed codes plus unknown', () => {
    expect(Object.keys(WEATHER_ERROR_KEYS).sort()).toEqual([...CODES].sort());
    expect(new Set(Object.values(WEATHER_ERROR_KEYS)).size).toBe(CODES.length);
  });

  it('resolves every code to non-empty copy in every locale', () => {
    const dictionaries = [
      ['en', en],
      ['fr', fr],
      ['es', es],
    ] as const;

    for (const [locale, dictionary] of dictionaries) {
      for (const code of CODES) {
        const key = WEATHER_ERROR_KEYS[code];
        const copy = dictionary[key];
        expect(typeof copy, `${locale}:${code}`).toBe('string');
        expect(copy.trim().length, `${locale}:${code}`).toBeGreaterThan(0);
      }
    }
  });

  it('actually translates the copy instead of falling back to English', () => {
    for (const code of CODES) {
      const key = WEATHER_ERROR_KEYS[code];
      expect(fr[key], `fr:${code}`).not.toBe(en[key]);
      expect(es[key], `es:${code}`).not.toBe(en[key]);
    }
  });
});
