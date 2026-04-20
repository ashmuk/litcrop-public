/**
 * ProfileActivityList snapshot tests — F9 (EN) + F10 (JA structure parity)
 *
 * Convention: same node-env / preact-render-to-string pattern as
 * ProfileSystemTab.test.ts and ProfileActivityList.test.ts.
 *
 * F9: EN snapshot with the canonical three-item fixture (diary + device + image).
 *     Committed inline so snapshot drift from styling tweaks is immediately
 *     visible in PR diffs.
 *
 * F10: JA snapshot verifies structure parity with EN — same HTML tags and
 *      class names; only the human-readable strings differ.  This is checked
 *      by asserting that every class-attribute token present in the EN render
 *      is also present in the JA render, and by comparing the structural
 *      skeleton (tags + classes stripped of content).
 *
 * Covered: F9, F10
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import type { ActivityItem } from '@litcrop/shared';

// ── Module-level mock (hoisted by Vitest) ────────────────────────────────────

vi.mock('../lib/useMeActivity', () => ({
  useMeActivity: vi.fn(),
}));

// ── Global stubs ─────────────────────────────────────────────────────────────

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

// ── Imports after stubs ───────────────────────────────────────────────────────

import ProfileActivityList from '../components/ProfileActivityList';
import { useMeActivity } from '../lib/useMeActivity';

const mockUseMeActivity = vi.mocked(useMeActivity);

// ── Deterministic system time ─────────────────────────────────────────────────

const SYSTEM_TIME = new Date('2026-04-21T06:00:00Z');

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(SYSTEM_TIME);
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ── Canonical three-item fixture ─────────────────────────────────────────────
//
// One item per discriminant; stable IDs and timestamps.

const FARM_ID = 'farm-snap-001';
const BED_ID = 'bed-snap-abc';

const THREE_ITEMS: ActivityItem[] = [
  {
    id: 'diary:snap-diary-001',
    type: 'diary',
    timestamp: '2026-04-21T05:45:00Z', // 15m ago
    farm_id: FARM_ID,
    farm_name: 'Snapshot Farm',
    actor_id: 'user-snap',
    actor_name: 'Alice',
    deep_link: `/diary?farm=${FARM_ID}&entry=snap-diary-001`,
    diary_category: 'watering',
    diary_entry_type: 'actual',
    description: 'Watered the tomatoes',
    bed_id: BED_ID,
    bed_name: 'Bed A1',
  },
  {
    id: 'device:snap-dev-001',
    type: 'device',
    timestamp: '2026-04-21T04:00:00Z', // 2h ago
    farm_id: FARM_ID,
    farm_name: 'Snapshot Farm',
    actor_id: 'user-snap',
    actor_name: 'Alice',
    deep_link: `/devices?farm=${FARM_ID}&device=snap-dev-001`,
    device_id: 'snap-dev-001',
    node_name: 'Pi-Snap-1',
    bed_id: BED_ID,
    bed_name: 'Bed A1',
  },
  {
    id: 'image:snap-img-001',
    type: 'image',
    timestamp: '2026-04-20T06:00:00Z', // 1d ago
    farm_id: FARM_ID,
    farm_name: 'Snapshot Farm',
    actor_id: 'user-snap',
    actor_name: 'Alice',
    deep_link: `/beds/${BED_ID}?image=snap-img-001`,
    image_id: 'snap-img-001',
    bed_id: BED_ID,
    bed_name: 'Bed A1',
    trigger: 'manual',
    thumbnail_key: null,
  },
];

function hookResult(locale: 'en' | 'ja' = 'en') {
  return {
    items: THREE_ITEMS,
    loading: false,
    initialLoading: false,
    error: null,
    hasMore: false,
    totalCount: 3,
    loadMore: vi.fn(),
    retry: vi.fn(),
  };
}

// ── Helper: extract structural skeleton (tags + class attrs, no text) ─────────
//
// Strips text content AND locale-sensitive attribute values so that
// EN vs JA parity can be compared purely on structure.
//
// Locale-sensitive attributes that vary between EN and JA:
//   aria-label — icon labels are translated (e.g. "Diary entry" vs "日誌")
//
// Non-locale attributes that MUST stay identical (class, href, id, role,
// data-*, type, style, aria-hidden, aria-live, aria-labelledby, tabIndex)
// are preserved so structural drift is caught.

function structuralSkeleton(html: string): string {
  return html
    // Normalise aria-label values to a stable placeholder
    .replace(/aria-label="[^"]*"/g, 'aria-label="__LOCALE__"')
    // Remove text nodes between tags
    .replace(/>[^<]+</g, '><')
    // Normalise whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// ── F9: EN snapshot ────────────────────────────────────────────────────────────

describe('F9: EN locale snapshot — three-item fixture', () => {
  let html: string;

  beforeAll(() => {
    documentMock.documentElement.getAttribute.mockReturnValue('en');
    mockUseMeActivity.mockReturnValue(hookResult('en'));
    html = renderToString(h(ProfileActivityList, {}));
  });

  it('EN render matches snapshot', () => {
    expect(html).toMatchSnapshot();
  });

  it('snapshot contains the section heading', () => {
    expect(html).toContain('Activity');
  });

  it('snapshot contains all three item types', () => {
    expect(html).toContain('data-activity-type="diary"');
    expect(html).toContain('data-activity-type="device"');
    expect(html).toContain('data-activity-type="image"');
  });

  it('snapshot contains the item count footer "3 / 3"', () => {
    expect(html).toContain('3');
    // Both "3" tokens present — loaded count and total
    const countMatches = html.match(/\b3\b/g);
    expect(countMatches).not.toBeNull();
    expect(countMatches!.length).toBeGreaterThanOrEqual(2);
  });
});

// ── F10: JA snapshot — structure parity with EN ────────────────────────────────

describe('F10: JA locale snapshot — structure parity with EN', () => {
  let htmlEn: string;
  let htmlJa: string;

  beforeAll(() => {
    // EN render
    documentMock.documentElement.getAttribute.mockReturnValue('en');
    mockUseMeActivity.mockReturnValue(hookResult('en'));
    htmlEn = renderToString(h(ProfileActivityList, {}));

    // JA render
    documentMock.documentElement.getAttribute.mockReturnValue('ja');
    mockUseMeActivity.mockReturnValue(hookResult('ja'));
    htmlJa = renderToString(h(ProfileActivityList, {}));
  });

  it('JA render matches snapshot', () => {
    expect(htmlJa).toMatchSnapshot();
  });

  it('structural skeleton is identical between EN and JA renders', () => {
    expect(structuralSkeleton(htmlJa)).toBe(structuralSkeleton(htmlEn));
  });

  it('JA render has the same number of <li> elements as EN', () => {
    const liEn = (htmlEn.match(/<li /g) ?? []).length;
    const liJa = (htmlJa.match(/<li /g) ?? []).length;
    expect(liJa).toBe(liEn);
  });

  it('JA render has the same number of <a> anchor elements as EN', () => {
    const aEn = (htmlEn.match(/<a /g) ?? []).length;
    const aJa = (htmlJa.match(/<a /g) ?? []).length;
    expect(aJa).toBe(aEn);
  });

  it('class attribute set is identical in both locales', () => {
    // Extract all class="..." tokens and sort for stable comparison
    const extractClasses = (s: string) =>
      [...new Set((s.match(/class="[^"]+"/g) ?? []).sort())].join('|');
    expect(extractClasses(htmlJa)).toBe(extractClasses(htmlEn));
  });

  it('deep-link hrefs are identical in both locales', () => {
    const extractHrefs = (s: string) => (s.match(/href="[^"]+"/g) ?? []).sort().join('|');
    expect(extractHrefs(htmlJa)).toBe(extractHrefs(htmlEn));
  });
});
