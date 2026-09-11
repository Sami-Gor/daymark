import { afterEach, describe, expect, it } from 'vitest';
import { ALERT_SOURCE, ALERT_THRESHOLDS, getPrimaryAlert, getWeatherAlerts } from './weather-alerts';
import type { WeatherPayload } from './weather';

const TIMES = ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00']
  .map((time) => `2026-09-07T${time}`);

function buildWeather(overrides: {
  current?: WeatherPayload['current'];
  hourly?: WeatherPayload['hourly'];
  daily?: WeatherPayload['daily'];
} = {}): WeatherPayload {
  return {
    timezone: 'Europe/London',
    current: overrides.current ?? { time: '2026-09-07T12:00', temperature_2m: 18 },
    hourly: overrides.hourly ?? {
      time: TIMES,
      temperature_2m: TIMES.map(() => 18),
      apparent_temperature: TIMES.map(() => 18),
      precipitation: TIMES.map(() => 0),
      rain: TIMES.map(() => 0),
      showers: TIMES.map(() => 0),
      snowfall: TIMES.map(() => 0),
      precipitation_probability: TIMES.map(() => 10),
      weather_code: TIMES.map(() => 1),
      wind_speed_10m: TIMES.map(() => 10),
      wind_gusts_10m: TIMES.map(() => 15),
      uv_index: TIMES.map(() => 1),
    },
    daily: overrides.daily ?? {
      time: ['2026-09-07', '2026-09-08', '2026-09-09'],
      weather_code: [1, 1, 1],
      temperature_2m_max: [20, 20, 20],
      temperature_2m_min: [12, 12, 12],
      precipitation_sum: [0, 0, 0],
      snowfall_sum: [0, 0, 0],
      precipitation_probability_max: [10, 10, 10],
      wind_gusts_10m_max: [20, 20, 20],
      sunrise: ['2026-09-07T06:30'],
      sunset: ['2026-09-07T19:40'],
      uv_index_max: [3, 3, 3],
    },
  };
}

function hourlyWith(field: keyof NonNullable<WeatherPayload['hourly']>, values: Array<number | null>): NonNullable<WeatherPayload['hourly']> {
  return { ...buildWeather().hourly!, [field]: values };
}

function onlyAt(index: number, value: number, base: number): number[] {
  return TIMES.map((_, position) => (position === index ? value : base));
}

afterEach(() => {
  delete process.env.TZ;
});

