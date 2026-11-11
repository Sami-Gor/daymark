/*
 * Structured recognition error contract (this change).
 *
 * Mirrors `RecognitionErrorCodes.java` on the Android side. Every native
 * `error` event carries a stable `code` (plus an additive `stage`), and a
 * rejected `start` promise uses the same vocabulary. This module normalises the
 * bridge string to a known code, classifies the outcome and maps a rejected
 * start message, so the UI can render a failure state that is distinct from
 * silence.
 *
 * Backward compatibility:
 * - existing codes keep their meaning and their user-facing copy;
 * - unknown codes are preserved rather than remapped, so a newer native side
 *   cannot be broken by an older web bundle (the copy falls back to generic);
 * - `no-speech` still means "silence, nothing was decoded";
 * - `empty-transcript`, `model-rejected` and `decode-failed` are new and are
 *   always rendered as failures, never as silence and never as a transcript.
 */

export type RecognitionErrorCode =
  /* decode-outcome codes */
  | 'no-speech'
  | 'empty-transcript'
  | 'model-rejected'
  | 'decode-failed'
  /* capture and permission codes */
  | 'audio-capture'
  | 'not-allowed'
  | 'permission-denied'
  | 'permission-blocked'
  | 'aborted'
  /* availability and model codes */
  | 'offline-unavailable'
  | 'api-unsupported'
  | 'model-missing'
  | 'model-corrupt'
  | 'model-preparing'
  | 'runtime-unavailable'
  /* session codes */
  | 'session-busy'
  | 'invalid-session'
  /* web-layer watchdog */
  | 'timeout'
  | 'unknown';

/** Known codes, in the order they are documented in the design note. */
export const RECOGNITION_ERROR_CODES: readonly RecognitionErrorCode[] = [
  'no-speech',
  'empty-transcript',
  'model-rejected',
  'decode-failed',
  'audio-capture',
  'not-allowed',
  'permission-denied',
  'permission-blocked',
  'aborted',
  'offline-unavailable',
  'api-unsupported',
  'model-missing',
  'model-corrupt',
  'model-preparing',
  'runtime-unavailable',
  'session-busy',
  'invalid-session',
  'timeout',
  'unknown',
];

const KNOWN_CODES: ReadonlySet<string> = new Set<string>(RECOGNITION_ERROR_CODES);

/** The processing stage that produced a failure; mirrors the Java `Stage`. */
export type RecognitionErrorStage = 'capture' | 'decode' | 'model' | 'session' | 'unknown';

/**
 * What the outcome means for the user:
 * - `silence`: no speech was detected (nothing was decoded);
 * - `failure`: the capture or the decode failed (this includes a refusal);
 * - `cancelled`: the session was stopped;
 * - `unavailable`: voice input is not available on this device;
 * - `none`: no error (a successful result or an idle state).
 */
export type RecognitionOutcomeKind = 'none' | 'silence' | 'failure' | 'cancelled' | 'unavailable';

/**
 * Normalises the bridge code: trims it, keeps forward-compatible unknown codes,
 * and maps a missing code to `unknown` (never an empty string). This is the
 * bridge's existing pass-through behaviour, made explicit and typed.
 */
export function normalizeRecognitionErrorCode(raw: string | null | undefined): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value === '' ? 'unknown' : value;
}

export function isKnownRecognitionErrorCode(
  value: string | null | undefined,
): value is RecognitionErrorCode {
  return typeof value === 'string' && KNOWN_CODES.has(value.trim());
}

/** True only for the security refusal code (`MODEL_REJECTED`). */
export function isSecurityRefusal(code: string | null | undefined): boolean {
  return normalizeRecognitionErrorCode(code) === 'model-rejected';
}

/** Mirrors `RecognitionErrorCodes.stageOf` on the Android side. */
export function recognitionErrorStage(code: string | null | undefined): RecognitionErrorStage {
  switch (normalizeRecognitionErrorCode(code)) {
    case 'no-speech':
    case 'audio-capture':
    case 'not-allowed':
    case 'permission-denied':
    case 'permission-blocked':
    case 'aborted':
      return 'capture';
    case 'empty-transcript':
    case 'model-rejected':
    case 'decode-failed':
    case 'timeout':
      return 'decode';
    case 'offline-unavailable':
    case 'api-unsupported':
    case 'model-missing':
    case 'model-corrupt':
    case 'model-preparing':
    case 'runtime-unavailable':
      return 'model';
    case 'session-busy':
    case 'invalid-session':
      return 'session';
    default:
      return 'unknown';
  }
}

/**
 * Classifies an error code into the user-visible outcome. This is the function
 * the app uses to tell a failure from silence: `no-speech` is silence, while
 * `model-rejected`, `empty-transcript` and `decode-failed` are failures.
 */
export function recognitionOutcomeFor(code: string | null | undefined): RecognitionOutcomeKind {
  const normalized = typeof code === 'string' ? code.trim() : '';
  if (normalized === '') {
    return 'none';
  }
  switch (normalized) {
    case 'no-speech':
      return 'silence';
    case 'aborted':
      return 'cancelled';
    case 'offline-unavailable':
    case 'api-unsupported':
    case 'model-missing':
    case 'model-corrupt':
    case 'model-preparing':
    case 'runtime-unavailable':
      return 'unavailable';
    default:
      return 'failure';
  }
}

/**
 * Maps a rejected native `start` promise message to a stable code. The native
 * side rejects with the code itself; a message may wrap it, so this mirrors the
 * bridge's historical matching order and adds the decode codes first.
 */
export function classifyNativeStartFailure(message: string): string {
  if (/model-rejected|decode-refused/i.test(message)) {
    return 'model-rejected';
  }
  if (/decode-failed/i.test(message)) {
    return 'decode-failed';
  }
  if (/empty-transcript/i.test(message)) {
    return 'empty-transcript';
  }
  if (/permission-blocked/i.test(message)) {
    return 'permission-blocked';
  }
  if (/permission-denied/i.test(message)) {
    return 'permission-denied';
  }
  if (/permission|not-allowed/i.test(message)) {
    return 'permission-blocked';
  }
  if (/audio-capture/i.test(message)) {
    return 'audio-capture';
  }
  if (/offline-unavailable|api-unsupported|model-missing|model-corrupt|model-preparing|runtime-unavailable/i.test(message)) {
    return 'offline-unavailable';
  }
  if (/cancel|aborted/i.test(message)) {
    return 'aborted';
  }
  return 'unknown';
}
