# TASK BREAKDOWN — #335 Login Page Wordmark Morph

> **Status**: Step 6 (cc-design — Task Breakdown) — 2026-04-10
> **Pipeline**: 1 ✅ → 2 ✅ → 3+4 ✅ → 5 ✅ → **6** → 7 (STOP) → 8 → 9
> **Source**: `docs/DESIGNS-335.md`
> **Target scope**: **MVP** (Track B integration). PoC (mockups) already complete at commit `fd58414`.

---

## 1. Legend

| Field | Meaning |
|-------|---------|
| ID | `T-335-NN` — unique task identifier |
| Size | S (≤30 min), M (≤2 h), L (half-day), XL (full day) |
| Dep | Task IDs that must complete before this one can start |
| Files | Relative paths that will be created or modified |
| Exit | Explicit verification criteria |

---

## 2. MVP Task List (implementation-ready)

### T-335-01 — Create `src/frontend/src/components/brand/` directory

- **Size**: S
- **Dep**: –
- **Files**: `src/frontend/src/components/brand/` (new directory)
- **Description**: Create the new directory for brand-related Astro components. Nothing else in the repo currently uses `src/components/brand/`, so this introduces the convention.
- **Exit**: `ls src/frontend/src/components/brand/` succeeds.

---

### T-335-02 — Author `LitCropWordmarkMorph.astro` component

- **Size**: L
- **Dep**: T-335-01
- **Files**: `src/frontend/src/components/brand/LitCropWordmarkMorph.astro` (new)
- **Description**:
  1. Extract the full `<svg viewBox="0 0 720 720">` markup from `docs/mockups/335-desktop.html` (the scenery group, motif wordmark group, final lockup group).
  2. Extract the relevant CSS from the mockup's `<style>` block — keep only animation-related rules (see DESIGNS-335 §5 for the inclusion list); drop browser-chrome, form, and mockup-specific rules.
  3. Wrap both in an Astro component with the `Props` interface from DESIGNS-335 §5 (`variant: 'animated' | 'static'`, `class?: string`).
  4. Add `data-testid` attributes at the hooks defined in DESIGNS-335 §12.
  5. Default `variant="animated"`.
  6. Implement the `variant="static"` override rules (opacity + animation: none overrides for the static case).
- **Exit**:
  - File compiles (Astro build succeeds).
  - Manually rendering `<LitCropWordmarkMorph />` in a test page shows the same animation as `docs/mockups/335-desktop.html`.
  - Rendering with `variant="static"` shows the final held state with no animation.
  - `grep -c 'data-testid' src/frontend/src/components/brand/LitCropWordmarkMorph.astro` ≥ 6.

---

### T-335-03 — Modify `AuthLayout.astro` — force earthy theme + lift body cap

- **Size**: M
- **Dep**: –
- **Files**: `src/frontend/src/layouts/AuthLayout.astro`
- **Description**:
  1. Add `data-theme="earthy"` and `class="auth-route"` to the `<html>` element. The existing theme bootstrap script (inline) should be bypassed or adjusted so it does not overwrite the earthy attribute when the user has another theme stored in localStorage — on auth pages the attribute is forced.
  2. Remove the emoji-brand header (🌾 + "LitCrop" text at `AuthLayout.astro:50`). The morph component will provide branding on login/signup pages.
  3. Add a scoped `<style>` block with a `.auth-layout-body` class that overrides `body { max-width: 480px }` with `max-width: none` and removes padding.
  4. Wrap the slot in a `<main class="auth-main">` with `min-height: 100vh; display: grid; place-items: stretch;` to let child pages use the full viewport.
- **Exit**:
  - Opening `/login` in dev shows the earthy palette applied (cream background, sage primary button, forest-ink text).
  - Desktop viewport (≥769px) is full-width, not capped at 480px.
  - Mobile viewport (≤480px) unchanged visually for auth pages; `body` still looks like a phone column because the content is narrow by default.
  - `/profile` and other authenticated routes still honor the user's theme preference (not forced to earthy).

---

### T-335-04 — Modify `login.astro` — render the morph as hero

- **Size**: M
- **Dep**: T-335-02, T-335-03
- **Files**: `src/frontend/src/pages/login.astro`
- **Description**:
  1. Import `LitCropWordmarkMorph` from `../components/brand/LitCropWordmarkMorph.astro`.
  2. Replace the existing emoji-brand + `LoginForm` layout with the split structure from DESIGNS-335 §7:
     - Mobile: stacked (hero on top, form below)
     - Desktop (≥769px): side-by-side 60/40 split
  3. Add a scoped `<style>` block for `.login-split`, `.login-hero`, `.login-form-panel`, `.login-card`, and the responsive media query.
  4. Preserve the existing `LoginForm client:load` island and `Toast client:load` unchanged.
  5. The `<h1>` "Welcome to LitCrop" and `<p class="sub">` subtitle read from i18n keys (`auth.login.title`, `auth.login.subtitle`). If those keys don't exist yet in `/lib/i18n`, add them for EN and JA.
- **Exit**:
  - `/login` renders the animated hero + login form in the split layout.
  - Mobile width (≤768px): hero stacks above form.
  - Desktop width (≥769px): hero on left 60%, form on right 40%.
  - Existing auth flow still works end-to-end (type credentials → redirect to `/profile` or return URL).
  - EN and JA i18n both render correctly (subtitle + title).

---

### T-335-05 — Verify existing tests still pass