describe('getWeatherAlerts', () => {
  it('returns nothing when no threshold is crossed', () => {
    expect(getWeatherAlerts(buildWeather())).toEqual([]);
  });

  it('reports a moderate sustained-wind risk with a location-safe window', () => {
    const weather = buildWeather({ hourly: hourlyWith('wind_speed_10m', onlyAt(2, 45, 10)) });
    // 14:00 is the only qualifying hour; the window ends at the next reading (15:00).
    const wind = getWeatherAlerts(weather, { locale: 'en-US' });
    expect(wind).toHaveLength(1);
    expect(wind[0]).toMatchObject({
      id: 'forecast-risk.wind',
      type: 'forecast-risk',
      hazard: 'wind',
      severity: 'moderate',
      title: 'Strong winds expected',
      startTime: '2026-09-07T14:00',
      endTime: '2026-09-07T15:00',
      source: ALERT_SOURCE,
    });
    expect(wind[0].summary).toContain('2 PM');
    expect(wind[0].summary).toContain('3 PM');
  });

  it('escalates to a severe gust risk and converts wind units', () => {
    const weather = buildWeather({ hourly: hourlyWith('wind_gusts_10m', onlyAt(5, 110, 15)) });
    const [gust] = getWeatherAlerts(weather, { locale: 'en-US' });
    expect(gust.severity).toBe('severe');
    expect(gust.summary).toContain('110 km/h');
    const [gustF] = getWeatherAlerts(weather, { unit: 'fahrenheit', locale: 'en-US' });
    expect(gustF.summary).toContain('68 mph');
  });

  it('reports heavy rain', () => {
    const weather = buildWeather({ hourly: hourlyWith('precipitation', onlyAt(3, 9, 0)) });
    const [alert] = getWeatherAlerts(weather, { locale: 'en-US' });
    expect(alert.hazard).toBe('rain');
    expect(alert.severity).toBe('high');
    expect(alert.title).toBe('Heavy rain likely');
    expect(alert.summary).toContain('9.0 mm/h');
  });

  it('reports snow', () => {
    const weather = buildWeather({ hourly: hourlyWith('snowfall', onlyAt(4, 3.5, 0)) });
    const [alert] = getWeatherAlerts(weather, { locale: 'en-US' });
    expect(alert.hazard).toBe('snow');
    expect(alert.severity).toBe('high');
    expect(alert.title).toBe('Snow expected');
    expect(alert.summary).toContain('3.5 cm/h');
  });

  it('reports thunderstorms and escalates severe codes', () => {
    const moderate = buildWeather({ hourly: hourlyWith('weather_code', onlyAt(6, 95, 1)) });
    expect(getWeatherAlerts(moderate)[0]).toMatchObject({ hazard: 'thunderstorm', severity: 'moderate', title: 'Thunderstorms possible' });
    const severe = buildWeather({ hourly: hourlyWith('weather_code', onlyAt(6, 96, 1)) });
    expect(getWeatherAlerts(severe)[0]).toMatchObject({ hazard: 'thunderstorm', severity: 'high', title: 'Severe thunderstorms possible' });
  });

  it('reports heat and cold from the location daily values', () => {
    const hot = buildWeather({
      daily: { ...buildWeather().daily!, temperature_2m_max: [36, 20, 20] },
    });
    expect(getWeatherAlerts(hot)[0]).toMatchObject({ hazard: 'heat', severity: 'high', title: 'Very hot day expected' });
    expect(getWeatherAlerts(hot)[0].summary).toContain('36°');

    const cold = buildWeather({
      daily: { ...buildWeather().daily!, temperature_2m_min: [-20, 12, 12] },
    });
    expect(getWeatherAlerts(cold)[0]).toMatchObject({ hazard: 'cold', severity: 'high', title: 'Very cold conditions expected' });
    expect(getWeatherAlerts(cold)[0].summary).toContain('-20°');
  });

  it('orders multiple hazards by severity, then by stable hazard order', () => {
    const mixed = buildWeather({
      hourly: {
        ...buildWeather().hourly!,
        wind_gusts_10m: onlyAt(5, 110, 15),
        precipitation: onlyAt(3, 9, 0),
        weather_code: onlyAt(6, 95, 1),
      },
    });
    expect(getWeatherAlerts(mixed).map((alert) => alert.id)).toEqual([
      'forecast-risk.wind',
      'forecast-risk.rain',
      'forecast-risk.thunderstorm',
    ]);

    const allModerate = buildWeather({
      hourly: {
        ...buildWeather().hourly!,
        wind_speed_10m: onlyAt(2, 45, 10),
        precipitation: onlyAt(3, 5, 0),
        weather_code: onlyAt(6, 95, 1),
      },
    });
    expect(getWeatherAlerts(allModerate).map((alert) => alert.id)).toEqual([
      'forecast-risk.wind',
      'forecast-risk.thunderstorm',
      'forecast-risk.rain',
    ]);
  });

  it('handles missing data without inventing alerts', () => {
    expect(getWeatherAlerts({})).toEqual([]);
    expect(getWeatherAlerts({ hourly: { time: TIMES }, daily: { time: ['2026-09-07'] } })).toEqual([]);
    expect(getPrimaryAlert({})).toBeNull();
  });

  it('produces stable, deterministic output', () => {
    const weather = buildWeather({
      hourly: {
        ...buildWeather().hourly!,
        wind_gusts_10m: onlyAt(5, 110, 15),
        precipitation: onlyAt(3, 9, 0),
      },
    });
    expect(getWeatherAlerts(weather, { locale: 'en-US' })).toEqual(getWeatherAlerts(weather, { locale: 'en-US' }));
  });

  it('uses the location wall clock regardless of the device timezone', () => {
    const weather = buildWeather({ hourly: hourlyWith('wind_speed_10m', onlyAt(2, 45, 10)) });
    const original = process.env.TZ;
    const baseline = getWeatherAlerts(weather, { locale: 'en-US' });
    try {
      for (const timeZone of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
        process.env.TZ = timeZone;
        expect(getWeatherAlerts(weather, { locale: 'en-US' })).toEqual(baseline);
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it('documents its thresholds centrally', () => {
    expect(ALERT_THRESHOLDS.windGustKmh.severe).toBe(100);
    expect(ALERT_THRESHOLDS.rainMmPerHour.high).toBe(8);
    expect(ALERT_THRESHOLDS.thunderstormCodes).toContain(95);
  });
});
