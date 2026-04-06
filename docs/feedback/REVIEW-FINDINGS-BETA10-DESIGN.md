# Review Findings — Beta-10 ROI Dashboard Design Phase

> Reviewed: 2026-04-06
> Reviewer: my-reviewer
> Scope: Design artifacts (architecture, UX, prerequisites, ADR, mock-ups)
> Artifacts: ARCHITECTURE.md s15, UX-DESIGNS.md s16, PREREQUISITES.md s8, ADR-20260406, roi-dashboard.html, roi-harvest-form.html, index.html

## Summary

The Beta-10 ROI Dashboard design is well-structured, internally consistent across most artifacts, and correctly aligned with the existing codebase. Three issues require remediation before implementation: a misleading "two fields" statement in the architecture doc, a missing `created_by_name` field in the proposed DiaryEntryResponse extension, and the existing `calcCostTotal` helper summing amounts across currencies which will cause incorrect ROI calculations for mixed-currency farms. The rest of the design is sound.

## Findings

| # | Severity | Area | Finding | Recommendation |
|---|----------|------|---------|----------------|
| 1 | **MUST-FIX** | ARCHITECTURE.md:1409-1411 | Section 15.2 opening paragraph says "Add **two** optional fields to DiaryEntry" and only shows `harvest_amount` and `harvest_unit` in the first code block. The revenue fields (`revenue`, `revenue_currency`) are introduced in a separate code block below (line 1427-1436). This reads as though there are two separate decisions when they are one. The ADR correctly states four fields. The "two fields" phrasing is factually wrong and could confuse an implementer scanning the section. | Change the opening sentence from "Add two optional fields" to "Add four optional fields" and consolidate both code blocks into a single `interface` snippet showing all four fields together. |
| 2 | **MUST-FIX** | ARCHITECTURE.md:1458-1465 | `DiaryEntryResponse` extension block does not include `created_by_name: string \| null` which is present in the current `DiaryEntryResponseSchema` (schemas/index.ts:547) and returned by the API's `buildEntryResponse`. Any implementer using this section as the spec would miss the existing field. | Add `created_by_name` to the proposed response shape or add a note that the extension block only shows NEW fields and reference the existing schema for the full shape. |
| 3 | **MUST-FIX** | Existing code: diary.ts:32-34 | `calcCostTotal()` sums `entry.costs.reduce((sum, c) => sum + c.amount, 0)` without regard to currency. The current `cost_total` field in `DiaryEntryResponse` already mixes JPY and USD amounts when a single entry has mixed-currency cost items. The ROI dashboard's client-side aggregation will inherit this bug. The design docs (15.4, 16.5, 16.12) correctly specify currency-filtered aggregation at the dashboard level, but `cost_total` in the API response is pre-aggregated incorrectly. | Document this as a known issue in the architecture section. During implementation, the `roi-utils.ts` aggregation must sum `entry.costs` items directly (filtering by currency) rather than using the pre-computed `cost_total` field. Add a note to section 15.3 or 15.4 stating: "ROI aggregation must sum `costs[]` items filtered by currency, NOT use the `cost_total` response field." |
| 4 | **SHOULD-FIX** | UX-DESIGNS.md:4333 | Harvest field validation says `harvest_amount` "must be > 0" if provided, but the Zod schema in ARCHITECTURE.md:1446 says `.min(0)` (allows zero). The ADR also does not specify a minimum. Zero harvest amount is semantically odd but possible (e.g., recording a failed harvest). | Align on one rule. Suggest: `.min(0)` in the schema (allowing zero) and update UX validation text to "must be >= 0" to match. A zero harvest with a note like "crop failed" is a valid use case. |
| 5 | **SHOULD-FIX** | DiaryEntryResponse (domain.ts:231-234) | The proposed `DiaryEntryResponse` extension in ARCHITECTURE.md adds harvest/revenue fields, but the current `DiaryEntryResponse` type in `domain.ts` does NOT include `created_by_name` — that field only exists in the Zod schema (`DiaryEntryResponseSchema`). This means the TypeScript type and the Zod schema are already out of sync. Adding more fields to the architecture spec without noting this will perpetuate the drift. | Flag for implementation: add `created_by_name: string \| null` to the `DiaryEntryResponse` interface in `domain.ts` as a separate fix (or part of this sprint). |
| 6 | **SHOULD-FIX** | UX-DESIGNS.md:16.10 / PREREQUISITES.md | The farm edit wireframe (16.10) shows the Default Currency field positioned "After Location field, before Description or Coordinates." The existing `en.json` setup keys and FarmSetup form structure should be verified during implementation to ensure the field is inserted in the correct order. The wireframe omits other existing fields (latitude, longitude, elevation, climate_zone) which could cause confusion about exact placement. | Add a note clarifying this is a partial wireframe and reference the full field list in the existing form. |
| 7 | **SHOULD-FIX** | UX-DESIGNS.md:16.14 | The i18n keys use a top-level `"roi"` and `"harvest"` namespace, but the existing i18n structure uses flat keys like `"diary"`, `"setup"`, `"gantt"`. The new `"setup.default_currency"` and `"setup.currency_jpy"` keys will merge into the existing `"setup"` object — confirmed correct. However, the `"harvest"` namespace is new and not under `"diary"` which is where all other diary-related keys live. This is not wrong but breaks the grouping pattern. | Consider nesting harvest keys under `"diary.harvest"` instead of top-level `"harvest"` for consistency with the existing pattern where diary-related i18n lives under the `"diary"` namespace. |
| 8 | **SUGGESTION** | Mock-up: roi-dashboard.html | The mock-up uses `@media (prefers-color-scheme: dark)` for automatic dark mode detection AND a `.theme-dark` class-based toggle. The UX spec (16.2) uses `[data-theme="dark"]` attribute selector. The mock-up should use the same selector pattern as the spec for consistency, even if it is standalone HTML. | Align the dark mode selector in mock-ups to `[data-theme="dark"]` to match UX spec convention. Low priority since mock-ups are reference-only. |
| 9 | **SUGGESTION** | Mock-up: roi-dashboard.html | The category label min-width is `110px` in the mock-up CSS (line 443: `min-width: 110px`) vs `120px` in the UX spec (16.6: `min-width: 120px`). | Align to `120px` per spec. |
| 10 | **SUGGESTION** | Mock-up: roi-dashboard.html | The mock-up bar width uses `clamp(12px, 80%, 36px)` while the UX spec (16.7) says `clamp(16px, 80%, 40px)`. | Align mock-up to spec values. |
| 11 | **SUGGESTION** | Mock-up: roi-dashboard.html | The amount column min-width is `64px` in the mock-up (line 476: `min-width: 64px`) vs `80px` in the UX spec (16.6: `min-width: 80px`). | Align to `80px` per spec. |
| 12 | **SUGGESTION** | index.html | The mock-up numbering in index.html jumps from 10 (profile picture) to D (desktop), then 12 (ROI dashboard), 13 (harvest form), 11 (diary reserved/actual). The numbering is inconsistent and the diary reserved/actual card (number 11) appears after 12 and 13. | Renumber cards sequentially or by sprint order for clarity. |

