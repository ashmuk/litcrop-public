/**
 * CHANGELOG.md ↔ VersionHistory.tsx consistency check.
 *
 * Catches the failure mode from PR #469 (2026-04-28): CHANGELOG.md was
 * updated for v0.99.8.0 + v0.99.8.1 but the user-facing /history view
 * (VersionHistory.tsx + i18n) wasn't kept in sync, so users saw v0.99.7.5
 * marked `current` long after v0.99.8.1 had shipped.
 *
 * The test asserts ONLY the latest CHANGELOG version, not every entry —
 * older Beta releases (0.95 / 0.96 / 0.97 / etc.) live in CHANGELOG but are
 * deliberately omitted from VersionHistory because they predate /history's
 * usefulness for current users.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const CHANGELOG = fs.readFileSync(path.join(projectRoot, 'CHANGELOG.md'), 'utf-8');
const VERSION_HISTORY = fs.readFileSync(
  path.join(projectRoot, 'src/frontend/src/components/VersionHistory.tsx'),
  'utf-8',
);
const EN = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'src/frontend/src/i18n/en.json'), 'utf-8'),
) as { changelog?: Record<string, string> };
const JA = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'src/frontend/src/i18n/ja.json'), 'utf-8'),
) as { changelog?: Record<string, string> };

// Released versions from CHANGELOG, newest first. Skips [Unreleased].
const releasedVersions = [...CHANGELOG.matchAll(/^## \[(\d+(?:\.\d+)+)\]/gm)].map((m) => m[1]);

// Versions from VersionHistory entries.
const historyVersions = [...VERSION_HISTORY.matchAll(/version="v(\d+(?:\.\d+)+)"/g)].map((m) => m[1]);

/**
 * Map a dotted version to its i18n-key form. Project convention collapses
 * the first 3 segments (so `0.99.7` → `0997`) and only adds an underscore
 * before a 4th-segment patch number (so `0.99.7.5` → `0997_5`).
 */
function versionToKey(version: string): string {
  const parts = version.split('.');
  if (parts.length >= 4) return `v${parts[0]}${parts[1]}${parts[2]}_${parts.slice(3).join('_')}`;
  return `v${parts.join('')}`;
}

describe('CHANGELOG ↔ VersionHistory consistency', () => {
  it('CHANGELOG.md has at least one released version', () => {
    expect(releasedVersions.length).toBeGreaterThan(0);
  });

  it('VersionHistory.tsx has at least one VersionEntry', () => {
    expect(historyVersions.length).toBeGreaterThan(0);
  });

  it('newest CHANGELOG release is present in VersionHistory.tsx', () => {
    const newest = releasedVersions[0];
    expect(
      historyVersions,
      `CHANGELOG.md latest released version is v${newest}, but VersionHistory.tsx ` +
        `does not list it. Add <VersionEntry version="v${newest}" date="..." items={[...]} current /> ` +
        `at the top of VersionHistory.tsx, demote the previous entry's \`current\` prop, and ` +
        `add changelog.v${newest.replace(/\./g, '_')}_item_1 to en.json + ja.json.`,
    ).toContain(newest);
  });

  it('newest CHANGELOG release carries the `current` prop on its VersionEntry', () => {
    const newest = releasedVersions[0];
    // Match the VersionEntry block whose version="vX" matches `newest`.
    const versionEscaped = newest.replace(/\./g, '\\.');
    const entryRegex = new RegExp(
      `<VersionEntry[^>]*?version="v${versionEscaped}"[^/]*?/>`,
      's',
    );
    const match = VERSION_HISTORY.match(entryRegex);
    expect(match, `No <VersionEntry> block found for v${newest}`).toBeTruthy();
    expect(
      match![0],
      `<VersionEntry version="v${newest}" .../> must include the \`current\` prop. ` +
        `Move \`current\` from the previous-newest entry to this one when shipping a new release.`,
    ).toMatch(/\bcurrent\b/);
  });

  it('exactly one VersionEntry in VersionHistory.tsx is marked `current`', () => {
    // The `current` JSX prop sits on its own line directly above `/>`.
    // The badge label inside the helper component (literal text "current"
    // in a <span>) is filtered out by requiring `/>` on the next line.
    const currentPropCount = (VERSION_HISTORY.match(/\bcurrent\s*\n\s*\/>/g) ?? []).length;
    expect(
      currentPropCount,
      `Found ${currentPropCount} <VersionEntry .../> blocks with the \`current\` prop; exactly 1 expected.`,
    ).toBe(1);
  });

  it.each(historyVersions)(
    'VersionHistory entry v%s has changelog.<key>_item_1 in both en.json and ja.json',
    (version) => {
      const key = `${versionToKey(version)}_item_1`;
      expect(EN.changelog?.[key], `Missing en.json key: changelog.${key}`).toBeTruthy();
      expect(JA.changelog?.[key], `Missing ja.json key: changelog.${key}`).toBeTruthy();
    },
  );
});
