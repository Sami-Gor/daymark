import './_group.css';

type Point = { x: number; y: number };

const hourlyValues = [0.2, 0.9, 1.8, 2.4, 2.1, 1.7, 1.1, 0.6, 0.2];
const hourlyLabels = ['Now', '10AM', '11AM', '12PM', '1PM', '2PM', '3PM', '4PM', '5PM'];
const dailyValues = [2.4, 3.4, 4.9, 3.9, 4.9, 4.5, 1.5];
const dailyLabels = ['Today', 'Tomorrow', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'];

function level(value: number) {
  if (value < 3) return { label: 'Low', color: '#3fb98a' };
  if (value < 6) return { label: 'Moderate', color: '#e8b93f' };
  if (value < 8) return { label: 'High', color: '#e8763f' };
  return { label: 'Very high+', color: '#d9483f' };
}

function smoothPath(points: Point[]) {
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const beforePrevious = points[index - 2] ?? previous;
    const next = points[index + 1] ?? point;
    return `${path} C ${previous.x + (point.x - beforePrevious.x) / 6} ${previous.y + (point.y - beforePrevious.y) / 6}, ${point.x - (next.x - previous.x) / 6} ${point.y - (next.y - previous.y) / 6}, ${point.x} ${point.y}`;
  }, '');
}

export function UVForecastRedesign() {
  const currentUv = 2.4;
  const currentLevel = level(currentUv);
  const gaugeAngle = Math.PI - (currentUv / 11) * Math.PI;
  const needleX = 150 + Math.cos(gaugeAngle) * 105;
  const needleY = 132 - Math.sin(gaugeAngle) * 105;
  const chartPoints = hourlyValues.map((value, index) => ({
    x: 18 + (index / (hourlyValues.length - 1)) * 864,
    y: 202 - (value / 11) * 172,
  }));
  const line = smoothPath(chartPoints);
  const area = `${line} L 882 202 L 18 202 Z`;
  const peakIndex = hourlyValues.indexOf(Math.max(...hourlyValues));

  return (
    <div className="uv-mockup min-h-screen">
      <div className="uv-section-label">
        <h2>Sun on your skin</h2>
        <span>UV forecast</span>
      </div>
      <section className="uv-card uv-summary" aria-label="Current UV forecast">
        <div className="uv-gauge">
          <svg viewBox="0 0 300 166" role="img" aria-label="Current UV index 2.4">
            <path className="uv-gauge-track" d="M 24 132 A 126 126 0 0 1 276 132" pathLength="400" />
            <path className="uv-gauge-segment gauge-low" d="M 24 132 A 126 126 0 0 1 276 132" pathLength="400" strokeDasharray="100 300" />
            <path className="uv-gauge-segment gauge-moderate" d="M 24 132 A 126 126 0 0 1 276 132" pathLength="400" strokeDasharray="100 300" strokeDashoffset="-100" />
            <path className="uv-gauge-segment gauge-high" d="M 24 132 A 126 126 0 0 1 276 132" pathLength="400" strokeDasharray="100 300" strokeDashoffset="-200" />
            <path className="uv-gauge-segment gauge-extreme" d="M 24 132 A 126 126 0 0 1 276 132" pathLength="400" strokeDasharray="100 300" strokeDashoffset="-300" />
            <line className="uv-needle" x1="150" y1="132" x2={needleX} y2={needleY} />
            <circle className="uv-needle-dot" cx="150" cy="132" r="7" />
          </svg>
          <div className="uv-gauge-value" style={{ color: currentLevel.color }}>
            <strong>{currentUv}</strong>
            <span>Current UV Index</span>
          </div>
        </div>
        <div className="uv-summary-copy">
          <div className="uv-badge">{currentLevel.label}</div>
          <p>Enjoy the daylight.<br />Protection is usually not needed.</p>
        </div>
        <div className="uv-peak">
          <span>Today’s peak</span>
          <strong>2.4</strong>
          <small>Low · around 2 PM</small>
        </div>
      </section>

      <section className="uv-card uv-chart-card">
        <div className="uv-subheading"><span className="uv-axis-label">Today by hour</span><span className="uv-axis-label">index</span></div>
        <div className="uv-chart">
          <svg viewBox="0 0 900 242" role="img" aria-label="Hourly UV index forecast">
            <defs>
              <linearGradient id="mockup-uv-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#3fb98a" stopOpacity=".32" />
                <stop offset="48%" stopColor="#e8b93f" stopOpacity=".18" />
                <stop offset="100%" stopColor="#3fb98a" stopOpacity=".04" />
              </linearGradient>
            </defs>
            {[30, 88, 146].map((y) => <line className="uv-chart-gridline" key={y} x1="0" x2="900" y1={y} y2={y} />)}
            <path className="uv-chart-area" d={area} />
            <path className="uv-chart-line" d={line} />
            {chartPoints.map((point, index) => (
              <g key={hourlyLabels[index]}>
                <circle className="uv-chart-dot" cx={point.x} cy={point.y} r={index === peakIndex ? 5 : 3.5} fill={level(hourlyValues[index]).color} />
                {index === peakIndex && <text className="uv-chart-peak-label" x={point.x} y={point.y - 13} textAnchor="middle">2.4</text>}
                <text className="uv-chart-value" x={point.x} y="220" textAnchor="middle">{hourlyValues[index]}</text>
                <text className="uv-chart-hour-label" x={point.x} y="239" textAnchor="middle">{hourlyLabels[index]}</text>
              </g>
            ))}
          </svg>
        </div>
      </section>

      <section className="uv-card uv-days-card">
        <div className="uv-subheading"><span className="uv-axis-label">7-day outlook</span></div>
        <div className="uv-days-scroll">
          <div className="uv-days">
            {dailyValues.map((value, index) => (
              <div className="uv-day" key={dailyLabels[index]}>
                <span className="uv-day-name">{dailyLabels[index]}</span>
                <span className="uv-day-score" style={{ color: level(value).color }}>{value}</span>
                <div className="uv-day-meter"><div className="uv-day-fill" style={{ height: `${(value / 11) * 100}%`, background: level(value).color }} /></div>
                <span className="uv-day-level">{level(value).label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="uv-legend">
        <span><i className="legend-low" />Low</span>
        <span><i className="legend-moderate" />Moderate</span>
        <span><i className="legend-high" />High</span>
        <span><i className="legend-extreme" />Very high+</span>
      </div>
    </div>
  );
}