import { Glasses, Navigation, Umbrella } from 'lucide-react';
import { displayTemp, localDate, weatherCopy, type Place, type Unit, type WeatherAdvice, type WeatherPayload } from '@/lib/weather';

export function CurrentWeather({ place, weather, unit, umbrellaAdvice, sunglassesAdvice, updatedLabel, isLocating, onFindMe }: {
  place: Place;
  weather: WeatherPayload;
  unit: Unit;
  umbrellaAdvice: WeatherAdvice;
  sunglassesAdvice: WeatherAdvice;
  updatedLabel: string;
  isLocating: boolean;
  onFindMe: () => void;
}) {
  const current = weather.current ?? {};
  const currentCode = current.weather_code ?? 0;
  return (
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
        <button className="local-button" onClick={onFindMe} data-testid="button-refresh-location"><Navigation size={13} />{isLocating ? 'Finding you…' : 'Use my location'}</button>
      </div>
      <div className="temp-block">
        <div className="current-temp" data-testid="text-current-temperature">{displayTemp(current.temperature_2m, unit)}<sup>{unit === 'celsius' ? 'C' : 'F'}</sup></div>
        <div className="feels">Feels like<strong>{displayTemp(current.apparent_temperature, unit)}</strong><span className="temperature-condition">{weatherCopy(currentCode)}</span>{updatedLabel}</div>
      </div>
    </section>
  );
}
