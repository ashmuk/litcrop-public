# Session Report — v0.99 sprint (session `preprod-099`, 2026-04-16)

> **TL;DR** — One session carried the project from v0.98 shipped to v0.99 materially complete on develop. Eight PRs merged: one promotion (#408 in the morning), four features (#411–#414), and three same-session hotfixes (#415–#417) driven by CSP regressions and a pilot-feedback loop. Production ran v0.98 all day; develop is now seven commits ahead, ready for a v0.99 tag and next promotion.

## Headline deliverables

| # | PR | Scope | Notes |
|---|----|-------|-------|
| #409 | #411 | `tsc --build` in pre-commit hook | Builds `packages/shared`, typechecks all workspaces, silent-unless-fail, short-circuits when no `.ts`/`.tsx` is staged. |
| #380 | #412 + #415 (hotfix) | Drop `unsafe-inline` from `script-src` | Externalized 5 inline scripts, replaced a `javascript:` URI, allowlisted two Astro-injected hashes, added `tools/gen-csp-hashes.mjs`. |
| #407 (+ #242 superseded) | #413 + #416 (hotfix) | `/help/device-setup` Pi camera explainer | 6-section static page, CSS-only capture-cycle animation, Class 1/2/3 table, bilingual EN/JA via CSS-toggle. |
| #410 | #414 | OG social card + og/twitter meta | 1200×630 PNG adopted from user's reference, `og:*` + `twitter:*` wired into BaseLayout + AuthLayout. |
| auth | #417 | Invitation / owner code split | Invitation code moved to `2026LITCROP`; owner promo stays `LITCROP2026`. Auto-fill coupling removed so invited users default to staff. |

## Timeline

```
07:27 Z  PR #408  develop → main promotion (v0.93 → v0.98, 13 issues auto-closed)
10:01 Z  PR #411  #409 pre-commit hook
10:02 Z  PR #412  #380 script-src 'unsafe-inline' dropped
10:03 Z  PR #413  #407 Pi-camera explainer page
10:05 Z  PR #414  #410 OG social card
10:13 Z  PR #415  #380 hotfix — Astro inline hashes allowlisted (login was broken)
10:24 Z  PR #416  #407 hotfix — dual-render EN/JA (was English-only)
11:11 Z  PR #417  invitation / owner code split
```

## What shipped (file-level)

**Tooling**
- `.githooks/pre-commit` — adds shared build + full workspace typecheck. Silent-unless-fail; skips when no TS staged (docs / shell / infra / hook-only commits).
- `tools/gen-csp-hashes.mjs` — recursively walks `dist/`, extracts every distinct inline script body, emits SHA-256 CSP hashes. Run after any Astro upgrade to refresh the allowlist.

**Frontend**
- New page: `src/frontend/src/pages/help/device-setup.astro` (bilingual, 267 insertions dual-render + 84 original English lines). Wired from `DeviceListPage` empty state ("Learn more") and `ProfilePage` Help & Guides section.
- External scripts: `public/scripts/{theme-locale-restore,auth-locale-restore,i18n-labels,farm-name-title,redirect-preserve-query,nav-back}.js`.
- Layouts: `BaseLayout.astro` and `AuthLayout.astro` — inline script removal, `og:*` + `twitter:*` meta, data-attribute-based server-to-client data passing for farm-name hydration.
- Redirect shims: `settings.astro` (meta-refresh only, JS dropped), `plots/view.astro` + `images/view.astro` (delegated handlers).
- i18n keys: `device.learn_more_cta`, `legal.section_help`, `legal.help_device_setup` in both `en.json` and `ja.json`.
- Auth: `RegisterForm.tsx` — two constants (`INVITATION_CODE`, `PROMO_CODE`), auto-fill coupling removed.

**Infra**
- `infra/lib/litcrop-stack.ts` — `script-src` switched from `'self' 'unsafe-inline'` to `'self' 'sha256-U7a72oKu…' 'sha256-QzWFZi+F…'`. `style-src` retains `'unsafe-inline'` (intentional — Astro scoped styles + Preact JSX style props).

**OG asset**
- `src/frontend/public/og/og-default.png` — 1200×630, 308 KB, resized from user-provided reference via `sharp`.
- `docs/screenshots/litcrop-OG.png` — source reference kept alongside for history.

**Tests**
- `e2e/tests/categories/security.spec.ts` — now strictly asserts `script-src` contains `'self'`, does NOT contain `'unsafe-inline'`, and DOES contain both Astro hydration hashes.
- No vitest/bats additions this session. Total: 884 vitest + 46 bats = 930, all green.

## Design decisions worth remembering

### 1. `is:inline` on a `<script src>` is *not* a CSP-relevant flag

First non-obvious CSP finding: `<script is:inline src="/scripts/foo.js">` emits a standard external-reference `<script>` tag with no inline payload. Astro's `is:inline` directive is a **build-time Vite bundling opt-out**, not an HTML-semantics flag. Misreading the name would have sent us toward nonces or hashes unnecessarily.

### 2. Dual-render beats per-locale routing for static doc pages

The `/help/device-setup` page was initially EN-only ("JA deferred"). When Japanese pilot users saw English, we switched to dual-rendering both locales inside one HTML with a CSS toggle keyed off `<html data-locale>`:

```css
html[data-locale="ja"] [data-lang="en"] { display: none; }
html:not([data-locale="ja"]) [data-lang="ja"] { display: none; }
```

`data-locale` is set pre-paint by `auth-locale-restore.js`, so no flash. Alternatives (route-per-locale, JSON-map i18n) would have been heavier for a single narrative doc page with `<strong>/<em>/<code>` markup.

### 3. Astro auto-inlines hydration glue even in SSG

The `#380` survey missed two inline scripts — Astro's Preact hydration runtime and the `astro:load` dispatcher — both auto-injected at build time. Survey assumption was "Astro's hydration glue is deferred via module imports"; reality is two small inline bootstraps on every `client:load` page. Login broke on staging until we allowlisted their hashes.

**Follow-up**: evaluate `experimental.csp` or SSR adapter for nonce-based CSP that survives Astro upgrades without hash maintenance.

### 4. Splitting coupled auth codes fixed a latent leak

Invitation and owner-promo codes were one constant (`LITCROP2026`) with a side-effect chain: entering the invite auto-promoted to owner. Splitting into `INVITATION_CODE = '2026LITCROP'` + `PROMO_CODE = 'LITCROP2026'` (unchanged) broke the coupling. The auto-fill had to go — preserving it either fails validation or leaks the owner code to every invited user.

## Review / remediation loop

Pipeline reviews on the four morning PRs surfaced issues the implementation pass missed:

- **#411 (#409)** — `--silent` on `npm run build` swallowed the one output that matters (failure). No change-pattern short-circuit meant docs-only commits paid the 3–8 s typecheck cost. Both remediated in the same PR before merge.
- **#412 (#380)** — **Critical**: `href="javascript:history.back()"` in `images/view.astro` would break under the new CSP. Reviewer found it via whole-tree grep; remediated with a delegated-click handler + `/scripts/nav-back.js`. Also hardened the e2e test to gate strict assertions on the enforcing CSP header only (not report-only).
- **#413 (#407)** — External links to GitHub runbook + suppliers lacked `target="_blank" rel="noopener"`. Reviewer flagged; remediated.
- **#414 (#410)** — No review findings that stuck.

Review pattern worth codifying for future CSP work: whole-tree grep for inline-script vectors (`javascript:` URIs, inline event-handler attributes, dynamic code-string evaluation) plus a post-build enumeration of actual inline scripts in `dist/`. Both are now in `tools/gen-csp-hashes.mjs`; the first step belongs in the cc-review skill.

## Known open items after this session

- **`#395` Phase 1** — schema + systemd migration + install.sh rewrite. Blocked on T-395-05 Pi closeout (EC-2 active-window SKIP, EC-4 window restored, Test Shot).
- **T-395-05 Phase 0 Pi closeout** — three exit criteria still unverified. Decoupled from promotion cadence since PR #408 landed.
- **Astro CSP hash maintenance** — ticking: any Astro upgrade drifts the two allowlisted hashes. Track `experimental.csp` migration as a follow-up.
- **Client-side pilot gates** — both auth codes ship in the JS bundle. Acceptable during pilot; server-side validation before public launch.
- **Staging discoverability hardening** (ADR-20260415) — `X-Robots-Tag noindex`, CloudWatch registration-volume alarm, invitation-code rotation discipline.

## Ready for next session

- `develop` @ `05077a2`, 7 commits above `main` (which sits at `v0.98-37-gea96abc`).
- All tests green: 884 vitest + 46 bats.
- Working tree clean.
- Recommended next step: tag `v0.99` on develop @ `05077a2`, open promotion PR (same pattern as #408). Promotion will auto-close #380, #407, #409, #410, #242 on merge.
- Alternate next step: continue on `develop` with #395 Phase 1 once Pi is available, pack into a v0.99 tag upon Phase 0 closure.

## Metrics snapshot

```
Source files (ts/tsx/astro):    163   (+1)
Astro build pages:              21    (+1)
vitest:                         884 passing / 39 files
bats:                           46 passing
PRs merged today:               8  (#408 + #411..#417)
Lines changed (sum of merged):  ~1,800 insertions, ~280 deletions
AWS monthly cost:               ~$1.18 / $5 budget
```
