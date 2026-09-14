import { describe, expect, it } from 'vitest';

import { segmentForSpeech } from './tts-segmentation';

const REAL_BRIEFING =
  "It's 23 degrees in London, mostly clear, feels like 22 degrees. Rain isn't expected for the rest of today. The UV index is 1.5 (low). Today's sun protection window has passed (it was 12 PM to 3 PM). Air quality is good (US AQI 39). Conditions are considered satisfactory for most people.";

function assertNoLoss(text: string, segments: string[]) {
  expect(segments.join('')).toBe(text);
  expect(segments.join('').split(/\s+/).filter(Boolean)).toEqual(text.split(/\s+/).filter(Boolean));
}

describe('segmentForSpeech', () => {
  it('splits the real briefing with a short first segment and no text loss', () => {
    const segments = segmentForSpeech(REAL_BRIEFING);
    expect(segments.length).toBeGreaterThan(1);
    expect(segments[0]).toBe("It's 23 degrees in London, ");
    expect(segments[0].length).toBeGreaterThanOrEqual(20);
    expect(segments[0].length).toBeLessThanOrEqual(70);
    expect(segments.every((segment) => segment.length >= 20)).toBe(true);
    assertNoLoss(REAL_BRIEFING, segments);
  });

  it('splits at a comma', () => {
    const segments = segmentForSpeech(
      "It's 23 degrees in London, mostly clear, feels like 22 degrees and the wind is light.",
    );
    expect(segments[0]).toBe("It's 23 degrees in London, ");
    assertNoLoss("It's 23 degrees in London, mostly clear, feels like 22 degrees and the wind is light.", segments);
  });

  it('splits at a semicolon before later boundaries', () => {
    const text = 'Cloud cover will increase; rain arrives later this afternoon and continues into the evening.';
    const segments = segmentForSpeech(text);
    expect(segments[0]).toBe('Cloud cover will increase; ');
    assertNoLoss(text, segments);
  });

  it('splits before a safe conjunction', () => {
    const text =
      'Temperatures will remain mild and light winds will keep conditions comfortable through the afternoon.';
    const segments = segmentForSpeech(text);
    expect(segments.length).toBeGreaterThan(1);
    expect(segments[0]).toBe('Temperatures will remain mild');
    expect(segments[1]?.startsWith(' and ')).toBe(true);
    assertNoLoss(text, segments);
  });

  it('never splits inside a decimal temperature', () => {
    const text = 'It will reach 18.5°C by midday and stay there for the rest of the afternoon.';
    const segments = segmentForSpeech(text);
    expect(segments.some((segment) => segment.includes('18.5°C'))).toBe(true);
    expect(segments.some((segment) => segment.endsWith('18.'))).toBe(false);
    assertNoLoss(text, segments);
  });

  it('never splits a percentage', () => {
    const text = 'There is a 70% chance of rain and the wind will pick up later today across the region.';
    const segments = segmentForSpeech(text);
    expect(segments[0]).toContain('70%');
    assertNoLoss(text, segments);
  });

  it('never splits a time', () => {
    const text = 'The next update arrives at 14:30 and covers the rest of the day for the whole region.';
    const segments = segmentForSpeech(text);
    expect(segments.some((segment) => segment.includes('14:30'))).toBe(true);
    assertNoLoss(text, segments);
  });

  it('never splits after an abbreviation', () => {
    const text = 'Rainfall is approx. 5 mm today, with lighter showers expected after midnight.';
    const segments = segmentForSpeech(text);
    expect(segments[0]).toContain('approx. 5 mm');
    expect(segments[0]).not.toBe('Rainfall is approx. ');
    assertNoLoss(text, segments);
  });

  it('leaves short sentences unchanged', () => {
    expect(segmentForSpeech('Light rain later.')).toEqual(['Light rain later.']);
    expect(segmentForSpeech('Good morning.')).toEqual(['Good morning.']);
  });

  it('keeps word order identical on a corpus', () => {
    const corpus = [
      REAL_BRIEFING,
      'Winds are strong; rain is likely later. Temperatures will drop and it will feel colder.',
      'UV index is 1.5 (low) and air quality is good (US AQI 39).',
      'It was 12 PM to 3 PM, so plan around it.',
      'See https://example.com/forecast and check back later for updates.',
    ];
    for (const text of corpus) {
      assertNoLoss(text, segmentForSpeech(text));
    }
  });
});