## Cross-Reference Matrix

### Data Model Fields

| Field | ADR | ARCH 15.2 | UX 16.9 | PREREQ 8 | Mock-ups | domain.ts (current) |
|-------|-----|-----------|---------|----------|----------|-------------------|
| `harvest_amount: number \| null` | Yes | Yes | Yes | Yes | Yes (form) | Not yet |
| `harvest_unit: string \| null` | Yes | Yes | Yes | Yes | Yes (form) | Not yet |
| `revenue: number \| null` | Yes | Yes | Yes | Yes | Yes (form) | Not yet |
| `revenue_currency: 'JPY' \| 'USD' \| null` | Yes | Yes | Yes | Yes | Yes (form) | Not yet |
| `Farm.default_currency: 'JPY' \| 'USD'` | Yes | Yes (15.4) | Yes (16.10) | Yes | Yes (form) | Not yet |

All five fields are consistent across all documents.

### Component Structure

| Component | ARCH 15.6 | UX 16.4-16.8 | PREREQ Files | Mock-up |
|-----------|-----------|--------------|-------------|---------|
| `RoiDashboard` | Yes | Yes (16.4) | Yes | Yes (container) |
| `RoiSummaryCards` | Yes | Yes (16.5) | Yes | Yes (4 cards) |
| `CostByCategoryChart` | Yes | Yes (16.6) | Yes | Yes (bars) |
| `MonthlyTrendChart` | Yes | Yes (16.7) | Yes | Yes (stacked) |
| `RoiByBedTable` | Yes | Yes (16.8) | Yes | Yes (table+cards) |
| `roi-utils.ts` | Yes (15.3) | Referenced | Yes | N/A |
| Harvest fields in form | Yes (15.2) | Yes (16.9) | Yes | Yes (roi-harvest-form.html) |
| Farm currency setting | Yes (15.4) | Yes (16.10) | Yes | Yes (in harvest form mock-up) |

