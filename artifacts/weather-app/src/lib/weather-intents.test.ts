import { describe, expect, it } from 'vitest';
import {
  DAYMARK_INTENTS,
  INTENT_QUERY_VALUES,
  UNKNOWN_INTENT_MESSAGE,
  getAirQualitySummary,
  getAlertsSummary,
  getCurrentConditions,
  getHourlySummary,
  getIntentQueryValue,
  getIntentResponse,
  getRainSummary,
  getTodayBriefing,
  getTomorrowSummary,
  getUVSummary,
  normalizeTranscript,
  resolveIntentCommand,
  resolveIntentTranscript,
  type DaymarkIntentId,
  type DaymarkIntentResponse,
} from './weather-intents';
import type { WeatherPayload } from './weather';

const HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00',
  '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00']
  .map((time) => `2026-09-11T${time}`);

const DEFAULT_CURRENT = {
  time: '2026-09-11T13:00',
  temperature_2m: 18.4,
  relative_humidity_2m: 62,
  apparent_temperature: 17.1,
  precipitation: 0,
  cloud_cover: 80,
  weather_code: 3,
  uv_index: 4,
};

const DEFAULT_HOURLY = {
  time: HOURS,
  temperature_2m: [14, 15, 16, 17, 18, 18.4, 19, 19, 18, 17, 16, 15, 14, 13, 12, 11],
  precipitation_probability: [5, 5, 10, 10, 10, 10, 20, 30, 45, 60, 40, 20, 10, 5, 5, 5],
  weather_code: [3, 3, 3, 2, 2, 3, 3, 61, 61, 80, 80, 3, 3, 3, 2, 2],
  uv_index: [0, 1, 2, 3, 3, 4, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0],
};

const DEFAULT_DAILY = {
  time: ['2026-09-11', '2026-09-12', '2026-09-13'],
  weather_code: [3, 61, 0],
  temperature_2m_max: [19, 17, 21],
  temperature_2m_min: [11, 10, 12],
  precipitation_probability_max: [60, 90, 0],
  sunrise: ['2026-09-11T06:30'],
  sunset: ['2026-09-11T19:40'],
  uv_index_max: [5, 3, 6],
};

const DEFAULT_AIR = {
  current: { us_aqi: 33, pm10: 12, pm2_5: 6.5, nitrogen_dioxide: 9, ozone: 60 },
  hourly: { time: ['2026-09-11T13:00'], us_aqi: [33], pm10: [12], pm2_5: [6.5] },
};

type WeatherOverrides = {
  current?: WeatherPayload['current'];
  hourly?: WeatherPayload['hourly'];
  daily?: WeatherPayload['daily'];
  airQuality?: WeatherPayload['airQuality'];
};

function buildWeather(overrides: WeatherOverrides = {}): WeatherPayload {
  return {
    latitude: 51.51,
    longitude: -0.13,
    timezone: 'Europe/London',
    timezone_abbreviation: 'BST',
    utc_offset_seconds: 3600,
    current: 'current' in overrides ? overrides.current : DEFAULT_CURRENT,
    hourly: 'hourly' in overrides ? overrides.hourly : DEFAULT_HOURLY,
    daily: 'daily' in overrides ? overrides.daily : DEFAULT_DAILY,
    airQuality: 'airQuality' in overrides ? overrides.airQuality : DEFAULT_AIR,
  };
}

function expectValidResponse(response: DaymarkIntentResponse, intent: DaymarkIntentId): void {
  expect(response.intent).toBe(intent);
  expect(response.title.length).toBeGreaterThan(0);
  expect(response.spokenText.length).toBeGreaterThan(0);
  expect(response.displayText.length).toBeGreaterThan(0);
  expect(['low', 'normal', 'high']).toContain(response.priority);
}

