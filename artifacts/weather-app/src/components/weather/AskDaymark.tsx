import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { useSpeechRecognition } from '@/hooks/use-speech-recognition';
import { useLocale } from '@/hooks/use-locale';
import { getIntentResponse, normalizeTranscript, resolveIntentTranscript } from '@/lib/weather-intents';
import { SPEECH_LANGS } from '@/lib/i18n';
import type { Place, Unit, WeatherPayload } from '@/lib/weather';

type Exchange = { question: string; answer: string };

/*
 * "Ask Daymark" microphone control (localized).
 *
 * Pipeline: SpeechRecognition adapter -> normalized transcript ->
 * deterministic intent resolver -> getIntentResponse(...) -> visible answer
 * (and optional spoken reply through the shared playback controller).
 *
 * Only the latest exchange is kept in state — no history, no storage, no logs.
 */
export function AskDaymark({ weather, place, unit, narrationActive, speak, stopSpeech }: {
  weather: WeatherPayload;
  place: Place;
  unit: Unit;
  narrationActive: boolean;
  speak: (text: string, lang?: string) => boolean;
  stopSpeech: () => void;
}) {
  const { locale, t } = useLocale();
  const recognition = useSpeechRecognition();
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const pendingSpoken = useRef('');

  // Narration and microphone capture must never run together; the opposite
  // direction (listening stops playback) is handled in the ask handler.
  useEffect(() => {
    if (narrationActive && recognition.isListening) recognition.stop();
  }, [narrationActive, recognition.isListening, recognition.stop]);

  // Speak the answer only after recognition has fully stopped, so the
  // microphone never picks up Daymark's own reply.
  useEffect(() => {
    if (recognition.isListening) return;
    const text = pendingSpoken.current;
    if (!text) return;
    pendingSpoken.current = '';
    speak(text, SPEECH_LANGS[locale]);
  }, [recognition.isListening, speak, locale]);

  if (!recognition.supported) return null;

  const ask = () => {
    stopSpeech(); // never compete with the "Hear today" playback
    setExchange(null);
    pendingSpoken.current = '';
    recognition.start({
      lang: SPEECH_LANGS[locale],
      locale,
      onTranscript: (transcript) => {
        const question = normalizeTranscript(transcript);
        const intent = resolveIntentTranscript(question);
        if (!intent) {
          setExchange({ question, answer: t('ask.unknown') });
          return;
        }
        const response = getIntentResponse(intent, weather, { locationName: place.name, unit, locale });
        setExchange({ question, answer: response.spokenText });
        pendingSpoken.current = response.spokenText;
      },
    });
  };

  const listening = recognition.isListening;

  return (
    <>
      <button
        type="button"
        className="local-button ask-button"
        onClick={listening ? recognition.stop : ask}
        aria-label={listening ? t('ask.ariaStop') : t('ask.ariaStart')}
        aria-pressed={listening}
        data-testid="button-ask-daymark"
      >
        {listening ? <Square size={11} /> : <Mic size={13} />}
        {listening ? t('ask.stop') : t('ask.button')}
      </button>
      <p className="ask-privacy" data-testid="ask-privacy">{t('ask.privacyNote')}</p>
      <span className="sr-only" role="status" aria-live="polite">
        {listening ? t('ask.srListening') : ''}
      </span>
      {(listening || recognition.error || exchange) && (
        <div className="ask-panel" data-testid="ask-panel" aria-live="polite">
          {listening && <p className="ask-status" data-testid="ask-status">{t('ask.listening')}</p>}
          {recognition.error && <p className="ask-error" data-testid="ask-error">{recognition.error}</p>}
          {exchange && !recognition.error && (
            <>
              <p className="ask-question" data-testid="ask-question">{t('ask.youAsked')} “{exchange.question}”</p>
              <p className="ask-answer" data-testid="ask-answer">{t('ask.daymark')} “{exchange.answer}”</p>
            </>
          )}
        </div>
      )}
    </>
  );
}
