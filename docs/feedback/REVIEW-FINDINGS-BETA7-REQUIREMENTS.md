# Review Findings: Beta-7 Farm Diary Requirements

> Reviewed: `docs/designs/BETA7-REQUIREMENTS.md`
> Date: 2026-04-03
> Reviewers: completeness, security, data-model (3 parallel agents)
> Scope: Requirements document only (Step 1 artifact)

---

## MUST-FIX (5)

### MF-1: IDOR risk — GSI1 entry lookup lacks farm-scope guard
**Severity:** MUST-FIX | **Domain:** Security | **Confidence:** 95%

`GET /farms/:farmId/diary/:entryId` uses GSI1 to fetch by entryId. If the implementation queries GSI1 first, an attacker could call `GET /farms/MY-FARM/diary/VICTIM-ENTRY-ID` — `assertFarmAccess` passes for their own farm, but the returned entry belongs to a different farm. The retrieved item's `farm_id` must be explicitly compared to `:farmId` after fetch.

**Fix:** Add to FR-1.5: "After fetching an entry by ID (GSI1), the server MUST verify `entry.farm_id === :farmId` before returning data or allowing mutation. This matches the `assertBedAccess` pattern in `beds.ts`."

---

### MF-2: PATCH/DELETE — farm-scope bypass via creator check alone
**Severity:** MUST-FIX | **Domain:** Security | **Confidence:** 90%

FR-1.5 says "creator + admin/owner can update/delete" but doesn't mandate that `entry.farm_id === :farmId` is checked first. A staff member who knows a victim entry UUID could call `PATCH /farms/MY-FARM/diary/VICTIM-UUID` and pass if only `created_by === userId` is checked.

**Fix:** Add to API-1: "All single-entry endpoints (GET/:id, PATCH, DELETE) MUST: (1) fetch entry, (2) assert `entry.farm_id === :farmId`, (3) then check creator/role."

---

### MF-3: Sort order mismatch — FR-1.2 says newest-first but DynamoDB returns ascending
**Severity:** MUST-FIX | **Domain:** Data Model | **Confidence:** 92%

FR-1.2 requires "sorted newest-first within each date." DynamoDB `between` on SK returns ascending order by default. The requirements don't mention `ScanIndexForward: false` or post-query reversal.

**Fix:** Add to DM-4: "Query uses `ScanIndexForward: false` for newest-first ordering within the SK range, consistent with image queries in `dynamodb.ts`."

---

### MF-4: `begins_with` vs `between` ambiguity for date-range queries
**Severity:** MUST-FIX | **Domain:** Data Model | **Confidence:** 88%

DM-3 says `begins_with('DIARY#2026-04')` for monthly queries. DM-4 lists `between` for arbitrary ranges. These are different DynamoDB operators. `begins_with` cannot handle partial-month ranges (`from=04-10, to=04-20`). Using `begins_with` for all queries would return items outside the requested range, breaking pagination.

**Fix:** Standardize on `between` as the canonical query method. Keep `begins_with` only as an optimization note for full-month queries. Use `DIARY#{to}~` (tilde U+007E) as upper bound to avoid encoding issues with `\xff`.

---

### MF-5: No timezone handling specified for `date` field
**Severity:** MUST-FIX | **Domain:** Completeness | **Confidence:** 88%

The `date` field is `YYYY-MM-DD` but "today" is server-evaluated in UTC. A user in JST (UTC+9) logging at 1am JST on April 4 would have the server see April 3 UTC. The +1 day tolerance in API-4 is mentioned but imprecise.

**Fix:** Add to FR-1.1: "The `date` field represents the farm's local date. Server-side 'not future' validation allows +1 calendar day from UTC to accommodate timezone differences."

---

## SHOULD-FIX (5)

### SF-1: Deleted bed — dangling `bed_id` reference unaddressed
**Severity:** SHOULD-FIX | **Domain:** Completeness | **Confidence:** 90%

FR-1.1 allows `bed_id` references but nothing specifies what happens when the referenced bed is deleted. The `bed_name` in list responses (API-3) would be unresolvable.

**Fix:** Add to NFR-4: "If a referenced bed no longer exists, `bed_name` returns `null` and the UI renders '(deleted bed)'."

---

### SF-2: `photo_ids` cross-farm reference — no farm-scope validation
**Severity:** SHOULD-FIX | **Domain:** Security | **Confidence:** 85%

API-4 says photo_ids must reference existing images but doesn't require same-farm ownership. A user could embed photo UUIDs from another farm.

**Fix:** Add to API-4: "Each `photo_ids` element must belong to an image whose bed is in the same farm (`entry.farm_id`)."

---

### SF-3: `activeTab` type union missing 'diary'
**Severity:** SHOULD-FIX | **Domain:** Completeness | **Confidence:** 92%

BaseLayout.astro (line 22) has `activeTab` typed as `'farm' | 'weather' | 'manage' | 'setup' | 'admin'`. FE-2 lists BaseLayout as modified but doesn't call out extending the type union.

**Fix:** Add to FE-2: "Extend `activeTab` prop union to include `'diary'`."

---

### SF-4: BaseLayout inline i18n map is hardcoded, not driven by ja.json
**Severity:** SHOULD-FIX | **Domain:** Completeness | **Confidence:** 83%

BaseLayout.astro (lines 76-81) uses a hardcoded JA object for nav labels, not the `ja.json` file. Adding `nav.diary` to `ja.json` won't automatically make it work in the nav bar.

**Fix:** Add to FE-2: "The BaseLayout inline JA translation map must also include `nav.diary: '日誌'`."

---

### SF-5: Weather Overlay (F5) scope contradiction — "in scope" vs "stretch goal"
**Severity:** SHOULD-FIX | **Domain:** Completeness | **Confidence:** 82%

Section 3.1 lists F5 as In Scope. FR-4.3 labels it "(stretch goal)." These contradict.

**Fix:** Move F5 to a "Conditional Scope" row in section 3.1, or remove the "stretch goal" label and add acceptance criteria.

---

## SUGGESTION (3)

### SG-1: Missing keyboard-nav acceptance criterion for calendar
NFR-3 requires keyboard navigation but AC-3 has no matching criterion.
**Fix:** Add to AC-3: `[ ] Calendar grid responds to arrow-key navigation; all interactive elements reachable via Tab`

### SG-2: Missing max date-range span limit
API-2 accepts arbitrary `from/to` with no max span. A request spanning 100 years would scan the entire partition.
**Fix:** Add to API-4: "Maximum date range span: 366 days."

### SG-3: Missing item size estimate for future-proofing
No DM section estimates max item size (~3KB). Beta-8 expansions could push this without a documented baseline.
**Fix:** Add to DM-2: "Estimated max item size: ~3KB (well within 400KB DynamoDB limit)."

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| **MUST-FIX** | 5 | IDOR on GSI1 lookup, farm-scope bypass, sort order, query ambiguity, timezone |
| **SHOULD-FIX** | 5 | Dangling bed ref, photo cross-farm, activeTab type, inline i18n, scope label |
| **SUGGESTION** | 3 | Keyboard a11y AC, max date range, item size estimate |

## Verdict

**Status: NEEDS REMEDIATION** — 5 MUST-FIX items require updates to BETA7-REQUIREMENTS.md before proceeding to `/cc-design`.

## Cost Impact
DynamoDB diary cost estimated at **< $0.02/month** for 10 active farms at 300 entries/month each. Budget constraint ($1.18/mo) is **not at risk**.