describe('intent vocabulary', () => {
  it('exposes stable intent identifiers', () => {
    expect(DAYMARK_INTENTS).toEqual({
      today: 'daymark.today',
      current: 'daymark.current',
      rain: 'daymark.rain',
      uv: 'daymark.uv',
      airQuality: 'daymark.air_quality',
      alerts: 'daymark.alerts',
      hours: 'daymark.hours',
      tomorrow: 'daymark.tomorrow',
    });
  });

  it('resolves canonical commands deterministically', () => {
    expect(resolveIntentCommand('today')).toBe(DAYMARK_INTENTS.today);
    expect(resolveIntentCommand(' RAIN ')).toBe(DAYMARK_INTENTS.rain);
    expect(resolveIntentCommand('uv')).toBe(DAYMARK_INTENTS.uv);
    expect(resolveIntentCommand('air-quality')).toBe(DAYMARK_INTENTS.airQuality);
    expect(resolveIntentCommand('air_quality')).toBe(DAYMARK_INTENTS.airQuality);
    expect(resolveIntentCommand('hours')).toBe(DAYMARK_INTENTS.hours);
    expect(resolveIntentCommand('tomorrow')).toBe(DAYMARK_INTENTS.tomorrow);
    expect(resolveIntentCommand('weather please')).toBeNull();
    expect(resolveIntentCommand('')).toBeNull();
    expect(resolveIntentCommand(null)).toBeNull();
  });

  it('maps intents to future deep-link values', () => {
    expect(getIntentQueryValue(DAYMARK_INTENTS.airQuality)).toBe('air-quality');
    expect(Object.values(INTENT_QUERY_VALUES)).toEqual([
      'today', 'current', 'rain', 'uv', 'air-quality', 'alerts', 'hours', 'tomorrow',
    ]);
  });

  it('returns a valid response for every intent through getIntentResponse', () => {
    const weather = buildWeather();
    for (const intent of Object.values(DAYMARK_INTENTS)) {
      expectValidResponse(getIntentResponse(intent, weather), intent);
    }
  });
});

describe('getCurrentConditions', () => {
  it('summarises conditions for the provided location', () => {
    const response = getCurrentConditions(buildWeather(), { locationName: 'London' });
    expect(response.intent).toBe(DAYMARK_INTENTS.current);
    expect(response.spokenText).toContain('18 degrees');
    expect(response.spokenText).toContain('in London');
    expect(response.spokenText).toContain('overcast');
    expect(response.spokenText).toContain('feels like 17 degrees');
    expect(response.data?.temperature).toBe(18);
    expect(response.data?.available).toBe(true);
  });

  it('works for a selected location other than London', () => {
    const response = getCurrentConditions(buildWeather(), { locationName: 'Tokyo' });
    expect(response.spokenText).toContain('in Tokyo');
    expect(response.spokenText).not.toContain('London');
  });

  it('honours a Fahrenheit context', () => {
    const response = getCurrentConditions(buildWeather(), { unit: 'fahrenheit' });
    expect(response.spokenText).toContain('65 degrees');
    expect(response.data?.temperature).toBe(65);
    expect(response.data?.unit).toBe('fahrenheit');
  });

  it('handles missing temperature gracefully', () => {
    const response = getCurrentConditions(buildWeather({
      current: { time: '2026-09-11T13:00', temperature_2m: null },
    }));
    expect(response.spokenText).toContain('unavailable');
    expect(response.priority).toBe('low');
    expect(response.data?.available).toBe(false);
  });
});

describe('getRainSummary', () => {
  it('reports when rain is likely later today', () => {
    const response = getRainSummary(buildWeather(), { locale: 'en-US' });
    expect(response.spokenText).toContain('Rain is likely later today');
    expect(response.spokenText).toContain('5 PM');
    expect(response.spokenText).toContain('60%');
    expect(response.data?.expected).toBe(true);
    expect(response.data?.peakTime).toBe('2026-09-11T17:00');
    expect(response.data?.likelyTime).toBe('2026-09-11T16:00');
  });

  it('reports no rain when probabilities stay low', () => {
    const response = getRainSummary(buildWeather({
      hourly: { ...DEFAULT_HOURLY, precipitation_probability: HOURS.map(() => 5) },
    }));
    expect(response.spokenText).toBe("Rain isn't expected for the rest of today.");
    expect(response.displayText).toBe('No rain expected');
    expect(response.data?.expected).toBe(false);
    expect(response.priority).toBe('low');
  });

  it('reports rain happening now without overstating later rain', () => {
    const response = getRainSummary(buildWeather({
      current: { ...DEFAULT_CURRENT, precipitation: 0.6 },
      hourly: { ...DEFAULT_HOURLY, precipitation_probability: HOURS.map(() => 10) },
    }));
    expect(response.spokenText).toContain("It's raining now.");
    expect(response.data?.rainingNow).toBe(true);
  });

  it('handles missing hourly rain data', () => {
    const response = getRainSummary(buildWeather({ hourly: {} }));
    expect(response.spokenText).toContain('unavailable');
    expect(response.data?.available).toBe(false);
  });
});

