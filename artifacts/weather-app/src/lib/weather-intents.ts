import {
  airLevel,
  compareLocationTimes,
  displayTemp,
  formatLocationTime,
  getCurrentLocationTime,
  getLocationLocalDate,
  getSunProtectionWindow,
  uvLevel,
  uvValue,
  weatherCopy,
  type Unit,
  type WeatherPayload,
} from './weather';
import { getWeatherAlerts } from './weather-alerts';
import { resolveLocale, translate, type Translate, type TranslationKey } from './i18n';

/*
 * Daymark agent-compatible weather intent layer (localized).
 *
 * Pipeline (adapters intentionally not implemented yet):
 *
 *   Open-Meteo -> lib/weather.ts -> lib/weather-intents.ts
 *     -> DaymarkIntentResponse -> adapter
 *     -> browser voice / Siri / Alexa / Android / future agent
 *
 * Intent IDs are language-independent and stable. Only user-facing text is
 * translated, via the `locale` in IntentContext (browser/device locale by
 * default at the call site). This module stays pure: no React, DOM, speech,
 * network, storage or logging.
 */

export const DAYMARK_INTENTS = {
  today: 'daymark.today',
  current: 'daymark.current',
  rain: 'daymark.rain',
  uv: 'daymark.uv',
  airQuality: 'daymark.air_quality',
  alerts: 'daymark.alerts',
  hours: 'daymark.hours',
  tomorrow: 'daymark.tomorrow',
} as const;

export type DaymarkIntentId = (typeof DAYMARK_INTENTS)[keyof typeof DAYMARK_INTENTS];

export type IntentPriority = 'low' | 'normal' | 'high';

export type IntentData = string | number | boolean | null | IntentData[] | { [key: string]: IntentData };

export type DaymarkIntentResponse = {
  intent: DaymarkIntentId;
  title: string;
  spokenText: string;
  displayText: string;
  priority: IntentPriority;
  data?: { [key: string]: IntentData };
};

export type IntentContext = {
  locationName?: string | null;
  localTime?: string | null;
  unit?: Unit;
  locale?: string | string[] | null;
};

const DEFAULT_UNIT: Unit = 'celsius';

function translator(context: IntentContext): { t: Translate; locale: ReturnType<typeof resolveLocale> } {
  const locale = resolveLocale(context.locale);
  return { locale, t: (key: TranslationKey, params) => translate(locale, key, params) };
}

function convertTemperature(value: number | null | undefined, unit: Unit): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const converted = unit === 'fahrenheit' ? (value * 9) / 5 + 32 : value;
  return Math.round(converted);
}

function spokenTemperature(value: number | null | undefined, unit: Unit): string | null {
  const converted = convertTemperature(value, unit);
  return converted == null ? null : `${converted}`;
}

function clockLabel(value: string | null | undefined, context: IntentContext): string | null {
  return value ? formatLocationTime(value, resolveLocale(context.locale)) : null;
}

function unavailableResponse(
  intent: DaymarkIntentId,
  title: string,
  spokenText: string,
  displayText: string,
): DaymarkIntentResponse {
  return { intent, title, spokenText, displayText, priority: 'low', data: { available: false } };
}

function isWetCode(code: number | null | undefined): boolean {
  return code != null && code >= 51;
}

/* Translation key for the adjective form: "rainy", not "looks rain". */
function conditionAdjectiveKey(code: number | null | undefined): TranslationKey | null {
  if (code == null) return null;
  if (code === 0) return 'condition.adjective.clear';
  if (code === 1 || code === 2) return 'condition.adjective.mostlyClear';
  if (code === 3) return 'condition.adjective.overcast';
  if (code === 45 || code === 48) return 'condition.adjective.misty';
  if (code >= 51 && code <= 57) return 'condition.adjective.drizzly';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'condition.adjective.rainy';
  if (code >= 71 && code <= 77) return 'condition.adjective.snowy';
  if (code === 85 || code === 86) return 'condition.adjective.snowy';
  if (code >= 95) return 'condition.adjective.stormy';
  return 'condition.adjective.changeable';
}

