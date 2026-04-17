/**
 * Profile Tab URL param logic tests — U-1 to U-4
 *
 * Tests the tab-switching logic extracted from ProfilePage.tsx.
 * ProfilePage reads window.location.search on mount and applies the tab
 * if it is one of 'farms' | 'you' | 'system'. We mirror that exact
 * logic in a pure function and test the function directly (option a
 * from the strategy), avoiding the need for DOM/JSDOM rendering.
 *
 * Covered: U-1, U-2, U-3, U-4
 */

import { describe, it, expect } from 'vitest';

type TabName = 'farms' | 'you' | 'system';

/**
 * Pure extract of the tab-reading logic from ProfilePage useEffect.
 * Returns the active tab after reading the given search string.
 * Default is 'farms' (same as useState initial value).
 */
function getTabFromSearch(search: string): TabName {
  const params = new URLSearchParams(search);
  const tab = params.get('tab') as TabName | null;
  if (tab && (tab === 'farms' || tab === 'you' || tab === 'system')) {
    return tab;
  }
  return 'farms';
}

// ── U-1: No ?tab= param → default is 'farms' ──────────────────────

describe('getTabFromSearch — default tab', () => {
  it('U-1: returns "farms" when search string is empty', () => {
    expect(getTabFromSearch('')).toBe('farms');
  });

  it('U-1: returns "farms" when no tab param is present', () => {
    expect(getTabFromSearch('?foo=bar')).toBe('farms');
  });
});

// ── U-2: ?tab=you → 'you' ─────────────────────────────────────────

describe('getTabFromSearch — ?tab=you', () => {
  it('U-2: returns "you" when ?tab=you', () => {
    expect(getTabFromSearch('?tab=you')).toBe('you');
  });
});

// ── U-3: ?tab=system → 'system' ───────────────────────────────────

describe('getTabFromSearch — ?tab=system', () => {
  it('U-3: returns "system" when ?tab=system', () => {
    expect(getTabFromSearch('?tab=system')).toBe('system');
  });
});

// ── U-4: invalid ?tab= value → falls back to 'farms' ──────────────

describe('getTabFromSearch — invalid tab value', () => {
  it('U-4: returns "farms" for ?tab=unknown', () => {
    expect(getTabFromSearch('?tab=unknown')).toBe('farms');
  });

  it('U-4: returns "farms" for ?tab=FARMS (case mismatch)', () => {
    // The logic uses strict equality — only lowercase values are valid
    expect(getTabFromSearch('?tab=FARMS')).toBe('farms');
  });

  it('U-4: returns "farms" for ?tab= (empty value)', () => {
    expect(getTabFromSearch('?tab=')).toBe('farms');
  });
});
