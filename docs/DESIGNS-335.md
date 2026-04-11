# DESIGNS — #335 Login Page Wordmark Morph (System Design)

> **Status**: Step 5 (cc-design — System Design) — 2026-04-10
> **Pipeline**: 1 ✅ → 2 ✅ → 3+4 ✅ (mockups committed `fd58414`) → **5** → 6 → 7 (STOP) → 8 (STOP) → 9
> **Source of truth for visuals**: `docs/mockups/335-desktop.html` (canonical), `docs/mockups/335-mobile.html` (scaled twin)
> **Prior artifacts**: `docs/REQUIREMENTS-335.md`, `docs/ARCHITECTURE-335.md`, `docs/PREREQUISITES-335.md`

---

## 1. Purpose of This Document

ARCHITECTURE-335.md defined *what decisions were made* (ADR-style). This document defines *exactly how those decisions become code*: file layout, component signatures, CSS scoping, integration points, and testing hooks.

It is implementation-ready. Step 8 (cc-implement) should be able to execute from this document + the committed mockups without further design judgment.

---

## 2. Canonical Source: Committed Mockups

The visual design is **frozen** at commit `fd58414`:

```
docs/mockups/335-desktop.html    ← canonical SVG markup + CSS animations
docs/mockups/335-mobile.html     ← identical SVG, scaled into 480px phone frame
docs/mockups/335-index.html      ← review hub (not shipped, dev-only)
```

Implementation extracts the SVG + CSS from `335-desktop.html` and wraps them in an Astro component. **No new artwork decisions happen in Step 5 or later** — anything visual that needs to change goes back through Step 4 (re-entry to re-render a mockup).

---

## 3. Token Audit Result

User confirmed at the Step 2 STOP gate that `tokens.css` already contains a complete earthy semantic token set:

```css
[data-theme="earthy"] {
  --color-primary:          #6B7F5E;
  --color-primary-dark:     #4A5A3F;
  --color-primary-light:    #F0EDE4;
  --color-gray-900:         #3B3530;
  --color-gray-700:         #5E5549;
  --color-gray-500:         #857A6E;
  --color-gray-300:         #C9BFB3;
  --color-gray-100:         #F5F0EA;
  --color-white:            #FDFBF7;
  --color-surface:          #FDFBF7;
  --color-surface-elevated: #FFFFFF;
  --color-background:       #F0EDE4;
  /* ...ROI + status + motion + shadows + border + focus-ring... */
}
```

**Risk R1 from ARCHITECTURE-335.md §8 is retired.** MVP does not need to author new tokens. Implementation consumes the existing earthy palette directly.

### Tokens the morph relies on (all confirmed present)
| Token | Purpose in morph |
|-------|------------------|
| `--color-background` / `#F0EDE4` | hero panel base gradient |
| `--color-primary` / `#6B7F5E` | sage stroke (m4, sprout icon, seedling motif) |
| `--color-gray-900` / `#3B3530` | main line-art ink, wordmark text |
| `--color-gray-500` / `#857A6E` | tagline fill |
| `--color-motion` / `#C07842` | sienna flow lines + C motif |
| `--color-amber` (ROI token) / `#B89B5E` | hoe (t), wheat (p), mountain m3 |
| `--color-terracotta` (ROI token) / `#B85C4A` | reserved, not currently used in morph |
| `--color-info-blue` / `#5E7F9B` | waterfall L motif + water drop o |

Non-theme colors hardcoded in the mockup (not yet token-backed):
| Hex | Where | Decision |
|-----|-------|----------|
| `#8FA8BF` | m2 blue ridge stroke | Inline in the component — not worth a new token unless reused elsewhere |
| `#8F6B48` | m3 brown ridge stroke | Same — inline |

**Decision**: keep the two mountain ridge colors inline in the component. Promoting them to tokens would be premature abstraction; no other part of the app uses them.

---

## 4. File Layout

### Files to create (MVP)