export function getCurrentConditions(weather: WeatherPayload, context: IntentContext = {}): DaymarkIntentResponse {
  const { t, locale } = translator(context);
  const unit = context.unit ?? DEFAULT_UNIT;
  const place = context.locationName?.trim() ?? '';
  const current = weather.current ?? {};
  const temperature = convertTemperature(current.temperature_2m, unit);
  if (temperature == null) {
    return unavailableResponse(
      DAYMARK_INTENTS.current,
      t('intent.title.current'),
      place ? t('intent.current.unavailableFor', { place }) : t('intent.current.unavailable'),
      t('intent.current.unavailable'),
    );
  }

  const feels = convertTemperature(current.apparent_temperature, unit);
  const code = current.weather_code;
  const condition = code == null ? null : weatherCopy(code, locale);
  const adjectiveKey = conditionAdjectiveKey(code);
  const adjective = adjectiveKey ? t(adjectiveKey) : null;
  const where = place ? t('intent.place', { place }) : '';
  const hasFeels = feels != null && feels !== temperature;
  let spoken: string;
  if (adjective && hasFeels) spoken = t('intent.current.conditionFeels', { temp: temperature, place: where, condition: adjective, feels });
  else if (adjective) spoken = t('intent.current.condition', { temp: temperature, place: where, condition: adjective });
  else if (hasFeels) spoken = t('intent.current.feels', { temp: temperature, place: where, feels });
  else spoken = t('intent.current.base', { temp: temperature, place: where });
  if (current.precipitation != null && current.precipitation > 0) spoken += t('intent.current.raining');

  const displayParts = [t('intent.current.displayCondition', { temp: displayTemp(current.temperature_2m, unit), condition: condition ?? '—' })];
  if (hasFeels) displayParts.push(`${t('current.feelsLike')} ${displayTemp(current.apparent_temperature, unit)}`);

  return {
    intent: DAYMARK_INTENTS.current,
    title: t('intent.title.current'),
    spokenText: spoken,
    displayText: displayParts.join(' · '),
    priority: 'normal',
    data: {
      available: true,
      temperature,
      feelsLike: feels,
      unit,
      condition: condition ?? null,
      weatherCode: code ?? null,
      humidity: current.relative_humidity_2m ?? null,
      precipitationMm: current.precipitation ?? null,
    },
  };
}

