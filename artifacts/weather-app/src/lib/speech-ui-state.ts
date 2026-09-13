/*
 * UI state for the unified speech layer.
 *
 * `preparing` is used while the local Kokoro engine is still initializing;
 * `speaking` means audio has actually started (or the browser/system engine
 * accepted the utterance). Stop works from both active states, and a failure
 * returns to idle with an error flag the UI can announce.
 */

export type SpeechUiStatus = 'idle' | 'preparing' | 'speaking';

export type SpeechUiState = {
  status: SpeechUiStatus;
  error: boolean;
};

export type SpeechUiEvent =
  | { type: 'speakStarted'; engine: 'kokoro' | 'browser' }
  | { type: 'audioStarted' }
  | { type: 'finished' }
  | { type: 'failed' }
  | { type: 'stopped' };

export const initialSpeechUiState: SpeechUiState = { status: 'idle', error: false };

export function reduceSpeechUi(state: SpeechUiState, event: SpeechUiEvent): SpeechUiState {
  switch (event.type) {
    case 'speakStarted':
      return event.engine === 'kokoro'
        ? { status: 'preparing', error: false }
        : { status: 'speaking', error: false };
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
