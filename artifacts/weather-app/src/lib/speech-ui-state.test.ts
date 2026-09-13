import { describe, expect, it } from 'vitest';

import { initialSpeechUiState, reduceSpeechUi, type SpeechUiState } from './speech-ui-state';

const reduce = (events: Parameters<typeof reduceSpeechUi>[1][]) =>
  events.reduce<SpeechUiState>((state, event) => reduceSpeechUi(state, event), initialSpeechUiState);

describe('reduceSpeechUi', () => {
  it('moves through idle → preparing → speaking → idle for the local engine', () => {
    const state = reduce([
      { type: 'speakStarted', engine: 'kokoro' },
      { type: 'audioStarted' },
      { type: 'finished' },
    ]);
    expect(state).toEqual({ status: 'idle', error: false });
  });

  it('starts directly in speaking for browser/system engines', () => {
    expect(reduce([{ type: 'speakStarted', engine: 'browser' }])).toEqual({ status: 'speaking', error: false });
  });

  it('returns to idle when stopped from preparing or speaking', () => {
    expect(reduce([{ type: 'speakStarted', engine: 'kokoro' }, { type: 'stopped' }])).toEqual({
      status: 'idle',
      error: false,
    });
    expect(reduce([{ type: 'speakStarted', engine: 'browser' }, { type: 'stopped' }])).toEqual({
      status: 'idle',
      error: false,
    });
  });

  it('flags failures and clears the error on the next attempt', () => {
    const failed = reduce([{ type: 'speakStarted', engine: 'kokoro' }, { type: 'failed' }]);
    expect(failed).toEqual({ status: 'idle', error: true });
    expect(reduce([{ type: 'speakStarted', engine: 'kokoro' }])).toEqual({ status: 'preparing', error: false });
  });

  it('ignores audioStarted when nothing is preparing', () => {
    expect(reduce([{ type: 'audioStarted' }])).toEqual(initialSpeechUiState);
  });

  it('supports rapid start/stop/start sequences without stuck states', () => {
    const state = reduce([
      { type: 'speakStarted', engine: 'kokoro' },
      { type: 'stopped' },
      { type: 'speakStarted', engine: 'kokoro' },
      { type: 'audioStarted' },
    ]);
    expect(state).toEqual({ status: 'speaking', error: false });
  });
});