export function getRainSummary(weather: WeatherPayload, context: IntentContext = {}): DaymarkIntentResponse {
  const { t } = translator(context);
  const hourly = weather.hourly ?? {};
  const times = hourly.time ?? [];
  const probabilities = hourly.precipitation_probability ?? [];
  const currentTime = getCurrentLocationTime(weather.current?.time, weather) ?? context.localTime ?? times[0] ?? null;
  const today = getLocationLocalDate(currentTime);
  const rainingNow = (weather.current?.precipitation ?? 0) > 0;

  let maxProbability = -1;
  let peakTime: string | null = null;
  let firstLikelyTime: string | null = null;
  let known = 0;
  for (let index = 0; index < times.length; index += 1) {
    const time = times[index];
    const probability = probabilities[index];
    if (!time || probability == null || Number.isNaN(probability)) continue;
    if (today && getLocationLocalDate(time) !== today) continue;
    if (currentTime && compareLocationTimes(time, currentTime) < 0) continue;
    known += 1;
    if (probability > maxProbability) {
      maxProbability = probability;
      peakTime = time;
    }
    if (firstLikelyTime == null && probability >= 40) firstLikelyTime = time;
  }

  if (!known) {
    return unavailableResponse(
      DAYMARK_INTENTS.rain,
      t('intent.title.rain'),
      t('intent.rain.unavailable'),
      t('intent.rain.dataUnavailable'),
    );
  }

  const peakLabel = clockLabel(peakTime, context);
  const roundedMax = Math.round(maxProbability);
  const data = {
    available: true,
    rainingNow,
    expected: maxProbability >= 20,
    maxProbability: roundedMax,
    peakTime: peakTime ?? null,
    likelyTime: firstLikelyTime ?? null,
  };

  if (rainingNow) {
    return {
      intent: DAYMARK_INTENTS.rain,
      title: t('intent.title.rain'),
      spokenText: maxProbability >= 40 && peakLabel
        ? t('intent.rain.rainingNowMore', { time: peakLabel })
        : t('intent.rain.rainingNow'),
      displayText: peakLabel
        ? `${t('intent.rain.displayRainingNow')} · ${t('intent.rain.displayPeak', { percent: roundedMax, time: peakLabel })}`
        : t('intent.rain.displayRainingNow'),
      priority: maxProbability >= 70 ? 'high' : 'normal',
      data,
    };
  }

  if (maxProbability >= 40) {
    return {
      intent: DAYMARK_INTENTS.rain,
      title: t('intent.title.rain'),
      spokenText: peakLabel
        ? t('intent.rain.likely', { time: peakLabel, percent: roundedMax })
        : t('intent.rain.likelyNoTime', { percent: roundedMax }),
      displayText: peakLabel
        ? t('intent.rain.displayLikely', { time: peakLabel, percent: roundedMax })
        : t('intent.rain.displayLikelyNoTime', { percent: roundedMax }),
      priority: maxProbability >= 70 ? 'high' : 'normal',
      data,
    };
  }

  if (maxProbability >= 20) {
    return {
      intent: DAYMARK_INTENTS.rain,
      title: t('intent.title.rain'),
      spokenText: peakLabel
        ? t('intent.rain.possible', { time: peakLabel, percent: roundedMax })
        : t('intent.rain.possibleNoTime', { percent: roundedMax }),
      displayText: peakLabel
        ? t('intent.rain.displayPossible', { time: peakLabel, percent: roundedMax })
        : t('intent.rain.displayPossibleNoTime', { percent: roundedMax }),
      priority: 'normal',
      data,
    };
  }

  return {
    intent: DAYMARK_INTENTS.rain,
    title: t('intent.title.rain'),
    spokenText: t('intent.rain.none'),
    displayText: t('intent.rain.displayNone'),
    priority: 'low',
    data,
  };
}

export function getUVSummary(weather: WeatherPayload, context: IntentContext = {}): DaymarkIntentResponse {
  const { t, locale } = translator(context);
  const currentUv = weather.current?.uv_index;
  const level = uvLevel(currentUv, locale);
  const protection = getSunProtectionWindow(weather.hourly?.time, weather.hourly?.uv_index, weather.current?.time);
  const currentTime = getCurrentLocationTime(weather.current?.time, weather) ?? context.localTime ?? null;
  const uvClause = currentUv == null || Number.isNaN(currentUv)
    ? ''
    : t('intent.uv.indexClause', { value: uvValue(currentUv, locale), level: level.label.toLowerCase() });

  if (protection.status === 'unavailable') {
    return {
      intent: DAYMARK_INTENTS.uv,
      title: t('intent.title.uv'),
      spokenText: uvClause ? `${uvClause}${t('intent.uv.timingUnavailable')}` : t('intent.uv.unavailable'),
      displayText: t('intent.uv.displayUnavailable'),
      priority: 'low',
      data: { available: false, currentUv: currentUv ?? null, level: level.label, status: 'unavailable', window: null },
    };
  }

  if (protection.status === 'window') {
    const { start, end, peak } = protection.window;
    const startLabel = formatLocationTime(start, locale);
    const endLabel = formatLocationTime(end, locale);
    const active = currentTime != null
      && compareLocationTimes(currentTime, start) >= 0
      && compareLocationTimes(currentTime, end) < 0;
    const past = currentTime != null && compareLocationTimes(currentTime, end) >= 0;
    const spoken = active
      ? `${uvClause}${t('intent.uv.until', { end: endLabel })}`
      : past
        ? `${uvClause}${t('intent.uv.passed', { start: startLabel, end: endLabel })}`
        : `${uvClause}${t('intent.uv.between', { start: startLabel, end: endLabel })}`;
    const display = active
      ? t('intent.uv.displayUntil', { end: endLabel })
      : past
        ? t('intent.uv.displayPassed', { start: startLabel, end: endLabel })
        : t('intent.uv.displayBetween', { start: startLabel, end: endLabel });
    return {
      intent: DAYMARK_INTENTS.uv,
      title: t('intent.title.uv'),
      spokenText: spoken,
      displayText: display,
      priority: peak >= 8 ? 'high' : 'normal',
      data: {
        available: true,
        currentUv: currentUv ?? null,
        level: level.label,
        status: active ? 'active' : past ? 'past' : 'future',
        window: { start, end, peak },
      },
    };
  }

  return {
    intent: DAYMARK_INTENTS.uv,
    title: t('intent.title.uv'),
    spokenText: `${uvClause}${t('intent.uv.none')}`,
    displayText: t('intent.uv.displayNone'),
    priority: 'low',
    data: { available: true, currentUv: currentUv ?? null, level: level.label, status: 'none', window: null },
  };
}

