/**
 * Coarsens device-derived coordinates on platforms that do not expose
 * Android's approximate-location permission contract to Daymark.
 *
 * A 0.025-degree cell is roughly 2.8 km north/south and 1.7 km east/west
 * around London (about 4.8 km²). Android instead relies on the operating
 * system's approximate location because the Android manifest deliberately
 * declares ACCESS_COARSE_LOCATION without ACCESS_FINE_LOCATION.
 *
 * Search-selected place coordinates are governed by the place-search flow,
 * not this helper.
 */
export const DEVICE_LOCATION_GRID_DEGREES = 0.025;

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

  const roundToGrid = (coordinate: number) =>
    Number((Math.round(coordinate / DEVICE_LOCATION_GRID_DEGREES) * DEVICE_LOCATION_GRID_DEGREES).toFixed(3));

  return {
    latitude: roundToGrid(latitude),
    longitude: roundToGrid(longitude),
  };
}
