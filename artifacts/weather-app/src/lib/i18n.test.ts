import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SPEECH_LANGS,
  detectLocale,
  formatDecimal,
  formatPercent,
  readStoredLocale,
  resolveLocale,
  storeLocale,
  translate,
} from './i18n';
import en from '@/locales/en';
import fr from '@/locales/fr';
import es from '@/locales/es';
import { airLevel, getSunglassesAdvice, getUmbrellaAdvice, uvLevel, weatherCopy, type WeatherPayload } from './weather';
import { getCurrentConditions, getIntentResponse, getTomorrowSummary, resolveIntentTranscript } from './weather-intents';
import { getWeatherAlerts } from './weather-alerts';

afterEach(() => vi.unstubAllGlobals());

describe('locale detection and fallback', () => {
  it('maps supported browser locales and falls back to English', () => {
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('en-GB')).toBe('en');
    expect(resolveLocale('fr-FR')).toBe('fr');
    expect(resolveLocale('es-419')).toBe('es');
    expect(resolveLocale('de-DE')).toBe('en');
    expect(resolveLocale('')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(['fr-CA'])).toBe('fr');
  });

  it('detects from the device language by default', () => {
    expect(detectLocale('fr-CA')).toBe('fr');
    expect(detectLocale('pt-BR')).toBe('en');
  });

  it('keeps the dictionaries complete relative to English', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it('documents speech language tags', () => {
    expect(SPEECH_LANGS).toEqual({ en: 'en-GB', fr: 'fr-FR', es: 'es-ES' });
  });
});

describe('language persistence', () => {
  it('stores only the language code under daymark.locale', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem });
    storeLocale('fr');
    expect(setItem).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, 'fr');
    expect(LOCALE_STORAGE_KEY).toBe('daymark.locale');
  });

  it('reads and resolves a stored preference, ignoring unsupported values', () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => 'es-MX'), setItem: vi.fn() });
    expect(readStoredLocale()).toBe('es');
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => 'de'), setItem: vi.fn() });
    expect(readStoredLocale()).toBe('en');
  });

  it('does not throw when storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => { throw new Error('blocked'); }), setItem: vi.fn(() => { throw new Error('blocked'); }) });
    expect(readStoredLocale()).toBeNull();
    expect(() => storeLocale('fr')).not.toThrow();
  });
});

describe('translation and formatting', () => {
  it('interpolates parameters and keeps unknown placeholders', () => {
    expect(translate('fr', 'search.searching')).toBe('Recherche…');
    expect(translate('es', 'search.noResults')).toBe('No se encontraron lugares');
    expect(translate('en', 'current.updated', { time: '3 PM' })).toBe('Updated 3 PM');
    expect(translate('en', 'current.updated')).toContain('{time}');
  });

  it('formats numbers and percentages per locale', () => {
    expect(formatDecimal(6.5, 'fr')).toBe('6,5');
    expect(formatDecimal(6.5, 'en')).toBe('6.5');
    expect(formatPercent(20, 'fr').replace(/[\u202f\u00a0]/g, ' ')).toBe('20 %');
    expect(formatPercent(20, 'en')).toBe('20%');
  });

  it('localizes weather guidance helpers', () => {
    expect(weatherCopy(3, 'fr')).toBe('Couvert');
    expect(weatherCopy(3, 'es')).toBe('Cubierto');
    expect(uvLevel(4, 'fr').label).toBe('Modéré');
    expect(uvLevel(4, 'es').label).toBe('Moderado');
    expect(airLevel(33, 'es').label).toBe('Bueno');
    expect(getUmbrellaAdvice(80, undefined, 'fr').answer).toBe('Oui');
    expect(getUmbrellaAdvice(80, undefined, 'fr').tone).toBe('yes');
    expect(getSunglassesAdvice(6, 20, 'es').answer).toBe('Sí');
  });
});

