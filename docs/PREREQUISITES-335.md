# PREREQUISITES — #335 Polished Login Page + Wordmark Morph

> **Status**: Step 2 STOP gate — 2026-04-10
> **Pair doc**: `docs/ARCHITECTURE-335.md` (full architecture, ADRs, scope progression)
> **Purpose**: actionable checklist the user must review before Step 3 begins

Review each item below, tick the checkbox, and note any decisions/blockers inline. When all MUST items are resolved, reply `/cc-design` to resume at Step 3 (UX/UI Design).

---

## A. Architecture Review (MUST)

Read `docs/ARCHITECTURE-335.md` and confirm or revise each ADR:

- [ ] **ADR-335-01** — inline SVG in Astro component (not Preact, not standalone file). Confirm.
- [ ] **ADR-335-02** — CSS-only animation (`stroke-dashoffset` + keyframes). No SMIL, no Web Animations API, no GSAP. Confirm.
- [ ] **ADR-335-03** — one-shot on page load, no loop. Confirm or request loop behavior.
- [ ] **ADR-335-04** — vertical portrait 480×720 composition (forced by the 480px body cap in `global.css:37`). Confirm, or declare willingness to lift the 480px cap for auth pages.
- [ ] **ADR-335-05** — letter-to-motif mapping proposal:
  - `L` = waterfall, `i` = person, `t` = seedling, `C` = crop **(user-specified, locked)**
  - `r` = rising sun with ray, `o` = fruit/sun disc, `p` = grain stalk with head **(proposed)**
  - Approve as-is, or propose alternate motifs for r/o/p.
- [ ] **ADR-335-06** — earthy theme forced on all `AuthLayout`-hosted pages (login, signup, forgot-password, verify). Confirm scope, or restrict to login only.
- [ ] **ADR-335-07** — author a full earthy semantic token set. See §B below — this depends on the token audit.
- [ ] **ADR-335-08** — standalone HTML mockup format for Track A PoC. Confirm.
- [ ] **ADR-335-09** — drop ambient mascot (mole/lumberjack) in this sprint; the "person = i" figure is the only character. Confirm, or revert to keep mascot scope (will expand effort).

---

## B. Critical Audit — Earthy Theme Tokens (MUST)

**Context**: `components.css:2775` defines `[data-theme="earthy"]` with only ROI dashboard tokens. I could not read `src/frontend/src/styles/tokens.css` during this session due to permission restrictions. Before Step 3, please verify the following directly:

- [ ] **Open** `src/frontend/src/styles/tokens.css`
- [ ] **Find** the `[data-theme="earthy"]` block (if any) or any earthy semantic token declarations
- [ ] **Report** which of these tokens are already defined for earthy:
  ```
  --color-bg
  --color-surface
  --color-text
  --color-text-muted
  --color-primary
  --color-primary-dark
  --color-accent
  --color-border
  --color-focus-ring
  ```
- [ ] **Decide** one of:
  - [ ] Tokens already exist and look good → Step 3 just consumes them
  - [ ] Tokens exist but need revision for the login hero → Step 3 authors the revision
  - [ ] Tokens do not exist at all → Step 3 must author the full earthy semantic palette (adds ~0.25 day to MVP estimate)

**Why this matters**: if the earthy theme today is "light theme + ROI overrides", then our "force earthy on login" change currently produces a near-identical-to-light visual. The whole design direction hinges on having a distinct earthy base.

---

## C. Permission / Access Audit (SHOULD)

- [ ] **tokens.css read access** — the agent session was denied read permission on `/workspace/src/frontend/src/styles/tokens.css`. If Step 3 needs to author earthy tokens, either:
  - [ ] Grant read/write access for the `styles/` directory during the implementation session, OR
  - [ ] Apply the token patch manually using the inline patch proposed at the end of Step 3
- [ ] Confirm Bash access for `ls`, `cat`, `find` inside `src/frontend/src/styles/` if needed for future visual regression work

---

## D. Open Decisions from Requirements §8 (MUST resolve before Step 3)

These are carried forward from `docs/REQUIREMENTS-335.md` §8. Architecture proposes answers where possible; confirm or override:

| # | Question | Architecture proposal | Your decision |
|---|---------|-----------------------|---------------|
| D-1 | Remaining letter motifs (r/o/p) | Sun / fruit disc / grain stalk — see ADR-335-05 | [ ] |
| D-2 | Ambient mascot (mole/木こりん) on login? | **Dropped** per ADR-335-09 — the "person = i" is the only character | [ ] |
| D-3 | Loop behavior | **One-shot, hold final state** per ADR-335-03 | [ ] |
| D-4 | JA subtitle (リットクロップ) under wordmark? | **Production scope only** — defer from MVP | [ ] |
| D-5 | Hero vs split layout | **Hero above form** (forced by 480px mobile cap) per ADR-335-04 | [ ] |
| D-6 | Theme override scope | **All `AuthLayout` pages**, not just login, per ADR-335-06 | [ ] |
| D-7 | Waterfall `L` stem dynamism | Keep water flowing subtly even in final held state | [ ] |

---

## E. Scope Progression Confirmation (MUST)

Per ADR-335 §6, work is staged:

- [ ] **PoC** — Track A standalone HTML mockup only (0.5 day). Approve this as the next implementation step.
- [ ] **MVP** — Track B integration into login.astro with earthy theme (+0.5 day, after PoC sign-off). Acknowledge this is *not* committed until PoC is reviewed.
- [ ] **Production** — Brand asset promotion, reuse in splash/404, optional JA subtitle, visual regression baseline (+0.5–1 day). Acknowledge this is a separate scope decision after MVP ships.

**Recommended**: approve **PoC only** at this gate. Do not pre-commit to MVP or Production — both depend on how the PoC visual lands.

---

## F. Manual Approvals / Sign-offs (SHOULD)

- [ ] **Budget impact**: zero — no new AWS services, no new npm deps, no hosting changes. Confirmed against the ~$1.18/mo ceiling.
- [ ] **Brand direction**: confirm the scenery-to-wordmark concept aligns with your vision for LitCrop's brand (this becomes the first real logo asset in the repo — the emoji 🌾 placeholder retires)
- [ ] **Compliance**: no PII, no new external services, no new data flows. No compliance review required.

---

## G. External Assets to Prepare (optional)

None required. All assets are generated in-code as SVG primitives.

Optional nice-to-haves that could enrich the mockup but are **not blocking**:
- [ ] Reference photos of Japanese mountain waterfalls (for compositional inspiration — can be decorative only, not embedded)
- [ ] Reference of preferred earthy palettes from other products (Mori, Modular, Terragon, Farmer's Almanac, etc.) — for Step 3 token authoring
- [ ] JA reference for the brand wordmark style (カタカナ vs. ひらがな vs. 漢字) — for Production-scope JA subtitle decision

---

## H. Risks You Should Be Aware Of

Summarised from ARCHITECTURE-335 §8:

1. **R1 — Earthy token authoring may expand MVP scope** (+0.25 day) if the tokens don't exist yet. Depends on §B audit outcome.
2. **R2 — Letter mapping for r/o/p may not cohere visually**. This is exactly why PoC gate exists.
3. **R3 — 480px canvas may be too tight**. Fallback is two-line wordmark layout ("Lit" / "Crop").
4. **R6 — tokens.css read permission denied** during this session. If reimplemented as a running constraint, Step 3/MVP may need you to apply the earthy token patch by hand.

---

## I. Ready to Proceed?

When all MUST items in §A, §B, §D, and §E are ticked or resolved, reply with one of:

- ✅ `/cc-design` — proceed to Step 3 (UX/UI design → Step 4 PoC mockup → STOP gate)
- 🔁 **Revise** — specify which ADRs to change, I'll update ARCHITECTURE-335.md and re-present this checklist
- ⚠️ **Redefine** — kick back to `/cc-define` (requirements need to change first)

---

## Quick-glance status

| Item | Status |
|------|--------|
| Architecture document | ✅ `docs/ARCHITECTURE-335.md` |
| Prerequisites checklist | ✅ this document |
| Token audit | 🟡 **awaiting user** |
| ADR approvals | 🟡 **awaiting user** |
| Scope progression approval | 🟡 **awaiting user — recommend PoC only** |
| Ready for Step 3 | ❌ not yet |