export function getAirQualitySummary(weather: WeatherPayload, context: IntentContext = {}): DaymarkIntentResponse {
  const { t, locale } = translator(context);
  const aqi = weather.airQuality?.current?.us_aqi;
  if (aqi == null || Number.isNaN(aqi)) {
    return unavailableResponse(
      DAYMARK_INTENTS.airQuality,
      t('intent.title.air'),
      t('intent.air.unavailable'),
      t('intent.air.displayUnavailable'),
    );
  }
  const level = airLevel(aqi, locale);
  const rounded = Math.round(aqi);
  return {
    intent: DAYMARK_INTENTS.airQuality,
    title: t('intent.title.air'),
    spokenText: `${t('intent.air.summary', { level: level.label.toLowerCase(), value: rounded })}${level.guidance}`,
    displayText: t('intent.air.display', { value: rounded, level: level.label }),
    priority: aqi > 150 ? 'high' : 'normal',
    data: {
      available: true,
      aqi: rounded,
      level: level.label,
      guidance: level.guidance,
      pollutants: {
        pm2_5: weather.airQuality?.current?.pm2_5 ?? null,
        pm10: weather.airQuality?.current?.pm10 ?? null,
        nitrogen_dioxide: weather.airQuality?.current?.nitrogen_dioxide ?? null,
        ozone: weather.airQuality?.current?.ozone ?? null,
      },
    },
  };
}

export function getAlertsSummary(weather: WeatherPayload, context: IntentContext = {}): DaymarkIntentResponse {
  const { t, locale } = translator(context);
  const alerts = getWeatherAlerts(weather, { unit: context.unit, locale });
  if (!alerts.length) {
    return {
      intent: DAYMARK_INTENTS.alerts,
      title: t('intent.title.alerts'),
      spokenText: t('intent.alerts.none'),
      displayText: t('intent.alerts.displayNone'),
      priority: 'low',
      data: { available: true, count: 0, alerts: [] },
    };
  }

  const primary = alerts[0];
  const extra = alerts.length > 1 ? t('intent.alerts.more', { count: alerts.length - 1 }) : '';
  const severityLabel = t(primary.severity === 'severe' ? 'alerts.severity.severe' : primary.severity === 'high' ? 'alerts.severity.high' : 'alerts.severity.moderate');
  return {
    intent: DAYMARK_INTENTS.alerts,
    title: t('intent.title.alerts'),
    spokenText: `${primary.title}. ${primary.summary}${extra}`,
    displayText: `${severityLabel}: ${primary.title}`,
    priority: primary.severity === 'moderate' ? 'normal' : 'high',
    data: {
      available: true,
      count: alerts.length,
      alerts: alerts.map((alert) => ({
        id: alert.id,
        hazard: alert.hazard,
        severity: alert.severity,
        title: alert.title,
        summary: alert.summary,
        startTime: alert.startTime ?? null,
        endTime: alert.endTime ?? null,
      })),
    },
  };
}

