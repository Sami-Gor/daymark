import { Glasses, Umbrella } from 'lucide-react';

import { useLocale } from '@/hooks/use-locale';
import type { WeatherAdvice } from '@/lib/weather';

/*
 * The detailed umbrella/sunglasses cards, moved out of the Today hero and into
 * the scrollable detail stack. The design is unchanged.
 */
export function WeatherAdviceCards({ umbrellaAdvice, sunglassesAdvice }: {
  umbrellaAdvice: WeatherAdvice;
  sunglassesAdvice: WeatherAdvice;
}) {
  const { t } = useLocale();
  return (
    <div className="advice-row">
      <article className={`advice-card advice-${umbrellaAdvice.tone}`} data-testid="card-umbrella-advice">
        <Umbrella className="advice-icon" size={19} strokeWidth={1.7} />
        <span className="advice-label">{t('current.umbrella')}</span>
        <strong data-testid="text-umbrella-advice">{umbrellaAdvice.answer}</strong>
        <small>{umbrellaAdvice.reason}</small>
      </article>
      <article className={`advice-card advice-${sunglassesAdvice.tone}`} data-testid="card-sunglasses-advice">
        <Glasses className="advice-icon" size={19} strokeWidth={1.7} />
        <span className="advice-label">{t('current.sunglasses')}</span>
        <strong data-testid="text-sunglasses-advice">{sunglassesAdvice.answer}</strong>
        <small>{sunglassesAdvice.reason}</small>
      </article>
    </div>
  );
}
