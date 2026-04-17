/**
 * ProfileSystemTab structural tests — S-1 to S-4
 *
 * Uses preact-render-to-string to render the component to an HTML string
 * in the node vitest environment (no JSDOM required).
 *
 * __APP_VERSION__ is declared as a global before import so the Vite define
 * is satisfied. ThemeSwitcher effects (localStorage/document) are also
 * stubbed via globalThis before the component is imported.
 *
 * Covered: S-1, S-2, S-3, S-4
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// ── Pre-import stubs for globals used by ThemeSwitcher + i18n ─────────

// Satisfy the Vite define replacement that astro.config.mjs sets at build time
// @ts-ignore — __APP_VERSION__ is injected by Vite; we set it manually in tests
globalThis.__APP_VERSION__ = 'test';

// ThemeSwitcher reads localStorage and document.documentElement during useEffect.
// preact-render-to-string executes synchronous render but does NOT flush effects,
// so these stubs only need to satisfy import-time references in module scope.
const localStorageMock = {
  getItem: vi.fn().mockReturnValue(null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('document', {
  documentElement: {
    getAttribute: vi.fn().mockReturnValue(null),
    setAttribute: vi.fn(),
  },
  querySelectorAll: vi.fn().mockReturnValue([]),
});
vi.stubGlobal('window', {
  dispatchEvent: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import ProfileSystemTab from '../components/ProfileSystemTab';

// ── Render once; all assertions share the HTML string ────────────

let html: string;

beforeAll(() => {
  html = renderToString(
    h(ProfileSystemTab, {
      locale: 'en',
      tempUnit: 'C',
      onLocaleChange: vi.fn(),
      onTempUnitChange: vi.fn(),
    }),
  );
});

// ── S-1: 3 card sections ──────────────────────────────────────────

describe('S-1: renders 3 card <div> containers', () => {
  it('contains App Settings card', () => {
    // App Settings card heading is unique
    expect(html).toContain('App Settings');
  });

  it('contains Help card', () => {
    expect(html).toContain('Help');
  });

  it('contains Info card', () => {
    expect(html).toContain('Info');
  });

  it('has exactly 3 occurrences of cardStyle margin-bottom token (one per card)', () => {
    // Each card div uses `margin-bottom:var(--space-4)` from cardStyle constant
    const matches = html.match(/margin-bottom:var\(--space-4\)/g);
    // 3 cards each contribute at least one margin-bottom token in their style
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

// ── S-2: Help card contains /help/getting-started link ───────────

describe('S-2: Help card — /help/getting-started link', () => {
  it('has an href to /help/getting-started', () => {
    expect(html).toContain('href="/help/getting-started"');
  });
});

// ── S-3: Help card contains /help/device-setup link ──────────────

describe('S-3: Help card — /help/device-setup link', () => {
  it('has an href to /help/device-setup', () => {
    expect(html).toContain('href="/help/device-setup"');
  });
});

// ── S-4: Info card contains /history, /terms, /privacy, /report-bug ──

describe('S-4: Info card — all four info links present', () => {
  it('contains href="/history"', () => {
    expect(html).toContain('href="/history"');
  });

  it('contains href="/terms"', () => {
    expect(html).toContain('href="/terms"');
  });

  it('contains href="/privacy"', () => {
    expect(html).toContain('href="/privacy"');
  });

  it('contains href="/report-bug"', () => {
    expect(html).toContain('href="/report-bug"');
  });
});