export function getHourlySummary(weather: WeatherPayload, context: IntentContext = {}): DaymarkIntentResponse {
  const { t, locale } = translator(context);
  const unit = context.unit ?? DEFAULT_UNIT;
  const hourly = weather.hourly ?? {};
  const times = hourly.time ?? [];
  const currentTime = getCurrentLocationTime(weather.current?.time, weather) ?? context.localTime ?? null;
  const startIndex = currentTime
    ? Math.max(0, times.findIndex((time) => compareLocationTimes(time, currentTime) >= 0))
    : 0;
  const indexes = Array.from(
    { length: Math.min(6, Math.max(0, times.length - startIndex)) },
    (_, offset) => startIndex + offset,
  );
  if (!indexes.length) {
    return unavailableResponse(
      DAYMARK_INTENTS.hours,
      t('intent.title.hours'),
      t('intent.hours.unavailable'),
      t('intent.hours.displayUnavailable'),
    );
  }

  const entries = indexes.map((index) => ({
    time: times[index] ?? null,
    temperature: convertTemperature(hourly.temperature_2m?.[index], unit),
    precipitationProbability: hourly.precipitation_probability?.[index] ?? null,
    weatherCode: hourly.weather_code?.[index] ?? null,
    uvIndex: hourly.uv_index?.[index] ?? null,
  }));

  const knownTemperatures = entries
    .map((entry) => entry.temperature)
    .filter((value): value is number => value != null);
  const firstTemperature = hourly.temperature_2m?.[indexes[0]];
  const lastTemperature = hourly.temperature_2m?.[indexes[indexes.length - 1]];
  const deltaC = firstTemperature != null && lastTemperature != null ? lastTemperature - firstTemperature : null;
  const minTemperature = knownTemperatures.length ? Math.min(...knownTemperatures) : null;
  const maxTemperature = knownTemperatures.length ? Math.max(...knownTemperatures) : null;

  const firstSpoken = spokenTemperature(indexes.length ? hourly.temperature_2m?.[indexes[0]] : null, unit);
  const lastSpoken = spokenTemperature(indexes.length ? hourly.temperature_2m?.[indexes[indexes.length - 1]] : null, unit);
  let trendClause: string | null = null;
  if (firstSpoken && lastSpoken && firstSpoken !== lastSpoken) {
    if (deltaC != null && deltaC >= 2) trendClause = t('intent.hours.trendWarming', { first: firstSpoken, last: lastSpoken });
    else if (deltaC != null && deltaC <= -2) trendClause = t('intent.hours.trendCooling', { first: firstSpoken, last: lastSpoken });
    else trendClause = t('intent.hours.trendSteady', { first: firstSpoken });
  } else if (firstSpoken) {
    trendClause = t('intent.hours.trendAround', { first: firstSpoken });
  }

  let peakProbability = -1;
  let peakProbabilityTime: string | null = null;
  let peakUv = -1;
  let peakUvTime: string | null = null;
  let wetArrivalTime: string | null = null;
  let wetArrivalCode: number | null = null;
  entries.forEach((entry, offset) => {
    if (entry.precipitationProbability != null && entry.precipitationProbability > peakProbability) {
      peakProbability = entry.precipitationProbability;
      peakProbabilityTime = entry.time;
    }
    if (entry.uvIndex != null && entry.uvIndex > peakUv) {
      peakUv = entry.uvIndex;
      peakUvTime = entry.time;
    }
    if (offset > 0 && wetArrivalTime == null && isWetCode(entry.weatherCode)) {
      wetArrivalTime = entry.time;
      wetArrivalCode = entry.weatherCode;
    }
  });

  const spokenParts: string[] = [];
  if (trendClause) spokenParts.push(t('intent.hours.range', { count: indexes.length, trend: trendClause }));
  if (peakProbability >= 40 && peakProbabilityTime) {
    spokenParts.push(t('intent.hours.rainLikely', { time: formatLocationTime(peakProbabilityTime, locale) }));
  } else if (peakProbability >= 20 && peakProbabilityTime) {
    spokenParts.push(t('intent.hours.rainPeak', { percent: Math.round(peakProbability), time: formatLocationTime(peakProbabilityTime, locale) }));
  } else if (wetArrivalTime && wetArrivalCode != null) {
    spokenParts.push(t('intent.hours.wetArrival', { condition: weatherCopy(wetArrivalCode, locale), time: formatLocationTime(wetArrivalTime, locale) }));
  }
  if (peakUv >= 3 && peakUvTime) {
    spokenParts.push(t('intent.hours.uv', { value: uvValue(peakUv, locale), time: formatLocationTime(peakUvTime, locale) }));
  }

  const displayParts: string[] = [];
  if (knownTemperatures.length) {
    displayParts.push(`${displayTemp(firstTemperature, unit)}→${displayTemp(lastTemperature, unit)}`);
  }
  if (peakProbability >= 20 && peakProbabilityTime) {
    displayParts.push(`${Math.round(peakProbability)}% · ${formatLocationTime(peakProbabilityTime, locale)}`);
  } else if (wetArrivalTime && wetArrivalCode != null) {
    displayParts.push(`${weatherCopy(wetArrivalCode, locale).toLowerCase()} · ${formatLocationTime(wetArrivalTime, locale)}`);
  }
  if (peakUv >= 3 && peakUvTime) {
    displayParts.push(`UV ${uvValue(peakUv, locale)} · ${formatLocationTime(peakUvTime, locale)}`);
  }

  return {
    intent: DAYMARK_INTENTS.hours,
    title: t('intent.title.hours'),
    spokenText: spokenParts.length ? spokenParts.join(' ') : t('intent.hours.steady'),
    displayText: displayParts.length ? displayParts.join(' · ') : t('intent.hours.displayLittleChange'),
    priority: peakProbability >= 70 ? 'high' : 'normal',
    data: {
      available: true,
      hours: entries,
      trend: deltaC == null ? 'steady' : deltaC >= 2 ? 'warming' : deltaC <= -2 ? 'cooling' : 'steady',
      minTemperature,
      maxTemperature,
      peakRainProbability: peakProbability >= 0 ? Math.round(peakProbability) : null,
      peakRainTime: peakProbabilityTime,
      peakUv: peakUv >= 0 ? peakUv : null,
      peakUvTime,
    },
  };
}

