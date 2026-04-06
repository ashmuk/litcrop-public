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

---

## Review 2: Steps 5-7 (System Design, Task Breakdown, Planning)

> Reviewed: 2026-04-06
> Reviewer: my-reviewer
> Scope: SYSTEM-DESIGN.md section 12, TASK-BREAKDOWN.md Beta-10 section, PLANS.md Beta-10 section
> Artifacts: docs/SYSTEM-DESIGN.md (lines 3652-5063), docs/TASK-BREAKDOWN.md (lines 1551-2073), PLANS.md (lines 306-378)

### Summary

The merge of the former DESIGNS.md content into SYSTEM-DESIGN.md section 12 is well-executed. Section numbering is correct (12.1 through 12.10 with appropriate subsections), the currency filtering warning is present, and cross-file consistency is strong. The 20 tasks across 5 batches in TASK-BREAKDOWN.md are well-structured with correct dependencies and reasonable sizes. Three dangling references to the deleted `docs/DESIGNS.md` remain in TASK-BREAKDOWN.md, plus one in PLANS.md iteration log. One minor structural mismatch exists between SYSTEM-DESIGN.md 12.10 Batch 5 items and the actual TASK-BREAKDOWN.md Batch 5 tasks. The file manifest in 12.9 is missing a few files that tasks reference (CSS, FarmSetupPage, test files).

### Findings

