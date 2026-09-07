import { displayTemp, dateLabel, shortDay, weatherIcon, type Unit, type WeatherPayload } from '@/lib/weather';

export function DailyForecast({ weather, unit }: { weather: WeatherPayload; unit: Unit }) {
  const daily = weather.daily ?? {};
  const days = daily.time ?? [];
  return (
    <section aria-labelledby="daily-title">
      <div className="section-heading">
        <h2 className="section-title" id="daily-title">A look ahead</h2>
        <span className="section-meta">3 days</span>
      </div>
      <div className="panel forecast-panel" data-testid="list-daily-forecast">
        {days.length ? days.slice(0, 3).map((day, index) => {
          const Icon = weatherIcon(daily.weather_code?.[index] ?? 0, true);
          return (
            <div className="day-row" key={day} data-testid={`row-forecast-${index}`}>
              <div className="day-name">{shortDay(day, index)}<span className="day-date">{dateLabel(day)}</span></div>
              <Icon className="day-icon" size={21} strokeWidth={1.7} />
              <div className="temps"><span className="high">{displayTemp(daily.temperature_2m_max?.[index], unit)}</span><span className="low">{displayTemp(daily.temperature_2m_min?.[index], unit)}</span></div>
              <div className="rain-chance">{daily.precipitation_probability_max?.[index] ?? 0}% rain</div>
            </div>
          );
        }) : <p style={{ padding: 22, color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>The extended outlook is unavailable right now.</p>}
      </div>
    </section>
  );
}
