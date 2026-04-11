# TEST PLAN — #335 Login Page Wordmark Morph

> **Status**: Step 9 (cc-test) — 2026-04-10
> **Pipeline**: 1 ✅ → 2 ✅ → 3+4 ✅ → 5 ✅ → 6 ✅ → 7 ✅ → 8 ✅ → **9**
> **Branch**: `feature/335-login-wordmark-morph` (commits `7b3409f`, `ed74cbf`, `575a85c`, `319c0a5`)
> **Prior artifacts**: `docs/REQUIREMENTS-335.md`, `docs/ARCHITECTURE-335.md`, `docs/DESIGNS-335.md`, `docs/PLANS-335.md`, `docs/IMPLEMENTATIONS-335.md`

---

## 1. Purpose

Define WHAT to test for the #335 login hero feature and how test effort should be allocated across the MVP vs Production scope transition. Per cc-test policy, **this document does NOT write test code** — it plans the strategy; `/cc-implement` (in a separate session) writes any test code needed.

---

## 2. Test Pyramid for This Feature

This feature inverts the usual pyramid because it's **pure presentational markup**.

```
           ┌───────────────────────────────┐
           │  E2E / Visual Regression      │  ~70% of test value
           │  Playwright + axe-core        │  (Production scope)
           │  /login snapshot, a11y audit  │
           ├───────────────────────────────┤
           │  Integration                  │  ~20% of test value
           │  Astro build output, DOM      │  (Production scope)
           │  via jsdom or Playwright      │
           ├───────────────────────────────┤
           │  Unit                         │  ~10% of test value
           │  N/A for #335 — no logic      │
           └───────────────────────────────┘
```

### Why this is inverted

- The component is **zero-logic**: `variant` prop selection, inline SVG markup, scoped CSS. Unit tests would assert that strings equal strings.
- The 790 existing tests cover the Cognito auth flow (`LoginForm.tsx`) and the shared/api logic that **didn't change**. No regression risk there.
- Visual correctness, animation behavior, a11y, and cross-browser rendering are the real risks — all E2E/visual tests by nature.

---

## 3. Current Test Infrastructure

| Layer | Tool | Present? | Scope | Notes |
|-------|------|----------|-------|-------|
| Unit (logic) | Vitest | ✅ yes | `packages/*/src/__tests__`, `src/*/src/__tests__` | 790 tests in 37 files. Node environment. |
| Component (DOM) | jsdom | ❌ no | — | Would need to add; small cost |
| Component (Preact) | @testing-library/preact | ❌ no | — | Not currently used |
| Page snapshot (server) | Astro check + build | ✅ partial | Build-time compile errors only | `npm run build` catches syntax/type/SVG errors |
| Visual regression | Playwright | ❌ no | — | **Production scope add** |
| A11y audit | axe-core via Playwright | ❌ no | — | **Production scope add** |
| Manual QA | Template + checklist | ✅ yes | `docs/feedback/REVIEW-FINDINGS-335-MVP.md` | MVP gate |

---

## 4. Scope Partitioning: MVP vs Production

### MVP — what the current branch needs to ship

**Automated:**
- ✅ Existing 790 vitest suite — already passes post-integration
- ✅ `npm run build` — catches compile errors, type errors, SVG syntax errors
- ✅ `npm run typecheck` — validates `@litcrop/shared` + `@litcrop/api`

**Manual:**
- ⏳ `docs/feedback/REVIEW-FINDINGS-335-MVP.md` checklist — cross-browser, a11y, i18n, reduced-motion, performance

**Zero new automated tests required.** The feature has no new logic; all behavior that could break is either (a) pure visual (needs human eyes or Playwright), or (b) already covered by existing tests (Cognito, form validation).

### Production — what Track B needs to earn before merging to `main`

**New automated tests (all in Playwright — new dependency):**

1. **Visual regression baseline** for `/login`
   - Fixed viewport: 1440 × 900
   - Capture final held state (after animation completes, ~6s wait)
   - Compare against committed baseline with 0.2% pixel diff tolerance
   - Three browsers: Chromium, Firefox, WebKit

2. **Visual regression for `prefers-reduced-motion`**
   - `page.emulateMedia({ reducedMotion: 'reduce' })`
   - Snapshot at load + 200ms (no wait for animation)
   - Verify static final state matches the reduced-motion baseline

