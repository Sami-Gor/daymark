import { useEffect, useState } from 'react';
import { Droplets, Thermometer } from 'lucide-react';
import { calculateDewPointCelsius, dewPointComfort, displayTemp, type Unit, type WeatherPayload } from '@/lib/weather';
import { useLocale } from '@/hooks/use-locale';

/*
 * The useful bits: humidity and dew point. The dew point card pairs the live
 * value and interpretation with a compact vertical comfort scale whose marker
 * sits at the real dew point. Thresholds are always evaluated in Celsius; the
 * displayed number follows the selected unit.
 */
const DEW_BANDS = [
  { key: 'dry', from: 0, to: 5 },
  { key: 'comfortable', from: 5, to: 13 },
  { key: 'slightlyHumid', from: 13, to: 16 },
  { key: 'humid', from: 16, to: 19 },
  { key: 'veryHumid', from: 19, to: 21 },
  { key: 'muggy', from: 21, to: 26 },
] as const;
const DEW_MAX = 26;
const dewPosition = (value: number) => (Math.min(DEW_MAX, Math.max(0, value)) / DEW_MAX) * 100;

export function WeatherDetails({ weather, unit }: { weather: WeatherPayload; unit: Unit }) {
  const { locale, t } = useLocale();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const current = weather.current ?? {};
  const dewPointC = current.dew_point_2m ?? calculateDewPointCelsius(current.temperature_2m, current.relative_humidity_2m);
  const dewBand = dewPointComfort(dewPointC, locale);
  const markerPct = dewPointC == null ? null : dewPosition(dewPointC);

  return (
    <section className="details-wide" aria-labelledby="details-title">
      <div className="section-heading">
        <h2 className="section-title" id="details-title">{t('details.title')}</h2>
        <span className="section-meta">{t('details.meta')}</span>
      </div>
      <div className="panel details-panel" data-testid="panel-weather-details">
        <div className="detail-grid">
          <div className="detail" data-testid="detail-humidity">
            <Droplets className="detail-icon" size={17} strokeWidth={1.7} />
            <div className="detail-label">{t('details.humidity')}</div>
            <div className="detail-value">{current.relative_humidity_2m != null ? `${current.relative_humidity_2m}%` : '—'}</div>
            <div className="detail-sub">{t('details.humiditySub')}</div>
          </div>
          <div className="detail detail-dew" data-testid="detail-dew-point">
            <div className="dew-main">
              <Thermometer className="detail-icon" size={17} strokeWidth={1.7} />
              <div className="detail-label">{t('details.dewPoint')}</div>
              <div className="detail-value">{displayTemp(dewPointC, unit)}</div>
              <div className="detail-sub"><span className={`dew-pill ${dewBand.className}`}>{dewBand.label}</span></div>
              <p className="dew-explainer">{t('details.dewFeel')} {t('details.dewExplainer')}</p>
            </div>
            <div
              className="dew-scale"
              role="img"
              aria-label={t('dew.scaleAria', { value: displayTemp(dewPointC, unit), band: dewBand.label })}
            >
              <div className="dew-scale-track">
                {DEW_BANDS.map((band) => (
                  <span className={`dew-scale-seg dew-band-${band.key}`} key={band.key} style={{ flexGrow: band.to - band.from }} />
                ))}
                {markerPct != null ? (
                  <span className="dew-scale-marker" style={{ top: ready ? `${markerPct.toFixed(2)}%` : '0%' }} />
                ) : null}
              </div>
              <div className="dew-scale-labels" aria-hidden="true">
                {DEW_BANDS.map((band) => (
                  <span className="dew-scale-label" key={band.key} style={{ top: `${((((band.from + band.to) / 2) / DEW_MAX) * 100).toFixed(2)}%` }}>
                    {t(`dew.band.${band.key}`)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
