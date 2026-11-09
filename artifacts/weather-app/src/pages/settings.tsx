import { Link } from 'wouter';
import { NarrationSettings } from '@/components/settings/NarrationSettings';
import { useLocale } from '@/hooks/use-locale';

/*
 * Android-facing settings surface. The narration row is the only setting for
 * now; it is also rendered on the web demo so the row explains that on-device
 * narration is Android-only. Opening this page never downloads anything.
 */
export default function SettingsPage() {
  const { t } = useLocale();
  return (
    <div className="weather-app">
      <div className="app-shell">
        <main className="settings-page" aria-labelledby="settings-title">
          <Link href="/" className="settings-back" data-testid="settings-back">
            {t('settings.back')}
          </Link>
          <h1 id="settings-title" className="settings-title">{t('settings.title')}</h1>
          <NarrationSettings />
        </main>
      </div>
    </div>
  );
}
