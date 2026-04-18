/**
 * invalidate-version-cache — stamp-based cache bust for Astro/Vite builds.
 *
 * Astro's .astro/ and Vite's node_modules/.vite/ transform caches can hold
 * chunks compiled against the previous __APP_VERSION__ literal.  When a
 * git tag bump changes only the `git describe` output — no source mtimes
 * move — an incremental build reuses the stale chunks and the site ships
 * with the wrong version string.
 *
 * This helper compares the current appVersion against a stamp file;
 * when they differ, it clears the cache dirs that can hold stale output.
 * Same-version rebuilds stay fully incremental.
 *
 * The fs primitives are injected so the logic is deterministic under
 * vitest without touching the real filesystem.
 */

import * as nodeFs from 'node:fs';
import { join } from 'node:path';

/** @typedef {Pick<typeof nodeFs, 'readFileSync' | 'writeFileSync' | 'rmSync' | 'existsSync' | 'mkdirSync'>} FsLike */

const DEFAULT_STAMP_DIR = 'node_modules/.cache';
const DEFAULT_STAMP_FILE = 'astro-app-version';
const DEFAULT_CACHE_DIRS = ['.astro', 'dist', 'node_modules/.vite'];

/**
 * Run the stamp check and, if needed, clear the cache dirs.  Always
 * writes the current appVersion back to the stamp file at the end.
 *
 * Returns a summary so callers (and tests) can observe what happened
 * without scraping log output.
 *
 * @param {string} appVersion — the version that will be baked into this build
 * @param {{
 *   stampDir?: string,
 *   stampFileName?: string,
 *   cacheDirs?: string[],
 *   fs?: FsLike,
 *   logger?: (msg: string) => void,
 * }} [opts]
 * @returns {{ stampedVersion: string, cleared: string[], stampWritten: boolean }}
 */
export function invalidateVersionCache(appVersion, opts = {}) {
  const {
    stampDir = DEFAULT_STAMP_DIR,
    stampFileName = DEFAULT_STAMP_FILE,
    cacheDirs = DEFAULT_CACHE_DIRS,
    fs = nodeFs,
    logger = console.log,
  } = opts;

  const stampFile = join(stampDir, stampFileName);

  // Read the previously-stamped version; missing/unreadable stamp → empty.
  let stampedVersion = '';
  try {
    if (fs.existsSync(stampFile)) {
      stampedVersion = fs.readFileSync(stampFile, 'utf8').trim();
    }
  } catch {
    // ignore — treat as first build
  }

  // Clear only when a prior stamp exists AND differs from the current version.
  // First-ever builds (empty stamp) and same-version rebuilds are no-ops.
  const cleared = [];
  if (stampedVersion && stampedVersion !== appVersion) {
    logger(`[astro.config] __APP_VERSION__ changed ${stampedVersion} → ${appVersion}, clearing build caches`);
    for (const dir of cacheDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        cleared.push(dir);
      } catch {
        // keep going — cache bookkeeping must not fail the build
      }
    }
  }

  // Update the stamp so the NEXT build can detect a change.  Best-effort.
  let stampWritten = false;
  try {
    fs.mkdirSync(stampDir, { recursive: true });
    fs.writeFileSync(stampFile, appVersion);
    stampWritten = true;
  } catch {
    // ignore
  }

  return { stampedVersion, cleared, stampWritten };
}