- **Size**: S
- **Dep**: T-335-04
- **Files**: (none modified — test invocation only)
- **Description**: Run the existing 790+ Vitest test suite to confirm no regressions.
  ```bash
  cd src/frontend && npx vitest run --reporter=verbose
  ```
  If any `login.astro` snapshot tests fail, regenerate them via `npx vitest run -u` and verify the new snapshots are correct (they should be, since the structural change is intentional).
- **Exit**:
  - All 790+ tests pass (or pass after deliberate snapshot regeneration for `login.astro`).
  - No Preact/Astro console errors during test runs.

---

### T-335-06 — Manual QA: responsive, a11y, reduced-motion, i18n

- **Size**: M
- **Dep**: T-335-05
- **Files**: (none — manual verification)
- **Description**: Work through the manual test checklist from DESIGNS-335 §12. Document findings in `docs/feedback/REVIEW-FINDINGS-335-MVP.md` (following the Beta-11 convention).
  - [ ] Chrome/Safari/Firefox at 1920, 1024, 768, 480, 360 px widths
  - [ ] Morph animation runs clean in all 3 browsers
  - [ ] Enable OS "Reduce motion" → verify static final state
  - [ ] Log in with test credentials → verify Cognito flow unchanged
  - [ ] Tab through the page → focus reaches all form inputs in order
  - [ ] Switch to JA locale → form + button text translate; wordmark + tagline stay English
  - [ ] Lighthouse a11y audit → no regressions vs current login baseline
  - [ ] Measure FCP via Chrome DevTools → within 50ms of current login
- **Exit**:
  - `docs/feedback/REVIEW-FINDINGS-335-MVP.md` file exists with findings
  - All checklist items ticked or documented as blockers

---

### T-335-07 — Create feature branch + open PR

- **Size**: S
- **Dep**: T-335-06
- **Files**: (branch + PR metadata)
- **Description**:
  1. `git checkout -b feature/335-login-wordmark-morph` from `develop`
  2. Cherry-pick or apply all T-335-01 through T-335-06 changes on that branch
  3. Run `/cc-pr-create` to draft a PR to `develop`
  4. PR description references #335 and all the rev-N commits
- **Exit**:
  - PR open on GitHub
  - CI checks green
  - PR description links back to REQUIREMENTS-335, ARCHITECTURE-335, DESIGNS-335, PLANS-335

---

## 3. MVP Dependency Graph

```
T-335-01 (create dir)
       │
       ▼
T-335-02 (component)        T-335-03 (AuthLayout)
       │                           │
       └──────────┬────────────────┘
                  ▼
          T-335-04 (login.astro)
                  │
                  ▼
          T-335-05 (test suite)
                  │
                  ▼
          T-335-06 (manual QA)
                  │
                  ▼
          T-335-07 (branch + PR)
```

T-335-02 and T-335-03 are **independent** and can run in parallel. Everything else is linear.

---

## 4. Production-Scope Task List (not in MVP)

These are deferred per ARCHITECTURE-335 §6 scope progression. They unlock only after MVP ships and is verified in staging.

### T-335-P1 — Static `LitCropWordmark.astro` component

- **Size**: S
- **Description**: Create a sibling component that renders *only* the final held state (crop icon + typographic wordmark). Reuses the same SVG markup as the morph but without any animation classes. Used in splash screens, 404 pages, loading states, error pages.
- **Exit**: Component compiles; reused in at least one additional page.

### T-335-P2 — Reuse wordmark in 404 + loading splash

- **Size**: M
- **Dep**: T-335-P1
- **Description**: Identify the 404 page and any loading splash surfaces; render `<LitCropWordmark />` as a branded element on each.

### T-335-P3 — Export brand SVG to `public/brand/litcrop-wordmark.svg`

- **Size**: S
- **Description**: Extract the static wordmark SVG markup as a standalone file in `public/brand/` for use in:
  - OpenGraph image (`og:image`)
  - README marketing
  - Non-Astro contexts (e.g., GitHub issue comments, social posts)
- **Exit**: File exists; `<img src="/brand/litcrop-wordmark.svg">` renders in a test page.

### T-335-P4 — Visual regression test via Playwright

- **Size**: L
- **Description**: Add a Playwright test that captures a fixed-viewport screenshot of `/login` at the final held state and compares against a baseline. Runs in CI; flags pixel drift beyond threshold.
- **Exit**: Test added; baseline committed; runs in CI workflow.

### T-335-P5 — Consider JA subtitle under wordmark

- **Size**: M
- **Description**: Design review: should `リットクロップ` appear beneath the wordmark for JA locale? Decision is open (REQUIREMENTS-335 §8 D-4). If yes, implement as an optional prop; if no, close out the open decision.

---

## 5. Validation Across All Tasks

Every MVP task must pass these gates before marking complete:

- [ ] No new npm dependencies added (NFR-1)
- [ ] No new AWS services or costs (project budget constraint)
- [ ] Zero code in `src/api/` (frontend-only change)
- [ ] All changes contained to `feature/335-login-wordmark-morph` branch
- [ ] `make sync` pre-commit hook passes (multi-AI config sync)

---

## 6. Effort Estimate Summary

| Phase | Tasks | Effort |
|-------|-------|--------|
| MVP (Track B) | T-335-01 through T-335-07 | ~1 day (0.5 day real coding + 0.5 day QA + PR) |
| Production polish | T-335-P1 through T-335-P5 | ~1–1.5 days, distributed across future sessions |

Total path from "mockups approved" to "shipped in main": ~1 day of focused work.

---

## 7. Next Step

Proceed to **Step 7** (cc-design — Planning, **STOP gate**) → `docs/PLANS-335.md`.