3. **A11y audit** via axe-core
   - Run on `/login` at load
   - Assert zero violations in WCAG 2.1 AA category
   - Run on `/register`, `/reset`, `/verify` too (backwards-compat guard)

4. **Backwards-compat smoke test** for sibling auth pages
   - Navigate to `/register`, `/reset`, `/verify`
   - Assert each page renders its `auth-card` + `auth-card__title`
   - Assert the existing form elements are present
   - This guards against future AuthLayout regressions breaking `variant="default"`

5. **Keyboard navigation test** (single-browser)
   - Navigate to `/login`
   - Tab through form fields
   - Assert focus order: email → password → show/hide toggle → submit → forgot link → signup link
   - Assert focus ring is visible (computed style has `box-shadow` or `outline`)

6. **Animation completes within budget** (single-browser)
   - Navigate to `/login`
   - Wait for `[data-testid="litcrop-hero-final"]` to have `opacity: 1` via `page.waitForFunction`
   - Assert total wait time ≤ 5500ms (the 5s timeline + 500ms slack)
   - This is the only time-based assertion; keep the slack generous to avoid flakiness

**Estimated effort**: 1 day (Production scope, separate from MVP).

---

## 5. Coverage Gap Analysis

### Pre-existing gaps (not introduced by #335)

| Gap | Severity | Proposed in this plan? |
|-----|----------|------------------------|
| No vitest environment for DOM rendering (jsdom) | Low | No — Playwright handles DOM concerns for #335 |
| No Preact component tests | Medium | No — LoginForm tests remain manual/integration via Playwright |
| No Astro page snapshot tests | Medium | Yes — Production scope adds Playwright page snapshots |
| No a11y tests in CI | High | Yes — Production scope adds axe-core |
| No visual regression in CI | High | Yes — Production scope adds Playwright snapshots |
| `packages/shared/dist/` can go stale causing direct `astro build` failures | Low | No — flag for separate issue, not scope of #335 |

### Gaps introduced by #335 itself

**None**. The feature adds pure markup; no new logic → no new unit-testable surface area. All reasonable test concerns fall into the "needs Playwright" Production bucket.

---

## 6. Regression Risk Map

| Area | Risk | Severity | Mitigation |
|------|------|----------|------------|
| AuthLayout `variant` split breaks signup/reset/verify | Backwards-compat failure | **HIGH** | Production backwards-compat smoke test. MVP: manual verification of all 4 auth pages during QA. |
| Forced earthy theme leaks to authenticated pages | Wrong theme after login | **HIGH** | Script is inline in AuthLayout only; authenticated pages use different layout. MVP: manual verification that `/profile` still renders the user's saved theme. |
| `html.auth-route body.auth-layout-body` CSS rule leaks | Layout breakage on non-auth pages | MEDIUM | Selector is specific; can't match without both classes. MVP: visual check on 3 non-auth pages. |
| SVG `transform-box: fill-box` behaves differently across browsers | Trees swing wildly on Firefox/Safari | MEDIUM | Added in post-review cleanup (319c0a5). MVP: manual verification in 3 browsers. Production: Playwright visual regression catches any delta. |
| Brush Script MT falls back to generic cursive on Linux/ChromeOS | Tagline looks different | LOW | Acceptable — fallback chain degrades gracefully. Production visual regression uses macOS baseline. |
| `aspect-ratio: 1/1` not supported on older browsers (< 2021) | Hero renders at 0 height | LOW | Astro build's browserslist targets modern browsers. MVP: manual check in latest 3 browsers. |
| Reduced-motion doesn't stop infinite animations | Trees still sway, flow still drifts for opt-out users | MEDIUM | Component's scoped `@media (prefers-reduced-motion: reduce)` block explicitly sets `animation: none !important` on `.flow`, `.waterfall-stream`, `.tree-pop`. MVP: manual verification with OS setting. Production: Playwright `emulateMedia` test. |
| Login form becomes unresponsive during the 5s animation | User clicks don't register | HIGH | Animation uses only transform + opacity (compositor-only, non-blocking). Form is a Preact island with its own event loop. MVP: manual verification. Production: Playwright test that fills form during animation succeeds. |

