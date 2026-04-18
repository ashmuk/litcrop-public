/**
 * Profile Tab URL param logic tests — U-1 to U-8
 *
 * Tests the tab-switching logic extracted from ProfilePage.tsx.
 * ProfilePage reads window.location.search on mount and applies the tab
 * if it is one of 'farms' | 'you' | 'system'. We mirror that exact
 * logic in pure functions and test the functions directly (option a
 * from the strategy), avoiding the need for DOM/JSDOM rendering.
 *
 * U-5 to U-8 additionally stub `window.location` and `history.replaceState`
 * via vi.stubGlobal to capture URL side-effects without a real DOM.
 *
 * Covered: U-1, U-2, U-3, U-4, U-5, U-6, U-7, U-8
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type TabName = 'farms' | 'you' | 'system';
const TABS: TabName[] = ['farms', 'you', 'system'];

/**
 * Pure extract of the tab-reading logic from ProfilePage useEffect.
 * Returns the active tab after reading the given search string.
 * Default is 'farms' (same as useState initial value).
 */
function getTabFromSearch(search: string): TabName {
  const tab = new URLSearchParams(search).get('tab') as TabName | null;
  return tab && TABS.includes(tab) ? tab : 'farms';
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

// ── Pure mirrors of ProfilePage.switchTab and handleTabKeyDown ─────
//
// These mirror the exact logic in ProfilePage.tsx (lines 74-91 at time
// of writing).  The real code uses the global `window.location.href`
// and `history.replaceState`; we stub both via vi.stubGlobal so the
// URL side-effect is captured as a mock call we can assert on.

function switchTab(tab: TabName): void {
  const url = new URL(window.location.href);
  url.searchParams.set('tab', tab);
  history.replaceState(null, '', url.toString());
}

function handleTabKeyDown(key: string, activeTab: TabName): void {
  const idx = TABS.indexOf(activeTab);
  if (key === 'ArrowRight') switchTab(TABS[(idx + 1) % TABS.length]);
  else if (key === 'ArrowLeft') switchTab(TABS[(idx - 1 + TABS.length) % TABS.length]);
}

// ── U-5 to U-8: switchTab + handleTabKeyDown URL side-effects ──────

describe('switchTab — URL side effect', () => {
  let replaceStateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    replaceStateMock = vi.fn();
    vi.stubGlobal('window', { location: { href: 'https://example.com/profile/' } });
    vi.stubGlobal('history', { replaceState: replaceStateMock });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('U-5: switchTab("you") calls history.replaceState with ?tab=you', () => {
    switchTab('you');
    expect(replaceStateMock).toHaveBeenCalledOnce();
    // replaceState(state, unused, url) — the url is the 3rd argument
    expect(String(replaceStateMock.mock.calls[0][2])).toContain('tab=you');
  });

  it('U-6: handleTabKeyDown("ArrowRight", "farms") advances to "you"', () => {
    handleTabKeyDown('ArrowRight', 'farms');
    expect(String(replaceStateMock.mock.calls[0][2])).toContain('tab=you');
  });

  it('U-7: handleTabKeyDown("ArrowLeft", "farms") wraps to "system" (circular)', () => {
    handleTabKeyDown('ArrowLeft', 'farms');
    expect(String(replaceStateMock.mock.calls[0][2])).toContain('tab=system');
  });

  it('U-8: handleTabKeyDown("ArrowRight", "system") wraps to "farms" (circular)', () => {
    handleTabKeyDown('ArrowRight', 'system');
    expect(String(replaceStateMock.mock.calls[0][2])).toContain('tab=farms');
  });

  it('U-6/7/8 guard: keys other than Arrow Left/Right are ignored (no replaceState)', () => {
    handleTabKeyDown('Enter', 'farms');
    handleTabKeyDown('Tab', 'farms');
    handleTabKeyDown(' ', 'farms');
    expect(replaceStateMock).not.toHaveBeenCalled();
  });
});
