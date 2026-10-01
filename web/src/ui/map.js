import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const isDark = () => {
  const forced = document.documentElement.dataset.theme;
  return forced ? forced === 'dark' : darkQuery.matches;
};
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const latlng = (p) => [p.lat, p.lon];

export function createMap(el, index, { onPlaceClick, insets }) {
  const map = L.map(el, { zoomControl: false, attributionControl: true }).setView(
    [22.31, 73.185],
    13,
  );
  L.control.zoom({ position: 'topright' }).addTo(map);

  let tiles = L.tileLayer(TILES[isDark() ? 'dark' : 'light'], {
    attribution: ATTRIBUTION,
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);
  darkQuery.addEventListener('change', () => {
    tiles.setUrl(TILES[isDark() ? 'dark' : 'light']);
    redraw();
  });

  const network = L.layerGroup().addTo(map);
  const focus = L.layerGroup().addTo(map);
  let userMarker = null;
  let current = { kind: 'overview' };

  const patternLine = (p) => p.stop_ids.map((id) => latlng(index.stop(id)));

  function drawNetwork(faded) {
    network.clearLayers();
    for (const p of index.patterns) {
      if (p.direction !== 'out' && index.pattern(p.route_id, 'out')) continue;
      L.polyline(patternLine(p), {
        color: index.route(p.route_id).color,
        weight: faded ? 3 : 4,
        opacity: faded ? 0.18 : 0.55,
        interactive: false,
      }).addTo(network);
    }
    for (const place of index.places) {
      if (!place.routes.length) continue;
      L.circleMarker(latlng(place), {
        radius: faded ? 2.5 : 3.5,
        color: css('--ink-3'),
        weight: 1,
        fillColor: css('--surface'),
        fillOpacity: 1,
        opacity: faded ? 0.5 : 1,
      })
        .bindTooltip(place.name, { className: 'stop-tip', direction: 'top', offset: [0, -4] })
        .on('click', () => onPlaceClick(place))
        .addTo(network);
    }
  }

  // `point` is where to draw; `place` is what opens when it is clicked.
  function stopDot(point, place, color, big) {
    return L.circleMarker(latlng(point), {
      radius: big ? 9 : 5,
      color,
      weight: big ? 4 : 3,
      fillColor: big ? color : css('--surface'),
      fillOpacity: 1,
    })
      .bindTooltip(place.name, { className: 'stop-tip', direction: 'top', offset: [0, -6] })
      .on('click', () => onPlaceClick(place));
  }

  function fit(bounds, maxZoom = 16) {
    const { topLeft, bottomRight } = insets();
    map.flyToBounds(bounds, {
      paddingTopLeft: topLeft,
      paddingBottomRight: bottomRight,
      maxZoom,
      duration: 0.6,
    });
  }

  function overview(center) {
    current = { kind: 'overview', center };
    focus.clearLayers();
    drawNetwork(false);
    if (center) fit(L.latLng(latlng(center)).toBounds(1400), 15);
  }

  function showPattern(pattern, fromStopId) {
    current = { kind: 'pattern', pattern, fromStopId };
    drawNetwork(true);
    focus.clearLayers();
    const color = index.route(pattern.route_id).color;
    const line = patternLine(pattern);
    L.polyline(line, { color: css('--surface'), weight: 11, opacity: 1, interactive: false }).addTo(focus);
    L.polyline(line, { color, weight: 6, opacity: 1, interactive: false }).addTo(focus);
    pattern.stop_ids.forEach((id, i) => {
      const big = id === fromStopId || i === 0 || i === pattern.stop_ids.length - 1;
      stopDot(index.stop(id), index.placeOfStop(id), color, big).addTo(focus);
    });
    fit(L.latLngBounds(line));
  }

  function showPlace(place) {
    current = { kind: 'place', place };
    drawNetwork(true);
    focus.clearLayers();
    const lines = new Set();
    for (const { pattern } of index.departuresAt(place)) {
      const key = pattern.route_id;
      if (lines.has(key)) continue;
      lines.add(key);
      L.polyline(patternLine(pattern), {
        color: index.route(key).color,
        weight: 5,
        opacity: 0.85,
        interactive: false,
      }).addTo(focus);
    }
    stopDot(place, place, css('--brand'), true).addTo(focus);
    fit(L.latLng(latlng(place)).toBounds(1600), 16);
  }

  function setUser(position) {
    const icon = L.divIcon({ className: '', html: '<div class="user-dot"></div>', iconSize: [18, 18] });
    if (userMarker) userMarker.setLatLng(latlng(position));
    else userMarker = L.marker(latlng(position), { icon, interactive: false, zIndexOffset: 1000 }).addTo(map);
  }

  function redraw() {
    if (current.kind === 'pattern') showPattern(current.pattern, current.fromStopId);
    else if (current.kind === 'place') showPlace(current.place);
    else drawNetwork(false);
  }

  drawNetwork(false);
  return { overview, showPattern, showPlace, setUser, invalidate: () => map.invalidateSize() };
}
