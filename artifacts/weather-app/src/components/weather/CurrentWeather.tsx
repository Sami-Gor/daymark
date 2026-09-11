import { useMemo } from 'react';
import { Glasses, Navigation, Square, Umbrella, Volume2 } from 'lucide-react';
import { displayTemp, formatLocationDate, weatherCopy, type Place, type Unit, type WeatherAdvice, type WeatherPayload } from '@/lib/weather';
import { DAYMARK_INTENTS, getIntentResponse } from '@/lib/weather-intents';
import { SPEECH_LANGS } from '@/lib/i18n';
import { useBrowserSpeech } from '@/hooks/use-browser-speech';
import { useLocale } from '@/hooks/use-locale';
import { AskDaymark } from '@/components/weather/AskDaymark';
import { LocationSearch } from '@/components/weather/LocationSearch';

export function CurrentWeather({ place, weather, unit, umbrellaAdvice, sunglassesAdvice, updatedLabel, isLocating, onFindMe, onSelectPlace }: {
  place: Place;
  weather: WeatherPayload;
  unit: Unit;
  umbrellaAdvice: WeatherAdvice;
  sunglassesAdvice: WeatherAdvice;
  updatedLabel: string;
  isLocating: boolean;
  onFindMe: () => void;
  onSelectPlace: (place: Place) => void;
}) {
  const { locale, t } = useLocale();
  const current = weather.current ?? {};
  const currentCode = current.weather_code ?? 0;
  const speech = useBrowserSpeech();
  const briefing = useMemo(
    () => getIntentResponse(DAYMARK_INTENTS.today, weather, { locationName: place.name, unit, locale }),
    [weather, place.name, unit, locale],
  );
  return (
    <section className="hero-grid" aria-labelledby="place-title">
      <div className="hero-location">
        <h1 className="place-title" id="place-title" data-testid="text-current-city">{place.name}</h1>
        <div className="date-line" data-testid="text-current-date">{formatLocationDate(current.time, { weekday: 'long', month: 'long', day: 'numeric' }, locale) ?? t('common.today')}</div>
        <div className="advice-grid">
          <article className={`advice-card advice-${umbrellaAdvice.tone}`} data-testid="card-umbrella-advice">
            <Umbrella className="advice-icon" size={19} strokeWidth={1.7} />
            <span className="advice-label">{t('current.umbrella')}</span>
            <strong data-testid="text-umbrella-advice">{umbrellaAdvice.answer}</strong>
            <small>{umbrellaAdvice.reason}</small>
          </article>
          <article className={`advice-card advice-${sunglassesAdvice.tone}`} data-testid="card-sunglasses-advice">
            <Glasses className="advice-icon" size={19} strokeWidth={1.7} />
            <span className="advice-label">{t('current.sunglasses')}</span>
            <strong data-testid="text-sunglasses-advice">{sunglassesAdvice.answer}</strong>
            <small>{sunglassesAdvice.reason}</small>
          </article>
        </div>
        <div className="hero-actions">
          <LocationSearch onSelect={onSelectPlace} />
          <button type="button" className="local-button" onClick={onFindMe} data-testid="button-refresh-location"><Navigation size={13} />{isLocating ? t('current.findingYou') : t('current.useLocation')}</button>
          {speech.supported && (
            <button
              type="button"
              className="local-button"
              onClick={() => (speech.isSpeaking ? speech.stop() : speech.speak(briefing.spokenText, SPEECH_LANGS[locale]))}
              aria-label={speech.isSpeaking ? t('voice.ariaStop') : t('voice.ariaStart')}
              aria-pressed={speech.isSpeaking}
              data-testid="button-hear-today"
            >
              {speech.isSpeaking ? <Square size={11} /> : <Volume2 size={13} />}
              {speech.isSpeaking ? t('voice.stop') : t('voice.hearToday')}
            </button>
          )}
          <AskDaymark
            weather={weather}
            place={place}
            unit={unit}
            speak={speech.speak}
            stopSpeech={speech.stop}
          />
        </div>
      </div>
      <div className="temp-block">
        <div className="current-temp" data-testid="text-current-temperature">{displayTemp(current.temperature_2m, unit)}<sup>{unit === 'celsius' ? 'C' : 'F'}</sup></div>
        <div className="feels">{t('current.feelsLike')}<strong>{displayTemp(current.apparent_temperature, unit)}</strong><span className="temperature-condition">{weatherCopy(currentCode, locale)}</span>{updatedLabel}</div>
      </div>
    </section>
  );
}
