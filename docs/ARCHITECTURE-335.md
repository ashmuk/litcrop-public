# ARCHITECTURE — #335 Polished Login Page + LitCrop Wordmark Morph

> **Status**: Step 2 (cc-design — Architecture) — 2026-04-10
> **Pipeline**: 1 ✅ → **2 (STOP gate)** → 3 → 4 (STOP) → 5 → 6 → 7 (STOP) → 8 (STOP) → 9
> **Prerequisites**: `docs/REQUIREMENTS-335.md` (Step 1 complete)
> **Stakeholder review**: pending at §11 STOP gate

---

## 1. Context Recap

The LitCrop frontend is an **Astro 5 + Preact islands** SPA with CSS variables for theming, mobile-first, no Tailwind, no animation libraries. Step 1 requirements split delivery into:

- **Track A** — a standalone `docs/mockups/litcrop-wordmark-morph.html` mockup (reviewable in isolation)
- **Track B** — integration into `login.astro` + `AuthLayout.astro` with earthy theme forced

This document defines the architecture for both tracks and the scope-progression staging.

---

## 2. Architectural Constraints Discovered

These were surfaced during the Step 2 codebase audit and are load-bearing:

### C-A1 — Mobile-first 480px hard cap
`src/frontend/src/styles/global.css:37` sets `body { max-width: 480px; margin: 0 auto }`. The entire UI renders in a **centered phone-width column** even on desktop. This means:
- **No landscape panorama hero** (the `destination-earth-mockup.html` 1200×700 composition cannot be copied literally)
- The morph must use a **portrait-tall canvas** — nominally 480px × 600–720px
- Letter-forms must fit in ~480px width; tight glyphs OR a two-line "Lit" / "Crop" layout
- Composition flows **vertically**: mountain top → waterfall down → field middle → wordmark bottom

### C-A2 — Earthy theme is currently ROI-scoped only
`components.css:2775` defines `[data-theme="earthy"]` with only **ROI-dashboard tokens** (`--color-roi-positive`, `--color-roi-negative-bg`, etc.). It does **not** override core semantic tokens (`--color-bg`, `--color-primary`, `--color-text`, `--color-surface`).

Either:
- (a) The core earthy tokens live in `src/frontend/src/styles/tokens.css` (permission-restricted during this session — **audit required**)
- (b) They do not exist, in which case `data-theme="earthy"` today falls through to the default light palette for everything except ROI numbers

**This is the #1 prerequisite for the user to confirm** — see `docs/PREREQUISITES-335.md`.

### C-A3 — Tech stack is fixed
Astro 5 + Preact 10 + CSS variables. No Tailwind, no Framer Motion, no Lottie, no Radix/shadcn. Any architectural choice must respect this.

### C-A4 — Existing reduced-motion baseline
`global.css:157-164` + `auth.css:330` already apply `prefers-reduced-motion: reduce` globally. Our animation only needs to author its *non-reduced* keyframes — the browser auto-neutralises them for opted-out users.

### C-A5 — Astro island model
LoginForm is a Preact island (`client:load`). The morph animation is presentation-only (no user state), so it should render as a **static Astro component with inline SVG** — no island, no JS bundle impact.

---

## 3. Decisions Log (ADR-style)

### ADR-335-01 — Rendering: Inline SVG inside an Astro component
- **Decision**: Wordmark morph is an inline `<svg>` block inside `src/frontend/src/components/brand/LitCropWordmarkMorph.astro`
- **Alternatives considered**:
  1. Standalone SVG file in `public/brand/` fetched via `<img>` — rejected: cannot animate with CSS keyframes applied to internal paths when loaded via `<img>`
  2. Preact component — rejected: adds ~1–2KB island JS for zero interactivity
  3. Lottie JSON — rejected: violates NFR-1 (no new deps)
- **Consequence**: SVG markup is duplicated if reused across pages; we mitigate by making the Astro component reusable (login, splash, 404 all import the same component)

### ADR-335-02 — Animation technique: CSS `stroke-dashoffset` + `@keyframes`
- **Decision**: All path-drawing and flow uses `stroke-dasharray` + `stroke-dashoffset` animated via CSS keyframes; letter-morph uses grouped `<g>` transforms (`translate`, `scale`, `opacity`) on keyframe timelines
- **Alternatives considered**:
  1. SVG SMIL — rejected: deprecated in Chrome (still works but not future-safe)
  2. Web Animations API (JS) — rejected: NFR-1 says CSS-first; WAAPI would need an island
  3. GSAP — rejected: NFR-1