---

## 7. Test Architecture (Production scope)

### Framework: Playwright

**Rationale:**
- Real browser rendering (Chromium, Firefox, WebKit) — critical for SVG cross-browser coverage
- Built-in `emulateMedia` for reduced-motion, color-scheme, prefers-contrast
- Screenshot API with per-test baseline storage
- Integrates cleanly with axe-core via `@axe-core/playwright`
- Astro's official docs recommend Playwright for e2e

**New dependencies required** (Production scope, NOT MVP):
- `@playwright/test` — test runner + browsers (one-time download)
- `@axe-core/playwright` — a11y audits
- Total: 2 new dev dependencies

**Rejected alternatives:**
- **Cypress** — heavier runtime, no WebKit support without experimental flags
- **Puppeteer** — single-browser (Chromium only), misses Firefox/Safari regressions
- **jest-image-snapshot + jsdom** — no real rendering, false confidence for animations

### Test organization

```
src/frontend/
└── e2e/                                   ← NEW (Production scope)
    ├── playwright.config.ts
    ├── fixtures/
    │   └── baseline/                      ← committed baselines
    │       ├── login-desktop-chromium.png
    │       ├── login-desktop-firefox.png
    │       ├── login-desktop-webkit.png
    │       └── login-reduced-motion.png
    └── specs/
        ├── login-visual.spec.ts           ← visual regression
        ├── login-a11y.spec.ts             ← axe audit
        ├── login-reduced-motion.spec.ts   ← emulateMedia test
        ├── login-keyboard.spec.ts         ← focus order
        ├── login-animation-timing.spec.ts ← completion budget
        └── auth-backwards-compat.spec.ts  ← signup/reset/verify smoke
```

### Fixture strategy

- **No mocked Cognito** — Playwright tests hit a real dev server with a test-only Cognito pool OR use Playwright's `page.route()` to stub `/auth/*` API responses
- **No database mocking** — visual tests run against a static build (`npm run build` → `npm run preview`)
- **Baseline images committed to git** — approved baselines live in `fixtures/baseline/`; updates require explicit PR review

### Test data management

- No user accounts needed for visual regression
- One "test farmer" account for the animation-timing form-interaction test (if we run it against a real backend) — deferred decision
- Baseline images: ~200–400 KB each, committed as Git LFS candidates if the baseline set grows beyond 10

---

## 8. Non-Functional Testing

### Performance

**MVP** — manual measurement via Chrome DevTools:
- [ ] FCP on `/login`: ≤ +50 ms vs develop baseline (documented in REVIEW-FINDINGS-335-MVP.md)
- [ ] No layout shift (CLS ≈ 0)
- [ ] Animation runs at 60fps (DevTools Performance tab)

**Production** — Playwright Lighthouse integration (optional):
- Lighthouse audit baked into the visual regression test
- Assert Performance score ≥ current develop baseline

### Accessibility

**MVP** — manual + Lighthouse ad-hoc:
- [ ] Run Lighthouse a11y audit on `/login`
- [ ] Screen reader announcement of wordmark + tagline
- [ ] Keyboard focus order
- [ ] Reduced-motion verification (toggle OS setting)
- [ ] Contrast ratios on earthy palette (WCAG AA = 4.5:1 minimum)

**Production** — automated:
- axe-core via Playwright, zero-violations assertion
- Lighthouse in CI with minimum score threshold

### Security

**MVP + Production**: no security-specific tests added. Rationale:
- The component has no user input surface
- Props are strictly typed (union + string)
- Inline `<script is:inline>` reads only `localStorage.litcrop-locale` and writes only element attributes — no `innerHTML`, no `eval`, no fetch
- Existing CSP headers (unchanged by this feature) still apply
- No new backend routes, no new database writes

### Internationalization

**MVP** — manual via locale switcher:
- [ ] Form labels translate to JA
- [ ] Brand wordmark + tagline remain English (verified)
- [ ] No layout breakage with longer JA strings

**Production** — Playwright test: visit `/login?locale=ja`, assert form translates and wordmark stays English.

---

## 9. Flakiness Risk Assessment

