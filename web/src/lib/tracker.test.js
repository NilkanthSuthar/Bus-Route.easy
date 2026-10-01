import { describe, expect, it, vi } from 'vitest';
import { createTracker, shouldRefresh } from './tracker.js';

const at = (lat, lon, accuracy = 10) => ({ lat, lon, accuracy });

describe('shouldRefresh', () => {
  it('always takes the first fix', () => {
    expect(shouldRefresh(null, at(22.3, 73.18))).toBe(true);
  });

  it('ignores small GPS jitter', () => {
    expect(shouldRefresh(at(22.3, 73.18), at(22.30005, 73.18))).toBe(false); // ~5 m
  });

  it('refreshes after walking a bit', () => {
    expect(shouldRefresh(at(22.3, 73.18), at(22.3003, 73.18))).toBe(true); // ~33 m
  });

  it('refreshes when a rough fix becomes precise', () => {
    expect(shouldRefresh(at(22.3, 73.18, 500), at(22.3, 73.18, 15))).toBe(true);
  });
});

describe('createTracker', () => {
  const fakeGeo = () => {
    const geo = {
      watchPosition: vi.fn((ok, fail) => {
        geo.ok = ok;
        geo.fail = fail;
        return 7;
      }),
      clearWatch: vi.fn(),
    };
    return geo;
  };

  it('reports positions as lat/lon/accuracy', () => {
    const geolocation = fakeGeo();
    const onPosition = vi.fn();
    createTracker({ onPosition, geolocation }).start();
    geolocation.ok({ coords: { latitude: 22.3, longitude: 73.18, accuracy: 12 } });
    expect(onPosition).toHaveBeenCalledWith({ lat: 22.3, lon: 73.18, accuracy: 12 });
  });

  it('stops for good when permission is denied', () => {
    const geolocation = fakeGeo();
    const onError = vi.fn();
    const tracker = createTracker({ onPosition: () => {}, onError, geolocation });
    tracker.start();
    geolocation.fail({ code: 1 });
    expect(tracker.active).toBe(false);
    expect(geolocation.clearWatch).toHaveBeenCalledWith(7);
    expect(onError).toHaveBeenCalled();
  });

  it('pauses while the page is hidden and resumes after', () => {
    const geolocation = fakeGeo();
    const listeners = {};
    const doc = { hidden: false, addEventListener: (type, fn) => (listeners[type] = fn) };
    createTracker({ onPosition: () => {}, geolocation, doc }).start();
    doc.hidden = true;
    listeners.visibilitychange();
    expect(geolocation.clearWatch).toHaveBeenCalledTimes(1);
    doc.hidden = false;
    listeners.visibilitychange();
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(2);
  });

  it('keeps watching after a timeout', () => {
    const geolocation = fakeGeo();
    const tracker = createTracker({ onPosition: () => {}, onError: () => {}, geolocation });
    tracker.start();
    geolocation.fail({ code: 3 });
    expect(tracker.active).toBe(true);
  });
});