- **Consequence**: cannot use `stroke-dashoffset` for interactive bidirectional scrubbing — acceptable because loop is **one-shot on page load**

### ADR-335-03 — Loop behavior: one-shot, hold final state
- **Decision**: Animation plays once on page load (~5s), holds the static wordmark, does **not** loop
- **Alternatives considered**:
  1. Infinite loop — rejected: distracts from login form, violates "calm and comfortable" direction
  2. Replay on form focus change — rejected: interferes with a11y focus flow
  3. Dev-mode replay via URL flag (`?replay=1`) — accepted as optional development aid
- **Consequence**: users landing on the login page a second time in the same tab will re-see the animation on page reload; we accept this

### ADR-335-04 — Composition orientation: responsive (portrait mobile + landscape desktop)
- **Decision (amended 2026-04-10)**: The morph ships in **two layouts**:
  - **Mobile (≤768px)**: vertical portrait SVG, viewBox `0 0 480 420`. Mountain top → waterfall descending → field middle → wordmark bottom. Form stacks below the hero.
  - **Desktop (≥769px)**: horizontal landscape SVG, viewBox `0 0 720 800`, occupying the left 60% of the viewport. Form card sits on the right 40% (split hero pattern).
- **Original decision** was portrait-only (forced by C-A1, the 480px `body` cap). **Amendment**: lift the 480px cap for `AuthLayout`-hosted pages only — see ADR-335-10.
- **Alternatives considered**:
  1. Portrait-only on all viewports — rejected per user request for a distinct desktop treatment
  2. Landscape-only on all viewports — rejected: breaks mobile readability
  3. Single square layout scaled up/down — rejected: wastes both dimensions
- **Consequence**: two SVG compositions are authored (not one). Shared CSS keyframes where possible; layout-specific path geometries where not.

### ADR-335-05 — Letter-to-motif mapping (proposed; final in Step 3)
- **Decision**: the 7 letters of "LitCrop" trace a full farm cycle:

  | Letter | Motif | Natural element | Position in cycle |
  |--------|-------|-----------------|-------------------|
  | **L** | Waterfall from mountain | Flowing water (vertical stroke = falling stream, horizontal base = pool) | Life source |
  | **i** | Standing person | Line body + dot head | Planter |
  | **t** | Seedling sprout | Vertical stem + cross-stroke leaves | Early growth |
  | **C** | Bending crop leaf | Curved leaf silhouette (open left) | Mature plant |
  | **r** | Rising sun with ray | Vertical stem + curved ray arc | Sunlight |
  | **o** | Round fruit / sun disc | Circle with thin interior detail | Ripeness |
  | **p** | Grain stalk with head | Descender = stalk, bowl = wheat/rice ear | Harvest |

- **Narrative**: *water → person → seedling → crop → sun → fruit → harvest*
- **Alternatives considered**:
  1. Only animate user-specified 4 letters (L/i/t/C), leave r/o/p as plain typography — rejected: breaks visual cohesion
  2. Assign r/o/p to tool motifs (scythe, hoe, basket) — rejected: introduces industrial vocabulary that clashes with "earthy calm"
- **Consequence**: final visual assignment must be sanity-checked by the user in Step 3; open decision flagged for confirmation in PREREQUISITES-335

### ADR-335-06 — Earthy theme scope: full unauthenticated-pages override
- **Decision**: `AuthLayout.astro` force-applies `data-theme="earthy"` on the `<html>` element, ignoring `localStorage('litcrop-theme')`. User preference re-activates on authenticated layouts via existing `ThemeSwitcher` logic
- **Alternatives considered**:
  1. Login only (not signup/forgot) — rejected: creates inconsistent unauthenticated experience
  2. Respect user preference even pre-auth — rejected: user hasn't logged in yet, so their stored preference is meaningless for first-time visitors, and the login page is where we set the brand first impression
- **Consequence**: all `AuthLayout`-hosted pages (login, signup, forgot-password, verify, etc.) inherit earthy; authenticated users continue to see their chosen theme after sign-in

