import { nearbyLines, nearbyPlaces } from '../data/index.js';
import { distanceM, formatDistance, walkMinutes } from '../lib/geo.js';
import { search } from '../lib/search.js';
import { ASSUMPTIONS } from '../routing/planner.js';

const ICONS = {
  back: '<svg viewBox="0 0 24 24"><path d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M7 4 3 8l4 4V9h10V7H7V4Zm10 8v3H7v2h10v3l4-4-4-4Z"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7Zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/></svg>',
  walk: '<svg viewBox="0 0 24 24"><path d="M13.5 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM9.8 8.9 7 10.3V14H5V9l5.6-2.8c.9-.4 2-.1 2.5.8l1 1.7A5 5 0 0 0 18 11v2a7 7 0 0 1-4.9-2l-.6 3 2.5 2.4V22h-2v-4.8l-2.6-2.4L9.4 22H7.3l2.5-13.1Z"/></svg>',
  directions: '<svg viewBox="0 0 24 24"><path d="m21.7 11.3-9-9a1 1 0 0 0-1.4 0l-9 9a1 1 0 0 0 0 1.4l9 9a1 1 0 0 0 1.4 0l9-9a1 1 0 0 0 0-1.4ZM14 14.5V12h-4v3H8v-4a1 1 0 0 1 1-1h5V7.5l3.5 3.5-3.5 3.5Z"/></svg>',
  here: '<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0-6a1 1 0 0 1 1 1v1.06A8 8 0 0 1 19.94 11H21a1 1 0 1 1 0 2h-1.06A8 8 0 0 1 13 19.94V21a1 1 0 1 1-2 0v-1.06A8 8 0 0 1 4.06 13H3a1 1 0 1 1 0-2h1.06A8 8 0 0 1 11 4.06V3a1 1 0 0 1 1-1Zm0 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z"/></svg>',
};

const esc = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const badge = (route, size = '') =>
  `<span class="badge ${size}" style="--c:${route.color}">${esc(route.id)}</span>`;

export const lineHref = (pattern, fromStopId) =>
  `#/line/${encodeURIComponent(pattern.route_id)}/${pattern.direction}` +
  (fromStopId ? `/${encodeURIComponent(fromStopId)}` : '');

const placeHref = (place) => `#/place/${encodeURIComponent(place.id)}`;

export const planHref = (fromId, toId, option) =>
  `#/plan/${encodeURIComponent(fromId ?? '')}/${encodeURIComponent(toId ?? '')}` +
  (option ? `/${option}` : '');

const ESTIMATE_NOTE = `<p class="note">Stop order is estimated from map data, so a line may not
  visit stops in exactly this order. Timetables aren't available yet.</p>`;

/** `recentTrips` is [{ from, to }] with resolved { id, name } ends. */
export function homeView(index, { origin, originLabel }, recentTrips = []) {
  const lines = nearbyLines(index, origin);
  const places = nearbyPlaces(index, origin, 6);

  const cards = lines
    .map(({ route, directions }) => {
      const rows = directions
        .map(({ pattern, place, distance }) => {
          const stop = place.stops.find((s) => pattern.stop_ids.includes(s.id)) ?? place.stops[0];
          return `<a class="dir" href="${lineHref(pattern, stop.id)}">
            ${badge(route)}
            <span class="dir-text">
              <span class="headsign">→ ${esc(pattern.headsign)}</span>
              <span class="sub">from ${esc(place.name)}</span>
            </span>
            <span class="walk">${walkMinutes(distance)}<small>min walk</small></span>
          </a>`;
        })
        .join('');
      return `<div class="line-card">${rows}</div>`;
    })
    .join('');

  return `
    <a class="where-to" href="${planHref('here', '')}">
      <span class="where-icon">${ICONS.directions}</span>
      <span class="dir-text">
        <span class="headsign">Where to?</span>
        <span class="sub">Plan a trip by bus</span>
      </span>
    </a>
    ${
      recentTrips.length
        ? `<h2 class="section-title">Recent trips</h2>${recentTrips
            .map(
              ({ from, to }) => `<a class="row" href="${planHref(from.id, to.id)}">
                <span class="place-icon">${ICONS.directions}</span>
                <span class="dir-text">
                  <span class="headsign">${esc(to.name)}</span>
                  <span class="sub">from ${esc(from.name)}</span>
                </span>
              </a>`,
            )
            .join('')}`
        : ''
    }
    <h2 class="section-title">Lines nearby <small>${esc(originLabel)}</small></h2>
    ${cards || '<p class="empty">No lines within a short walk. Try searching for a stop.</p>'}
    <h2 class="section-title">Stops nearby</h2>
    ${places.map(({ place, distance }) => placeRow(index, place, distance)).join('')}
    ${ESTIMATE_NOTE}`;
}