describe('getUVSummary', () => {
  it('reports an active protection window with the reused threshold logic', () => {
    const response = getUVSummary(buildWeather(), { locale: 'en-US' });
    expect(response.spokenText).toContain('The UV index is 4 (moderate).');
    expect(response.spokenText).toContain('Sun protection is recommended until 5 PM.');
    expect(response.data?.status).toBe('active');
    expect(response.data?.window).toEqual({ start: '2026-09-11T11:00', end: '2026-09-11T17:00', peak: 5 });
  });

  it('reports a future protection window', () => {
    const response = getUVSummary(buildWeather({
      current: { ...DEFAULT_CURRENT, time: '2026-09-11T08:00', uv_index: 0 },
    }), { locale: 'en-US' });
    expect(response.spokenText).toContain('between 11 AM and 5 PM');
    expect(response.data?.status).toBe('future');
  });

  it('reports a protection window that has passed', () => {
    const response = getUVSummary(buildWeather({
      current: { ...DEFAULT_CURRENT, time: '2026-09-11T18:00', uv_index: 1 },
    }), { locale: 'en-US' });
    expect(response.spokenText).toContain('has passed');
    expect(response.data?.status).toBe('past');
  });

  it('reports no protection window when UV never reaches the threshold', () => {
    const response = getUVSummary(buildWeather({
      current: { ...DEFAULT_CURRENT, uv_index: 1 },
      hourly: { ...DEFAULT_HOURLY, uv_index: HOURS.map(() => 1) },
    }));
    expect(response.spokenText).toContain('No sun protection window is expected today.');
    expect(response.data?.status).toBe('none');
  });

  it('handles missing UV data', () => {
    const response = getUVSummary(buildWeather({ hourly: {}, current: { time: '2026-09-11T13:00' } }));
    expect(response.spokenText).toContain('unavailable');
    expect(response.data?.available).toBe(false);
  });
});

describe('getAirQualitySummary', () => {
  it('summarises AQI in plain English without sensor claims', () => {
    const response = getAirQualitySummary(buildWeather());
    expect(response.spokenText).toContain('Air quality is good (US AQI 33).');
    expect(response.spokenText.toLowerCase()).not.toContain('sensor');
    expect(response.data?.level).toBe('Good');
    expect(response.data?.aqi).toBe(33);
  });

  it('handles unavailable AQI gracefully', () => {
    const response = getAirQualitySummary(buildWeather({ airQuality: null }));
    expect(response.spokenText).toContain('unavailable');
    expect(response.priority).toBe('low');
    expect(response.data?.available).toBe(false);
  });

  it('raises priority for unhealthy air', () => {
    const response = getAirQualitySummary(buildWeather({ airQuality: { current: { us_aqi: 180 } } }));
    expect(response.priority).toBe('high');
    expect(response.data?.level).toBe('Unhealthy');
  });
});

describe('getHourlySummary', () => {
  it('summarises trend, rain timing and UV change', () => {
    const response = getHourlySummary(buildWeather(), { locale: 'en-US' });
    expect(response.spokenText).toContain('Over the next 6 hours');
    expect(response.spokenText).toContain('cooling');
    expect(response.spokenText).toContain('Rain becomes likely around 5 PM.');
    expect(response.spokenText).toContain('UV reaches 5');
    expect(response.data?.trend).toBe('cooling');
    expect(response.data?.peakRainProbability).toBe(60);
  });

  it('handles missing hourly data', () => {
    const response = getHourlySummary(buildWeather({ hourly: {} }));
    expect(response.spokenText).toContain('unavailable');
    expect(response.data?.available).toBe(false);
  });
});

