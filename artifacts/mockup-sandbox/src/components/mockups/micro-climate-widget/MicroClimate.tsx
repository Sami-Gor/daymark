import { ArrowDown, ArrowUp, Droplets, Gauge, Thermometer } from 'lucide-react';
import './_group.css';

const rows = [
  { label: 'Temperature', icon: Thermometer, regional: '20.0°C', nearby: '20.8°C', delta: '+0.8°C grid', distance: 'UKV model grid: 0.3 km away', tone: 'neutral', unavailable: false },
  { label: 'Rainfall now', icon: Droplets, regional: '0.0 mm', nearby: '0.2 mm', delta: '+0.2 mm grid', distance: 'UKV model grid: 0.3 km away', tone: 'amber', unavailable: false },
  { label: 'Air quality', icon: Gauge, regional: '22 US AQI', nearby: 'No nearby sensor', delta: 'Regional only', distance: 'Nearest air sensor: unavailable', tone: 'muted', unavailable: true },
];

export function MicroClimate() {
  return (
    <div className="micro-mockup">
      <div className="micro-heading"><h2>Your Micro-Climate</h2><span className="micro-meta">vs. regional forecast</span></div>
      <section className="micro-panel">
        <div className="micro-intro">
          <span className="micro-kicker">Local variance check</span>
          <p>One nearby model grid point can feel different from the broader city forecast. This is a comparison, not block-level precision.</p>
          <strong>UKV model grid</strong>
        </div>
        <div className="micro-rows">
          {rows.map(({ label, icon: Icon, regional, nearby, delta, distance, tone, unavailable }) => {
            const DeltaIcon = unavailable ? null : tone === 'amber' ? ArrowUp : ArrowDown;
            return (
              <div className={`micro-row${unavailable ? ' micro-row-unavailable' : ''}`} key={label}>
                <div className="micro-metric"><Icon size={17} strokeWidth={1.7} /><strong>{label}</strong></div>
                <div className="micro-value-group">
                  <span className="micro-value"><small>Regional</small><b>{regional}</b></span>
                  <span className="micro-value"><small>{unavailable ? 'Nearby sensor' : 'Nearby model'}</small><b>{nearby}</b></span>
                </div>
                <div className={`micro-delta${tone === 'amber' ? ' micro-delta-amber' : ''}${tone === 'muted' ? ' micro-delta-muted' : ''}`}>
                  {DeltaIcon ? <DeltaIcon size={13} strokeWidth={2} /> : null}<span>{delta}</span>
                </div>
                <small className="micro-distance">{distance}</small>
              </div>
            );
          })}
        </div>
        <p className="micro-fallback">No nearby micro-sensor data available for air quality — showing regional forecast only.</p>
      </section>
    </div>
  );
}