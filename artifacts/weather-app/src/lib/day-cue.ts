import {
  compareLocationTimes,
  getCurrentLocationTime,
  getLocationLocalDate,
  type WeatherPayload,
} from './weather';

/*
 * Day-level cue derivation for the Today hero.
 *
 * Pure and testable: no React, DOM or speech logic. The cue answers the
 * morning-rush question "do I need sunglasses, an umbrella, both or neither?"
 * using the rest of today's forecast, never a single instantaneous reading.
 *
 * Thresholds reuse the existing advice logic where possible:
 * - rain probability 40% (same as the umbrella advice)
 * - hourly accumulation 0.5 mm (meaningful rain rather than a trace)
 * - clear/mostly-clear weather codes 0/1/2 for sunshine
 * - UV 3 and cloud cover 60% (same as the sunglasses advice)
 *
 * Precedence:
 * 1. A dominant rain pattern stays "rain" even with a brief bright spell.
 * 2. A dominant sunny pattern stays "sun" even with a brief shower.
 * 3. Otherwise meaningful sun + meaningful rain is "mixed".
 * 4. Single-sided days are "sun" / "rain"; neither is "neutral".
 */

export type DayCue = 'sun' | 'rain' | 'mixed' | 'neutral';

export type NeutralCueKind = 'cloud' | 'fog' | 'snow';

export type DayCueLabelKey =
  | 'dayCue.sun'
  | 'dayCue.rain'
  | 'dayCue.mixed'
  | 'dayCue.cloud'
  | 'dayCue.fog'
  | 'dayCue.snow';

export type DayCueResult = {
  cue: DayCue;
  /** Emoji(s) shown visually; never a textual recommendation. */
  emojis: string[];
  /** Localized accessibility label key. */
  labelKey: DayCueLabelKey;
};

export const DAY_CUE_THRESHOLDS = {
  rainProbability: 40,
  rainAmountMm: 0.5,
  uvSun: 3,
  cloudCoverSunMax: 60,
  dominantRatio: 0.6,
  dominantMinHours: 2,
  rainDominantMaxProbability: 80,
} as const;

