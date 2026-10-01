import { describe, expect, it } from 'vitest';
import { buildIndex, nearbyLines, nearbyPlaces } from './index.js';
import { raw } from './fixture.js';

const index = buildIndex(structuredClone(raw));

describe('places', () => {
  it('groups both sides of the road into one place', () => {
    const middle = index.placeOfStop('o2');
    expect(index.placeOfStop('i2')).toBe(middle);
    expect(middle.stops.map((s) => s.id)).toEqual(['o2', 'i2']);
  });

  it('keeps far apart stops with the same name separate', () => {
    expect(index.placeOfStop('o5')).not.toBe(index.placeOfStop('o2'));
  });

  it('collects every line serving a place', () => {
    expect(index.placeOfStop('o2').routes.sort()).toEqual(['A', 'B']);
  });
});

describe('departuresAt', () => {
  it('lists each pattern leaving the place', () => {
    const deps = index.departuresAt(index.placeOfStop('o2'));
    const keys = deps.map((d) => `${d.pattern.route_id}/${d.pattern.direction}`).sort();
    expect(keys).toEqual(['A/in', 'A/out', 'B/out']);
  });

  it('skips patterns that end at the place', () => {
    const deps = index.departuresAt(index.placeOfStop('o4'));
    expect(deps).toEqual([]);
  });
});

describe('nearby', () => {
  const here = { lat: 22.3, lon: 73.1702 };

  it('sorts places by distance and drops places with no service', () => {
    const names = nearbyPlaces(index, here).map((n) => n.place.name);
    expect(names[0]).toBe('Middle');
    expect(names).toHaveLength(4);
  });

  it('returns one card per line with outbound first', () => {
    const lines = nearbyLines(index, here);
    expect(lines.map((l) => l.route.id)).toEqual(['A', 'B']);
    expect(lines[0].directions.map((d) => d.pattern.direction)).toEqual(['out', 'in']);
  });

  it('ignores lines beyond walking distance', () => {
    expect(nearbyLines(index, { lat: 23, lon: 74 })).toEqual([]);
  });
});
