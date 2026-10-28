/**
 * Coarsens device-derived coordinates before any location-derived request.
 *
 * The latitude step is never smaller than 0.025 degrees. A 0.025-degree
 * longitude cell shrinks with latitude, so above roughly 67 degrees the
 * longitude step widens just enough to keep the represented cell at or above
 * Google Play's 3 km² approximate-location floor. The grid never uses a
 * smaller step than 0.025 degrees and never sends the raw device fix.
 *
 * Points at the exact poles are moved to the last 0.025-degree cell centre
 * inside the pole. A cell centred on ±90 degrees has zero longitude extent and
 * therefore cannot represent a non-zero area.
 *
 * Search-selected place coordinates are governed by the place-search flow,
 * not this helper.
 */
export const DEVICE_LOCATION_GRID_DEGREES = 0.025;
export const MIN_DEVICE_LOCATION_CELL_AREA_KM2 = 3;
export const MAX_DEVICE_LOCATION_GRID_LATITUDE = 90 - DEVICE_LOCATION_GRID_DEGREES;
export const KM_PER_DEGREE = 111.32;

function cellTopLatitude(latitude: number): number {
  const absoluteLatitude = Math.min(
    Math.abs(latitude),
    MAX_DEVICE_LOCATION_GRID_LATITUDE,
  );
  return Math.min(
    90,
    absoluteLatitude + DEVICE_LOCATION_GRID_DEGREES / 2,
  );
}

/**
 * The longitude step required to keep the cell at least 3 km² at this
 * latitude. The minimum is the same 0.025° grid used by the latitude step.
 */
export function longitudeGridDegreesForLatitude(latitude: number): number {
  const top = cellTopLatitude(latitude);
  const kmWidth = KM_PER_DEGREE * DEVICE_LOCATION_GRID_DEGREES;
  const cosine = Math.cos((top * Math.PI) / 180);
  const required = MIN_DEVICE_LOCATION_CELL_AREA_KM2
    / (kmWidth * KM_PER_DEGREE * cosine);
  return Math.max(DEVICE_LOCATION_GRID_DEGREES, required);
}

/**
 * Approximate surface area represented by the rounded cell at this latitude.
 * The upper edge is used so the result is conservative.
 */
export function approximateGridCellAreaKm2(latitude: number): number {
  const longitudeStep = longitudeGridDegreesForLatitude(latitude);
  const top = cellTopLatitude(latitude);
  const kmWidth = KM_PER_DEGREE * DEVICE_LOCATION_GRID_DEGREES;
  const kmHeight = KM_PER_DEGREE * longitudeStep
    * Math.cos((top * Math.PI) / 180);
  return kmWidth * kmHeight;
}

function roundToGrid(coordinate: number, step: number): number {
  const rounded = Number((Math.round(coordinate / step) * step).toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function roundDeviceLocation(latitude: number, longitude: number): {
  latitude: number;
  longitude: number;
} {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError('latitude must be a finite value between -90 and 90');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError('longitude must be a finite value between -180 and 180');
  }

  const roundedLatitude = roundToGrid(latitude, DEVICE_LOCATION_GRID_DEGREES);
  const safeLatitude = Math.max(
    -MAX_DEVICE_LOCATION_GRID_LATITUDE,
    Math.min(MAX_DEVICE_LOCATION_GRID_LATITUDE, roundedLatitude),
  );
  const longitudeStep = longitudeGridDegreesForLatitude(safeLatitude);
  const roundedLongitude = roundToGrid(longitude, longitudeStep);

  return {
    latitude: safeLatitude,
    longitude: Math.max(-180, Math.min(180, roundedLongitude)),
  };
}

/**
 * Returns the only device-derived coordinates Daymark is allowed to send.
 *
 * Both Android and web/PWA apply the same effective privacy policy: a
 * latitude-aware grid with a 0.025-degree minimum step. Android additionally
 * declares only ACCESS_COARSE_LOCATION and never ACCESS_FINE_LOCATION; the
 * grid is applied once to whatever approximate fix Android supplies. The
 * returned pair is the value used for the Open-Meteo forecast and air-quality
 * requests.
 */
export function resolveDeviceLocation(
  latitude: number,
  longitude: number,
): {
  latitude: number;
  longitude: number;
} {
  return roundDeviceLocation(latitude, longitude);
}