const CLEAR_CODES = new Set([0, 1, 2]);
const FOG_CODES = new Set([45, 48]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const STORM_CODES = new Set([95, 96, 99]);

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

function neutral(kind: NeutralCueKind): DayCueResult {
  if (kind === 'snow') return { cue: 'neutral', emojis: ['❄️'], labelKey: 'dayCue.snow' };
  if (kind === 'fog') return { cue: 'neutral', emojis: ['🌫️'], labelKey: 'dayCue.fog' };
  return { cue: 'neutral', emojis: ['☁️'], labelKey: 'dayCue.cloud' };
}

function neutralKindFor(code: number | null | undefined, fallback: NeutralCueKind): NeutralCueKind {
  if (code == null) return fallback;
  if (SNOW_CODES.has(code)) return 'snow';
  if (FOG_CODES.has(code)) return 'fog';
  return 'cloud';
}

export function deriveDayCue(weather: WeatherPayload): DayCueResult {
  const current = weather.current ?? {};
  const hourly = weather.hourly ?? {};
  const daily = weather.daily ?? {};
  const times = hourly.time ?? [];
  const probabilities = hourly.precipitation_probability ?? [];
  const amounts = hourly.precipitation ?? [];
  const codes = hourly.weather_code ?? [];
  const uv = hourly.uv_index ?? [];

  const now = getCurrentLocationTime(current.time, weather);
  const today = getLocationLocalDate(now ?? times[0]);

  let remaining: number[] = [];
  for (let index = 0; index < times.length; index += 1) {
    const time = times[index];
    if (!time) continue;
    if (today && getLocationLocalDate(time) !== today) continue;
    if (now && compareLocationTimes(time, now) < 0) continue;
    remaining.push(index);
  }
  if (!remaining.length && times.length) {
    remaining = times.map((_, index) => index);
  }

  const currentlyRaining = isNumber(current.precipitation) && current.precipitation > 0;
  const currentCode = current.weather_code;
  const hasHourly = remaining.length > 0;

  if (hasHourly) {
    let rainyHours = 0;
    let sunnyHours = 0;
    let daylightHours = 0;
    let maxProbability = -1;
    for (const index of remaining) {
      const probability = probabilities[index];
      const amount = amounts[index];
      const code = codes[index];
      const uvValue = uv[index];
      const rainy = (isNumber(probability) && probability >= DAY_CUE_THRESHOLDS.rainProbability)
        || (isNumber(amount) && amount >= DAY_CUE_THRESHOLDS.rainAmountMm)
        || (isNumber(code) && STORM_CODES.has(code));
      if (rainy) rainyHours += 1;
      if (isNumber(probability) && probability > maxProbability) maxProbability = probability;
      const daylight = !isNumber(uvValue) || uvValue > 0;
      if (daylight) {
        daylightHours += 1;
        if (isNumber(code) && CLEAR_CODES.has(code)) sunnyHours += 1;
      }
    }

    const currentBright = isNumber(currentCode) && CLEAR_CODES.has(currentCode)
      && (!isNumber(current.cloud_cover) || current.cloud_cover < DAY_CUE_THRESHOLDS.cloudCoverSunMax)
      && (!isNumber(current.uv_index) || current.uv_index >= DAY_CUE_THRESHOLDS.uvSun);
    const meaningfulRain = currentlyRaining || rainyHours > 0;
    const meaningfulSun = sunnyHours > 0 || currentBright;

    const rainDominant = maxProbability >= DAY_CUE_THRESHOLDS.rainDominantMaxProbability
      || (rainyHours >= DAY_CUE_THRESHOLDS.dominantMinHours
        && rainyHours / remaining.length >= DAY_CUE_THRESHOLDS.dominantRatio);
    const sunDominant = sunnyHours >= DAY_CUE_THRESHOLDS.dominantMinHours
      && daylightHours > 0
      && sunnyHours / daylightHours >= DAY_CUE_THRESHOLDS.dominantRatio;

    // Raining right now always warrants the umbrella; a bright remainder adds
    // the sunglasses so the pair is shown.
    if (currentlyRaining) {
      return meaningfulSun
        ? { cue: 'mixed', emojis: ['😎', '☔'], labelKey: 'dayCue.mixed' }
        : { cue: 'rain', emojis: ['☔'], labelKey: 'dayCue.rain' };
    }
    if (rainDominant && !sunDominant) return { cue: 'rain', emojis: ['☔'], labelKey: 'dayCue.rain' };
    if (sunDominant && !rainDominant) return { cue: 'sun', emojis: ['😎'], labelKey: 'dayCue.sun' };
    if (meaningfulSun && meaningfulRain) return { cue: 'mixed', emojis: ['😎', '☔'], labelKey: 'dayCue.mixed' };
    if (meaningfulRain) return { cue: 'rain', emojis: ['☔'], labelKey: 'dayCue.rain' };
    if (meaningfulSun) return { cue: 'sun', emojis: ['😎'], labelKey: 'dayCue.sun' };
    return neutral(neutralKindFor(currentCode, 'cloud'));
  }

  // No usable hourly forecast: fall back to current conditions + daily summary.
  const dailyProbability = daily.precipitation_probability_max?.[0];
  const dailyAmount = daily.precipitation_sum?.[0];
  const dailyUvMax = daily.uv_index_max?.[0];
  const dailyCode = daily.weather_code?.[0];
  const rainFallback = currentlyRaining
    || (isNumber(dailyProbability) && dailyProbability >= DAY_CUE_THRESHOLDS.rainProbability)
    || (isNumber(dailyAmount) && dailyAmount >= 1);
  const sunFallback = (isNumber(currentCode) && CLEAR_CODES.has(currentCode)
      && (!isNumber(current.cloud_cover) || current.cloud_cover < DAY_CUE_THRESHOLDS.cloudCoverSunMax)
      && (!isNumber(current.uv_index) || current.uv_index >= DAY_CUE_THRESHOLDS.uvSun))
    || (isNumber(dailyUvMax) && dailyUvMax >= DAY_CUE_THRESHOLDS.uvSun
      && isNumber(dailyCode) && CLEAR_CODES.has(dailyCode));

  if (rainFallback && sunFallback) return { cue: 'mixed', emojis: ['😎', '☔'], labelKey: 'dayCue.mixed' };
  if (rainFallback) return { cue: 'rain', emojis: ['☔'], labelKey: 'dayCue.rain' };
  if (sunFallback) return { cue: 'sun', emojis: ['😎'], labelKey: 'dayCue.sun' };
  return neutral(neutralKindFor(currentCode, 'cloud'));
}
