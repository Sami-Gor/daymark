#!/usr/bin/env node
/*
 * GeoNames -> Daymark locality prototype (build-time only).
 *
 * Streams allCountries.zip (downloaded into scripts/data/.cache, gitignored),
 * filters feature class P records to present-day inhabited/locality types, and
 * emits a compact JSON record set plus a fixed lat/lon grid index for fast
 * in-browser nearest-locality lookup.
 *
 * Nothing here runs at app runtime and no GeoNames API is ever contacted.
 *
 * Usage:
 *   node scripts/data/build-localities.mjs download
 *   node scripts/data/build-localities.mjs extract
 *   node scripts/data/build-localities.mjs index --min-pop=1 --cell=0.5
 *   node scripts/data/build-localities.mjs sizes --file=<path>
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const CACHE = path.join(HERE, '.cache');
const ZIP = path.join(CACHE, 'allCountries.zip');
const NDJSON = path.join(CACHE, 'allowed.ndjson');
const STATS = path.join(CACHE, 'stats.json');

/*
 * Feature codes investigated (counts are recorded in stats.json):
 *
 * KEPT (present-day inhabited / recognisable locality types)
 *   PPLC   capital of a political entity        (admin seat)
 *   PPLA   seat of first-order admin division   (admin seat)
 *   PPLA2  seat of second-order admin division  (admin seat)
 *   PPLA3  seat of third-order admin division   (admin seat)
 *   PPLA4  seat of fourth-order admin division  (admin seat)
 *   PPLA5  seat of fifth-order admin division   (admin seat, rare)
 *   PPL    populated place                      (generic; the bulk)
 *   PPLX   section of populated place           (suburb/neighbourhood)
 *   PPLL   populated locality                   (small group of buildings)
 *   PPLG   seat of government of a political entity
 *   PPLF   farm village                         (rural inhabited)
 *   PPLR   religious populated place            (rural inhabited)
 *
 * EXCLUDED (documented in the report)
 *   PPLH   historical populated place           (past only)
 *   PPLCH  historical capital                   (past only)
 *   PPLQ   abandoned populated place            (no longer inhabited)
 *   PPLW   destroyed populated place            (no longer inhabited)
 *   PPLS   populated places (plural)            (collection, not a label)
 *   PPLA6+ / PPL* unknown codes                 (not observed / unsuitable)
 */
const KEPT_CODES = new Set(['PPLC', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPL', 'PPLX', 'PPLL', 'PPLG', 'PPLF', 'PPLR']);
const EXCLUDED_CODES = new Set(['PPLH', 'PPLCH', 'PPLQ', 'PPLW', 'PPLS']);

function ensureCache() {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
}

async function download() {
  ensureCache();
  if (existsSync(ZIP)) {
    console.log(`archive already present: ${ZIP} (${statSync(ZIP).size} bytes)`);
    return;
  }
  console.log('downloading allCountries.zip ...');
  const response = await fetch('https://download.geonames.org/export/dump/allCountries.zip');
  if (!response.ok || !response.body) throw new Error(`download failed: HTTP ${response.status}`);
  const out = createWriteStream(ZIP);
  const { Readable } = await import('node:stream');
  const { pipeline } = await import('node:stream/promises');
  await pipeline(Readable.fromWeb(response.body), out);
  console.log(`downloaded ${statSync(ZIP).size} bytes`);
}

/** Streams allCountries.txt from the zip; never loads the raw dataset into memory. */
function streamGeonames() {
  if (!existsSync(ZIP)) throw new Error(`missing ${ZIP}; run: node scripts/data/build-localities.mjs download`);
  const unzip = spawn('unzip', ['-p', ZIP, 'allCountries.txt'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const rl = createInterface({ input: unzip.stdout, crlfDelay: Infinity });
  return { lines: rl, done: new Promise((resolve, reject) => { unzip.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`unzip exited ${code}`)))); }) };
}

