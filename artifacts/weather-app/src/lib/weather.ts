import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Moon,
  Snowflake,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { z } from 'zod';
import { formatDecimal, translate, type Locale } from './i18n';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

export type Unit = 'celsius' | 'fahrenheit';
export type Place = {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  countryCode?: string;
  timezone?: string;
};

/*
 * Open-Meteo responses are untrusted third-party data, so every response is
 * validated here at the network boundary (DAYMARK-SEC-003). Schemas accept
 * everything the UI needs, tolerate legitimately missing or null values
 * (Open-Meteo emits nulls e.g. for night-time UV), and pass unknown fields
 * through instead of rejecting them.
 */
const nullableNumber = z.number().nullable().optional();
const numberArray = z.array(z.number().nullable()).nullish();
const stringArray = z.array(z.string()).nullish();

const AirQualityResponseSchema = z
  .object({
    current: z
      .object({
        us_aqi: nullableNumber,
        pm10: nullableNumber,
        pm2_5: nullableNumber,
        nitrogen_dioxide: nullableNumber,
        ozone: nullableNumber,
        sulphur_dioxide: nullableNumber,
        carbon_monoxide: nullableNumber,
      })
      .passthrough()
      .nullish(),
    hourly: z
      .object({
        time: stringArray,
        us_aqi: numberArray,
        pm10: numberArray,
        pm2_5: numberArray,
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

const WeatherResponseSchema = z
  .object({
    latitude: nullableNumber,
    longitude: nullableNumber,
    timezone: z.string().nullish(),
    timezone_abbreviation: z.string().nullish(),
    utc_offset_seconds: nullableNumber,
    current: z
      .object({
        time: z.string().nullish(),
        temperature_2m: nullableNumber,
        relative_humidity_2m: nullableNumber,
        apparent_temperature: nullableNumber,
        precipitation: nullableNumber,
        cloud_cover: nullableNumber,
        weather_code: nullableNumber,
        uv_index: nullableNumber,
        wind_speed_10m: nullableNumber,
        wind_gusts_10m: nullableNumber,
        rain: nullableNumber,
        showers: nullableNumber,
        snowfall: nullableNumber,
      })
      .passthrough()
      .nullish(),
    hourly: z
      .object({
        time: stringArray,
        temperature_2m: numberArray,
        precipitation_probability: numberArray,
        weather_code: numberArray,
        uv_index: numberArray,
        precipitation: numberArray,
        rain: numberArray,
        showers: numberArray,
        snowfall: numberArray,
        wind_speed_10m: numberArray,
        wind_gusts_10m: numberArray,
        apparent_temperature: numberArray,
      })
      .passthrough()
      .nullish(),
    daily: z
      .object({
        time: stringArray,
        weather_code: numberArray,
        temperature_2m_max: numberArray,
        temperature_2m_min: numberArray,
        precipitation_probability_max: numberArray,
        sunrise: stringArray,
        sunset: stringArray,
        uv_index_max: numberArray,
        precipitation_sum: numberArray,
        snowfall_sum: numberArray,
        wind_gusts_10m_max: numberArray,
      })
      .passthrough()
      .nullish(),
    airQuality: AirQualityResponseSchema.nullish(),
  })
  .passthrough();

const MicroClimateResponseSchema = z
  .object({
    latitude: nullableNumber,
    longitude: nullableNumber,
    current: z
      .object({
        temperature_2m: nullableNumber,
        precipitation: nullableNumber,
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

const GeocodingResponseSchema = z.object({
  results: z
    .array(
      z
        .object({
          name: z.string(),
          latitude: z.number(),
          longitude: z.number(),
          admin1: z.string().optional(),
          country: z.string().optional(),
          country_code: z.string().optional(),
          timezone: z.string().optional(),
        })
        .passthrough(),
    )
    .nullish(),
}).passthrough();

export type WeatherPayload = z.infer<typeof WeatherResponseSchema>;
export type AirQualityPayload = z.infer<typeof AirQualityResponseSchema>;
export type MicroClimatePayload = z.infer<typeof MicroClimateResponseSchema>;

const microClimateCache = new Map<string, { fetchedAt: number; payload: MicroClimatePayload | null }>();
const MICRO_CLIMATE_CACHE_MS = 15 * 60 * 1000;

/*
 * Every external request is bounded by a timeout (DAYMARK-SEC-004); timeout
 * failures surface through the normal friendly error/fallback paths.
 */
const FETCH_TIMEOUT_MS = 10_000;

function requestSignal(): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
    ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
    : undefined;
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

async function getJson<T>(url: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { signal: signal ?? requestSignal() });
  } catch (error) {
    if (signal?.aborted) throw error; // caller cancelled (e.g. a newer search); let it propagate
    if (isTimeoutError(error)) {
      throw new Error('The weather service took too long to respond.');
    }
    throw error;
  }
  if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('Weather service sent a response we could not read.');
  }
  try {
    return schema.parse(data);
  } catch {
    throw new Error('Weather service sent data in an unexpected shape.');
  }
}

export async function fetchWeather(place: Place): Promise<WeatherPayload> {
  const weatherParams = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,cloud_cover,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,uv_index_clear_sky',
    hourly: 'temperature_2m,apparent_temperature,precipitation,rain,showers,snowfall,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,uv_index,uv_index_clear_sky',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset,uv_index_max,uv_index_clear_sky_max',
    forecast_days: '7',
    timezone: 'auto',
  });
  const airQualityParams = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'us_aqi,pm10,pm2_5,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide',
    hourly: 'us_aqi,pm10,pm2_5',
    forecast_days: '3',
    timezone: 'auto',
  });

  // Forecast and air quality are independent once coordinates are known, so
  // both requests start together. The forecast remains primary (its failure
  // fails the load); an air-quality failure degrades to the forecast alone,
  // exactly as the previous sequential implementation did. The catch on the
  // air-quality promise also prevents an unhandled rejection if the forecast
  // fails first.
  const weatherRequest = getJson(`${FORECAST_URL}?${weatherParams.toString()}`, WeatherResponseSchema);
  const airQualityRequest = getJson(`${AIR_QUALITY_URL}?${airQualityParams.toString()}`, AirQualityResponseSchema)
    .catch((): AirQualityPayload | null => null);
  const weather = await weatherRequest;
  const airQuality = await airQualityRequest;
  return airQuality == null ? weather : { ...weather, airQuality };
}

/*
 * The micro-climate comparison uses the UKV (ukmo_seamless) model, which only
 * covers the UK and the near continent. Outside that domain there is no
 * meaningful grid point to compare against, so the feature is hidden rather
 * than faked with regional data. Callers must gate on this helper.
 */
const UKV_BOUNDS = { minLatitude: 49.5, maxLatitude: 61.5, minLongitude: -10, maxLongitude: 3 };

export function isMicroClimateSupported(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return latitude >= UKV_BOUNDS.minLatitude && latitude <= UKV_BOUNDS.maxLatitude
    && longitude >= UKV_BOUNDS.minLongitude && longitude <= UKV_BOUNDS.maxLongitude;
}

export async function fetchMicroClimate(place: Place): Promise<MicroClimatePayload | null> {
  const cacheKey = `${place.latitude.toFixed(3)},${place.longitude.toFixed(3)}`;
  const cached = microClimateCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < MICRO_CLIMATE_CACHE_MS) return cached.payload;

  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,precipitation',
    forecast_days: '1',
    models: 'ukmo_seamless',
    timezone: 'auto',
  });
  let payload: MicroClimatePayload | null = null;
  try {
    payload = await getJson(`${FORECAST_URL}?${params.toString()}`, MicroClimateResponseSchema);
  } catch {
    payload = null;
  }
  microClimateCache.set(cacheKey, { fetchedAt: Date.now(), payload });
  return payload;
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<Place | undefined> {
  const reverseParams = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), count: '1', language: 'en', format: 'json' });
  const reverse = await getJson(`${GEOCODING_URL}?${reverseParams.toString()}`, GeocodingResponseSchema);
  const found = reverse.results?.[0];
  return found
    ? {
        name: found.name,
        latitude: found.latitude,
        longitude: found.longitude,
        admin1: found.admin1,
        country: found.country,
        countryCode: found.country_code,
        timezone: found.timezone,
      }
    : undefined;
}

