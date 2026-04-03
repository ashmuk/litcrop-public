# Remediation Report: Beta-7 Farm Diary Requirements

## Summary
- **Review source:** `docs/feedback/REVIEW-FINDINGS-BETA7-REQUIREMENTS.md`
- **Iterations:** 1 of 3 max
- **Status:** RESOLVED

## Findings Resolution

| # | Finding | Severity | Status | Fix Applied |
|---|---------|----------|--------|-------------|
| MF-1 | IDOR risk — GSI1 lookup lacks farm-scope guard | MUST-FIX | FIXED | Added FR-1.6 farm-scope guard requirement; updated DM-4 GSI1 row; added security note to API-1 |
| MF-2 | PATCH/DELETE farm-scope bypass | MUST-FIX | FIXED | Added security block to API-1 with 4-step verification flow |
| MF-3 | Sort order mismatch (newest-first vs DDB ascending) | MUST-FIX | FIXED | Added `ScanIndexForward: false` to DM-3 rationale and DM-4 access patterns |
| MF-4 | `begins_with` vs `between` ambiguity | MUST-FIX | FIXED | Standardized on `between` as canonical; `begins_with` downgraded to optimization note; fixed upper bound to tilde (`~`) |
| MF-5 | No timezone handling for `date` field | MUST-FIX | FIXED | Added timezone clarification to FR-1.1 and API-4 |
| SF-1 | Deleted bed — dangling `bed_id` reference | SHOULD-FIX | FIXED | Added to NFR-4: `bed_name` returns `null`, UI shows "(deleted bed)" |
| SF-2 | `photo_ids` cross-farm reference | SHOULD-FIX | FIXED | Updated API-4: images must belong to same farm |
| SF-3 | `activeTab` type union missing 'diary' | SHOULD-FIX | FIXED | Added to FE-2 BaseLayout entry |
| SF-4 | BaseLayout inline i18n map hardcoded | SHOULD-FIX | FIXED | Added to FE-2: update inline JA map with `nav.diary: '日誌'` |
| SF-5 | Weather Overlay scope contradiction | SHOULD-FIX | FIXED | Changed F5 to "conditional" in scope table; updated FR-4.3 label |
| SG-1 | Missing keyboard-nav acceptance criterion | SUGGESTION | FIXED | Added to AC-3 |
| SG-2 | Missing max date-range span limit | SUGGESTION | FIXED | Added to API-4: max 366 days |
| SG-3 | Missing item size estimate | SUGGESTION | FIXED | Added DM-5 section: ~3KB estimated max |

## Iteration Log

### Iteration 1
- **Findings addressed:** All 13 (5 MUST-FIX + 5 SHOULD-FIX + 3 SUGGESTION)
- **Files modified:** `docs/designs/BETA7-REQUIREMENTS.md`
- **Outcome:** All findings resolved in single pass — no code changes needed (requirements document only)

## Escalations
None. All findings were documentation-level fixes to the requirements specification.
