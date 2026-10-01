// Place and address search with Photon (photon.komoot.io), an OpenStreetMap
// geocoder that is fine with search-as-you-type. Results are kept to the
// Vadodara area. Any failure (offline, server down) just means no results.

const API = 'https://photon.komoot.io';
// minLon, minLat, maxLon, maxLat
export const VADODARA_BBOX = [73.05, 22.15, 73.32, 22.45];

const inBox = (lat, lon, [x1, y1, x2, y2] = VADODARA_BBOX) =>
  lat >= y1 && lat <= y2 && lon >= x1 && lon <= x2;

/** Turns a Photon feature into { name, detail, lat, lon }. */
export function toPlace(feature) {
  const p = feature.properties ?? {};
  const [lon, lat] = feature.geometry?.coordinates ?? [];
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const name = p.name || street || p.district || p.city;
  if (!name || lat == null) return null;
  const detail = [p.name ? street : null, p.district || p.locality, p.city]
    .filter((part) => part && part !== name)
    .join(', ');
  return { name, detail, lat, lon };
}

export function createGeocoder({ fetch = globalThis.fetch, api = API } = {}) {
  const cache = new Map();

  async function get(url, signal) {
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Place search failed (${res.status})`);
    return res.json();
  }

  return {
    /** Places matching `query` around Vadodara, best first. */
    async search(query, { signal } = {}) {
      const q = query.trim();
      if (q.length < 3) return [];
      if (cache.has(q)) return cache.get(q);
      const params = new URLSearchParams({ q, limit: '8', lang: 'en', bbox: VADODARA_BBOX.join(',') });
      const data = await get(`${api}/api/?${params}`, signal);
      const seen = new Set();
      const places = (data.features ?? [])
        .map(toPlace)
        .filter((p) => p && inBox(p.lat, p.lon))
        .filter((p) => {
          const key = `${p.name}|${p.detail}`;
          return !seen.has(key) && seen.add(key);
        });
      cache.set(q, places);
      return places;
    },

    /** A readable name for a point, or null. */
    async nameOf(lat, lon, { signal } = {}) {
      const params = new URLSearchParams({ lat, lon, lang: 'en' });
      const data = await get(`${api}/reverse?${params}`, signal);
      const place = data.features?.[0] && toPlace(data.features[0]);
      return place ? place.name : null;
    },
  };
}

// Trip ends that aren't stops travel in the URL as "pt:<lat>,<lon>,<name>".
export const pointId = ({ lat, lon, name }) => `pt:${lat.toFixed(5)},${lon.toFixed(5)},${name}`;

export function parsePointId(id) {
  const m = /^pt:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(.*)$/s.exec(id ?? '');
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { id, lat, lon, name: m[3] || 'Dropped pin' };
}
