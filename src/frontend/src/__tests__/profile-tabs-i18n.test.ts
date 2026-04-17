/**
 * i18n key coverage tests for Profile Tab refactor — I-1 to I-6
 *
 * Uses createTranslator() (locale-bound, no DOM required) instead of t()
 * so these tests work in the node vitest environment without JSDOM.
 *
 * Covered: I-1, I-2, I-3, I-4, I-5, I-6
 */

import { describe, it, expect } from 'vitest';
import { createTranslator } from '../i18n/i18n';

const en = createTranslator('en');
const ja = createTranslator('ja');

// ── I-1: profile.tab_farms ─────────────────────────────────────────

describe('I-1: profile.tab_farms', () => {
  it('returns "Farms" in English', () => {
    expect(en('profile.tab_farms')).toBe('Farms');
  });

  it('returns "農園" in Japanese', () => {
    expect(ja('profile.tab_farms')).toBe('農園');
  });
});

// ── I-2: profile.tab_you ──────────────────────────────────────────

describe('I-2: profile.tab_you', () => {
  it('returns "You" in English', () => {
    expect(en('profile.tab_you')).toBe('You');
  });

  it('returns "あなた" in Japanese', () => {
    expect(ja('profile.tab_you')).toBe('あなた');
  });
});

// ── I-3: profile.tab_system ───────────────────────────────────────

describe('I-3: profile.tab_system', () => {
  it('returns "System" in English', () => {
    expect(en('profile.tab_system')).toBe('System');
  });

  it('returns "システム" in Japanese', () => {
    expect(ja('profile.tab_system')).toBe('システム');
  });
});

// ── I-4: help.getting_started ─────────────────────────────────────

describe('I-4: help.getting_started', () => {
  it('returns "How-To: Getting Started" in English', () => {
    expect(en('help.getting_started')).toBe('How-To: Getting Started');
  });
});

// ── I-5: info.history ─────────────────────────────────────────────

describe('I-5: info.history', () => {
  it('returns "History" in English', () => {
    expect(en('info.history')).toBe('History');
  });

  it('returns "更新履歴" in Japanese', () => {
    expect(ja('info.history')).toBe('更新履歴');
  });
});

// ── I-6: regression guard — no key returns a raw dot-notation string ──

describe('I-6: no new key returns a raw dot-notation string', () => {
  const newKeys = [
    'profile.tab_farms',
    'profile.tab_you',
    'profile.tab_system',
    'help.getting_started',
    'info.history',
  ];

  for (const key of newKeys) {
    it(`EN key "${key}" does not return the key itself`, () => {
      expect(en(key)).not.toBe(key);
    });

    it(`JA key "${key}" does not return the key itself`, () => {
      expect(ja(key)).not.toBe(key);
    });
  }
});
