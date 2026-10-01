import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Standard OpenStreetMap tiles. They're muted with a CSS filter (see
// .basemap in styles.css) so the bus lines stand out, and inverted in dark mode.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Stop dots only appear once zoomed in far enough to tell them apart.
const STOPS_MIN_ZOOM = 15;

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

  L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19, className: 'basemap' }).addTo(map);
  darkQuery.addEventListener('change', () => redraw());

  const network = L.layerGroup().addTo(map);
  const networkStops = L.layerGroup();
  const focus = L.layerGroup().addTo(map);
  let userMarker = null;
  let accuracyCircle = null;
  let current = { kind: 'overview' };

  /**
   * The path a bus takes between two positions on a pattern. Uses the road
   * shape when the data has one, otherwise straight lines between stops.
   */
  function path(pattern, from = 0, to = pattern.stop_ids.length - 1) {
    const points = [latlng(index.stop(pattern.stop_ids[from]))];
    for (let i = from; i < to; i++) {
      const segment = pattern.segments?.[i];
      if (segment?.length) points.push(...segment.slice(1));
      else points.push(latlng(index.stop(pattern.stop_ids[i + 1])));
    }
    return points;
  }
  const patternLine = (p) => path(p);

  /** All lines, plus stop dots when zoomed in. Only shown on the home screen. */
  function drawNetwork() {
    network.clearLayers();
    networkStops.clearLayers();
    for (const p of index.patterns) {
      if (p.direction !== 'out' && index.pattern(p.route_id, 'out')) continue;
      L.polyline(patternLine(p), {
        color: index.route(p.route_id).color,
        weight: 3,
        opacity: 0.7,
        interactive: false,
      }).addTo(network);
    }
    for (const place of index.places) {
      if (!place.routes.length) continue;
      L.circleMarker(latlng(place), {
        radius: 4,
        color: css('--ink-2'),
        weight: 1.5,
        fillColor: css('--surface'),
        fillOpacity: 1,
      })
        .bindTooltip(place.name, { className: 'stop-tip', direction: 'top', offset: [0, -4] })
        .on('click', () => onPlaceClick(place))
        .addTo(networkStops);
    }
    network.addLayer(networkStops);
    syncStops();
  }

  function hideNetwork() {
    network.clearLayers();
    networkStops.clearLayers();
  }

  function syncStops() {
    const show = map.getZoom() >= STOPS_MIN_ZOOM;
    if (show && !network.hasLayer(networkStops)) network.addLayer(networkStops);
    if (!show && network.hasLayer(networkStops)) network.removeLayer(networkStops);
  }
  map.on('zoomend', syncStops);

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
    drawNetwork();
    if (center) fit(L.latLng(latlng(center)).toBounds(1400), 15);
  }

  function showPattern(pattern, fromStopId) {
    current = { kind: 'pattern', pattern, fromStopId };
    hideNetwork();
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
    hideNetwork();
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

  /** Draws one planned trip: bus legs in line colours, walks dashed. */
  function showTrip(trip, from, to, { fit: refit = true } = {}) {
    current = { kind: 'trip', trip, from, to };
    hideNetwork();
    focus.clearLayers();
    const points = [latlng(from), latlng(to)];
    let here = from;

    for (const leg of trip?.legs ?? []) {
      if (leg.type === 'walk') {
        const target = leg.to ? index.stop(leg.to) : to;
        L.polyline([latlng(here), latlng(target)], {
          color: css('--ink-2'),
          weight: 4,
          dashArray: '2 8',
          lineCap: 'round',
          interactive: false,
        }).addTo(focus);
        here = target;
      } else if (leg.type === 'ride') {
        const ids = leg.pattern.stop_ids.slice(leg.fromPos, leg.toPos + 1);
        const line = path(leg.pattern, leg.fromPos, leg.toPos);
        points.push(...line);
        L.polyline(line, { color: css('--surface'), weight: 11, interactive: false }).addTo(focus);
        L.polyline(line, { color: leg.route.color, weight: 6, interactive: false }).addTo(focus);
        ids.forEach((id, i) => {
          const end = i === 0 || i === ids.length - 1;
          stopDot(index.stop(id), index.placeOfStop(id), leg.route.color, end).addTo(focus);
        });
        here = index.stop(ids[ids.length - 1]);
      }
    }

    endPin(from, '#2f7cf6').addTo(focus);
    endPin(to, '#e5484d').addTo(focus);
    if (refit) fit(L.latLngBounds(points));
  }

  function endPin(point, color) {
    return L.circleMarker(latlng(point), {
      radius: 8,
      color: '#fff',
      weight: 3,
      fillColor: color,
      fillOpacity: 1,
      interactive: false,
    });
  }

  /** Moves the blue dot, or removes it when `position` is null. */
  function setUser(position, accuracy) {
    if (!position) {
      userMarker?.remove();
      accuracyCircle?.remove();
      userMarker = accuracyCircle = null;
      return;
    }
    if (!userMarker) {
      const icon = L.divIcon({ className: '', html: '<div class="user-dot"></div>', iconSize: [18, 18] });
      accuracyCircle = L.circle(latlng(position), {
        radius: 0,
        color: '#2f7cf6',
        weight: 1,
        opacity: 0.4,
        fillColor: '#2f7cf6',
        fillOpacity: 0.1,
        interactive: false,
      }).addTo(map);
      userMarker = L.marker(latlng(position), { icon, interactive: false, zIndexOffset: 1000 }).addTo(map);
    }
    userMarker.setLatLng(latlng(position));
    accuracyCircle.setLatLng(latlng(position)).setRadius(Math.min(accuracy ?? 0, 500));
  }

  function centerOn(position) {
    fit(L.latLng(latlng(position)).toBounds(900), 16);
  }

  function redraw() {
    if (current.kind === 'trip') showTrip(current.trip, current.from, current.to, { fit: false });
    else if (current.kind === 'pattern') showPattern(current.pattern, current.fromStopId);
    else if (current.kind === 'place') showPlace(current.place);
    else drawNetwork();
  }

  drawNetwork();
  return { overview, showPattern, showPlace, showTrip, setUser, centerOn, invalidate: () => map.invalidateSize() };
}
