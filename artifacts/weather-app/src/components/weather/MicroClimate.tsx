import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Droplets, Gauge, Thermometer } from 'lucide-react';
import { displayTemp, distanceKm, fetchMicroClimate, pollutionValue, signedDelta, type MicroClimatePayload, type Place, type Unit, type WeatherPayload } from '@/lib/weather';

export function MicroClimateForecast({ weather, place, unit }: { weather: WeatherPayload; place: Place; unit: Unit }) {
  const [model, setModel] = useState<MicroClimatePayload | null>(null);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
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
  }, [place.latitude, place.longitude]);

  const regionalTemperature = weather.current?.temperature_2m;
  const regionalRainfall = weather.current?.precipitation;
  const modelTemperature = model?.current?.temperature_2m;
  const modelRainfall = model?.current?.precipitation;
  const temperatureDeltaC = regionalTemperature != null && modelTemperature != null
    ? modelTemperature - regionalTemperature
    : undefined;
  const temperatureDelta = temperatureDeltaC === undefined
    ? undefined
    : unit === 'fahrenheit' ? temperatureDeltaC * 9 / 5 : temperatureDeltaC;
  const rainfallDelta = regionalRainfall != null && modelRainfall != null
    ? modelRainfall - regionalRainfall
    : undefined;
  const modelDistance = model?.latitude != null && model.longitude != null
    ? `UKV model grid: ${distanceKm(place.latitude, place.longitude, model.latitude, model.longitude).toFixed(1)} km away`
    : 'UKV model grid: unavailable';
  const modelValue = modelStatus === 'loading' ? 'Checking UKV…' : modelStatus === 'ready' ? 'Model grid' : 'Regional only';

  const rows = [
    {
      label: 'Temperature',
      icon: Thermometer,
      regional: displayTemp(regionalTemperature, unit),
      nearby: modelStatus === 'loading' ? 'Checking…' : modelTemperature === undefined ? 'Regional only' : displayTemp(modelTemperature, unit),
      delta: temperatureDelta,
      deltaText: signedDelta(temperatureDelta, unit === 'fahrenheit' ? '°F grid' : '°C grid'),
      notable: temperatureDelta !== undefined && Math.abs(temperatureDelta) >= (unit === 'fahrenheit' ? 1.8 : 1),
      distance: modelDistance,
    },
    {
      label: 'Rainfall now',
      icon: Droplets,
      regional: regionalRainfall == null ? '—' : `${regionalRainfall.toFixed(1)} mm`,
      nearby: modelStatus === 'loading' ? 'Checking…' : modelRainfall == null ? 'Regional only' : `${modelRainfall.toFixed(1)} mm`,
      delta: rainfallDelta,
      deltaText: signedDelta(rainfallDelta, ' mm grid'),
      notable: rainfallDelta !== undefined && Math.abs(rainfallDelta) >= .2,
      distance: modelDistance,
    },
    {
      label: 'Air quality',
      icon: Gauge,
      regional: `${pollutionValue(weather.airQuality?.current?.us_aqi)} US AQI`,
      nearby: 'No nearby sensor',
      delta: undefined,
      deltaText: 'Regional only',
      notable: false,
      distance: 'Nearest air sensor: unavailable',
    },
  ];

  return (
    <section className="micro-wide" aria-labelledby="micro-title">
      <div className="section-heading">
        <h2 className="section-title" id="micro-title">Your Micro-Climate</h2>
        <span className="section-meta">vs. regional forecast</span>
      </div>
      <div className="panel micro-panel" data-testid="panel-micro-climate">
        <div className="micro-intro">
          <span>LOCAL VARIANCE CHECK</span>
          <p>One nearby model grid point can feel different from the broader city forecast. This is a comparison, not block-level precision.</p>
          <strong>{modelValue}</strong>
        </div>
        <div className="micro-rows">
          {rows.map(({ label, icon: Icon, regional, nearby, delta, deltaText, notable, distance }) => {
            const DeltaIcon = delta === undefined ? null : delta >= 0 ? ArrowUp : ArrowDown;
            return (
              <div className={`micro-row${delta === undefined ? ' micro-row-unavailable' : ''}`} key={label}>
                <div className="micro-metric">
                  <Icon size={17} strokeWidth={1.7} />
                  <strong>{label}</strong>
                </div>
                <div className="micro-value-group">
                  <span><small>Regional</small><b>{regional}</b></span>
                  <span><small>{label === 'Air quality' ? 'Nearby sensor' : 'Nearby model'}</small><b>{nearby}</b></span>
                </div>
                <div className={`micro-delta${notable ? ' micro-delta-amber' : ''}${delta === undefined ? ' micro-delta-muted' : ''}`}>
                  {DeltaIcon ? <DeltaIcon size={13} strokeWidth={2} /> : null}
                  <span>{deltaText}</span>
                </div>
                <small className="micro-distance">{distance}</small>
              </div>
            );
          })}
        </div>
        <p className="micro-fallback">No nearby micro-sensor data available for air quality — showing regional forecast only.</p>
      </div>
    </section>
  );
}
