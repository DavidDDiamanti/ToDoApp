import { describe, expect, it } from 'vitest';
import { COLOR_NAMES, PALETTE, isColorName } from './colors';

describe('colors', () => {
  it('has exactly the eight palette names in order', () => {
    expect(COLOR_NAMES).toEqual(['slate', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple']);
  });

  it('gives every colour a label and a hex value', () => {
    for (const name of COLOR_NAMES) {
      expect(PALETTE[name].label.length).toBeGreaterThan(0);
      expect(PALETTE[name].hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('recognises palette names and rejects others', () => {
    expect(isColorName('teal')).toBe(true);
    expect(isColorName('magenta')).toBe(false);
  });
});
