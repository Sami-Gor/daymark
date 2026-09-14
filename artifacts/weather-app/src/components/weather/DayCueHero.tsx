import { useLocale } from '@/hooks/use-locale';
import type { DayCueResult } from '@/lib/day-cue';

/*
 * The visual answer of the Today screen: one large emoji (or two for mixed
 * days) with no explanatory text. The accessibility label carries the meaning
 * for screen readers.
 */
export function DayCueHero({ cue }: { cue: DayCueResult }) {
  const { t } = useLocale();
  const cueKey = `${cue.cue}-${cue.emojis.join('-')}`;
  return (
    <div className="day-cue" role="img" aria-label={t(cue.labelKey)} data-testid="day-cue">
      <span key={`${cueKey}-lead`} className="day-cue-emoji" aria-hidden="true">{cue.emojis[0]}</span>
      {cue.emojis[1] && (
        <span key={`${cueKey}-trail`} className="day-cue-emoji day-cue-emoji-trail" aria-hidden="true">
          {cue.emojis[1]}
        </span>
      )}
    </div>
  );
}