describe('getTomorrowSummary', () => {
  it('summarises tomorrow without narrating every value', () => {
    const response = getTomorrowSummary(buildWeather());
    expect(response.spokenText).toContain('Tomorrow looks rainy');
    expect(response.spokenText).toContain('high of 17 degrees');
    expect(response.spokenText).toContain('low of 10 degrees');
    expect(response.spokenText).toContain('Rain is likely');
    expect(response.data?.date).toBe('2026-09-12');
  });

  it('handles missing tomorrow data', () => {
    const response = getTomorrowSummary(buildWeather({ daily: { time: ['2026-09-11'] } }));
    expect(response.spokenText).toContain('unavailable');
    expect(response.data?.available).toBe(false);
  });
});

describe('getTodayBriefing', () => {
  it('assembles a prioritised briefing from current, rain, UV and air', () => {
    const response = getTodayBriefing(buildWeather(), { locationName: 'London', locale: 'en-US' });
    expect(response.intent).toBe(DAYMARK_INTENTS.today);
    expect(response.spokenText).toContain('18 degrees in London');
    expect(response.spokenText).toContain('Rain is likely later today');
    expect(response.spokenText).toContain('Sun protection is recommended until 5 PM');
    expect(response.spokenText).toContain('Air quality is good');
    expect(response.data?.current).toBeTruthy();
    expect(response.data?.rain).toBeTruthy();
  });

  it('omits unavailable sections and escalates priority when needed', () => {
    const quiet = getTodayBriefing(buildWeather({ airQuality: null, hourly: {} }));
    expect(quiet.spokenText).not.toContain('Air quality');
    const stormy = getTodayBriefing(buildWeather({
      current: { ...DEFAULT_CURRENT, precipitation: 0.8 },
      hourly: { ...DEFAULT_HOURLY, precipitation_probability: HOURS.map(() => 80) },
      airQuality: { current: { us_aqi: 180 } },
    }));
    expect(stormy.priority).toBe('high');
  });
});

describe('alerts integration', () => {
  const windy = buildWeather({
    hourly: {
      ...DEFAULT_HOURLY,
      wind_speed_10m: HOURS.map(() => 10),
      wind_gusts_10m: HOURS.map((_, index) => (index === 9 ? 110 : 15)),
    },
  });

  it('reports no severe weather when nothing crosses the thresholds', () => {
    const response = getAlertsSummary(buildWeather());
    expect(response.intent).toBe(DAYMARK_INTENTS.alerts);
    expect(response.spokenText).toContain('No severe weather');
    expect(response.priority).toBe('low');
    expect(response.data?.count).toBe(0);
  });

  it('surfaces a forecast-derived wind risk with an honest label', () => {
    const response = getAlertsSummary(windy, { locale: 'en-US' });
    expect(response.intent).toBe(DAYMARK_INTENTS.alerts);
    expect(response.spokenText).toContain('Strong winds expected');
    expect(response.displayText).toContain('Severe risk');
    expect(response.priority).toBe('high');
    expect(response.data?.count).toBe(1);
  });

  it('includes a risk near the start of the today briefing and omits it when clear', () => {
    const windyBriefing = getTodayBriefing(windy, { locationName: 'London', locale: 'en-US' });
    expect(windyBriefing.spokenText).toContain('Strong winds expected');
    expect(windyBriefing.spokenText.indexOf('Strong winds expected')).toBeLessThan(windyBriefing.spokenText.indexOf('Rain'));
    expect(windyBriefing.data?.alerts).toBeTruthy();

    const clearBriefing = getTodayBriefing(buildWeather(), { locationName: 'London', locale: 'en-US' });
    expect(clearBriefing.spokenText).not.toContain('Strong winds');
    expect(clearBriefing.spokenText).not.toContain('No severe weather');
  });
});

