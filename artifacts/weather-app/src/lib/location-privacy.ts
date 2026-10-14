/**
 * Coarsens the device-derived location before any network request.
 *
 * A tenth of a degree is roughly 11 km north/south and 7 km east/west in the
 * UK. This is deliberately much coarser than a two-decimal coordinate while
 * retaining a useful regional forecast location. Search-selected place
 * coordinates remain governed by the place-search flow, not this helper.
 */
export const DEVICE_LOCATION_DECIMAL_PLACES = 1;

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

  return {
    latitude: Number(latitude.toFixed(DEVICE_LOCATION_DECIMAL_PLACES)),
    longitude: Number(longitude.toFixed(DEVICE_LOCATION_DECIMAL_PLACES)),
  };
}
