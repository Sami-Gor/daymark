import { describe, expect, it } from 'vitest';

import {
  DEVICE_LOCATION_GRID_DEGREES,
  resolveDeviceLocation,
  roundDeviceLocation,
} from './location-privacy';

describe('roundDeviceLocation', () => {
  it('rounds device location to a grid of approximately 3 km² or more', () => {
    expect(DEVICE_LOCATION_GRID_DEGREES).toBe(0.025);
    expect(roundDeviceLocation(51.5074, -0.1278)).toEqual({
      latitude: 51.5,
      longitude: -0.125,
    });
  });

  it('preserves coordinates that already fall on the grid', () => {
    expect(roundDeviceLocation(40.7, -74.0)).toEqual({
      latitude: 40.7,
      longitude: -74,
    });
  });

  it('rejects invalid coordinates rather than transmitting them', () => {
    expect(() => roundDeviceLocation(Number.NaN, 0)).toThrow(RangeError);
    expect(() => roundDeviceLocation(91, 0)).toThrow(RangeError);
    expect(() => roundDeviceLocation(0, 181)).toThrow(RangeError);
  });
});

describe('resolveDeviceLocation', () => {
  it('sends the approximate fix unchanged on Android', () => {
    // Android grants ACCESS_COARSE_LOCATION only, so the operating system
    // already coarsened the fix. Rounding it again would compound the loss
    // of accuracy for regional forecasts.
    expect(resolveDeviceLocation(51.5074567, -0.12789012, true)).toEqual({
      latitude: 51.5074567,
      longitude: -0.12789012,
    });
    // The two-decimal rounding of v1.0.0 stays removed on this path.
    expect(resolveDeviceLocation(51.5074567, -0.12789012, true).latitude).not.toBe(
      Number(51.5074567.toFixed(2)),
    );
  });

  it('snaps the fix to the privacy grid on every other platform', () => {
    expect(resolveDeviceLocation(51.5074567, -0.12789012, false)).toEqual({
      latitude: 51.5,
      longitude: -0.125,
    });
  });

  it('applies a different policy per platform', () => {
    const android = resolveDeviceLocation(51.5074567, -0.12789012, true);
    const web = resolveDeviceLocation(51.5074567, -0.12789012, false);
    expect(android).not.toEqual(web);
  });
});
