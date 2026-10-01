import { describe, expect, it } from 'vitest';
import { buildIndex } from '../data/index.js';
import { raw } from '../data/fixture.js';
import { planTrip } from './planner.js';

const index = buildIndex(structuredClone(raw));
const place = (id) => index.placeOfStop(id);
const rides = (trip) => trip.legs.filter((l) => l.type === 'ride');

describe('planTrip', () => {
  it('rides a single line when it goes straight there', () => {
    const [trip] = planTrip(index, place('o1'), place('o3'));
    expect(rides(trip).map((r) => r.route.id)).toEqual(['A']);
    expect(rides(trip)[0].stops).toBe(2);
    expect(trip.changes).toBe(0);
  });

  it('changes buses at a shared stop', () => {
    const [trip] = planTrip(index, place('o1'), place('o4'));
    expect(rides(trip).map((r) => `${r.route.id}:${r.from}->${r.to}`)).toEqual(['A:o1->o2', 'B:o2->o4']);
    expect(trip.changes).toBe(1);
  });

  it('uses the right direction of a line', () => {
    const [trip] = planTrip(index, place('o3'), place('o1'));
    expect(rides(trip)[0].pattern.direction).toBe('in');
  });

  it('offers walking when the destination is close', () => {
    const options = planTrip(index, place('o1'), place('o2'));
    expect(options.map((o) => o.tags[0])).toContain('walk');
  });

  it('returns nothing when no line gets there', () => {
    const nowhere = { lat: 22.5, lon: 73.5 };
    expect(planTrip(index, place('o1'), nowhere)).toEqual([]);
  });

  it('adds up leg times to the total', () => {
    const [trip] = planTrip(index, place('o1'), place('o4'));
    const sum = trip.legs.reduce((s, l) => s + l.minutes, 0);
    expect(Math.abs(sum - trip.minutes)).toBeLessThanOrEqual(1);
  });
});

describe('walking limits', () => {
  // Line L stops at X, 500 m from the start. The destination is 700 m past X
  // and out of reach of any line, so there is no real bus trip.
  const net = {
    stops: [
      { id: 'x', name: 'X', lat: 22.3, lon: 73.1048, routes: [] },
      { id: 'y', name: 'Y', lat: 22.35, lon: 73.2, routes: [] },
    ],
    routes: [{ id: 'L', name: 'L', color: '#000', directions: ['out'] }],
    route_stops: [{ route_id: 'L', direction: 'out', headsign: 'Y', stop_ids: ['x', 'y'] }],
    transfers: [],
    depots: [],
  };
  const idx = buildIndex(net);

  it('never gets on a bus and straight off again to chain walks', () => {
    const start = { lat: 22.3, lon: 73.1 };
    const end = { lat: 22.3, lon: 73.1116 };
    for (const option of planTrip(idx, start, end)) {
      for (const ride of rides(option)) expect(ride.stops).toBeGreaterThan(0);
    }
  });
});

describe('fastest vs fewest changes', () => {
  // Slow line S loops far out; quick lines Q1 + Q2 need a change at "Hub".
  const net = {
    stops: [
      { id: 'a', name: 'Start', lat: 22.3, lon: 73.1, routes: [] },
      { id: 'far', name: 'Far Away', lat: 22.4, lon: 73.15, routes: [] },
      { id: 'hub', name: 'Hub', lat: 22.3, lon: 73.15, routes: [] },
      { id: 'b', name: 'End', lat: 22.3, lon: 73.2, routes: [] },
    ],
    routes: [
      { id: 'S', name: 'Slow', color: '#000', directions: ['out'] },
      { id: 'Q1', name: 'Quick 1', color: '#111', directions: ['out'] },
      { id: 'Q2', name: 'Quick 2', color: '#222', directions: ['out'] },
    ],
    route_stops: [
      { route_id: 'S', direction: 'out', headsign: 'End', stop_ids: ['a', 'far', 'b'] },
      { route_id: 'Q1', direction: 'out', headsign: 'Hub', stop_ids: ['a', 'hub'] },
      { route_id: 'Q2', direction: 'out', headsign: 'End', stop_ids: ['hub', 'b'] },
    ],
    transfers: [],
    depots: [],
  };
  const idx = buildIndex(net);
  const options = planTrip(idx, idx.placeOfStop('a'), idx.placeOfStop('b'));

  it('returns both options when they differ', () => {
    expect(options).toHaveLength(2);
  });

  it('labels the quicker two-bus trip as fastest', () => {
    const fastest = options.find((o) => o.tags.includes('fastest'));
    expect(rides(fastest).map((r) => r.route.id)).toEqual(['Q1', 'Q2']);
  });

  it('labels the one-bus trip as fewest changes', () => {
    const fewest = options.find((o) => o.tags.includes('fewestChanges'));
    expect(rides(fewest).map((r) => r.route.id)).toEqual(['S']);
    expect(fewest.minutes).toBeGreaterThan(options.find((o) => o.tags.includes('fastest')).minutes);
  });
});