const MAX_BADGES = 8;

function placeRow(index, place, distance, href = placeHref(place)) {
  const routes = place.routes.map((id) => index.route(id)).filter(Boolean);
  return `<a class="row" href="${href}">
    <span class="place-icon">${ICONS.stop}</span>
    <span class="dir-text">
      <span class="headsign">${esc(place.name)}</span>
      <span class="badges">${routes.slice(0, MAX_BADGES).map((r) => badge(r, 'sm')).join('')}${
        routes.length > MAX_BADGES ? `<span class="chip">+${routes.length - MAX_BADGES}</span>` : ''
      }</span>
    </span>
    ${distance != null ? `<span class="sub">${formatDistance(distance)}</span>` : ''}
  </a>`;
}

/**
 * Search results. While choosing a trip's start or end (`pick`), only places
 * are listed and they link back to the planner.
 */
export function searchView(index, query, origin, pick) {
  if (pick && !query) return pickSuggestions(index, origin, pick);
  const results = search(index, query).filter((r) => !pick || r.type === 'place');
  if (!results.length) return `<p class="empty">No stops or lines match “${esc(query)}”.</p>`;
  return results
    .map((r) => {
      if (r.type === 'place') {
        const href = pick ? pick.href(r.place.id) : undefined;
        return placeRow(index, r.place, distanceM(origin, r.place), href);
      }
      const pattern = index.pattern(r.route.id, 'out') ?? index.patternsOf(r.route.id)[0];
      return `<a class="row" href="${lineHref(pattern)}">
        ${badge(r.route)}
        <span class="dir-text">
          <span class="headsign">${esc(r.route.name)}</span>
          <span class="sub">Line ${esc(r.route.id)}</span>
        </span>
      </a>`;
    })
    .join('');
}

function pickSuggestions(index, origin, pick) {
  const here = pick.allowHere
    ? `<a class="row" href="${pick.href('here')}">
        <span class="place-icon here">${ICONS.here}</span>
        <span class="dir-text"><span class="headsign">${esc(pick.hereLabel)}</span></span>
      </a>`
    : '';
  return `
    <h2 class="section-title">${pick.field === 'from' ? 'Choose a start' : 'Choose a destination'}
      <a class="link" href="${pick.cancelHref}">Cancel</a></h2>
    ${here}
    ${pick.recent
      .map((place) => placeRow(index, place, distanceM(origin, place), pick.href(place.id)))
      .join('')}
    ${pick.recent.length ? '<h2 class="section-title">Nearby</h2>' : ''}
    ${nearbyPlaces(index, origin, 8)
      .filter(({ place }) => !pick.recent.includes(place))
      .map(({ place, distance }) => placeRow(index, place, distance, pick.href(place.id)))
      .join('')}`;
}

