import { describe, expect, it } from 'vitest';

import { DEVICE_LOCATION_DECIMAL_PLACES, roundDeviceLocation } from './location-privacy';

describe('roundDeviceLocation', () => {
  it('rounds device location to the coarser one-decimal grid', () => {
    expect(DEVICE_LOCATION_DECIMAL_PLACES).toBe(1);
    expect(roundDeviceLocation(51.5074, -0.1278)).toEqual({
      latitude: 51.5,
      longitude: -0.1,
    });
  });

  it('preserves coordinates that are already on the grid', () => {
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