export function getTomorrowSummary(weather: WeatherPayload, context: IntentContext = {}): DaymarkIntentResponse {
  const { t, locale } = translator(context);
  const unit = context.unit ?? DEFAULT_UNIT;
  const daily = weather.daily ?? {};
  const date = daily.time?.[1];
  if (!date) {
    return unavailableResponse(
      DAYMARK_INTENTS.tomorrow,
      t('intent.title.tomorrow'),
      t('intent.tomorrow.unavailable'),
      t('intent.tomorrow.displayUnavailable'),
    );
  }

  const code = daily.weather_code?.[1];
  const condition = code == null ? null : weatherCopy(code, locale);
  const high = daily.temperature_2m_max?.[1];
  const low = daily.temperature_2m_min?.[1];
  const rain = daily.precipitation_probability_max?.[1];
  const highSpoken = spokenTemperature(high, unit);
  const lowSpoken = spokenTemperature(low, unit);
  const adjectiveKey = conditionAdjectiveKey(code);

  let spoken = t('intent.tomorrow.base', { condition: adjectiveKey ? t(adjectiveKey) : t('condition.changeable') });
  if (highSpoken && lowSpoken) spoken += t('intent.tomorrow.withHighLow', { high: highSpoken, low: lowSpoken });
  else if (highSpoken) spoken += t('intent.tomorrow.withHigh', { high: highSpoken });
  else if (lowSpoken) spoken += t('intent.tomorrow.withLow', { low: lowSpoken });
  spoken += '.';
  if (rain != null && !Number.isNaN(rain)) {
    const roundedRain = Math.round(rain);
    if (roundedRain >= 40) spoken += t('intent.tomorrow.rainLikely', { percent: roundedRain });
    else if (roundedRain >= 20) spoken += t('intent.tomorrow.rainChance', { percent: roundedRain });
  }

  const displayParts = [condition ?? '—'];
  if (high != null && low != null) displayParts.push(`${displayTemp(high, unit)} / ${displayTemp(low, unit)}`);
  if (rain != null && !Number.isNaN(rain)) displayParts.push(`${Math.round(rain)}%`);

  return {
    intent: DAYMARK_INTENTS.tomorrow,
    title: t('intent.title.tomorrow'),
    spokenText: spoken,
    displayText: displayParts.join(' · '),
    priority: rain != null && rain >= 70 ? 'high' : 'normal',
    data: {
      available: true,
      date,
      condition: condition ?? null,
      weatherCode: code ?? null,
      high: high ?? null,
      low: low ?? null,
      unit,
      precipitationProbabilityMax: rain ?? null,
    },
  };
}

