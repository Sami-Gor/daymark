import { Droplets } from 'lucide-react';
import { compareLocationTimes, displayTemp, getCurrentLocationTime, timeLabel, weatherIcon, type Unit, type WeatherPayload } from '@/lib/weather';
import { formatPercent } from '@/lib/i18n';
import { useLocale } from '@/hooks/use-locale';

export function HourlyOutlook({ weather, unit }: { weather: WeatherPayload; unit: Unit }) {
  const { locale, t } = useLocale();
  const hourly = weather.hourly ?? {};
  const times = hourly.time ?? [];
  const currentTime = getCurrentLocationTime(weather.current?.time, weather);
  const startTime = currentTime ?? times[0];
  const start = times.length
    ? Math.max(0, times.findIndex((time) => compareLocationTimes(time, startTime) >= 0))
    : 0;
  // NOW + the next 4 hours (5 entries), from the current forecast time onward.
  const indexes = Array.from({ length: Math.min(5, times.length - start) }, (_, index) => start + index);
  return (
    <section aria-labelledby="hourly-title">
      <div className="section-heading">
        <h2 className="section-title" id="hourly-title">{t('hourly.title')}</h2>
        <span className="section-meta">{t('hourly.meta')}</span>
      </div>
      <div className="panel hourly-scroll" data-testid="list-hourly-forecast" tabIndex={0} role="group" aria-label={t('hourly.aria')}>
        {indexes.length ? indexes.map((index, itemIndex) => {
          const code = hourly.weather_code?.[index] ?? 0;
          const Icon = weatherIcon(code, true);
          return (
            <div className={`hour-card${itemIndex === 0 ? ' active' : ''}`} key={`${times[index]}-${index}`} data-testid={`card-hour-${index}`}>
              <span className="hour-time">{itemIndex === 0 ? t('common.now') : timeLabel(times[index], locale)}</span>
              <Icon size={21} className="condition-icon" strokeWidth={1.7} />
              <span className="hour-temp">{displayTemp(hourly.temperature_2m?.[index], unit)}</span>
              <span className="hour-rain"><Droplets size={10} />{formatPercent(hourly.precipitation_probability?.[index] ?? 0, locale)}</span>
            </div>
          );
        }) : <p style={{ padding: 22, color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>{t('hourly.empty')}</p>}
      </div>
    </section>
  );
}
