import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeNarrationText } from '../../artifacts/weather-app/src/lib/speech-number-normalizer.ts';
import { segmentForSpeech } from '../../artifacts/weather-app/src/lib/tts-segmentation.ts';
import { countWords, sha256Hex } from './text.ts';

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const resultsRoot = process.env.DAYMARK_TTS_RESULTS_DIR
  ?? resolve(tmpdir(), 'daymark-v2.1-tts-benchmark', 'results');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const resultDir = resolve(resultsRoot, runId);
const audioDir = resolve(resultDir, 'audio');
const bin = process.env.DAYMARK_TTS_BENCH_BIN
  ?? resolve(here, '../../android/kokoro-poc/rust/target/release/examples/tts_bench');
const timeBin = '/usr/bin/time';
mkdirSync(audioDir, { recursive: true });

if (!existsSync(bin)) {
  throw new Error(`benchmark binary not found: ${bin}`);
}

type NativeResult = {
  cold: RunOutput;
  warm: RunOutput;
  slow: Array<{ delayMs: number; output: RunOutput }>;
  audio?: string;
};

type RunOutput = {
  repetitions: number;
  wallMs: number;
  peakRssKb: number | null;
  perRun: Array<{
    index: number;
    samples: number;
    durationSeconds: number;
    g2pMs: number;
    tokenMs: number;
    synthMs: number;
    ipaChars: number;
    tokenCount: number;
    unknownCount: number;
    wallMs: number;
    finite: boolean;
    peak: number;
    average: number;
    lastSamples: number;
    rssKb: number;
    firstAudioMs: number;
  }>;
  segments: Array<{
    run: number;
    index: number;
    g2pMs: number;
    tokenMs: number;
    synthMs: number;
    samples: number;
    ipaChars: number;
    tokenCount: number;
    unknownCount: number;
    puaUnknownCount: number;
  }>;
  initMs: number;
  initRssKb: number;
  totalMs: number;
  totalDurationSeconds: number;
  totalRssKb: number;
  delayMs: number;
  wav?: string;
};

