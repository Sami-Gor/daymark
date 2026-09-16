import { compareLocationTimes, getCurrentLocationTime, getLocationLocalDate, getSunProtectionWindow, shortDay, timeLabel, uvBarColor, uvColor, uvLevel, uvValue, type WeatherPayload } from '@/lib/weather';
import { useLocale } from '@/hooks/use-locale';

export function UVForecast({ weather }: { weather: WeatherPayload }) {
  const { locale, t } = useLocale();
  const current = weather.current ?? {};
  const hourly = weather.hourly ?? {};
  const daily = weather.daily ?? {};
  const hourlyTimes = hourly.time ?? [];
  const currentTime = getCurrentLocationTime(current.time, weather);
  const firstDaylightIndex = hourlyTimes.findIndex((time, index) => (
    compareLocationTimes(time, currentTime) >= 0 && (hourly.uv_index?.[index] ?? 0) > 0
  ));
  const fallbackStart = Math.max(0, hourlyTimes.findIndex((time) => compareLocationTimes(time, currentTime) >= 0));
  const daylightStart = firstDaylightIndex >= 0 ? firstDaylightIndex : fallbackStart;
  // The current hour is already the card's headline; start the strip at the next
  // hour when it matches, so the same value isn't presented twice as "Now".
  const currentHourLeads = currentTime != null
    && hourlyTimes[daylightStart] != null
    && compareLocationTimes(hourlyTimes[daylightStart], currentTime) === 0;
  const stripStart = currentHourLeads && daylightStart + 1 < hourlyTimes.length ? daylightStart + 1 : daylightStart;
  const hourIndexes = Array.from(
    { length: Math.min(5, Math.max(0, hourlyTimes.length - stripStart)) },
    (_, index) => stripStart + index,
  );
  const currentUv = current.uv_index;
  const currentLevel = uvLevel(currentUv, locale);
  const peakUv = daily.uv_index_max?.[0];
  const peakLevel = uvLevel(peakUv, locale);
  const peakHour = hourlyTimes.reduce<{ value: number; time?: string } | null>((best, time, index) => {
    const value = hourly.uv_index?.[index];
    if (value == null || Number.isNaN(value)) return best;
    if (compareLocationTimes(time, currentTime) < 0 || (best && value <= best.value)) return best;
    return { value, time };
  }, null);

  const protection = getSunProtectionWindow(hourly.time, hourly.uv_index, current.time);
  const protectionCopy = protection.status === 'window'
    ? t('uv.window.recommended', { start: timeLabel(protection.window.start, locale), end: timeLabel(protection.window.end, locale) })
    : protection.status === 'none'
      ? t('uv.window.none')
      : t('uv.window.unavailable');

  const todayPrefix = getLocationLocalDate(current.time) ?? getLocationLocalDate(hourlyTimes[0]) ?? '';
  const daylightIndexes = hourlyTimes
    .map((time, index) => ({ time, index }))
    .filter(({ time, index }) => getLocationLocalDate(time) === todayPrefix && (hourly.uv_index?.[index] ?? 0) > 0);
  // Bar heights are normalized against the day's visible peak; a minimum
  // share keeps near-zero daylight hours visible as slim dots.
  const visibleUv = daylightIndexes.map(({ index }) => Math.max(0, hourly.uv_index?.[index] ?? 0));
  const maxVisibleUv = Math.max(visibleUv.length ? Math.max(...visibleUv) : 0, 0.1);
  const minBarPercent = 12;
  const barHeight = (value: number) => Math.round(minBarPercent + (value / maxVisibleUv) * (100 - minBarPercent));
  const hourOf = (time: string) => {
    const hour = Number(time.slice(11, 13));
    return Number.isFinite(hour) ? hour : -1;
  };

  const peakAriaTime = peakHour?.time ? t('uv.peakAriaTime', { time: timeLabel(peakHour.time, locale) }) : '';

  return (
    <section className="uv-wide" aria-labelledby="uv-title">
      <div className="section-heading">
        <h2 className="section-title" id="uv-title">{t('uv.title')}</h2>
        <span className="section-meta">{t('uv.meta')}</span>
      </div>
      <div className="panel uv-panel" data-testid="panel-uv-forecast">
        <div className="uv-hero">
          <div className="uv-now" role="img" aria-label={t('uv.currentAria', { value: uvValue(currentUv, locale), level: currentLevel.label })}>
            <span className="uv-kicker">{t('uv.current')}</span>
            <div className="uv-score-line">
              <strong className={currentLevel.className} data-testid="text-current-uv">{uvValue(currentUv, locale)}</strong>
              <div className={`uv-badge ${currentLevel.className}`}>{currentLevel.label}</div>
            </div>
            <p className="uv-advice">{currentLevel.guidance}</p>
            <p
              className={`uv-window-note${protection.status === 'window' ? '' : ' uv-window-note-quiet'}`}
              data-testid="text-uv-protection-window"
            >
              {protectionCopy}
            </p>
          </div>
          <div className="uv-peak-inline" role="img" aria-label={t('uv.peakAria', { value: uvValue(peakUv, locale), level: peakLevel.label, time: peakAriaTime })}>
            <span>{t('uv.peak')}</span>
            <strong className={peakLevel.className}>{uvValue(peakUv, locale)}</strong>
            {peakHour?.time && <small>{t('uv.around', { time: timeLabel(peakHour.time, locale) })}</small>}
          </div>
        </div>

        {daylightIndexes.length > 1 && (
          <div className="uv-timeline" data-testid="uv-protection-timeline" aria-hidden="true">
            {daylightIndexes.map(({ time, index }) => {
              const value = Math.max(0, hourly.uv_index?.[index] ?? 0);
              const hour = hourOf(time);
              return (
                <span className="uv-timeline-col" key={`${time}-${index}`}>
                  <span className="uv-timeline-bar-wrap">
                    <i
                      className="uv-timeline-bar"
                      style={{ height: `${barHeight(value)}%`, background: uvBarColor(value) }}
                    />
                  </span>
                  <small className="uv-timeline-time">{hour >= 0 && hour % 3 === 0 ? timeLabel(time, locale) : ''}</small>
                </span>
              );
            })}
          </div>
        )}

        <div className="uv-subheading"><span>{t('uv.byHour')}</span></div>
        {hourIndexes.length ? (
          <div className="uv-hours" data-testid="list-hourly-uv" role="group" aria-label={t('uv.hourlyGroup')} tabIndex={0}>
            {hourIndexes.map((index) => {
              const value = hourly.uv_index?.[index];
              return (
                <div className="uv-hour" key={`${hourlyTimes[index]}-${index}`} data-testid={`uv-hour-${index}`}>
                  <span>{timeLabel(hourlyTimes[index], locale)}</span>
                  <strong style={{ color: uvColor(value) }}>{uvValue(value, locale)}</strong>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="uv-empty">{t('uv.empty')}</p>
        )}

        <div className="uv-days-wrap" tabIndex={0} role="group" aria-label={t('uv.outlookAria')}>
          <div className="uv-subheading"><span>{t('uv.outlook')}</span></div>
          <div className="uv-days" data-testid="list-daily-uv">
            {(daily.time ?? []).slice(0, 3).map((day, index) => {
              const value = daily.uv_index_max?.[index];
              const level = uvLevel(value, locale);
              return (
                <div className="uv-day" key={day} data-testid={`row-uv-${index}`}>
                  <span className="uv-day-name">{shortDay(day, index, locale)}</span>
                  <strong className={`uv-day-score ${level.className}`}>{uvValue(value, locale)}</strong>
                  <span className="uv-day-level">{level.label}</span>
                  <span className="uv-day-bar" aria-hidden="true">
                    <i style={{ width: `${Math.max(4, Math.min(100, ((value ?? 0) / 11) * 100))}%`, background: uvColor(value) }} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
