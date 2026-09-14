import { useEffect, useMemo, useRef } from 'react';
import { Navigation, Square, Volume2 } from 'lucide-react';
import { displayTemp, formatLocationDate, weatherCopy, type Place, type Unit, type WeatherPayload } from '@/lib/weather';
import { DAYMARK_INTENTS, getIntentResponse } from '@/lib/weather-intents';
import type { DayCueResult } from '@/lib/day-cue';
import { SPEECH_LANGS } from '@/lib/i18n';
import { useDaymarkSpeech } from '@/hooks/use-daymark-speech';
import { useLocale } from '@/hooks/use-locale';
import { AskDaymark } from '@/components/weather/AskDaymark';
import { DayCueHero } from '@/components/weather/DayCueHero';
import { LocationSearch } from '@/components/weather/LocationSearch';

export function CurrentWeather({ place, weather, unit, dayCue, updatedLabel, isLocating, onFindMe, onSelectPlace }: {
  place: Place;
  weather: WeatherPayload;
  unit: Unit;
  dayCue: DayCueResult;
  updatedLabel: string;
  isLocating: boolean;
  onFindMe: () => void;
  onSelectPlace: (place: Place) => void;
}) {
  const { locale, t } = useLocale();
  const current = weather.current ?? {};
  const currentCode = current.weather_code ?? 0;
  const speech = useDaymarkSpeech();
  const stopSpeech = speech.stop;
  const previousLocale = useRef(locale);
  const briefing = useMemo(
    () => getIntentResponse(DAYMARK_INTENTS.today, weather, { locationName: place.name, unit, locale }),
    [weather, place.name, unit, locale],
  );

  // Switching language stops the current narration instead of leaving the
  // previous language playing; nothing restarts automatically.
  useEffect(() => {
    if (previousLocale.current === locale) return;
    previousLocale.current = locale;
    stopSpeech();
  }, [locale, stopSpeech]);
  return (
    <div className="today-hero">
      <section className="hero-grid" aria-labelledby="place-title">
        <div className="hero-location">
          <h1 className="place-title" key={place.name} id="place-title" data-testid="text-current-city">{place.name}</h1>
          <div className="date-line" data-testid="text-current-date">{formatLocationDate(current.time, { weekday: 'long', month: 'long', day: 'numeric' }, locale) ?? t('common.today')}</div>
        </div>
        <div className="temp-block">
          <div className="current-temp" data-testid="text-current-temperature">{displayTemp(current.temperature_2m, unit)}<sup>{unit === 'celsius' ? 'C' : 'F'}</sup></div>
          <div className="feels">{t('current.feelsLike')}<strong>{displayTemp(current.apparent_temperature, unit)}</strong><span className="temperature-condition">{weatherCopy(currentCode, locale)}</span>{updatedLabel}</div>
        </div>
      </section>

      <DayCueHero cue={dayCue} />

      <div className="day-cue-action">
        {speech.supported && (
          <button
            type="button"
            className="local-button primary-speak"
            onClick={() => (speech.isActive ? stopSpeech() : speech.speak(briefing.spokenText, SPEECH_LANGS[locale]))}
            aria-label={speech.isPreparing ? t('voice.ariaPreparing') : speech.isSpeaking ? t('voice.ariaStop') : t('voice.ariaStart')}
            aria-pressed={speech.isActive}
            data-testid="button-hear-today"
          >
            {speech.isActive ? <Square size={13} /> : <Volume2 size={15} />}
            {speech.isPreparing ? t('voice.preparing') : speech.isSpeaking ? t('voice.stop') : t('voice.hearToday')}
          </button>
        )}
        {speech.isPreparing && (
          <span className="sr-only" role="status" aria-live="polite" data-testid="voice-preparing-status">{t('voice.preparing')}</span>
        )}
        {speech.error && (
          <p className="voice-error" role="alert" data-testid="voice-error">{t('voice.error.unavailable')}</p>
        )}
      </div>

      <div className="hero-actions">
        <LocationSearch onSelect={onSelectPlace} />
        <button type="button" className="local-button" onClick={onFindMe} data-testid="button-refresh-location"><Navigation size={13} />{isLocating ? t('current.findingYou') : t('current.useLocation')}</button>
        <AskDaymark
          weather={weather}
          place={place}
          unit={unit}
          narrationActive={speech.isActive}
          speak={speech.speak}
          stopSpeech={stopSpeech}
        />
      </div>
    </div>
  );
}
