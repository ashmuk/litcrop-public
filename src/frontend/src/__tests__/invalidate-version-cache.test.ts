/**
 * invalidateVersionCache — B1/B2/B3 cache-invalidation coverage.
 *
 * Tests the pure helper used by astro.config.mjs.  fs primitives are
 * injected so the logic is deterministic under the node vitest env
 * (no real filesystem touch, no flaky ordering).
 *
 * Covered: B1 (version change clears caches),
 *          B2 (first-ever build doesn't clear),
 *          B3 (same-version rebuild doesn't clear),
 *          plus filesystem-failure safety and stamp-write semantics.
 */

import { describe, it, expect, vi } from 'vitest';
import { invalidateVersionCache } from '../../../../tools/invalidate-version-cache.mjs';

// ── Fake fs factory ────────────────────────────────────────────────

function makeFs(stamp: { content?: string; exists?: boolean } = {}) {
  const rmSync = vi.fn();
  const writeFileSync = vi.fn();
  const mkdirSync = vi.fn();
  const readFileSync = vi.fn(() => stamp.content ?? '');
  const existsSync = vi.fn(() => stamp.exists ?? false);
  return { rmSync, writeFileSync, mkdirSync, readFileSync, existsSync };
}

const silentLogger = () => { /* swallow */ };

// ── B1: version change clears all cache dirs ────────────────────────