### ADR-335-07 — Earthy token extension
- **Decision**: Author a **full earthy semantic token set** in `tokens.css` (or wherever base theme tokens live) extending any existing earthy declarations. Minimum tokens to define:
  ```
  --color-bg            (soft cream / warm off-white)
  --color-surface       (slightly elevated cream)
  --color-text          (deep forest ink)
  --color-text-muted    (soft moss gray)
  --color-primary       (mature green, WCAG AA against --color-bg)
  --color-primary-dark  (deep forest)
  --color-accent        (warm clay/terracotta)
  --color-border        (muted sage)
  --color-focus-ring    (warm amber, visible on earthy bg)
  ```
- **Alternatives considered**:
  1. Scope the override inside `auth.css` only — rejected: fragments the theme system
  2. Rename to a new theme (`earthy-login`) — rejected: unnecessary proliferation
- **Consequence**: the earthy theme becomes a first-class theme alongside light/dark; ROI dashboard tokens already there are retained

### ADR-335-08 — Mockup file format (Track A)
- **Decision**: `docs/mockups/litcrop-wordmark-morph.html` is a **single self-contained HTML file** with inline CSS and inline SVG, matching `destination-earth-mockup.html` pattern. Zero external resources, zero build step, directly openable in a browser
- **Consequence**: Track A artifact is fully reviewable without running the Astro dev server; stakeholder can double-click the file in Finder/Explorer

### ADR-335-09 — Ambient mascot: deferred
- **Decision**: **No ambient wandering mascot** (mole/lumberjack) in this sprint. The "person = i" figure in the wordmark *is* the character. Mascot work is carved out to a separate future issue if desired
- **Alternatives considered**:
  1. Keep the original mascot pet alongside the morph — rejected: scope creep, distracts from calm tone
  2. Tiny mascot appears only *after* animation completes — rejected: distracts from form focus
- **Consequence**: the original issue body's mole/lumberjack exploration is parked; if the user wants it, a follow-up issue is the right home

### ADR-335-10 — Lift the 480px body cap for AuthLayout pages only
- **Decision**: `AuthLayout.astro` overrides `body { max-width: 480px }` with a scoped rule (e.g., `.auth-layout body { max-width: none }` or an inline style on the layout root). Post-login, the authenticated app layout does **not** override and retains the existing 480px mobile column.
- **Rationale**: the 480px cap makes perfect sense for a mobile-centric farming-day app but makes the first-impression login page feel cramped on desktop. Lifting it *only* for auth pages gives us a branded landing without touching the authenticated app's layout contract.
- **Alternatives considered**:
  1. Keep the 480px cap everywhere → rejected: produces a postage-stamp login on desktop, wastes the whole screen
  2. Lift the cap globally → rejected: would require re-testing every authenticated page against wider viewports (large regression surface)
  3. Use a `<dialog>` or modal for the login — rejected: breaks URL-based routing and deep linking
- **Consequence**: `AuthLayout` + `global.css` change required in the MVP patch. Regression surface is limited to 4 pages: login, signup, forgot-password, verify. All 4 share the same `AuthLayout`, so one fix covers them.
- **Revert strategy**: the override is a single CSS rule; removing it restores the current behavior. Fully reversible via git.

---

## 4. Component Architecture

### File layout (new + modified)

```
src/frontend/
├── src/
│   ├── components/
│   │   └── brand/                              ← NEW directory
│   │       ├── LitCropWordmarkMorph.astro      ← NEW (Track B MVP)
│   │       └── LitCropWordmark.astro           ← NEW (Production: static variant for reuse)
│   ├── layouts/
│   │   └── AuthLayout.astro                    ← MODIFIED (force earthy theme)
│   ├── pages/
│   │   └── login.astro                         ← MODIFIED (import morph, layout hero)
│   └── styles/
│       ├── tokens.css                          ← MODIFIED (earthy semantic tokens, pending audit)
│       └── auth.css                            ← MODIFIED (earthy-specific overrides if needed)
│
docs/
├── REQUIREMENTS-335.md                         ← Step 1 ✅
├── ARCHITECTURE-335.md                         ← Step 2 (this document)
├── PREREQUISITES-335.md                        ← Step 2 (companion checklist)
└── mockups/
    └── litcrop-wordmark-morph.html             ← NEW (Track A PoC)
```

### Component boundaries