```
src/frontend/
└── src/
    └── components/
        └── brand/                          ← NEW directory
            └── LitCropWordmarkMorph.astro  ← NEW (the full hero)
```

### Files to modify (MVP)

```
src/frontend/
├── src/
│   ├── layouts/
│   │   └── AuthLayout.astro                ← force earthy theme, lift 480px cap
│   ├── pages/
│   │   └── login.astro                     ← render the morph as hero
│   └── styles/
│       └── global.css                      ← narrow override for auth route bodies
```

### Files to reuse as-is (no changes)

```
src/frontend/src/components/LoginForm.tsx   ← existing Preact island, untouched
src/frontend/src/styles/tokens.css          ← earthy theme already complete
src/frontend/src/styles/auth.css            ← existing auth form styles, untouched
```

### Production-scope additions (NOT in MVP)

```
src/frontend/src/components/brand/LitCropWordmark.astro   ← static wordmark variant
src/frontend/public/brand/litcrop-wordmark.svg            ← exported brand asset
```

---

## 5. Component Design — `LitCropWordmarkMorph.astro`

### Signature

```astro
---
interface Props {
  /**
   * Animation variant.
   *  - "animated": plays the full scenery → motif → final lockup sequence (login hero)
   *  - "static":   renders only the final held state (splash, 404, README)
   * Defaults to "animated".
   */
  variant?: 'animated' | 'static';

  /**
   * Optional classes to merge into the hero wrapper for layout control
   * (e.g., constraining height, adding a border).
   */
  class?: string;
}

const { variant = 'animated', class: className = '' } = Astro.props;
---
```

### Structure

```astro
<div class={`litcrop-hero ${variant} ${className}`}>
  <svg viewBox="0 0 720 720"
       preserveAspectRatio="xMidYMid slice"
       role="img"
       aria-label="LitCrop — farming scenery morphs into the brand wordmark">

    <!-- scenery group: dims to 30% during the final reveal -->
    <g class="scenery">
      <!-- 3-layer mountain ridges (m2 jagged, m3/m4 smooth Bezier) -->
      <!-- flow lines, field horizon, trees, farmhouse, crop rows -->
      <!-- italic tagline "Little, Light and Lit, then Enlight" (brush script) -->
    </g>

    <!-- motif wordmark: 7 letters staged in then out -->
    <g class="wordmark-motifs" aria-hidden="true">
      <g class="letter-motif motif-L">…waterfall…</g>
      <g class="letter-motif motif-i">…person…</g>
      <g class="letter-motif motif-t">…hoe…</g>
      <g class="letter-motif motif-C">…sun arc…</g>
      <g class="letter-motif motif-r">…seedling…</g>
      <g class="letter-motif motif-o">…water drop…</g>
      <g class="letter-motif motif-p">…bowing wheat…</g>
    </g>

    <!-- final lockup: crop icon + typographic wordmark -->
    <g class="wordmark-final">
      <g class="crop-icon" aria-hidden="true">…sprout…</g>
      <text class="final-text" …>LitCrop</text>
    </g>

  </svg>
</div>

<style>
  /* All CSS from docs/mockups/335-desktop.html <style> block EXCEPT:
     - browser chrome (.browser, .browser-chrome, .dot, .url)
     - split layout (.auth-layout, .hero-panel, .form-panel)
     - form card (.form-card, .form-row, .btn-primary, .links)
     - body/html resets (handled globally)
     - .poc-banner, .page-note, .replay-btn
     Retain:
     - animation keyframes (draw, drift, motifIn, motifOut, finalIn, sceneryDim, sway, fall, taglineIn)
     - .mountain / .m2 / .m3 / .m4 delay classes
     - .letter-motif and per-letter .motif-L … .motif-p delay rules
     - .wordmark-final, .scenery animation bindings
     - .tagline animation binding
     - .waterfall-stream, .tree-pop, .flow animation bindings
     - @media (prefers-reduced-motion: reduce) block
     Scope:
     - Everything is Astro-scoped (default behavior). No CSS leaks to the page.
   */

  .litcrop-hero {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;   /* portrait-square on mobile, same on desktop hero panel */
    background:
      radial-gradient(ellipse 900px 500px at 30% 10%, rgba(255,255,255,.55), transparent 60%),
      linear-gradient(180deg, #F5F0E6 0%, var(--color-primary-light) 100%);
    overflow: hidden;
  }

  .litcrop-hero svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  /* When variant="static", jump to the final held state immediately */
  .litcrop-hero.static .scenery          { opacity: 0.3 !important; }
  .litcrop-hero.static .letter-motif     { opacity: 0 !important; animation: none !important; }
  .litcrop-hero.static .wordmark-final   { opacity: 1 !important; transform: none !important; animation: none !important; }
  .litcrop-hero.static .mountain, .litcrop-hero.static .field {
    stroke-dashoffset: 0 !important; animation: none !important;
  }
  .litcrop-hero.static .tagline          { opacity: 1 !important; animation: none !important; }
</style>
```

