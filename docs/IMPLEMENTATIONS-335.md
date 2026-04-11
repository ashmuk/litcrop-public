# IMPLEMENTATIONS — #335 Login Page Wordmark Morph

> **Status**: Step 8 (cc-implement) — MVP phases A/B/C complete — 2026-04-10
> **Pipeline**: 1 ✅ → 2 ✅ → 3+4 ✅ → 5 ✅ → 6 ✅ → 7 ✅ → **8** → 9
> **Scope level**: MVP (Track B integration)
> **Branch**: `feature/335-login-wordmark-morph`

---

## 1. What Shipped

| Phase | Task | Commit | Files changed |
|-------|------|--------|---------------|
| A | T-335-02 create LitCropWordmarkMorph.astro | `7b3409f` | +1 new file, 354 lines |
| B+C | T-335-03 + T-335-04 AuthLayout + login.astro integration | `ed74cbf` | 2 files, +140 / -28 |

Branch state: 2 feature commits on top of `develop` (which has 5 design-phase commits for #335).

---

## 2. Files Touched

### New

- `src/frontend/src/components/brand/LitCropWordmarkMorph.astro` — 354 lines
  - Zero-JS Astro component with scoped CSS keyframes
  - Props: `variant?: 'animated' | 'static'`, `class?: string`
  - Canonical visual source: `docs/mockups/335-desktop.html` (fd58414)
  - 5 `data-testid` attributes for future testing hooks

### Modified

- `src/frontend/src/layouts/AuthLayout.astro` — +85 / -21
  - Added `variant?: 'default' | 'hero'` prop with conditional rendering
  - Force `data-theme="earthy"` on `<html>`; force `class="auth-route"`
  - Updated `theme-color` meta from `#1B6B3A` to `#6B7F5E` (earthy sage)
  - Simplified theme bootstrap script (always earthy, preserve locale only)
  - Removed the 🌾 emoji brand logo block
  - Added `<style is:global>` override for the 480px body cap on auth routes
- `src/frontend/src/pages/login.astro` — +55 / -7
  - Imports `LitCropWordmarkMorph`
  - Uses AuthLayout `variant="hero"`
  - Split layout: mobile stacked (aspect 1:1 hero on top), desktop 60/40 split
  - Scoped `<style>` block with responsive grid
  - Static h1 "Welcome back" + subtitle "Sign in to manage your farm"

### Not modified (reused as-is)

- `src/frontend/src/components/LoginForm.tsx` — Cognito auth flow unchanged
- `src/frontend/src/components/Toast.tsx` — unchanged
- `src/frontend/src/styles/tokens.css` — earthy tokens already complete
- `src/frontend/src/styles/global.css` — body cap override is in AuthLayout scoped style, not global.css
- `src/frontend/src/styles/auth.css` — still used by signup/reset via `variant="default"`

---

## 3. Verification Results

### Automated (CI-equivalent)

| Check | Result | Details |
|-------|--------|---------|
| `npm run build` | ✅ | Root-level build; rebuilds `@litcrop/shared` first, then frontend + api. `/login/index.html` rendered in 2ms. 16 pages built. |
| `npm test` | ✅ | 790/790 tests pass across 37 test files. No regressions. |
| `npm run typecheck` | ✅ | `@litcrop/shared` + `@litcrop/api` clean. Frontend uses Astro's built-in TS handling. |
| Zero new npm deps | ✅ | `package.json` unchanged; no lockfile churn. |
| Zero new CSS tokens | ✅ | All colors resolved via existing earthy theme tokens (`--color-info`, `--color-status-slow-growth`, etc.) aliased to component-local vars. |

### Known pre-existing build issue

Running `npx astro build` *directly* in `src/frontend` (bypassing the root build) fails with:

```
[ERROR] [vite] ✗ Build failed
src/components/BedDetail.tsx (13:30): "getCropPropagation" is not exported by "../../packages/shared/dist/index.js"
```

**This is a pre-existing bug on `develop`**, not introduced by #335. The function IS exported from `packages/shared/src/index.ts:165` — the compiled `packages/shared/dist/index.js` is stale. The root-level `npm run build` script fixes this by rebuilding `@litcrop/shared` first. Flagged but NOT fixed in this session (out of scope for #335). Consider filing a separate issue if this tripped up contributors.

### Manual (pending — T-335-06)

See `docs/feedback/REVIEW-FINDINGS-335-MVP.md` (template created — to be filled in by reviewer).

---

## 4. Decisions Made During Implementation

These are judgment calls I made while building that weren't explicit in DESIGNS-335.md. If any disagree with intent, flag them at the STOP gate.

### D1 — Component-local CSS variable aliasing

The committed mockup used `var(--color-info-blue)`, `var(--color-amber)`, `var(--color-terracotta)` for stroke colors, but these aren't in `tokens.css`. The real earthy theme exports `--color-info`, `--color-status-slow-growth`, `--color-status-issue` respectively.

I added a component-local alias layer inside `.litcrop-hero`:

```css
.litcrop-hero {
  --hero-water:      var(--color-info, #5E7F9B);
  --hero-amber:      var(--color-status-slow-growth, #B89B5E);
  --hero-sienna:     var(--color-motion, #C07842);
  --hero-terracotta: var(--color-status-issue, #B85C4A);
}
```

So the SVG stroke classes can use decorative names (`.water`, `.amber`, `.sienna`, `.terracotta`) while binding to the real theme tokens. Pragmatic trade-off: avoids polluting `tokens.css` with one-off brand-hero aliases, and component stays theme-reactive if the earthy palette ever updates.

### D2 — Keyframe name prefixing

Astro scoped `<style>` does not scope `@keyframes` declarations — those are always global. To prevent collisions with any other component using the same keyframe names (e.g., a future component defining its own `motifIn`), I prefixed every keyframe with `litcrop-`:

- `draw` → `litcrop-draw`
- `motifIn` → `litcrop-motif-in`
- `sceneryDim` → `litcrop-scenery-dim`
- etc.

### D3 — AuthLayout variant prop pattern

DESIGNS-335 §6 said "remove the auth-card wrapper." Signup, reset, and verify pages all depend on that wrapper. Removing it outright would break those pages.

Instead, I added a `variant?: 'default' | 'hero'` prop:
- `variant="default"` (implicit default) keeps existing behavior for signup/reset/verify
- `variant="hero"` bypasses the auth-page + auth-card wrapper and yields the full body to the slot

Only `login.astro` uses `variant="hero"`. Everything else is backwards-compatible.

### D4 — Scoped global style for body cap override

ADR-335-10 said the body cap override is "a single CSS rule." DESIGNS-335 §6 suggested putting it in AuthLayout's scoped style. Astro scoped styles attach a class hash that matches elements *inside* the component — but `<body>` is a child of `<html>`, both rendered by the layout, so in-component `<style>` doesn't reach them.

Solution: used `<style is:global>` inside AuthLayout with a highly specific selector `html.auth-route body.auth-layout-body`. The selector is specific enough that it cannot leak to any non-auth page. Single rule, lives in one file, matches the ADR intent.

### D5 — theme-color meta update

The existing `<meta name="theme-color" content="#1B6B3A">` was a dark green from a pre-earthy palette. Since auth pages now force the earthy theme, I updated the meta to `#6B7F5E` (sage primary) so mobile browser chrome matches the page background.

---

## 5. What's Left for MVP

### Remaining tasks (not yet done)

- **T-335-05** — already effectively done: test suite verified post-integration (see §3 above)
- **T-335-06** — Manual QA: `docs/feedback/REVIEW-FINDINGS-335-MVP.md` template created; needs the user (or a reviewer) to actually open `/login` in 3 browsers and tick the boxes
- **T-335-07** — Create PR: not yet done; awaiting user decision at the STOP gate below

### Production scope (deferred)

T-335-P1 through T-335-P5 remain in the Production scope per PLANS-335.md §1 — not touched in this session.

---

## 6. Rollback Plan

Per ADR-335-10 and PLANS-335.md §4:

- **Branch abandon**: `git checkout develop && git branch -D feature/335-login-wordmark-morph` — all 2 feature commits gone, zero trace on develop
- **Per-commit revert**: `git revert ed74cbf` removes the integration (component file stays), `git revert 7b3409f` removes the component
- **Post-merge revert**: single `git revert <merge-commit>` on `develop` after the PR is merged

No database changes, no infrastructure changes, no config changes. Rollback is pure file deletion.

---

## 7. STOP Gate — User Review Required

Per cc-implement step 11: **do not proceed to Step 9 (cc-test) until the user explicitly reviews the implementation locally.**

### Action for user

1. On your dev machine: check out `feature/335-login-wordmark-morph`
2. Run `npm run build` from the workspace root
3. Open a dev server: `cd src/frontend && npm run dev` (or your preferred method)
4. Navigate to `/login` in Chrome, Safari, Firefox
5. Test at viewport widths 1920, 1024, 768, 480, 360 px
6. Verify the morph animation plays cleanly (~5s total)
7. Verify the login form still works end-to-end (test account)
8. Toggle OS "Reduce motion" → verify the static final state
9. Switch to JA locale → verify form text translates, wordmark/tagline stay English
10. Fill in `docs/feedback/REVIEW-FINDINGS-335-MVP.md` with any findings

### Decision options

- ✅ **Proceed** → continue to `/cc-test` (Step 9: Test Strategy) to define visual regression + a11y test plan for Production scope
- 🔁 **Continue building** → resume `/cc-implement` for T-335-07 (PR creation) and any follow-up fixes from manual QA
- ↺ **Replan** → manual QA reveals plan issues; re-enter at Step 5 with `/cc-design`
- 🏗 **Rearchitect** → architecture assumptions broken; re-enter at Step 2 with `/cc-design`
- 🔬 **Review first** → run `/cc-review` before proceeding to cc-test

### Recommended

**Proceed to `/cc-review` first**, then `/cc-test`. The code review gate catches anything subtle I might have missed in the SVG extraction or the layout CSS, before we invest in test strategy work.
