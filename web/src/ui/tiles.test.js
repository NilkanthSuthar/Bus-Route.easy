import { describe, expect, it } from 'vitest';
import { basemap } from './tiles.js';

describe('basemap', () => {
  it('uses CARTO with the key when one is set', () => {
    const { url } = basemap({ dark: false, cartoKey: 'abc 123' });
    expect(url).toContain('basemaps.cartocdn.com/light_all/');
    expect(url).toContain('?key=abc%20123');
  });

  it('switches CARTO style in dark mode', () => {
    expect(basemap({ dark: true, cartoKey: 'k' }).url).toContain('/dark_all/');
  });

  it('falls back to OpenStreetMap without a key', () => {
    const { url, options } = basemap({ dark: true, cartoKey: '' });
    expect(url).toContain('tile.openstreetmap.org');
    expect(options.className).toContain('osm-dark');
  });
});
