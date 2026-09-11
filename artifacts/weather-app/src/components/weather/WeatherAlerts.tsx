import { useMemo } from 'react';
import { CloudRain, Snowflake, Thermometer, Wind, Zap, type LucideIcon } from 'lucide-react';
import { formatLocationTime, type Unit, type WeatherPayload } from '@/lib/weather';
import { getWeatherAlerts, type AlertHazard, type AlertSeverity } from '@/lib/weather-alerts';
import { useLocale } from '@/hooks/use-locale';

const HAZARD_ICON: Record<AlertHazard, LucideIcon> = {
  wind: Wind,
  thunderstorm: Zap,
  rain: CloudRain,
  snow: Snowflake,
  heat: Thermometer,
  cold: Thermometer,
};

/*
 * Forecast-derived weather risks for the selected location. Renders nothing at
 * all when there is no alert — no "all clear" placeholder. These are Daymark's
 * own risk levels, not official warnings, and the UI says so on every card.
 */
export function WeatherAlerts({ weather, unit }: { weather: WeatherPayload; unit: Unit }) {
  const { locale, t } = useLocale();
  const alerts = useMemo(() => getWeatherAlerts(weather, { unit, locale }), [weather, unit, locale]);
  if (!alerts.length) return null;

  return (
    <section className="alerts-wide" aria-labelledby="alerts-title">
      <div className="section-heading">
        <h2 className="section-title" id="alerts-title">{t('alerts.title')}</h2>
        <span className="section-meta">{t('alerts.meta')}</span>
      </div>
      <div className="alerts-stack" data-testid="list-weather-alerts">
        {alerts.map((alert) => {
          const Icon = HAZARD_ICON[alert.hazard];
          const timeRange = alert.startTime && alert.endTime
            ? `${formatLocationTime(alert.startTime, locale)}–${formatLocationTime(alert.endTime, locale)}`
            : null;
          return (
            <article
              key={alert.id}
              className={`alert-card alert-${alert.severity}`}
              data-testid={`alert-${alert.hazard}`}
            >
              <span className="alert-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.8} /></span>
              <div className="alert-body">
                <div className="alert-head">
                  <strong className="alert-title">{alert.title}</strong>
                  <span className={`alert-severity alert-severity-${alert.severity}`}>
                    {t(`alerts.severity.${alert.severity}` as 'alerts.severity.moderate' | 'alerts.severity.high' | 'alerts.severity.severe')}
                  </span>
                </div>
                <p className="alert-summary">{alert.summary}</p>
                <div className="alert-meta">
                  {timeRange && <span data-testid={`alert-time-${alert.hazard}`}>{timeRange}</span>}
                  <span>{alert.source}</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
