import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/uxbridge-sample.json';
import { confidenceForDistance, createLocalityLookup, scoreLocalityCandidate, type LocalityIndex, type LocalityRecord } from './locality-lookup';

const uxbridgeIndex = fixture as unknown as LocalityIndex;
const lookup = createLocalityLookup(uxbridgeIndex);

/** Builds a minimal synthetic index with the same shape as the shipped asset. */
function makeIndex(records: LocalityRecord[]): LocalityIndex {
  const cellSize = 0.25;
  const indexed = records.map((record) => ({
    record,
    latIdx: Math.floor((record[1] + 90) / cellSize),
    lonIdx: Math.floor((record[2] + 180) / cellSize),
  }));
  indexed.sort((a, b) => (a.latIdx - b.latIdx) || (a.lonIdx - b.lonIdx));
  const cells: Record<string, [number, number]> = {};
  const sorted: LocalityRecord[] = [];
  indexed.forEach((entry, index) => {
    sorted.push(entry.record);
    const key = `${entry.latIdx}_${entry.lonIdx}`;
    if (cells[key]) cells[key][1] += 1;
    else cells[key] = [index, 1];
  });
  return { cellSize, count: sorted.length, cells, records: sorted };
}

describe('offline locality lookup', () => {
  it('resolves Uxbridge town centre to Uxbridge with high confidence', () => {
    const result = lookup.findNearestLocality(51.5462, -0.4787);
    expect(result).toMatchObject({ name: 'Uxbridge', countryCode: 'GB', confidence: 'high' });
    expect(result!.distanceKm).toBeLessThan(2);
  });

  it('keeps north and south Uxbridge labelled Uxbridge', () => {
    expect(lookup.findNearestLocality(51.56, -0.475)?.name).toBe('Uxbridge');
    expect(lookup.findNearestLocality(51.532, -0.482)?.name).toBe('Uxbridge');
  });

  it('resolves Hillingdon and West Drayton to themselves', () => {
    expect(lookup.findNearestLocality(51.5329, -0.448)?.name).toBe('Hillingdon');
    expect(lookup.findNearestLocality(51.51, -0.478)?.name).toBe('West Drayton');
  });

  it('reports MEDIUM confidence for a 2-8 km locality', () => {
    const result = lookup.findNearestLocality(51.7, -0.75);
    expect(result?.confidence).toBe('medium');
    expect(result!.distanceKm).toBeGreaterThan(2);
    expect(result!.distanceKm).toBeLessThanOrEqual(8);
  });

  it('does not let population/admin bonuses overpower distance', () => {
    const close = scoreLocalityCandidate(1, 0, 'PPL');
    const farBigCity = scoreLocalityCandidate(15, 2_000_000, 'PPLC');
    expect(close.score).toBeLessThan(farBigCity.score);
    const village = makeIndex([
      ['Small Village', 51.5, -0.5, 'GB', '', 'PPL', 100],
      ['Metropolis', 51.635, -0.5, 'GB', '', 'PPLC', 2_000_000] as LocalityRecord,
    ]);
    expect(createLocalityLookup(village).findNearestLocality(51.5, -0.5)?.name).toBe('Small Village');
  });

  it('returns null when nothing is within the search radius', () => {
    expect(lookup.findNearestLocality(-40, -140)).toBeNull();
  });

  it('returns LOW confidence for a 8-25 km locality, which callers suppress', () => {
    const only = makeIndex([['Far Village', 51.6, -0.5, 'GB', '', 'PPL', 800] as LocalityRecord]);
    const result = createLocalityLookup(only).findNearestLocality(51.5, -0.5);
    expect(result).toMatchObject({ name: 'Far Village', confidence: 'low' });
    expect(result!.distanceKm).toBeGreaterThan(8);
    expect(result!.distanceKm).toBeLessThanOrEqual(25);
  });

  it('is stable across cell boundaries', () => {
    const onBoundary = lookup.findNearestLocality(51.5, -0.5);
    const justInside = lookup.findNearestLocality(51.5001, -0.5001);
    const justOutside = lookup.findNearestLocality(51.4999, -0.4999);
    expect(onBoundary?.name).toBeTruthy();
    expect(justInside?.name).toBe(onBoundary?.name);
    expect(justOutside?.name).toBe(onBoundary?.name);
  });

  it('handles border-like near-ties by distance without throwing', () => {
    const twoTowns = makeIndex([
      ['Border Town A', 51.5, -0.26, 'GB', '', 'PPL', 5000],
      ['Border Town B', 51.5, -0.24, 'IE', '', 'PPL', 5000] as LocalityRecord,
    ]);
    expect(createLocalityLookup(twoTowns).findNearestLocality(51.5, -0.2501)?.name).toBe('Border Town A');
    expect(createLocalityLookup(twoTowns).findNearestLocality(51.5, -0.2499)?.name).toBe('Border Town B');
    expect(createLocalityLookup(twoTowns).findNearestLocality(51.5, -0.2601)?.name).toBe('Border Town A');
  });

  it('maps distances to the production confidence policy', () => {
    expect(confidenceForDistance(1.9)).toBe('high');
    expect(confidenceForDistance(2.1)).toBe('medium');
    expect(confidenceForDistance(7.9)).toBe('medium');
    expect(confidenceForDistance(8.1)).toBe('low');
    expect(confidenceForDistance(24.9)).toBe('low');
    expect(confidenceForDistance(25.1)).toBeNull();
  });
});
