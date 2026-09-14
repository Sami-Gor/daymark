import { useEffect, useState, type ReactNode } from 'react';
import { getCurrentLocationTime, locationTimeMs, type WeatherPayload } from '@/lib/weather';
import type { Locale } from '@/lib/i18n';
import { useLocale } from '@/hooks/use-locale';

/** Wall-clock HH:MM for a pseudo-instant produced by locationTimeMs(). */
function clockFromMs(ms: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(ms));
}

function clockFromValue(value: string | null | undefined, locale: Locale): string {
  const ms = locationTimeMs(value);
  return ms == null ? '—' : clockFromMs(ms, locale);
}

/* Point on the decorative arc path (M 2 92 C 26 10, 74 10, 98 92). */
function arcPoint(progress: number): { x: number; y: number } {
  const t = Math.min(1, Math.max(0, progress));
  const u = 1 - t;
  return {
    x: 2 * u ** 3 + 78 * u ** 2 * t + 222 * u * t ** 2 + 98 * t ** 3,
    y: 92 * u ** 3 + 30 * u ** 2 * t + 30 * u * t ** 2 + 92 * t ** 3,
  };
}

/*
 * Live sun arc: sunrise, solar noon (derived midpoint), sunset, total daylight
 * and the current sun position, all from the daily Open-Meteo payload.
 */
export function SunDaylightSection({ weather }: { weather: WeatherPayload }) {
  const { locale, t } = useLocale();
  const daily = weather.daily ?? {};
  const currentTime = getCurrentLocationTime(weather.current?.time, weather);
  const sunriseMs = locationTimeMs(daily.sunrise?.[0]);
  const sunsetMs = locationTimeMs(daily.sunset?.[0]);
  const nowMs = locationTimeMs(currentTime);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const usable = sunriseMs != null && sunsetMs != null && sunsetMs > sunriseMs;

  let body: ReactNode;
  if (!usable) {
    body = <p className="atmos-empty">{t('sun.unavailable')}</p>;
  } else {
    const noonMs = (sunriseMs + sunsetMs) / 2;
    const daylightMs = sunsetMs - sunriseMs;
    const hours = Math.floor(daylightMs / 3_600_000);
    const minutes = Math.round((daylightMs % 3_600_000) / 60_000);
    const daylight = t('sun.daylightValue', { hours, minutes: minutes === 60 ? 0 : minutes });
    const progress = nowMs == null ? 0.5 : Math.min(1, Math.max(0, (nowMs - sunriseMs) / daylightMs));
    const marker = arcPoint(progress);
    const markerLeft = ready ? `${marker.x.toFixed(2)}%` : '2%';
    const markerTop = ready ? `${marker.y.toFixed(2)}%` : '92%';
    body = (
      <>
        <div className="sun-panel-head">
          <div className="sun-now">
            <span className="sun-now-value">{t('sun.solarNoon')}</span>
            <strong className="sun-noon">{clockFromMs(noonMs, locale)}</strong>
          </div>
          <div className="sun-total">
            <strong>{daylight}</strong>
            <span>{t('sun.daylight')}</span>
          </div>
        </div>
        <div
          className="sun-arc"
          role="img"
          aria-label={t('sun.aria', {
            sunrise: clockFromValue(daily.sunrise?.[0], locale),
            sunset: clockFromValue(daily.sunset?.[0], locale),
            daylight,
          })}
        >
          <svg className="sun-arc-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path className="sun-arc-path" d="M 2 92 C 26 10, 74 10, 98 92" vectorEffect="non-scaling-stroke" fill="none" />
            <path className="sun-horizon" d="M 0 92 H 100" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="sun-dot" style={{ left: markerLeft, top: markerTop }} />
          <span className="sun-noon-tick" />
        </div>
        <div className="sun-times">
          <div className="sun-item" data-testid="detail-sunrise">
            <span className="sun-label">{t('details.sunrise')}</span>
            <span className="sun-value">{clockFromValue(daily.sunrise?.[0], locale)}</span>
          </div>
          <div className="sun-item sun-item-end" data-testid="detail-sunset">
            <span className="sun-label">{t('details.sunset')}</span>
            <span className="sun-value">{clockFromValue(daily.sunset?.[0], locale)}</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <section className="promo-card promo-sun section-wide" aria-labelledby="sun-title">
      <div className="section-heading">
        <h2 className="section-title" id="sun-title">{t('sun.title')}</h2>
        <span className="section-meta">{t('sun.meta')}</span>
      </div>
      <div className="promo-panel sun-panel-art">{body}</div>
    </section>
  );
}
