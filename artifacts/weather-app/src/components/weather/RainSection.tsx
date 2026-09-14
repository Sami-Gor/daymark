import { Droplet } from 'lucide-react';
import { compareLocationTimes, getCurrentLocationTime, timeLabel, type WeatherPayload } from '@/lib/weather';
import { formatPercent } from '@/lib/i18n';
import { useLocale } from '@/hooks/use-locale';

/*
 * Chance of rain: peak-first summary plus a five-point droplet timeline over
 * the same current/nearest hour + next 4 window as the temperature card.
 * Every percentage and time is live; droplet shade encodes magnitude.
 */
const intensityClass = (value: number) => {
  if (value <= 10) return 'rain-i1';
  if (value <= 25) return 'rain-i2';
  if (value <= 50) return 'rain-i3';
  if (value <= 75) return 'rain-i4';
  return 'rain-i5';
};

export function RainSection({ weather }: { weather: WeatherPayload }) {
  const { locale, t } = useLocale();
  const hourly = weather.hourly ?? {};
  const times = hourly.time ?? [];
  const currentTime = getCurrentLocationTime(weather.current?.time, weather);
  const startTime = currentTime ?? times[0];
  const start = times.length
    ? Math.max(0, times.findIndex((time) => compareLocationTimes(time, startTime) >= 0))
    : 0;
  const indexes = Array.from({ length: Math.min(5, Math.max(0, times.length - start)) }, (_, index) => start + index);
  const values = indexes.map((index) => {
    const value = hourly.precipitation_probability?.[index];
    return value == null || Number.isNaN(value) ? 0 : Math.max(0, Math.min(100, value));
  });
  const peak = values.length ? Math.max(...values) : 0;
  const peakItem = values.indexOf(peak);
  const label = (index: number, item: number) => (item === 0 ? t('common.now') : timeLabel(times[index], locale));

  return (
    <section className="promo-card promo-rain section-wide" aria-labelledby="precip-title">
      <div className="section-heading">
        <h2 className="section-title" id="precip-title">{t('precip.title')}</h2>
        <span className="section-meta">{t('precip.meta')}</span>
      </div>
      <div className="promo-panel" data-testid="list-rain-probability">
        {indexes.length ? (
          <>
            <div className="rain-summary">
              <strong className="rain-peak" data-testid="text-rain-peak">{formatPercent(peak, locale)}</strong>
              <p className="rain-peak-note" data-testid="text-rain-peak-note">
                {peak > 0
                  ? t('precip.highestAround', { time: label(indexes[peakItem], peakItem) })
                  : t('precip.noRain')}
              </p>
            </div>
            <ol className="rain-timeline" role="list" aria-label={t('precip.aria', { peak: formatPercent(peak, locale) })}>
              {values.map((value, item) => (
                <li
                  className={`rain-point ${intensityClass(value)}${item === peakItem ? ' rain-point-peak' : ''}`}
                  key={`point-${indexes[item]}`}
                  role="listitem"
                  aria-label={t('precip.pointAria', { time: label(indexes[item], item), percent: formatPercent(value, locale) })}
                  style={{ animationDelay: `${item * 70}ms` }}
                >
                  <span className="rain-drop-wrap" aria-hidden="true">
                    <Droplet className="rain-drop" size={20} fill="currentColor" strokeWidth={0} />
                  </span>
                  <span className="rain-point-value" aria-hidden="true">{formatPercent(value, locale)}</span>
                  <span className="rain-point-time" aria-hidden="true">{label(indexes[item], item)}</span>
                </li>
              ))}
            </ol>
            <p className="rain-footer">{t('precip.caption')}</p>
          </>
        ) : <p className="atmos-empty">{t('hourly.empty')}</p>}
      </div>
    </section>
  );
}
