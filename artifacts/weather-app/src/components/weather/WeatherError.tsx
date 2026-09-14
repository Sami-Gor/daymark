import { AlertTriangle } from 'lucide-react';

import { useLocale } from '@/hooks/use-locale';
import type { TranslationKey } from '@/lib/i18n';
import type { WeatherFetchErrorCode } from '@/lib/weather';

export type WeatherErrorCode = WeatherFetchErrorCode | 'unknown';

/*
 * Localized user-facing copy for each typed weather error. Raw browser/network
 * messages ("Failed to fetch") are never rendered; they stay in DEV logs.
 */
export const WEATHER_ERROR_KEYS: Record<WeatherErrorCode, TranslationKey> = {
  network: 'error.network',
  timeout: 'error.timeout',
  http: 'error.http',
  malformed: 'error.malformed',
  unknown: 'error.unknown',
};

export function WeatherError({ code, onRetry }: { code: WeatherErrorCode; onRetry: () => void }) {
  const { t } = useLocale();
  return (
    <div className="error-panel" role="alert" data-testid="status-weather-error">
      <AlertTriangle size={25} strokeWidth={1.7} />
      <h1>{t('error.title')}</h1>
      <p>{t(WEATHER_ERROR_KEYS[code])} {t('error.suffix')}</p>
      <button className="retry-button" onClick={onRetry} data-testid="button-retry-weather">{t('error.retry')}</button>
    </div>
  );
}
