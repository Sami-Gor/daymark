/**
 * Coarsens device-derived coordinates before any location-derived request.
 *
 * A 0.025-degree cell is roughly 2.8 km north/south and 1.7 km east/west
 * around London (about 4.8 km²). The same on-device grid is used by the web/PWA
 * and the Android app; Android additionally declares only
 * ACCESS_COARSE_LOCATION, so the OS fix is already approximate before this
 * second, independently applied privacy step.
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

/**
 * Returns the only device-derived coordinates Daymark is allowed to send.
 *
 * Both Android and web/PWA snap the fix to the same 0.025-degree grid on the
 * device. Android's manifest additionally declares only
 * ACCESS_COARSE_LOCATION and never ACCESS_FINE_LOCATION; the grid is applied
 * once to whatever approximate fix Android supplies. The returned pair is
 * the value used for the Open-Meteo forecast and air-quality requests.
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
