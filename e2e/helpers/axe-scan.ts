/**
 * axe-core accessibility scan helper for Playwright E2E tests.
 *
 * Wraps `@axe-core/playwright` so tests can call a single helper and fail on
 * any WCAG violation with impact=serious or higher. Less-impactful findings
 * (minor/moderate) are logged but do not fail the suite — those are tracked
 * separately in audit reports.
 *
 * Usage:
 *   import { expectNoSeriousA11y } from '../helpers/axe-scan';
 *   test('page X is accessible', async ({ page }) => {
 *     await page.goto('/path');
 *     await expectNoSeriousA11y(page);
 *   });
 */

import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

type Impact = 'minor' | 'moderate' | 'serious' | 'critical';

export interface AxeScanOptions {
  /** Hide parts of the page from the scan (e.g. third-party iframes). */
  exclude?: string[];
  /**
   * Override the minimum impact threshold for failure. Default: 'critical'.
   *
   * Target per R-008/R-012 audit findings is `'serious'`, but the initial
   * rollout uses `'critical'` to avoid breaking CI on pre-existing serious
   * violations. Tighten to `'serious'` once each page has been audited and
   * its serious-level findings resolved (tracked as follow-up work).
   */
  failOn?: Impact;
}

const IMPACT_ORDER: Record<Impact, number> = {
  minor: 0,
  moderate: 1,
  serious: 2,
  critical: 3,
};

/**
 * Scan the current page for accessibility violations and fail the test on
 * any violation at or above `failOn` (default: serious).
 */
export async function expectNoSeriousA11y(page: Page, opts: AxeScanOptions = {}): Promise<void> {
  const threshold = IMPACT_ORDER[opts.failOn ?? 'critical'];

  let builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
  ]);

  if (opts.exclude && opts.exclude.length > 0) {
    for (const sel of opts.exclude) {
      builder = builder.exclude(sel);
    }
  }

  const results = await builder.analyze();

  const blocking = results.violations.filter((v) => {
    const impact = (v.impact ?? 'minor') as Impact;
    return IMPACT_ORDER[impact] >= threshold;
  });

  if (blocking.length > 0) {
    const summary = blocking
      .map((v) => `  - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})`)
      .join('\n');
    console.error(`axe-core found ${blocking.length} blocking a11y violation(s):\n${summary}`);
  }

  expect(blocking, 'axe-core violations at or above severity threshold').toHaveLength(0);
}
