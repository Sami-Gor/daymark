import { describe, expect, it } from 'vitest';

import { createWeatherRequestGate } from './weather-requests';

describe('weather request ordering', () => {
  it('lets only the newest request commit and clear loading', () => {
    const gate = createWeatherRequestGate();
    const older = gate.begin();
    const newer = gate.begin();

    expect(gate.isCurrent(older)).toBe(false);
    expect(gate.ownsLoading(older)).toBe(false);
    expect(gate.isCurrent(newer)).toBe(true);
    expect(gate.ownsLoading(newer)).toBe(true);
  });

  it('drops a response whose location selection was invalidated', () => {
    const gate = createWeatherRequestGate();
    let selection = 1;
    const request = gate.begin(() => selection === 1);

    selection = 2;

    expect(gate.isCurrent(request)).toBe(false);
  });

  it('still lets the invalidated request clear the shared loading state', () => {
    const gate = createWeatherRequestGate();
    let selection = 1;
    const request = gate.begin(() => selection === 1);

    // Backgrounding invalidates the selection without starting a new request.
    selection = 2;

    expect(gate.isCurrent(request)).toBe(false);
    expect(gate.ownsLoading(request)).toBe(true);
  });

  it('keeps a location response valid while its selection is current', () => {
    const gate = createWeatherRequestGate();
    const selection = 1;
    const request = gate.begin(() => selection === 1);

    expect(gate.isCurrent(request)).toBe(true);
    expect(gate.ownsLoading(request)).toBe(true);
  });

  it('does not let an invalidated location response clear loading for a newer request', () => {
    const gate = createWeatherRequestGate();
    let selection = 1;
    const locationRequest = gate.begin(() => selection === 1);

    // A search starts a newer request and invalidates the location selection.
    selection = 2;
    const searchRequest = gate.begin();

    expect(gate.isCurrent(locationRequest)).toBe(false);
    expect(gate.ownsLoading(locationRequest)).toBe(false);
    expect(gate.isCurrent(searchRequest)).toBe(true);
    expect(gate.ownsLoading(searchRequest)).toBe(true);
  });
});
