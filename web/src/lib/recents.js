// Recently used trips and stops, kept in this browser only.
// Storage can be missing or throw (private mode, blocked site data), so every
// access is guarded and the app works the same without it.

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createRecents(storage = safeStorage(), key = 'bre.recents') {
  const LIMITS = { trips: 4, places: 6 };

  function read() {
    try {
      const data = JSON.parse(storage?.getItem(key) ?? '{}');
      return { trips: data.trips ?? [], places: data.places ?? [] };
    } catch {
      return { trips: [], places: [] };
    }
  }

  function write(data) {
    try {
      storage?.setItem(key, JSON.stringify(data));
    } catch {
      // Out of space or blocked: just don't remember.
    }
  }

  function push(list, item, same, limit) {
    return [item, ...list.filter((x) => !same(x, item))].slice(0, limit);
  }

  return {
    trips: () => read().trips,
    places: () => read().places,
    addTrip(fromId, toId) {
      const data = read();
      data.trips = push(data.trips, { fromId, toId }, (a, b) => a.fromId === b.fromId && a.toId === b.toId, LIMITS.trips);
      write(data);
    },
    addPlace(id) {
      const data = read();
      data.places = push(data.places, id, (a, b) => a === b, LIMITS.places);
      write(data);
    },
    clear: () => write({ trips: [], places: [] }),
  };
}
