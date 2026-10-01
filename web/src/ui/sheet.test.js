import { describe, expect, it } from 'vitest';
import { sheetHeights, snapSize, tapSize } from './sheet.js';

const heights = sheetHeights(800, 110); // { min: 110, half: 384, full: 744 }

describe('sheetHeights', () => {
  it('keeps half between collapsed and full', () => {
    expect(heights.min).toBe(110);
    expect(heights.half).toBe(384);
    expect(heights.full).toBe(744);
  });

  it('never lets half squash the collapsed sheet on short screens', () => {
    const short = sheetHeights(400, 110);
    expect(short.half).toBeGreaterThanOrEqual(short.min + 120);
    expect(short.half).toBeLessThanOrEqual(short.full);
  });
});

describe('snapSize', () => {
  it('settles on the nearest size after a slow drag', () => {
    expect(snapSize(heights, 150, 0)).toBe('min');
    expect(snapSize(heights, 420, 0)).toBe('half');
    expect(snapSize(heights, 650, 0.1)).toBe('full');
  });

  it('moves one size up on an upward flick', () => {
    expect(snapSize(heights, 400, 1.2)).toBe('full');
    expect(snapSize(heights, 130, 1.2)).toBe('half');
  });

  it('moves one size down on a downward flick', () => {
    expect(snapSize(heights, 380, -1.2)).toBe('min');
    expect(snapSize(heights, 700, -1.2)).toBe('half');
  });

  it('stays at the ends when flicked past them', () => {
    expect(snapSize(heights, 744, 2)).toBe('full');
    expect(snapSize(heights, 110, -2)).toBe('min');
  });
});

describe('tapSize', () => {
  it('opens to full, and full drops back to half', () => {
    expect(tapSize('min')).toBe('full');
    expect(tapSize('half')).toBe('full');
    expect(tapSize('full')).toBe('half');
  });
});
