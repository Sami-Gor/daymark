import {
  addLocationHours,
  compareLocationTimes,
  displayTemp,
  displayWind,
  formatLocationTime,
  getCurrentLocationTime,
  getLocationLocalDate,
  type Unit,
  type WeatherPayload,
} from './weather';
import { resolveLocale, translate } from './i18n';

/*
 * Daymark severe-weather risk engine.
 *
 * IMPORTANT: every alert produced here is FORECAST-DERIVED ("Daymark Weather
 * Risk"), never an official or government warning. Daymark does not currently
 * integrate an authoritative warning source, so nothing is labelled
 * "official". The `type` field reserves `'official'` for a future integration,
 * but this engine only ever emits `'forecast-risk'`.
 *
 * Pure and framework-independent: no React, no DOM, no browser APIs and no
 * network calls. All timing uses the selected location's wall clock.
 */

export type AlertType = 'forecast-risk' | 'official';
export type AlertHazard = 'wind' | 'thunderstorm' | 'rain' | 'snow' | 'heat' | 'cold';
export type AlertSeverity = 'moderate' | 'high' | 'severe';

export type WeatherAlert = {
  id: string;
  type: AlertType;
  hazard: AlertHazard;
  severity: AlertSeverity;
  title: string;
  summary: string;
  startTime?: string;
  endTime?: string;
  source: string;
};

export type AlertOptions = {
  unit?: Unit;
  locale?: string | string[];
};

/*
 * Documented, conservative thresholds. These are Daymark's own risk levels for
 * forecast data — NOT official warning criteria. Tune centrally here only.
 */
export const ALERT_THRESHOLDS = {
  // Sustained hourly wind (km/h).
  windSpeedKmh: { moderate: 40, high: 60, severe: 80 },
  // Hourly wind gusts (km/h).
  windGustKmh: { moderate: 55, high: 75, severe: 100 },
  // Total hourly precipitation (mm in one hour).
  rainMmPerHour: { moderate: 4, high: 8, severe: 15 },
  // Hourly snowfall (cm in one hour).
  snowCmPerHour: { moderate: 1, high: 3, severe: 6 },
  // Daily maximum / minimum temperature (°C).
  heatC: { moderate: 30, high: 35, severe: 40 },
  coldC: { moderate: -10, high: -18, severe: -25 },
  // WMO weather codes treated as thunderstorm risk.
  thunderstormCodes: [95, 96, 99],
  severeThunderstormCodes: [96, 99],
} as const;

export const ALERT_SOURCE = 'Daymark forecast analysis — not an official warning';

const SEVERITY_RANK: Record<AlertSeverity, number> = { moderate: 1, high: 2, severe: 3 };
const HAZARD_ORDER: AlertHazard[] = ['wind', 'thunderstorm', 'rain', 'snow', 'heat', 'cold'];
const WINDOW_HOURS = 24;

type Thresholds = { moderate: number; high: number; severe: number };

function severityFor(value: number | null | undefined, thresholds: Thresholds, direction: 'above' | 'below' = 'above'): AlertSeverity | null {
  if (value == null || Number.isNaN(value)) return null;
  if (direction === 'above') {
    if (value >= thresholds.severe) return 'severe';
    if (value >= thresholds.high) return 'high';
    if (value >= thresholds.moderate) return 'moderate';
    return null;
  }
  if (value <= thresholds.severe) return 'severe';
  if (value <= thresholds.high) return 'high';
  if (value <= thresholds.moderate) return 'moderate';
  return null;
}

