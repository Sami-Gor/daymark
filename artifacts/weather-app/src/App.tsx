import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Droplets,
  Glasses,
  Gauge,
  Info,
  LocateFixed,
  Moon,
  Navigation,
  Snowflake,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Umbrella,
  type LucideIcon,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const LONDON = { name: 'London', admin1: 'England', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278 };
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

type Unit = 'celsius' | 'fahrenheit';
type Place = { name: string; country?: string; admin1?: string; latitude: number; longitude: number };
type WeatherPayload = {
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
type AirQualityPayload = {
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

async function fetchWeather(place: Place): Promise<WeatherPayload> {
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

async function fetchMicroClimate(place: Place): Promise<MicroClimatePayload | null> {
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

function weatherCopy(code = 0): string {
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

function weatherIcon(code = 0, isDay = true): LucideIcon {
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

type WeatherAdvice = { answer: 'Yes' | 'No'; reason: string };

function getUmbrellaAdvice(precipProbability: number | undefined, precipTimeWindow?: string): WeatherAdvice {
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

function getSunglassesAdvice(uvIndex: number | undefined, cloudCover: number | undefined): WeatherAdvice {
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

function displayTemp(value: number | undefined, unit: Unit): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  const converted = unit === 'fahrenheit' ? (value * 9) / 5 + 32 : value;
  return `${Math.round(converted)}°`;
}

function calculateDewPointCelsius(temperatureC: number | undefined, humidity: number | undefined): number | undefined {
  if (temperatureC === undefined || humidity === undefined || Number.isNaN(temperatureC) || Number.isNaN(humidity)) return undefined;
  const b = 17.62;
  const c = 243.12;
  const relativeHumidity = Math.min(100, Math.max(0.1, humidity));
  const gamma = (b * temperatureC) / (c + temperatureC) + Math.log(relativeHumidity / 100);
  return (c * gamma) / (b - gamma);
}

function dewPointComfort(dewPointC: number | undefined): { label: string; className: string } {
  if (dewPointC === undefined || Number.isNaN(dewPointC)) return { label: 'Unavailable', className: 'dew-unavailable' };
  if (dewPointC < 10) return { label: 'Dry', className: 'dew-dry' };
  if (dewPointC < 16) return { label: 'Comfortable', className: 'dew-comfortable' };
  if (dewPointC < 18) return { label: 'Noticeable', className: 'dew-noticeable' };
  if (dewPointC < 21) return { label: 'Humid', className: 'dew-humid' };
  return { label: 'Oppressive', className: 'dew-oppressive' };
}

function displayWind(value: number | undefined, unit: Unit): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  const converted = unit === 'fahrenheit' ? value * 0.621371 : value;
  return `${Math.round(converted)} ${unit === 'fahrenheit' ? 'mph' : 'km/h'}`;
}

function distanceKm(latitude1: number, longitude1: number, latitude2: number, longitude2: number): number {
  const earthRadiusKm = 6371;
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(latitude2 - latitude1);
  const longitudeDelta = radians(longitude2 - longitude1);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(latitude1)) * Math.cos(radians(latitude2)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function signedDelta(value: number | undefined, unit: string, decimals = 1): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(decimals)}${unit}`;
}

function localDate(value?: string): Date | null {
  if (!value) return null;
  const datePart = value.slice(0, 10);
  const date = new Date(`${datePart}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shortDay(value?: string, index = 0): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  const date = localDate(value);
  return date ? date.toLocaleDateString([], { weekday: 'short' }) : 'Day';
}

function dateLabel(value?: string): string {
  const date = localDate(value);
  return date ? date.toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—';
}

function timeLabel(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(11, 16) : date.toLocaleTimeString([], { hour: 'numeric' });
}

function compass(degrees?: number): string {
  if (degrees === undefined || Number.isNaN(degrees)) return '—';
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8];
}

type UvLevel = {
  label: string;
  guidance: string;
  className: string;
};

function uvLevel(value: number | undefined): UvLevel {
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

function uvValue(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function uvColor(value: number | undefined): string {
  const level = uvLevel(value);
  if (level.className === 'uv-unavailable') return '#9aaab3';
  if (level.className === 'uv-low') return '#3fb98a';
  if (level.className === 'uv-moderate') return '#e8b93f';
  if (level.className === 'uv-high') return '#e8763f';
  return '#d9483f';
}

function LoadingState() {
  return (
    <main aria-label="Loading weather" className="loading-layout">
      <div className="skeleton" style={{ width: 115, height: 13 }} />
      <div className="skeleton" style={{ width: 'min(70vw, 620px)', height: 90, marginTop: 24 }} />
      <div className="skeleton" style={{ width: 155, height: 14, marginTop: 14 }} />
      <div className="skeleton" style={{ width: 240, height: 104, marginTop: 44 }} />
      <div className="loading-panels">
        <div className="skeleton" style={{ height: 170 }} />
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    </main>
  );
}

function WeatherError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-panel" role="alert" data-testid="status-weather-error">
      <AlertTriangle size={25} strokeWidth={1.7} />
      <h2>That forecast went cloudy.</h2>
      <p>{message} Check your connection and give the sky another look.</p>
      <button className="retry-button" onClick={onRetry} data-testid="button-retry-weather">Try again</button>
    </div>
  );
}

function HourlyOutlook({ weather, unit }: { weather: WeatherPayload; unit: Unit }) {
  const hourly = weather.hourly ?? {};
  const times = hourly.time ?? [];
  const currentTime = weather.current?.time ? Date.parse(weather.current.time) : Date.now();
  const start = Math.max(0, times.findIndex((time) => Date.parse(time) >= currentTime));
  const indexes = Array.from({ length: Math.min(12, times.length - start) }, (_, index) => start + index);
  return (
    <section aria-labelledby="hourly-title">
      <div className="section-heading">
        <h2 className="section-title" id="hourly-title">The next few hours</h2>
        <span className="section-meta">hour by hour</span>
      </div>
      <div className="panel hourly-scroll" data-testid="list-hourly-forecast">
        {indexes.length ? indexes.map((index, itemIndex) => {
          const code = hourly.weather_code?.[index] ?? 0;
          const Icon = weatherIcon(code, true);
          return (
            <div className={`hour-card${itemIndex === 0 ? ' active' : ''}`} key={`${times[index]}-${index}`} data-testid={`card-hour-${index}`}>
              <span className="hour-time">{itemIndex === 0 ? 'Now' : timeLabel(times[index])}</span>
              <Icon size={21} className="condition-icon" strokeWidth={1.7} />
              <span className="hour-temp">{displayTemp(hourly.temperature_2m?.[index], unit)}</span>
              <span className="hour-rain"><Droplets size={10} />{hourly.precipitation_probability?.[index] ?? 0}%</span>
            </div>
          );
        }) : <p style={{ padding: 22, color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>Hourly detail is unavailable right now.</p>}
      </div>
    </section>
  );
}

function DailyForecast({ weather, unit }: { weather: WeatherPayload; unit: Unit }) {
  const daily = weather.daily ?? {};
  const days = daily.time ?? [];
  return (
    <section aria-labelledby="daily-title">
      <div className="section-heading">
        <h2 className="section-title" id="daily-title">A look ahead</h2>
        <span className="section-meta">3 days</span>
      </div>
      <div className="panel forecast-panel" data-testid="list-daily-forecast">
        {days.length ? days.slice(0, 3).map((day, index) => {
          const Icon = weatherIcon(daily.weather_code?.[index] ?? 0, true);
          return (
            <div className="day-row" key={day} data-testid={`row-forecast-${index}`}>
              <div className="day-name">{shortDay(day, index)}<span className="day-date">{dateLabel(day)}</span></div>
              <Icon className="day-icon" size={21} strokeWidth={1.7} />
              <div className="temps"><span className="high">{displayTemp(daily.temperature_2m_max?.[index], unit)}</span><span className="low">{displayTemp(daily.temperature_2m_min?.[index], unit)}</span></div>
              <div className="rain-chance">{daily.precipitation_probability_max?.[index] ?? 0}% rain</div>
            </div>
          );
        }) : <p style={{ padding: 22, color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>The extended outlook is unavailable right now.</p>}
      </div>
    </section>
  );
}

function UVForecast({ weather }: { weather: WeatherPayload }) {
  const current = weather.current ?? {};
  const hourly = weather.hourly ?? {};
  const daily = weather.daily ?? {};
  const hourlyTimes = hourly.time ?? [];
  const currentTime = current.time ? Date.parse(current.time) : Date.now();
  const firstDaylightIndex = hourlyTimes.findIndex((time, index) => (
    Date.parse(time) >= currentTime && (hourly.uv_index?.[index] ?? 0) > 0
  ));
  const fallbackStart = Math.max(0, hourlyTimes.findIndex((time) => Date.parse(time) >= currentTime));
  const daylightStart = firstDaylightIndex >= 0 ? firstDaylightIndex : fallbackStart;
  const hourIndexes = Array.from(
    { length: Math.min(10, Math.max(0, hourlyTimes.length - daylightStart)) },
    (_, index) => daylightStart + index,
  );
  const currentUv = current.uv_index;
  const currentLevel = uvLevel(currentUv);
  const peakUv = daily.uv_index_max?.[0];
  const peakLevel = uvLevel(peakUv);
  const peakHour = hourlyTimes.reduce<{ value: number; time?: string } | null>((best, time, index) => {
    const value = hourly.uv_index?.[index];
    if (Date.parse(time) < currentTime || value === undefined || (best && value <= best.value)) return best;
    return { value, time };
  }, null);

  return (
    <section className="uv-wide" aria-labelledby="uv-title">
      <div className="section-heading">
        <h2 className="section-title" id="uv-title">Sun on your skin</h2>
        <span className="section-meta">UV forecast</span>
      </div>
      <div className="panel uv-panel" data-testid="panel-uv-forecast">
        <div className="uv-compact-summary">
          <div className="uv-score-block" aria-label={`Current UV index ${uvValue(currentUv)}`}>
            <span className="uv-kicker">Current UV index</span>
            <div className="uv-score-line">
              <strong className={currentLevel.className} data-testid="text-current-uv">{uvValue(currentUv)}</strong>
              <div className={`uv-badge ${currentLevel.className}`}>{currentLevel.label}</div>
            </div>
          </div>
          <div className="uv-summary-copy">
            <p>{currentLevel.guidance}</p>
            <small>Protection advice updates with the daylight.</small>
          </div>
          <div className="uv-peak">
            <span>Today’s peak</span>
            <strong>{uvValue(peakUv)} <em>{peakLevel.label}</em></strong>
            {peakHour?.time && <small>around {timeLabel(peakHour.time)}</small>}
          </div>
          <div className="uv-range" aria-label="UV index protection range from 0 to 11 plus">
            <div className="uv-range-heading"><span>Protection range</span><span>0—11+</span></div>
            <div className="uv-scale">
              <div className="uv-scale-segment uv-scale-low" />
              <div className="uv-scale-segment uv-scale-moderate" />
              <div className="uv-scale-segment uv-scale-high" />
              <div className="uv-scale-segment uv-scale-extreme" />
              <i className="uv-scale-marker" style={{ left: `${Math.min(100, Math.max(0, ((currentUv ?? 0) / 11) * 100))}%`, background: uvColor(currentUv) }} />
            </div>
            <div className="uv-range-labels"><span>Low</span><span>Moderate</span><span>High</span><span>Very high+</span></div>
          </div>
        </div>

        <div className="uv-timeline-wrap">
          <div className="uv-subheading"><span>Today by hour</span><span>index</span></div>
          {hourIndexes.length ? (
            <div className="uv-hour-strip" data-testid="list-hourly-uv" aria-label="Hourly UV index forecast">
              {hourIndexes.map((index, itemIndex) => {
                const value = hourly.uv_index?.[index];
                return (
                  <div className={`uv-hour${itemIndex === 0 ? ' uv-hour-current' : ''}`} key={`${hourlyTimes[index]}-${index}`} data-testid={`uv-hour-${index}`}>
                    <span>{itemIndex === 0 ? 'Now' : timeLabel(hourlyTimes[index])}</span>
                    <strong style={{ color: uvColor(value) }}>{uvValue(value)}</strong>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="uv-empty">Hourly UV detail is unavailable right now.</p>
          )}
        </div>

        <div className="uv-days-wrap">
          <div className="uv-subheading"><span>7-day outlook</span><span>peak index</span></div>
          <div className="uv-days" data-testid="list-daily-uv">
            {(daily.time ?? []).slice(0, 7).map((day, index) => {
              const value = daily.uv_index_max?.[index];
              const level = uvLevel(value);
              return (
                <div className="uv-day" key={day} data-testid={`row-uv-${index}`}>
                  <span className="uv-day-name">{shortDay(day, index)}</span>
                  <span className={`uv-day-score ${level.className}`}>{uvValue(value)}</span>
                  <div className="uv-day-meter">
                    <div className={`uv-day-fill ${level.className}`} style={{ height: `${Math.max(4, Math.min(100, ((value ?? 0) / 11) * 100))}%` }} />
                  </div>
                  <span className="uv-day-level">{level.label}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="uv-legend">
          <span><i className="legend-low" />Low</span>
          <span><i className="legend-moderate" />Moderate</span>
          <span><i className="legend-high" />High</span>
          <span><i className="legend-extreme" />Very high+</span>
        </div>
      </div>
    </section>
  );
}

type AirLevel = {
  label: string;
  guidance: string;
  className: string;
};

function airLevel(value: number | undefined): AirLevel {
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

function pollutionValue(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return value < 10 ? value.toFixed(1) : Math.round(value).toString();
}

function airColor(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '#9aaab3';
  if (value <= 50) return '#3fb98a';
  if (value <= 100) return '#e8b93f';
  if (value <= 150) return '#e8763f';
  if (value <= 200) return '#d9483f';
  if (value <= 300) return '#8e4fd9';
  return '#7a1f1f';
}

function airContext(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return 'Air-quality context is unavailable right now.';
  if (value <= 50) return 'Roughly equivalent to a normal day with light traffic nearby — no meaningful health risk today.';
  if (value <= 100) return 'A typical moderate day — most people can continue normal outdoor activities.';
  if (value <= 150) return 'Sensitive people may notice symptoms during longer periods of outdoor exertion.';
  if (value <= 200) return 'Outdoor activity may feel uncomfortable; consider shorter exposure and cleaner indoor air.';
  if (value <= 300) return 'Pollution is high enough that everyone should reduce prolonged outdoor exertion.';
  return 'Conditions are hazardous; avoid outdoor exposure and follow local health guidance.';
}

function pollutantMeterColor(value: number | undefined, threshold: number): string {
  if (value === undefined || Number.isNaN(value)) return '#9aaab3';
  const ratio = value / threshold;
  if (ratio <= .7) return '#3fb98a';
  if (ratio <= 1) return '#e8b93f';
  return '#e8763f';
}

function AirQualityForecast({ weather }: { weather: WeatherPayload }) {
  const airQuality = weather.airQuality;
  const current = airQuality?.current ?? {};
  const level = airLevel(current.us_aqi);
  const stats = [
    { label: 'PM2.5', value: current.pm2_5, unit: 'μg/m³', sub: 'fine particles', threshold: 5 },
    { label: 'PM10', value: current.pm10, unit: 'μg/m³', sub: 'coarse particles', threshold: 45 },
    { label: 'NO₂', value: current.nitrogen_dioxide, unit: 'μg/m³', sub: 'nitrogen dioxide', threshold: 25 },
    { label: 'O₃', value: current.ozone, unit: 'μg/m³', sub: 'ground-level ozone', threshold: 100 },
  ];
  const currentPosition = Math.min(100, Math.max(0, ((current.us_aqi ?? 0) / 150) * 100));
  const comparisonMarkers = [
    { className: 'air-marker-current', label: 'Your air', value: current.us_aqi, position: currentPosition, color: airColor(current.us_aqi) },
    { className: 'air-marker-who', label: 'WHO 24h guideline', value: 50, position: 33.33, color: '#e8b93f' },
    { className: 'air-marker-city', label: 'Typical city day', value: 100, position: 66.67, color: '#e8763f' },
  ];

  return (
    <section className="air-wide" aria-labelledby="air-title">
      <div className="section-heading">
        <h2 className="section-title" id="air-title">Air around you</h2>
          <span className="section-meta">live AQI</span>
      </div>
      <div className="panel air-panel" data-testid="panel-air-quality">
        {airQuality ? (
          <>
            <div className="air-compact-summary">
              <div className="air-score-block" aria-label={`Current US AQI ${pollutionValue(current.us_aqi)}`}>
                <span className="air-kicker">Current US AQI</span>
                <div className="air-score-line">
                  <strong data-testid="text-current-aqi" style={{ color: airColor(current.us_aqi) }}>{pollutionValue(current.us_aqi)}</strong>
                  <div className={`air-badge ${level.className}`}>{level.label}</div>
                </div>
              </div>
              <div className="air-summary-copy">
                <p>{level.guidance}</p>
                <small>Updated with your local forecast</small>
              </div>
              <div className="air-range" aria-label="AQI comparison range from 0 to 150">
                <div className="air-range-heading"><span>Quality range</span><span>0—150</span></div>
                <div className="air-scale">
                  <div className="air-scale-segment air-scale-good" />
                  <div className="air-scale-segment air-scale-moderate" />
                  <div className="air-scale-segment air-scale-sensitive" />
                  {comparisonMarkers.map((marker) => (
                    <div className={`air-marker ${marker.className}`} key={marker.label} style={{ left: `${marker.position}%` }} aria-label={`${marker.label}: ${pollutionValue(marker.value)}`}>
                      <i style={{ background: marker.color }} />
                    </div>
                  ))}
                </div>
                <div className="air-range-labels"><span>Good</span><span>Moderate</span><span>Unhealthy</span></div>
              </div>
            </div>
            <div className="air-stats" data-testid="list-pollution-stats">
              {stats.map((stat) => (
                <div className="air-stat" key={stat.label}>
                  <span className="air-stat-label">{stat.label}</span>
                  <strong>{pollutionValue(stat.value)}<em>{stat.unit}</em></strong>
                  <small>{stat.sub}</small>
                  <div className="air-stat-meter" aria-label={`${stat.label} relative to guideline`}>
                    <div style={{ width: `${Math.min(100, ((stat.value ?? 0) / stat.threshold) * 100)}%`, background: pollutantMeterColor(stat.value, stat.threshold) }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="air-context" data-testid="air-context">
              <div><span className="air-context-kicker">In plain English</span><p>{airContext(current.us_aqi)}</p></div>
              <span className="air-context-source">Particles + gases · local forecast</span>
            </div>
          </>
        ) : (
          <p className="air-empty">Air-quality detail is unavailable right now. Weather data is still up to date.</p>
        )}
      </div>
    </section>
  );
}

function WeatherDetails({ weather, unit }: { weather: WeatherPayload; unit: Unit }) {
  const current = weather.current ?? {};
  const daily = weather.daily ?? {};
  const dewPoint = calculateDewPointCelsius(current.temperature_2m, current.relative_humidity_2m);
  const dewComfort = dewPointComfort(dewPoint);
  const detailItems: { icon: LucideIcon; label: string; value: string; sub?: string; dewPoint?: { value: string; comfort: { label: string; className: string } } }[] = [
    { icon: Thermometer, label: 'Feels like', value: displayTemp(current.apparent_temperature, unit), sub: 'on your skin' },
    { icon: Droplets, label: 'Humidity', value: current.relative_humidity_2m !== undefined ? `${current.relative_humidity_2m}%` : '—', sub: 'relative humidity', dewPoint: { value: displayTemp(dewPoint, unit), comfort: dewComfort } },
    { icon: Umbrella, label: 'Rain now', value: current.precipitation !== undefined ? `${current.precipitation} mm` : '—', sub: 'at this moment' },
    { icon: Gauge, label: 'Day ahead', value: `${daily.precipitation_probability_max?.[0] ?? 0}%`, sub: 'chance of rain' },
  ];
  return (
    <section className="details-wide" aria-labelledby="details-title">
      <div className="section-heading">
        <h2 className="section-title" id="details-title">The useful bits</h2>
        <span className="section-meta">at a glance</span>
      </div>
      <div className="panel details-panel" data-testid="panel-weather-details">
        <div className="detail-grid">
          {detailItems.map(({ icon: Icon, label, value, sub, dewPoint: humidityDewPoint }) => (
            <div className="detail" key={label} data-testid={`detail-${label.toLowerCase().replaceAll(' ', '-')}`}>
              <Icon className="detail-icon" size={17} strokeWidth={1.7} />
              <div className="detail-label">{label}</div>
              <div className="detail-value">{value}</div>
              <div className="detail-sub">{sub}</div>
              {humidityDewPoint ? (
                <div className="dew-point" data-testid="detail-dew-point">
                  <span className="dew-point-label">
                    <span className="dew-point-info" title="Dew point measures how humid the air actually feels — more reliable than relative humidity alone." aria-label="About dew point"><Info size={11} strokeWidth={1.8} /></span>
                    Dew point <strong>{humidityDewPoint.value}</strong>
                  </span>
                  <span className={`dew-pill ${humidityDewPoint.comfort.className}`}>{humidityDewPoint.comfort.label}</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="panel sun-panel">
          <div className="sun-item">
            <Sunrise size={20} strokeWidth={1.6} />
            <div><div className="sun-label">Sunrise</div><div className="sun-value">{timeLabel(daily.sunrise?.[0])}</div></div>
          </div>
          <div className="sun-item">
            <Sunset size={20} strokeWidth={1.6} />
            <div><div className="sun-label">Sunset</div><div className="sun-value">{timeLabel(daily.sunset?.[0])}</div></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MicroClimateForecast({ weather, place, unit }: { weather: WeatherPayload; place: Place; unit: Unit }) {
  const [model, setModel] = useState<MicroClimatePayload | null>(null);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    let active = true;
    setModelStatus('loading');
    void fetchMicroClimate(place).then((result) => {
      if (!active) return;
      setModel(result);
      setModelStatus(result ? 'ready' : 'unavailable');
    });
    return () => {
      active = false;
    };
  }, [place.latitude, place.longitude]);

  const regionalTemperature = weather.current?.temperature_2m;
  const regionalRainfall = weather.current?.precipitation;
  const modelTemperature = model?.current?.temperature_2m;
  const modelRainfall = model?.current?.precipitation;
  const temperatureDeltaC = regionalTemperature !== undefined && modelTemperature !== undefined
    ? modelTemperature - regionalTemperature
    : undefined;
  const temperatureDelta = temperatureDeltaC === undefined
    ? undefined
    : unit === 'fahrenheit' ? temperatureDeltaC * 9 / 5 : temperatureDeltaC;
  const rainfallDelta = regionalRainfall !== undefined && modelRainfall !== undefined
    ? modelRainfall - regionalRainfall
    : undefined;
  const modelDistance = model?.latitude !== undefined && model.longitude !== undefined
    ? `UKV model grid: ${distanceKm(place.latitude, place.longitude, model.latitude, model.longitude).toFixed(1)} km away`
    : 'UKV model grid: unavailable';
  const modelValue = modelStatus === 'loading' ? 'Checking UKV…' : modelStatus === 'ready' ? 'Model grid' : 'Regional only';

  const rows = [
    {
      label: 'Temperature',
      icon: Thermometer,
      regional: displayTemp(regionalTemperature, unit),
      nearby: modelStatus === 'loading' ? 'Checking…' : modelTemperature === undefined ? 'Regional only' : displayTemp(modelTemperature, unit),
      delta: temperatureDelta,
      deltaText: signedDelta(temperatureDelta, unit === 'fahrenheit' ? '°F grid' : '°C grid'),
      notable: temperatureDelta !== undefined && Math.abs(temperatureDelta) >= (unit === 'fahrenheit' ? 1.8 : 1),
      distance: modelDistance,
    },
    {
      label: 'Rainfall now',
      icon: Droplets,
      regional: regionalRainfall === undefined ? '—' : `${regionalRainfall.toFixed(1)} mm`,
      nearby: modelStatus === 'loading' ? 'Checking…' : modelRainfall === undefined ? 'Regional only' : `${modelRainfall.toFixed(1)} mm`,
      delta: rainfallDelta,
      deltaText: signedDelta(rainfallDelta, ' mm grid'),
      notable: rainfallDelta !== undefined && Math.abs(rainfallDelta) >= .2,
      distance: modelDistance,
    },
    {
      label: 'Air quality',
      icon: Gauge,
      regional: `${pollutionValue(weather.airQuality?.current?.us_aqi)} US AQI`,
      nearby: 'No nearby sensor',
      delta: undefined,
      deltaText: 'Regional only',
      notable: false,
      distance: 'Nearest air sensor: unavailable',
    },
  ];

  return (
    <section className="micro-wide" aria-labelledby="micro-title">
      <div className="section-heading">
        <h2 className="section-title" id="micro-title">Your Micro-Climate</h2>
        <span className="section-meta">vs. regional forecast</span>
      </div>
      <div className="panel micro-panel" data-testid="panel-micro-climate">
        <div className="micro-intro">
          <span>LOCAL VARIANCE CHECK</span>
          <p>One nearby model grid point can feel different from the broader city forecast. This is a comparison, not block-level precision.</p>
          <strong>{modelValue}</strong>
        </div>
        <div className="micro-rows">
          {rows.map(({ label, icon: Icon, regional, nearby, delta, deltaText, notable, distance }) => {
            const DeltaIcon = delta === undefined ? null : delta >= 0 ? ArrowUp : ArrowDown;
            return (
              <div className={`micro-row${delta === undefined ? ' micro-row-unavailable' : ''}`} key={label}>
                <div className="micro-metric">
                  <Icon size={17} strokeWidth={1.7} />
                  <strong>{label}</strong>
                </div>
                <div className="micro-value-group">
                  <span><small>Regional</small><b>{regional}</b></span>
                  <span><small>{label === 'Air quality' ? 'Nearby sensor' : 'Nearby model'}</small><b>{nearby}</b></span>
                </div>
                <div className={`micro-delta${notable ? ' micro-delta-amber' : ''}${delta === undefined ? ' micro-delta-muted' : ''}`}>
                  {DeltaIcon ? <DeltaIcon size={13} strokeWidth={2} /> : null}
                  <span>{deltaText}</span>
                </div>
                <small className="micro-distance">{distance}</small>
              </div>
            );
          })}
        </div>
        <p className="micro-fallback">No nearby micro-sensor data available for air quality — showing regional forecast only.</p>
      </div>
    </section>
  );
}

function Home() {
  const [place, setPlace] = useState<Place>(LONDON);
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [unit, setUnit] = useState<Unit>('celsius');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const requestId = useRef(0);

  const loadWeather = useCallback(async (nextPlace: Place) => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError('');
    try {
      const result = await fetchWeather(nextPlace);
      if (id !== requestId.current) return;
      setPlace(nextPlace);
      setWeather(result);
    } catch (err) {
      if (id === requestId.current) setError(err instanceof Error ? err.message : 'We could not reach the weather service.');
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, []);

  const findMe = useCallback((useFallback = false) => {
    if (!navigator.geolocation) {
      if (useFallback) {
        void loadWeather(LONDON);
      } else {
        setError('Location services are not available in this browser.');
      }
      return;
    }
    if (useFallback) void loadWeather(LONDON);
    setIsLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const reverseParams = new URLSearchParams({ latitude: String(coords.latitude), longitude: String(coords.longitude), count: '1', language: 'en', format: 'json' });
        const reverse = await getJson<GeocodingPayload>(`${GEOCODING_URL}?${reverseParams.toString()}`);
        const found = reverse.results?.[0];
        await loadWeather(found ?? { name: 'Your location', latitude: coords.latitude, longitude: coords.longitude });
      } catch {
        await loadWeather({ name: 'Your location', latitude: coords.latitude, longitude: coords.longitude });
      } finally {
        setIsLocating(false);
      }
    }, () => {
      setIsLocating(false);
      if (!useFallback) {
        setError('We could not access your location. Please allow location access and try again.');
      }
    }, {
      enableHighAccuracy: false,
      maximumAge: 300000,
      timeout: 5000,
    });
  }, [loadWeather]);

  useEffect(() => { findMe(true); }, [findMe]);

  const current = weather?.current ?? {};
  const currentCode = current.weather_code ?? 0;
  const updatedLabel = useMemo(() => {
    if (!current.time) return 'Forecast ready';
    return `Updated ${timeLabel(current.time)}`;
  }, [current.time]);
  const hourlyTimes = weather?.hourly?.time ?? [];
  const hourlyStart = hourlyTimes.length
    ? Math.max(0, hourlyTimes.findIndex((time) => Date.parse(time) >= (current.time ? Date.parse(current.time) : Date.now())))
    : 0;
  const upcomingIndexes = hourlyTimes.length
    ? Array.from({ length: Math.min(6, hourlyTimes.length - hourlyStart) }, (_, index) => hourlyStart + index)
    : [];
  const upcomingPrecipitation = upcomingIndexes
    .map((index) => weather?.hourly?.precipitation_probability?.[index])
    .filter((value): value is number => value !== undefined && !Number.isNaN(value));
  const peakPrecipitation = upcomingPrecipitation.length
    ? Math.max(...upcomingPrecipitation)
    : weather?.daily?.precipitation_probability_max?.[0];
  const peakPrecipitationIndex = upcomingIndexes.find((index) => weather?.hourly?.precipitation_probability?.[index] === peakPrecipitation);
  const umbrellaAdvice = getUmbrellaAdvice(peakPrecipitation, peakPrecipitationIndex === undefined ? undefined : timeLabel(hourlyTimes[peakPrecipitationIndex]));
  const sunglassesAdvice = getSunglassesAdvice(current.uv_index, current.cloud_cover);

  return (
    <div className="weather-app">
      <div className="app-shell">
        <header className="topbar">
          <div className="brand" aria-label="Daymark weather">
            <div className="brand-mark"><CloudSun size={21} strokeWidth={1.8} /></div>
            <div><div className="brand-name">daymark</div><div className="brand-note">weather, simply</div></div>
          </div>
          <div className="top-actions">
            <div className="unit-switch" aria-label="Temperature unit">
              <button className={`unit-button${unit === 'celsius' ? ' active' : ''}`} onClick={() => setUnit('celsius')} aria-pressed={unit === 'celsius'} data-testid="button-unit-celsius">°C</button>
              <button className={`unit-button${unit === 'fahrenheit' ? ' active' : ''}`} onClick={() => setUnit('fahrenheit')} aria-pressed={unit === 'fahrenheit'} data-testid="button-unit-fahrenheit">°F</button>
            </div>
            <button className="icon-button" onClick={() => findMe()} aria-label="Use my location" title="Use my location" data-testid="button-use-location">
              <LocateFixed size={17} className={isLocating ? 'animate-pulse' : ''} />
            </button>
          </div>
        </header>

        {isLoading && <LoadingState />}
        {!isLoading && error && <WeatherError message={error} onRetry={() => void loadWeather(place)} />}
        {!isLoading && !error && weather && (
          <main>
            <section className="hero-grid" aria-labelledby="place-title">
              <div className="hero-location">
                <h1 className="place-title" id="place-title" data-testid="text-current-city">{place.name}</h1>
                <div className="date-line" data-testid="text-current-date">{localDate(current.time)?.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) ?? 'Today'}</div>
                <div className="advice-grid">
                  <article className={`advice-card advice-${umbrellaAdvice.answer.toLowerCase()}`} data-testid="card-umbrella-advice">
                    <Umbrella className="advice-icon" size={19} strokeWidth={1.7} />
                    <span className="advice-label">Umbrella?</span>
                    <strong data-testid="text-umbrella-advice">{umbrellaAdvice.answer}</strong>
                    <small>{umbrellaAdvice.reason}</small>
                  </article>
                  <article className={`advice-card advice-${sunglassesAdvice.answer.toLowerCase()}`} data-testid="card-sunglasses-advice">
                    <Glasses className="advice-icon" size={19} strokeWidth={1.7} />
                    <span className="advice-label">Sunglasses?</span>
                    <strong data-testid="text-sunglasses-advice">{sunglassesAdvice.answer}</strong>
                    <small>{sunglassesAdvice.reason}</small>
                  </article>
                </div>
                <button className="local-button" onClick={() => findMe()} data-testid="button-refresh-location"><Navigation size={13} />{isLocating ? 'Finding you…' : 'Use my location'}</button>
              </div>
              <div className="temp-block">
                <div className="current-temp" data-testid="text-current-temperature">{displayTemp(current.temperature_2m, unit)}<sup>{unit === 'celsius' ? 'C' : 'F'}</sup></div>
                <div className="feels">Feels like<strong>{displayTemp(current.apparent_temperature, unit)}</strong><span className="temperature-condition">{weatherCopy(currentCode)}</span>{updatedLabel}</div>
              </div>
            </section>
            <div className="content-grid">
              <HourlyOutlook weather={weather} unit={unit} />
              <DailyForecast weather={weather} unit={unit} />
              <WeatherDetails weather={weather} unit={unit} />
                <MicroClimateForecast weather={weather} place={place} unit={unit} />
              <UVForecast weather={weather} />
              <AirQualityForecast weather={weather} />
            </div>
          </main>
        )}
        <footer className="footer-note"><span><CalendarDays size={11} style={{ verticalAlign: 'middle', marginRight: 5 }} /> Forecasts by Open-Meteo</span><a href="https://open-meteo.com/" target="_blank" rel="noreferrer" data-testid="link-open-meteo">open-meteo.com</a></footer>
      </div>
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;