import { CloudSun, LocateFixed } from 'lucide-react';
import type { Unit } from '@/lib/weather';

export function TopBar({ unit, onUnitChange, onFindMe, isLocating }: {
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  onFindMe: () => void;
  isLocating: boolean;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark"><CloudSun size={21} strokeWidth={1.8} /></div>
        <div><div className="brand-name">daymark</div><div className="brand-note">weather, simply</div></div>
      </div>
      <div className="top-actions">
        <div className="unit-switch" role="group" aria-label="Temperature unit">
          <button className={`unit-button${unit === 'celsius' ? ' active' : ''}`} onClick={() => onUnitChange('celsius')} aria-pressed={unit === 'celsius'} data-testid="button-unit-celsius">°C</button>
          <button className={`unit-button${unit === 'fahrenheit' ? ' active' : ''}`} onClick={() => onUnitChange('fahrenheit')} aria-pressed={unit === 'fahrenheit'} data-testid="button-unit-fahrenheit">°F</button>
        </div>
        <button className="icon-button" onClick={onFindMe} aria-label="Use my location" title="Use my location" data-testid="button-use-location">
          <LocateFixed size={17} className={isLocating ? 'animate-pulse' : ''} />
        </button>
      </div>
    </header>
  );
}
