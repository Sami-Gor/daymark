import { useLocale } from '@/hooks/use-locale';

export function LoadingState() {
  const { t } = useLocale();
  return (
    <main className="loading-layout" aria-label={t('loading.aria')}>
      <p className="sr-only" role="status">{t('loading.status')}</p>
      <div aria-hidden="true">
        <div className="skeleton" style={{ width: 115, height: 13 }} />
        <div className="skeleton" style={{ width: 'min(70vw, 620px)', height: 90, marginTop: 24 }} />
        <div className="skeleton" style={{ width: 155, height: 14, marginTop: 14 }} />
        <div className="skeleton" style={{ width: 240, height: 104, marginTop: 44 }} />
        <div className="loading-panels">
          <div className="skeleton" style={{ height: 170 }} />
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      </div>
    </main>
  );
}
