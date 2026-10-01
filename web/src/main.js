import './styles.css';
import { loadData } from './data/index.js';
import { distanceM } from './lib/geo.js';
import { createMap } from './ui/map.js';
import { errorView, homeView, lineView, placeView, searchView } from './ui/views.js';

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
};
let index;
let map;
// How many views deep we are, so Back can use browser history when it can.
let depth = 0;
let goingBack = false;

function insets() {
  if (mobile.matches) return { topLeft: [24, 24], bottomRight: [24, panel.offsetHeight + 24] };
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

function render() {
  const [, kind, ...args] = location.hash.replace(/^#\/?/, '#/').split('/').map(decodeURIComponent);

  if (state.query) {
    view.innerHTML = searchView(index, state.query, state.origin);
    return;
  }

  if (kind === 'line') {
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
      if (location.hash && location.hash !== '#/') location.hash = '#/';
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
    const link = e.target.closest('a[href^="#"]');
    if (link && state.query) {
      state.query = '';
      searchInput.value = '';
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
      searchInput.value = '';
      state.query = '';
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
