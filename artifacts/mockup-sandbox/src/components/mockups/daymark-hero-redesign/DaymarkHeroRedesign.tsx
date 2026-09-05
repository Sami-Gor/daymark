import { CloudSun, Glasses, LocateFixed, Navigation, Umbrella } from 'lucide-react';
import './_group.css';

export function DaymarkHeroRedesign() {
  return (
    <div className="daymark-hero-mockup">
      <header className="hero-topbar">
        <div className="hero-brand" aria-label="Daymark weather">
          <div className="hero-brand-mark"><CloudSun size={21} strokeWidth={1.8} /></div>
          <div><div className="hero-brand-name">daymark</div><div className="hero-brand-note">weather, simply</div></div>
        </div>
        <div className="hero-actions">
          <div className="hero-unit-switch" aria-label="Temperature unit">
            <button type="button">°C</button><button type="button">°F</button>
          </div>
          <div className="hero-locate-icon" aria-label="Use my location"><LocateFixed size={17} /></div>
        </div>
      </header>

      <section className="hero-grid" aria-labelledby="hero-place-title">
        <div className="hero-location">
          <h1 className="hero-place-title" id="hero-place-title">Your location</h1>
          <div className="hero-date">Friday, September 4</div>
          <div className="hero-advice-grid">
            <article className="hero-advice-card hero-advice-no">
              <Umbrella className="hero-advice-icon" size={19} strokeWidth={1.7} />
              <span className="hero-advice-label">Umbrella?</span>
              <strong>No</strong>
              <small>Rain unlikely today</small>
            </article>
            <article className="hero-advice-card hero-advice-yes">
              <Glasses className="hero-advice-icon" size={19} strokeWidth={1.7} />
              <span className="hero-advice-label">Sunglasses?</span>
              <strong>Yes</strong>
              <small>Bright &amp; clear</small>
            </article>
          </div>
          <button className="hero-location-link" type="button"><Navigation size={13} />Use my location</button>
        </div>
        <div className="hero-temp-block">
          <div className="hero-temp">20°<sup>C</sup></div>
          <div className="hero-feels">Feels like<strong>19°</strong><span className="hero-condition">Mostly clear</span><span className="hero-updated">Updated 1 AM</span></div>
        </div>
      </section>
    </div>
  );
}