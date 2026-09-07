import { airColor, airContext, airLevel, pollutionValue, type WeatherPayload } from '@/lib/weather';

export function AirQualityForecast({ weather }: { weather: WeatherPayload }) {
  const airQuality = weather.airQuality;
  const current = airQuality?.current ?? {};
  const level = airLevel(current.us_aqi);
  const stats = [
    { label: 'PM2.5', value: current.pm2_5, unit: 'µg/m³', sub: 'Fine particles' },
    { label: 'PM10', value: current.pm10, unit: 'µg/m³', sub: 'Coarse particles' },
    { label: 'NO₂', value: current.nitrogen_dioxide, unit: 'µg/m³', sub: 'Nitrogen dioxide' },
    { label: 'O₃', value: current.ozone, unit: 'µg/m³', sub: 'Ground-level ozone' },
  ];
  const currentPosition = Math.min(100, Math.max(0, ((current.us_aqi ?? 0) / 150) * 100));
  const comparisonMarkers = [
    { className: 'air-marker-current', label: 'Your air', value: current.us_aqi, position: currentPosition, color: airColor(current.us_aqi) },
    { className: 'air-marker-who', label: 'WHO 24h guideline', value: 50, position: 33.33, color: '#e8b93f' },
    { className: 'air-marker-city', label: 'Typical city day', value: 100, position: 66.67, color: '#e8763f' },
  ];

  return (
    <section className="air-wide" aria-labelledby="air-title">
      <div className="section-heading">
        <h2 className="section-title" id="air-title">Air around you</h2>
          <span className="section-meta">live AQI</span>
      </div>
      <div className="panel air-panel" data-testid="panel-air-quality">
        {airQuality ? (
          <>
            <div className="air-hero">
              <div className="air-now" role="img" aria-label={`Current US AQI ${pollutionValue(current.us_aqi)}, ${level.label}`}>
                <span className="air-kicker">Current AQI</span>
                <div className="air-score-line">
                  <strong data-testid="text-current-aqi" style={{ color: airColor(current.us_aqi) }}>{pollutionValue(current.us_aqi)}</strong>
                  <div className={`air-badge ${level.className}`}>{level.label}</div>
                </div>
              </div>
              <p className="air-context-line" data-testid="air-context">{airContext(current.us_aqi)}</p>
            </div>

            <div className="air-scale-row" aria-label="AQI comparison range from 0 to 150">
              <div className="air-scale">
                <div className="air-scale-segment air-scale-good" />
                <div className="air-scale-segment air-scale-moderate" />
                <div className="air-scale-segment air-scale-sensitive" />
                {comparisonMarkers.map((marker) => (
                  <div className={`air-marker ${marker.className}`} key={marker.label} style={{ left: `${marker.position}%` }} role="img" aria-label={`${marker.label}: ${pollutionValue(marker.value)}`}>
                    <i style={{ background: marker.color }} />
                  </div>
                ))}
              </div>
              <div className="air-scale-axis"><span>0</span><span>150</span></div>
            </div>

            <div className="air-stats" data-testid="list-pollution-stats">
              {stats.map((stat) => (
                <div className="air-stat" key={stat.label}>
                  <span className="air-stat-label">{stat.label}</span>
                  <strong>{pollutionValue(stat.value)}<em>{stat.unit}</em></strong>
                  <small>{stat.sub}</small>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="air-empty">Air-quality detail is unavailable right now. Weather data is still up to date.</p>
        )}
      </div>
    </section>
  );
}