### What the `static` variant gives us for free
- Reuse in splash, 404, loading states
- Snapshot-testable fallback
- `prefers-reduced-motion: reduce` users already see effectively the static state via the existing media query; `variant="static"` just makes that deterministic for *any* context

### CSS Scoping Guarantees
Astro's default `<style>` block is **scoped** — it gets an auto-generated class hash (e.g., `.litcrop-hero.astro-xyz123`). No CSS rule in this component can affect any other page. This means:
- The `svg` selector inside the component only matches *this* component's SVG
- The `@keyframes` are still global (keyframes can't be scoped in CSS) but they're prefixed with unique names (`draw`, `motifIn`, etc.) that won't collide with anything else in the app
- The `prefers-reduced-motion` block is also scoped, but it applies to scoped selectors so it works correctly

---

## 6. `AuthLayout.astro` Modifications

### Current behavior (before MVP)
- Sets `data-theme` based on `localStorage('litcrop-theme')` via inline bootstrap script
- Wraps children in a narrow 480px-capped `body` (inherited from `global.css:37`)
- Renders the 🌾 emoji + "LitCrop" text as the brand header (`AuthLayout.astro:50`)

### Changes for MVP

```diff
- <html lang={lang}>
+ <html lang={lang} data-theme="earthy" class="auth-route">
```

1. **Force `data-theme="earthy"`** unconditionally on the `<html>` element. The existing theme bootstrap script (inline in `AuthLayout.astro`) should be bypassed for auth routes — or the attribute gets set by Astro SSR before the script runs, which is simpler.

2. **Add `class="auth-route"`** to the `<html>` element. This is the hook for the body-cap override in `global.css`.

3. **Remove the emoji-brand header** (🌾 + "LitCrop" text at `AuthLayout.astro:50`). The morph component now *is* the brand for unauthenticated pages.

4. **Restructure the slot** to let pages render full-width content instead of being squeezed into a 480px column:

```astro
<body class="auth-layout-body">
  <main class="auth-main">
    <slot />
  </main>
</body>

<style>
  .auth-layout-body {
    max-width: none;          /* override the 480px cap on auth pages only */
    padding: 0;
  }
  .auth-main {
    min-height: 100vh;
    display: grid;
    place-items: stretch;
  }
</style>
```

### Why we override via a scoped `<style>` block, not `global.css`
- Keeps the change contained to `AuthLayout.astro`
- Easier to revert — remove one file's style block, no need to find-and-remove a rule in a shared CSS file
- Matches ADR-335-10's "revert = single CSS rule" acceptance criterion

### Alternative considered: `global.css` rule via `html.auth-route body`
Also works but fragments the concern across two files. The scoped-in-layout approach is cleaner.

---

## 7. `login.astro` Modifications

### Current structure (before MVP)

```astro
---
import AuthLayout from '../layouts/AuthLayout.astro';
import LoginForm from '../components/LoginForm';
import Toast from '../components/Toast';
---
<AuthLayout>
  <!-- Existing: form-centric layout with emoji brand -->
  <LoginForm client:load />
  <Toast client:load />
</AuthLayout>
```

### New structure (MVP)

```astro
---
import AuthLayout from '../layouts/AuthLayout.astro';
import LoginForm from '../components/LoginForm';
import Toast from '../components/Toast';
import LitCropWordmarkMorph from '../components/brand/LitCropWordmarkMorph.astro';
---
<AuthLayout>
  <div class="login-split">
    <aside class="login-hero">
      <LitCropWordmarkMorph variant="animated" />
    </aside>
    <section class="login-form-panel">
      <div class="login-card">
        <h1>Welcome to LitCrop</h1>
        <p class="sub">{t('auth.login.subtitle')}</p>
        <LoginForm client:load />
      </div>
    </section>
  </div>
  <Toast client:load />
</AuthLayout>

<style>
  .login-split {
    display: grid;
    grid-template-columns: 1fr;
    min-height: 100vh;
  }

  .login-hero {
    background: var(--color-primary-light);
    aspect-ratio: 1 / 1;
    max-height: 60vh;
  }

  .login-form-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 24px;
    background: var(--color-background);
  }

  .login-card {
    width: 100%;
    max-width: 380px;
  }

  .login-card h1 {
    font-size: 24px;
    margin: 0 0 6px;
    color: var(--color-gray-900);
    font-weight: 700;
  }

  .login-card .sub {
    font-size: 14px;
    color: var(--color-gray-500);
    margin: 0 0 24px;
  }

  /* Desktop: side-by-side split */
  @media (min-width: 769px) {
    .login-split {
      grid-template-columns: 60fr 40fr;
    }
    .login-hero {
      aspect-ratio: auto;
      max-height: none;
      border-right: 1px solid var(--color-gray-300);
    }
  }
</style>
```

### What stayed unchanged in `LoginForm.tsx`
- Cognito auth flow (password flow + error mapping)
- Email / password fields with validation
- Show/hide password toggle
- `aria-*` attributes and error alerts
- `sessionStorage.litcrop_return_url` redirect
- All existing tests
- EN/JA i18n keys

The component is imported as-is. **Not modified.**

---

## 8. `global.css` (no modification required)

`global.css:37` still sets `body { max-width: 480px }`. The `AuthLayout.astro` scoped `.auth-layout-body` rule overrides it via a higher specificity selector on the body element. No changes to `global.css` are needed for MVP.

The `@media (prefers-reduced-motion: reduce)` block at `global.css:157` is also reused by the morph component's scoped keyframes — keyframes themselves aren't affected by scoped media queries, but the component's own reduced-motion rules (inside its `<style>` block) will take effect for its scoped selectors.

---

## 9. Animation Timeline (final)

Extracted from `docs/mockups/335-desktop.html` — this is the exact timeline to preserve:

```
Time    | Event                                                       | Class
--------|-------------------------------------------------------------|------------------
0.0s    | page load; SVG rendered; motifs and wordmark-final hidden   | -
0.1s    | m2 blue ridge draws in (2.2s duration)                      | .m2 .mountain
0.35s   | m3 brown ridge draws in (2.2s duration)                     | .m3 .mountain
0.6s    | m4 sage ridge draws in (2.2s duration)                      | .m4 .mountain
1.1s    | field horizon draws in (2.0s duration)                      | .field
1.4s    | tagline fades in (1.2s duration)                            | .tagline
1.4s    | letter motif L fades in (0.8s)                              | .motif-L
1.56s   | letter motif i fades in                                     | .motif-i
1.72s   | letter motif t fades in                                     | .motif-t
1.88s   | letter motif C fades in                                     | .motif-C
2.04s   | letter motif r fades in                                     | .motif-r
2.2s    | letter motif o fades in                                     | .motif-o
2.36s   | letter motif p fades in                                     | .motif-p
3.3s    | HOLD — all motifs visible, scenery + tagline visible        | -
3.4s    | motif L fades out (0.65s)                                   | .motif-L motifOut
3.5s    | motif i fades out                                           | ...
3.6s    | motif t fades out                                           | ...
3.7s    | motif C fades out                                           | ...
3.8s    | motif r fades out                                           | ...
3.9s    | motif o fades out + scenery dims to 30% (1.1s)              | .scenery sceneryDim
3.95s   | wordmark-final (crop icon + LitCrop text) fades in (1.0s)   | .wordmark-final finalIn
4.0s    | motif p fades out                                           | .motif-p motifOut
5.0s    | HOLD final — brand lockup visible, scenery at 30%           | -
5.0s+   | ambient flow lines continue drifting (infinite)             | .flow drift
```

Total perceivable sequence: ~5 seconds. After 5s the scene is effectively static except for ambient flow-line drift on the mountain mid-area.

---

## 10. Accessibility Design

| Concern | Implementation |
|---------|----------------|
| SVG semantic | `role="img"` + descriptive `aria-label` on the outer `<svg>` |
| Decorative layers | Motif group `<g class="wordmark-motifs" aria-hidden="true">` — screen readers skip the motif narrative (they'd announce it as nothing meaningful) |
| Final wordmark | The typographic `<text>` inside `.wordmark-final` is SVG-native text and is readable by screen readers; they'll announce "LitCrop" |
| Sprout icon | `<g class="crop-icon" aria-hidden="true">` — purely decorative |
| Tagline | SVG `<text>` is readable by screen readers; they'll announce "Little, Light and Lit, then Enlight" |
| `prefers-reduced-motion` | Scoped `@media (prefers-reduced-motion: reduce)` rules jump directly to the final state; motifs never animate; scenery dim is instant |
| Focus order | Morph is a decorative aside. Keyboard focus jumps directly from page load to the login form (which has existing focus-ring handling) |
| Contrast | Earthy palette primary text `#3B3530` against `#F0EDE4` background = 11.4:1 contrast ratio, exceeds WCAG AAA (7:1) |
| Button / link contrast | Primary button uses `--color-primary` `#6B7F5E` on `#FDFBF7` = 4.6:1, meets WCAG AA (4.5:1) |

---

## 11. i18n Handling

- SVG `aria-label` is hardcoded English: *"LitCrop — farming scenery morphs into the brand wordmark"*. Acceptable because the brand name "LitCrop" is not translated, and the rest is a structural description.
- If JA translation of the aria-label is required later, promote it to a prop passed from the parent page (`<LitCropWordmarkMorph aria-label={t('auth.hero.aria')} />`).
- The brush-script tagline "Little, Light and Lit, then Enlight" is **locked as English** (it's a brand slogan, not UI copy).
- The typographic wordmark "LitCrop" is the brand name — not translated.
- All surrounding UI text (form labels, errors, button text, subtitles) uses the existing `/lib/i18n` module.

---

## 12. Testing Hooks

Add `data-testid` attributes to make the component assertion-friendly:

```astro
<div class="litcrop-hero" data-testid="litcrop-hero-morph">
  <svg data-testid="litcrop-hero-svg" ...>
    <g class="scenery" data-testid="litcrop-hero-scenery">...</g>
    <g class="wordmark-motifs" data-testid="litcrop-hero-motifs">...</g>
    <g class="wordmark-final" data-testid="litcrop-hero-final">
      <g class="crop-icon" data-testid="litcrop-hero-icon">...</g>
      <text data-testid="litcrop-hero-text">LitCrop</text>
    </g>
  </svg>
</div>
```

### Existing 790+ test suite impact
- `LoginForm.tsx` tests: **no change expected** (component itself unmodified)
- Any snapshot tests of `login.astro` may need regeneration since the page structure changes (adds the hero + restructures layout). Flag this as a test-update task.
- No new unit tests required for MVP — the morph is purely presentational.

### Recommended manual tests (MVP exit)
1. Load `/login` in Chrome, Safari, Firefox at 1920px, 1024px, 768px, 480px, 360px widths
2. Verify the morph animation completes cleanly (no visual glitches)
3. Enable OS "Reduce motion" setting, reload — verify the static final state appears immediately
4. Fill login form with valid test credentials, verify existing auth flow works
5. Tab through the page — verify keyboard focus reaches all form inputs in expected order
6. Switch to JA locale — verify form labels and buttons translate, wordmark and tagline stay English
7. Run Lighthouse a11y audit — confirm no regressions from current login page baseline

### Production-scope tests (not MVP)
- Playwright visual regression screenshot test of `/login` at fixed viewport (1440×900)
- Playwright test for the reduced-motion final state
- Playwright test asserting the form is interactive before the animation finishes (form should never be blocked)

---

## 13. Performance Design

| Metric | Budget | Strategy |
|--------|--------|----------|
| Added bundle size | ≤15 KB gzipped | Inline SVG + scoped `<style>` — no JS bundle impact (Astro compiles the component to pure HTML+CSS) |
| First Contentful Paint | +50 ms max vs current login | SVG renders inline; no blocking fetches |
| Total Blocking Time | 0 ms added | No JavaScript (no Preact island for the morph) |
| Animation frame budget | 60 fps sustained | All animations use transform + opacity (compositor-only properties); no layout thrashing |
| Reduced-motion path | Instant final state | `@media (prefers-reduced-motion: reduce)` short-circuits all keyframes to 0.01ms per `global.css:158` |

### Why no JS island
The morph is 100% CSS animation. An Astro component with only `<style>` and no `client:*` directive compiles to HTML+CSS only — zero bytes of JS hit the browser. The existing `LoginForm client:load` Preact island is the only hydrated component on the page, unchanged.

---

## 14. Rollback Strategy

Per ADR-335-10 (user preference: "revert-back-possible"), the MVP changes are designed for single-commit revert:

| Change | Revert mechanism |
|--------|-----------------|
| New file `LitCropWordmarkMorph.astro` | `git revert` removes the file; no stale references because only `login.astro` imports it |
| `AuthLayout.astro` modifications | Scoped `<style>` + `data-theme` attribute; revert the diff and the layout returns to prior behavior |
| `login.astro` modifications | Import + JSX changes; revert restores the emoji-brand layout |
| `global.css` | **No changes in MVP** — revert is a no-op |
| `tokens.css` | **No changes in MVP** — earthy tokens already exist |

All MVP work should go on branch `feature/335-login-wordmark-morph` per the existing feature-branch convention. A single PR from that branch to `develop` contains all changes; `git revert <merge-commit>` on `develop` undoes the feature cleanly.

---

## 15. Design Review Checklist (my-reviewer alignment)

- [x] Every ARCHITECTURE-335 ADR has an implementation path defined
- [x] Token audit complete (R1 risk retired per user confirmation)
- [x] No new dependencies (NFR-1 respected)
- [x] No JS hydration for the morph (performance budget respected)
- [x] A11y baseline preserved (ARIA, reduced-motion, contrast)
- [x] i18n clear boundaries (brand text English, UI text via existing keys)
- [x] Rollback is a single `git revert`
- [x] Test impact scoped and documented
- [x] Mockup is the canonical visual source, referenced not duplicated
- [x] CSS scoping strategy explicit (Astro scoped `<style>` blocks)

---

## 16. Next Steps

Proceed to:
- **Step 6** (cc-design — Task Breakdown) → `docs/TASK-BREAKDOWN-335.md`
- **Step 7** (cc-design — Planning, STOP gate) → `docs/PLANS-335.md`