const WEATHER: WeatherPayload = {
  timezone: 'Europe/London',
  current: { time: '2026-09-07T12:00', temperature_2m: 18.4, apparent_temperature: 17.1, weather_code: 3, precipitation: 0, uv_index: 4 },
  hourly: {
    time: ['2026-09-07T12:00', '2026-09-07T13:00', '2026-09-07T14:00', '2026-09-07T15:00', '2026-09-07T16:00'],
    temperature_2m: [18, 19, 20, 19, 18],
    precipitation_probability: [30, 20, 10, 5, 5],
    weather_code: [3, 2, 1, 1, 2],
    uv_index: [4, 5, 4, 3, 2],
  },
  daily: {
    time: ['2026-09-07', '2026-09-08'],
    weather_code: [3, 61],
    temperature_2m_max: [20, 17],
    temperature_2m_min: [12, 10],
    precipitation_probability_max: [30, 90],
    sunrise: ['2026-09-07T06:30'],
    sunset: ['2026-09-07T19:40'],
    uv_index_max: [5, 3],
  },
  airQuality: { current: { us_aqi: 33 } },
};

describe('localized intent output', () => {
  it('keeps stable intent IDs while translating text', () => {
    const french = getCurrentConditions(WEATHER, { locale: 'fr', locationName: 'Paris' });
    const spanish = getCurrentConditions(WEATHER, { locale: 'es', locationName: 'Madrid' });
    expect(french.intent).toBe('daymark.current');
    expect(french.spokenText).toContain('Il fait');
    expect(french.spokenText).toContain('Paris');
    expect(spanish.spokenText).toContain('Hace');
    expect(spanish.spokenText).toContain('Madrid');
  });

  it('localizes the UV and alert intents', () => {
    const uv = getIntentResponse('daymark.uv', WEATHER, { locale: 'es' });
    expect(uv.title).toBe('Protección solar');
    expect(uv.spokenText).toContain('índice UV');
    const tomorrow = getTomorrowSummary(WEATHER, { locale: 'fr' });
    expect(tomorrow.title).toBe('Demain');
    expect(tomorrow.spokenText).toContain('Demain');
  });

  it('localizes forecast-derived alert titles and disclaimers', () => {
    const windy: WeatherPayload = {
      ...WEATHER,
      hourly: {
        ...WEATHER.hourly!,
        wind_gusts_10m: [15, 15, 15, 15, 110],
      },
    };
    const fr = getWeatherAlerts(windy, { locale: 'fr' })[0];
    expect(fr.title).toBe('Vents forts attendus');
    expect(fr.source).toContain('avertissement officiel');
    const es = getWeatherAlerts(windy, { locale: 'es' })[0];
    expect(es.title).toBe('Se esperan vientos fuertes');
    expect(es.source).toContain('aviso oficial');
  });

  it('resolves French and Spanish Ask Daymark phrases deterministically', () => {
    expect(resolveIntentTranscript('va-t-il pleuvoir')).toBe('daymark.rain');
    expect(resolveIntentTranscript('quel temps fait-il')).toBe('daymark.current');
    expect(resolveIntentTranscript("qualité de l'air")).toBe('daymark.air_quality');
    expect(resolveIntentTranscript('indice UV')).toBe('daymark.uv');
    expect(resolveIntentTranscript('demain')).toBe('daymark.tomorrow');
    expect(resolveIntentTranscript('une alerte est-elle prévue')).toBe('daymark.alerts');
    expect(resolveIntentTranscript('va a llover')).toBe('daymark.rain');
    expect(resolveIntentTranscript('qué tiempo hace')).toBe('daymark.current');
    expect(resolveIntentTranscript('calidad del aire')).toBe('daymark.air_quality');
    expect(resolveIntentTranscript('índice UV')).toBe('daymark.uv');
    expect(resolveIntentTranscript('mañana')).toBe('daymark.tomorrow');
    expect(resolveIntentTranscript('hay alguna alerta')).toBe('daymark.alerts');
  });
});
