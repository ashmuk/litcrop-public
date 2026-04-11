# Review Findings — #335 MVP Manual QA

> **Template**: fill in during manual testing of `feature/335-login-wordmark-morph`
> **Target**: MVP exit criteria from `docs/PLANS-335.md` §2
> **Branch**: `feature/335-login-wordmark-morph`
> **Implementation docs**: `docs/IMPLEMENTATIONS-335.md`

---

## Setup

1. Check out the feature branch: `git checkout feature/335-login-wordmark-morph`
2. Build: `npm run build` (must pass clean)
3. Run dev server: `cd src/frontend && npm run dev`
4. Navigate to `http://localhost:<port>/login`

## Test Matrix

### Browsers (tick each)

- [ ] Chrome (latest)
- [ ] Safari (latest)
- [ ] Firefox (latest)

### Viewports

- [ ] 1920 × 1080 (desktop HD)
- [ ] 1440 × 900 (desktop standard)
- [ ] 1024 × 768 (tablet landscape)
- [ ] 768 × 1024 (tablet portrait — boundary of mobile/desktop split)
- [ ] 480 × 800 (mobile — phone column)
- [ ] 360 × 640 (small mobile)

## Functional Checks

- [ ] Morph animation plays on load (~5 seconds total runtime)
- [ ] Scenery draws in first (mountains → flow lines → field → trees → farmhouse → crop rows)
- [ ] Tagline "Little, Light and Lit, then Enlight" fades in during scenery phase
- [ ] 7 letter motifs stage in with visible stagger (L → i → t → C → r → o → p)
- [ ] Motifs fade out, scenery dims to ~30% opacity
- [ ] Final brand lockup (crop sprout icon + "LitCrop" typographic wordmark) fades in centered
- [ ] Final state holds indefinitely (no loop)
- [ ] Login form renders correctly beside/below the hero
- [ ] Email field focus ring visible (earthy focus color)
- [ ] Password field + show/hide toggle works
- [ ] "Forgot password?" and "Sign up" links route correctly
- [ ] Typing invalid credentials produces the existing error alert
- [ ] Typing valid credentials completes sign-in flow (redirect to /profile or return URL)

## Accessibility Checks

- [ ] Tab key reaches all form inputs in expected order (email → password → toggle → submit → links)
- [ ] Focus rings are visible on the earthy background
- [ ] Screen reader announces the SVG as "LitCrop — farming scenery morphs into the brand wordmark" (or similar)
- [ ] Screen reader does NOT announce the motif layer (it has `aria-hidden="true"`)
- [ ] Screen reader announces the final wordmark "LitCrop" and the tagline "Little, Light and Lit, then Enlight"
- [ ] Enable OS "Reduce motion" setting (macOS: System Settings → Accessibility → Display; Windows: Settings → Accessibility → Visual effects)
- [ ] Reload with reduced motion → verify the static final state appears immediately (no animation)
- [ ] Lighthouse a11y score on `/login` — record below

**Lighthouse score before rev 9 (baseline)**: _____________
**Lighthouse score after rev 9 (target: same or better)**: _____________

## Internationalization

- [ ] Switch locale to Japanese (set `localStorage.litcrop-locale = 'ja'` in DevTools, reload)
- [ ] Verify form field labels are translated (Email, Password → Japanese)
- [ ] Verify the error message text is translated
- [ ] Verify the "Welcome back" h1 stays English (known: Astro-rendered, not i18n'd)
- [ ] Verify the subtitle "Sign in to manage your farm" stays English (same reason)
- [ ] Verify the tagline "Little, Light and Lit, then Enlight" stays English (brand slogan)
- [ ] Verify the wordmark "LitCrop" stays English (brand name)

## Performance

- [ ] Open Chrome DevTools → Performance tab
- [ ] Record a page load of `/login`
- [ ] Capture FCP (First Contentful Paint)
- [ ] Compare to FCP of current production login (`develop` branch before merge)

**FCP before (develop baseline)**: _____________ ms
**FCP after (feature branch)**: _____________ ms
**Delta**: _____________ ms (target: ≤ +50 ms)

- [ ] Bundle size delta: `ls -la src/frontend/dist/login/` — record the index.html size
- [ ] Confirm no new JS chunks added (only SVG markup in the HTML)

## Responsive Layout

- [ ] At 1920px: hero on left 60%, form on right 40% — both visible without scrolling
- [ ] At 1024px: split still 60/40 — form card stays readable
- [ ] At 769px (breakpoint): layout transitions from split to stacked cleanly
- [ ] At 768px: stacked — hero on top (square, max 56vh), form below
- [ ] At 480px: stacked — hero still visible, form fills the column
- [ ] At 360px: stacked — no horizontal scroll, form usable
- [ ] Tap targets (buttons, links) ≥ 44px on mobile

## Cross-browser Snapshots (optional but recommended)

Capture a screenshot of the final held state in each browser at 1920px:

- [ ] Chrome: `/tmp/335-chrome-final.png`
- [ ] Safari: `/tmp/335-safari-final.png`
- [ ] Firefox: `/tmp/335-firefox-final.png`

Compare visually — they should be nearly identical modulo font rendering (Brush Script MT may fall through to different cursive fonts on different OS).

## Findings / Issues Discovered

Fill in any issues you find below. Per the cc-implement "Issue-First Rule", create a GitHub Issue for each one before deciding to fix-now or defer.

| # | Severity | Summary | Issue created? |
|---|----------|---------|----------------|
|   |          |         |                |
|   |          |         |                |
|   |          |         |                |

Severity scale: **blocker** (merge-blocking) / **high** (should fix in MVP) / **medium** (nice to fix) / **low** (defer to production scope)

## Sign-off

- [ ] All functional checks pass
- [ ] All accessibility checks pass
- [ ] Performance delta within budget
- [ ] No blocker issues discovered (or all blockers fixed and re-verified)
- [ ] Ready to open PR via T-335-07 (`/cc-pr-create`)

**Reviewer**: ________________
**Date**: ________________
**Decision**: [ ] Proceed to PR   [ ] Fix issues first   [ ] Escalate to cc-remediate
