import { Droplets } from 'lucide-react';
import { displayTemp, timeLabel, weatherIcon, type Unit, type WeatherPayload } from '@/lib/weather';

export function HourlyOutlook({ weather, unit }: { weather: WeatherPayload; unit: Unit }) {
  const hourly = weather.hourly ?? {};
  const times = hourly.time ?? [];
  const currentTime = weather.current?.time ? Date.parse(weather.current.time) : Date.now();
  const start = Math.max(0, times.findIndex((time) => Date.parse(time) >= currentTime));
  const indexes = Array.from({ length: Math.min(12, times.length - start) }, (_, index) => start + index);
  return (
    <section aria-labelledby="hourly-title">
      <div className="section-heading">
        <h2 className="section-title" id="hourly-title">The next few hours</h2>
        <span className="section-meta">hour by hour</span>
      </div>
      <div className="panel hourly-scroll" data-testid="list-hourly-forecast" tabIndex={0} role="group" aria-label="Hourly forecast, scrolls horizontally">
        {indexes.length ? indexes.map((index, itemIndex) => {
          const code = hourly.weather_code?.[index] ?? 0;
          const Icon = weatherIcon(code, true);
          return (
            <div className={`hour-card${itemIndex === 0 ? ' active' : ''}`} key={`${times[index]}-${index}`} data-testid={`card-hour-${index}`}>
              <span className="hour-time">{itemIndex === 0 ? 'Now' : timeLabel(times[index])}</span>
              <Icon size={21} className="condition-icon" strokeWidth={1.7} />
              <span className="hour-temp">{displayTemp(hourly.temperature_2m?.[index], unit)}</span>
              <span className="hour-rain"><Droplets size={10} />{hourly.precipitation_probability?.[index] ?? 0}%</span>
            </div>
          );
        }) : <p style={{ padding: 22, color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>Hourly detail is unavailable right now.</p>}
      </div>
    </section>
  );
}
