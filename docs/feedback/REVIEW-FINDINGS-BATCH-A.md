# Review Findings — Batch A (#343 + #344)

**Scope**: Design review of proposed Batch A for Beta-11 device UX polish.
**Reviewer**: my-reviewer (via cc-review)
**Date**: 2026-04-10
**Status**: Pre-implementation (no code written yet — this reviews the design proposal)
**Issues**: #343 (tier class explanation pane), #344 (device config form modal wrap)

---

## Context

Beta-11 shipped #337 (tiered device classes) in v0.48. Two UX follow-ups (#343, #344)
were filed from post-deploy review. Proposed Batch A plan:

1. New `Modal.tsx` — reusable portal-based modal primitive, modeled on existing `Lightbox.tsx`.
2. New `TierInfoModal.tsx` — content-only component rendering a 4-row tier capability table.
3. Modify `DeviceConfigForm.tsx` — info icon next to `TierBadge` opens `TierInfoModal`.
4. Modify `DeviceListPage.tsx` — header info button; wrap `DeviceConfigForm` in `Modal`.
5. Add 16 new i18n keys × en/ja.

---

## Findings

### MUST-FIX

None. The design is safe to implement as-is, subject to the SHOULD-FIX items below.

### SHOULD-FIX

**S-1. Focus restoration when modal closes**
`Lightbox.tsx` never restores focus to the element that opened it. The new `Modal`
primitive should capture `document.activeElement` on open and `.focus()` it on unmount.
Without this, a keyboard user who opens the config modal and dismisses it lands on
`document.body`, which is WCAG 2.4.3 failure. Reason to fix now: we're creating the
primitive fresh, so there's no cost to doing it right.

**S-2. Nested modal interaction (tier info opened from inside device config modal)**
The info icon exists in both the DeviceListPage header AND inside `DeviceConfigForm`.
When the device config form is itself inside a modal, opening the tier info modal will
nest two modals. Two concerns:
- Escape key should close the topmost only, not both. Each Modal registers its own
  `keydown` listener, so last-registered wins — but that ordering is incidental. Add an
  explicit z-index stack or a simple module-level counter so the primitive is correct
  by construction.
- Body scroll-lock is global; nested modals must not double-unlock on first close.
  Track lock depth (counter) instead of saving/restoring `overflow` directly.

**S-3. Drop-or-keep `window.location.reload()` in `onSave`**
`DeviceListPage.tsx:425` calls `window.location.reload()` after save. The plan is to
drop this in favor of a re-fetch (matching register-success at line 305–307). This is
in scope because the reload also defeats modal close animation, which the new modal
introduces. However, re-fetch only updates `devices` — it does not re-check
`canEdit` from role cache. Audit: `canEdit` only changes when the user's role changes,
which doesn't happen from a device save, so re-fetch is safe. Document this reasoning
in the commit message so a future reader doesn't re-introduce the reload.

**S-4. Responsive tier info table**
Four-column table (Class / Hardware / What it does / What it can't do) will overflow at
~375px mobile width. Mockup must demonstrate a mobile layout (stacked card rows instead
of a table at narrow widths) and the implementation must match. Otherwise the feature
looks broken on phones — the primary target.

**S-5. i18n keys must land in both locales before first render**
16 new keys × 2 locales = 32 strings. JSON must remain valid and key positions must
align (the i18n loader will silently return the key name on miss, which looks like an
untranslated string in prod). Add a single commit that touches both `en.json` and
`ja.json` — do not split.

### SUGGESTION

**G-1. Reuse `TIER_PRESENTATION` for row accent color**
Each row in the tier info table should carry the same bg/fg color as its `TierBadge`
on the rest of the page, so the user recognizes the continuity. Use `TIER_PRESENTATION`
directly rather than duplicating color tokens.

**G-2. Info button affordance**
`ℹ️` emoji varies in rendering across OS/font stacks. Consider a `?` character in a
circular button (`<button aria-label={t('device.tier_info_cta')}>?</button>`) styled
with the existing token palette, matching the "i" button style already used elsewhere
(confirm with a grep). This keeps the icon set consistent.

**G-3. Don't refactor `Lightbox.tsx` in this PR**
Tempting to make `Lightbox` use the new `Modal` primitive. Resist — mixes scopes,
adds regression risk to an unrelated feature. File a follow-up issue instead.

**G-4. Component tests are out of scope per project convention**
`src/frontend/src/__tests__/` has no component tests (only utility/logic tests).
The review **does not** require component tests for `Modal` or `TierInfoModal`.
If a pure helper is extracted (e.g., `TIER_INFO_ROWS`), a small unit test is welcome.

---

## Security Review

- No user input flows — all content is static i18n-keyed strings. No XSS.
- Modal backdrop-click uses className comparison, which is safe (no innerHTML).
- No new network calls, no new auth paths, no new localStorage keys.
- No new deps.

**Verdict**: Security-clean.

---

## Legal / OSS

- No new third-party code. No new licenses to vet.

---

## Alignment with Plan

Checked against restart-point memory (2026-04-10) — batch A pipeline:
define → design → implement → simplify → review → remediate → test → push → PR → merge.

- Define: ✅ (TaskList seeded, issues read)
- Design: ✅ (this document)
- Implementation: pending — will begin after mockup + user sign-off
- Target tag: v0.49 (also includes weather sunrise fix already on develop)

---

## Recommendation

**Proceed to implementation** after the five SHOULD-FIX items are acknowledged and
baked into the Modal primitive design. No MUST-FIX blockers.

Next step: user reviews the HTML/CSS mockup at `docs/mockups/batch-a-modals.html`,
confirms visual direction, then cc-implement runs.
