import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { Check, Download, RotateCw, ShieldCheck, Volume2 } from 'lucide-react';
import { DaymarkVoice } from '@/lib/daymark-voice';
import { useLocale } from '@/hooks/use-locale';
import type { Locale, Translate, TranslationKey } from '@/lib/i18n';
import {
  ENGLISH_VOICE,
  FRENCH_VOICE,
  NarrationSettingsController,
  formatBytes,
  isFrenchReady,
  isInstalling,
  narrationErrorKey,
  type NarrationSettingsState,
} from './narration-settings-controller';

export interface NarrationSettingsActions {
  requestDownload: () => void;
  cancelConsent: () => void;
  confirmDownload: () => void;
  cancelInstall: () => void;
  retry: () => void;
  selectVoice: (voiceId: string) => void;
}

export interface NarrationSettingsViewProps {
  state: NarrationSettingsState;
  t: Translate;
  locale: Locale;
  actions: NarrationSettingsActions;
  /** False on the web demo where the native plugin is not available. */
  isAndroidNative: boolean;
}

function phaseLabel(phase: NarrationSettingsState['phase']): TranslationKey {
  switch (phase) {
    case 'downloading':
      return 'narration.phase.downloading';
    case 'verifying':
      return 'narration.phase.verifying';
    case 'installing':
      return 'narration.phase.installing';
    case 'activating':
      return 'narration.phase.activating';
    case 'registering':
      return 'narration.phase.registering';
    case 'ready':
      return 'narration.ready';
    case 'failed':
      return 'narration.failed';
    default:
      return 'narration.phase.readyToDownload';
  }
}

function progressBytes(state: NarrationSettingsState, locale: Locale): string {
  const received = formatBytes(state.bytesReceived, locale);
  const total = formatBytes(state.totalBytes, locale);
  if (total && received) {
    return `${received} / ${total}`;
  }
  return received || total;
}

/**
 * Pure presentation of the narration settings row. The container below supplies
 * the controller snapshot, so every state (consent, progress, failure, READY)
 * can be rendered and asserted without a browser DOM.
 */