| # | Severity | Area | Finding | Recommendation |
|---|----------|------|---------|----------------|
| 1 | **MUST-FIX** | TASK-BREAKDOWN.md:1554 | Dangling reference: "Based on: DESIGNS.md Section 10" -- `docs/DESIGNS.md` has been deleted and its content merged into SYSTEM-DESIGN.md section 12. | Change to "Based on: SYSTEM-DESIGN.md Section 12, ARCHITECTURE.md Section 15, UX-DESIGNS.md Section 16". |
| 2 | **MUST-FIX** | TASK-BREAKDOWN.md:1937 | Dangling reference: "when all E2E scenarios from DESIGNS.md Section 8.4 pass" -- file no longer exists. | Change to "when all E2E scenarios from SYSTEM-DESIGN.md Section 12.8.4 pass". |
| 3 | **MUST-FIX** | TASK-BREAKDOWN.md:1995 | Dangling reference: "All 7 E2E scenarios from DESIGNS.md Section 8.4 manually verified" -- file no longer exists. | Change to "All 7 E2E scenarios from SYSTEM-DESIGN.md Section 12.8.4 manually verified". |
| 4 | **SHOULD-FIX** | PLANS.md:367 | Iteration log references "DESIGNS.md §1-10" in the "What changed" list. While iteration logs are historical, the file no longer exists and this could confuse anyone reading the log. | Append "(now merged into SYSTEM-DESIGN.md §12)" after the reference to clarify the content's current location. |
| 5 | **SHOULD-FIX** | SYSTEM-DESIGN.md:5039-5043 vs TASK-BREAKDOWN.md:1934-2017 | Batch 5 item mapping mismatch: SYSTEM-DESIGN.md 12.10 lists items 17-20 as (17) loading/empty/error states, (18) year nav + sort, (19) currency mismatch warning, (20) E2E scenarios. But TASK-BREAKDOWN.md maps these as Task 5.1 (states + currency warning folded in), Task 5.2 (year nav + sort), Task 5.3 (farm currency setting -- not in 12.10), Task 5.4 (E2E gate). The total is still 20 tasks but item 19 (currency mismatch) was absorbed into 5.1, and 5.3 (farm currency setting) appeared as a new task not mentioned in 12.10. | Update SYSTEM-DESIGN.md 12.10 Batch 5 to match the actual task breakdown: 17=loading/empty/error/currency-warning states, 18=year nav + sort, 19=farm default currency setting, 20=E2E validation gate. |
| 6 | **SHOULD-FIX** | SYSTEM-DESIGN.md:4980-5008 (§12.9) | File manifest "Files to Create" and "Files to Modify" is incomplete relative to the tasks. Missing: (a) CSS files for Task 4.6, (b) `src/frontend/src/components/FarmSetupPage.tsx` for Task 5.3, (c) API integration test files (`src/api/src/__tests__/diary.test.ts`, `src/api/src/__tests__/farms.test.ts`) for Task 2.4, (d) contract test files for Task 1.3. The manifest notes "extend existing test files" for some but CSS and FarmSetupPage are not mentioned at all. | Add missing files to the manifest. For test files, add them to "Files to Modify" with a note. For CSS, add either a specific file or a note about global CSS token file + component CSS. For FarmSetupPage, add it to "Files to Modify". |
| 7 | **SUGGESTION** | TASK-BREAKDOWN.md:1889 | References "UX-DESIGNS.md Section 16.14" for i18n key count (28 keys). This should be verified during implementation as the actual key count in SYSTEM-DESIGN.md 12.7 appears to be: 23 `roi.*` keys + 5 `diary.harvest_*` keys + 3 `setup.*` keys = 31 total keys, not 28. | Recount and align the stated key count with the actual keys specified in SYSTEM-DESIGN.md 12.7. |
| 8 | **SUGGESTION** | .agent/skills/cc-design.md, .agent/skills/cc-implement.md, .agent/README.md | Multiple references to `docs/DESIGNS.md` exist in agent skill files (cc-design.md:135,141,198,237; cc-implement.md:169; README.md:275). These are out of scope for this commit but should be updated in a follow-up to reflect that system design content now lives in `docs/SYSTEM-DESIGN.md`. | Create a follow-up task to update `.agent/` skill files to reference `docs/SYSTEM-DESIGN.md` instead of `docs/DESIGNS.md`, then run `make sync`. |
| 9 | **SUGGESTION** | SYSTEM-DESIGN.md:4444-4463 (§12.4.6) | `computeMonthlyTrend` infers the year from `entries[0].date` when entries exist. If entries span multiple years (edge case: entries from Dec of prior year due to timezone), the year inference could be wrong. The function always returns 12 months for a single year, but the caller passes entries filtered to `from=YYYY-01-01&to=YYYY-12-31`, so this is safe in practice. However, a comment documenting the assumption would help. | Add a comment in the function spec noting the assumption that all entries belong to the same calendar year (guaranteed by the caller's date range filter). |

### Cross-File Consistency Verification

#### File Manifest (SYSTEM-DESIGN.md 12.9) vs TASK-BREAKDOWN.md Files

| Manifest Entry | Task(s) | Match |
|---------------|---------|-------|
| `roi-utils.ts` (create) | 3.1 | Yes |
| `roi-utils.test.ts` (create) | 3.2 | Yes |
| `RoiDashboard.tsx` (create) | 4.3 | Yes |
| `roi/RoiSummaryCards.tsx` (create) | 4.4 | Yes |
| `roi/RoiByBedTable.tsx` (create) | 4.4 | Yes |
| `roi/CostByCategoryChart.tsx` (create) | 4.4 | Yes |
| `roi/MonthlyTrendChart.tsx` (create) | 4.4 | Yes |
| `domain.ts` (modify) | 1.1 | Yes |
| `schemas/index.ts` (modify) | 1.2 | Yes |
| `dynamodb.ts` (modify) | 2.1 | Yes |
| `diary.ts` (modify) | 2.2 | Yes |
| `farms.ts` (modify) | 2.3 | Yes |
| `api.ts` (modify) | 3.3 | Yes |
| `DiaryPage.tsx` (modify) | 4.2 | Yes |
| `DiaryEntryForm.tsx` (modify) | 4.1 | Yes |
| `en.json` (modify) | 4.5 | Yes |
| `ja.json` (modify) | 4.5 | Yes |
| CSS files (not listed) | 4.6 | **Missing from manifest** |
| `FarmSetupPage.tsx` (not listed) | 5.3 | **Missing from manifest** |
| Contract test files (not listed) | 1.3 | **Missing from manifest** |
| API integration test files (not listed) | 2.4 | **Missing from manifest** |

#### Implementation Order (SYSTEM-DESIGN.md 12.10) vs TASK-BREAKDOWN.md Batches

| SYSTEM-DESIGN.md 12.10 | TASK-BREAKDOWN.md | Match |
|------------------------|-------------------|-------|
| Batch 1: items 1-3 | Tasks 1.1-1.3 | Yes |
| Batch 2: items 4-7 | Tasks 2.1-2.4 | Yes |
| Batch 3: items 8-10 | Tasks 3.1-3.3 | Yes |
| Batch 4: items 11-16 | Tasks 4.1-4.6 | Yes |
| Batch 5: items 17-20 | Tasks 5.1-5.4 | **Partial mismatch** (see finding #5) |

#### PLANS.md Deliverables vs TASK-BREAKDOWN.md

| PLANS.md Deliverable | Covered By Tasks | Match |
|---------------------|-----------------|-------|
| 1. Harvest fields on DiaryEntry | 1.1, 1.2, 2.1, 2.2 | Yes |
| 2. Farm default currency | 1.1, 1.2, 2.1, 2.3, 5.3 | Yes |
| 3. roi-utils.ts | 3.1 | Yes |
| 4. ROI tab in Diary page | 4.2 | Yes |
| 5. RoiDashboard | 4.3 | Yes |
| 6. ROI sub-components | 4.4 | Yes |
| 7. Harvest fields in DiaryEntryForm | 4.1 | Yes |
| 8. i18n | 4.5 | Yes |
| 9. Tests | 1.3, 2.4, 3.2, 5.4 | Yes |

All 9 PLANS.md deliverables map to tasks. Implementation batch table in PLANS.md matches TASK-BREAKDOWN.md.

#### Section Numbering Check (SYSTEM-DESIGN.md section 12)

- 12.1 Type & Schema Changes (12.1.1-12.1.4): Correct
- 12.2 API Layer Changes (12.2.1-12.2.5): Correct
- 12.3 DynamoDB Layer Changes (12.3.1-12.3.4): Correct
- 12.4 Frontend: roi-utils.ts (12.4.1-12.4.7): Correct
- 12.5 Frontend: Component Integration (12.5.1-12.5.7): Correct
- 12.6 Sequence Diagrams (12.6.1-12.6.3): Correct
- 12.7 i18n Keys (12.7.1-12.7.3): Correct
- 12.8 Test Strategy (12.8.1-12.8.4): Correct
- 12.9 File Manifest: Correct (no subsection numbering issues)
- 12.10 Implementation Order: Correct

No numbering gaps or duplicates.

#### Currency Filtering Warning

Present at SYSTEM-DESIGN.md line 4237: "IMPORTANT: This sums raw costs[] items, NOT the pre-computed cost_total, because cost_total mixes currencies (see ARCHITECTURE.md 15.3)." -- Confirmed present and correctly placed.

#### Deleted File Check

`docs/DESIGNS.md` confirmed deleted (does not exist on disk). Dangling references found in 3 locations within TASK-BREAKDOWN.md (findings #1-#3) and 1 in PLANS.md (finding #4).

### Verdict

**ACCEPTED** (all findings remediated 2026-04-06)

All 3 MUST-FIX and 3 SHOULD-FIX items addressed:
- #1-#3: Dangling `DESIGNS.md` references in TASK-BREAKDOWN.md → updated to `SYSTEM-DESIGN.md Section 12`
- #4: PLANS.md iteration log reference → clarified as "(now merged into SYSTEM-DESIGN.md §12)"
- #5: Batch 5 items in §12.10 → realigned with TASK-BREAKDOWN.md tasks
- #6: File manifest §12.9 → added FarmSetupPage, CSS, and test files

3 SUGGESTION items remain as-is (i18n key count recount, .agent/ skill file updates, computeMonthlyTrend comment — non-blocking).

---

## Review 3: Implementation (Batches 1-5)

> Reviewed: 2026-04-06
> Reviewer: my-reviewer
> Scope: All implementation code across Batches 1-5 for Beta-10 ROI Dashboard (#248, #245)
> Files reviewed: domain.ts, schemas/index.ts, dynamodb.ts, diary.ts, farms.ts, roi-utils.ts, roi-utils.test.ts, api.ts, RoiDashboard.tsx, RoiSummaryCards.tsx, CostByCategoryChart.tsx, MonthlyTrendChart.tsx, RoiByBedTable.tsx, DiaryPage.tsx, DiaryEntryForm.tsx, SetupForm.tsx, requests.ts, contracts.test.ts, en.json, ja.json, components.css

### Summary

The Beta-10 ROI Dashboard implementation is well-executed overall. The core architecture is sound: currency-aware aggregation in roi-utils.ts correctly filters by currency and avoids the pre-computed cost_total (addressing Review 1 finding #3), the harvest refine guard is enforced at schema, API, and frontend layers, and the component structure matches the system design. Two blocking issues need remediation: the POST /farms handler does not pass default_currency to createFarm (so new farms always get JPY regardless of what the user selects in SetupForm), and all existing test fixtures for Farm objects are missing the required default_currency field causing TypeScript compilation errors across 16+ test files. Several quality and accessibility issues round out the findings.

### Findings

| # | Severity | Area | Finding | Recommendation |
|---|----------|------|---------|----------------|
| 1 | **MUST-FIX** | `farms.ts:499-511` | POST /farms handler does not extract `default_currency` from request body. The `createFarm` call passes only name, location, description, lat/lng, elevation, climate_zone, locale, theme, grid_rows, grid_cols -- omitting `default_currency`. Since `Farm.default_currency` is required (`'JPY' | 'USD'`), TypeScript should reject this, but esbuild transpilation at runtime masks the error. The result: `default_currency` is always `undefined` when creating a farm, and `itemToFarm()` defaults it to `'JPY'`. This means the currency selector in SetupForm has no effect on new farms. | Add `default_currency: (body['default_currency'] as Farm['default_currency']) ?? 'JPY'` to the `createFarm()` call in the POST handler (line ~511). The `validateFarmFields` function already validates the value on line 122-127, so only the pass-through is missing. |
| 2 | **MUST-FIX** | `requests.ts:10-21` | `CreateFarmRequest` interface is missing `default_currency?: 'JPY' | 'USD'`. The `UpdateFarmRequest` correctly includes it (line 36), but `CreateFarmRequest` does not. This means the frontend `createFarm()` API call cannot type-safely pass the field (it works at runtime because the payload is cast, but the type contract is incomplete). | Add `default_currency?: 'JPY' | 'USD';` to `CreateFarmRequest`. |
| 3 | **MUST-FIX** | `contracts.test.ts` + 6 other test files | All existing mock Farm objects are missing the required `default_currency` field, causing 16+ TypeScript compilation errors (`Property 'default_currency' is missing in type ... but required in type 'Farm'`). While tests pass at runtime (esbuild does not enforce types), the codebase does not compile cleanly with `tsc --noEmit`. Files affected: contracts.test.ts (10 errors), ownership.test.ts, admin.test.ts, beds.test.ts, chat.test.ts, devices.test.ts, diary.test.ts. | Add `default_currency: 'JPY' as const` to every mock Farm object in all affected test files. Consider extracting a shared `baseFarm` fixture to prevent this class of error in future sprints. |
| 4 | **SHOULD-FIX** | `diary.ts:32-34` | `calcCostTotal()` still sums costs across currencies without filtering. While the ROI dashboard correctly avoids using `cost_total` (as specified in Review 1 finding #3), the `cost_total` field in every `DiaryEntryResponse` remains incorrect for entries with mixed-currency costs. This is a pre-existing bug that predates Beta-10, but now that currency-awareness is a first-class concern, it creates a misleading number in the diary list view. | Either (a) deprecate `cost_total` from the response and let clients compute it, or (b) change `calcCostTotal` to accept a currency parameter and filter accordingly -- but this requires knowing the farm's default_currency in the diary route, adding a lookup. Option (a) is simpler but is a breaking API change; documenting `cost_total` as "sum across all currencies, for display only" in the schema is the minimal fix. |
| 5 | **SHOULD-FIX** | `components.css:2848-2857` | The `.roi-excluded-notice` uses hardcoded color `#92400e` (dark amber text) which will be illegible on dark theme backgrounds. The component correctly uses CSS custom properties for background but the text color bypasses the design token system. | Replace `color: #92400e` with a CSS custom property (e.g., `--color-roi-warning-text`) and add dark theme overrides alongside the other ROI color tokens. |
| 6 | **SHOULD-FIX** | `components.css:2735-2743` | ROI color tokens (`--color-roi-positive`, `--color-roi-negative`, `--color-roi-positive-bg`, `--color-roi-negative-bg`, `--color-roi-cost`, `--color-roi-revenue`, `--color-roi-neutral`) are defined only in `:root`. No dark/earthy theme overrides exist. On dark backgrounds: green (#1B7D3C) and red (#C62828) text will have low contrast against dark surfaces; light backgrounds (#E8F5EC, #FFEBEE) will appear as bright rectangles. | Add dark theme token overrides for all 7 ROI color tokens. Example: in dark mode, swap backgrounds to darker tints (e.g., `#1a2e1a`, `#2e1a1a`) and brighten text colors (e.g., `#4ade80`, `#f87171`). |
| 7 | **SHOULD-FIX** | `RoiDashboard.tsx:197` | The currency mismatch notice hardcodes the "other" currency as `farmCurrency === 'JPY' ? 'USD' : 'JPY'`. This is correct for the current two-currency system but would break if a third currency is added. More importantly, the actual excluded entries might have costs in BOTH other currencies. | Low risk given only two currencies are supported. Add a comment noting this assumption. If/when a third currency is added, the excluded notice should list all non-default currencies found in excluded entries. |
| 8 | **SHOULD-FIX** | `roi-utils.ts:176` | The bed name for unassigned entries is hardcoded as the English string `'Unassigned'`. This is not internationalized -- Japanese users will see "Unassigned" instead of a localized label. | Add an i18n key `roi.unassigned_bed` to both en.json and ja.json, and pass the label from the component rather than hardcoding it in the utility function. Alternative: have `computeRoiByBed` use a sentinel value (e.g., empty string) and let the component resolve the display label via `t()`. |
| 9 | **SUGGESTION** | `roi-utils.test.ts:61` | The `makeBed` helper sets `latest_status: 'empty'` which is not a valid `BedStatus` value (valid values are: healthy, slow_growth, issue, animal_intrusion, no_data). This works because the tests don't validate the status field, but it's technically incorrect test data. | Change to `latest_status: 'no_data'` for correctness. |
| 10 | **SUGGESTION** | `DiaryEntryForm.tsx:204` | `harvest_amount` parsing: if the user types a non-numeric string like "abc", `parseFloat("abc")` returns `NaN`, and the falsy check sends `NaN` to the API. The Zod schema catches this server-side, but the UX would be a generic error. | Add client-side validation: if `harvestAmount` is non-empty and `parseFloat` returns `NaN`, show a form error before submitting. Same applies to `revenue` field. |
| 11 | **SUGGESTION** | `RoiByBedTable.tsx:157-161` | The bed table sort headers use `onClick` on `<th>` elements but lack `role="button"` and keyboard event handlers (`onKeyDown` for Enter/Space). Keyboard-only users cannot sort the table. | Add `role="button"`, `tabIndex={0}`, and an `onKeyDown` handler that calls `handleSort` on Enter/Space. |
| 12 | **SUGGESTION** | `computeRoiByBed` | Results are not sorted -- the order depends on Map iteration order (insertion order). The component sorts via user interaction, but the initial render order is non-deterministic relative to bed grid position. | Consider sorting results by bed_name alphabetically as a default, or by total_cost descending (matching the default sort state in the component). |
| 13 | **SUGGESTION** | Test coverage | The 32 roi-utils tests are comprehensive. Missing edge cases: (a) floating-point precision (e.g., costs of 0.1 + 0.2), (b) very large numbers near the max schema limit (99,999,999), (c) entry with harvest revenue but non-harvesting category (should be ignored). These are low-risk but would increase confidence. | Add 2-3 edge case tests for floating-point and boundary values. |
| 14 | **SUGGESTION** | `RoiDashboard.tsx:175-176` | The "No data" empty state uses `.replace('{{year}}', String(year))` for i18n interpolation. This manual string replacement pattern is used throughout the codebase so it is consistent, but is fragile if placeholder syntax ever changes. | No code change needed. Note for future: consider a centralized `t()` interpolation helper. |

### Cross-Reference: Design vs Implementation

| Design Spec | Implementation | Match |
|------------|---------------|-------|
| SYSTEM-DESIGN.md 12.1: 4 harvest fields on DiaryEntry | domain.ts:229-233 | Yes |
| SYSTEM-DESIGN.md 12.1: Farm.default_currency | domain.ts:64 | Yes |
| SYSTEM-DESIGN.md 12.2: harvestFieldsRefine guard | schemas/index.ts:521-548 | Yes |
| SYSTEM-DESIGN.md 12.2: CurrencySchema | schemas/index.ts:44 | Yes |
| SYSTEM-DESIGN.md 12.3: itemToDiaryEntry maps harvest fields | dynamodb.ts:1668-1671 | Yes |
| SYSTEM-DESIGN.md 12.3: createDiaryEntry writes harvest fields | dynamodb.ts:1717-1721 | Yes |
| SYSTEM-DESIGN.md 12.3: updateDiaryEntry handles harvest fields | dynamodb.ts:1805-1808 | Yes |
| SYSTEM-DESIGN.md 12.4: sumCostsByCurrency (NOT cost_total) | roi-utils.ts:48-59 | Yes |
| SYSTEM-DESIGN.md 12.4: computeRoi formula | roi-utils.ts:94-129 | Yes |
| SYSTEM-DESIGN.md 12.4: computeRoiByBed | roi-utils.ts:141-183 | Yes |
| SYSTEM-DESIGN.md 12.4: computeCostByCategory | roi-utils.ts:190-212 | Yes |
| SYSTEM-DESIGN.md 12.4: computeMonthlyTrend (12 months) | roi-utils.ts:220-243 | Yes |
| SYSTEM-DESIGN.md 12.5: RoiDashboard container | RoiDashboard.tsx | Yes |
| SYSTEM-DESIGN.md 12.5: 4 sub-components | roi/*.tsx (4 files) | Yes |
| SYSTEM-DESIGN.md 12.5: ROI tab in DiaryPage | DiaryPage.tsx:59,497-501,768-770 | Yes |
| SYSTEM-DESIGN.md 12.5: Harvest fields in DiaryEntryForm | DiaryEntryForm.tsx:90-101,366-449 | Yes |
| SYSTEM-DESIGN.md 12.7: i18n keys | en.json, ja.json | Yes, all keys present and matching |
| SYSTEM-DESIGN.md 12.5: Farm currency in SetupForm | SetupForm.tsx:216-226 | Yes |
| Currency filtering warning (ARCHITECTURE.md 15.3) | roi-utils.ts:47 comment | Yes |
| buildEntryResponse includes harvest fields | diary.ts:98-101 | Yes |
| farmToResponse includes default_currency | farms.ts:150 | Yes |
| PATCH /farms handles default_currency | farms.ts:542,553 | Yes |
| POST /farms handles default_currency | farms.ts:499-511 | **NO -- see finding #1** |

### Security Assessment

- **Injection/XSS**: No user content is rendered via innerHTML or unsafe DOM APIs. All values go through Preact's JSX escaping. Cost items, descriptions, and bed names are text-node rendered. Safe.
- **Authorization**: Diary entry access uses existing `assertFarmAccess` + `loadAndAuthorizeEntry` guards. No new authorization paths introduced. ROI dashboard reads diary entries through the existing paginated GET endpoint. Safe.
- **Input validation**: Harvest fields are validated by Zod schema (`harvest_amount: min(0), max(999_999)`; `harvest_unit: min(1), max(20)`; `revenue: min(0), max(99_999_999)`). The `harvestFieldsRefine` guard prevents setting harvest fields on non-harvesting entries at schema level. Safe.
- **Secrets/credentials**: No secrets in code or logs. No new environment variables.

### Accessibility Assessment

- Year selector: `role="group"`, `aria-label` on buttons -- good
- Summary cards: emoji icons have `aria-hidden="true"` -- good
- Monthly trend chart: hidden `<table class="sr-only">` provides accessible data -- good
- Bed table: `aria-sort` on sortable headers -- good
- Harvest form section: `aria-hidden` when not visible, `tabIndex={-1}` when hidden -- good
- Category chart: labels include text, emoji has `aria-hidden="true"` -- good
- Error state: form errors use `role="alert"` -- good
- Currency mismatch notice: `role="status"` -- good
- Gap: bed table sort headers lack keyboard support (see finding #11)

### Backward Compatibility Assessment

- Old diary entries (without harvest fields) read correctly: `itemToDiaryEntry` defaults all four harvest fields to `null` via `?? null` -- confirmed
- Old farms (without default_currency) read correctly: `itemToFarm` defaults to `'JPY'` via `?? 'JPY'` -- confirmed
- `FarmBaseSchema` has `.default('JPY')` for `default_currency` -- confirmed
- `DiaryEntryResponseSchema` includes all four harvest fields as `.nullable()` -- confirmed
- No API contract breaking changes: all new fields are nullable additions -- confirmed

### Verdict

**NEEDS-REMEDIATION**

3 MUST-FIX items block acceptance:
- #1: POST /farms ignores default_currency from request body
- #2: CreateFarmRequest type missing default_currency field
- #3: 16+ TypeScript compilation errors in test fixtures (missing default_currency on mock Farm objects)

5 SHOULD-FIX items should be addressed before finalizing:
- #4: calcCostTotal mixed-currency documentation
- #5: Hardcoded color in .roi-excluded-notice
- #6: Missing dark theme overrides for ROI color tokens
- #7: Hardcoded "other currency" assumption (comment needed)
- #8: Hardcoded English "Unassigned" label in roi-utils.ts (i18n gap)

6 SUGGESTION items are non-blocking improvements (#9-#14).
