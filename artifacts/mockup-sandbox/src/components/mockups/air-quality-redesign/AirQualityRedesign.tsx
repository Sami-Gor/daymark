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
  const gaugeProgress = aqi / 50;
  const gaugeAngle = Math.PI - (gaugeProgress / 6) * Math.PI;
  const needleX = 150 + Math.cos(gaugeAngle) * 105;
  const needleY = 132 - Math.sin(gaugeAngle) * 105;
  const markers = [
    { name: 'Your air', value: 22, position: 14.7, color: '#3fb98a', current: true },
    { name: 'WHO 24h guideline', value: 50, position: 33.33, color: '#e8b93f', current: false },
    { name: 'Typical city day', value: 100, position: 66.67, color: '#e8763f', current: false },
  ];

  return (
    <div className="air-mockup min-h-screen">
      <div className="air-heading"><h2>Air around you</h2><span className="air-label">Pollution stats</span></div>
      <section className="air-card air-summary">
        <div className="air-gauge">
          <svg viewBox="0 0 300 166" role="img" aria-label="Current US AQI 22">
            <path className="air-gauge-track" d="M 24 132 A 126 126 0 0 1 276 132" pathLength="600" />
            {['good', 'moderate', 'sensitive', 'unhealthy', 'very-unhealthy', 'hazardous'].map((band, index) => (
              <path className={`air-gauge-segment air-gauge-${band}`} d="M 24 132 A 126 126 0 0 1 276 132" pathLength="600" strokeDasharray="100 500" strokeDashoffset={index * -100} key={band} />
            ))}
            <line className="air-needle" x1="150" y1="132" x2={needleX} y2={needleY} />
            <circle className="air-needle-dot" cx="150" cy="132" r="7" />
          </svg>
          <div className="air-gauge-value" style={{ color: '#3fb98a' }}><strong>{aqi}</strong><span>Current US AQI</span></div>
        </div>
        <div className="air-summary-copy"><div className="air-badge">Good</div><p>Air quality is considered<br />satisfactory for most people.</p></div>
        <div className="air-note"><span className="air-kicker">What’s measured</span><strong>Particles + gases</strong><small>Updated with your local forecast</small></div>
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
        <div className="air-context-heading"><span className="air-label">Compared to</span><span className="air-label">Context</span></div>
        <div className="air-scale-wrap">
          <div className="air-scale">
            <div className="air-scale-segment air-scale-good" />
            <div className="air-scale-segment air-scale-moderate" />
            <div className="air-scale-segment air-scale-sensitive" />
            {markers.map((marker) => (
              <div className={`air-marker${marker.current ? ' air-marker-current' : ''}${marker.name.startsWith('WHO') ? ' air-marker-who' : ''}`} style={{ left: `${marker.position}%` }} key={marker.name}>
                <span className="air-marker-label">{marker.name}<strong>{marker.value}</strong></span><i style={{ background: marker.color }} />
              </div>
            ))}
          </div>
          <div className="air-scale-axis"><span>0</span><span>150</span></div>
        </div>
        <p className="air-context-copy">Roughly equivalent to a normal day with light traffic nearby — no meaningful health risk today.</p>
      </section>
    </div>
  );
}