```
┌──────────────────────────────────────────────────────────────┐
│ AuthLayout.astro                                             │
│   sets data-theme="earthy" unconditionally                   │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ login.astro                                            │ │
│   │   <LitCropWordmarkMorph />   ← hero (320–480px tall)   │ │
│   │   <LoginForm client:load />  ← existing Preact island  │ │
│   └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

- **LitCropWordmarkMorph.astro** — inline SVG + inline `<style>` scoped to the component (Astro `<style>` is scoped by default). No JS island. Zero runtime cost beyond the SVG markup.
- **LitCropWordmark.astro** — Production-scope static variant: exports the final held state only, reused in splash, 404, README preview, error pages.
- **AuthLayout.astro** — single-line change: `<html lang={lang} data-theme="earthy">` (ignoring the existing theme bootstrap script for unauthenticated pages).

### Data flow
None. Pure presentation. No props on the hero component for the MVP (single layout). Optional `variant="static" | "animated"` prop can be added in the Production scope for reuse flexibility.

---

## 5. Animation Timeline (high level — details in Step 3)

```
Time    | Event
--------|---------------------------------------------------------
0.0s    | Page loads; SVG visible; all morph elements hidden
0.2s    | Mountain ridgelines stroke-draw in (stroke-dashoffset → 0)
0.9s    | Waterfall water paths start flowing (dashed flow anim)
1.4s    | Waterfall converges into shape of "L"
1.9s    | Person walks in from right → resolves into "i"
2.4s    | Seedling sprouts at field left → resolves into "t"
2.9s    | Crop grows center → bends into "C"
3.3s    | Sun rises → becomes "r"
3.7s    | Fruit round appears → becomes "o"
4.1s    | Grain stalk forms → becomes "p"
4.6s    | All letters hold, landscape fades to background
5.0s    | Final state: wordmark visible, subtle ambient flow in background
        | (dashed flow continues on far-off lines, nothing foreground-animated)
