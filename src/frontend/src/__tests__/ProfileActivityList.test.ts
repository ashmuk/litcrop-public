/**
 * ProfileActivityList component tests — F1, F2, F3, F4, F6, F7, F8, F11
 *
 * Convention (matches ProfileSystemTab.test.ts + ProfilePage.integration.test.ts):
 *   - vitest node environment — no JSDOM, no @testing-library/preact
 *   - preact-render-to-string produces an HTML string; assertions use
 *     string / regex operations
 *   - useMeActivity is mocked at the module level so the component is
 *     exercised in pure-render mode with injected state
 *   - document + localStorage globals are stubbed before the component
 *     import so locale detection (i18n.ts detectLocale) can be controlled
 *   - Fake timers fix Date.now() so relativeTimeSuffix is deterministic
 *
 * Covered: F1, F2, F3, F4, F6, F7, F8, F11
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import type { DiaryActivityItem, DeviceActivityItem, ImageActivityItem, ActivityItem } from '@litcrop/shared';

// ── Module-level mock — must precede all imports that reach the hook ──────────
//
// vi.mock is hoisted by Vitest above regular imports.  The factory function
// gives each test full control via `mockReturnValue` on the exported symbol.

vi.mock('../lib/useMeActivity', () => {
  const mockFn = vi.fn();
  return { useMeActivity: mockFn };
});

// ── Globals required before the component module is imported ─────────────────
//
// ProfileActivityList → useMeActivity → (mocked), but it also imports i18n
// which calls detectLocale() at module scope.  Stub document so detectLocale
// returns 'en' by default; individual tests can override setAttribute.

const localStorageMock = {
  getItem: vi.fn().mockReturnValue(null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};

const documentMock = {
  documentElement: {
    getAttribute: vi.fn().mockReturnValue('en'),
    setAttribute: vi.fn(),
  },
};

vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('document', documentMock);

// ── Import component AFTER stubs + vi.mock declarations ──────────────────────

import ProfileActivityList from '../components/ProfileActivityList';
import { useMeActivity } from '../lib/useMeActivity';

// ── Typed mock reference ──────────────────────────────────────────────────────

const mockUseMeActivity = vi.mocked(useMeActivity);

// ── Deterministic system time (2026-04-21T06:00:00Z) ─────────────────────────
//
// relativeTimeSuffix computes Math.floor(diffMs / 60000).
// All fixture timestamps are expressed relative to this anchor so
// the rendered "5m ago", "2h ago" strings are stable across runs.

const SYSTEM_TIME = new Date('2026-04-21T06:00:00Z');

// ── Shared hook defaults ──────────────────────────────────────────────────────

function defaultHookResult(overrides: Partial<ReturnType<typeof useMeActivity>> = {}) {
  return {
    items: [] as ActivityItem[],
    loading: false,
    initialLoading: false,
    error: null,
    hasMore: false,
    totalCount: 0,
    loadMore: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FARM_ID = 'farm-001';
const BED_ID = 'bed-abc';
const DIARY_ID = 'diary-001';
const DEVICE_ID = 'dev-001';
const IMAGE_ID = 'img-001';

// 5 minutes before the anchor → "5m ago"
const TS_5M_AGO = '2026-04-21T05:55:00Z';
// 2 hours before the anchor → "2h ago"
const TS_2H_AGO = '2026-04-21T04:00:00Z';
// 1 day before the anchor → "1d ago"
const TS_1D_AGO = '2026-04-20T06:00:00Z';

const DIARY_ITEM: DiaryActivityItem = {
  id: `diary:${DIARY_ID}`,
  type: 'diary',
  timestamp: TS_5M_AGO,
  farm_id: FARM_ID,
  farm_name: 'Pilot Farm',
  actor_id: 'user-sub-001',
  actor_name: 'Alice',
  deep_link: `/diary?farm=${FARM_ID}&entry=${DIARY_ID}`,
  diary_category: 'watering',
  diary_entry_type: 'actual',
  description: 'Watered the tomatoes',
  bed_id: BED_ID,
  bed_name: 'Bed A1',
};

const DEVICE_ITEM: DeviceActivityItem = {
  id: `device:${DEVICE_ID}`,
  type: 'device',
  timestamp: TS_2H_AGO,
  farm_id: FARM_ID,
  farm_name: 'Pilot Farm',
  actor_id: 'user-sub-001',
  actor_name: 'Alice',
  deep_link: `/devices?farm=${FARM_ID}&device=${DEVICE_ID}`,
  device_id: DEVICE_ID,
  node_name: 'Pi-Cam-1',
  bed_id: BED_ID,
  bed_name: 'Bed A1',
};

const IMAGE_ITEM: ImageActivityItem = {
  id: `image:${IMAGE_ID}`,
  type: 'image',
  timestamp: TS_1D_AGO,
  farm_id: FARM_ID,
  farm_name: 'Pilot Farm',
  actor_id: 'user-sub-001',
  actor_name: 'Alice',
  deep_link: `/beds/${BED_ID}?image=${IMAGE_ID}`,
  image_id: IMAGE_ID,
  bed_id: BED_ID,
  bed_name: 'Bed A1',
  trigger: 'motion',
  thumbnail_key: null,
};

// ── Setup fake timers once for all tests in this file ────────────────────────

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(SYSTEM_TIME);
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

afterEach(() => {
  // Reset locale to 'en' between tests so F11 doesn't bleed into others
  documentMock.documentElement.getAttribute.mockReturnValue('en');
  localStorageMock.getItem.mockReturnValue(null);
});

// ── Helper ────────────────────────────────────────────────────────────────────

function render(overrides: Partial<ReturnType<typeof useMeActivity>> = {}): string {
  mockUseMeActivity.mockReturnValue(defaultHookResult(overrides));
  return renderToString(h(ProfileActivityList, {}));
}

// ─────────────────────────────────────────────────────────────────────────────
// F1 — Empty state
// ─────────────────────────────────────────────────────────────────────────────

describe('F1: empty state when items=[], initialLoading=false, error=null', () => {
  it('renders the activity-empty container', () => {
    const html = render({ items: [], initialLoading: false, error: null });
    expect(html).toContain('class="activity-empty"');
  });

  it('shows the i18n empty string ("No activity yet")', () => {
    const html = render({ items: [], initialLoading: false, error: null });
    expect(html).toContain('No activity yet');
  });

  it('does NOT render the activity list', () => {
    const html = render({ items: [], initialLoading: false, error: null });
    expect(html).not.toContain('class="activity-list"');
  });

  it('does NOT render the Load-more button', () => {
    const html = render({ items: [], initialLoading: false, error: null });
    expect(html).not.toContain('Load more');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F2 — Single diary item
// ─────────────────────────────────────────────────────────────────────────────

describe('F2: renders 1 diary item with icon, summary, and timestamp', () => {
  let html: string;

  beforeAll(() => {
    html = render({ items: [DIARY_ITEM], initialLoading: false, error: null, totalCount: 1 });
  });

  it('renders the actual-diary icon emoji (📗 green book)', () => {
    // DIARY_ITEM fixture uses diary_entry_type: 'actual' → ICON_DIARY_ACTUAL
    expect(html).toContain('📗');
    expect(html).not.toContain('📔');
  });

  it('renders the icon aria-label "Diary entry (actual)"', () => {
    expect(html).toContain('aria-label="Diary entry (actual)"');
  });

  it('renders the diary category label (Watering)', () => {
    // diary.categories.watering → "Watering"
    expect(html).toContain('Watering');
  });

  it('renders the description text', () => {
    expect(html).toContain('Watered the tomatoes');
  });

  it('renders a relative timestamp element', () => {
    // Expect the time wrapper span is present; value is "5m ago"
    expect(html).toContain('class="activity-item__time"');
  });

  it('renders "5m ago" for an item 5 minutes old', () => {
    // Component renders {n}{t(unitKey)} → "5" + "m ago" = "5m ago"
    expect(html).toContain('5');
    expect(html).toContain('m ago');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F3 — 20 items with hasMore=false: no Load-more button
// ─────────────────────────────────────────────────────────────────────────────

describe('F3: 20 items with hasMore=false — no Load-more button', () => {
  it('renders all 20 items (20 activity-item list elements)', () => {
    const items: ActivityItem[] = Array.from({ length: 20 }, (_, i) => ({
      ...DIARY_ITEM,
      id: `diary:entry-${i}`,
      description: `Entry ${i}`,
      timestamp: TS_5M_AGO,
    }));
    const html = render({ items, initialLoading: false, error: null, hasMore: false, totalCount: 20 });
    const matches = html.match(/class="activity-item"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(20);
  });

  it('does NOT render a Load-more button when hasMore=false', () => {
    const items: ActivityItem[] = Array.from({ length: 20 }, (_, i) => ({
      ...DIARY_ITEM,
      id: `diary:entry-${i}`,
      description: `Entry ${i}`,
      timestamp: TS_5M_AGO,
    }));
    const html = render({ items, initialLoading: false, error: null, hasMore: false, totalCount: 20 });
    expect(html).not.toContain('Load more');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F4 — Load-more button present when hasMore=true
// ─────────────────────────────────────────────────────────────────────────────

describe('F4: Load-more button renders when hasMore=true', () => {
  let html: string;

  beforeAll(() => {
    html = render({ items: [DIARY_ITEM], initialLoading: false, error: null, hasMore: true, totalCount: 50 });
  });

  it('renders a button containing the load_more i18n string', () => {
    expect(html).toContain('Load more');
  });

  it('the button element has type="button"', () => {
    expect(html).toMatch(/<button[^>]+type="button"[^>]*>.*Load more.*<\/button>/s);
  });

  it('the button has class "btn-secondary"', () => {
    // Look for the btn-secondary class near the Load more text
    expect(html).toMatch(/class="btn-secondary"[^>]*>(?:[^<]*)Load more/s);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F6 — Loading skeleton during initialLoading=true
// ─────────────────────────────────────────────────────────────────────────────

describe('F6: loading skeleton appears when initialLoading=true', () => {
  let html: string;

  beforeAll(() => {
    html = render({ initialLoading: true, items: [], error: null });
  });

  it('renders the activity-skeleton container', () => {
    expect(html).toContain('class="activity-skeleton"');
  });

  it('renders three skeleton line divs', () => {
    const matches = html.match(/class="activity-skeleton__line"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(3);
  });

  it('renders the sr-only loading text for screen readers', () => {
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('Loading...');
  });

  it('does NOT render any activity items during loading', () => {
    expect(html).not.toContain('class="activity-item"');
  });

  it('does NOT render the empty state during loading', () => {
    expect(html).not.toContain('class="activity-empty"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F7 — Error state
// ─────────────────────────────────────────────────────────────────────────────

describe('F7: error state when error=\'fetch_error\'', () => {
  let html: string;

  beforeAll(() => {
    html = render({ initialLoading: false, items: [], error: 'fetch_error' });
  });

  it('renders the activity-error container', () => {
    expect(html).toContain('class="activity-error"');
  });

  it('renders the error message i18n string ("Couldn\'t load activity")', () => {
    expect(html).toContain("Couldn't load activity");
  });

  it('renders a retry button', () => {
    expect(html).toContain('Retry');
  });

  it('the retry button has type="button"', () => {
    expect(html).toMatch(/<button[^>]+type="button"[^>]*>Retry<\/button>/);
  });

  it('has the alert role on the error container', () => {
    expect(html).toContain('role="alert"');
  });

  it('renders the warning icon', () => {
    expect(html).toContain('⚠');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F8 — Deep-link href per item type
// ─────────────────────────────────────────────────────────────────────────────

describe('F8: deep-link href per item type matches expected route pattern', () => {
  it('diary item href is /diary?farm=<farm_id>&entry=<id>', () => {
    const html = render({ items: [DIARY_ITEM], initialLoading: false, error: null, totalCount: 1 });
    expect(html).toContain(`href="/diary?farm=${FARM_ID}&amp;entry=${DIARY_ID}"`);
  });

  it('device item href is /devices?farm=<farm_id>&device=<device_id>', () => {
    const html = render({ items: [DEVICE_ITEM], initialLoading: false, error: null, totalCount: 1 });
    expect(html).toContain(`href="/devices?farm=${FARM_ID}&amp;device=${DEVICE_ID}"`);
  });

  it('image item href is /beds/<bed_id>?image=<image_id>', () => {
    const html = render({ items: [IMAGE_ITEM], initialLoading: false, error: null, totalCount: 1 });
    expect(html).toContain(`href="/beds/${BED_ID}?image=${IMAGE_ID}"`);
  });

  it('each item is wrapped in an <a class="activity-item__link">', () => {
    const html = render({
      items: [DIARY_ITEM, DEVICE_ITEM, IMAGE_ITEM],
      initialLoading: false,
      error: null,
      totalCount: 3,
    });
    const linkMatches = html.match(/class="activity-item__link"/g);
    expect(linkMatches).not.toBeNull();
    expect(linkMatches!.length).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F11 — i18n key coverage: no EN-only phrases in JA rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('F11: JA locale — no raw English strings from profile.activity.* namespace', () => {
  // Switch locale mock to 'ja' before renders in this block.
  // detectLocale() in i18n.ts reads document.documentElement.getAttribute('data-locale').

  function renderJa(overrides: Partial<ReturnType<typeof useMeActivity>> = {}): string {
    documentMock.documentElement.getAttribute.mockReturnValue('ja');
    return render(overrides);
  }

  it('empty state does not contain EN "No activity yet"', () => {
    const html = renderJa({ items: [], initialLoading: false, error: null });
    expect(html).not.toContain('No activity yet');
  });

  it('empty state contains JA "まだアクティビティはありません"', () => {
    const html = renderJa({ items: [], initialLoading: false, error: null });
    expect(html).toContain('まだアクティビティはありません');
  });

  it('loading skeleton does not contain EN "Loading..."', () => {
    const html = renderJa({ initialLoading: true, items: [], error: null });
    expect(html).not.toContain('Loading...');
  });

  it('loading skeleton contains JA "読み込み中..."', () => {
    const html = renderJa({ initialLoading: true, items: [], error: null });
    expect(html).toContain('読み込み中...');
  });

  it('error state does not contain EN "Couldn\'t load activity"', () => {
    const html = renderJa({ initialLoading: false, items: [], error: 'fetch_error' });
    expect(html).not.toContain("Couldn't load activity");
  });

  it('error state contains JA "読み込めませんでした"', () => {
    const html = renderJa({ initialLoading: false, items: [], error: 'fetch_error' });
    expect(html).toContain('読み込めませんでした');
  });

  it('error state retry button does not contain EN "Retry"', () => {
    const html = renderJa({ initialLoading: false, items: [], error: 'fetch_error' });
    expect(html).not.toContain('>Retry<');
  });

  it('error state retry button contains JA "再試行"', () => {
    const html = renderJa({ initialLoading: false, items: [], error: 'fetch_error' });
    expect(html).toContain('再試行');
  });

  it('Load-more button does not contain EN "Load more"', () => {
    const html = renderJa({
      items: [DIARY_ITEM],
      initialLoading: false,
      error: null,
      hasMore: true,
      totalCount: 10,
    });
    expect(html).not.toContain('>Load more<');
  });

  it('Load-more button contains JA "さらに読み込む"', () => {
    const html = renderJa({
      items: [DIARY_ITEM],
      initialLoading: false,
      error: null,
      hasMore: true,
      totalCount: 10,
    });
    expect(html).toContain('さらに読み込む');
  });

  it('image summary does not contain EN "Motion capture"', () => {
    const html = renderJa({
      items: [IMAGE_ITEM],
      initialLoading: false,
      error: null,
      totalCount: 1,
    });
    expect(html).not.toContain('Motion capture');
  });

  it('image summary contains JA "動体検出:"', () => {
    const html = renderJa({
      items: [IMAGE_ITEM],
      initialLoading: false,
      error: null,
      totalCount: 1,
    });
    expect(html).toContain('動体検出:');
  });

  it('device summary does not contain EN "Registered"', () => {
    const html = renderJa({
      items: [DEVICE_ITEM],
      initialLoading: false,
      error: null,
      totalCount: 1,
    });
    expect(html).not.toContain('>Registered ');
  });

  it('device summary contains JA "登録:"', () => {
    const html = renderJa({
      items: [DEVICE_ITEM],
      initialLoading: false,
      error: null,
      totalCount: 1,
    });
    expect(html).toContain('登録:');
  });

  it('time suffix does not contain EN "m ago" for recent items', () => {
    const html = renderJa({
      items: [DIARY_ITEM],
      initialLoading: false,
      error: null,
      totalCount: 1,
    });
    expect(html).not.toContain('m ago');
  });

  it('time suffix contains JA "分前" for items under 60 minutes old', () => {
    const html = renderJa({
      items: [DIARY_ITEM],
      initialLoading: false,
      error: null,
      totalCount: 1,
    });
    expect(html).toContain('分前');
  });
});
