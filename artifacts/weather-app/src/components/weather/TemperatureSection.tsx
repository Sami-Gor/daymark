import { compareLocationTimes, displayTemp, getCurrentLocationTime, timeLabel, weatherIcon, type Unit, type WeatherPayload } from '@/lib/weather';
import { useLocale } from '@/hooks/use-locale';

/*
 * Live hourly temperature: the current/nearest forecast hour plus the next 4.
 * Five points only, matching the promo concept. Every value, label and icon
 * comes from the Open-Meteo payload; the SVG only draws the shape.
 */
export function TemperatureSection({ weather, unit }: { weather: WeatherPayload; unit: Unit }) {
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
    const value = hourly.temperature_2m?.[index];
    return value == null || Number.isNaN(value) ? null : value;
  });
  const known = values.filter((value): value is number => value != null);
  const min = known.length ? Math.min(...known) : 0;
  const max = known.length ? Math.max(...known) : 0;
  const span = max - min || 1;
  const pointX = (index: number) => (indexes.length <= 1 ? 50 : (index / (indexes.length - 1)) * 100);
  const pointY = (value: number) => 72 - ((value - min) / span) * 42;
  const points = values.map((value, index) => (value == null ? null : { value, x: pointX(index), y: pointY(value) }));
  const linePoints = points.filter((point): point is { value: number; x: number; y: number } => point != null);
  const linePath = linePoints.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const areaPath = linePoints.length > 1
    ? `${linePath} L${linePoints[linePoints.length - 1].x.toFixed(2)} 100 L${linePoints[0].x.toFixed(2)} 100 Z`
    : '';

  return (
    <section className="promo-card promo-temperature section-wide" aria-labelledby="temperature-title">
      <div className="section-heading">
        <h2 className="section-title" id="temperature-title">{t('temperature.title')}</h2>
        <span className="section-meta">{t('temperature.meta')}</span>
      </div>
      <div
        className="promo-panel"
        data-testid="list-hourly-forecast"
        role="img"
        aria-label={t('temperature.aria', { min: displayTemp(min, unit), max: displayTemp(max, unit) })}
      >
        {linePoints.length ? (
          <>
            <div className="temp-chart">
              <svg className="temp-chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                <defs>
                  <linearGradient id="temp-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(203 64% 37% / .28)" />
                    <stop offset="100%" stopColor="hsl(203 64% 37% / 0)" />
                  </linearGradient>
                </defs>
                {areaPath ? <path className="temp-area" d={areaPath} fill="url(#temp-area)" /> : null}
                <path className="temp-line" d={linePath} pathLength={1} vectorEffect="non-scaling-stroke" fill="none" />
              </svg>
              {indexes.map((index, item) => {
                const Icon = weatherIcon(hourly.weather_code?.[index] ?? 0, true);
                return <Icon key={`icon-${index}`} className="temp-icon" size={14} strokeWidth={1.6} style={{ left: `${pointX(item)}%` }} aria-hidden="true" />;
              })}
              {linePoints.map((point, index) => (
                <span
                  className="temp-dot"
                  key={`dot-${index}`}
                  style={{ left: `${point.x}%`, top: `${point.y}%`, animationDelay: `${index * 80 + 120}ms` }}
                />
              ))}
              {linePoints.map((point, index) => (
                <span
                  className="temp-value"
                  key={`value-${index}`}
                  style={{ left: `${point.x}%`, top: `${point.y}%`, animationDelay: `${index * 80 + 240}ms` }}
                >
                  {displayTemp(point.value, unit)}
                </span>
              ))}
            </div>
            <div className="temp-times" aria-hidden="true">
              {indexes.map((index, item) => (
                <span className="temp-time" key={`time-${index}`}>{item === 0 ? t('common.now') : timeLabel(times[index], locale)}</span>
              ))}
            </div>
          </>
        ) : <p className="atmos-empty">{t('hourly.empty')}</p>}
      </div>
    </section>
  );
}
