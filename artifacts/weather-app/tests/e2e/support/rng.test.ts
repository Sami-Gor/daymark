import { describe, expect, it } from 'vitest';
import {
  createSeededRandom,
  hashString,
  randomFloat,
  randomInt,
  randomItem,
  resolveSeed,
} from './rng';
import {
  buildAirForScenario,
  buildForecastForScenario,
  CANONICAL_FORECAST,
  expectedTemperatureText,
  expectedUvText,
  generateWeatherScenario,
} from './test-data';

/*
 * Unit coverage for the new randomisation abstractions.
 *
 * Playwright specs exercise the generators against the real UI; these tests
 * pin the properties the suite relies on: determinism, per-test separation,
 * bounded data and the canonical fixtures staying frozen.
 */

describe('seeded random numbers', () => {
  it('produces the same sequence for the same seed', () => {
    const first = createSeededRandom(12345);
    const second = createSeededRandom(12345);
    const firstValues = Array.from({ length: 8 }, () => first());
    const secondValues = Array.from({ length: 8 }, () => second());
    expect(firstValues).toEqual(secondValues);
  });

  it('produces a different stream for a different seed', () => {
    const first = createSeededRandom(1);
    const second = createSeededRandom(2);
    expect(Array.from({ length: 8 }, () => first())).not.toEqual(Array.from({ length: 8 }, () => second()));
  });

  it('returns numbers in [0, 1)', () => {
    const random = createSeededRandom(7);
    for (let index = 0; index < 500; index += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('bounds integers and floats inclusively', () => {
    const random = createSeededRandom(99);
    for (let index = 0; index < 300; index += 1) {
      const integer = randomInt(random, -4, 9);
      expect(integer).toBeGreaterThanOrEqual(-4);
      expect(integer).toBeLessThanOrEqual(9);
      expect(Number.isInteger(integer)).toBe(true);

      const float = randomFloat(random, -1.5, 2.5, 1);
      expect(float).toBeGreaterThanOrEqual(-1.5);
      expect(float).toBeLessThanOrEqual(2.5);
    }
  });

  it('picks items from a list', () => {
    const random = createSeededRandom(3);
    const items = ['a', 'b', 'c'] as const;
    for (let index = 0; index < 20; index += 1) {
      expect(items).toContain(randomItem(random, items));
    }
  });

  it('rejects an empty item list instead of returning undefined', () => {
    expect(() => randomItem(createSeededRandom(1), [])).toThrow(/at least one item/);
  });
});

describe('seed resolution', () => {
  it('is a pure function of the test title path', () => {
    const title = ['weather', 'randomised', 'renders values'];
    expect(resolveSeed(title)).toBe(resolveSeed([...title]));
    expect(resolveSeed(title)).toBe(hashString(title.join(' › ')));
  });

  it('gives different tests different seeds', () => {
    expect(resolveSeed(['a', 'test one'])).not.toBe(resolveSeed(['a', 'test two']));
  });

  it('lets DAYMARK_E2E_SEED redefine the data while keeping tests distinct', () => {
    const defaultSeed = resolveSeed(['suite', 'test']);
    const overridden = resolveSeed(['suite', 'test'], '2026');
    expect(overridden).not.toBe(defaultSeed);
    expect(overridden).toBe(resolveSeed(['suite', 'test'], '2026'));
    expect(overridden).not.toBe(resolveSeed(['suite', 'other test'], '2026'));
  });

  it('ignores blank overrides', () => {
    expect(resolveSeed(['suite', 'test'], '   ')).toBe(resolveSeed(['suite', 'test']));
  });
});

describe('generated weather data', () => {
  it('is deterministic for a given seed and stays inside its documented bounds', () => {
    const first = generateWeatherScenario(createSeededRandom(42));
    const second = generateWeatherScenario(createSeededRandom(42));
    expect(first).toEqual(second);
    expect(first.temperatureC).toBeGreaterThanOrEqual(-18);
    expect(first.temperatureC).toBeLessThanOrEqual(42);
    expect(first.humidity).toBeGreaterThanOrEqual(5);
    expect(first.humidity).toBeLessThanOrEqual(100);
    expect(first.rainProbability).toBeGreaterThanOrEqual(0);
    expect(first.rainProbability).toBeLessThanOrEqual(100);
    expect(first.uvIndex).toBeGreaterThanOrEqual(0);
    expect(first.uvIndex).toBeLessThanOrEqual(12);
    expect(first.aqi).toBeGreaterThanOrEqual(5);
    expect(first.aqi).toBeLessThanOrEqual(180);
  });

  it('does not mutate the canonical regression fixture', () => {
    const snapshot = JSON.parse(JSON.stringify(CANONICAL_FORECAST));
    const scenario = generateWeatherScenario(createSeededRandom(7));
    buildForecastForScenario(scenario);
    buildAirForScenario(scenario);
    expect(CANONICAL_FORECAST).toEqual(snapshot);
    expect(CANONICAL_FORECAST.current.temperature_2m).toBe(20.4);
    expect(CANONICAL_FORECAST.current.uv_index).toBe(2.5);
    expect(CANONICAL_FORECAST.hourly.temperature_2m).toHaveLength(12);
  });

  it('builds complete payloads with the requested current values', () => {
    const scenario = {
      temperatureC: 12.7,
      apparentC: 11.1,
      humidity: 66,
      rainProbability: 40,
      uvIndex: 5,
      aqi: 75,
    };
    const forecast = buildForecastForScenario(scenario);
    expect(forecast.current.temperature_2m).toBe(12.7);
    expect(forecast.current.apparent_temperature).toBe(11.1);
    expect(forecast.current.relative_humidity_2m).toBe(66);
    expect(forecast.hourly.temperature_2m).toHaveLength(CANONICAL_FORECAST.hourly.time.length);
    expect(forecast.daily.time).toHaveLength(3);
    const air = buildAirForScenario(scenario);
    expect(air.current.us_aqi).toBe(75);
  });

  it('formats expected text exactly like the UI', () => {
    expect(expectedTemperatureText(20.4)).toBe('20°C');
    expect(expectedTemperatureText(20.4, 'fahrenheit')).toBe('69°F');
    expect(expectedTemperatureText(-0.6)).toBe('-1°C');
    expect(expectedUvText(7)).toBe('7');
    expect(expectedUvText(2.5)).toBe('2.5');
  });
});
