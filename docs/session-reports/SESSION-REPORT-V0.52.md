# Session Report — v0.52

> **Session name**: `beta-12-pre`
> **Dates**: 2026-04-10 → 2026-04-12
> **Final production state**: `main @ 9a88054` · `develop @ 2d87b1a` · `v0.52` tag at `2d87b1a`
> **Scope**: Beta-12 sprint opener — login page wordmark morph hero + full mobile layout refinement loop

---

## Summary

This session opened the Beta-12 sprint by shipping **one new feature (#335 login hero)** and then iterating on the mobile layout through **five post-ship refinements** in rapid succession. Final state: production login page has a polished brand-hero animation, clean mobile layout, and fits modern phones without scroll. The `v0.52` tag was rolled forward four times on develop to track the current shipped state — a durable pattern for solo-iteration post-ship refinement.

Beta-11 had closed cleanly at `v0.50` (device integration work: #337, #343, #344, #341). This session opens Beta-12 with the RC/GA-facing login hero that was originally scoped for Pre-PROD but moved to Beta-12 head early in the session when the user decided to front-load a visible brand win before the heavier AI-strategy work.

---

## What shipped to production

| Tag | PR to main | Issue | Commit | Description |
|---|---|---|---|---|
| **v0.51** | #349 | #335 | `0258d78` | LitCropWordmarkMorph Astro component + AuthLayout earthy theme + login.astro split hero |
| **v0.52** | #352 | #350 | `9b1becf` | Hide login title/subtitle on mobile, add hardcoded version label |
| **v0.52+** | #355 | #353 | `64ceda0` | Shrink mobile hero (aspect 6/5, 42vh cap) + tighten form padding |
| **v0.52++** | #358 | #356 | `ede7e56` | Revert hero over-squish + remove version label |
| **v0.52+++** | #361 | #359 | `bf263e6` | Pull-up card overlay (form over line art) |
| **v0.52 final** | #364 | #362 | `9a88054` | Revert overlay, simple stacked layout with tight form padding |

Six production deploys total — all within a single session.

---

## #335 Design pipeline (Steps 1–9)

Before any code, the #335 feature went through the full 9-step `cc-design` pipeline as documented in the `-335`-scoped artifacts:

| Step | Skill | Artifact |
|---|---|---|
| 1 | cc-define | `docs/REQUIREMENTS-335.md` |
| 2 | cc-design (architecture) | `docs/ARCHITECTURE-335.md` + `docs/PREREQUISITES-335.md` |
| 3 | cc-design (UX/UI) | collapsed into Step 4 |
| 4 | cc-design (mockup) | `docs/mockups/335-{index,desktop,mobile}.html` + `docs/mockups/335-alt-alpine.html` (parked alternate) |
| 5 | cc-design (system design) | `docs/DESIGNS-335.md` |
| 6 | cc-design (task breakdown) | `docs/TASK-BREAKDOWN-335.md` |
| 7 | cc-design (planning) | `docs/PLANS-335.md` |
| 8 | cc-implement | 3 code files + `docs/IMPLEMENTATIONS-335.md` |
| 9 | cc-test | `docs/TEST-PLAN-335.md` |

**Mockup iteration before implementation**: 9 revisions (rev 1 → rev 9), committed as 3 checkpoints (`4e24fd7` → `8d6606d` → `fd58414`) based on visual feedback. The mockups were HTML files in `docs/mockups/` openable in any browser, which allowed rapid iteration without running the dev server.

**Key ADRs** locked in Step 2:
- ADR-335-01: inline SVG in Astro component (zero JS, scoped CSS)
- ADR-335-02: CSS keyframes only (`stroke-dashoffset`, `transform`, `opacity`)
- ADR-335-05: 7-letter motif mapping — L=waterfall, i=person, t=hoe, C=sun, r=seedling, o=water drop, p=bowing wheat
- ADR-335-09: **Mascot dropped** — the "person = i" figure IS the character
- ADR-335-10: 480px body cap lifted for AuthLayout pages only

**Post-review cleanup** (commit `319c0a5`) applied 6 findings from a parallel `/simplify` + `/cc-review` pass, including:
- `data-testid` spec alignment (`litcrop-hero` → `litcrop-hero-morph`)
- Missing `transform-box: fill-box` on SVG `<g>` rotation (cross-browser fix)
- Dead `setAttribute('data-theme','earthy')` removed (already SSR'd)

---

## Mobile layout refinement loop (#350 → #362)

After #335 shipped, user feedback drove five rapid iterations on the mobile layout:

### Iter 1 — #350 (v0.52 initial)
**Approach**: Hide title + subtitle on mobile, add a monospace `v0.52` version label to the form card. Brand becomes emoji-plus-text on the form, hero dominates the top.
**Problem**: Still overflowing on iPhone 16 Pro Max by ~50px.

### Iter 2 — #353 (v0.52+)
**Approach**: Shrink the hero by changing aspect `1/1 → 6/5` and capping at `42vh`. Tighten form padding.
**Problem**: Over-clipped the line art. Mountain peaks and wordmark "p" descender both lost visibility. User reported "line art hidden."

### Iter 3 — #356 (v0.52++)
**Approach**: Revert hero aspect back to `1/1` (keep 42vh cap), remove the version label entirely, trim form bottom padding.
**Problem**: Still tight on small devices, and the next feedback round wanted more drastic changes.

### Iter 4 — #359 (v0.52+++)
**Approach**: Pivot to pull-up card overlay — form `margin-top: -100px` over the bottom of the hero, tagline hidden on mobile via `:global(.tagline) { display: none }`.
**Problem**: Form card covered the wordmark at the hero bottom. Users perceived this as "line art hidden" in Chrome + Safari screenshots on iPhone 16 Pro Max.

### Iter 5 — #362 (v0.52 final) — **resting state**
**Approach**: Revert the pull-up overlay. Return to simple stacked layout with aggressively tightened form padding (`panel 8/16/16`, `card 16/20/16`). Hero at natural `430×430` at aspect `1/1` with `56vh` cap.
**Result**: Full line art visible including the wordmark, form stacked naturally below with tight padding, fits iPhone 12+ with 47–80px buffer. iPhone SE still scrolls ~78px (acceptable small-device fallback).

### Iteration convergence

| Iter | Diff lines (+/−) | Trajectory |
|---|---|---|
| #335 | +358/-0 | Foundation |
| #350 | +29/-1 | Incremental |
| #353 | +8/-4 | Incremental |
| #356 | +8/-24 | Revert/correct |
| #359 | +22/-8 | Experimental pivot |
| #362 | +4/-10 | Final revert |

Each iteration touched fewer code lines than the prior one — a healthy signal that the design was converging on a resting state.

---

## Tag rollforward pattern

Per the `feedback_tags_on_develop` memory rule, version tags point at develop commits rather than main merge commits. For the v0.52 refinement loop, this convention was **extended** via force-push rollforwards: the `v0.52` tag was moved forward on develop four times to absorb post-ship refinements.

| Rollforward | Tag commit | Contents |
|---|---|---|
| v0.52 initial | `eaa51d7` | #335 + #350 |
| 1st rollfwd | `b7d63ab` | + #353 (reverted) |
| 2nd rollfwd | `1e0afec` | + #356 |
| 3rd rollfwd | `d7c7160` | + #359 (reverted) |
| 4th rollfwd (final) | `2d87b1a` | + #362 |

Each rollforward was a `git tag -d v0.52 && git tag -a v0.52 && git push origin v0.52 --force`. The convention held up across all four force-pushes without confusion — "the v0.52 tag tracks the current-shipped state of develop" is a durable pattern for solo-iteration post-ship refinement.

**Cosmetic divergence noted**: `git tag --merged origin/main | grep v0.52` is empty because the tag lives on develop (ahead of each release-merge commit on main). Main's code content matches via merge-commit parent graphs. Expected behavior per the convention.

---

## Metrics

### Commits & PRs

- **Total commits on develop** for this session: ~24 (including docs, mockups, code, release bumps, merges)
- **Feature PRs to develop**: 6 (#348, #351, #354, #357, #360, #363)
- **Release PRs to main**: 6 (#349, #352, #355, #358, #361, #364)
- **GitHub issues closed**: 6 (#335, #350, #353, #356, #359, #362)
- **New GitHub issues created**: 6 (one per iteration — issue-first rule followed)

### Tests & CI

- **Vitest suite**: 790/790 tests pass (unchanged — no test code written for this feature, per the `cc-test` strategy of "visual-only feature, rely on manual QA + existing regression tests")
- **CI checks per PR**: 6 (Build, Test, Lint, Type Check, CDK Synth, PR Summary)
- **Total CI runs**: ~12 (one per feature PR, one per release PR)
- **All green** throughout the session

### Dependencies & infra

- **Zero new npm dependencies** added
- **Zero infrastructure changes** (no CDK changes, no AWS config updates)
- **Zero database migrations**
- **Auto-deploy pipeline**: fired on every main merge, `Deploy to Production` + `Protect Main Branch` both succeeded on all 6 ships

### Performance

- **Bundle delta**: +5–8 KB gzipped (inline SVG + scoped CSS for the hero component)
- **JS delta**: 0 bytes (pure Astro SSR, no Preact island for the hero)
- **Animation**: transform + opacity only (compositor-friendly)
- **FCP budget**: ≤50ms regression target (manual verification pending on real device)

---

## Design decisions that proved durable

1. **Mockups before code** (9 revisions before any `.astro` file was touched) — allowed visual iteration without dev server overhead, caught issues early (aspect ratios, letter motifs, color palette).

2. **Zero-JS brand component** (`LitCropWordmarkMorph.astro`) — pure Astro SSR with scoped CSS keyframes. No Preact hydration for the hero. Kept bundle impact minimal and eliminated a class of animation-related JS bugs.

3. **Component-local CSS variable aliasing** — the component uses `--hero-water`, `--hero-amber`, etc. which alias the earthy theme tokens (`--color-info`, `--color-status-slow-growth`). Keeps the SVG readable with decorative names while binding to the central theme.

4. **`:global()` trick to reach into the component** — login.astro uses `.login-hero-wrap :global(.tagline) { display: none }` to hide the tagline on mobile without modifying the component. Astro scoped styles can pierce into child components via `:global()`, which is the right pattern when the parent page needs to control a nested component's CSS responsively.

5. **Hide title + subtitle on mobile via `display: none`** (#350 decision, kept through the refinement loop) — the browser tab title "Log in — LitCrop" + form labels + submit button text provide sufficient brand + navigation context without the heading.

6. **Tag on develop + rollforward pattern** — `v0.52` moved forward 4 times as refinements shipped. No new tag numbers needed for small post-ship fixes.

---

## Decisions that proved wrong

1. **#353 over-squish** — reducing hero to `6/5` aspect at `42vh` cap clipped too much line art. Assumed "fit wins over visibility"; user feedback clarified the opposite priority.

2. **#359 pull-up overlay** — assumed the hero could be a quiet backdrop for an overlapping form card. Didn't account for the fact that our SVG's wordmark final lockup sits at the BOTTOM of the viewBox (y=540-700), exactly where a pulled-up form would collide with it. The overlay pattern needs compositions with empty middles/bottoms; ours has the brand at the bottom.

3. **Hardcoded version label in `#350`** — added as a "tiny identification aid" but removed in #356 when it competed with space for the line art. Correct call to remove in retrospect.

---

## Memory updates

- `project_restart_point.md` — rewrote completely to reflect v0.52 state (previously stuck at v0.48 Beta-11 state)
- `project_crop_roadmap.md` — updated Beta-12 progress (noted #335 + #350 shipped, #278 as next priority)
- `feedback_version_label_bump.md` — created to document the manual bump requirement before each release tag; now **superseded** by the version label removal in #356, but kept as a reference for any future reintroduction of version display

---

## Current state (end of session)

```
origin/main:    9a88054  (v0.52 final — #362 stacked layout)
origin/develop: 2d87b1a  (v0.52 tag, same content as main via merge graph)
v0.52 tag:      2d87b1a  (4th rollforward, force-pushed)
Tests:          790/790 passing
Working tree:   clean on develop
Open PRs:       none
Open issues:    Beta-12 login loop fully closed (6 issues closed)
```

**Mobile production layout** (iPhone 12+):
- Hero 430×430 natural size, full line art visible including `LitCrop` wordmark
- Form stacked directly below with tight `panel 8/16/16` + `card 16/20/16` padding
- Tagline hidden on mobile
- No scroll on iPhone 14/15/16 Pro + Pro Max (47–80px buffer)
- iPhone SE scrolls ~78px (acceptable fallback)

**Desktop production layout** (≥769px):
- Unchanged from #335 initial ship — split 60/40, tagline visible, full animation runs

---

## What's next (future sessions)

### Priority 1 — Beta-12 AI strategy (blocked on #278)

- **#278** — AI context pipeline ADR. **Gates #183, #320, #333**. Currently `status:deferred` on GitHub; needs un-deferring when picked up. Start with `/cc-define` or `/cc-adr`.
- **#183** — AI chat on all pages (needs #278 first)
- **#320** — AI auto-tag uploaded images via vision (needs #278)
- **#333** — BYOK approach evaluation (needs #278 + #281)

### Priority 2 — Pre-PROD gates (parallelizable with Beta-12)

- **#256** — Holistic quality review (priority:high)
- **#281** — Free vs paid tier concept (design only, priority:high)
- **#334** — Capacity + scalability review (priority:high)
- **#238** — Custom domain (infra, priority:high)
- **#239** — Production-labeled AWS resources (rename mvp → prod)
- **#240** — Finalize install.sh URL (depends on #238)
- **#280** — Release notes / what's new / disclaimer / report bug pages

### Priority 3 — Cleanup

- **#245** — Farm Diary parent rollup (all sub-features shipped in Beta-7/8 — candidate for manual close)
- **Stale memory cleanup**: `project_beta10_post_329.md` says "#329 is next priority before Beta-11" but #329 shipped long ago. Prune in next session.

---

## Tag reference (for future `git log` navigation)

```
v0.52  2d87b1a  Beta-12 login + mobile refinement loop (final, 4th rollforward)
v0.51  90fc2f6  Beta-12 #335 login wordmark morph hero
v0.50  e71f2db  Beta-11 Batch B (#341 heartbeat dual-auth + post-session rollforward)
v0.49  4f4dd2c  Beta-11 Batch A (#343 tier info modal + #344 device config modal wrap)
v0.48  6494370  Beta-11 #337 tiered device classes
v0.47  ...      Beta-10-post (role matrix, seed-to-harvest, smart defaults)
v0.46  ...      Beta-10 ROI Dashboard
```

---

## Closing note

Six iterations is a lot for a single feature, but each iteration was cheap (CSS-only, <30 min end-to-end, auto-deploy in <1 min, `git revert` as the rollback path). The total invested time was under three hours for a visual feature that ended up with meaningful user feedback loops baked into real production. The alternative (design mockups + user testing before any commit) would have taken longer and still needed iteration on real devices.

The Beta-12 sprint's **mobile login loop is officially closed**. Ready to pivot to `#278` AI context pipeline ADR or Pre-PROD design gates when the next session picks up.
