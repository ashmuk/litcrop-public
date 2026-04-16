#!/usr/bin/env node
// Enumerate every distinct inline <script> in src/frontend/dist and print
// its SHA-256 CSP hash. Used when Astro upgrades drift the auto-inlined
// hydration runtime — paste the output into the script-src directive in
// infra/lib/litcrop-stack.ts.
//
// Usage: (cd src/frontend && npx astro build) && node tools/gen-csp-hashes.mjs
// Follow-up tracker for nonce-based migration: #380.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const DIST = 'src/frontend/dist';

try { statSync(DIST); } catch {
  console.error(`[gen-csp-hashes] ${DIST}/ not found — run \`npx astro build\` first.`);
  process.exit(2);
}

// Recursive directory walk — no shell, no child_process.
function walk(dir, matches) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, matches);
    else if (entry.isFile() && entry.name === 'index.html') matches.push(p);
  }
  return matches;
}

const files = walk(DIST, []);

// Matches <script ...>body</script> where body is non-empty. HTML comments
// are stripped first so <!-- <script>…</script> --> doesn't register.
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;

const seen = new Map();
for (const path of files) {
  const html = readFileSync(path, 'utf8');
  const stripped = html.replace(/<!--[\s\S]*?-->/g, '');
  let m;
  while ((m = SCRIPT_RE.exec(stripped)) !== null) {
    const body = m[2];
    if (!body || body.trim().length === 0) continue;
    const hash = createHash('sha256').update(body, 'utf8').digest('base64');
    const full = `sha256-${hash}`;
    if (!seen.has(full)) seen.set(full, { pages: [], preview: body.slice(0, 80).replace(/\s+/g, ' ') });
    seen.get(full).pages.push(path.replace(`${DIST}/`, ''));
  }
}

if (seen.size === 0) {
  console.log('[gen-csp-hashes] No inline scripts found. script-src \'self\' is sufficient.');
  process.exit(0);
}

console.log(`[gen-csp-hashes] Found ${seen.size} distinct inline script(s):\n`);
for (const [hash, info] of seen) {
  console.log(`  '${hash}'`);
  console.log(`    used in ${info.pages.length} page(s), body starts with:`);
  console.log(`    ${info.preview}${info.preview.length >= 80 ? '…' : ''}\n`);
}

console.log('Paste the quoted hashes into script-src in infra/lib/litcrop-stack.ts.');