/*
 * Forward geocoding for the location search. Uses the same Open-Meteo
 * geocoding endpoint as reverseGeocode; no other location provider exists.
 * `signal` lets the caller cancel a stale search so only the latest query wins.
 */
export async function searchPlaces(
  query: string,
  options: { count?: number; signal?: AbortSignal; language?: string } = {},
): Promise<Place[]> {
  const name = query.trim();
  if (name.length < 2) return [];
  const params = new URLSearchParams({
    name,
    count: String(options.count ?? 8),
    language: options.language ?? 'en',
    format: 'json',
  });
  const response = await getJson(`${GEOCODING_URL}?${params.toString()}`, GeocodingResponseSchema, options.signal);
  return (response.results ?? []).map((result) => ({
    name: result.name,
    latitude: result.latitude,
    longitude: result.longitude,
    admin1: result.admin1,
    country: result.country,
    countryCode: result.country_code,
    timezone: result.timezone,
  }));
}

export function weatherCopy(code = 0, locale: Locale = 'en'): string {
  if (code === 0) return translate(locale, 'condition.clear');
  if ([1, 2].includes(code)) return translate(locale, 'condition.mostlyClear');
  if (code === 3) return translate(locale, 'condition.overcast');
  if ([45, 48].includes(code)) return translate(locale, 'condition.misty');
  if ([51, 53, 55, 56, 57].includes(code)) return translate(locale, 'condition.drizzle');
  if ([61, 63, 65, 66, 67].includes(code)) return translate(locale, 'condition.rain');
  if ([71, 73, 75, 77].includes(code)) return translate(locale, 'condition.snow');
  if ([80, 81, 82].includes(code)) return translate(locale, 'condition.showers');
  if ([85, 86].includes(code)) return translate(locale, 'condition.snowShowers');
  if ([95, 96, 99].includes(code)) return translate(locale, 'condition.thunder');
  return translate(locale, 'condition.changeable');
}

