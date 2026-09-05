import './_group.css';

const hourlyValues = [0.2, 0.9, 1.8, 2.4, 2.1, 1.7, 1.1, 0.6, 0.2];
const hourlyLabels = ['Now', '10AM', '11AM', '12PM', '1PM', '2PM', '3PM', '4PM', '5PM'];
const dailyValues = [2.4, 3.4, 4.9, 3.9, 4.9, 4.5, 1.5];
const dailyLabels = ['Today', 'Tomorrow', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'];

function level(value: number) {
  if (value < 3) return { label: 'Low', color: '#3fb98a', className: 'uv-low' };
  if (value < 6) return { label: 'Moderate', color: '#e8b93f', className: 'uv-moderate' };
  if (value < 8) return { label: 'High', color: '#e8763f', className: 'uv-high' };
  return { label: 'Very high+', color: '#d9483f', className: 'uv-extreme' };
}

export function UVForecastRedesign() {
  const currentUv = 2.4;
  const currentLevel = level(currentUv);

  return (
    <div className="uv-mockup">
      <div className="uv-section-label"><h2>Sun on your skin</h2><span>Live UV</span></div>
      <section className="uv-card uv-compact-summary" aria-label="Current UV forecast">
        <div className="uv-score-block">
          <span className="uv-kicker">Current UV index</span>
          <div className="uv-score-line"><strong style={{ color: currentLevel.color }}>{currentUv}</strong><span className={`uv-badge ${currentLevel.className}`}>{currentLevel.label}</span></div>
        </div>
        <div className="uv-summary-copy"><p>Enjoy the daylight. Protection is usually not needed.</p><small>Protection advice updates with the daylight.</small></div>
        <div className="uv-peak"><span>Today’s peak</span><strong>2.4 <em>Low</em></strong><small>around 2 PM</small></div>
        <div className="uv-range">
          <div className="uv-range-heading"><span>Protection range</span><span>0—11+</span></div>
          <div className="uv-scale"><div className="uv-scale-segment uv-scale-low" /><div className="uv-scale-segment uv-scale-moderate" /><div className="uv-scale-segment uv-scale-high" /><div className="uv-scale-segment uv-scale-extreme" /><i className="uv-scale-marker" style={{ left: `${(currentUv / 11) * 100}%`, background: currentLevel.color }} /></div>
          <div className="uv-range-labels"><span>Low</span><span>Moderate</span><span>High</span><span>Very high+</span></div>
        </div>
      </section>
      <section className="uv-card uv-timeline-card">
        <div className="uv-subheading"><span className="uv-axis-label">Today by hour</span><span className="uv-axis-label">index</span></div>
        <div className="uv-hour-strip">
          {hourlyValues.map((value, index) => (
            <div className={`uv-hour${index === 0 ? ' uv-hour-current' : ''}`} key={hourlyLabels[index]}>
              <span>{hourlyLabels[index]}</span><strong style={{ color: level(value).color }}>{value}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="uv-card uv-days-card">
        <div className="uv-subheading"><span className="uv-axis-label">7-day outlook</span><span className="uv-axis-label">peak index</span></div>
        <div className="uv-days-scroll"><div className="uv-days">
          {dailyValues.map((value, index) => (
            <div className="uv-day" key={dailyLabels[index]}>
              <span className="uv-day-name">{dailyLabels[index]}</span><span className="uv-day-score" style={{ color: level(value).color }}>{value}</span>
              <div className="uv-day-meter"><div className="uv-day-fill" style={{ height: `${(value / 11) * 100}%`, background: level(value).color }} /></div>
              <span className="uv-day-level">{level(value).label}</span>
            </div>
          ))}
        </div></div>
      </section>
      <div className="uv-legend"><span><i className="legend-low" />Low</span><span><i className="legend-moderate" />Moderate</span><span><i className="legend-high" />High</span><span><i className="legend-extreme" />Very high+</span></div>
    </div>
  );
}