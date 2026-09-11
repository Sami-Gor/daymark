import { Droplets, Info, Sunrise, Sunset, Wind, type LucideIcon } from 'lucide-react';
import { calculateDewPointCelsius, dewPointComfort, displayTemp, displayWind, timeLabel, type Unit, type WeatherPayload } from '@/lib/weather';
import { useLocale } from '@/hooks/use-locale';

export function WeatherDetails({ weather, unit }: { weather: WeatherPayload; unit: Unit }) {
  const { locale, t } = useLocale();
  const current = weather.current ?? {};
  const daily = weather.daily ?? {};
  const dewPoint = calculateDewPointCelsius(current.temperature_2m, current.relative_humidity_2m);
  const dewComfort = dewPointComfort(dewPoint, locale);
  const gusts = current.wind_gusts_10m;
  const windSub = gusts != null
    ? t('details.gusts', { value: displayWind(gusts, unit) })
    : t('details.windSub');
  // Secondary details only: headline facts (feels-like, rain chance, current
  // precipitation) already live in the hero, advice cards and forecast.
  const detailItems: { id: string; icon: LucideIcon; label: string; value: string; sub?: string; dewPoint?: { value: string; comfort: { label: string; className: string } } }[] = [
    {
      id: 'humidity',
      icon: Droplets,
      label: t('details.humidity'),
      value: current.relative_humidity_2m != null ? `${current.relative_humidity_2m}%` : '—',
      sub: t('details.humiditySub'),
      dewPoint: { value: displayTemp(dewPoint, unit), comfort: dewComfort },
    },
    {
      id: 'wind',
      icon: Wind,
      label: t('details.wind'),
      value: displayWind(current.wind_speed_10m, unit),
      sub: windSub,
    },
  ];
  return (
    <section className="details-wide" aria-labelledby="details-title">
      <div className="section-heading">
        <h2 className="section-title" id="details-title">{t('details.title')}</h2>
        <span className="section-meta">{t('details.meta')}</span>
      </div>
      <div className="panel details-panel" data-testid="panel-weather-details">
        <div className="detail-grid">
          {detailItems.map(({ id, icon: Icon, label, value, sub, dewPoint: humidityDewPoint }) => (
            <div className="detail" key={id} data-testid={`detail-${id}`}>
              <Icon className="detail-icon" size={17} strokeWidth={1.7} />
              <div className="detail-label">{label}</div>
              <div className="detail-value">{value}</div>
              <div className="detail-sub">{sub}</div>
              {humidityDewPoint ? (
                <div className="dew-point" data-testid="detail-dew-point">
                  <span className="dew-point-label">
                    <span className="dew-point-info" role="img" title={t('details.dewPointTitle')} aria-label={t('details.dewPointAria')}><Info size={11} strokeWidth={1.8} /></span>
                    {t('details.dewPoint')} <strong>{humidityDewPoint.value}</strong>
                  </span>
                  <span className={`dew-pill ${humidityDewPoint.comfort.className}`}>{humidityDewPoint.comfort.label}</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="panel sun-panel">
          <div className="sun-item" data-testid="detail-sunrise">
            <Sunrise size={20} strokeWidth={1.6} />
            <div><div className="sun-label">{t('details.sunrise')}</div><div className="sun-value">{timeLabel(daily.sunrise?.[0], locale)}</div></div>
          </div>
          <div className="sun-item" data-testid="detail-sunset">
            <Sunset size={20} strokeWidth={1.6} />
            <div><div className="sun-label">{t('details.sunset')}</div><div className="sun-value">{timeLabel(daily.sunset?.[0], locale)}</div></div>
          </div>
        </div>
      </div>
    </section>
  );
}