export function weatherIcon(code = 0, isDay = true): LucideIcon {
  if (!isDay && code < 3) return Moon;
  if (code === 0) return Sun;
  if ([1, 2].includes(code)) return CloudSun;
  if (code === 3) return Cloud;
  if ([45, 48].includes(code)) return CloudFog;
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return CloudRain;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return Snowflake;
  if ([95, 96, 99].includes(code)) return CloudLightning;
  return Cloud;
}

export type WeatherAdvice = { answer: string; tone: 'yes' | 'no'; reason: string };

export function getUmbrellaAdvice(precipProbability: number | null | undefined, precipTimeWindow?: string, locale: Locale = 'en'): WeatherAdvice {
  if (precipProbability == null || Number.isNaN(precipProbability)) {
    return { answer: translate(locale, 'common.no'), tone: 'no', reason: translate(locale, 'advice.rainUnavailable') };
  }
  if (precipProbability >= 40) {
    return {
      answer: translate(locale, 'common.yes'),
      tone: 'yes',
      reason: precipTimeWindow
        ? translate(locale, 'advice.rainChanceTime', { percent: Math.round(precipProbability), time: precipTimeWindow })
        : translate(locale, 'advice.rainChance', { percent: Math.round(precipProbability) }),
    };
  }
  return {
    answer: translate(locale, 'common.no'),
    tone: 'no',
    reason: precipProbability > 0
      ? translate(locale, 'advice.rainChance', { percent: Math.round(precipProbability) })
      : translate(locale, 'advice.rainUnlikely'),
  };
}

