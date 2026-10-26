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

  it('rejects infinities, out-of-range values and NaN longitude', () => {
    expect(() => roundDeviceLocation(Number.POSITIVE_INFINITY, 0)).toThrow(RangeError);
    expect(() => roundDeviceLocation(Number.NEGATIVE_INFINITY, 0)).toThrow(RangeError);
    expect(() => roundDeviceLocation(0, Number.NaN)).toThrow(RangeError);
    expect(() => roundDeviceLocation(-90.0001, 0)).toThrow(RangeError);
    expect(() => roundDeviceLocation(90.0001, 0)).toThrow(RangeError);
    expect(() => roundDeviceLocation(0, -180.0001)).toThrow(RangeError);
    expect(() => roundDeviceLocation(0, 180.0001)).toThrow(RangeError);
  });

  it('keeps the poles and the dateline inside the valid range', () => {
    expect(roundDeviceLocation(90, 180)).toEqual({ latitude: 90, longitude: 180 });
    expect(roundDeviceLocation(-90, -180)).toEqual({ latitude: -90, longitude: -180 });
    // A coordinate just inside the limit may snap onto it, never past it.
    expect(roundDeviceLocation(89.999, 179.999)).toEqual({ latitude: 90, longitude: 180 });
    expect(roundDeviceLocation(-89.999, -179.999)).toEqual({ latitude: -90, longitude: -180 });
  });

  it('normalises coordinates that round to zero instead of emitting negative zero', () => {
    const rounded = roundDeviceLocation(-0.0001, -0.0001);
    expect(rounded).toEqual({ latitude: 0, longitude: 0 });
    expect(Object.is(rounded.latitude, -0)).toBe(false);
    expect(Object.is(rounded.longitude, -0)).toBe(false);
  });

  it('is idempotent for coordinates that already sit on the grid', () => {
    for (const [latitude, longitude] of [
      [0, 0],
      [51.5, -0.125],
      [-33.875, 151.2],
      [0.075, -0.075],
    ]) {
      expect(roundDeviceLocation(latitude, longitude)).toEqual({ latitude, longitude });
    }
  });

  it('never moves a coordinate by more than half a grid cell', () => {
    for (const [latitude, longitude] of [
      [51.5074567, -0.12789012],
      [-33.9249, 18.4241],
      [64.1466, -21.9426],
      [89.9994, -179.9994],
    ]) {
      const rounded = roundDeviceLocation(latitude, longitude);
      expect(Math.abs(rounded.latitude - latitude)).toBeLessThanOrEqual(DEVICE_LOCATION_GRID_DEGREES / 2);
      expect(Math.abs(rounded.longitude - longitude)).toBeLessThanOrEqual(DEVICE_LOCATION_GRID_DEGREES / 2);
    }
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
