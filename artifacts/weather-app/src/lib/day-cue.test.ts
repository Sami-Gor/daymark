import { describe, expect, it } from 'vitest';

import { DAY_CUE_THRESHOLDS, deriveDayCue } from './day-cue';
import type { WeatherPayload } from './weather';

type HourlyFixture = {
  codes: number[];
  probabilities: number[];
  amounts?: number[];
  uv?: number[];
};

function buildWeather(hourly: HourlyFixture, overrides: Partial<WeatherPayload['current']> = {}): WeatherPayload {
  const times = hourly.codes.map((_, index) => `2026-09-11T${String(9 + index).padStart(2, '0')}:00`);
  return {
    current: {
      time: '2026-09-11T13:00',
      temperature_2m: 18,
      apparent_temperature: 17,
      cloud_cover: 40,
      precipitation: 0,
      weather_code: hourly.codes[4] ?? 1,
      uv_index: hourly.uv?.[4] ?? 4,
      ...overrides,
    },
    hourly: {
      time: times,
      weather_code: hourly.codes,
      precipitation_probability: hourly.probabilities,
      precipitation: hourly.amounts ?? hourly.probabilities.map(() => 0),
      uv_index: hourly.uv ?? hourly.codes.map(() => 4),
    },
  } as unknown as WeatherPayload;
}

const clearHours = (count = 6) => Array.from({ length: count }, () => 0);
const overcastHours = (count = 6) => Array.from({ length: count }, () => 3);
const lowChance = (count = 6) => Array.from({ length: count }, () => 10);

describe('deriveDayCue', () => {
  it('returns sun for a clear, dry day', () => {
    const result = deriveDayCue(buildWeather({ codes: clearHours(), probabilities: lowChance() }));
    expect(result.cue).toBe('sun');
    expect(result.emojis).toEqual(['😎']);
    expect(result.labelKey).toBe('dayCue.sun');
  });

  it('returns rain for a dull, rainy day', () => {
    const result = deriveDayCue(buildWeather({
      codes: overcastHours(),
      probabilities: overcastHours().map(() => 80),
    }));
    expect(result.cue).toBe('rain');
    expect(result.emojis).toEqual(['☔']);
    expect(result.labelKey).toBe('dayCue.rain');
  });

  it('returns mixed when meaningful sun and rain both occur', () => {
    const result = deriveDayCue(buildWeather({
      codes: [1, 1, 1, 61, 61, 1],
      probabilities: [10, 10, 10, 60, 60, 10],
    }));
    expect(result.cue).toBe('mixed');
    expect(result.emojis).toEqual(['😎', '☔']);
    expect(result.labelKey).toBe('dayCue.mixed');
  });

  it('returns the quiet neutral cue for dry overcast conditions', () => {
    const result = deriveDayCue(buildWeather({ codes: overcastHours(), probabilities: lowChance() }));
    expect(result.cue).toBe('neutral');
    expect(result.emojis).toEqual(['☁️']);
    expect(result.labelKey).toBe('dayCue.cloud');
  });

  it('ignores trace rain below the umbrella threshold', () => {
    const result = deriveDayCue(buildWeather({
      codes: clearHours(),
      probabilities: overcastHours().map(() => 25),
      amounts: overcastHours().map(() => 0.1),
    }));
    expect(result.cue).toBe('sun');
  });

  it('falls back to neutral when forecast data is missing', () => {
    const result = deriveDayCue({ current: {}, hourly: {}, daily: {} } as WeatherPayload);
    expect(result.cue).toBe('neutral');
    expect(result.emojis).toEqual(['☁️']);
  });

  it('keeps rain when a brief bright spell interrupts an overwhelmingly rainy day', () => {
    const result = deriveDayCue(buildWeather({
      codes: [1, 61, 61, 61, 61, 61],
      probabilities: [10, 80, 80, 80, 80, 80],
    }));
    expect(result.cue).toBe('rain');
  });

  it('keeps sun when a brief shower interrupts an overwhelmingly sunny day', () => {
    const result = deriveDayCue(buildWeather(
      { codes: [0, 0, 0, 0, 61, 0], probabilities: [5, 5, 5, 5, 50, 5] },
      { time: '2026-09-11T09:00' },
    ));
    expect(result.cue).toBe('sun');
  });

  it('detects rain that is still expected later today', () => {
    const result = deriveDayCue(buildWeather({
      codes: overcastHours(),
      probabilities: [5, 5, 5, 45, 45, 5],
    }));
    expect(result.cue).toBe('rain');
  });

  it('pairs the umbrella with sunglasses when it rains now and clears later', () => {
    const result = deriveDayCue(buildWeather(
      { codes: [0, 0, 1, 1, 1, 1], probabilities: lowChance() },
      { precipitation: 0.6 },
    ));
    expect(result.cue).toBe('mixed');
  });

  it('uses the snow and fog nature for neutral days when present', () => {
    const snow = deriveDayCue(buildWeather({ codes: [71, 71, 71, 71, 71, 71], probabilities: lowChance() }));
    expect(snow.labelKey).toBe('dayCue.snow');
    expect(snow.emojis).toEqual(['❄️']);
    const fog = deriveDayCue(buildWeather({ codes: [45, 45, 45, 45, 45, 45], probabilities: lowChance() }));
    expect(fog.labelKey).toBe('dayCue.fog');
    expect(fog.emojis).toEqual(['🌫️']);
  });

  it('documents the shared thresholds', () => {
    expect(DAY_CUE_THRESHOLDS.rainProbability).toBe(40);
    expect(DAY_CUE_THRESHOLDS.uvSun).toBe(3);
    expect(DAY_CUE_THRESHOLDS.cloudCoverSunMax).toBe(60);
  });
});
