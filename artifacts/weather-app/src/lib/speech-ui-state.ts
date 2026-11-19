/*
 * UI state for the Android narration layer.
 *
 * `preparing` is used while the local Kokoro engine is still initializing;
 * `speaking` means audio has actually started. Stop works from both active
 * states, and a failure returns to idle with an error flag the UI can announce.
 * The web/PWA demo has no narration controls; French/Spanish Android narration
 * reports unavailable without starting an engine.
 */

export type SpeechUiStatus = 'idle' | 'preparing' | 'speaking';

export type SpeechUiState = {
  status: SpeechUiStatus;
  error: boolean;
};

export type SpeechUiEvent =
  | { type: 'speakStarted'; engine: 'kokoro' }
  | { type: 'audioStarted' }
  | { type: 'finished' }
  | { type: 'failed' }
  | { type: 'stopped' };

export const initialSpeechUiState: SpeechUiState = { status: 'idle', error: false };

export function reduceSpeechUi(state: SpeechUiState, event: SpeechUiEvent): SpeechUiState {
  switch (event.type) {
    case 'speakStarted':
      return { status: 'preparing', error: false };
    case 'audioStarted':
      return state.status === 'preparing' ? { status: 'speaking', error: false } : state;
    case 'finished':
    case 'stopped':
      return { status: 'idle', error: false };
    case 'failed':
      return { status: 'idle', error: true };
    default:
      return state;
  }
}
