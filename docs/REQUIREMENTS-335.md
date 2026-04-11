# REQUIREMENTS — #335 Polished Login Page + LitCrop Wordmark Morph

> **Status**: Step 1 (cc-define) complete — 2026-04-10
> **Sprint**: Beta-12 (moved from RC/GA per session decision)
> **References**:
> - `.agent/prompts/design/litcrop_design_prompt_full.md` — visual design system
> - `docs/mockups/destination-earth-mockup.html` — motion/line-art exemplar
> - GitHub issue [#335](https://github.com/ashmuk/litcrop/issues/335)

---

## 1. Scope Shift from Original Issue

The original issue framed the work around a **wandering mascot pet** (mole vs. lumberjack 木こりん). This session redirects the scope toward a **scenery-to-wordmark morph** where the LitCrop letters *emerge from* the landscape:

- `L` = waterfall cascading from mountain
- `i` = a standing person (dot = head, stem = body)
- `t` = seedling sprout
- `C` = grown crop bending into arc
- `r`, `o`, `p` = **open — to be proposed in design phase**

**The "person" figure is now embedded in the wordmark**, subsuming the original mascot character. Whether a separate ambient mascot (mole/lumberjack) still has a role is an **open decision** — see §8.

---

## 2. Delivery Tracks (Explicit Split)

Per user direction, deliverables split into **two independent tracks**, produced in sequence:

### Track A — Standalone Wordmark Morph Mockup (FIRST)
- **Artifact**: `docs/mockups/litcrop-wordmark-morph.html`
- **Self-contained**: single HTML file, inline SVG + CSS, mirrors the structure of `destination-earth-mockup.html`
- **Purpose**: prove the scenery → wordmark animation in isolation before integration
- **Reviewable**: openable in any browser, no build step
- **Exit criteria**: animation loop runs cleanly, earthy palette applied, letter assignments visible, stakeholder sign-off obtained

### Track B — Login Page Integration (SECOND)
- **Artifact**: redesigned `login.astro` + `AuthLayout.astro` + earthy theme tokens
- **Depends on**: Track A sign-off
- **Purpose**: land the approved morph into the real login page with form, i18n, theme defaulting

Track B does **not** start until Track A is approved.

---

## 3. Functional Requirements

### FR-1 — Wordmark Morph Animation (Track A)
- Render a panoramic line-art landscape (mountain, waterfall, field, crops) in the `destination-earth-mockup.html` visual vocabulary
- Animate the landscape over 4–6 seconds into the **"LitCrop"** wordmark:
  1. Mountain ridgelines draw in (stroke-dashoffset)
  2. Water flows down as a waterfall — this flow **becomes the `L`**
  3. A small figure walks in / rises from the field — **becomes the `i`**
  4. A seedling sprouts — **becomes the `t`**
  5. A crop grows and bends — **becomes the `C`**
  6. Remaining letters `r`, `o`, `p` fade in using natural motifs (to be designed)
- Final state: static wordmark held for N seconds, then optional loop back to landscape

### FR-2 — Reduced Motion Fallback (Track A)
- Under `prefers-reduced-motion: reduce`, skip the morph and render the final wordmark as a static state
- Static state must still look intentional (not mid-animation)

### FR-3 — Earthy Theme as Login Default (Track B)
- Promote `data-theme="earthy"` from alt-theme to the **default for unauthenticated pages**
- Login page ignores `localStorage('litcrop-theme')` and always renders earthy, regardless of the user's saved preference (their preference re-applies on the authenticated side after sign-in)
- Earthy palette must feel calm, comfortable, and grounded — muted greens, warm clay/terracotta accents, soft cream background, deep forest ink for typography

### FR-4 — Login Form Layout (Track B)
- Re-layout `LoginForm.tsx` over the morph animation hero (split-screen on desktop, stacked on mobile)
- Form retains all current functionality: email+password, show/hide toggle, error states, forgot password, sign up link
- i18n (EN/JA) preserved

### FR-5 — Reusability (Track A artifact)
- The wordmark SVG must be extractable as a standalone asset usable in:
  - Loading splash
  - 404 / error pages
  - README / marketing
- Export target: `frontend/public/brand/litcrop-wordmark.svg` + an animated variant

---

## 4. Non-Functional Requirements

### NFR-1 — Zero New Dependencies
- **No** Framer Motion, Lottie, GSAP, or React Spring
- Animation is CSS keyframes + stroke-dashoffset only
- Optional: small inline `<script>` for scroll-triggered replay on login page (vanilla JS, no library)

### NFR-2 — Performance Budget
- Added bundle weight: **≤15 KB gzipped** for the inline SVG + CSS combined
- No blocking network requests (SVG inlined, not fetched)
- First Contentful Paint must not regress more than 50ms vs current login

### NFR-3 — Accessibility
- Respect `prefers-reduced-motion` (already baseline in `auth.css:330`)
- SVG has `role="img"` + descriptive `aria-label` (e.g., "LitCrop — mountain, waterfall, field, and crops forming the wordmark")
- Decorative animated elements marked `aria-hidden="true"` to avoid screen reader noise
- Form contrast ratios ≥ 4.5:1 against the earthy background (WCAG AA)
- Keyboard focus rings remain clearly visible on earthy palette

### NFR-4 — Responsive
- Mockup and login render cleanly at 360px → 1920px
- On mobile, morph animation scales down but does not crop letter meaning
- Form fields never fall below 44px tap target

### NFR-5 — Internationalization
- Latin wordmark "LitCrop" is brand-locked — **not translated** to Japanese
- All surrounding copy (form labels, errors, links) uses existing i18n keys
- Consider if a JA subtitle (e.g., リットクロップ) should sit beneath the wordmark — **open design question**

---

## 5. Constraints (Hard)

| # | Constraint | Source |
|---|-----------|--------|
| C-1 | Astro 5 + Preact islands only | current stack |
| C-2 | CSS variables for theme tokens (no Tailwind) | current stack |
| C-3 | No new npm dependencies for animation | NFR-1 |
| C-4 | Earthy theme already exists as `data-theme="earthy"` — extend, don't invent | existing theme system |
| C-5 | AWS budget ceiling unchanged (~$1.18/mo) — asset hosting must be static, no new services | project_budget_constraint memory |
| C-6 | Track A must ship and be reviewed before Track B begins | user directive |
| C-7 | Visual vocabulary must stay consistent with `litcrop_design_prompt_full.md` (line art, stroke 2–3px, limited palette) | design guide |

---

## 6. Out of Scope

- Dark-mode variant of the login page (earthy is the only login theme for now)
- Full mascot character (mole/lumberjack) as an ambient wandering element — **deferred** pending §8 decision
- Figma file creation — HTML/SVG mockup is the source of truth
- Signup page redesign (only login; signup can inherit the AuthLayout changes passively)
- Password reset page redesign (same as above)
- Localization of the brand wordmark itself

---

## 7. Asset Inventory (Current State)

| Asset | Status | Source |
|-------|--------|--------|
| LitCrop SVG logo | **does not exist** — emoji 🌾 used as placeholder | `AuthLayout.astro:50` |
| Mascot art | does not exist | — |
| Favicon | referenced as `/favicon.svg`, format uncertain | `AuthLayout.astro:32` |
| Earthy theme tokens | exist (ROI dashboard only) | `components.css` `[data-theme="earthy"]` |
| Login page | minimal, functional, emoji-branded | `src/frontend/src/pages/login.astro` |
| LoginForm component | complete auth flow with Cognito | `src/frontend/src/components/LoginForm.tsx:53` |
| AuthLayout | hosts login, signup, forgot | `src/frontend/src/layouts/AuthLayout.astro` |
| Destination Earth mockup | reference animation exemplar | `docs/mockups/destination-earth-mockup.html` |
| Design prompt | visual system definition | `.agent/prompts/design/litcrop_design_prompt_full.md` |
| Reduced-motion baseline | respected globally | `auth.css:330`, `global.css:157` |

---

## 8. Open Decision Points (Must resolve in Step 2: cc-design)

1. **Remaining letter assignments**: what natural motifs form `r`, `o`, `p`? Candidates:
   - `r` = tool handle / windmill / rising sun rays
   - `o` = sun, well, or fruit
   - `p` = bending stalk with grain head, or tree
2. **Ambient mascot**: does a mole or 木こりん lumberjack still appear on the login page as a separate wandering element, or is the "person = i" figure the only character? (Original issue scope vs. new direction.)
3. **Loop behavior**: does the animation play once on load and hold, or loop indefinitely? Auto-replay on form field focus change?
4. **JA subtitle**: does リットクロップ sit beneath the latin wordmark for JA locale?
5. **Hero vs split layout**: is the morph a full-width hero with the form overlaid, or a split-screen (morph left, form right on desktop)?
6. **Theme override scope**: does the earthy-only rule apply to ALL unauthenticated pages (login, signup, forgot-password, marketing) or just login?
7. **Waterfall `L`**: is the stem of `L` literally falling water (dynamic dash animation) or a frozen silhouette at the final state?

---

## 9. Acceptance Criteria

### Track A — Wordmark Morph Mockup
- [ ] `docs/mockups/litcrop-wordmark-morph.html` opens in any browser with no console errors
- [ ] Animation sequence matches FR-1 (mountain → water→L → person→i → seedling→t → crop→C → fade r/o/p)
- [ ] Earthy palette applied per FR-3
- [ ] Line-art style consistent with `litcrop_design_prompt_full.md` (stroke 2–3px, limited palette, flat)
- [ ] Reduced-motion fallback renders static final state
- [ ] Stakeholder sign-off recorded in `docs/feedback/REVIEW-FINDINGS-335-TRACK-A.md`

### Track B — Login Page Integration
- [ ] `login.astro` renders the morph as hero, earthy theme forced
- [ ] All existing login functionality preserved (email, password, toggle, errors, forgot, signup)
- [ ] EN/JA i18n passes
- [ ] Responsive 360px → 1920px with no layout breakage
- [ ] WCAG AA contrast verified
- [ ] FCP budget met (≤50ms regression)
- [ ] 790+ existing tests still pass
- [ ] No new npm dependencies in `package.json` diff

---

## 10. Pipeline Status

| Step | Skill | Status |
|------|-------|--------|
| 1 | cc-define | ✅ **complete — this document** |
| 2 | cc-design (architecture + ADR for letter mapping, layout, theme scope) | pending |
| 3 | cc-design (UI/UX + mockup Track A) | pending |
| 4 | cc-design (task breakdown) | pending |
| 5 | cc-test (test strategy — visual regression, a11y audit) | pending |
| 6 | cc-implement (Track A mockup) | pending |
| 7 | cc-review (Track A) | **gate** before Track B |
| 8 | cc-implement (Track B integration) | pending |
| 9 | cc-review + cc-deploy | pending |

**Next action**: `/cc-design` to begin Step 2, starting with an ADR for the letter-to-motif mapping decisions in §8.
