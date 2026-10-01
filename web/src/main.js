import './styles.css';
import { loadData } from './data/index.js';
import { distanceM } from './lib/geo.js';
import { createMap } from './ui/map.js';
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
  originLabel: 'Near City Bus Station',
  query: '',
  // Set while choosing a trip's start or end from search: { field, fromId, toId }.
  pick: null,
};
let index;
let map;
// How many views deep we are, so Back can use browser history when it can.
let depth = 0;
let goingBack = false;

function insets() {
  if (mobile.matches) {
    // Use the size the sheet is animating to, not its current height.
    const sheet = panel.dataset.size === 'full' ? window.innerHeight - 56 : window.innerHeight * 0.48;
    return { topLeft: [24, 24], bottomRight: [24, sheet + 24] };
  }
  return { topLeft: [panel.offsetWidth + 48, 24], bottomRight: [24, 24] };
}

function setSheet(size) {
  panel.dataset.size = size;
  document.getElementById('sheet-handle').setAttribute(
    'aria-label',
    size === 'full' ? 'Collapse panel' : 'Expand panel',
  );
  setTimeout(() => map?.invalidate(), 260);
}

const located = () => state.originLabel === 'Near you';

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

function render() {
  const [, kind, ...args] = currentRoute();

  if (state.query || state.pick) {
    view.innerHTML = searchView(index, state.query, state.origin, state.pick && pickContext());
    return;
  }

  if (kind === 'plan') {
    const from = tripEnd(args[0]);
    const to = tripEnd(args[1]);
    const options = from && to && from.id !== to.id ? planTrip(index, from, to) : [];
    const selected = Math.min(Number(args[2]) || 0, Math.max(0, options.length - 1));
    view.innerHTML = planView(index, { from, to, options, selected });
    if (from && to) map.showTrip(options[selected], from, to);
    else map.overview(from ?? to ?? state.origin);
  } else if (kind === 'line') {
    const [routeId, direction, fromStopId] = args;
    const pattern = index.pattern(routeId, direction) ?? index.patternsOf(routeId)[0];
    if (!pattern) {
      view.innerHTML = errorView(`Line ${routeId} isn't in the data.`);
      return;
    }
    view.innerHTML = lineView(index, pattern, fromStopId);
    map.showPattern(pattern, fromStopId);
  } else if (kind === 'place') {
    const place = index.place(args[0]);
    if (!place) {
      view.innerHTML = errorView("That stop isn't in the data.");
      return;
    }
    view.innerHTML = placeView(index, place, state.origin);
    map.showPlace(place);
  } else {
    view.innerHTML = homeView(index, state);
    map.overview(state.origin);
  }
  view.scrollTop = 0;
}

function locate() {
  if (!navigator.geolocation) return;
  locateBtn.setAttribute('aria-busy', 'true');
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      locateBtn.removeAttribute('aria-busy');
      const here = { lat: coords.latitude, lon: coords.longitude };
      if (distanceM(here, HUB) > CITY_RADIUS_M) {
        state.originLabel = "You're outside Vadodara · showing City Bus Station";
      } else {
        state.origin = here;
        state.originLabel = 'Near you';
        map.setUser(here);
      }
      const kind = currentRoute()[1];
      if (kind && kind !== 'plan') location.hash = '#/';
      else render();
    },
    () => {
      locateBtn.removeAttribute('aria-busy');
      state.originLabel = 'Location off · showing City Bus Station';
      render();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
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
      if (mobile.matches) setSheet('peek');
      // Same hash means no hashchange event, so draw the view ourselves.
      if (link.getAttribute('href') === location.hash) render();
    }
  });

  searchInput.addEventListener('input', () => {
    state.query = searchInput.value.trim();
    render();
  });
  searchInput.addEventListener('focus', () => mobile.matches && setSheet('full'));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      endSearch();
      searchInput.blur();
      render();
    }
  });

  document.getElementById('sheet-handle').addEventListener('click', () =>
    setSheet(panel.dataset.size === 'full' ? 'peek' : 'full'),
  );
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
}

start();
