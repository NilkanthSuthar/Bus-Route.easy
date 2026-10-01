import { describe, expect, it } from 'vitest';
import { createRecents } from './recents.js';

const memory = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

describe('recents', () => {
  it('keeps the newest trip first without duplicates', () => {
    const r = createRecents(memory());
    r.addTrip('here', 'a');
    r.addTrip('here', 'b');
    r.addTrip('here', 'a');
    expect(r.trips()).toEqual([
      { fromId: 'here', toId: 'a' },
      { fromId: 'here', toId: 'b' },
    ]);
  });

  it('caps the lists', () => {
    const r = createRecents(memory());
    for (let i = 0; i < 10; i++) r.addPlace(`p${i}`);
    expect(r.places()).toHaveLength(6);
    expect(r.places()[0]).toBe('p9');
  });

  it('works when storage is missing or broken', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    for (const storage of [null, broken]) {
      const r = createRecents(storage);
      r.addTrip('a', 'b');
      expect(r.trips()).toEqual([]);
    }
  });

  it('ignores corrupt saved data', () => {
    const s = memory();
    s.setItem('bre.recents', '{not json');
    expect(createRecents(s).places()).toEqual([]);
  });
});