export function getSunglassesAdvice(uvIndex: number | null | undefined, cloudCover: number | null | undefined, locale: Locale = 'en'): WeatherAdvice {
  const uv = uvIndex != null && !Number.isNaN(uvIndex) ? uvIndex : null;
  const cloud = cloudCover != null && !Number.isNaN(cloudCover) ? cloudCover : null;
  if (uv == null || cloud == null) {
    return { answer: translate(locale, 'common.no'), tone: 'no', reason: translate(locale, 'advice.brightnessUnavailable') };
  }
  if (uv >= 3 && cloud < 60) {
    return {
      answer: translate(locale, 'common.yes'),
      tone: 'yes',
      reason: translate(locale, 'advice.sunscreenYes', { uv: uvValue(uv) }),
    };
  }
  if (cloud >= 60) {
    return { answer: translate(locale, 'common.no'), tone: 'no', reason: translate(locale, 'advice.sunscreenOvercast') };
  }
  return {
    answer: translate(locale, 'common.no'),
    tone: 'no',
    reason: translate(locale, 'advice.sunscreenLow', { uv: uvValue(uv) }),
  };
}

export function displayTemp(value: number | null | undefined, unit: Unit): string {
  if (value == null || Number.isNaN(value)) return '—';
  const converted = unit === 'fahrenheit' ? (value * 9) / 5 + 32 : value;
  return `${Math.round(converted)}°`;
}

export function calculateDewPointCelsius(temperatureC: number | null | undefined, humidity: number | null | undefined): number | undefined {
  if (temperatureC == null || humidity == null || Number.isNaN(temperatureC) || Number.isNaN(humidity)) return undefined;
  const b = 17.62;
  const c = 243.12;
  const relativeHumidity = Math.min(100, Math.max(0.1, humidity));
  const gamma = (b * temperatureC) / (c + temperatureC) + Math.log(relativeHumidity / 100);
  return (c * gamma) / (b - gamma);
}

export function dewPointComfort(dewPointC: number | undefined, locale: Locale = 'en'): { label: string; className: string } {
  if (dewPointC === undefined || Number.isNaN(dewPointC)) return { label: translate(locale, 'details.dewUnavailable'), className: 'dew-unavailable' };
  if (dewPointC < 10) return { label: translate(locale, 'details.dewDry'), className: 'dew-dry' };
  if (dewPointC < 16) return { label: translate(locale, 'details.dewComfortable'), className: 'dew-comfortable' };
  if (dewPointC < 18) return { label: translate(locale, 'details.dewNoticeable'), className: 'dew-noticeable' };
  if (dewPointC < 21) return { label: translate(locale, 'details.dewHumid'), className: 'dew-humid' };
  return { label: translate(locale, 'details.dewOppressive'), className: 'dew-oppressive' };
}

export function displayWind(value: number | null | undefined, unit: Unit): string {
  if (value == null || Number.isNaN(value)) return '—';
  const converted = unit === 'fahrenheit' ? value * 0.621371 : value;
  return `${Math.round(converted)} ${unit === 'fahrenheit' ? 'mph' : 'km/h'}`;
}

