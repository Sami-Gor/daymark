import { Droplets, Gauge, Info, Sunrise, Sunset, Thermometer, Umbrella, type LucideIcon } from 'lucide-react';
import { calculateDewPointCelsius, dewPointComfort, displayTemp, timeLabel, type Unit, type WeatherPayload } from '@/lib/weather';

export function WeatherDetails({ weather, unit }: { weather: WeatherPayload; unit: Unit }) {
  const current = weather.current ?? {};
  const daily = weather.daily ?? {};
  const dewPoint = calculateDewPointCelsius(current.temperature_2m, current.relative_humidity_2m);
  const dewComfort = dewPointComfort(dewPoint);
  const detailItems: { icon: LucideIcon; label: string; value: string; sub?: string; dewPoint?: { value: string; comfort: { label: string; className: string } } }[] = [
    { icon: Thermometer, label: 'Feels like', value: displayTemp(current.apparent_temperature, unit), sub: 'on your skin' },
    { icon: Droplets, label: 'Humidity', value: current.relative_humidity_2m !== undefined ? `${current.relative_humidity_2m}%` : '—', sub: 'relative humidity', dewPoint: { value: displayTemp(dewPoint, unit), comfort: dewComfort } },
    { icon: Umbrella, label: 'Rain now', value: current.precipitation !== undefined ? `${current.precipitation} mm` : '—', sub: 'at this moment' },
    { icon: Gauge, label: 'Day ahead', value: `${daily.precipitation_probability_max?.[0] ?? 0}%`, sub: 'chance of rain' },
  ];
  return (
    <section className="details-wide" aria-labelledby="details-title">
      <div className="section-heading">
        <h2 className="section-title" id="details-title">The useful bits</h2>
        <span className="section-meta">at a glance</span>
      </div>
      <div className="panel details-panel" data-testid="panel-weather-details">
        <div className="detail-grid">
          {detailItems.map(({ icon: Icon, label, value, sub, dewPoint: humidityDewPoint }) => (
            <div className="detail" key={label} data-testid={`detail-${label.toLowerCase().replaceAll(' ', '-')}`}>
              <Icon className="detail-icon" size={17} strokeWidth={1.7} />
              <div className="detail-label">{label}</div>
              <div className="detail-value">{value}</div>
              <div className="detail-sub">{sub}</div>
              {humidityDewPoint ? (
                <div className="dew-point" data-testid="detail-dew-point">
                  <span className="dew-point-label">
                    <span className="dew-point-info" title="Dew point measures how humid the air actually feels — more reliable than relative humidity alone." aria-label="About dew point"><Info size={11} strokeWidth={1.8} /></span>
                    Dew point <strong>{humidityDewPoint.value}</strong>
                  </span>
                  <span className={`dew-pill ${humidityDewPoint.comfort.className}`}>{humidityDewPoint.comfort.label}</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="panel sun-panel">
          <div className="sun-item">
            <Sunrise size={20} strokeWidth={1.6} />
            <div><div className="sun-label">Sunrise</div><div className="sun-value">{timeLabel(daily.sunrise?.[0])}</div></div>
          </div>
          <div className="sun-item">
            <Sunset size={20} strokeWidth={1.6} />
            <div><div className="sun-label">Sunset</div><div className="sun-value">{timeLabel(daily.sunset?.[0])}</div></div>
          </div>
        </div>
      </div>
    </section>
  );
}
