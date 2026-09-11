import { CloudSun, LocateFixed } from 'lucide-react';
import { LOCALES, isLocale, type Locale } from '@/lib/i18n';
import type { Unit } from '@/lib/weather';
import { useLocale } from '@/hooks/use-locale';

export function TopBar({ unit, onUnitChange, onFindMe, isLocating }: {
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  onFindMe: () => void;
  isLocating: boolean;
}) {
  const { locale, setLocale, t } = useLocale();
  const localeLabel = (value: Locale) => t(value === 'en' ? 'topbar.english' : value === 'fr' ? 'topbar.french' : 'topbar.spanish');
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark"><CloudSun size={21} strokeWidth={1.8} /></div>
        <div><div className="brand-name">daymark</div><div className="brand-note">{t('brand.note')}</div></div>
      </div>
      <div className="top-actions">
        <label className="locale-select-wrap">
          <span className="sr-only">{t('topbar.language')}</span>
          <select
            className="locale-select"
            value={locale}
            onChange={(event) => {
              if (isLocale(event.target.value)) setLocale(event.target.value);
            }}
            aria-label={t('topbar.language')}
            data-testid="select-language"
          >
            {LOCALES.map((value) => (
              <option key={value} value={value}>{localeLabel(value)}</option>
            ))}
          </select>
        </label>
        <div className="unit-switch" role="group" aria-label={t('topbar.unitLabel')}>
          <button className={`unit-button${unit === 'celsius' ? ' active' : ''}`} onClick={() => onUnitChange('celsius')} aria-pressed={unit === 'celsius'} data-testid="button-unit-celsius">°C</button>
          <button className={`unit-button${unit === 'fahrenheit' ? ' active' : ''}`} onClick={() => onUnitChange('fahrenheit')} aria-pressed={unit === 'fahrenheit'} data-testid="button-unit-fahrenheit">°F</button>
        </div>
        <button className="icon-button" onClick={onFindMe} aria-label={t('topbar.useLocation')} title={t('topbar.useLocation')} data-testid="button-use-location">
          <LocateFixed size={17} className={isLocating ? 'animate-pulse' : ''} />
        </button>
      </div>
    </header>
  );
}