function parseNative(stdout: string, stderr: string, wallMs: number, repetitions: number, delayMs: number): RunOutput {
  const output: RunOutput = {
    repetitions,
    wallMs,
    peakRssKb: null,
    perRun: [],
    segments: [],
    initMs: 0,
    initRssKb: 0,
    totalMs: 0,
    totalDurationSeconds: 0,
    totalRssKb: 0,
    delayMs,
  };
  for (const line of stdout.split('\n')) {
    const f = line.split('\t');
    if (f[0] === 'INIT') {
      output.initMs = Number(f[1]);
      output.initRssKb = Number(f[2]);
    } else if (f[0] === 'SEG') {
      output.segments.push({
        run: Number(f[1]), index: Number(f[2]),
        g2pMs: Number(f[3]), tokenMs: Number(f[4]), synthMs: Number(f[5]),
        samples: Number(f[6]), ipaChars: Number(f[7]), tokenCount: Number(f[8]),
        unknownCount: Number(f[9]), puaUnknownCount: Number(f[10]),
      });
    } else if (f[0] === 'RUN') {
      output.perRun.push({
        index: Number(f[1]), samples: Number(f[2]), durationSeconds: Number(f[3]),
        g2pMs: Number(f[4]), tokenMs: Number(f[5]), synthMs: Number(f[6]),
        ipaChars: Number(f[7]), tokenCount: Number(f[8]), unknownCount: Number(f[9]),
        wallMs: Number(f[10]), finite: f[11] === 'true', peak: Number(f[12]),
        average: Number(f[13]), lastSamples: Number(f[14]), rssKb: Number(f[15]),
        firstAudioMs: Number(f[16] ?? 0),
      });
    } else if (f[0] === 'TOTAL') {
      output.totalMs = Number(f[1]);
      output.totalDurationSeconds = Number(f[2]);
      output.totalRssKb = Number(f[3]);
      output.delayMs = Number(f[4]);
    } else if (f[0] === 'WAV') {
      output.wav = f[1];
    }
  }
  const peakMatch = /(\d+)\s+maximum resident set size/i.exec(stderr);
  if (peakMatch) output.peakRssKb = Number(peakMatch[1]) / 1024;
  if (!output.perRun.length || !output.segments.length) {
    throw new Error(`native output incomplete\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }
  return output;
}

function runNative(
  locale: string,
  voice: string,
  mode: string,
  segments: string[],
  repeats: number,
  delayMs: number,
  label: string,
  wav?: string,
): RunOutput {
  if (segments.some((segment) => !segment.trim())) {
    throw new Error(`invalid segment for ${label}`);
  }
  const segmentsPath = resolve(resultDir, 'segments', `${label}.txt`);
  mkdirSync(dirname(segmentsPath), { recursive: true });
  writeFileSync(segmentsPath, `${segments.join('\u0000')}\u0000`);
  const args = [
    '-l', bin,
    '--lang', locale,
    '--voice', voice,
    '--mode', mode,
    '--segments', segmentsPath,
    '--repeats', String(repeats),
    '--delay-ms', String(delayMs),
  ];
  if (wav) args.push('--wav', wav);
  const started = Date.now();
  const result = spawnSync(timeBin, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 20 * 60 * 1000,
  });
  const wallMs = Date.now() - started;
  if (result.error || result.status !== 0) {
    throw new Error(`benchmark failed for ${label}: ${result.error ?? result.status}\n${result.stdout}\n${result.stderr}`);
  }
  return parseNative(result.stdout ?? '', result.stderr ?? '', wallMs, repeats, delayMs);
}

function validateFixture(fixture: any) {
  const raw = readFileSync(resolve(here, fixture.file), 'utf8');
  const input = raw.trimEnd();
  if (sha256Hex(raw) !== fixture.textSha256) {
    throw new Error(`${fixture.fixtureId}: raw SHA mismatch`);
  }
  if (countWords(input) !== fixture.wordCountRaw) {
    throw new Error(`${fixture.fixtureId}: raw word count mismatch`);
  }
  if (fixture.lengthLabel === 500 && fixture.wordCountRaw !== 500) {
    throw new Error(`${fixture.fixtureId}: canonical fixture is not exactly 500 words`);
  }
  const normalized = normalizeNarrationText(input, fixture.locale, { dateFormat: fixture.dateFormat ?? undefined });
  const segments = segmentForSpeech(normalized);
  if (countWords(normalized) !== fixture.wordCountNormalized) {
    throw new Error(`${fixture.fixtureId}: normalized word count mismatch`);
  }
  if (segments.join('') !== normalized) {
    throw new Error(`${fixture.fixtureId}: segment reconstruction mismatch`);
  }
  if (segments.length !== fixture.expectedSegmentCount) {
    throw new Error(`${fixture.fixtureId}: expected ${fixture.expectedSegmentCount} segments, got ${segments.length}`);
  }
  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) {
    throw new Error(`${fixture.fixtureId}: empty segment`);
  }
  return { fixture, normalized, segments };
}

function validateRun(fixture: any, segments: string[], output: RunOutput, label: string) {
  const expectedSegments = segments.length * output.repetitions;
  if (output.segments.length !== expectedSegments) {
    throw new Error(`${label}: segment results ${output.segments.length} != ${expectedSegments}`);
  }
  if (output.perRun.length !== output.repetitions) {
    throw new Error(`${label}: run results ${output.perRun.length} != ${output.repetitions}`);
  }
  for (const segment of output.segments) {
    if (segment.unknownCount !== 0 || segment.puaUnknownCount !== 0) {
      throw new Error(`${label}: unknown phoneme/PUA at segment ${segment.index}`);
    }
    if (!Number.isFinite(segment.g2pMs) || !Number.isFinite(segment.tokenMs) || !Number.isFinite(segment.synthMs)) {
      throw new Error(`${label}: non-finite timing at segment ${segment.index}`);
    }
  }
  for (const run of output.perRun) {
    if (!run.finite || run.samples <= 0 || run.lastSamples <= 0) {
      throw new Error(`${label}: incomplete/non-finite audio at run ${run.index}`);
    }
    if (run.durationSeconds <= 0) {
      throw new Error(`${label}: zero audio duration at run ${run.index}`);
    }
  }
  if (output.totalDurationSeconds <= 0) {
    throw new Error(`${label}: total duration missing`);
  }
}

const fixtureResults: NativeResult[] = [];
for (const fixture of manifest.fixtures) {
  const { normalized, segments } = validateFixture(fixture);
  const coldWav = fixture.lengthLabel === 25 || fixture.lengthLabel === 500
    ? resolve(audioDir, `${fixture.fixtureId}.wav`)
    : undefined;
  const cold = runNative(
    fixture.locale,
    fixture.voice,
    fixture.mode,
    segments,
    1,
    0,
    `${fixture.fixtureId}-cold`,
    coldWav,
  );
  validateRun(fixture, segments, cold, `${fixture.fixtureId}-cold`);
  const warm = runNative(
    fixture.locale,
    fixture.voice,
    fixture.mode,
    segments,
    3,
    0,
    `${fixture.fixtureId}-warm`,
  );
  validateRun(fixture, segments, warm, `${fixture.fixtureId}-warm`);
  const slow = [];
  for (const delayMs of fixture.lengthLabel <= 100 ? [250, 1500] : []) {
    const delayed = runNative(
      fixture.locale,
      fixture.voice,
      fixture.mode,
      segments,
      1,
      delayMs,
      `${fixture.fixtureId}-slow-${delayMs}`,
    );
    validateRun(fixture, segments, delayed, `${fixture.fixtureId}-slow-${delayMs}`);
    slow.push({ delayMs, output: delayed });
  }
  fixtureResults.push({ cold, warm, slow, audio: cold.wav });
  console.log(`completed ${fixture.fixtureId}: ${segments.length} segments, ${warm.wallMs} ms warm`);
}

const results = {
  runId,
  generatedAt: new Date().toISOString(),
  host: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    benchmarkBinary: bin,
    provider: 'cpu',
  },
  manifest: {
    path: manifestPath,
    corpusId: manifest.corpusId,
    normalizationVersion: manifest.normalizationVersion,
    piperPlusG2pVersion: manifest.piperPlusG2pVersion,
    puaCompatVersion: manifest.puaCompatVersion,
    kokoroRuntimeVersion: manifest.kokoroRuntimeVersion,
    kokoroSourceCommit: manifest.kokoroSourceCommit,
  },
  fixtures: manifest.fixtures.map((fixture: any, index: number) => {
    const result = fixtureResults[index];
    return {
      ...fixture,
      normalizedTextSha256: sha256Hex(normalizeNarrationText(readFileSync(resolve(here, fixture.file), 'utf8').trimEnd(), fixture.locale, { dateFormat: fixture.dateFormat ?? undefined })),
      cold: result.cold,
      warm: result.warm,
      slow: result.slow,
      audio: result.audio,
    };
  }),
};

writeFileSync(resolve(resultDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
const summary = [
  '# Daymark long-utterance benchmark',
  '',
  `Run: ${runId}`,
  `Host: ${process.platform}/${process.arch}, Node ${process.version}`,
  '',
  '| Fixture | Words raw/norm | Segments | Cold init ms | Cold RTF | Warm first audio ms | Warm mean RTF | Warm peak RSS MB |',
  '|---|---:|---:|---:|---:|---:|---:|---:|',
  ...results.fixtures.map((fixture: any) => {
    const warmRtf = fixture.warm.perRun.map((run: any) => run.synthMs / (run.durationSeconds * 1000));
    const meanWarmRtf = warmRtf.reduce((a: number, b: number) => a + b, 0) / warmRtf.length;
    const warmFirstAudio = fixture.warm.perRun.map((run: any) => run.firstAudioMs);
    const meanWarmFirstAudio = warmFirstAudio.reduce((a: number, b: number) => a + b, 0) / warmFirstAudio.length;
    return `| ${fixture.fixtureId} | ${fixture.wordCountRaw}/${fixture.wordCountNormalized} | ${fixture.expectedSegmentCount} | ${fixture.cold.initMs.toFixed(1)} | ${(fixture.cold.perRun[0].synthMs / (fixture.cold.perRun[0].durationSeconds * 1000)).toFixed(4)} | ${meanWarmFirstAudio.toFixed(1)} | ${meanWarmRtf.toFixed(4)} | ${(fixture.warm.peakRssKb / 1024).toFixed(1)} |`;
  }),
  '',
  'Artificial delay runs are recorded separately in results.json and are not real performance measurements.',
  'No performance pass threshold was applied.',
].join('\n');
writeFileSync(resolve(resultDir, 'summary.md'), `${summary}\n`);
console.log(`results: ${resultDir}`);
