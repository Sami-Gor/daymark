import { AlertTriangle } from 'lucide-react';
import { useLocale } from '@/hooks/use-locale';

export function WeatherError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useLocale();
  return (
    <div className="error-panel" role="alert" data-testid="status-weather-error">
      <AlertTriangle size={25} strokeWidth={1.7} />
      <h1>{t('error.title')}</h1>
      <p>{message} {t('error.suffix')}</p>
      <button className="retry-button" onClick={onRetry} data-testid="button-retry-weather">{t('error.retry')}</button>
    </div>
  );
}
