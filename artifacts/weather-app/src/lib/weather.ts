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

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

export type Unit = 'celsius' | 'fahrenheit';
export type Place = { name: string; country?: string; admin1?: string; latitude: number; longitude: number };
export type WeatherPayload = {
  latitude?: number;
  longitude?: number;
  timezone?: string;
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    is_day?: number;
    precipitation?: number;
    rain?: number;
    cloud_cover?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    uv_index?: number;
    uv_index_clear_sky?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    precipitation_probability?: number[];
    weather_code?: number[];
    wind_speed_10m?: number[];
    uv_index?: number[];
    uv_index_clear_sky?: number[];
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    wind_speed_10m_max?: number[];
    sunrise?: string[];
    sunset?: string[];
    uv_index_max?: number[];
    uv_index_clear_sky_max?: number[];
  };
  airQuality?: AirQualityPayload;
};
type GeocodingPayload = { results?: Place[] };
type MicroClimatePayload = {
  latitude?: number;
  longitude?: number;
  current?: {
    temperature_2m?: number;
    precipitation?: number;
  };
};
export type AirQualityPayload = {
  current?: {
    time?: string;
    us_aqi?: number;
    pm10?: number;
    pm2_5?: number;
    nitrogen_dioxide?: number;
    ozone?: number;
    sulphur_dioxide?: number;
    carbon_monoxide?: number;
  };
  hourly?: {
    time?: string[];
    us_aqi?: number[];
    pm10?: number[];
    pm2_5?: number[];
  };
};

const microClimateCache = new Map<string, { fetchedAt: number; payload: MicroClimatePayload | null }>();
const MICRO_CLIMATE_CACHE_MS = 15 * 60 * 1000;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
  return response.json() as Promise<T>;
}

export async function fetchWeather(place: Place): Promise<WeatherPayload> {
  const weatherParams = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,cloud_cover,weather_code,wind_speed_10m,wind_direction_10m,uv_index,uv_index_clear_sky',
    hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m,uv_index,uv_index_clear_sky',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset,uv_index_max,uv_index_clear_sky_max',
    forecast_days: '7',
    timezone: 'auto',
  });
  const weather = await getJson<WeatherPayload>(`${FORECAST_URL}?${weatherParams.toString()}`);
  const airQualityParams = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'us_aqi,pm10,pm2_5,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide',
    hourly: 'us_aqi,pm10,pm2_5',
    forecast_days: '3',
    timezone: 'auto',
  });
  try {
    const airQuality = await getJson<AirQualityPayload>(`https://air-quality-api.open-meteo.com/v1/air-quality?${airQualityParams.toString()}`);
    return { ...weather, airQuality };
  } catch {
    return weather;
  }
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
    payload = await getJson<MicroClimatePayload>(`${FORECAST_URL}?${params.toString()}`);
  } catch {
    payload = null;
  }
  microClimateCache.set(cacheKey, { fetchedAt: Date.now(), payload });
  return payload;
}

export { type GeocodingPayload, type MicroClimatePayload };

export async function reverseGeocode(latitude: number, longitude: number): Promise<Place | undefined> {
  const reverseParams = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), count: '1', language: 'en', format: 'json' });
  const reverse = await getJson<GeocodingPayload>(`${GEOCODING_URL}?${reverseParams.toString()}`);
  return reverse.results?.[0];
}

