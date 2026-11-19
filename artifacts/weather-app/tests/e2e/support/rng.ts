/*
 * Deterministic pseudo-random numbers for E2E data variation.
 *
 * The suite must stay reproducible: every "randomised" test derives its seed
 * from the test title (or from DAYMARK_E2E_SEED when it is set), so rerunning
 * the same test always produces the same data. The fixture records the seed on
 * failure and prints the environment override needed to reproduce it.
 *
 * This module intentionally has no Playwright or Node.js imports so it can also
 * be unit-tested with Vitest.
 */

export type RandomSource = () => number;

/** FNV-1a 32-bit hash, used to turn a stable test id into a stable seed. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32: small, fast and good enough for test data variation. */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Resolve the seed for one test.
 *
 * - By default the seed is a pure function of the test's title path, so a
 *   failing test reproduces exactly without any setup.
 * - DAYMARK_E2E_SEED changes the whole suite's data for exploratory runs while
 *   keeping each test's stream distinct and stable.
 * - The effective seed is always derived per test, so tests never share a
 *   stream and test order cannot change the data a test sees.
 */
export function resolveSeed(
  titlePath: readonly string[],
  // `null` explicitly means "no ambient override"; a missing argument falls back
  // to DAYMARK_E2E_SEED. The null sentinel keeps unit tests independent of the
  // developer's/CI environment.
  envSeed: string | null | undefined = process.env.DAYMARK_E2E_SEED,
): number {
  const title = titlePath.join(' › ');
  const override = envSeed?.trim();
  return override ? hashString(`${override}::${title}`) : hashString(title);
}

export function randomFloat(random: RandomSource, min: number, max: number, decimals = 1): number {
  const value = min + random() * (max - min);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function randomInt(random: RandomSource, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

export function randomItem<T>(random: RandomSource, items: readonly T[]): T {
  if (items.length === 0) throw new Error('randomItem requires at least one item');
  return items[randomInt(random, 0, items.length - 1)];
}