export function lineView(index, pattern, fromStopId) {
  const route = index.route(pattern.route_id);
  const other = index.patternsOf(route.id).find((p) => p !== pattern);
  const fromIndex = fromStopId ? pattern.stop_ids.indexOf(fromStopId) : -1;
  const fromOnOther =
    other && fromStopId
      ? other.stop_ids.find((id) => index.placeOfStop(id) === index.placeOfStop(fromStopId))
      : undefined;

  const stops = pattern.stop_ids
    .map((id, i) => {
      const place = index.placeOfStop(id);
      const cls = i === fromIndex ? 'current' : fromIndex > -1 && i < fromIndex ? 'passed' : '';
      return `<li class="${cls}"><a href="${placeHref(place)}">
        <span class="dot"></span><span class="name">${esc(place.name)}</span>
      </a></li>`;
    })
    .join('');

  const remaining = fromIndex > -1 ? pattern.stop_ids.length - fromIndex - 1 : null;

  return `
    <div class="detail-head">
      <a class="icon-btn" href="#/" data-back aria-label="Back">${ICONS.back}</a>
      ${badge(route)}
      <div class="detail-title"><h1>→ ${esc(pattern.headsign)}</h1></div>
      ${
        other
          ? `<a class="icon-btn" href="${lineHref(other, fromOnOther)}" aria-label="Other direction" title="Other direction">${ICONS.swap}</a>`
          : ''
      }
    </div>
    <div class="detail-meta">
      <span class="chip">${pattern.stop_ids.length} stops</span>
      ${remaining != null ? `<span class="chip">${remaining} stops to go</span>` : ''}
      ${pattern.estimated ? '<span class="chip">Estimated order</span>' : ''}
    </div>
    <ol class="timeline" style="--c:${route.color}">${stops}</ol>
    ${ESTIMATE_NOTE}`;
}

export function placeView(index, place, origin) {
  const departures = index
    .departuresAt(place)
    .sort((a, b) =>
      a.pattern.route_id.localeCompare(b.pattern.route_id, 'en', { numeric: true }) ||
      b.pattern.direction.localeCompare(a.pattern.direction),
    );

  const rows = departures
    .map(({ pattern, position }) => {
      const route = index.route(pattern.route_id);
      const left = pattern.stop_ids.length - position - 1;
      return `<a class="row" href="${lineHref(pattern, pattern.stop_ids[position])}">
        ${badge(route)}
        <span class="dir-text">
          <span class="headsign">→ ${esc(pattern.headsign)}</span>
          <span class="sub">${left} stop${left === 1 ? '' : 's'} to the end</span>
        </span>
      </a>`;
    })
    .join('');

  const nearby = nearbyPlaces(index, place, 7)
    .filter((n) => n.place !== place && n.distance < 500)
    .slice(0, 5);
  const first = place.stops[0];
  const area = [first.zone && `${first.zone} zone`, first.ward && `Ward ${first.ward}`]
    .filter(Boolean)
    .join(' · ');

  return `
    <div class="detail-head">
      <a class="icon-btn" href="#/" data-back aria-label="Back">${ICONS.back}</a>
      <span class="place-icon">${ICONS.stop}</span>
      <div class="detail-title">
        <h1>${esc(place.name)}</h1>
        <span class="sub">${esc(area)}</span>
      </div>
    </div>
    <div class="detail-meta">
      <span class="chip">${formatDistance(distanceM(origin, place))} away</span>
      <span class="chip">${place.routes.length} line${place.routes.length === 1 ? '' : 's'}</span>
    </div>
    <div class="actions">
      <a class="btn primary" href="${planHref('here', place.id)}">${ICONS.directions} Directions</a>
      <a class="btn" href="${planHref(place.id, '')}">From here</a>
    </div>
    <h2 class="section-title">Departures</h2>
    ${rows || '<p class="empty">No lines leave from this stop.</p>'}
    ${
      nearby.length
        ? `<h2 class="section-title">Short walk away</h2>${nearby
            .map((n) => placeRow(index, n.place, n.distance))
            .join('')}`
        : ''
    }
    ${ESTIMATE_NOTE}`;
}

const TAG_LABELS = { fastest: 'Fastest', fewestChanges: 'Fewest changes', walk: 'Walk' };
const mins = (m) => `${Math.max(1, Math.round(m))} min`;

/**
 * The trip planner. `from` and `to` are { id, name, point } or null when not
 * chosen yet; `options` comes from planTrip.
 */