/* Today's briefing assembles the intent layer; risk comes right after current conditions. */
export function getTodayBriefing(weather: WeatherPayload, context: IntentContext = {}): DaymarkIntentResponse {
  const { t } = translator(context);
  const current = getCurrentConditions(weather, context);
  const alerts = getAlertsSummary(weather, context);
  const rain = getRainSummary(weather, context);
  const uv = getUVSummary(weather, context);
  const air = getAirQualitySummary(weather, context);

  const alertCount = typeof alerts.data?.count === 'number' ? alerts.data.count : 0;
  const spokenParts = [current.spokenText];
  if (alertCount > 0) spokenParts.push(alerts.spokenText);
  spokenParts.push(rain.spokenText, uv.spokenText);
  if (air.data?.available === true) spokenParts.push(air.spokenText);

  const priorities = [current.priority, alerts.priority, rain.priority, uv.priority, air.priority];
  const priority: IntentPriority = priorities.includes('high') ? 'high' : 'normal';
  const displayParts = [current.displayText];
  if (alertCount > 0) displayParts.push(alerts.displayText);
  displayParts.push(rain.displayText, uv.displayText, air.displayText);

  return {
    intent: DAYMARK_INTENTS.today,
    title: t('intent.title.today'),
    spokenText: spokenParts.join(' '),
    displayText: displayParts.join(' · '),
    priority,
    data: {
      current: current.data ?? null,
      alerts: alerts.data ?? null,
      rain: rain.data ?? null,
      uv: uv.data ?? null,
      airQuality: air.data ?? null,
    },
  };
}

export function getIntentResponse(
  intent: DaymarkIntentId,
  weather: WeatherPayload,
  context: IntentContext = {},
): DaymarkIntentResponse {
  switch (intent) {
    case DAYMARK_INTENTS.today:
      return getTodayBriefing(weather, context);
    case DAYMARK_INTENTS.current:
      return getCurrentConditions(weather, context);
    case DAYMARK_INTENTS.rain:
      return getRainSummary(weather, context);
    case DAYMARK_INTENTS.uv:
      return getUVSummary(weather, context);
    case DAYMARK_INTENTS.airQuality:
      return getAirQualitySummary(weather, context);
    case DAYMARK_INTENTS.alerts:
      return getAlertsSummary(weather, context);
    case DAYMARK_INTENTS.hours:
      return getHourlySummary(weather, context);
    case DAYMARK_INTENTS.tomorrow:
      return getTomorrowSummary(weather, context);
  }
}

/*
 * Deterministic command resolver for exact tokens and future deep links
 * (`?intent=today`). Language-independent.
 */
export const INTENT_COMMANDS: Record<string, DaymarkIntentId> = {
  today: DAYMARK_INTENTS.today,
  briefing: DAYMARK_INTENTS.today,
  current: DAYMARK_INTENTS.current,
  now: DAYMARK_INTENTS.current,
  rain: DAYMARK_INTENTS.rain,
  uv: DAYMARK_INTENTS.uv,
  'air-quality': DAYMARK_INTENTS.airQuality,
  air: DAYMARK_INTENTS.airQuality,
  aqi: DAYMARK_INTENTS.airQuality,
  alerts: DAYMARK_INTENTS.alerts,
  warning: DAYMARK_INTENTS.alerts,
  warnings: DAYMARK_INTENTS.alerts,
  hours: DAYMARK_INTENTS.hours,
  hourly: DAYMARK_INTENTS.hours,
  tomorrow: DAYMARK_INTENTS.tomorrow,
};

export const INTENT_QUERY_VALUES: Record<DaymarkIntentId, string> = {
  [DAYMARK_INTENTS.today]: 'today',
  [DAYMARK_INTENTS.current]: 'current',
  [DAYMARK_INTENTS.rain]: 'rain',
  [DAYMARK_INTENTS.uv]: 'uv',
  [DAYMARK_INTENTS.airQuality]: 'air-quality',
  [DAYMARK_INTENTS.alerts]: 'alerts',
  [DAYMARK_INTENTS.hours]: 'hours',
  [DAYMARK_INTENTS.tomorrow]: 'tomorrow',
};

