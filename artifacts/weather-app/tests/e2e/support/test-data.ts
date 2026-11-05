import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomFloat, randomInt, randomItem, type RandomSource } from './rng';

/*
 * Canonical fixtures and generated test data.
 *
 * The canonical Open-Meteo payloads below are the deterministic regression
 * fixtures the suite has always used. They are frozen: do not replace them
 * with generated values. Randomised coverage builds *new* payloads from these
 * templates through buildForecastForScenario(), so deterministic and varied
 * coverage stay separate.
 *
 * Timestamps are fixed so the rendered UI (labels, "Now", day names) is stable.
 */

export type CurrentWeather = {
  time?: string | null;
  temperature_2m?: number | null;
  relative_humidity_2m?: number | null;
  dew_point_2m?: number | null;
  apparent_temperature?: number | null;
  precipitation?: number | null;
  cloud_cover?: number | null;
  weather_code?: number | null;
  uv_index?: number | null;
};

export type HourlyWeather = {
  time: string[];
  temperature_2m: Array<number | null>;
  precipitation_probability: Array<number | null>;
  weather_code: Array<number | null>;
  uv_index: Array<number | null>;
  precipitation?: Array<number | null>;
  snowfall?: Array<number | null>;
  wind_speed_10m?: Array<number | null>;
  wind_gusts_10m?: Array<number | null>;
};

export type DailyWeather = {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_probability_max: number[];
  sunrise: string[];
  sunset: string[];
  uv_index_max: number[];
};

export type ForecastFixture = {
  latitude: number;
  longitude: number;
  timezone?: string;
  timezone_abbreviation?: string;
  utc_offset_seconds?: number;
  current: CurrentWeather;
  hourly: HourlyWeather;
  daily: DailyWeather;
};

export type AirFixture = {
  current: {
    us_aqi: number | null;
    pm10: number | null;
    pm2_5: number | null;
    nitrogen_dioxide: number | null;
    ozone: number | null;
  };
  hourly: {
    time: string[];
    us_aqi: Array<number | null>;
    pm10: Array<number | null>;
    pm2_5: Array<number | null>;
  };
};

export type GeocodeResult = {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
  country_code?: string;
  timezone?: string;
};

