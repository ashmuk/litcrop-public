# Review Findings: Beta-7 Farm Diary Design

> Reviewed: `docs/designs/BETA7-DESIGN.md`
> Date: 2026-04-03
> Reviewers: alignment, security, UX (3 parallel agents)
> Scope: Design document (Steps 2-7 artifact)

---

## MUST-FIX (5)

### MF-1: Zod `date` field accepts invalid calendar dates
**Domain:** Security | **Confidence:** 85%

`CreateDiaryEntrySchema` validates `date` with only `/^\d{4}-\d{2}-\d{2}$/`. This accepts `2026-13-45` or `2026-02-30`, corrupting SK range queries. Also missing: future-date refine with +1 day tolerance.

**Fix:** Add `.refine(s => !isNaN(Date.parse(s)), 'Invalid date')` and `.refine(s => s <= todayPlusOne, 'Date cannot be in the future')` to the schema.

---

### MF-2: `photo_ids` cross-farm validation missing from sequence diagrams
**Domain:** Alignment | **Confidence:** 85%

Requirements (API-4) require photo IDs belong to same farm. The create/update sequence diagrams show `bed_id` farm-scope check but have no step for `photo_ids` ownership.

**Fix:** Add an explicit step to Section 4.1 create diagram: "For each photo_id, verify image.bed.farm_id === farmId."

---

### MF-3: PATCH safety — explicit note needed against raw body spread
**Domain:** Security | **Confidence:** 92%

The PATCH route says to validate `created_by` but doesn't explicitly warn against spreading raw request body onto the DDB item. An implementer could accidentally allow `farm_id` or `created_by` override.

**Fix:** Add note to PATCH API contract: "Apply only Zod-parsed fields from UpdateDiaryEntrySchema. Never merge raw request body onto the stored item."

---

### MF-4: 6-tab overflow at 320px — no responsive strategy
**Domain:** UX | **Confidence:** 92%

5 tabs + AdminTabInjector = 6 tabs. At 320px, each gets ~53px — labels will overflow. No responsive strategy specified.

**Fix:** Add to Section 3.2: "At viewports under 360px with 6 tabs, labels are hidden (icon-only). Add `@media (max-width: 359px) { .tab-bar__label { display: none } }` or make admin tab icon-only."

---

### MF-5: Calendar view has no empty/loading/error state specs
**Domain:** UX | **Confidence:** 88%

Screen D2 shows only the populated state. No wireframe for zero-entry month, loading skeleton, or API error. FarmOverview.tsx has explicit guards for all three states.

**Fix:** Add to Screen D2: (a) empty month — "No activity this month" centered text, (b) loading — skeleton grid matching existing pattern, (c) error — reuse error card from FarmOverview.

---

## SHOULD-FIX (5)

### SF-1: No `DiaryListQuerySchema` for GET list validation
**Domain:** Alignment | **Confidence:** 85%

The 366-day max range and `from/to` validation are documented in comments but no Zod schema exists for query params. Without a schema, the constraint won't be enforced.

**Fix:** Add `DiaryListQuerySchema` to Section 4.4 with `from`, `to`, `category`, `limit`, `cursor` fields and a `.refine()` for max 366-day span.

---

### SF-2: Pagination cursor prefix validation not specified
**Domain:** Security | **Confidence:** 82%

Existing `beds.ts` validates cursor PK prefix and catches `BadCursorError`. The diary design mentions cursors but doesn't specify prefix validation for `DIARY#`.

**Fix:** Add note to GET list API contract: "Decode cursor and validate PK starts with `FARM#{farmId}` and SK starts with `DIARY#`. Throw BadCursorError on mismatch."

---

### SF-3: View toggle persistence — no localStorage key named
**Domain:** UX | **Confidence:** 85%

List/calendar toggle has no specified persistence key. Existing keys follow `litcrop-` prefix convention.

**Fix:** Add to Screen D1/D2 interactions: "Persist to `localStorage` key `litcrop-diary-view` (values: `'list' | 'calendar'`, default: `'list'`)."

---

### SF-4: DiaryEntryForm modal pattern undefined
**Domain:** UX | **Confidence:** 83%

Design says "modal overlay" but no modal/dialog CSS exists in `components.css`. Only a `lightbox-overlay` for photos. No established `<dialog>`, focus trap, or scroll lock pattern.

**Fix:** Specify that DiaryEntryForm uses a **bottom sheet** on mobile (consistent with P2 Forgiving Touch) or explicitly note that a new modal CSS component must be created as part of T3.2 with `z-index` above tab bar (200+).

---

### SF-5: `GSI1SK` hardcoded as string literal in diagram
**Domain:** Alignment | **Confidence:** 85%

Requirements explicitly state: "Use `DDB_KEY_PREFIXES.META` constant." The sequence diagram hardcodes `GSI1SK=#META`.

**Fix:** Change diagram label to `GSI1SK=DDB_KEY_PREFIXES.META`.

---

## SUGGESTION (3)

### SG-1: Activity event emission is design-originated scope
Event emissions (`diary.created/updated/deleted`) in Section 4.6 are not in any FR or AC. Note T1.4 as optional or add a backing requirement.

### SG-2: No 413 or 409 response documented for POST
Document max body size and 413 response. Confirm whether PutItem uses `attribute_not_exists(SK)` condition (409 if duplicate).

### SG-3: Diagram sequence — Zod validation should precede bed ownership check
Section 4.1 shows: membership → Zod → bed check. Per existing `beds.ts` pattern, Zod should come first to reject malformed input before any DDB calls.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| **MUST-FIX** | 5 | Date validation, photo_ids guard, PATCH safety, 6-tab overflow, calendar states |
| **SHOULD-FIX** | 5 | Query schema, cursor validation, view persistence, modal pattern, constant reference |
| **SUGGESTION** | 3 | Event scope, error responses, diagram ordering |

## Verdict

**Status: NEEDS REMEDIATION** — 5 MUST-FIX items require updates to BETA7-DESIGN.md before proceeding to implementation.

## Cost Impact
No cost impact — all findings are documentation/design-level fixes.