export function resolveIntentCommand(command: string | null | undefined): DaymarkIntentId | null {
  if (!command) return null;
  const normalized = command.trim().toLowerCase().replace(/[_\s]+/g, '-');
  return INTENT_COMMANDS[normalized] ?? null;
}

export function getIntentQueryValue(intent: DaymarkIntentId): string {
  return INTENT_QUERY_VALUES[intent];
}

export const UNKNOWN_INTENT_MESSAGE =
  "I can help with today's weather, rain, UV, air quality, the next few hours, or tomorrow.";

/*
 * Deterministic transcript understanding for "Ask Daymark".
 *
 * Diacritics are folded to ASCII first ("qualité" → "qualite", "mañana" →
 * "manana") so the same keyword rules work across English, French and Spanish.
 * Rule-based only: no LLM, no network, no storage.
 */
export function normalizeTranscript(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TRANSCRIPT_RULES: ReadonlyArray<{ intent: DaymarkIntentId; matches: RegExp }> = [
  { intent: DAYMARK_INTENTS.tomorrow, matches: /\btomorrow\b|\bdemain\b|\bmanana\b/ },
  { intent: DAYMARK_INTENTS.alerts, matches: /\balerts?\b|\bwarnings?\b|\bsevere weather\b|\bdangerous\b|\bdanger\b|\balerte?s?\b|\bdangereux?\b|\balertas?\b|\bpeligro\b|\bpeligroso\b/ },
  { intent: DAYMARK_INTENTS.rain, matches: /\brain(?:ing|y|s)?\b|\bumbrella\b|\bshowers?\b|\bdrizzle\b|\bstorm(?:y|s)?\b|\bpluie\b|\bpleuvoir\b|\bparapluie\b|\baverses?\b|\blluvia\b|\bllover\b|\bparaguas\b|\bchubascos?\b/ },
  { intent: DAYMARK_INTENTS.uv, matches: /\buv\b|\bsun protection\b|\bsunscreen\b|\bsun cream\b|\bsunblock\b|\bsunburn\b|\bburn\b|\bprotection solaire\b|\bcreme solaire\b|\bprotector solar\b|\bcrema solar\b|\bquemadura\b/ },
  { intent: DAYMARK_INTENTS.airQuality, matches: /\bair quality\b|\baqi\b|\bpollution\b|\bpollutants?\b|\bsmog\b|\bair\b|\bqualite de l'?air\b|\bcalidad del aire\b|\bcontaminacion\b/ },
  { intent: DAYMARK_INTENTS.hours, matches: /\bnext few hours\b|\bnext hours\b|\blater\b|\bthis afternoon\b|\bthis evening\b|\btonight\b|\bnext few\b|\bprochaines heures\b|\bce soir\b|\bcet apres midi\b|\bproximas horas\b|\besta tarde\b|\besta noche\b/ },
  { intent: DAYMARK_INTENTS.current, matches: /\bnow\b|\bright now\b|\bcurrently\b|\btemperature\b|\bhow (?:hot|cold|warm)\b|\bcurrent conditions?\b|\bwhat'?s it like\b|\bwhat is it like\b|\bmaintenant\b|\btemperature\b|\bquel temps\b|\bahora\b|\btemperatura\b|\bque tiempo\b/ },
  { intent: DAYMARK_INTENTS.today, matches: /\btoday\b|\bweather\b|\bforecast\b|\bbriefing\b|\baujourd'?hui\b|\bmeteo\b|\bhoy\b|\btiempo\b|\bpronostico\b/ },
];

export function resolveIntentTranscript(transcript: string | null | undefined): DaymarkIntentId | null {
  if (!transcript) return null;
  const normalized = normalizeTranscript(transcript);
  if (!normalized) return null;
  for (const rule of TRANSCRIPT_RULES) {
    if (rule.matches.test(normalized)) return rule.intent;
  }
  return null;
}
