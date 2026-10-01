import { distanceM, walkingMetres, walkingMin as walkMin } from '../lib/geo.js';

// There are no timetables, so every time here is an estimate.
export const ASSUMPTIONS = {
  busMetresPerMin: 300, // ~18 km/h average city bus speed, stops included
  dwellMin: 0.5, // time spent at each intermediate stop
  waitMin: 10, // average wait for a bus (half of a ~20 min gap between buses)
  maxAccessWalkM: 800, // walk to the first stop
  maxTransferWalkM: 400, // walk between stops when changing buses
  maxEgressWalkM: 800, // walk from the last stop
  maxWalkOnlyM: 1500, // offer just walking below this distance
};

// Cost vectors are [boardings, minutes]. The two modes rank them differently.
const MODES = {
  fastest: (a, b) => a[1] + a[0] * 0.01 - (b[1] + b[0] * 0.01),
  fewestChanges: (a, b) => a[0] - b[0] || a[1] - b[1],
};

class Heap {
  constructor(compare) {
    this.items = [];
    this.compare = compare;
  }
  get size() {
    return this.items.length;
  }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(a[i], a[parent]) >= 0) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      i = parent;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.compare(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.compare(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

const graphs = new WeakMap();

/** Precomputes what the search needs from the index. Cached per index. */
function graphFor(index) {
  if (graphs.has(index)) return graphs.get(index);

  const boardings = new Map(); // stopId -> [{ p, pos }]
  const rideMin = index.patterns.map((pattern, p) => {
    const stops = pattern.stop_ids.map((id) => index.stop(id));
    pattern.stop_ids.forEach((id, pos) => {
      if (pos === stops.length - 1) return;
      const list = boardings.get(id) ?? [];
      list.push({ p, pos });
      boardings.set(id, list);
    });
    return stops
      .slice(1)
      .map((s, i) => distanceM(stops[i], s) / ASSUMPTIONS.busMetresPerMin + ASSUMPTIONS.dwellMin);
  });

  const walks = new Map(); // stopId -> [{ to, m }]
  const addWalk = (a, b, m) => {
    const list = walks.get(a) ?? [];
    list.push({ to: b, m });
    walks.set(a, list);
  };
  for (let i = 0; i < index.stops.length; i++) {
    for (let j = i + 1; j < index.stops.length; j++) {
      const a = index.stops[i];
      const b = index.stops[j];
      const m = distanceM(a, b);
      if (m <= ASSUMPTIONS.maxTransferWalkM) {
        addWalk(a.id, b.id, m);
        addWalk(b.id, a.id, m);
      }
    }
  }

  const graph = { boardings, rideMin, walks };
  graphs.set(index, graph);
  return graph;
}

/**
 * Finds the best trip between two points for one mode.
 *
 * Nodes: 'O' origin, 'D' destination, 's:<stop>' standing at a stop,
 * 'a:<stop>' just got off a bus there, 'p:<pattern>:<pos>' on a bus.
 * Splitting 's' and 'a' keeps walks to three places: to the first stop,
 * between buses, and from the last stop.
 */
function search(index, from, to, mode) {
  const { boardings, rideMin, walks } = graphFor(index);
  const compare = MODES[mode];
  const best = new Map([['O', [0, 0]]]);
  const parent = new Map();
  const heap = new Heap((x, y) => compare(x.cost, y.cost));
  heap.push({ node: 'O', cost: [0, 0] });

  const egress = new Map(
    index.stops
      .map((s) => [s.id, distanceM(s, to)])
      .filter(([, m]) => m <= ASSUMPTIONS.maxEgressWalkM),
  );

  const relax = (node, cost, edge) => {
    const known = best.get(node);
    if (known && compare(known, cost) <= 0) return;
    best.set(node, cost);
    parent.set(node, edge);
    heap.push({ node, cost });
  };

  const done = new Set();
  while (heap.size) {
    const { node, cost } = heap.pop();
    if (done.has(node)) continue;
    done.add(node);
    if (node === 'D') break;
    const [b, t] = cost;

    if (node === 'O') {
      for (const s of index.stops) {
        const m = distanceM(from, s);
        if (m <= ASSUMPTIONS.maxAccessWalkM) {
          relax(`s:${s.id}`, [b, t + walkMin(m)], { from: node, type: 'walk', to: s.id, m });
        }
      }
    } else if (node.startsWith('s:')) {
      const stopId = node.slice(2);
      // Boarding includes the ride to the next stop, so a trip can never
      // get on and straight off again (which would let walks chain up).
      for (const { p, pos } of boardings.get(stopId) ?? []) {
        relax(`p:${p}:${pos + 1}`, [b + 1, t + ASSUMPTIONS.waitMin + rideMin[p][pos]], {
          from: node,
          type: 'board',
          p,
          pos,
        });
      }
    } else if (node.startsWith('a:')) {
      const stopId = node.slice(2);
      relax(`s:${stopId}`, cost, { from: node, type: 'stay' });
      for (const { to: other, m } of walks.get(stopId) ?? []) {
        relax(`s:${other}`, [b, t + walkMin(m)], { from: node, type: 'walk', to: other, m });
      }
      if (egress.has(stopId)) {
        const m = egress.get(stopId);
        relax('D', [b, t + walkMin(m)], { from: node, type: 'walk', to: null, m });
      }
    } else {
      const [, pStr, posStr] = node.split(':');
      const p = Number(pStr);
      const pos = Number(posStr);
      const pattern = index.patterns[p];
      relax(`a:${pattern.stop_ids[pos]}`, cost, { from: node, type: 'alight' });
      if (pos + 1 < pattern.stop_ids.length) {
        relax(`p:${p}:${pos + 1}`, [b, t + rideMin[p][pos]], { from: node, type: 'ride', p });
      }
    }
  }

  if (!done.has('D')) return null;

  const edges = [];
  for (let node = 'D'; node !== 'O'; node = parent.get(node).from) edges.push({ node, ...parent.get(node) });
  edges.reverse();
  return toItinerary(index, edges, best.get('D')[1]);
}

function toItinerary(index, edges, totalMin) {
  const { rideMin } = graphFor(index);
  const legs = [];
  let ride = null;
  let lastStop = null;

  for (const e of edges) {
    if (e.type === 'walk') {
      if (e.m >= 30) {
        legs.push({ type: 'walk', from: lastStop, to: e.to, metres: walkingMetres(e.m), minutes: walkMin(e.m) });
      }
      lastStop = e.to;
    } else if (e.type === 'board') {
      const pattern = index.patterns[e.p];
      ride = {
        type: 'ride',
        pattern,
        route: index.route(pattern.route_id),
        fromPos: e.pos,
        toPos: e.pos + 1,
        minutes: rideMin[e.p][e.pos],
      };
      legs.push({ type: 'wait', at: pattern.stop_ids[e.pos], minutes: ASSUMPTIONS.waitMin });
    } else if (e.type === 'ride') {
      ride.minutes += rideMin[e.p][ride.toPos];
      ride.toPos += 1;
    } else if (e.type === 'alight') {
      ride.from = ride.pattern.stop_ids[ride.fromPos];
      ride.to = ride.pattern.stop_ids[ride.toPos];
      ride.stops = ride.toPos - ride.fromPos;
      legs.push(ride);
      lastStop = ride.to;
      ride = null;
    }
  }

  const rides = legs.filter((l) => l.type === 'ride');
  return {
    legs,
    minutes: Math.round(totalMin),
    rides: rides.length,
    changes: Math.max(0, rides.length - 1),
    walkMetres: Math.round(legs.filter((l) => l.type === 'walk').reduce((sum, l) => sum + l.metres, 0)),
    walkMinutes: legs.filter((l) => l.type === 'walk').reduce((sum, l) => sum + l.minutes, 0),
    key: rides.map((r) => `${r.route.id}/${r.pattern.direction}@${r.from}`).join('>'),
  };
}

/**
 * Plans a trip. `from` and `to` are { lat, lon } points (a place works too).
 * Returns up to three options: walking (when close), fastest, fewest changes.
 */
export function planTrip(index, from, to) {
  const options = [];
  const direct = distanceM(from, to);

  for (const mode of ['fastest', 'fewestChanges']) {
    const trip = search(index, from, to, mode);
    if (!trip || trip.rides === 0) continue;
    const same = options.find((o) => o.key === trip.key);
    if (same) same.tags.push(mode);
    else options.push({ ...trip, tags: [mode] });
  }

  if (direct <= ASSUMPTIONS.maxWalkOnlyM) {
    const minutes = Math.round(walkMin(direct));
    const walk = {
      legs: [{ type: 'walk', from: null, to: null, metres: walkingMetres(direct), minutes: walkMin(direct) }],
      minutes,
      rides: 0,
      changes: 0,
      walkMetres: Math.round(walkingMetres(direct)),
      walkMinutes: walkMin(direct),
      key: 'walk',
      tags: ['walk'],
    };
    if (!options.length || minutes <= options[0].minutes) options.unshift(walk);
    else options.push(walk);
  }

  return options;
}