async function extract() {
  ensureCache();
  const out = createWriteStream(NDJSON);
  const stats = {
    totalRecords: 0,
    classP: 0,
    kept: 0,
    excluded: 0,
    otherClass: 0,
    byCode: {},
    excludedByCode: {},
    keptZeroPopulation: 0,
    keptWithPopulation: 0,
    populationBuckets: { gt0: 0, ge100: 0, ge500: 0, ge1k: 0, ge10k: 0, ge100k: 0, ge1m: 0 },
    keptByCountryTop: {},
  };
  const { lines, done } = streamGeonames();
  let batch = [];
  for await (const line of lines) {
    if (!line) continue;
    const f = line.split('\t');
    stats.totalRecords += 1;
    if (f[6] !== 'P') {
      stats.otherClass += 1;
      continue;
    }
    stats.classP += 1;
    const code = f[7];
    stats.byCode[code] = (stats.byCode[code] || 0) + 1;
    if (!KEPT_CODES.has(code)) {
      if (EXCLUDED_CODES.has(code)) stats.excludedByCode[code] = (stats.excludedByCode[code] || 0) + 1;
      continue;
    }
    const population = Number(f[14]) || 0;
    const name = f[1];
    if (!name || !f[4] || !f[5]) continue;
    const record = [
      name,
      Math.round(Number(f[4]) * 10000) / 10000,
      Math.round(Number(f[5]) * 10000) / 10000,
      f[8] || '',
      f[10] || '',
      code,
      population,
    ];
    if (Number.isNaN(record[1]) || Number.isNaN(record[2])) continue;
    stats.kept += 1;
    if (population === 0) stats.keptZeroPopulation += 1; else stats.keptWithPopulation += 1;
    if (population > 0) stats.populationBuckets.gt0 += 1;
    if (population >= 100) stats.populationBuckets.ge100 += 1;
    if (population >= 500) stats.populationBuckets.ge500 += 1;
    if (population >= 1000) stats.populationBuckets.ge1k += 1;
    if (population >= 10000) stats.populationBuckets.ge10k += 1;
    if (population >= 100000) stats.populationBuckets.ge100k += 1;
    if (population >= 1000000) stats.populationBuckets.ge1m += 1;
    stats.keptByCountryTop[record[3]] = (stats.keptByCountryTop[record[3]] || 0) + 1;
    batch.push(JSON.stringify(record));
    if (batch.length >= 20000) {
      out.write(batch.join('\n') + '\n');
      batch = [];
    }
  }
  if (batch.length) out.write(batch.join('\n') + '\n');
  out.end();
  await done;
  await new Promise((resolve) => out.on('close', resolve));
  const sortedCountries = Object.entries(stats.keptByCountryTop).sort((a, b) => b[1] - a[1]).slice(0, 15);
  stats.keptByCountryTop = Object.fromEntries(sortedCountries);
  stats.filteredUncompressedBytes = statSync(NDJSON).size;
  writeFileSync(STATS, JSON.stringify(stats, null, 2));
  console.log(JSON.stringify({ ...stats, byCode: stats.byCode, excludedByCode: stats.excludedByCode }, null, 2));
}

function cellFor(lat, lon, cellSize) {
  const latIdx = Math.floor((lat + 90) / cellSize);
  const lonIdx = Math.floor((lon + 180) / cellSize);
  return { key: `${latIdx}_${lonIdx}`, latIdx, lonIdx };
}

function buildIndex({ minPop, cellSize }) {
  const records = [];
  const readline = createInterface({ input: createReadStream(NDJSON), crlfDelay: Infinity });
  return new Promise((resolve, reject) => {
    readline.on('line', (line) => {
      if (!line) return;
      const record = JSON.parse(line);
      const population = record[6];
      const code = record[5];
      // Administrative seats are always retained, even below the population
      // threshold or with no population recorded. PPLG (seat of government of
      // a political entity) was the only additional admin code worth keeping.
      const isAdminSeat = code === 'PPLC' || code === 'PPLG' || code.startsWith('PPLA');
      if (population < minPop && !isAdminSeat) return;
      records.push(record);
    });
    readline.on('close', () => {
      try {
        const withCell = records.map((record) => ({ record, cell: cellFor(record[1], record[2], cellSize) }));
        withCell.sort((a, b) => (a.cell.latIdx - b.cell.latIdx) || (a.cell.lonIdx - b.cell.lonIdx));
        const cells = {};
        const sortedRecords = [];
        for (let i = 0; i < withCell.length; i += 1) {
          const { record, cell } = withCell[i];
          sortedRecords.push(record);
          const existing = cells[cell.key];
          if (existing) existing[1] += 1;
          else cells[cell.key] = [i, 1];
        }
        const payload = { cellSize, minPopulation: minPop, count: sortedRecords.length, cells, records: sortedRecords };
        resolve(payload);
      } catch (error) {
        reject(error);
      }
    });
    readline.on('error', reject);
  });
}

function sizeReport(file) {
  const raw = readFileSync(file);
  const gzip = gzipSync(raw, { level: 9 });
  const brotli = brotliCompressSync(raw, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } });
  return { bytes: raw.length, gzipBytes: gzip.length, brotliBytes: brotli.length };
}

const [, , command, ...rest] = process.argv;
const args = Object.fromEntries(rest.filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('=')));

if (command === 'download') {
  await download();
} else if (command === 'extract') {
  await extract();
} else if (command === 'index') {
  const minPop = Number(args['min-pop'] ?? 1);
  const cellSizes = String(args.cell ?? '0.5').split(',').map(Number);
  for (const cellSize of cellSizes) {
    const payload = await buildIndex({ minPop, cellSize });
    const variant = `localities-minpop${minPop}-cell${String(cellSize).replace('.', '_')}.json`;
    const file = path.join(CACHE, variant);
    writeFileSync(file, JSON.stringify(payload));
    const sizes = sizeReport(file);
    const cells = Object.keys(payload.cells).length;
    const cellSizesArr = Object.values(payload.cells).map(([, count]) => count);
    const avg = cellSizesArr.reduce((a, b) => a + b, 0) / (cellSizesArr.length || 1);
    const max = Math.max(...cellSizesArr);
    console.log(JSON.stringify({ file: path.relative(ROOT, file), records: payload.count, cells, avgPerCell: Math.round(avg), maxPerCell: max, ...sizes }));
  }
} else if (command === 'sizes') {
  const file = args.file;
  if (!file || !existsSync(file)) throw new Error('usage: sizes --file=<path>');
  console.log(JSON.stringify({ file, ...sizeReport(file) }));
} else {
  console.log('usage: download | extract | index --min-pop=1 --cell=0.25,0.5,1.0 | sizes --file=<path>');
}
