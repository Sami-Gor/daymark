import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { normalizeNarrationText } from './speech-number-normalizer';
import { segmentForSpeech } from './tts-segmentation';
import { countWords, sha256Hex } from '../../../../benchmarks/tts/text';

const here = dirname(fileURLToPath(import.meta.url));
const benchmarkRoot = resolve(here, '../../../../benchmarks/tts');
const manifest = JSON.parse(readFileSync(resolve(benchmarkRoot, 'manifest.json'), 'utf8'));

describe('TTS benchmark corpus integrity', () => {
  it('contains the full language/length matrix', () => {
    expect(manifest.fixtures).toHaveLength(12);
    expect(new Set(manifest.fixtures.map((f: any) => f.fixtureId)).size).toBe(12);
  });

  it('keeps the three canonical fixtures at exactly 500 words', () => {
    for (const fixture of manifest.fixtures.filter((f: any) => f.lengthLabel === 500)) {
      expect(fixture.wordCountRaw, fixture.fixtureId).toBe(500);
      expect(fixture.wordCountNormalized, fixture.fixtureId).toBeGreaterThan(0);
    }
  });

  it('matches every fixture hash, count and segment plan', () => {
    for (const fixture of manifest.fixtures) {
      const raw = readFileSync(resolve(benchmarkRoot, fixture.file), 'utf8');
      const input = raw.trimEnd();
      expect(sha256Hex(raw), fixture.fixtureId).toBe(fixture.textSha256);
      expect(countWords(input), fixture.fixtureId).toBe(fixture.wordCountRaw);
      const normalized = normalizeNarrationText(input, fixture.locale, {
        dateFormat: fixture.dateFormat ?? undefined,
      });
      expect(countWords(normalized), fixture.fixtureId).toBe(fixture.wordCountNormalized);
      const segments = segmentForSpeech(normalized);
      expect(segments.length, fixture.fixtureId).toBe(fixture.expectedSegmentCount);
      expect(segments.join(''), fixture.fixtureId).toBe(normalized);
      expect(segments.every((segment) => segment.length > 0), fixture.fixtureId).toBe(true);
    }
  });

  it('preserves the expected accented and numeric features in the canonical fixtures', () => {
    const en = readFileSync(resolve(benchmarkRoot, 'corpus/en/500.txt'), 'utf8');
    const fr = readFileSync(resolve(benchmarkRoot, 'corpus/fr/500.txt'), 'utf8');
    const es = readFileSync(resolve(benchmarkRoot, 'corpus/es/500.txt'), 'utf8');
    for (const text of [en, fr, es]) {
      expect(text).toMatch(/-3/);
      expect(text).toMatch(/14[.,]5/);
      expect(text).toMatch(/km\/h|kilomètres par heure|kilómetros por hora/i);
      expect(text).toMatch(/mph|miles par heure|millas por hora/i);
      expect(text).toMatch(/%|pour cent|por ciento|percent/i);
    }
    expect(fr).toMatch(/[àâçéèêëîïôùûüÿœ]/i);
    expect(es).toMatch(/[áéíóúñü]/i);
  });
});
