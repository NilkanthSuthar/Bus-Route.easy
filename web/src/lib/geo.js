const EARTH_RADIUS_M = 6371000;
const rad = (deg) => (deg * Math.PI) / 180;

export function distanceM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function formatDistance(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

// Streets are never a straight line: walking routes in a city are typically
// 20-40% longer than the crow flies, so straight distances are scaled up.
export const WALK = {
  metresPerMin: 80, // ~4.8 km/h, a normal walking pace
  detour: 1.3,
};

/** Estimated walking distance for a straight-line distance. */
export const walkingMetres = (straightM) => straightM * WALK.detour;

/** Estimated walking time in (fractional) minutes for a straight-line distance. */
export const walkingMin = (straightM) => walkingMetres(straightM) / WALK.metresPerMin;

/** Whole minutes for display; never says zero. */
export function walkMinutes(straightM) {
  return Math.max(1, Math.round(walkingMin(straightM)));
}
