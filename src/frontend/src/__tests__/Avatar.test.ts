/**
 * Avatar pure function tests — Beta-5 (T-B5-11)
 * Tests getInitials and getColorIndex without DOM rendering.
 */

import { describe, it, expect } from 'vitest';
import { getInitials, getColorIndex } from '../components/Avatar';

describe('getInitials', () => {
  it('returns 2 chars from "Ash Muk"', () => {
    expect(getInitials('Ash Muk', 2)).toBe('AM');
  });

  it('returns first 2 letters for single word', () => {
    expect(getInitials('Admin', 2)).toBe('AD');
  });

  it('returns 1 char for list size', () => {
    expect(getInitials('Ash Muk', 1)).toBe('A');
  });

  it('returns "U" for empty string', () => {
    expect(getInitials('', 2)).toBe('U');
  });

  it('returns "U" for digit-starting name (1-char mode)', () => {
    expect(getInitials('123', 1)).toBe('U');
  });

  it('handles whitespace-only input', () => {
    expect(getInitials('   ', 2)).toBe('U');
  });

  it('handles multi-space between words', () => {
    expect(getInitials('Ash   Muk', 2)).toBe('AM');
  });

  it('uppercases lowercase input', () => {
    expect(getInitials('ash muk', 2)).toBe('AM');
  });
});

describe('getColorIndex', () => {
  it('returns 0 for undefined userId', () => {
    expect(getColorIndex(undefined)).toBe(0);
  });

  it('returns deterministic result for same userId', () => {
    const id = 'abc-123-def-456';
    expect(getColorIndex(id)).toBe(getColorIndex(id));
  });

  it('returns value between 0 and 7', () => {
    const ids = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5', 'user-6', 'user-7', 'user-8', 'user-9', 'user-10'];
    for (const id of ids) {
      const idx = getColorIndex(id);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(8);
    }
  });

  it('different userIds produce different indices (coverage check)', () => {
    const indices = new Set<number>();
    // Use enough IDs to likely hit all 8 palette slots
    for (let i = 0; i < 100; i++) {
      indices.add(getColorIndex(`user-${i}`));
    }
    expect(indices.size).toBeGreaterThan(4); // At least half the palette covered
  });
});