All components are consistent across all documents.

### ROI Formula

| Document | Formula | Zero-cost handling |
|----------|---------|-------------------|
| ARCH 15.3 | `(revenue - costs) / costs * 100` | costs=0, rev>0: "No costs recorded"; both 0: "No data" |
| ADR | `(revenue - costs) / costs * 100` | Not explicitly specified |
| UX 16.5 | Implied by edge case table | costs=0, rev>0: "No costs" (neutral bg); both 0: "--" |
| UX 16.5 | Has costs, no revenue: `-100%` | Consistent with formula |

Formula is consistent. Edge case labels differ slightly between ARCH and UX (ARCH says "No costs recorded", UX says "No costs") -- these are i18n keys and the actual string is defined in 16.14 as `"no_costs": "No costs recorded"`, which aligns with ARCH.

### Currency Handling

| Document | Rule |
|----------|------|
| ARCH 15.4 | Aggregate default currency only; "other currency" note |
| ADR | "Currency filtering: ROI dashboard shows aggregates for farm's default_currency only" |
| UX 16.5 | "Shows default-currency total only. Footnote: Excludes N entries in {other_currency}" |
| UX 16.12 | Currency mismatch warning spec with role="status" |

Consistent across all documents.

### Budget & Constraints

| Claim | Verified |
|-------|----------|
| $0.00/month AWS cost delta | Yes -- no new DynamoDB tables, GSIs, Lambda endpoints, or S3 buckets. Only adding nullable attributes to existing items. |
| No new DynamoDB GSIs | Yes -- diary list query uses existing access patterns. |
| No new API endpoints | Yes -- extends existing diary CRUD and farm update endpoints. |
| No new dependencies | Yes -- pure CSS charts, client-side computation. |

## Verdict

**ACCEPTED** (all findings remediated 2026-04-06)

All 3 MUST-FIX and 4 SHOULD-FIX items have been addressed:
- #1: "two fields" → "four fields", code blocks consolidated (ARCHITECTURE.md)
- #2: DiaryEntryResponse extension clarified as NEW fields only, existing fields referenced (ARCHITECTURE.md)
- #3: Currency-aware aggregation warning added to section 15.3 (ARCHITECTURE.md)
- #4: harvest_amount validation aligned to >= 0 (UX-DESIGNS.md)
- #5: Type drift fix added to prerequisites checklist (PREREQUISITES.md)
- #6: Farm edit field placement note clarified as partial wireframe (UX-DESIGNS.md)
- #7: Harvest i18n keys moved under `diary.harvest_*` namespace (UX-DESIGNS.md)

5 SUGGESTION items remain as-is (mock-up minor pixel differences — non-blocking).