describe('B1: version change triggers cache clear', () => {
  it('clears .astro/, dist/, and node_modules/.vite/ when the stamp differs', () => {
    const fs = makeFs({ exists: true, content: 'v0.99.4' });

    const result = invalidateVersionCache('v0.99.5', { fs, logger: silentLogger });

    expect(result.stampedVersion).toBe('v0.99.4');
    expect(result.cleared).toEqual(['.astro', 'dist', 'node_modules/.vite']);
    expect(fs.rmSync).toHaveBeenCalledTimes(3);
    expect(fs.rmSync).toHaveBeenNthCalledWith(1, '.astro', { recursive: true, force: true });
    expect(fs.rmSync).toHaveBeenNthCalledWith(2, 'dist', { recursive: true, force: true });
    expect(fs.rmSync).toHaveBeenNthCalledWith(3, 'node_modules/.vite', { recursive: true, force: true });
  });

  it('writes the new version to the stamp file after clearing', () => {
    const fs = makeFs({ exists: true, content: 'v0.99.4' });

    const result = invalidateVersionCache('v0.99.5', { fs, logger: silentLogger });

    expect(fs.mkdirSync).toHaveBeenCalledWith('node_modules/.cache', { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith('node_modules/.cache/astro-app-version', 'v0.99.5');
    expect(result.stampWritten).toBe(true);
  });

  it('respects a custom cacheDirs list (e.g. for tests with a different layout)', () => {
    const fs = makeFs({ exists: true, content: 'old' });

    invalidateVersionCache('new', {
      fs,
      logger: silentLogger,
      cacheDirs: ['custom-cache-1', 'custom-cache-2'],
    });

    expect(fs.rmSync).toHaveBeenCalledTimes(2);
    expect(fs.rmSync).toHaveBeenNthCalledWith(1, 'custom-cache-1', { recursive: true, force: true });
    expect(fs.rmSync).toHaveBeenNthCalledWith(2, 'custom-cache-2', { recursive: true, force: true });
  });

  it('respects a custom stampDir (reads + writes stamp at the override path)', () => {
    const fs = makeFs({ exists: true, content: 'v0.99.4' });

    invalidateVersionCache('v0.99.5', {
      fs,
      logger: silentLogger,
      stampDir: '.cache/build',
    });

    // Read and write both land under the custom dir
    expect(fs.existsSync).toHaveBeenCalledWith('.cache/build/astro-app-version');
    expect(fs.readFileSync).toHaveBeenCalledWith('.cache/build/astro-app-version', 'utf8');
    expect(fs.mkdirSync).toHaveBeenCalledWith('.cache/build', { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith('.cache/build/astro-app-version', 'v0.99.5');
  });

  it('respects a custom stampFileName (different filename, default dir)', () => {
    const fs = makeFs({ exists: true, content: 'old' });

    invalidateVersionCache('new', {
      fs,
      logger: silentLogger,
      stampFileName: 'version.stamp',
    });

    expect(fs.existsSync).toHaveBeenCalledWith('node_modules/.cache/version.stamp');
    expect(fs.writeFileSync).toHaveBeenCalledWith('node_modules/.cache/version.stamp', 'new');
  });
});

// ── B2: first-ever build — no stamp file, no clear ──────────────────

describe('B2: first-ever build does NOT clear caches', () => {
  it('skips rmSync when the stamp file does not exist', () => {
    const fs = makeFs({ exists: false });

    const result = invalidateVersionCache('v0.99.5', { fs, logger: silentLogger });

    expect(fs.rmSync).not.toHaveBeenCalled();
    expect(result.cleared).toEqual([]);
    expect(result.stampedVersion).toBe('');
  });

  it('still writes the stamp so the NEXT build can detect a change', () => {
    const fs = makeFs({ exists: false });

    const result = invalidateVersionCache('v0.99.5', { fs, logger: silentLogger });

    expect(fs.writeFileSync).toHaveBeenCalledWith('node_modules/.cache/astro-app-version', 'v0.99.5');
    expect(result.stampWritten).toBe(true);
  });
});

// ── B3: same-version rebuild — stamp matches, no clear ─────────────

describe('B3: same-version rebuild preserves incremental build', () => {
  it('does NOT call rmSync when stamp matches appVersion', () => {
    const fs = makeFs({ exists: true, content: 'v0.99.5' });

    const result = invalidateVersionCache('v0.99.5', { fs, logger: silentLogger });

    expect(fs.rmSync).not.toHaveBeenCalled();
    expect(result.cleared).toEqual([]);
    expect(result.stampedVersion).toBe('v0.99.5');
  });

  it('still rewrites the stamp (idempotent) so drift can be detected if writes are flaky', () => {
    const fs = makeFs({ exists: true, content: 'v0.99.5' });

    invalidateVersionCache('v0.99.5', { fs, logger: silentLogger });

    // Same value written — harmless idempotent write
    expect(fs.writeFileSync).toHaveBeenCalledWith('node_modules/.cache/astro-app-version', 'v0.99.5');
  });
});

// ── Safety: fs failures must never crash the build ─────────────────

describe('fs failure safety', () => {
  it('survives readFileSync throwing (treats as first-build)', () => {
    const fs = makeFs({ exists: true });
    fs.readFileSync.mockImplementation(() => { throw new Error('EACCES'); });

    const result = invalidateVersionCache('v0.99.5', { fs, logger: silentLogger });

    expect(result.stampedVersion).toBe('');
    expect(fs.rmSync).not.toHaveBeenCalled();
  });

  it('survives rmSync throwing on one cache dir without aborting the rest', () => {
    const fs = makeFs({ exists: true, content: 'old' });
    fs.rmSync.mockImplementationOnce(() => { throw new Error('EACCES'); });

    const result = invalidateVersionCache('new', { fs, logger: silentLogger });

    // The first rmSync failed; the remaining two should still have been attempted
    expect(fs.rmSync).toHaveBeenCalledTimes(3);
    // Only the two successful ones appear in `cleared`
    expect(result.cleared).toEqual(['dist', 'node_modules/.vite']);
  });

  it('survives writeFileSync throwing (stampWritten becomes false but no throw propagates)', () => {
    const fs = makeFs({ exists: false });
    fs.writeFileSync.mockImplementation(() => { throw new Error('ENOSPC'); });

    const result = invalidateVersionCache('v0.99.5', { fs, logger: silentLogger });

    expect(result.stampWritten).toBe(false);
  });

  it('survives mkdirSync throwing', () => {
    const fs = makeFs({ exists: false });
    fs.mkdirSync.mockImplementation(() => { throw new Error('EROFS'); });

    expect(() => invalidateVersionCache('v0.99.5', { fs, logger: silentLogger })).not.toThrow();
  });
});

// ── Stamp-content edge cases ───────────────────────────────────────

describe('stamp content edge cases', () => {
  it('trims whitespace from the stamp before comparison', () => {
    const fs = makeFs({ exists: true, content: '  v0.99.5\n' });

    const result = invalidateVersionCache('v0.99.5', { fs, logger: silentLogger });

    // Trimmed value matches — no clear
    expect(result.stampedVersion).toBe('v0.99.5');
    expect(fs.rmSync).not.toHaveBeenCalled();
  });

  it('treats an empty stamp as no stamp (first build)', () => {
    const fs = makeFs({ exists: true, content: '' });

    const result = invalidateVersionCache('v0.99.5', { fs, logger: silentLogger });

    expect(result.stampedVersion).toBe('');
    expect(fs.rmSync).not.toHaveBeenCalled();
  });

  it('treats a binary / corrupted stamp as a different version and triggers clear', () => {
    const fs = makeFs({ exists: true, content: '\x00\x01garbage\x02' });

    const result = invalidateVersionCache('v0.99.5', { fs, logger: silentLogger });

    // Anything non-empty and non-matching → clear (fail-safe: spend one build to self-repair)
    expect(fs.rmSync).toHaveBeenCalledTimes(3);
    expect(result.cleared.length).toBe(3);
  });
});