export function NarrationSettingsView({
  state,
  t,
  locale,
  actions,
  isAndroidNative,
}: NarrationSettingsViewProps) {
  const frenchReady = isFrenchReady(state);
  const installing = isInstalling(state);
  const size = state.info ? formatBytes(state.info.sizeBytes, locale) : '';
  const bytes = progressBytes(state, locale);

  return (
    <section
      className="narration-settings panel"
      aria-labelledby="narration-settings-title"
      data-testid="narration-settings"
    >
      <div className="narration-heading">
        <span className="narration-heading-icon" aria-hidden="true"><Volume2 size={18} /></span>
        <div>
          <h2 id="narration-settings-title" className="narration-title">{t('narration.title')}</h2>
          <p className="narration-description">{t('narration.description')}</p>
        </div>
      </div>

      {!isAndroidNative && (
        <p className="narration-note" role="status" data-testid="narration-android-only">
          {t('narration.androidOnly')}
        </p>
      )}

      {state.loading ? (
        <p className="narration-note" role="status" data-testid="narration-loading">
          {t('narration.loading')}
        </p>
      ) : (
        <fieldset className="narration-voice-list" disabled={!isAndroidNative}>
          <legend className="sr-only">{t('narration.voiceLegend')}</legend>

          <label
            className={`narration-voice-row${state.selectedVoice === ENGLISH_VOICE ? ' selected' : ''}`}
            data-testid="narration-voice-english"
          >
            <input
              type="radio"
              name="narration-voice"
              value={ENGLISH_VOICE}
              checked={state.selectedVoice === ENGLISH_VOICE}
              onChange={() => actions.selectVoice(ENGLISH_VOICE)}
              data-testid="narration-radio-english"
            />
            <span className="narration-voice-copy">
              <strong>{t('narration.english')}</strong>
              <span>{t('narration.builtIn')}</span>
            </span>
            <span className="narration-badge available">{t('narration.available')}</span>
          </label>

          {state.sourceConfigured && (
            <div className="narration-voice-block" data-testid="narration-voice-french">
              <label
                className={`narration-voice-row${state.selectedVoice === FRENCH_VOICE ? ' selected' : ''}${frenchReady ? '' : ' unavailable'}`}
                data-testid="narration-voice-french-row"
              >
                <input
                  type="radio"
                  name="narration-voice"
                  value={FRENCH_VOICE}
                  checked={state.selectedVoice === FRENCH_VOICE}
                  disabled={!frenchReady}
                  onChange={() => actions.selectVoice(FRENCH_VOICE)}
                  data-testid="narration-radio-french"
                />
                <span className="narration-voice-copy">
                  <strong>{t('narration.french')}</strong>
                  <span data-testid="narration-size">
                    {size ? t('narration.size', { size }) : t('narration.sizeUnknown')}
                  </span>
                </span>
                <span className={`narration-badge${frenchReady ? ' ready' : ''}`} data-testid="narration-state">
                  {frenchReady && <Check size={12} aria-hidden="true" />}
                  {frenchReady ? t('narration.ready') : t(phaseLabel(state.phase))}
                </span>
              </label>

              <p className="narration-licence" data-testid="narration-licence">
                <ShieldCheck size={13} aria-hidden="true" />
                <span>
                  {t('narration.licenceNote')}{' '}
                  <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" data-testid="narration-licence-link">
                    {t('narration.licenceLink')}
                  </a>
                  {' · '}
                  <a href="https://doi.org/10.7488/ds/1705" target="_blank" rel="noreferrer" data-testid="narration-doi-link">
                    {t('narration.doiLink')}
                  </a>
                </span>
              </p>

              {isAndroidNative && !frenchReady && !installing && state.phase !== 'failed' && (
                <button
                  type="button"
                  className="narration-action primary"
                  onClick={actions.requestDownload}
                  disabled={!state.info}
                  data-testid="narration-download"
                >
                  <Download size={14} aria-hidden="true" />
                  {t('narration.download')}
                </button>
              )}

              {installing && (
                <div
                  className="narration-progress"
                  role="status"
                  aria-live="polite"
                  data-testid="narration-progress"
                >
                  <div className="narration-progress-labels">
                    <span>{t(phaseLabel(state.phase))}</span>
                    {state.percentage !== null && (
                      <span data-testid="narration-percentage">
                        {t('narration.percent', { percent: Math.round(state.percentage) })}
                      </span>
                    )}
                  </div>
                  {state.percentage !== null ? (
                    <div
                      className="narration-progress-track"
                      role="progressbar"
                      aria-label={t('narration.progressLabel')}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(state.percentage)}
                      data-testid="narration-progressbar"
                    >
                      <span style={{ width: `${Math.max(0, Math.min(100, state.percentage))}%` }} />
                    </div>
                  ) : (
                    <div
                      className="narration-progress-track indeterminate"
                      role="progressbar"
                      aria-label={t('narration.progressLabel')}
                      data-testid="narration-progressbar"
                    />
                  )}
                  {bytes && (
                    <div className="narration-progress-bytes" data-testid="narration-bytes">
                      {bytes}
                    </div>
                  )}
                  <button
                    type="button"
                    className="narration-action"
                    onClick={actions.cancelInstall}
                    data-testid="narration-cancel-install"
                  >
                    {t('narration.cancel')}
                  </button>
                </div>
              )}

              {state.phase === 'failed' && (
                <div className="narration-failure" role="alert" data-testid="narration-error">
                  <p>{t(narrationErrorKey(state.errorCode))}</p>
                  <button
                    type="button"
                    className="narration-action"
                    onClick={actions.retry}
                    data-testid="narration-retry"
                  >
                    <RotateCw size={13} aria-hidden="true" />
                    {t('narration.retry')}
                  </button>
                </div>
              )}

              {frenchReady && (
                <p className="narration-ready-note" data-testid="narration-ready-note">
                  {t('narration.readyNote')}
                </p>
              )}
            </div>
          )}
        </fieldset>
      )}

      {!state.loading && !state.sourceConfigured && (
        <p className="narration-note" role="status" data-testid="narration-unconfigured">
          {state.infoErrorCode === 'native-unavailable'
            ? t('narration.androidOnly')
            : t('narration.unavailable')}
        </p>
      )}

      {state.consentOpen && (
        <div className="narration-consent-backdrop" data-testid="narration-consent">
          <div
            className="narration-consent-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="narration-consent-title"
            data-testid="narration-consent-dialog"
          >
            <h3 id="narration-consent-title">{t('narration.consentTitle')}</h3>
            <p>{t('narration.consentBody', { size: size || t('narration.sizeUnknown') })}</p>
            <p className="narration-consent-network" data-testid="narration-consent-network">
              {t('narration.consentNetwork')}
            </p>
            <p className="narration-consent-licence">{t('narration.consentLicence')}</p>
            <div className="narration-consent-actions">
              <button
                type="button"
                className="narration-action"
                onClick={actions.cancelConsent}
                data-testid="narration-consent-cancel"
              >
                {t('narration.consentCancel')}
              </button>
              <button
                type="button"
                className="narration-action primary"
                onClick={actions.confirmDownload}
                data-testid="narration-consent-confirm"
              >
                <Download size={14} aria-hidden="true" />
                {t('narration.consentConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Settings row container. It reads the native bridge once, renders the
 * controller snapshot and tears the progress listener down on unmount. Nothing
 * is downloaded until the user opens and confirms the consent dialog.
 */
export function NarrationSettings() {
  const { t, locale, setLocale } = useLocale();
  const controllerRef = useRef<NarrationSettingsController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new NarrationSettingsController(DaymarkVoice);
  }
  const controller = controllerRef.current;
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    controller.start();
    return () => controller.dispose();
  }, [controller]);

  // Keep the radio in step with the app locale: French is only applied when
  // the controller (backed by getVoiceStates) considers it ready.
  useEffect(() => {
    if (locale === 'fr') {
      controller.selectVoice(FRENCH_VOICE);
    } else {
      controller.selectVoice(ENGLISH_VOICE);
    }
  }, [controller, locale, state.states]);

  const actions = useMemo<NarrationSettingsActions>(() => ({
    requestDownload: () => controller.requestDownload(),
    cancelConsent: () => controller.cancelConsent(),
    confirmDownload: () => controller.confirmDownload(),
    cancelInstall: () => controller.cancelInstall(),
    retry: () => controller.retry(),
    selectVoice: (voiceId: string) => {
      if (voiceId === FRENCH_VOICE) {
        controller.selectVoice(FRENCH_VOICE);
        if (controller.getSnapshot().selectedVoice === FRENCH_VOICE) {
          setLocale('fr');
        }
      } else {
        controller.selectVoice(ENGLISH_VOICE);
        setLocale('en');
      }
    },
  }), [controller, setLocale]);

  const isAndroidNative = Capacitor.isNativePlatform()
    && Capacitor.getPlatform() === 'android';

  return (
    <NarrationSettingsView
      state={state}
      t={t}
      locale={locale}
      actions={actions}
      isAndroidNative={isAndroidNative}
    />
  );
}
