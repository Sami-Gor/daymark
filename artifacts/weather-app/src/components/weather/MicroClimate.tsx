import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Droplets, Thermometer, type LucideIcon } from 'lucide-react';
import { displayTemp, distanceKm, fetchMicroClimate, isMicroClimateSupported, signedDelta, type MicroClimatePayload, type Place, type Unit, type WeatherPayload } from '@/lib/weather';
import { useLocale } from '@/hooks/use-locale';

type ComparisonRow = {
  id: string;
  icon: LucideIcon;
  label: string;
  forecast: string;
  model: string;
  delta?: number;
  deltaText: string;
  notable: boolean;
};

/*
 * Regional model comparison (UK-only).
 *
 * Honest framing: this compares one higher-resolution regional model against
 * the wider forecast. It is not a sensor reading and not street-level
 * precision, and rows whose comparison values are missing are simply hidden.
 */
export function MicroClimateForecast({ weather, place, unit }: { weather: WeatherPayload; place: Place; unit: Unit }) {
  const { locale, t } = useLocale();
  const supported = isMicroClimateSupported(place.latitude, place.longitude);
  const [model, setModel] = useState<MicroClimatePayload | null>(null);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    if (!supported) return;
    let active = true;
    setModelStatus('loading');
    void fetchMicroClimate(place).then((result) => {
      if (!active) return;
      setModel(result);
      setModelStatus(result ? 'ready' : 'unavailable');
    });
    return () => {
      active = false;
    };
  }, [supported, place.latitude, place.longitude]);

  if (!supported || modelStatus === 'unavailable') return null;

  const regionalTemperature = weather.current?.temperature_2m;
  const regionalRainfall = weather.current?.precipitation;
  const modelTemperature = model?.current?.temperature_2m;
  const modelRainfall = model?.current?.precipitation;
  const distance = model?.latitude != null && model.longitude != null
    ? distanceKm(place.latitude, place.longitude, model.latitude, model.longitude).toFixed(1)
    : null;

  const rows: ComparisonRow[] = [];
  if (regionalTemperature != null && modelTemperature != null && distance != null) {
    const deltaC = modelTemperature - regionalTemperature;
    const delta = unit === 'fahrenheit' ? deltaC * 9 / 5 : deltaC;
    rows.push({
      id: 'temperature',
      icon: Thermometer,
      label: t('micro.temperature'),
      forecast: displayTemp(regionalTemperature, unit),
      model: displayTemp(modelTemperature, unit),
      delta,
      deltaText: signedDelta(delta, unit === 'fahrenheit' ? '°F' : '°C', 1, locale),
      notable: Math.abs(delta) >= (unit === 'fahrenheit' ? 1.8 : 1),
    });
  }
  if (regionalRainfall != null && modelRainfall != null && distance != null) {
    const delta = modelRainfall - regionalRainfall;
    rows.push({
      id: 'rainfall',
      icon: Droplets,
      label: t('micro.rainfall'),
      forecast: `${regionalRainfall.toFixed(1)} mm`,
      model: `${modelRainfall.toFixed(1)} mm`,
      delta,
      deltaText: signedDelta(delta, ' mm', 1, locale),
      notable: Math.abs(delta) >= .2,
    });
  }

  const loading = modelStatus === 'loading';
  if (!loading && rows.length === 0) return null;

  return (
    <section className="micro-wide" aria-labelledby="micro-title">
      <div className="section-heading">
        <h2 className="section-title" id="micro-title">{t('micro.title')}</h2>
        <span className="section-meta">{t('micro.meta')}</span>
      </div>
      <div className="panel micro-panel" data-testid="panel-micro-climate">
        <div className="micro-intro">
          <p>{t('micro.intro')}</p>
          <strong>{loading ? t('micro.checking') : distance != null ? t('micro.gridDistance', { distance }) : ''}</strong>
        </div>
        {rows.length > 0 && (
          <div className="micro-rows">
            {rows.map(({ id, icon: Icon, label, forecast, model: modelValue, delta, deltaText, notable }) => {
              const DeltaIcon = delta === undefined ? null : delta >= 0 ? ArrowUp : ArrowDown;
              return (
                <div className="micro-row" key={id} data-testid={`micro-row-${id}`}>
                  <div className="micro-metric">
                    <Icon size={17} strokeWidth={1.7} />
                    <strong>{label}</strong>
                  </div>
                  <div className="micro-value-group">
                    <span><small>{t('micro.forecast')}</small><b>{forecast}</b></span>
                    <span><small>{t('micro.model')}</small><b>{modelValue}</b></span>
                  </div>
                  <div className={`micro-delta${notable ? ' micro-delta-amber' : ''}`}>
                    {DeltaIcon ? <DeltaIcon size={13} strokeWidth={2} /> : null}
                    <span>{deltaText}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
