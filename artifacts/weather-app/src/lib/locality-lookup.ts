/*
 * Pure offline locality lookup (no DOM, no network).
 *
 * Data is the processed Candidate B GeoNames index: populated places with
 * population >= 500 plus all administrative seats, bucketed into a fixed
 * latitude/longitude grid. Ranking favours the nearest locality, with a small
 * capped preference for population and administrative status so a large city
 * can never beat a clearly closer locality.
 */

export type LocalityConfidence = 'high' | 'medium' | 'low';

export type LocalityMatch = {
  name: string;
  countryCode: string;
  featureCode: string;
  distanceKm: number;
  confidence: LocalityConfidence;
};

/** [name, latitude, longitude, countryCode, admin1, featureCode, population] */
export type LocalityRecord = [string, number, number, string, string, string, number];

export type LocalityIndex = {
  cellSize: number;
  count: number;
  cells: Record<string, [number, number]>;
  records: LocalityRecord[];
};

export const LOCALITY_MAX_RADIUS_KM = 25;
const MAX_BONUS_KM = 3.5;
const EARTH_RADIUS_KM = 6371.0088;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * score = distanceKm - min(3.5, populationBonus + adminBonus + localityTypeBonus)
 * The cap guarantees that distance stays dominant.
 */
export function scoreLocalityCandidate(distanceKm: number, population: number, featureCode: string): { score: number; bonus: number } {
  let bonus = 0;
  if (population >= 1000000) bonus += 2.0;
  else if (population >= 100000) bonus += 1.2;
  else if (population >= 10000) bonus += 0.6;
  else if (population >= 1000) bonus += 0.3;
  if (featureCode === 'PPLC') bonus += 1.5;
  else if (featureCode === 'PPLA') bonus += 1.0;
  else if (featureCode === 'PPLA2') bonus += 0.6;
  else if (featureCode === 'PPLA3' || featureCode === 'PPLA4' || featureCode === 'PPLA5') bonus += 0.3;
  else if (featureCode === 'PPLG') bonus += 0.5;
  if (featureCode === 'PPLX' || featureCode === 'PPLL') bonus += 0.2;
  const capped = Math.min(MAX_BONUS_KM, bonus);
  return { score: distanceKm - capped, bonus: capped };
}

export function confidenceForDistance(distanceKm: number): LocalityConfidence | null {
  if (distanceKm <= 2) return 'high';
  if (distanceKm <= 8) return 'medium';
  if (distanceKm <= LOCALITY_MAX_RADIUS_KM) return 'low';
  return null;
}

export function createLocalityLookup(index: LocalityIndex) {
  const { cellSize, cells, records } = index;

  function candidates(latitude: number, longitude: number): LocalityRecord[] {
    const latIdx = Math.floor((latitude + 90) / cellSize);
    const lonIdx = Math.floor((longitude + 180) / cellSize);
    const latRings = Math.max(1, Math.ceil(LOCALITY_MAX_RADIUS_KM / (cellSize * 111.32)));
    const cosLat = Math.max(0.2, Math.cos((latitude * Math.PI) / 180));
    const lonRings = Math.max(1, Math.ceil(LOCALITY_MAX_RADIUS_KM / (cellSize * 111.32 * cosLat)));
    const found: LocalityRecord[] = [];
    for (let dLat = -latRings; dLat <= latRings; dLat += 1) {
      for (let dLon = -lonRings; dLon <= lonRings; dLon += 1) {
        const range = cells[`${latIdx + dLat}_${lonIdx + dLon}`];
        if (!range) continue;
        const [start, count] = range;
        for (let i = start; i < start + count; i += 1) found.push(records[i]);
      }
    }
    return found;
  }

  /** Nearest locality within 25 km, or null. LOW confidence means "do not show". */
  function findNearestLocality(latitude: number, longitude: number): LocalityMatch | null {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    let best: { record: LocalityRecord; distanceKm: number; score: number } | null = null;
    for (const record of candidates(latitude, longitude)) {
      const distanceKm = haversineKm(latitude, longitude, record[1], record[2]);
      if (distanceKm > LOCALITY_MAX_RADIUS_KM) continue;
      const { score } = scoreLocalityCandidate(distanceKm, record[6] || 0, record[5]);
      if (!best || score < best.score) best = { record, distanceKm, score };
    }
    if (!best) return null;
    return {
      name: best.record[0],
      countryCode: best.record[3],
      featureCode: best.record[5],
      distanceKm: Math.round(best.distanceKm * 10) / 10,
      confidence: confidenceForDistance(best.distanceKm) ?? 'low',
    };
  }

  return { findNearestLocality };
}