| Test type | Flakiness risk | Mitigation |
|-----------|----------------|------------|
| Visual regression snapshots | **MEDIUM** | Per-browser baselines; 0.2% pixel tolerance; wait for `data-testid="litcrop-hero-final"` to reach full opacity before snapshot |
| Animation timing assertion | **HIGH** | Generous slack (500ms over the 5s budget); single-browser only; run with retries disabled to surface real regressions |
| A11y audits | LOW | Deterministic; axe-core rules are stable |
| Keyboard navigation | LOW | Focus order is deterministic given stable DOM |
| Backwards-compat smoke | LOW | Page-load assertions only, no animation interaction |
| Cross-browser font rendering | **MEDIUM** | Brush Script MT → fallback chain varies by OS. Use per-browser (not per-OS) baselines; accept small tagline rendering delta |

**Guardrails to keep the suite healthy:**
- Ban `waitForTimeout(ms)` — always use state-based waits (`waitForSelector`, `waitForFunction`)
- No `animationend` event reliance — use data-testid state changes instead
- Never mock `requestAnimationFrame` or `performance.now()`
- Re-baseline only on explicit PR label `visual-regression-baseline-update`

---

## 10. Framework Selection Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| MVP automated tests | **Existing Vitest suite only** | Zero new code, zero new deps, zero gaps from feature |
| MVP verification | **Manual QA template** | Pragmatic for visual-only feature |
| Production e2e | **Playwright** | Real browsers, emulateMedia, baked-in screenshot API |
| Production a11y | **axe-core via Playwright** | Zero-violation gate, industry standard |
| Production visual regression | **Playwright screenshots** | Per-browser baselines, deterministic |
| Unit testing for new code | **None required** | Feature has no logic |

---

## 11. Validation Checklist (my-reviewer alignment)

- [x] Test pyramid ratios documented and justified
- [x] Coverage gaps enumerated (pre-existing + feature-specific)
- [x] Regression risks mapped with severity and mitigation
- [x] Fixture strategy defined
- [x] Mock boundaries explicit
- [x] Framework choices aligned with project conventions (Vitest exists; Playwright is new but justified)
- [x] Flakiness risks acknowledged with guardrails
- [x] Non-functional testing (perf, a11y, security, i18n) scoped
- [x] Clear MVP vs Production partition — respects the NFR-1 "no new deps" at MVP level

---

## 12. Next Steps

### For MVP (this sprint, current branch)

1. **Complete manual QA** via `docs/feedback/REVIEW-FINDINGS-335-MVP.md`
2. **Resolve any findings** (fix inline or file issues per Issue-First Rule)
3. **Run `/cc-pr-create`** to open the PR to `develop`
4. **CI runs `npm run build` + `npm test`** — both already green locally

**No new automated tests required for MVP. No `/cc-implement` test session needed.**

### For Production scope (deferred, separate future session)

1. Add Playwright + axe-core as dev dependencies (first new deps for this project; worth an ADR)
2. Author the 6 spec files from §4 Production list
3. Capture per-browser baselines on a clean macOS VM
4. Integrate into CI workflow

Per cc-test policy:
> Test implementation MUST be a separate my-builder invocation from feature implementation — the my-builder instance that writes tests must not be the same instance that wrote the feature code

This means Production test code must be authored in a **fresh session** via `/cc-implement`, distinct from the session that wrote the feature code (the current session). Do not attempt to author Production tests from this session.

### Recommended sequence

```
Now (current session)   → /cc-pr-create → PR opened → manual QA → merge
Later (fresh session)   → /cc-implement (Production scope, test code only)
                         → 6 Playwright specs + baselines
                         → /cc-pr-create (separate PR)
```

---

## 13. Summary

**#335 MVP requires zero new automated tests.** The feature is pure markup with no logic surface; existing 790 vitest tests, `npm run build`, and the manual QA template together provide sufficient coverage for MVP exit.

**#335 Production needs real test investment**: Playwright visual regression + a11y audit + backwards-compat smoke. This is carved out as a separate scope to respect the MVP "no new deps" constraint and to be authored in a fresh `/cc-implement` session per cc-test policy.

The key risk this plan addresses is **backwards-compat for sibling auth pages** (signup, reset, verify) after the AuthLayout `variant` change. Manual QA covers this for MVP; Production Playwright smoke tests codify the regression gate.
