import './styles.css';
import { loadData } from './data/index.js';
import { distanceM } from './lib/geo.js';
import { createRecents } from './lib/recents.js';
import { createTracker, shouldRefresh } from './lib/tracker.js';
import { createMap } from './ui/map.js';
import { createSheet } from './ui/sheet.js';
import { planTrip } from './routing/planner.js';
import {
  errorView,
  homeView,
  lineView,
  placeView,
  planHref,
  planView,
  searchView,
} from './ui/views.js';

// Vadodara City Bus Station: the default "here" until we know where the user is.
const HUB = { lat: 22.310342, lon: 73.1823 };
const CITY_RADIUS_M = 25000;

const panel = document.getElementById('panel');
const view = document.getElementById('view');
const searchInput = document.getElementById('search');
const locateBtn = document.getElementById('locate');
const mobile = window.matchMedia('(max-width: 720px)');

const state = {
  origin: HUB,
  // True while we have a live GPS fix inside the city.
  located: false,
  originLabel: 'Near City Bus Station',
  query: '',
  // Set while choosing a trip's start or end from search: { field, fromId, toId }.
  pick: null,
};
const recents = createRecents();
let index;
let map;
// How many views deep we are, so Back can use browser history when it can.
let depth = 0;
let goingBack = false;

const sheet = createSheet(panel, {
  handle: document.getElementById('sheet-handle'),
  dragArea: panel.querySelector('.panel-top'),
  isActive: () => mobile.matches,
  // Let the height animation finish before the map measures itself again.
  onSettle: () => setTimeout(() => map?.invalidate(), 260),
});
const setSheet = (size) => mobile.matches && sheet.set(size);

function insets() {
  if (mobile.matches) return { topLeft: [24, 24], bottomRight: [24, sheet.targetHeight() + 24] };
  return { topLeft: [panel.offsetWidth + 48, 24], bottomRight: [24, 24] };
}

const located = () => state.located;

/** Turns a planner id ('here' or a place id) into { id, name, lat, lon }. */
function tripEnd(id) {
  if (id === 'here') {
    return { id, name: located() ? 'Your location' : 'City Bus Station', ...state.origin };
  }
  const place = id && index.place(id);
  return place ? { id, name: place.name, lat: place.lat, lon: place.lon } : null;
}

function pickContext() {
  const { field, fromId, toId } = state.pick;
  return {
    field,
    allowHere: true,
    hereLabel: located() ? 'Your location' : 'City Bus Station',
    recent: recents.places().map((id) => index.place(id)).filter(Boolean),
    href: (id) => planHref(field === 'from' ? id : fromId, field === 'to' ? id : toId),
    cancelHref: location.hash || '#/',
  };
}

function startPick(field) {
  const [, , fromId = '', toId = ''] = currentRoute();
  state.pick = { field, fromId, toId };
  searchInput.placeholder = field === 'from' ? 'Search for a start' : 'Search for a destination';
  searchInput.focus();
  render();
}

function endSearch() {
  state.query = '';
  state.pick = null;
  searchInput.value = '';
  searchInput.placeholder = 'Search stops or lines';
}

