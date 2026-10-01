import { distanceM } from './geo.js';

/**
 * Decides whether a new GPS fix is worth redrawing the screen for. Small
 * jitter is ignored so lists don't flicker while standing still.
 */
export function shouldRefresh(prev, next, minMoveM = 25) {
  if (!prev) return true;
  if (distanceM(prev, next) >= minMoveM) return true;
  // A much better fix (e.g. GPS locking on after a rough network fix).
  return prev.accuracy > 100 && next.accuracy <= 50;
}

/**
 * Follows the device's position with watchPosition. Pauses while the page is
 * hidden to save battery and picks up again when it comes back.
 */
export function createTracker({
  onPosition,
  onError,
  geolocation = globalThis.navigator?.geolocation,
  doc = globalThis.document,
}) {
  let watchId = null;
  let wanted = false;

  function watch() {
    if (watchId != null || !geolocation) return;
    watchId = geolocation.watchPosition(
      ({ coords }) =>
        onPosition({ lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy }),
      (err) => {
        // Permission denied is final; timeouts and lost signal keep retrying.
        if (err.code === 1) stop();
        onError?.(err);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }

  function unwatch() {
    if (watchId != null) geolocation.clearWatch(watchId);
    watchId = null;
  }

  function stop() {
    wanted = false;
    unwatch();
  }

  doc?.addEventListener('visibilitychange', () => {
    if (doc.hidden) unwatch();
    else if (wanted) watch();
  });

  return {
    start() {
      wanted = true;
      watch();
    },
    stop,
    get active() {
      return wanted;
    },
    supported: Boolean(geolocation),
  };
}
