import { describe, expect, it, vi } from 'vitest';
import { createGeocoder, parsePointId, pointId, toPlace } from './geocode.js';

const feature = (properties, lon = 73.18, lat = 22.31) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties,
});

const respond = (body, ok = true) => vi.fn(async () => ({ ok, status: ok ? 200 : 503, json: async () => body }));

describe('toPlace', () => {
  it('uses the place name with street and area as detail', () => {
    const place = toPlace(feature({ name: 'Sayaji Hospital', street: 'Jail Road', district: 'Raopura', city: 'Vadodara' }));
    expect(place).toEqual({ name: 'Sayaji Hospital', detail: 'Jail Road, Raopura, Vadodara', lat: 22.31, lon: 73.18 });
  });

  it('falls back to the street for plain addresses', () => {
    expect(toPlace(feature({ housenumber: '12', street: 'RC Dutt Road', city: 'Vadodara' })).name).toBe('12 RC Dutt Road');
  });

  it('skips features with nothing to call them', () => {
    expect(toPlace(feature({}))).toBeNull();
  });
});

describe('geocoder.search', () => {
  it('asks Photon for places around Vadodara', async () => {
    const fetch = respond({ features: [feature({ name: 'MS University', city: 'Vadodara' })] });
    const results = await createGeocoder({ fetch }).search('ms univ');
    expect(results.map((r) => r.name)).toEqual(['MS University']);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/');
    expect(url.searchParams.get('q')).toBe('ms univ');
    expect(url.searchParams.get('bbox')).toBe('73.05,22.15,73.32,22.45');
  });

  it('drops results outside the city and duplicates', async () => {
    const fetch = respond({
      features: [
        feature({ name: 'Alkapuri', city: 'Vadodara' }),
        feature({ name: 'Alkapuri', city: 'Vadodara' }),
        feature({ name: 'Alkapuri', city: 'Ahmedabad' }, 72.57, 23.02),
      ],
    });
    expect(await createGeocoder({ fetch }).search('alkapuri')).toHaveLength(1);
  });

  it('waits for at least three characters', async () => {
    const fetch = respond({ features: [] });
    expect(await createGeocoder({ fetch }).search('al')).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('caches repeated searches', async () => {
    const fetch = respond({ features: [feature({ name: 'Tower' })] });
    const geocoder = createGeocoder({ fetch });
    await geocoder.search('tower');
    await geocoder.search('tower');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports server errors to the caller', async () => {
    await expect(createGeocoder({ fetch: respond({}, false) }).search('tower')).rejects.toThrow('503');
  });
});

describe('geocoder.nameOf', () => {
  it('names a dropped pin after the nearest place', async () => {
    const fetch = respond({ features: [feature({ name: 'Race Course Road' })] });
    expect(await createGeocoder({ fetch }).nameOf(22.31, 73.17)).toBe('Race Course Road');
    expect(new URL(fetch.mock.calls[0][0]).pathname).toBe('/reverse');
  });
});

describe('point ids', () => {
  it('round-trips a point, names with commas included', () => {
    const id = pointId({ lat: 22.312345678, lon: 73.18, name: 'Sayaji Hospital, Raopura' });
    expect(id).toBe('pt:22.31235,73.18000,Sayaji Hospital, Raopura');
    expect(parsePointId(id)).toMatchObject({ lat: 22.31235, lon: 73.18, name: 'Sayaji Hospital, Raopura' });
  });

  it('ignores stop ids and junk', () => {
    expect(parsePointId('o111')).toBeNull();
    expect(parsePointId('pt:abc,73,x')).toBeNull();
  });
});