function higherSeverity(a: AlertSeverity | null, b: AlertSeverity | null): AlertSeverity | null {
  if (!a) return b;
  if (!b) return a;
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

type Window = { times: string[]; startIndex: number; endIndex: number };

/* The next 24 hours of hourly readings, in the location's wall clock. */
function upcomingWindow(weather: WeatherPayload): Window | null {
  const times = weather.hourly?.time ?? [];
  if (!times.length) return null;
  const now = getCurrentLocationTime(weather.current?.time, weather) ?? times[0] ?? null;
  if (!now) return null;
  const until = addLocationHours(now, WINDOW_HOURS);
  let startIndex = -1;
  let endIndex = -1;
  for (let index = 0; index < times.length; index += 1) {
    const time = times[index];
    if (compareLocationTimes(time, now) >= 0 && compareLocationTimes(time, until) <= 0) {
      if (startIndex === -1) startIndex = index;
      endIndex = index;
    }
  }
  return startIndex === -1 ? null : { times, startIndex, endIndex };
}

type Run = { start: string; end: string; peak: number; peakTime: string };

/*
 * The strongest contiguous run of qualifying hourly readings inside the
 * window. Using a contiguous run (rather than first-to-last) keeps timing
 * honest when readings are intermittent.
 */
function strongestRun(
  window: Window,
  values: ReadonlyArray<number | null | undefined>,
  qualifies: (value: number) => boolean,
): Run | null {
  let best: { start: number; end: number; peak: number; peakIndex: number } | null = null;
  let runStart = -1;
  let runPeak = 0;
  let runPeakIndex = -1;
  for (let index = window.startIndex; index <= window.endIndex + 1; index += 1) {
    const raw = index <= window.endIndex ? values[index] : null;
    const value = raw != null && !Number.isNaN(raw) ? raw : null;
    if (value != null && qualifies(value)) {
      if (runStart === -1) {
        runStart = index;
        runPeak = value;
        runPeakIndex = index;
      } else if (value > runPeak) {
        runPeak = value;
        runPeakIndex = index;
      }
      continue;
    }
    if (runStart !== -1) {
      if (!best || runPeak > best.peak) best = { start: runStart, end: index - 1, peak: runPeak, peakIndex: runPeakIndex };
      runStart = -1;
      runPeak = 0;
      runPeakIndex = -1;
    }
  }
  if (!best) return null;
  const end = best.end + 1 <= window.endIndex ? window.times[best.end + 1] : addLocationHours(window.times[best.end], 1);
  return {
    start: window.times[best.start],
    end,
    peak: best.peak,
    peakTime: window.times[best.peakIndex],
  };
}

function windAlert(weather: WeatherPayload, options: AlertOptions): WeatherAlert | null {
  const window = upcomingWindow(weather);
  if (!window) return null;
  const speedRun = strongestRun(window, weather.hourly?.wind_speed_10m ?? [], (value) => value >= ALERT_THRESHOLDS.windSpeedKmh.moderate);
  const gustRun = strongestRun(window, weather.hourly?.wind_gusts_10m ?? [], (value) => value >= ALERT_THRESHOLDS.windGustKmh.moderate);
  const speedSeverity = speedRun ? severityFor(speedRun.peak, ALERT_THRESHOLDS.windSpeedKmh) : null;
  const gustSeverity = gustRun ? severityFor(gustRun.peak, ALERT_THRESHOLDS.windGustKmh) : null;
  const severity = higherSeverity(speedSeverity, gustSeverity);
  if (!severity) return null;

  const primary = gustRun && (!speedRun || (gustSeverity && speedSeverity && SEVERITY_RANK[gustSeverity] >= SEVERITY_RANK[speedSeverity]))
    ? gustRun
    : (speedRun ?? gustRun);
  if (!primary) return null;

  const startLabel = formatLocationTime(primary.start, options.locale);
  const endLabel = formatLocationTime(primary.end, options.locale);
  const locale = resolveLocale(options.locale);
  const gustPart = gustRun
    ? translate(locale, 'alerts.wind.gusts', { value: displayWind(gustRun.peak, options.unit ?? 'celsius') })
    : '';
  return {
    id: 'forecast-risk.wind',
    type: 'forecast-risk',
    hazard: 'wind',
    severity,
    title: translate(locale, 'alerts.wind.title'),
    summary: translate(locale, 'alerts.wind.summary', { start: startLabel, end: endLabel, gusts: gustPart }),
    startTime: primary.start,
    endTime: primary.end,
    source: translate(locale, 'alerts.source'),
  };
}

function thunderstormAlert(weather: WeatherPayload, options: AlertOptions): WeatherAlert | null {
  const window = upcomingWindow(weather);
  if (!window) return null;
  const codes = weather.hourly?.weather_code ?? [];
  let first = -1;
  let last = -1;
  let severe = false;
  for (let index = window.startIndex; index <= window.endIndex; index += 1) {
    const code = codes[index];
    if (code == null || !ALERT_THRESHOLDS.thunderstormCodes.includes(code as 95 | 96 | 99)) continue;
    if (first === -1) first = index;
    last = index;
    if (ALERT_THRESHOLDS.severeThunderstormCodes.includes(code as 96 | 99)) severe = true;
  }
  if (first === -1) return null;
  const start = window.times[first];
  const end = last + 1 <= window.endIndex ? window.times[last + 1] : addLocationHours(window.times[last], 1);
  const locale = resolveLocale(options.locale);
  return {
    id: 'forecast-risk.thunderstorm',
    type: 'forecast-risk',
    hazard: 'thunderstorm',
    severity: severe ? 'high' : 'moderate',
    title: translate(locale, severe ? 'alerts.thunder.severeTitle' : 'alerts.thunder.title'),
    summary: translate(locale, 'alerts.thunder.summary', { start: formatLocationTime(start, options.locale) }),
    startTime: start,
    endTime: end,
    source: translate(locale, 'alerts.source'),
  };
}

function rainAlert(weather: WeatherPayload, options: AlertOptions): WeatherAlert | null {
  const window = upcomingWindow(weather);
  if (!window) return null;
  const run = strongestRun(window, weather.hourly?.precipitation ?? [], (value) => value >= ALERT_THRESHOLDS.rainMmPerHour.moderate);
  const severity = run ? severityFor(run.peak, ALERT_THRESHOLDS.rainMmPerHour) : null;
  if (!run || !severity) return null;
  const startLabel = formatLocationTime(run.start, options.locale);
  const endLabel = formatLocationTime(run.end, options.locale);
  const locale = resolveLocale(options.locale);
  return {
    id: 'forecast-risk.rain',
    type: 'forecast-risk',
    hazard: 'rain',
    severity,
    title: translate(locale, severity === 'severe' ? 'alerts.rain.severeTitle' : 'alerts.rain.title'),
    summary: translate(locale, 'alerts.rain.summary', { rate: run.peak.toFixed(1), start: startLabel, end: endLabel }),
    startTime: run.start,
    endTime: run.end,
    source: translate(locale, 'alerts.source'),
  };
}

function snowAlert(weather: WeatherPayload, options: AlertOptions): WeatherAlert | null {
  const window = upcomingWindow(weather);
  if (!window) return null;
  const run = strongestRun(window, weather.hourly?.snowfall ?? [], (value) => value >= ALERT_THRESHOLDS.snowCmPerHour.moderate);
  const severity = run ? severityFor(run.peak, ALERT_THRESHOLDS.snowCmPerHour) : null;
  if (!run || !severity) return null;
  const startLabel = formatLocationTime(run.start, options.locale);
  const endLabel = formatLocationTime(run.end, options.locale);
  const locale = resolveLocale(options.locale);
  return {
    id: 'forecast-risk.snow',
    type: 'forecast-risk',
    hazard: 'snow',
    severity,
    title: translate(locale, 'alerts.snow.title'),
    summary: translate(locale, 'alerts.snow.summary', { rate: run.peak.toFixed(1), start: startLabel, end: endLabel }),
    startTime: run.start,
    endTime: run.end,
    source: translate(locale, 'alerts.source'),
  };
}

function dailyIndex(weather: WeatherPayload): number {
  const times = weather.daily?.time ?? [];
  const now = getCurrentLocationTime(weather.current?.time, weather);
  const today = getLocationLocalDate(now);
  if (!today) return 0;
  const index = times.findIndex((time) => getLocationLocalDate(time) === today);
  return index >= 0 ? index : 0;
}

function heatAlert(weather: WeatherPayload, options: AlertOptions): WeatherAlert | null {
  const value = weather.daily?.temperature_2m_max?.[dailyIndex(weather)];
  const severity = severityFor(value, ALERT_THRESHOLDS.heatC);
  if (value == null || !severity) return null;
  const locale = resolveLocale(options.locale);
  const titleKey = severity === 'severe' ? 'alerts.heat.severeTitle' : severity === 'high' ? 'alerts.heat.highTitle' : 'alerts.heat.title';
  return {
    id: 'forecast-risk.heat',
    type: 'forecast-risk',
    hazard: 'heat',
    severity,
    title: translate(locale, titleKey),
    summary: translate(locale, 'alerts.heat.summary', { value: displayTemp(value, options.unit ?? 'celsius') }),
    source: translate(locale, 'alerts.source'),
  };
}

function coldAlert(weather: WeatherPayload, options: AlertOptions): WeatherAlert | null {
  const value = weather.daily?.temperature_2m_min?.[dailyIndex(weather)];
  const severity = severityFor(value, ALERT_THRESHOLDS.coldC, 'below');
  if (value == null || !severity) return null;
  const locale = resolveLocale(options.locale);
  const titleKey = severity === 'severe' ? 'alerts.cold.severeTitle' : severity === 'high' ? 'alerts.cold.highTitle' : 'alerts.cold.title';
  return {
    id: 'forecast-risk.cold',
    type: 'forecast-risk',
    hazard: 'cold',
    severity,
    title: translate(locale, titleKey),
    summary: translate(locale, 'alerts.cold.summary', { value: displayTemp(value, options.unit ?? 'celsius') }),
    source: translate(locale, 'alerts.source'),
  };
}

/*
 * All forecast-derived risks for the selected location, highest severity
 * first, then a stable hazard order. Returns an empty array when nothing
 * crosses the documented thresholds — callers must render nothing then.
 */
export function getWeatherAlerts(weather: WeatherPayload, options: AlertOptions = {}): WeatherAlert[] {
  const alerts = [
    windAlert(weather, options),
    thunderstormAlert(weather, options),
    rainAlert(weather, options),
    snowAlert(weather, options),
    heatAlert(weather, options),
    coldAlert(weather, options),
  ].filter((alert): alert is WeatherAlert => alert != null);

  return alerts.sort((a, b) => (
    SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    || HAZARD_ORDER.indexOf(a.hazard) - HAZARD_ORDER.indexOf(b.hazard)
  ));
}

export function getPrimaryAlert(weather: WeatherPayload, options: AlertOptions = {}): WeatherAlert | null {
  return getWeatherAlerts(weather, options)[0] ?? null;
}