export function planView(index, { from, to, options, selected }) {
  const field = (which, end) => `
    <a class="od-field" href="#" data-pick="${which}">
      <span class="od-dot ${which}"></span>
      <span class="od-text">
        <small>${which === 'from' ? 'From' : 'To'}</small>
        <span class="${end ? '' : 'placeholder'}">${esc(end?.name ?? (which === 'from' ? 'Choose a start' : 'Where to?'))}</span>
      </span>
    </a>`;

  const head = `
    <div class="detail-head plan-head">
      <a class="icon-btn" href="#/" data-back aria-label="Back">${ICONS.back}</a>
      <div class="od">${field('from', from)}${field('to', to)}</div>
      <a class="icon-btn" href="${planHref(to?.id, from?.id)}" aria-label="Swap start and destination">${ICONS.swap}</a>
    </div>`;

  if (!from || !to) return head + '<p class="empty">Choose where you\'re starting and where you\'re going.</p>';
  if (from.id === to.id) return head + '<p class="empty">Start and destination are the same place.</p>';
  if (!options.length) {
    return head + `<p class="empty">No bus gets from ${esc(from.name)} to ${esc(to.name)} within a short walk of both ends.</p>`;
  }

  const cards = options
    .map((o, i) => {
      const chain = o.legs
        .filter((l) => l.type === 'ride' || (l.type === 'walk' && l.metres >= 100))
        .map((l) => (l.type === 'ride' ? badge(l.route, 'sm') : `<span class="walk-icon">${ICONS.walk}</span>`))
        .join('<span class="chev">›</span>');
      const firstRide = o.legs.find((l) => l.type === 'ride');
      const facts = [
        o.tags.map((t) => TAG_LABELS[t]).join(' · '),
        o.rides ? (o.changes ? `${o.changes} change${o.changes > 1 ? 's' : ''}` : 'No changes') : null,
        o.walkMetres >= 50 ? `${mins(o.walkMetres / ASSUMPTIONS.walkMetresPerMin)} walk` : null,
        firstRide ? `from ${index.placeOfStop(firstRide.from).name}` : formatDistance(o.walkMetres),
      ].filter(Boolean);
      return `<a class="trip-card ${i === selected ? 'selected' : ''}" href="${planHref(from.id, to.id, i)}">
        <span class="trip-top">
          <span class="trip-chain">${chain}</span>
          <span class="trip-min">${o.minutes}<small>min</small></span>
        </span>
        <span class="sub">${esc(facts.join(' · '))}</span>
      </a>`;
    })
    .join('');

  return `${head}
    <h2 class="section-title">Options <small>Estimated times</small></h2>
    ${cards}
    <h2 class="section-title">Steps</h2>
    ${tripSteps(index, options[selected], from, to)}
    <p class="note">Times assume buses average ~18 km/h and a ~${ASSUMPTIONS.waitMin} min wait for each bus.
      There are no timetables yet, and stop order is estimated from map data.</p>`;
}

function tripSteps(index, trip, from, to) {
  const name = (stopId) => index.placeOfStop(stopId).name;
  const steps = [`<li class="step"><span class="step-dot from"></span><div><strong>${esc(from.name)}</strong></div></li>`];

  trip.legs.forEach((leg, i) => {
    if (leg.type === 'walk') {
      const target = leg.to ? name(leg.to) : to.name;
      steps.push(`<li class="step step-walk"><span class="step-icon">${ICONS.walk}</span><div>
        Walk ${mins(leg.minutes)} to <strong>${esc(target)}</strong>
        <span class="sub">${formatDistance(leg.metres)}</span></div></li>`);
    } else if (leg.type === 'ride') {
      const wait = trip.legs[i - 1]?.type === 'wait' ? trip.legs[i - 1].minutes : 0;
      steps.push(`<li class="step ride" style="--c:${leg.route.color}"><span class="step-icon">${badge(leg.route, 'sm')}</span><div>
        <a href="${lineHref(leg.pattern, leg.from)}"><strong>${esc(leg.route.id)} → ${esc(leg.pattern.headsign)}</strong></a>
        <span class="sub">Board at ${esc(name(leg.from))}${wait ? ` · ~${wait} min wait` : ''}</span>
        <span class="sub">Ride ${leg.stops} stop${leg.stops === 1 ? '' : 's'} · ${mins(leg.minutes)}</span>
        <span class="sub">Get off at <strong>${esc(name(leg.to))}</strong></span></div></li>`);
    }
  });

  steps.push(`<li class="step"><span class="step-dot to"></span><div><strong>${esc(to.name)}</strong>
    <span class="sub">Arrive in about ${trip.minutes} min</span></div></li>`);
  return `<ol class="steps">${steps.join('')}</ol>`;
}

export function errorView(message) {
  return `<p class="empty">${esc(message)}</p>`;
}
