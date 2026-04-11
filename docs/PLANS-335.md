# PLANS — #335 Login Page Wordmark Morph (Scope-Leveled Execution)

> **Status**: Step 7 (cc-design — Planning) — STOP gate reached — 2026-04-10
> **Pipeline**: 1 ✅ → 2 ✅ → 3+4 ✅ → 5 ✅ → 6 ✅ → **7 (STOP)** → 8 → 9
> **Source**: `docs/TASK-BREAKDOWN-335.md`, `docs/DESIGNS-335.md`, `docs/ARCHITECTURE-335.md`
> **Scope progression** (from ARCHITECTURE-335 §6): **PoC → MVP → Production**

---

## 1. Scope Levels (3 tiers)

### PoC — **COMPLETE** ✅

- **Goal**: Prove the scenery → wordmark morph concept in isolation, reviewable in any browser without running the dev server
- **Deliverable**: `docs/mockups/335-{index,mobile,desktop}.html` — self-contained HTML + SVG + CSS
- **Status**: **Shipped** across 3 commits:
  - `4e24fd7` rev 2 — initial 4 motifs, draft visual
  - `8d6606d` rev 3+4 — water drop o, final brand lockup, snow peak, tagline
  - `fd58414` rev 5–9 — 3-layer mountain ridges, font role fix, tagline centering, right-end descent fix
- **User sign-off**: Confirmed at `fd58414` ("good. let's commit these for now as check point")
- **Exit criteria met**: ✅ All letters resolve to recognisable motifs, ✅ earthy palette applied, ✅ reduced-motion fallback, ✅ stakeholder approved

---

### MVP — **READY TO START** ⏳

- **Goal**: Land the approved morph into the real login page as a functioning Astro component, replacing the emoji-brand placeholder
- **Branch**: `feature/335-login-wordmark-morph` (to be created)
- **Tasks**: T-335-01 through T-335-07 (from TASK-BREAKDOWN-335.md)
- **Effort estimate**: ~1 day focused work
- **Dependencies**: none — all prerequisites (earthy token audit, ADR approvals, mockup sign-off) are satisfied
- **Exit criteria**:
  - [ ] `LitCropWordmarkMorph.astro` renders identically to the committed mockup
  - [ ] `/login` uses earthy theme (forced, not user-preference)
  - [ ] Split layout on desktop (≥769px), stacked on mobile
  - [ ] Existing Cognito auth flow works unchanged
  - [ ] 790+ existing tests pass
  - [ ] EN and JA i18n pass
  - [ ] WCAG AA contrast verified on earthy palette
  - [ ] `prefers-reduced-motion` honoured
  - [ ] Zero new npm dependencies
  - [ ] FCP within 50ms of current login baseline
  - [ ] PR opened from feature branch to `develop` with CI green

---

### Production — **DEFERRED** 🔮

- **Goal**: Elevate the wordmark to a reusable brand asset across the platform
- **Tasks**: T-335-P1 through T-335-P5
- **Effort estimate**: ~1–1.5 days, distributed across future sessions
- **Dependencies**: MVP must ship and be verified in staging first
- **Exit criteria**:
  - [ ] Static `LitCropWordmark.astro` variant exists
  - [ ] Reused in at least 2 additional surfaces (404, splash, loading)
  - [ ] `public/brand/litcrop-wordmark.svg` exported
  - [ ] Playwright visual regression test in CI
  - [ ] JA subtitle decision resolved (implement or close the open question)
  - [ ] New OpenGraph image uses the wordmark

**Recommendation**: do not commit to Production scope at this gate. Revisit after MVP ships and you've seen the hero live in staging.

---

## 2. Execution Sequence (MVP)

```
Day N · morning (0.5 day)
├── T-335-01  [S]  create src/components/brand/ directory             →  5 min
├── T-335-02  [L]  LitCropWordmarkMorph.astro (extract from mockup)   →  3 h
└── T-335-03  [M]  AuthLayout.astro (earthy theme + body cap lift)    →  1 h
                   (T-335-02 and T-335-03 in parallel)

Day N · afternoon (0.5 day)
├── T-335-04  [M]  login.astro (split layout + import)                →  1.5 h
├── T-335-05  [S]  run Vitest suite, regenerate snapshots if needed   →  30 min
├── T-335-06  [M]  manual QA (responsive, a11y, i18n, reduced-motion) →  1.5 h
└── T-335-07  [S]  feature branch + PR open                           →  30 min
```

**Total wall time**: ~1 day of focused work. No blockers identified.

---

## 3. Risks & Mitigations (MVP-specific)

Carried over and refined from ARCHITECTURE-335 §8:

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| R1 | Earthy token authoring expands MVP scope | **Retired** | — | Tokens already exist in `tokens.css` per user audit at Step 2 STOP gate |
| R7 | Theme bootstrap script in AuthLayout conflicts with forced earthy | Low | Low | T-335-03 explicitly addresses — bypass the bootstrap for auth routes |
| R7b | `body { max-width: 480px }` from global.css fights the new layout | Low | Low | T-335-03 scopes an override rule to `.auth-layout-body` in the layout file |
| R9 | Brush Script MT tagline font unavailable on Linux/ChromeOS (falls through to generic cursive) | Medium | Low | Acceptable — the fallback chain works; generic cursive is tolerable for < 1% of users |
| R10 | Snapshot test for `login.astro` fails after structural change | **Expected** | Low | T-335-05 regenerates snapshots deliberately — this is not a regression |
| R11 | Lighthouse a11y score drops below current baseline | Low | Medium | T-335-06 includes Lighthouse check as an explicit gate; remediate before merging if it drops |

---

## 4. Rollback Plan

Per ADR-335-10 and user's "revert-back-possible" directive:

### Instant rollback (before merge to `develop`)
- Abandon the feature branch: `git checkout develop && git branch -D feature/335-login-wordmark-morph`
- No trace in shared history

### Post-merge rollback
- `git revert <merge-commit-sha>` on `develop` — creates an undo commit
- Reverts all 4 modified/created files in one operation
- No database migrations, no config changes, no infra touch → rollback is purely code

### Partial rollback (e.g., keep component, revert layout)
- Revert specific files: `git revert <commit> -- src/frontend/src/pages/login.astro`
- The component file stays, only the page layout reverts
- Useful if the morph is fine but the split layout needs rework

---

## 5. Decision Points Remaining at This Gate

These are carry-overs from `docs/PREREQUISITES-335.md` that remain open for Production-scope resolution (NOT blocking MVP):

| # | Question | Decision needed by | Default if not answered |
|---|---------|---------------------|-------------------------|
| D-4 | JA subtitle (リットクロップ) under wordmark? | Before T-335-P5 (Production) | Not added |
| D-7 | Ambient mascot (mole/lumberjack) as separate decoration? | ADR-335-09 says no — close out or re-open via new issue | Remain closed |
| D-8 | Visual regression thresholds (pixel diff tolerance)? | Before T-335-P4 (Production) | Not enforced |
| D-9 | Replay button on login page for user-triggered re-animation? | Before MVP T-335-04 if you want it | Not included (scope cut) |

**None of these block MVP.** They're flagged here only so they don't get lost.

---

## 6. Budget Impact

- **AWS cost delta**: $0.00 — no new services, no new data transfer, no new compute
- **Build time delta**: <1 second (Astro compiles one new component file)
- **Bundle size delta**: +5–8 KB gzipped (SVG markup + CSS keyframes inlined in the component; no JS added)
- **Project budget ceiling**: ~$1.18/mo → unchanged → compliant

---

## 7. Verification Checklist — Proceed?

Before resuming with `/cc-implement` (Step 8), user should confirm:

- [ ] Mockups at `docs/mockups/335-*.html` still represent the desired visual design
- [ ] ADRs in `ARCHITECTURE-335.md` are still accepted (especially ADR-335-10 body-cap lift)
- [ ] Token audit at Step 2 STOP gate is still valid (earthy tokens in `tokens.css` are complete)
- [ ] MVP effort estimate (~1 day) fits the session budget
- [ ] Feature branch `feature/335-login-wordmark-morph` is acceptable
- [ ] Rollback via `git revert` is acceptable
- [ ] Production-scope tasks remain deferred until MVP ships

---

## 8. STOP Gate — User Review Required

**Do not proceed to Step 8 (cc-implement) until the user explicitly resumes.**

**Decision options**:
- **Proceed** → resume with `/cc-implement` to start Step 8. The pipeline will execute T-335-01 through T-335-07 using the my-builder agent, with my-reviewer validation at the end.
- **Proceed → /cc-test first** → if you want a dedicated test strategy doc before implementation, run `/cc-test` to produce `docs/TEST-PLAN-335.md` (not strictly required for this PoC-to-MVP path but available)
- **Revise** → request changes to specific tasks in `TASK-BREAKDOWN-335.md`, or to the effort estimate, or to the scope-progression tiers
- **Redesign** → system design (Step 5) needs rework → re-enter at Step 5 with `/cc-design`
- **Rearchitect** → architecture assumptions need to change → re-enter at Step 2 with `/cc-design`

**Recommendation**: proceed with `/cc-implement` — everything is frozen and ready. The remaining unknowns (R9 font fallback, R11 Lighthouse) are Low-impact and can be remediated in T-335-06 QA without blocking the build.

---

## 9. Iteration Log

### Iteration 1 — 2026-04-10
- **Trigger**: initial cc-design run for #335
- **Entry point**: Step 2 (Architecture) through Step 7 (Planning)
- **What was produced**:
  - `docs/REQUIREMENTS-335.md` (Step 1 via cc-define)
  - `docs/ARCHITECTURE-335.md` + `docs/PREREQUISITES-335.md` (Step 2)
  - `docs/mockups/335-*.html` (Steps 3+4 collapsed per user direction)
  - `docs/DESIGNS-335.md` (Step 5)
  - `docs/TASK-BREAKDOWN-335.md` (Step 6)
  - `docs/PLANS-335.md` (Step 7 — this file)
- **User interventions along the way**:
  - 9 mockup revisions (rev 1 through rev 9) refining motifs, animation, fonts, mountain rendering, and tagline position
  - Committed as 3 checkpoints: `4e24fd7`, `8d6606d`, `fd58414`
- **What's preserved**: everything — full audit trail from requirements to plan

---

## 10. Pipeline Status Snapshot

| Step | Skill | Artifact | Status |
|------|-------|----------|--------|
| 1 | cc-define | `docs/REQUIREMENTS-335.md` | ✅ |
| 2 | cc-design (architecture) | `docs/ARCHITECTURE-335.md`, `docs/PREREQUISITES-335.md` | ✅ |
| 3 | cc-design (UX/UI) | (collapsed into Step 4) | ✅ |
| 4 | cc-design (mockup) | `docs/mockups/335-*.html` (committed) | ✅ |
| 5 | cc-design (system design) | `docs/DESIGNS-335.md` | ✅ |
| 6 | cc-design (task breakdown) | `docs/TASK-BREAKDOWN-335.md` | ✅ |
| 7 | cc-design (planning) | `docs/PLANS-335.md` (this file) | ✅ **STOP** |
| 8 | cc-implement | Feature branch + PR | ⏳ pending user |
| 9 | cc-review + cc-deploy | Merged to `develop`, then `main` | ⏳ pending |