export function weatherCopy(code = 0): string {
  if (code === 0) return 'Clear sky';
  if ([1, 2].includes(code)) return 'Mostly clear';
  if (code === 3) return 'Overcast';
  if ([45, 48].includes(code)) return 'Misty';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Light drizzle';
  if ([61, 63, 65, 66, 67].includes(code)) return 'Rain';
  if ([71, 73, 75, 77].includes(code)) return 'Snow';
  if ([80, 81, 82].includes(code)) return 'Rain showers';
  if ([85, 86].includes(code)) return 'Snow showers';
  if ([95, 96, 99].includes(code)) return 'Thunderstorms';
  return 'Changeable';
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

export type WeatherAdvice = { answer: 'Yes' | 'No'; reason: string };

export function getUmbrellaAdvice(precipProbability: number | undefined, precipTimeWindow?: string): WeatherAdvice {
  if (precipProbability === undefined || Number.isNaN(precipProbability)) {
    return { answer: 'No', reason: 'Rain forecast unavailable' };
  }
  if (precipProbability >= 40) {
    return {
      answer: 'Yes',
      reason: precipTimeWindow ? `${Math.round(precipProbability)}% chance around ${precipTimeWindow}` : `${Math.round(precipProbability)}% chance of rain`,
    };
  }
  return {
    answer: 'No',
    reason: precipProbability > 0 ? `${Math.round(precipProbability)}% chance of rain` : 'Rain unlikely today',
  };
}

export function getSunglassesAdvice(uvIndex: number | undefined, cloudCover: number | undefined): WeatherAdvice {
  const hasUv = uvIndex !== undefined && !Number.isNaN(uvIndex);
  const hasCloud = cloudCover !== undefined && !Number.isNaN(cloudCover);
  if (!hasUv || !hasCloud) {
    return { answer: 'No', reason: 'Brightness forecast unavailable' };
  }
  if (uvIndex >= 3 && cloudCover < 60) {
    return { answer: 'Yes', reason: `UV index ${uvValue(uvIndex)}, mostly clear` };
  }
  if (cloudCover >= 60) {
    return { answer: 'No', reason: 'Overcast, low brightness' };
  }
  return { answer: 'No', reason: `UV index ${uvValue(uvIndex)}, low today` };
}

export function displayTemp(value: number | undefined, unit: Unit): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  const converted = unit === 'fahrenheit' ? (value * 9) / 5 + 32 : value;
  return `${Math.round(converted)}°`;
}

export function calculateDewPointCelsius(temperatureC: number | undefined, humidity: number | undefined): number | undefined {
  if (temperatureC === undefined || humidity === undefined || Number.isNaN(temperatureC) || Number.isNaN(humidity)) return undefined;
  const b = 17.62;
  const c = 243.12;
  const relativeHumidity = Math.min(100, Math.max(0.1, humidity));
  const gamma = (b * temperatureC) / (c + temperatureC) + Math.log(relativeHumidity / 100);
  return (c * gamma) / (b - gamma);
}

export function dewPointComfort(dewPointC: number | undefined): { label: string; className: string } {
  if (dewPointC === undefined || Number.isNaN(dewPointC)) return { label: 'Unavailable', className: 'dew-unavailable' };
  if (dewPointC < 10) return { label: 'Dry', className: 'dew-dry' };
  if (dewPointC < 16) return { label: 'Comfortable', className: 'dew-comfortable' };
  if (dewPointC < 18) return { label: 'Noticeable', className: 'dew-noticeable' };
  if (dewPointC < 21) return { label: 'Humid', className: 'dew-humid' };
  return { label: 'Oppressive', className: 'dew-oppressive' };
}

export function displayWind(value: number | undefined, unit: Unit): string {
  if (value === undefined || Number.isNaN(value)) return '—';
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

export function signedDelta(value: number | undefined, unit: string, decimals = 1): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(decimals)}${unit}`;
}

export function localDate(value?: string): Date | null {
  if (!value) return null;
  const datePart = value.slice(0, 10);
  const date = new Date(`${datePart}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function shortDay(value?: string, index = 0): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  const date = localDate(value);
  return date ? date.toLocaleDateString([], { weekday: 'short' }) : 'Day';
}

export function dateLabel(value?: string): string {
  const date = localDate(value);
  return date ? date.toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—';
}

export function timeLabel(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(11, 16) : date.toLocaleTimeString([], { hour: 'numeric' });
}

export function compass(degrees?: number): string {
  if (degrees === undefined || Number.isNaN(degrees)) return '—';
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8];
}

export type UvLevel = {
  label: string;
  guidance: string;
  className: string;
};