```

Reduced-motion: skip directly to the 5.0s final state, no keyframe playback.

---

## 6. Scope Progression (per my-architect policy)

Per the Scope Progression policy, we define PoC → MVP → Production stages. Each is a shippable boundary; the user can approve advancing after each.

### PoC — Track A mockup
**Goal**: prove the scenery-to-wordmark animation concept in isolation
**Deliverable**: `docs/mockups/litcrop-wordmark-morph.html` — single self-contained file
**Exit criteria**:
- Animation runs cleanly in Chrome + Safari + Firefox
- All 7 letters resolve to recognisable motifs
- Earthy palette applied (proposed tokens inline in the mockup)
- Reduced-motion fallback works
- Stakeholder sign-off (user reviews the file visually)
**Non-goals**: no Astro integration, no theme plumbing, no token authoring, no login form changes
**Estimated effort**: 0.5 day
**Blocks**: MVP cannot start until PoC is approved

### MVP — Track B integration
**Goal**: land the approved morph into the actual login page
**Deliverable**:
- `src/frontend/src/components/brand/LitCropWordmarkMorph.astro` (extracted from PoC)
- `AuthLayout.astro` forces earthy theme
- `tokens.css` gains the earthy semantic token set
- `login.astro` renders morph as hero above existing LoginForm
**Exit criteria**:
- Login flow works end-to-end (no regression on the 790+ test suite)
- EN/JA i18n pass
- WCAG AA contrast verified on earthy palette
- `prefers-reduced-motion` honoured
- FCP budget met (≤50ms regression)
- No new npm dependencies
**Non-goals**: no reuse in splash/404, no JA subtitle, no production brand asset export
**Estimated effort**: 0.5 day
**Blocks**: Production scope cannot start until MVP is shipped and verified in staging

### Production — Brand asset promotion + reuse
**Goal**: elevate the morph to a real brand asset reused across the platform
**Deliverable**:
- `LitCropWordmark.astro` (static variant)
- Reuse in: splash screen, 404 page, loading states, README preview
- Optional: JA subtitle (リットクロップ) under wordmark for JA locale — decided per §8 open decision in requirements
- Visual regression baseline via Playwright screenshot snapshots
- `public/brand/litcrop-wordmark.svg` exported for non-Astro contexts (marketing, issues, social OG)
- Updated `og:image` asset using the wordmark
**Exit criteria**:
- Wordmark appears in at least 4 surfaces
- Visual regression tests pass in CI
- Brand asset committed as the canonical LitCrop mark
**Estimated effort**: 0.5–1 day
**Blocks**: nothing downstream

**Recommendation**: **Start at PoC**. Do not pre-commit to MVP or Production scope until the PoC visual is approved — letter mapping could come back revised.

---

## 7. Tech Stack Assessment

| Layer | Choice | Rationale | New? |
|-------|--------|-----------|------|
| Markup | Astro 5 component + inline SVG | Zero runtime cost, scoped styles | existing |
| Styles | CSS variables + keyframes | NFR-1 no deps | existing |
| Animation | `stroke-dashoffset` + `transform` + `opacity` keyframes | CSS-only, reduced-motion auto-handled | existing pattern (new usage) |
| Theming | `data-theme="earthy"` on `<html>` | Matches existing theme system | existing mechanism, new token set |
| Asset location | `src/components/brand/` + `public/brand/` | Astro convention | new directory |
| Testing | Existing Vitest suite + new Playwright visual regression (Production scope) | Aligned with existing test harness | visual regression is new |

**No new npm dependencies**. Only CSS, markup, and component files are added.

---

## 8. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| R1 | Earthy semantic tokens don't exist in tokens.css; authoring a full palette is more work than MVP budget allows | Medium | Medium | PREREQUISITE audit confirms before MVP; if missing, factor token authoring into MVP estimate (+0.25 day) |
| R2 | Letter-to-motif mapping for r/o/p doesn't visually cohere; mockup looks contrived | Medium | High | PoC is the explicit gate; stakeholder reviews visual before MVP commits any code |
| R3 | 480px canvas is too tight for 7-glyph wordmark; letters become unreadable | Low | Medium | Two-line "Lit" / "Crop" fallback layout is pre-planned; evaluated during PoC |
| R4 | WCAG AA contrast fails on earthy palette | Low | High | Use contrast-check tooling during token authoring; primary text must hit 4.5:1 against background |
| R5 | Morph animation triggers motion sickness in non-reduced-motion users | Low | Medium | Keep motion subtle, no large-scale translations, no fast flashes; soft easing curves |
| R6 | `tokens.css` is permission-restricted during agent sessions → Claude cannot author the earthy tokens autonomously | **Confirmed** | Medium | User must either grant access or apply the token patch manually during MVP; document the token patch in a code-fence in `docs/ARCHITECTURE-335.md` for hand-off |
| R7 | Existing theme bootstrap script in AuthLayout conflicts with forced earthy attribute | Low | Low | Inspect inline script during MVP implementation; adjust to early-exit when pathname matches auth routes |
| R8 | Scope creep: user asks for ambient mascot mid-sprint despite ADR-335-09 | Medium | Medium | ADR-335-09 is explicit; any mascot work re-enters the pipeline as a new issue |

---

## 9. Review Checklist (my-reviewer alignment)

- [x] Requirements traced to decisions (every FR/NFR maps to ≥1 ADR or scope item)
- [x] Tech stack respects C-3 (no new deps)
- [x] Scope progression defined with explicit exit criteria
- [x] Risks enumerated with mitigations
- [x] Re-entry friendly (document self-contained, decisions numbered)
- [x] A11y baseline preserved (reduced motion + ARIA on SVG)
- [x] Budget constraint respected (no AWS cost impact — pure static frontend)
- [x] Existing patterns reused (mockup-first then integrate, matching Beta-11 Batch A pattern)

---

## 10. Re-entry Notes

This is a **first-run** Step 2 (no prior ARCHITECTURE-335.md existed). If later steps surface revisions:
- **Revise** (same step): edit this file, increment ADR numbers if needed
- **Rearchitect** from implementation: append an `## Iteration Log` section below §10 and re-enter at Step 2
- **Redefine**: if letter-mapping fundamentally fails during PoC, kick back to `/cc-define` to reopen §8 of REQUIREMENTS-335.md

---

## 11. STOP Gate — User Review Required

**Do not proceed to Step 3 until the user explicitly resumes.**

**Action for user**: review this document *and* `docs/PREREQUISITES-335.md` (the companion checklist). The prerequisites checklist is the actionable part — it lists specific items to verify or decide before Step 3 begins.

**Decision options**:
- **Proceed** → resume with `/cc-design` to continue to Step 3 (UX/UI design of the actual morph visuals)
- **Revise** → request changes to specific ADRs (e.g., "keep the ambient mascot", "use a landscape hero on tablet+", "swap r-motif to a tool handle")
- **Redefine** → requirements have changed (e.g., "scrap the wordmark idea entirely, just polish the existing login") → kick back to `/cc-define`

**Artifacts produced in Step 2**:
- `docs/ARCHITECTURE-335.md` (this file)
- `docs/PREREQUISITES-335.md` (companion checklist)