describe('robustness and privacy', () => {
  it('degrades gracefully when almost everything is missing', () => {
    const sparse: WeatherPayload = { current: { time: '2026-09-11T13:00' } };
    expectValidResponse(getCurrentConditions(sparse), DAYMARK_INTENTS.current);
    expectValidResponse(getRainSummary(sparse), DAYMARK_INTENTS.rain);
    expectValidResponse(getUVSummary(sparse), DAYMARK_INTENTS.uv);
    expectValidResponse(getAirQualitySummary(sparse), DAYMARK_INTENTS.airQuality);
    expectValidResponse(getHourlySummary(sparse), DAYMARK_INTENTS.hours);
    expectValidResponse(getTomorrowSummary(sparse), DAYMARK_INTENTS.tomorrow);
    expectValidResponse(getTodayBriefing(sparse), DAYMARK_INTENTS.today);
  });

  it('never exposes coordinates in any response', () => {
    const responses = Object.values(DAYMARK_INTENTS).map((intent) => getIntentResponse(intent, buildWeather()));
    for (const response of responses) {
      const serialized = JSON.stringify(response);
      expect(serialized).not.toContain('latitude');
      expect(serialized).not.toContain('longitude');
      expect(serialized).not.toContain('51.51');
      expect(serialized).not.toContain('-0.13');
    }
  });
});

describe('resolveIntentTranscript', () => {
  it('normalizes transcripts without storing them', () => {
    expect(normalizeTranscript("  What's the UV?!  ")).toBe("what's the uv");
    expect(normalizeTranscript('Air-Quality   NOW')).toBe('air quality now');
  });

  it.each([
    ["what's the weather today", 'daymark.today'],
    ['tell me about today', 'daymark.today'],
    ['what is the weather', 'daymark.today'],
    ['will it rain', 'daymark.rain'],
    ['when will it rain', 'daymark.rain'],
    ['do I need an umbrella', 'daymark.rain'],
    ["what's the uv", 'daymark.uv'],
    ['do I need sun protection', 'daymark.uv'],
    ['when should I use sunscreen', 'daymark.uv'],
    ['how is the air', 'daymark.air_quality'],
    ["what's the air quality", 'daymark.air_quality'],
    ['is there any severe weather', 'daymark.alerts'],
    ['any warnings today', 'daymark.alerts'],
    ['is the weather dangerous', 'daymark.alerts'],
    ["what's it like now", 'daymark.current'],
    ["what's the temperature", 'daymark.current'],
    ['what about the next few hours', 'daymark.hours'],
    ["what's happening later", 'daymark.hours'],
    ["what's tomorrow like", 'daymark.tomorrow'],
    ['weather tomorrow', 'daymark.tomorrow'],
  ])('maps "%s" to %s', (phrase, intent) => {
    expect(resolveIntentTranscript(phrase)).toBe(intent);
  });

  it('prioritises day words over weather phenomena', () => {
    expect(resolveIntentTranscript('will it rain tomorrow')).toBe(DAYMARK_INTENTS.tomorrow);
    expect(resolveIntentTranscript('uv tomorrow')).toBe(DAYMARK_INTENTS.tomorrow);
  });

  it('returns null for unknown questions without inventing an answer', () => {
    expect(resolveIntentTranscript('what is the meaning of life')).toBeNull();
    expect(resolveIntentTranscript('')).toBeNull();
    expect(resolveIntentTranscript(undefined)).toBeNull();
    expect(UNKNOWN_INTENT_MESSAGE).toContain('rain');
  });

  it('answers rain and sun-protection timing in the selected location clock', () => {
    const tokyo = buildWeather({ current: { ...DEFAULT_CURRENT, time: '2026-09-11T09:00', uv_index: 1 } });
    const rainIntent = resolveIntentTranscript('When will it rain?');
    const uvIntent = resolveIntentTranscript('When do I need sun protection?');
    expect(rainIntent).toBe(DAYMARK_INTENTS.rain);
    expect(uvIntent).toBe(DAYMARK_INTENTS.uv);
    const rain = getIntentResponse(rainIntent as DaymarkIntentId, tokyo, { locationName: 'Tokyo', locale: 'en-US' });
    expect(rain.spokenText).toContain('5 PM');
    const uv = getIntentResponse(uvIntent as DaymarkIntentId, tokyo, { locationName: 'Tokyo', locale: 'en-US' });
    expect(uv.spokenText).toContain('between 11 AM and 5 PM');
  });
});
