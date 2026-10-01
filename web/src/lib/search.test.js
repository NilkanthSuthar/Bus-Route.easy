import { describe, expect, it } from 'vitest';
import { buildIndex } from '../data/index.js';
import { raw } from '../data/fixture.js';
import { normalize, search } from './search.js';

const index = buildIndex(structuredClone(raw));

describe('normalize', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalize('Alkapuri Board,Fedration  Building')).toBe('alkapuri board fedration building');
  });
});

describe('search', () => {
  it('finds a line by number first', () => {
    const [first] = search(index, 'a');
    expect(first.type).toBe('line');
    expect(first.route.id).toBe('A');
  });

  it('finds places by any word in the name', () => {
    const names = search(index, 'gate').map((r) => r.place?.name);
    expect(names).toContain('North Gate');
  });

  it('returns nothing for a blank query', () => {
    expect(search(index, '   ')).toEqual([]);
  });
});