const currentRoute = () =>
  location.hash.replace(/^#\/?/, '#/').split('/').map(decodeURIComponent);

/**
 * Draws the current screen. A `live` render comes from a GPS update: it
 * refreshes distances and walking times but leaves the map view and the
 * scroll position alone.
 */
function render({ live = false } = {}) {
  const [, kind, ...args] = currentRoute();
  const scroll = view.scrollTop;

  if (state.query || state.pick) {
    if (live) return;
    view.innerHTML = searchView(index, state.query, state.origin, state.pick && pickContext());
    return;
  }

  if (kind === 'plan') {
    if (live && args[0] !== 'here' && args[1] !== 'here') return;
    const from = tripEnd(args[0]);
    const to = tripEnd(args[1]);
    const options = from && to && from.id !== to.id ? planTrip(index, from, to) : [];
    const selected = Math.min(Number(args[2]) || 0, Math.max(0, options.length - 1));
    view.innerHTML = planView(index, { from, to, options, selected });
    if (options.length && !live) {
      recents.addTrip(from.id, to.id);
      for (const end of [from, to]) if (end.id !== 'here') recents.addPlace(end.id);
    }
    if (from && to) map.showTrip(options[selected], from, to, { fit: !live });
    else if (!live) map.overview(from ?? to ?? state.origin);
  } else if (kind === 'line') {
    const [routeId, direction, fromStopId] = args;
    const pattern = index.pattern(routeId, direction) ?? index.patternsOf(routeId)[0];
    if (!pattern) {
      view.innerHTML = errorView(`Line ${routeId} isn't in the data.`);
      return;
    }
    view.innerHTML = lineView(index, pattern, fromStopId, located() ? state.origin : null);
    if (!live) map.showPattern(pattern, fromStopId);
  } else if (kind === 'place') {
    const place = index.place(args[0]);
    if (!place) {
      view.innerHTML = errorView("That stop isn't in the data.");
      return;
    }
    view.innerHTML = placeView(index, place, state.origin, located());
    if (!live) {
      recents.addPlace(place.id);
      map.showPlace(place);
    }
  } else {
    const recentTrips = recents
      .trips()
      .map((t) => ({ from: tripEnd(t.fromId), to: tripEnd(t.toId) }))
      .filter((t) => t.from && t.to)
      .slice(0, 3);
    view.innerHTML = homeView(index, state, recentTrips);
    if (!live) map.overview(state.origin);
  }
  view.scrollTop = live ? scroll : 0;
}

// ---------- Live location ----------

let lastRendered = null; // position the screen was last drawn for
let centerOnNextFix = false;

function onPosition(pos) {
  locateBtn.removeAttribute('aria-busy');
  locateBtn.setAttribute('aria-pressed', 'true');

  if (distanceM(pos, HUB) > CITY_RADIUS_M) {
    if (state.located || !lastRendered) {
      Object.assign(state, {
        located: false,
        origin: HUB,
        originLabel: "You're outside Vadodara · showing City Bus Station",
      });
      lastRendered = HUB;
      map.setUser(null);
      render({ live: true });
    }
    return;
  }

  Object.assign(state, { located: true, origin: pos, originLabel: 'Near you' });
  map.setUser(pos, pos.accuracy);
  if (centerOnNextFix) {
    centerOnNextFix = false;
    map.centerOn(pos);
  }
  if (shouldRefresh(lastRendered, pos)) {
    lastRendered = pos;
    render({ live: true });
  }
}

function onLocationError(err) {
  locateBtn.removeAttribute('aria-busy');
  if (err.code !== 1) return; // weak signal or timeout: keep trying quietly
  locateBtn.setAttribute('aria-pressed', 'false');
  Object.assign(state, {
    located: false,
    origin: HUB,
    originLabel: 'Location off · showing City Bus Station',
  });
  lastRendered = null;
  map.setUser(null);
  render({ live: true });
}

const tracker = createTracker({ onPosition, onError: onLocationError });

function locate() {
  if (!tracker.supported) return;
  if (tracker.active && state.located) {
    map.centerOn(state.origin);
    return;
  }
  locateBtn.setAttribute('aria-busy', 'true');
  centerOnNextFix = true;
  tracker.start();
}

// Start following straight away if location was allowed on an earlier visit.
function resumeTracking() {
  navigator.permissions
    ?.query({ name: 'geolocation' })
    .then((status) => status.state === 'granted' && tracker.start())
    .catch(() => {});
}

function bindEvents() {
  window.addEventListener('hashchange', () => {
    depth = goingBack ? Math.max(0, depth - 1) : depth + 1;
    goingBack = false;
    render();
  });

  view.addEventListener('click', (e) => {
    if (e.target.closest('[data-back]') && depth > 0) {
      e.preventDefault();
      goingBack = true;
      history.back();
      return;
    }
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      e.preventDefault();
      startPick(pick.dataset.pick);
      return;
    }
    const link = e.target.closest('a[href^="#"]');
    if (link && (state.query || state.pick)) {
      endSearch();
      setSheet('half');
      // Same hash means no hashchange event, so draw the view ourselves.
      if (link.getAttribute('href') === location.hash) render();
    }
  });

  searchInput.addEventListener('input', () => {
    state.query = searchInput.value.trim();
    render();
  });
  searchInput.addEventListener('focus', () => setSheet('full'));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      endSearch();
      searchInput.blur();
      render();
    }
  });

  locateBtn.addEventListener('click', locate);
}

async function start() {
  try {
    index = await loadData();
  } catch (err) {
    view.innerHTML = errorView(`Couldn't load bus data. ${err.message}`);
    return;
  }
  map = createMap(document.getElementById('map'), index, {
    insets,
    onPlaceClick: (place) => {
      location.hash = `#/place/${encodeURIComponent(place.id)}`;
    },
  });
  bindEvents();
  render();
  resumeTracking();
}

start();

// Offline support. Only in production builds, so dev always serves fresh files.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