export const CANONICAL_FORECAST: ForecastFixture = {
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

export const CANONICAL_AIR: AirFixture = {
  current: { us_aqi: 33, pm10: 12, pm2_5: 6.5, nitrogen_dioxide: 9, ozone: 60 },
  hourly: { time: ['2026-09-07T12:00'], us_aqi: [33], pm10: [12], pm2_5: [6.5] },
};

export const CANONICAL_GEOCODE = {
  results: [{ name: 'Greenwich', latitude: 51.4789, longitude: 0.0107, country: 'United Kingdom' }],
};

export const PARIS_RESULT: GeocodeResult = {
  name: 'Paris', latitude: 48.8566, longitude: 2.3522, admin1: 'Île-de-France',
  country: 'France', country_code: 'FR', timezone: 'Europe/Paris',
};

export const SPRINGFIELD_ILLINOIS: GeocodeResult = {
  name: 'Springfield', latitude: 39.7817, longitude: -89.6501, admin1: 'Illinois',
  country: 'United States', country_code: 'US', timezone: 'America/Chicago',
};

export const SPRINGFIELD_MISSOURI: GeocodeResult = {
  name: 'Springfield', latitude: 37.2153, longitude: -93.2982, admin1: 'Missouri',
  country: 'United States', country_code: 'US', timezone: 'America/Chicago',
};

export const TOKYO_RESULT: GeocodeResult = {
  name: 'Tokyo', latitude: 35.6762, longitude: 139.6503, admin1: 'Tokyo',
  country: 'Japan', country_code: 'JP', timezone: 'Asia/Tokyo',
};

export const PARIS_FORECAST: ForecastFixture = {
  ...CANONICAL_FORECAST,
  timezone: 'Europe/Paris',
  timezone_abbreviation: 'CEST',
  utc_offset_seconds: 7200,
  current: { ...CANONICAL_FORECAST.current, temperature_2m: 12.4 },
};

export const TOKYO_FORECAST: ForecastFixture = {
  ...CANONICAL_FORECAST,
  timezone: 'Asia/Tokyo',
  timezone_abbreviation: 'JST',
  utc_offset_seconds: 32400,
  current: { ...CANONICAL_FORECAST.current, time: '2026-09-07T21:00', temperature_2m: 26.4 },
};

export const WINDY_FORECAST: ForecastFixture = {
  ...CANONICAL_FORECAST,
  hourly: {
    ...CANONICAL_FORECAST.hourly,
    precipitation: CANONICAL_FORECAST.hourly.time.map(() => 0),
    snowfall: CANONICAL_FORECAST.hourly.time.map(() => 0),
    wind_speed_10m: CANONICAL_FORECAST.hourly.time.map(() => 10),
    wind_gusts_10m: CANONICAL_FORECAST.hourly.time.map((_, index) => (index === 5 ? 110 : 15)),
  },
};

export const TOKYO_WINDY_FORECAST: ForecastFixture = {
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

export const LONDON_PLACE = {
  name: 'London', admin1: 'England', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278,
};

/** Search-style payload used by the geolocation tests. */
export const PARIS_SEARCH = { results: [PARIS_RESULT] };

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..', '..');

/** Sample locality index used by offline-naming tests (loaded verbatim). */
export const LOCALITY_UXBRIDGE_FIXTURE = readFileSync(
  path.join(projectRoot, 'src', 'lib', '__fixtures__', 'uxbridge-sample.json'),
  'utf8',
);

/** A locality index with a single low-confidence record, used to assert suppression. */
export const LOCALITY_LOW_CONFIDENCE_FIXTURE = JSON.stringify({
  cellSize: 0.25,
  count: 1,
  cells: { '566_718': [0, 1] },
  records: [['Far Village', 51.6458, -0.4787, 'GB', '', 'PPL', 800]],
});

export const UXBRIDGE = { latitude: 51.5462123, longitude: -0.4787123 };

/** Privacy policy routes and the published copy each one must contain. */
export const PRIVACY_POLICIES = [
  { lang: 'en', path: '/privacy', heading: 'Privacy Policy', effective: 'Effective date', back: 'Back to weather' },
  { lang: 'fr', path: '/fr/privacy', heading: 'Politique de confidentialité', effective: 'Date d’entrée en vigueur', back: 'Retour à la météo' },
  { lang: 'es', path: '/es/privacy', heading: 'Política de privacidad', effective: 'Fecha de entrada en vigor', back: 'Volver al tiempo' },
] as const;

export type PrivacyLang = (typeof PRIVACY_POLICIES)[number]['lang'];

export const PRIVACY_EXPECTATIONS = {
  en: {
    location: 'rounded to two decimal places',
    speech: 'does not record or store your voice audio or speech transcripts',
    audience: 'general-audience weather utility',
  },
  fr: {
    location: 'arrondies à deux décimales',
    speech: 'n’enregistre ni ne conserve votre audio vocal ni vos transcriptions vocales',
    audience: 'grand public',
  },
  es: {
    location: 'se redondean a dos decimales',
    speech: 'no graba ni almacena tu audio de voz ni tus transcripciones',
    audience: 'público general',
  },
} as const;

/** Google Play promo gallery order and copy (matches src/data/storePromo.ts). */
export const STORE_PROMO = {
  titles: ['Temperature', 'Chance of rain', 'Air quality', 'Sun & daylight', 'Privacy'],
  captions: [
    'Track the day’s temperature in seconds.',
    'Spot the wet hours before you leave.',
    'Air quality, simplified.',
    'Sunrise, sunset, and daylight — beautifully clear.',
    'Private by design.',
  ],
  images: [
    '/store-assets/daymark-promo/daymark-temperature.png',
    '/store-assets/daymark-promo/daymark-rain.png',
    '/store-assets/daymark-promo/daymark-air-quality.png',
    '/store-assets/daymark-promo/daymark-sun-daylight.png',
    '/store-assets/daymark-promo/daymark-privacy.png',
  ],
};

/* ------------------------------------------------------------------------------------------------
 * Randomised scenario generation
 * ---------------------------------------------------------------------------------------------- */

export type WeatherScenario = {
  temperatureC: number;
  apparentC: number;
  humidity: number;
  rainProbability: number;
  uvIndex: number;
  aqi: number;
};

/**
 * Generate a bounded but varied weather scenario. Values stay inside ranges the
 * real API can produce and the UI is designed to render, so failures indicate a
 * genuine formatting/layout regression rather than impossible input.
 */
export function generateWeatherScenario(random: RandomSource): WeatherScenario {
  return {
    temperatureC: randomFloat(random, -18, 42, 1),
    apparentC: randomFloat(random, -25, 48, 1),
    humidity: randomInt(random, 5, 100),
    rainProbability: randomInt(random, 0, 100),
    uvIndex: randomInt(random, 0, 12),
    aqi: randomInt(random, 5, 180),
  };
}

function withHourOffsets(values: number[], offsets: readonly number[]): number[] {
  return values.map((value, index) => {
    const offset = offsets[index % offsets.length];
    return Math.round((value + offset) * 10) / 10;
  });
}

/** Build a complete forecast payload from a generated scenario. */
export function buildForecastForScenario(scenario: WeatherScenario, template: ForecastFixture = CANONICAL_FORECAST): ForecastFixture {
  const hourCount = template.hourly.time.length;
  const temperatures = withHourOffsets(
    Array.from({ length: hourCount }, () => scenario.temperatureC),
    [0, 0.6, 1.2, 1.8, 1.2, 0.6, 0, -0.6, -1.2, -1.8, -2.4, -3],
  );
  return {
    ...template,
    current: {
      ...template.current,
      temperature_2m: scenario.temperatureC,
      apparent_temperature: scenario.apparentC,
      relative_humidity_2m: scenario.humidity,
      uv_index: scenario.uvIndex,
    },
    hourly: {
      ...template.hourly,
      temperature_2m: temperatures,
      precipitation_probability: template.hourly.time.map((_, index) => (
        Math.min(100, Math.max(0, scenario.rainProbability + (index % 3) * 5 - 5))
      )),
      uv_index: template.hourly.time.map((_, index) => (
        index === 0 ? scenario.uvIndex : Math.max(0, Math.round((scenario.uvIndex - index * 0.4) * 10) / 10)
      )),
    },
    daily: {
      ...template.daily,
      temperature_2m_max: template.daily.time.map((_, index) => Math.round((scenario.temperatureC + 1 + index) * 10) / 10),
      temperature_2m_min: template.daily.time.map((_, index) => Math.round((scenario.temperatureC - 8 - index) * 10) / 10),
      precipitation_probability_max: template.daily.time.map(() => scenario.rainProbability),
      uv_index_max: template.daily.time.map((_, index) => Math.max(0, scenario.uvIndex - index)),
    },
  };
}

/** Build an air-quality payload for a generated scenario. */
export function buildAirForScenario(scenario: WeatherScenario, template: AirFixture = CANONICAL_AIR): AirFixture {
  return {
    ...template,
    current: {
      ...template.current,
      us_aqi: scenario.aqi,
    },
    hourly: {
      ...template.hourly,
      us_aqi: [scenario.aqi],
    },
  };
}

/** Pick one of the deterministic locations used by the search/geolocation suites. */
export const LOCATION_CASES = [
  { query: 'paris', result: PARIS_RESULT, forecast: PARIS_FORECAST, city: 'Paris' },
  { query: 'tokyo', result: TOKYO_RESULT, forecast: TOKYO_FORECAST, city: 'Tokyo' },
] as const;

export function pickLocationCase(random: RandomSource): (typeof LOCATION_CASES)[number] {
  return randomItem(random, LOCATION_CASES);
}

/** Temperature text exactly as the UI renders it (rounded, with unit suffix). */
export function expectedTemperatureText(temperatureC: number, unit: 'celsius' | 'fahrenheit' = 'celsius'): string {
  const converted = unit === 'fahrenheit' ? (temperatureC * 9) / 5 + 32 : temperatureC;
  return `${Math.round(converted)}°${unit === 'fahrenheit' ? 'F' : 'C'}`;
}

/** UV text exactly as the UI renders it (integer values have no decimal part). */
export function expectedUvText(uv: number): string {
  return Number.isInteger(uv) ? String(uv) : uv.toFixed(1);
}
