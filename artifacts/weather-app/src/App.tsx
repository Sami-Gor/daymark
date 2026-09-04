import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarDays,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Droplets,
  Gauge,
  LocateFixed,
  Moon,
  Navigation,
  Snowflake,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Umbrella,
  Wind,
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

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function fetchWeather(place: Place): Promise<WeatherPayload> {
  const weatherParams = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m,uv_index,uv_index_clear_sky',
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

function displayTemp(value: number | undefined, unit: Unit): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  const converted = unit === 'fahrenheit' ? (value * 9) / 5 + 32 : value;
  return `${Math.round(converted)}°`;
}

function displayWind(value: number | undefined, unit: Unit): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  const converted = unit === 'fahrenheit' ? value * 0.621371 : value;
  return `${Math.round(converted)} ${unit === 'fahrenheit' ? 'mph' : 'km/h'}`;
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

type ChartPoint = { x: number; y: number };

function smoothChartPath(points: ChartPoint[]): string {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const beforePrevious = points[index - 2] ?? previous;
    const next = points[index + 1] ?? point;
    const controlOne = {
      x: previous.x + (point.x - beforePrevious.x) / 6,
      y: previous.y + (point.y - beforePrevious.y) / 6,
    };
    const controlTwo = {
      x: point.x - (next.x - previous.x) / 6,
      y: point.y - (next.y - previous.y) / 6,
    };
    return `${path} C ${controlOne.x} ${controlOne.y}, ${controlTwo.x} ${controlTwo.y}, ${point.x} ${point.y}`;
  }, '');
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
  const gaugeValue = Math.max(0, Math.min(11, currentUv ?? 0));
  const gaugeAngle = Math.PI - (gaugeValue / 11) * Math.PI;
  const needleX = 150 + Math.cos(gaugeAngle) * 105;
  const needleY = 132 - Math.sin(gaugeAngle) * 105;
  const chartWidth = 900;
  const chartBaseline = 202;
  const chartTop = 30;
  const chartMax = Math.max(3, ...hourIndexes.map((index) => hourly.uv_index?.[index] ?? 0), 11);
  const chartPoints = hourIndexes.map((index, itemIndex) => {
    const value = hourly.uv_index?.[index] ?? 0;
    const x = hourIndexes.length === 1 ? chartWidth / 2 : 18 + (itemIndex / (hourIndexes.length - 1)) * (chartWidth - 36);
    const y = chartBaseline - (value / chartMax) * (chartBaseline - chartTop);
    return { x, y };
  });
  const chartLine = smoothChartPath(chartPoints);
  const chartArea = chartLine && chartPoints.length
    ? `${chartLine} L ${chartPoints[chartPoints.length - 1].x} ${chartBaseline} L ${chartPoints[0].x} ${chartBaseline} Z`
    : '';
  const chartPeakIndex = hourIndexes.reduce((best, index, itemIndex) => {
    const value = hourly.uv_index?.[index] ?? 0;
    const bestValue = hourly.uv_index?.[hourIndexes[best]] ?? 0;
    return value > bestValue ? itemIndex : best;
  }, 0);

  return (
    <section className="uv-wide" aria-labelledby="uv-title">
      <div className="section-heading">
        <h2 className="section-title" id="uv-title">Sun on your skin</h2>
        <span className="section-meta">UV forecast</span>
      </div>
      <div className="panel uv-panel" data-testid="panel-uv-forecast">
        <div className="uv-summary">
          <div className="uv-gauge" aria-label={`Current UV index ${uvValue(currentUv)}`}>
            <svg viewBox="0 0 300 166" role="img">
              <title>Current UV index: {uvValue(currentUv)}</title>
              <path className="uv-gauge-track" d="M 24 132 A 126 126 0 0 1 276 132" pathLength="400" />
              <path className="uv-gauge-segment gauge-low" d="M 24 132 A 126 126 0 0 1 276 132" pathLength="400" strokeDasharray="100 300" strokeDashoffset="0" />
              <path className="uv-gauge-segment gauge-moderate" d="M 24 132 A 126 126 0 0 1 276 132" pathLength="400" strokeDasharray="100 300" strokeDashoffset="-100" />
              <path className="uv-gauge-segment gauge-high" d="M 24 132 A 126 126 0 0 1 276 132" pathLength="400" strokeDasharray="100 300" strokeDashoffset="-200" />
              <path className="uv-gauge-segment gauge-extreme" d="M 24 132 A 126 126 0 0 1 276 132" pathLength="400" strokeDasharray="100 300" strokeDashoffset="-300" />
              <line className="uv-needle" x1="150" y1="132" x2={needleX} y2={needleY} />
              <circle className="uv-needle-dot" cx="150" cy="132" r="7" />
            </svg>
            <div className={`uv-gauge-value ${currentLevel.className}`}>
              <strong data-testid="text-current-uv">{uvValue(currentUv)}</strong>
              <span>Current UV index</span>
            </div>
          </div>
          <div className="uv-summary-copy">
            <div className={`uv-badge ${currentLevel.className}`}>{currentLevel.label}</div>
            <p>{currentLevel.guidance}</p>
          </div>
          <div className="uv-peak">
            <span>Today’s peak</span>
            <strong>{uvValue(peakUv)} <em>{peakLevel.label}</em></strong>
            {peakHour?.time && <small>around {timeLabel(peakHour.time)}</small>}
          </div>
        </div>

        <div className="uv-timeline-wrap">
          <div className="uv-subheading"><span>Today by hour</span><span>index</span></div>
          {hourIndexes.length ? (
            <div className="uv-chart" data-testid="list-hourly-uv">
              <svg viewBox={`0 0 ${chartWidth} 242`} role="img" aria-label="Hourly UV index forecast">
                <title>Hourly UV index forecast</title>
                <defs>
                  <linearGradient id="uv-chart-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#3fb98a" stopOpacity=".32" />
                    <stop offset="42%" stopColor="#e8b93f" stopOpacity=".2" />
                    <stop offset="78%" stopColor="#e8763f" stopOpacity=".12" />
                    <stop offset="100%" stopColor="#3fb98a" stopOpacity=".04" />
                  </linearGradient>
                </defs>
                {[0, 1, 2].map((line) => (
                  <line className="uv-chart-gridline" key={line} x1="0" x2={chartWidth} y1={chartTop + line * 58} y2={chartTop + line * 58} />
                ))}
                {chartArea && <path className="uv-chart-area" d={chartArea} />}
                {chartLine && <path className="uv-chart-line" d={chartLine} />}
                {chartPoints.map((point, itemIndex) => {
                  const index = hourIndexes[itemIndex];
                  const value = hourly.uv_index?.[index];
                  return (
                    <g key={`${hourlyTimes[index]}-${index}`} data-testid={`uv-hour-${index}`}>
                      <circle className="uv-chart-dot" cx={point.x} cy={point.y} r={itemIndex === chartPeakIndex ? 5 : 3.5} fill={uvColor(value)} />
                      {itemIndex === chartPeakIndex && <text className="uv-chart-peak-label" x={point.x} y={point.y - 13} textAnchor="middle">{uvValue(value)}</text>}
                      <text className="uv-chart-value" x={point.x} y="220" textAnchor="middle">{uvValue(value)}</text>
                      <text className="uv-chart-hour-label" x={point.x} y="239" textAnchor="middle">{itemIndex === 0 ? 'Now' : timeLabel(hourlyTimes[index])}</text>
                    </g>
                  );
                })}
              </svg>
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

function AirQualityForecast({ weather }: { weather: WeatherPayload }) {
  const airQuality = weather.airQuality;
  const current = airQuality?.current ?? {};
  const hourly = airQuality?.hourly ?? {};
  const times = hourly.time ?? [];
  const currentTime = weather.current?.time ? Date.parse(weather.current.time) : Date.now();
  const start = Math.max(0, times.findIndex((time) => Date.parse(time) >= currentTime));
  const indexes = Array.from({ length: Math.min(12, Math.max(0, times.length - start)) }, (_, index) => start + index);
  const level = airLevel(current.us_aqi);
  const stats = [
    { label: 'PM2.5', value: pollutionValue(current.pm2_5), unit: 'μg/m³', sub: 'fine particles' },
    { label: 'PM10', value: pollutionValue(current.pm10), unit: 'μg/m³', sub: 'coarse particles' },
    { label: 'NO₂', value: pollutionValue(current.nitrogen_dioxide), unit: 'μg/m³', sub: 'nitrogen dioxide' },
    { label: 'O₃', value: pollutionValue(current.ozone), unit: 'μg/m³', sub: 'ground-level ozone' },
  ];

  return (
    <section className="air-wide" aria-labelledby="air-title">
      <div className="section-heading">
        <h2 className="section-title" id="air-title">Air around you</h2>
        <span className="section-meta">pollution stats</span>
      </div>
      <div className="panel air-panel" data-testid="panel-air-quality">
        {airQuality ? (
          <>
            <div className="air-summary">
              <div className={`air-score ${level.className}`}>
                <Wind size={18} strokeWidth={1.7} />
                <div>
                  <span className="air-kicker">Current US AQI</span>
                  <strong data-testid="text-current-aqi">{pollutionValue(current.us_aqi)}</strong>
                </div>
              </div>
              <div className="air-summary-copy">
                <div className={`air-badge ${level.className}`}>{level.label}</div>
                <p>{level.guidance}</p>
              </div>
              <div className="air-note">
                <span>What’s measured</span>
                <strong>Particles + gases</strong>
                <small>Updated with your local forecast</small>
              </div>
            </div>
            <div className="air-stats" data-testid="list-pollution-stats">
              {stats.map((stat) => (
                <div className="air-stat" key={stat.label}>
                  <span className="air-stat-label">{stat.label}</span>
                  <strong>{stat.value}<em>{stat.unit}</em></strong>
                  <small>{stat.sub}</small>
                </div>
              ))}
            </div>
            {indexes.length ? (
              <div className="air-hourly-wrap">
                <div className="air-subheading"><span>Next 12 hours</span><span>US AQI</span></div>
                <div className="air-hourly" data-testid="list-hourly-aqi">
                  {indexes.map((index, itemIndex) => {
                    const value = hourly.us_aqi?.[index];
                    const hourLevel = airLevel(value);
                    const height = `${Math.max(5, Math.min(100, ((value ?? 0) / 200) * 100))}%`;
                    return (
                      <div className="air-hour" key={`${times[index]}-${index}`} data-testid={`aqi-hour-${index}`}>
                        <div className={`air-bar ${hourLevel.className}`} style={{ height }} title={`${pollutionValue(value)} — ${hourLevel.label}`} />
                        <span>{pollutionValue(value)}</span>
                        <small>{itemIndex === 0 ? 'Now' : timeLabel(times[index])}</small>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
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
  const detailItems: { icon: LucideIcon; label: string; value: string; sub?: string }[] = [
    { icon: Thermometer, label: 'Feels like', value: displayTemp(current.apparent_temperature, unit), sub: 'on your skin' },
    { icon: Droplets, label: 'Humidity', value: current.relative_humidity_2m !== undefined ? `${current.relative_humidity_2m}%` : '—', sub: 'relative humidity' },
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
          {detailItems.map(({ icon: Icon, label, value, sub }) => (
            <div className="detail" key={label} data-testid={`detail-${label.toLowerCase().replaceAll(' ', '-')}`}>
              <Icon className="detail-icon" size={17} strokeWidth={1.7} />
              <div className="detail-label">{label}</div>
              <div className="detail-value">{value}</div>
              <div className="detail-sub">{sub}</div>
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
  const CurrentIcon = weatherIcon(currentCode, current.is_day !== 0);
  const updatedLabel = useMemo(() => {
    if (!current.time) return 'Forecast ready';
    return `Updated ${timeLabel(current.time)}`;
  }, [current.time]);
  const dayGreeting = current.is_day === 0 ? 'A clear night' : weatherCopy(currentCode);
  const summary = current.precipitation && current.precipitation > 0
    ? 'Keep a light layer close — the sky may change its mind.'
    : current.temperature_2m !== undefined && current.temperature_2m < 10
      ? 'A crisp start. You will be glad of an extra layer today.'
      : 'A good day to step outside and see where it takes you.';

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
              <div>
                <div className="eyebrow"><span className="eyebrow-dot" />{dayGreeting}</div>
                <h1 className="place-title" id="place-title" data-testid="text-current-city">{place.name}</h1>
                <div className="date-line" data-testid="text-current-date">{localDate(current.time)?.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) ?? 'Today'}</div>
                <div className="condition-line" data-testid="text-current-condition"><CurrentIcon className="condition-icon" size={26} strokeWidth={1.6} />{weatherCopy(currentCode)}<span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 400 }}>·</span><span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 400 }}>{summary}</span></div>
                <button className="local-button" onClick={() => findMe()} data-testid="button-refresh-location"><Navigation size={13} />{isLocating ? 'Finding you…' : 'Use my location'}</button>
              </div>
              <div className="temp-block">
                <div className="current-temp" data-testid="text-current-temperature">{displayTemp(current.temperature_2m, unit)}<sup>{unit === 'celsius' ? 'C' : 'F'}</sup></div>
                <div className="feels">Feels like<strong>{displayTemp(current.apparent_temperature, unit)}</strong>{updatedLabel}</div>
              </div>
            </section>
            <div className="content-grid">
              <HourlyOutlook weather={weather} unit={unit} />
              <DailyForecast weather={weather} unit={unit} />
              <WeatherDetails weather={weather} unit={unit} />
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