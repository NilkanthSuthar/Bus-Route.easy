export function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function score(haystack, query) {
  if (haystack === query) return 0;
  if (haystack.startsWith(query)) return 1;
  if (haystack.split(' ').some((word) => word.startsWith(query))) return 2;
  if (haystack.includes(query)) return 3;
  return Infinity;
}

/** Matches lines by number and places by name. Best matches first. */
export function search(index, rawQuery, limit = 20) {
  const query = normalize(rawQuery);
  if (!query) return [];
  const results = [];

  for (const route of index.routes) {
    const s = Math.min(score(normalize(route.id), query), score(normalize(route.name), query) + 1);
    if (s < Infinity) results.push({ type: 'line', route, score: s });
  }
  for (const place of index.places) {
    const s = score(place.key, query);
    if (s < Infinity) results.push({ type: 'place', place, score: s + 0.5 });
  }

  return results
    .sort((a, b) => a.score - b.score || label(a).localeCompare(label(b), 'en', { numeric: true }))
    .slice(0, limit);
}

const label = (r) => (r.type === 'line' ? r.route.id : r.place.name);
