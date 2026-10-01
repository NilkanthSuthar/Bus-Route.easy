import { distanceM } from '../lib/geo.js';
import { normalize } from '../lib/search.js';

/**
 * Turns the raw JSON into lookups the UI needs.
 *
 * The source data has a separate stop point for each side of the road, so
 * stops with the same name close together are grouped into one "place".
 */
export function buildIndex({ stops, routes, route_stops: patterns, transfers, depots }) {
  const stopById = new Map(stops.map((s) => [s.id, s]));
  const routeById = new Map(routes.map((r) => [r.id, r]));
  const patternsByRoute = new Map();
  const patternsByStop = new Map();

  for (const p of patterns) {
    const list = patternsByRoute.get(p.route_id) ?? [];
    list.push(p);
    patternsByRoute.set(p.route_id, list);
    p.stop_ids.forEach((sid, position) => {
      const at = patternsByStop.get(sid) ?? [];
      at.push({ pattern: p, position });
      patternsByStop.set(sid, at);
    });
  }

  const places = groupPlaces(stops);
  const placeByStop = new Map();
  for (const place of places) for (const s of place.stops) placeByStop.set(s.id, place);

  return {
    stops,
    routes,
    patterns,
    transfers,
    depots,
    places,
    stop: (id) => stopById.get(id),
    route: (id) => routeById.get(id),
    place: (id) => places.find((p) => p.id === id),
    placeOfStop: (id) => placeByStop.get(id),
    patternsOf: (routeId) => patternsByRoute.get(routeId) ?? [],
    pattern: (routeId, direction) =>
      (patternsByRoute.get(routeId) ?? []).find((p) => p.direction === direction),
    departuresAt: (place) =>
      place.stops.flatMap((s) => patternsByStop.get(s.id) ?? []).filter(
        // Skip patterns that end here; nothing departs from the last stop.
        ({ pattern, position }) => position < pattern.stop_ids.length - 1,
      ),
  };
}

const SAME_PLACE_M = 400;

export function groupPlaces(stops) {
  const places = [];
  for (const stop of stops) {
    const key = normalize(stop.name);
    const place = places.find(
      (p) => p.key === key && p.stops.some((s) => distanceM(s, stop) <= SAME_PLACE_M),
    );
    if (place) place.stops.push(stop);
    else places.push({ key, name: stop.name, stops: [stop] });
  }
  for (const place of places) {
    place.id = place.stops[0].id;
    place.lat = avg(place.stops.map((s) => s.lat));
    place.lon = avg(place.stops.map((s) => s.lon));
    place.routes = [...new Set(place.stops.flatMap((s) => s.routes))];
  }
  return places;
}

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Places with service, nearest first. */
export function nearbyPlaces(index, from, limit = 12) {
  return index.places
    .filter((p) => p.routes.length)
    .map((p) => ({ place: p, distance: distanceM(from, p) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

/** One entry per line and direction, using the closest stop that serves it. */
export function nearbyLines(index, from, maxDistanceM = 1500) {
  const best = new Map();
  for (const { place, distance } of nearbyPlaces(index, from, 60)) {
    if (distance > maxDistanceM) break;
    for (const { pattern, position } of index.departuresAt(place)) {
      const key = `${pattern.route_id}/${pattern.direction}`;
      if (!best.has(key)) best.set(key, { pattern, position, place, distance });
    }
  }
  const byRoute = new Map();
  for (const entry of best.values()) {
    const list = byRoute.get(entry.pattern.route_id) ?? [];
    list.push(entry);
    byRoute.set(entry.pattern.route_id, list);
  }
  return [...byRoute.entries()]
    .map(([routeId, directions]) => ({
      route: index.route(routeId),
      // Descending, so 'out' comes before 'in'.
      directions: directions.sort((a, b) => b.pattern.direction.localeCompare(a.pattern.direction)),
      distance: Math.min(...directions.map((d) => d.distance)),
    }))
    .sort((a, b) => a.distance - b.distance);
}

export async function loadData(base = import.meta.env.BASE_URL) {
  const names = ['stops', 'routes', 'route_stops', 'transfers', 'depots'];
  const files = await Promise.all(
    names.map(async (name) => {
      const res = await fetch(`${base}data/${name}.json`);
      if (!res.ok) throw new Error(`Could not load ${name}.json (${res.status})`);
      return res.json();
    }),
  );
  return buildIndex(Object.fromEntries(names.map((n, i) => [n, files[i]])));
}