export function uvLevel(value: number | undefined): UvLevel {
  if (value === undefined || Number.isNaN(value)) {
    return { label: 'Unavailable', guidance: 'UV detail is unavailable right now.', className: 'uv-unavailable' };
  }
  if (value < 3) {
    return { label: 'Low', guidance: 'Enjoy the daylight. Protection is usually not needed.', className: 'uv-low' };
  }
  if (value < 6) {
    return { label: 'Moderate', guidance: 'Consider shade, a hat, and sunscreen around midday.', className: 'uv-moderate' };
  }
  if (value < 8) {
    return { label: 'High', guidance: 'Protection is essential. Seek shade and cover up.', className: 'uv-high' };
  }
  if (value < 11) {
    return { label: 'Very high', guidance: 'Avoid midday sun where possible and protect exposed skin.', className: 'uv-very-high' };
  }
  return { label: 'Extreme', guidance: 'Avoid being outside in direct sun. Protection is essential.', className: 'uv-extreme' };
}

export function uvValue(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function uvColor(value: number | undefined): string {
  const level = uvLevel(value);
  if (level.className === 'uv-unavailable') return '#9aaab3';
  if (level.className === 'uv-low') return '#3fb98a';
  if (level.className === 'uv-moderate') return '#e8b93f';
  if (level.className === 'uv-high') return '#e8763f';
  return '#d9483f';
}

export type AirLevel = {
  label: string;
  guidance: string;
  className: string;
};

export function airLevel(value: number | undefined): AirLevel {
  if (value === undefined || Number.isNaN(value)) {
    return { label: 'Unavailable', guidance: 'Air-quality detail is unavailable right now.', className: 'air-unavailable' };
  }
  if (value <= 50) {
    return { label: 'Good', guidance: 'Air quality is considered satisfactory for most people.', className: 'air-good' };
  }
  if (value <= 100) {
    return { label: 'Moderate', guidance: 'Sensitive people may want to keep an eye on symptoms.', className: 'air-moderate' };
  }
  if (value <= 150) {
    return { label: 'Sensitive groups', guidance: 'Sensitive groups should consider reducing prolonged outdoor exertion.', className: 'air-sensitive' };
  }
  if (value <= 200) {
    return { label: 'Unhealthy', guidance: 'Consider shorter outdoor activity, especially if you are sensitive to pollution.', className: 'air-unhealthy' };
  }
  if (value <= 300) {
    return { label: 'Very unhealthy', guidance: 'Reduce outdoor activity and keep an eye on local health guidance.', className: 'air-very-unhealthy' };
  }
  return { label: 'Hazardous', guidance: 'Avoid outdoor activity where possible and follow local health guidance.', className: 'air-hazardous' };
}

export function pollutionValue(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return value < 10 ? value.toFixed(1) : Math.round(value).toString();
}

export function airColor(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '#9aaab3';
  if (value <= 50) return '#3fb98a';
  if (value <= 100) return '#e8b93f';
  if (value <= 150) return '#e8763f';
  if (value <= 200) return '#d9483f';
  if (value <= 300) return '#8e4fd9';
  return '#7a1f1f';
}

export function airContext(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return 'Air-quality context is unavailable right now.';
  if (value <= 50) return 'Roughly equivalent to a normal day with light traffic nearby — no meaningful health risk today.';
  if (value <= 100) return 'A typical moderate day — most people can continue normal outdoor activities.';
  if (value <= 150) return 'Sensitive people may notice symptoms during longer periods of outdoor exertion.';
  if (value <= 200) return 'Outdoor activity may feel uncomfortable; consider shorter exposure and cleaner indoor air.';
  if (value <= 300) return 'Pollution is high enough that everyone should reduce prolonged outdoor exertion.';
  return 'Conditions are hazardous; avoid outdoor exposure and follow local health guidance.';
}

export function pollutantMeterColor(value: number | undefined, threshold: number): string {
  if (value === undefined || Number.isNaN(value)) return '#9aaab3';
  const ratio = value / threshold;
  if (ratio <= .7) return '#3fb98a';
  if (ratio <= 1) return '#e8b93f';
  return '#e8763f';
}
