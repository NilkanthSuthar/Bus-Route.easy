import { describe, expect, it } from 'vitest';
import { distanceM, formatDistance, walkMinutes } from './geo.js';

describe('distanceM', () => {
  it('is zero for the same point', () => {
    expect(distanceM({ lat: 22.3, lon: 73.18 }, { lat: 22.3, lon: 73.18 })).toBe(0);
  });

  it('measures about 111 km per degree of latitude', () => {
    const d = distanceM({ lat: 22, lon: 73 }, { lat: 23, lon: 73 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe('formatDistance', () => {
  it('uses metres under a kilometre', () => {
    expect(formatDistance(243)).toBe('240 m');
  });

  it('uses kilometres above that', () => {
    expect(formatDistance(1530)).toBe('1.5 km');
    expect(formatDistance(12400)).toBe('12 km');
  });
});

describe('walkMinutes', () => {
  it('never says zero minutes', () => {
    expect(walkMinutes(5)).toBe(1);
    expect(walkMinutes(400)).toBe(5);
  });
});