export function distanceKm(latitude1: number, longitude1: number, latitude2: number, longitude2: number): number {
  const earthRadiusKm = 6371;
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(latitude2 - latitude1);
  const longitudeDelta = radians(longitude2 - longitude1);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(latitude1)) * Math.cos(radians(latitude2)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function signedDelta(value: number | null | undefined, unit: string, decimals = 1, locale: Locale = 'en'): string {
  if (value == null || Number.isNaN(value)) return '—';
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  return `${rounded > 0 ? '+' : ''}${formatDecimal(rounded, locale, decimals)}${unit}`;
}

/*
 * Time utilities for Open-Meteo data.
 *
 * With `timezone=auto`, Open-Meteo returns every timestamp as the location's
 * own wall-clock time without a UTC offset (e.g. "2026-09-11T15:00") and
 * reports the zone metadata separately (`timezone`, `timezone_abbreviation`,
 * `utc_offset_seconds`). These helpers treat those strings as wall-clock time
 * in the forecast location — never as the browser's timezone — by parsing the
 * components into a UTC-based "pseudo instant". Comparisons and formatting run
 * on those components, so a Tokyo forecast renders identically on a device in
 * London, New York or Tokyo. Original API strings are never mutated.
 */
const LOCATION_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

export type LocationClock = {
  timezone?: string | null;
  timezone_abbreviation?: string | null;
  utc_offset_seconds?: number | null;
};

function padLocationPart(value: number): string {
  return String(value).padStart(2, '0');
}

/* Wall-clock value in ms, treating the location's own clock as the timeline. */
export function locationTimeMs(value?: string | null): number | null {
  if (!value) return null;
  const match = LOCATION_TIMESTAMP.exec(value.trim());
  if (match) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
    return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function formatLocationParts(ms: number, options: Intl.DateTimeFormatOptions, locale?: string | string[]): string {
  return new Intl.DateTimeFormat(locale ?? undefined, { ...options, timeZone: 'UTC' }).format(new Date(ms));
}

export function formatLocationTime(value?: string | null, locale?: string | string[]): string {
  if (!value) return '—';
  const ms = locationTimeMs(value);
  if (ms == null) return value.length >= 16 ? value.slice(11, 16) : value;
  return formatLocationParts(ms, { hour: 'numeric' }, locale);
}

export function formatLocationDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  locale?: string | string[],
): string | null {
  const ms = locationTimeMs(value);
  return ms == null ? null : formatLocationParts(ms, options, locale);
}

export function getLocationLocalDate(value?: string | null): string | null {
  const ms = locationTimeMs(value);
  if (ms == null) return null;
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${padLocationPart(date.getUTCMonth() + 1)}-${padLocationPart(date.getUTCDate())}`;
}

export function getLocationLocalHour(value?: string | null): number | null {
  const ms = locationTimeMs(value);
  return ms == null ? null : new Date(ms).getUTCHours();
}

export function isSameLocationDay(a?: string | null, b?: string | null): boolean {
  const dateA = getLocationLocalDate(a);
  return dateA != null && dateA === getLocationLocalDate(b);
}

export function compareLocationTimes(a?: string | null, b?: string | null): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const msA = locationTimeMs(a);
  const msB = locationTimeMs(b);
  if (msA == null || msB == null) return a.localeCompare(b);
  return msA === msB ? 0 : msA < msB ? -1 : 1;
}

/* Wall-clock arithmetic in the location's clock (DST gaps are treated linearly). */
export function addLocationHours(value: string, hours: number): string {
  const ms = locationTimeMs(value);
  if (ms == null) return value;
  const date = new Date(ms + hours * 3_600_000);
  return `${date.getUTCFullYear()}-${padLocationPart(date.getUTCMonth() + 1)}-${padLocationPart(date.getUTCDate())}T${padLocationPart(date.getUTCHours())}:${padLocationPart(date.getUTCMinutes())}`;
}

/*
 * Current wall-clock time at the forecast location. Prefers the API's own
 * `current.time`; otherwise derives it from the IANA zone and only then from
 * `utc_offset_seconds`. Returns null when there is nothing trustworthy to use.
 */
export function getCurrentLocationTime(
  currentTime: string | null | undefined,
  location?: LocationClock | null,
  now: number = Date.now(),
): string | null {
  if (currentTime && locationTimeMs(currentTime) != null) return currentTime;
  const timezone = location?.timezone;
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date(now));
      const pick = (type: string) => parts.find((part) => part.type === type)?.value;
      const year = pick('year');
      const month = pick('month');
      const day = pick('day');
      const hour = pick('hour') === '24' ? '00' : pick('hour');
      const minute = pick('minute');
      if (year && month && day && hour && minute) return `${year}-${month}-${day}T${hour}:${minute}`;
    } catch {
      // Unknown IANA zone: fall through to the numeric offset.
    }
  }
  const offset = location?.utc_offset_seconds;
  if (typeof offset === 'number') {
    const shifted = new Date(now + offset * 1000);
    return `${shifted.getUTCFullYear()}-${padLocationPart(shifted.getUTCMonth() + 1)}-${padLocationPart(shifted.getUTCDate())}T${padLocationPart(shifted.getUTCHours())}:${padLocationPart(shifted.getUTCMinutes())}`;
  }
  return null;
}

export function shortDay(value?: string | null, index = 0, locale: Locale = 'en'): string {
  if (index === 0) return translate(locale, 'common.today');
  if (index === 1) return translate(locale, 'common.tomorrow');
  return formatLocationDate(value, { weekday: 'short' }, locale) ?? '—';
}

export function dateLabel(value?: string | null, locale: Locale = 'en'): string {
  return formatLocationDate(value, { month: 'short', day: 'numeric' }, locale) ?? '—';
}

export function timeLabel(value?: string | null, locale: Locale = 'en'): string {
  return formatLocationTime(value, locale);
}

export type UvLevel = {
  label: string;
  guidance: string;
  className: string;
};

export function uvLevel(value: number | null | undefined, locale: Locale = 'en'): UvLevel {
  if (value == null || Number.isNaN(value)) {
    return { label: translate(locale, 'uv.level.unavailable'), guidance: translate(locale, 'uv.guidance.unavailable'), className: 'uv-unavailable' };
  }
  if (value < 3) {
    return { label: translate(locale, 'uv.level.low'), guidance: translate(locale, 'uv.guidance.low'), className: 'uv-low' };
  }
  if (value < 6) {
    return { label: translate(locale, 'uv.level.moderate'), guidance: translate(locale, 'uv.guidance.moderate'), className: 'uv-moderate' };
  }
  if (value < 8) {
    return { label: translate(locale, 'uv.level.high'), guidance: translate(locale, 'uv.guidance.high'), className: 'uv-high' };
  }
  if (value < 11) {
    return { label: translate(locale, 'uv.level.veryHigh'), guidance: translate(locale, 'uv.guidance.veryHigh'), className: 'uv-very-high' };
  }
  return { label: translate(locale, 'uv.level.extreme'), guidance: translate(locale, 'uv.guidance.extreme'), className: 'uv-extreme' };
}

export function uvValue(value: number | null | undefined, locale: Locale = 'en'): string {
  if (value == null || Number.isNaN(value)) return '—';
  return Number.isInteger(value) ? String(value) : formatDecimal(value, locale, 1);
}

export function uvColor(value: number | null | undefined): string {
  const level = uvLevel(value);
  if (level.className === 'uv-unavailable') return '#9aaab3';
  if (level.className === 'uv-low') return '#3fb98a';
  if (level.className === 'uv-moderate') return '#e8b93f';
  if (level.className === 'uv-high') return '#e8763f';
  return '#d9483f';
}

/*
 * Sun protection window: the continuous period today during which the hourly
 * UV index is forecast to reach the protection threshold (UV >= 3, the start
 * of the "Moderate" band). Runs are read from the location's own local-time
 * hourly forecast; a missing value breaks a run rather than being guessed at,
 * and when several separate runs exist the one with the highest peak wins
 * (earliest start breaks ties).
 *
 * `end` is exclusive: the hour after the run, or one hour past the last
 * reading when the run reaches the end of the available forecast.
 * "Today", the run order and the times are all in the weather location's
 * wall clock, never the device timezone.
 */
export const SUN_PROTECTION_UV_THRESHOLD = 3;

export type SunProtectionWindow = {
  start: string;
  end: string;
  peak: number;
};

export type SunProtection =
  | { status: 'window'; window: SunProtectionWindow }
  | { status: 'none' }
  | { status: 'unavailable' };

export function getSunProtectionWindow(
  times: ReadonlyArray<string | null | undefined> | null | undefined,
  uvValues: ReadonlyArray<number | null | undefined> | null | undefined,
  referenceTime?: string | null,
): SunProtection {
  if (!times?.length || !uvValues?.length) return { status: 'unavailable' };
  const today = getLocationLocalDate(referenceTime ?? times[0]);
  if (!today) return { status: 'unavailable' };

  const readings: { time: string; value: number | null }[] = [];
  for (let index = 0; index < times.length; index += 1) {
    const time = times[index];
    if (!time || !time.startsWith(today)) continue;
    const raw = uvValues[index];
    readings.push({ time, value: raw == null || Number.isNaN(raw) ? null : raw });
  }
  if (!readings.length) return { status: 'unavailable' };

  let best: { start: number; end: number; peak: number } | null = null;
  let runStart = -1;
  let runPeak = 0;
  for (let index = 0; index <= readings.length; index += 1) {
    const value = index < readings.length ? readings[index].value : null;
    if (value != null && value >= SUN_PROTECTION_UV_THRESHOLD) {
      if (runStart === -1) {
        runStart = index;
        runPeak = value;
      } else {
        runPeak = Math.max(runPeak, value);
      }
      continue;
    }
    if (runStart !== -1) {
      if (!best || runPeak > best.peak) best = { start: runStart, end: index - 1, peak: runPeak };
      runStart = -1;
      runPeak = 0;
    }
  }

  if (!best) {
    return readings.some((reading) => reading.value != null)
      ? { status: 'none' }
      : { status: 'unavailable' };
  }

  const nextReading = readings[best.end + 1];
  return {
    status: 'window',
    window: {
      start: readings[best.start].time,
      end: nextReading ? nextReading.time : addLocationHours(readings[best.end].time, 1),
      peak: best.peak,
    },
  };
}

export type AirLevel = {
  label: string;
  guidance: string;
  className: string;
};

export function airLevel(value: number | null | undefined, locale: Locale = 'en'): AirLevel {
  if (value == null || Number.isNaN(value)) {
    return { label: translate(locale, 'air.level.unavailable'), guidance: translate(locale, 'air.guidance.unavailable'), className: 'air-unavailable' };
  }
  if (value <= 50) {
    return { label: translate(locale, 'air.level.good'), guidance: translate(locale, 'air.guidance.good'), className: 'air-good' };
  }
  if (value <= 100) {
    return { label: translate(locale, 'air.level.moderate'), guidance: translate(locale, 'air.guidance.moderate'), className: 'air-moderate' };
  }
  if (value <= 150) {
    return { label: translate(locale, 'air.level.sensitive'), guidance: translate(locale, 'air.guidance.sensitive'), className: 'air-sensitive' };
  }
  if (value <= 200) {
    return { label: translate(locale, 'air.level.unhealthy'), guidance: translate(locale, 'air.guidance.unhealthy'), className: 'air-unhealthy' };
  }
  if (value <= 300) {
    return { label: translate(locale, 'air.level.veryUnhealthy'), guidance: translate(locale, 'air.guidance.veryUnhealthy'), className: 'air-very-unhealthy' };
  }
  return { label: translate(locale, 'air.level.hazardous'), guidance: translate(locale, 'air.guidance.hazardous'), className: 'air-hazardous' };
}

export function pollutionValue(value: number | null | undefined, locale: Locale = 'en'): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value < 10 ? formatDecimal(value, locale, 1) : formatDecimal(Math.round(value), locale, 0);
}

export function airColor(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '#9aaab3';
  if (value <= 50) return '#3fb98a';
  if (value <= 100) return '#e8b93f';
  if (value <= 150) return '#e8763f';
  if (value <= 200) return '#d9483f';
  if (value <= 300) return '#8e4fd9';
  return '#7a1f1f';
}

export function airContext(value: number | null | undefined, locale: Locale = 'en'): string {
  if (value == null || Number.isNaN(value)) return translate(locale, 'air.guidance.unavailable');
  if (value <= 50) return translate(locale, 'air.context.good');
  if (value <= 100) return translate(locale, 'air.context.moderate');
  if (value <= 150) return translate(locale, 'air.context.sensitive');
  if (value <= 200) return translate(locale, 'air.context.unhealthy');
  if (value <= 300) return translate(locale, 'air.context.veryUnhealthy');
  return translate(locale, 'air.context.hazardous');
}
