import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NARRATION_NORMALIZATION_VERSION,
  normalizeNarrationText,
} from '../../artifacts/weather-app/src/lib/speech-number-normalizer.ts';
import { segmentForSpeech } from '../../artifacts/weather-app/src/lib/tts-segmentation.ts';
import { countSentences, countWords, sha256Hex } from './text.ts';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = resolve(here, 'corpus');
const output = resolve(here, 'manifest.json');

export const PROFILES = {
  en: {
    locale: 'en-GB',
    voice: 'bm_fable',
    mode: 'en-stream',
  },
  fr: {
    locale: 'fr-FR',
    voice: 'ff_siwis',
    mode: 'monolithic',
  },
  es: {
    locale: 'es-419',
    voice: 'em_alex',
    mode: 'monolithic',
  },
} as const;

const LENGTHS = [25, 100, 250, 500] as const;
const fixtures = [];

for (const [lang, profile] of Object.entries(PROFILES)) {
  for (const length of LENGTHS) {
    const fixtureId = `${lang}-${length}`;
    const path = resolve(corpusDir, lang, `${length}.txt`);
    const raw = readFileSync(path, 'utf8');
    const input = raw.trimEnd();
    const normalized = normalizeNarrationText(input, profile.locale);
    const segments = segmentForSpeech(normalized);
    fixtures.push({
      fixtureId,
      languageProfile: lang,
      locale: profile.locale,
      voice: profile.voice,
      mode: profile.mode,
      file: `corpus/${lang}/${length}.txt`,
      lengthLabel: length,
      wordCountRaw: countWords(input),
      wordCountNormalized: countWords(normalized),
      characterCountRaw: input.length,
      characterCountNormalized: normalized.length,
      textSha256: sha256Hex(raw),
      normalizedTextSha256: sha256Hex(normalized),
      expectedSentenceCount: countSentences(input),
      expectedSegmentCount: segments.length,
      dateFormat: null,
    });
  }
}

const manifest = {
  manifestVersion: 1,
  corpusId: 'daymark-tts-benchmark-v1',
  wordCountConvention:
    'Unicode NFC, split on whitespace, count tokens containing at least one Unicode letter or digit; punctuation-only tokens excluded; hyphens/contractions count as one; numeric and unit tokens count as one.',
  normalizationVersion: NARRATION_NORMALIZATION_VERSION,
  piperPlusG2pVersion: '0.5.3',
  puaCompatVersion: 2,
  kokoroRuntimeVersion: 'kokoro-en 0.1.5',
  kokoroSourceCommit: 'b42bd5cf915163607cb51984cabf273dcf09755e',
  fixtures,
};

writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${output} (${fixtures.length} fixtures)`);
for (const fixture of fixtures) {
  console.log(
    `${fixture.fixtureId}: words=${fixture.wordCountRaw} normalized=${fixture.wordCountNormalized} sentences=${fixture.expectedSentenceCount} segments=${fixture.expectedSegmentCount} sha=${fixture.textSha256}`,
  );
}
