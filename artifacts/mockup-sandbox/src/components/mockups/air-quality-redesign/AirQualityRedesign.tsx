import './_group.css';

const pollutants = [
  { name: 'PM2.5', value: 3.8, unit: 'μg/m³', label: 'fine particles', threshold: 5 },
  { name: 'PM10', value: 6.4, unit: 'μg/m³', label: 'coarse particles', threshold: 45 },
  { name: 'NO₂', value: 5.2, unit: 'μg/m³', label: 'nitrogen dioxide', threshold: 25 },
  { name: 'O₃', value: 36, unit: 'μg/m³', label: 'ground-level ozone', threshold: 100 },
];

function meterColor(value: number, threshold: number) {
  const ratio = value / threshold;
  return ratio <= .7 ? '#3fb98a' : ratio <= 1 ? '#e8b93f' : '#e8763f';
}

export function AirQualityRedesign() {
  const aqi = 22;
  const markers = [
    { name: 'Your air', value: 22, position: 14.7, color: '#3fb98a', current: true },
    { name: 'WHO 24h guideline', value: 50, position: 33.33, color: '#e8b93f', current: false },
    { name: 'Typical city day', value: 100, position: 66.67, color: '#e8763f', current: false },
  ];

  return (
    <div className="air-mockup">
      <div className="air-heading"><h2>Air around you</h2><span className="air-label">Live AQI</span></div>
      <section className="air-card air-compact-summary">
        <div className="air-score-block">
          <span className="air-kicker">Current US AQI</span>
          <div className="air-score-line"><strong>{aqi}</strong><span className="air-badge">Good</span></div>
        </div>
        <div className="air-summary-copy"><p>Air quality is considered satisfactory for most people.</p><small>Updated with your local forecast</small></div>
        <div className="air-range">
          <div className="air-range-heading"><span>Quality range</span><span>0—150</span></div>
          <div className="air-scale">
            <div className="air-scale-segment air-scale-good" />
            <div className="air-scale-segment air-scale-moderate" />
            <div className="air-scale-segment air-scale-sensitive" />
            {markers.map((marker) => (
              <div className={`air-marker${marker.current ? ' air-marker-current' : ''}`} style={{ left: `${marker.position}%` }} key={marker.name} aria-label={`${marker.name}: ${marker.value}`}>
                <i style={{ background: marker.color }} />
              </div>
            ))}
          </div>
          <div className="air-range-labels"><span>Good</span><span>Moderate</span><span>Unhealthy</span></div>
        </div>
      </section>
      <section className="air-card air-stats">
        {pollutants.map((pollutant) => (
          <div className="air-stat" key={pollutant.name}>
            <span className="air-kicker">{pollutant.name}</span>
            <strong>{pollutant.value}<em>{pollutant.unit}</em></strong>
            <small>{pollutant.label}</small>
            <div className="air-stat-meter"><div style={{ width: `${(pollutant.value / pollutant.threshold) * 100}%`, background: meterColor(pollutant.value, pollutant.threshold) }} /></div>
          </div>
        ))}
      </section>
      <section className="air-card air-context">
        <div><span className="air-context-kicker">In plain English</span><p>Roughly equivalent to a normal day with light traffic nearby — no meaningful health risk today.</p></div>
        <span className="air-context-source">Particles + gases · local forecast</span>
      </section>
    </div>
  );
}