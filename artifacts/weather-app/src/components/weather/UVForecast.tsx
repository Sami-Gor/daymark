import { shortDay, timeLabel, uvColor, uvLevel, uvValue, type WeatherPayload } from '@/lib/weather';

export function UVForecast({ weather }: { weather: WeatherPayload }) {
  const current = weather.current ?? {};
  const hourly = weather.hourly ?? {};
  const daily = weather.daily ?? {};
  const hourlyTimes = hourly.time ?? [];
  const currentTime = current.time ? Date.parse(current.time) : Date.now();
  const firstDaylightIndex = hourlyTimes.findIndex((time, index) => (
    Date.parse(time) >= currentTime && (hourly.uv_index?.[index] ?? 0) > 0
  ));
  const fallbackStart = Math.max(0, hourlyTimes.findIndex((time) => Date.parse(time) >= currentTime));
  const daylightStart = firstDaylightIndex >= 0 ? firstDaylightIndex : fallbackStart;
  const hourIndexes = Array.from(
    { length: Math.min(10, Math.max(0, hourlyTimes.length - daylightStart)) },
    (_, index) => daylightStart + index,
  );
  const currentUv = current.uv_index;
  const currentLevel = uvLevel(currentUv);
  const peakUv = daily.uv_index_max?.[0];
  const peakLevel = uvLevel(peakUv);
  const peakHour = hourlyTimes.reduce<{ value: number; time?: string } | null>((best, time, index) => {
    const value = hourly.uv_index?.[index];
    if (value == null || Number.isNaN(value)) return best;
    if (Date.parse(time) < currentTime || (best && value <= best.value)) return best;
    return { value, time };
  }, null);

  return (
    <section className="uv-wide" aria-labelledby="uv-title">
      <div className="section-heading">
        <h2 className="section-title" id="uv-title">Sun on your skin</h2>
        <span className="section-meta">UV forecast</span>
      </div>
      <div className="panel uv-panel" data-testid="panel-uv-forecast">
        <div className="uv-compact-summary">
          <div className="uv-score-block" role="img" aria-label={`Current UV index ${uvValue(currentUv)}`}>
            <span className="uv-kicker">Current UV index</span>
            <div className="uv-score-line">
              <strong className={currentLevel.className} data-testid="text-current-uv">{uvValue(currentUv)}</strong>
              <div className={`uv-badge ${currentLevel.className}`}>{currentLevel.label}</div>
            </div>
          </div>
          <div className="uv-summary-copy">
            <p>{currentLevel.guidance}</p>
            <small>Protection advice updates with the daylight.</small>
          </div>
          <div className="uv-peak">
            <span>Today’s peak</span>
            <strong>{uvValue(peakUv)} <em>{peakLevel.label}</em></strong>
            {peakHour?.time && <small>around {timeLabel(peakHour.time)}</small>}
          </div>
          <div className="uv-range" role="img" aria-label="UV index protection range from 0 to 11 plus">
            <div className="uv-range-heading"><span>Protection range</span><span>0—11+</span></div>
            <div className="uv-scale">
              <div className="uv-scale-segment uv-scale-low" />
              <div className="uv-scale-segment uv-scale-moderate" />
              <div className="uv-scale-segment uv-scale-high" />
              <div className="uv-scale-segment uv-scale-extreme" />
              <i className="uv-scale-marker" style={{ left: `${Math.min(100, Math.max(0, ((currentUv ?? 0) / 11) * 100))}%`, background: uvColor(currentUv) }} />
            </div>
            <div className="uv-range-labels"><span>Low</span><span>Moderate</span><span>High</span><span>Very high+</span></div>
          </div>
        </div>

        <div className="uv-timeline-wrap">
          <div className="uv-subheading"><span>Today by hour</span><span>index</span></div>
          {hourIndexes.length ? (
            <div className="uv-hour-strip" data-testid="list-hourly-uv" role="img" aria-label="Hourly UV index forecast" tabIndex={0}>
              {hourIndexes.map((index, itemIndex) => {
                const value = hourly.uv_index?.[index];
                return (
                  <div className={`uv-hour${itemIndex === 0 ? ' uv-hour-current' : ''}`} key={`${hourlyTimes[index]}-${index}`} data-testid={`uv-hour-${index}`}>
                    <span>{itemIndex === 0 ? 'Now' : timeLabel(hourlyTimes[index])}</span>
                    <strong style={{ color: uvColor(value) }}>{uvValue(value)}</strong>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="uv-empty">Hourly UV detail is unavailable right now.</p>
          )}
        </div>

        <div className="uv-days-wrap" tabIndex={0} role="group" aria-label="3-day UV outlook, scrolls horizontally">
          <div className="uv-subheading"><span>3-day outlook</span><span>peak index</span></div>
          <div className="uv-days" data-testid="list-daily-uv">
            {(daily.time ?? []).slice(0, 3).map((day, index) => {
              const value = daily.uv_index_max?.[index];
              const level = uvLevel(value);
              return (
                <div className="uv-day" key={day} data-testid={`row-uv-${index}`}>
                  <span className="uv-day-name">{shortDay(day, index)}</span>
                  <span className={`uv-day-score ${level.className}`}>{uvValue(value)}</span>
                  <div className="uv-day-meter">
                    <div className={`uv-day-fill ${level.className}`} style={{ height: `${Math.max(4, Math.min(100, ((value ?? 0) / 11) * 100))}%` }} />
                  </div>
                  <span className="uv-day-level">{level.label}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="uv-legend">
          <span><i className="legend-low" />Low</span>
          <span><i className="legend-moderate" />Moderate</span>
          <span><i className="legend-high" />High</span>
          <span><i className="legend-extreme" />Very high+</span>
        </div>
      </div>
    </section>
  );
}
