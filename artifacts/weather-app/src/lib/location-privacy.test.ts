import { describe, expect, it } from 'vitest';

import {
  approximateGridCellAreaKm2,
  DEVICE_LOCATION_GRID_DEGREES,
  longitudeGridDegreesForLatitude,
  MAX_DEVICE_LOCATION_GRID_LATITUDE,
  resolveDeviceLocation,
  roundDeviceLocation,
} from './location-privacy';

describe('roundDeviceLocation', () => {
  it('keeps the 0.025-degree latitude grid as the minimum', () => {
    expect(DEVICE_LOCATION_GRID_DEGREES).toBe(0.025);
    expect(roundDeviceLocation(51.5074, -0.1278)).toEqual({
      latitude: 51.5,
      longitude: -0.125,
    });
  });

  it('preserves coordinates that already fall on the grid at the UK latitude', () => {
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

  it('clamps an exact pole to the last non-zero-area grid cell', () => {
    const north = roundDeviceLocation(90, 180);
    const south = roundDeviceLocation(-90, -180);
    expect(north.latitude).toBe(MAX_DEVICE_LOCATION_GRID_LATITUDE);
    expect(south.latitude).toBe(-MAX_DEVICE_LOCATION_GRID_LATITUDE);
    expect(north.longitude).toBeGreaterThanOrEqual(-180);
    expect(north.longitude).toBeLessThanOrEqual(180);
    expect(approximateGridCellAreaKm2(north.latitude)).toBeGreaterThanOrEqual(3);
    expect(approximateGridCellAreaKm2(south.latitude)).toBeGreaterThanOrEqual(3);
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

  it('never moves a coordinate by more than half the effective grid step', () => {
    for (const [latitude, longitude] of [
      [51.5074567, -0.12789012],
      [-33.9249, 18.4241],
      [64.1466, -21.9426],
      [80.1234, 179.4567],
    ]) {
      const rounded = roundDeviceLocation(latitude, longitude);
      const longitudeStep = longitudeGridDegreesForLatitude(rounded.latitude);
      expect(Math.abs(rounded.latitude - latitude)).toBeLessThanOrEqual(DEVICE_LOCATION_GRID_DEGREES / 2);
      expect(Math.abs(rounded.longitude - longitude)).toBeLessThanOrEqual(longitudeStep / 2);
    }
  });

  it('keeps the effective cell at least 3 km² across the supported latitude range', () => {
    for (const latitude of [-90, -89.975, -89.9, -80, -67.2, -51.5, 0, 51.5, 67.2, 80, 89.9, 89.975, 90]) {
      const rounded = roundDeviceLocation(latitude, 123.4567);
      expect(approximateGridCellAreaKm2(rounded.latitude)).toBeGreaterThanOrEqual(3 - 1e-9);
      expect(rounded.latitude).toBeGreaterThanOrEqual(-90);
      expect(rounded.latitude).toBeLessThanOrEqual(90);
    }
  });

  it('widens only longitude above the latitude where 0.025° reaches 3 km²', () => {
    expect(longitudeGridDegreesForLatitude(51.5)).toBe(DEVICE_LOCATION_GRID_DEGREES);
    expect(longitudeGridDegreesForLatitude(67.2)).toBeGreaterThanOrEqual(DEVICE_LOCATION_GRID_DEGREES);
    expect(longitudeGridDegreesForLatitude(80)).toBeGreaterThan(DEVICE_LOCATION_GRID_DEGREES);
    expect(longitudeGridDegreesForLatitude(89.975)).toBeGreaterThan(DEVICE_LOCATION_GRID_DEGREES);
  });
});

describe('resolveDeviceLocation', () => {
  it('snaps every device-derived fix to the agreed privacy grid', () => {
    expect(resolveDeviceLocation(51.5074567, -0.12789012)).toEqual({
      latitude: 51.5,
      longitude: -0.125,
    });
    // The v1 two-decimal rounding remains obsolete; the V2 grid is coarser.
    expect(resolveDeviceLocation(51.5074567, -0.12789012).latitude).not.toBe(
      Number(51.5074567.toFixed(2)),
    );
  });

  it('does not expose an Android bypass that sends the raw fix', () => {
    const raw = { latitude: 51.5074567, longitude: -0.12789012 };
    const resolved = resolveDeviceLocation(raw.latitude, raw.longitude);
    expect(resolved.latitude).toBe(51.5);
    expect(resolved.longitude).toBe(-0.125);
    expect(resolved).not.toEqual(raw);
  });

  it('applies the same latitude-aware policy through the public resolver', () => {
    const highLatitude = resolveDeviceLocation(80.1234, 179.4567);
    expect(highLatitude.latitude).toBe(80.125);
    expect(approximateGridCellAreaKm2(highLatitude.latitude)).toBeGreaterThanOrEqual(3);
    expect(longitudeGridDegreesForLatitude(highLatitude.latitude)).toBeGreaterThan(
      DEVICE_LOCATION_GRID_DEGREES,
    );
  });
});
