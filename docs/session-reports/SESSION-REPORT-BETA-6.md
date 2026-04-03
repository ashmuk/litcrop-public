# Session Report: Beta-6

**Date**: 2026-04-03
**Sprint**: Beta-6 — Pi Setup + Refinements + Crop Library
**Version**: v0.34 → v0.35+ (tag pending update)
**Branch**: develop (merged to main via PRs #259–#263)

---

## Summary

Full Beta-6 sprint delivery in a single session. Implemented 4 planned issues (#232, #233, #250, #216+#257), fixed 1 bug (#258), and applied the complete review pipeline (simplify + cc-review + cc-remediate) on each batch. Followed the design-first approach for the crop library feature (cc-define → cc-design → cc-review → cc-implement).

---

## Completed Issues

| # | Issue | Type | Commits | PRs |
|---|-------|------|---------|-----|
| — | Promo code registration gate | feat | 1 | #259 |
| #232 | Role rename manager→owner, observer→staff | refactor | 1 (31 files) | #259 |
| #250 | Promote + demote members | feat | 3 | #259, #260, #261 |
| #233 | Pi ~/litcrop/ setup — capture.sh + install.sh | feat | 1 | #259 |
| #258 | Thumbnail race condition (DynamoDB before S3) | fix | 1 | #263 |
| #216 | Searchable crop library (100 crops, EN/JA) | feat | 3 | pending |
| #257 | Crop emoji icons on Crops/Layout pages | feat | 1 | pending |
| #242 | Animated device-to-cloud diagram | — | — | Deferred |

## Deferred

- **#242**: Animated HTML/CSS diagram — deferred to a later stage (not priority for beta field testing)
- **#216 crop library**: No external API (OpenFarm/AGROVOC) — bundled JSON only for now

---

## Key Metrics

| Metric | Start | End | Delta |
|--------|-------|-----|-------|
| Tests | 511 | 547 | +36 |
| Files changed | — | 54 | — |
| Lines added | — | +2,451 | — |
| Lines removed | — | -586 | — |
| PRs merged to main | — | 5 (#259–#263) | — |
| MUST-FIX found | — | 3 (Beta-6 core) + 0 (crop library) | All resolved |
| SHOULD-FIX found | — | 6 + 1 | All resolved |

---

## Design Pipeline Applied

### Crop Library (#216 + #257) — Full Pipeline

| Step | Skill | Outcome |
|------|-------|---------|
| 1. Define | `/cc-define` | 10 FRs, 4 NFRs, 4 constraints in REQUIREMENTS.md |
| 2. Architecture | `/cc-design` | ARCHITECTURE-CROP-LIBRARY.md — data schema, component spec |
| — Review | `/cc-review` | 4 MUST-FIX caught pre-implementation (locale, IME, null-guard, categories) |
| 3. Implement | `/cc-implement` | 3 commits: data, component, integration |
| 4. Simplify | `/simplify` | 12 fixes (timer leak, O(n2), a11y, double lookups) |
| 5. Review | `/cc-review` | Conditional accept — 1 SHOULD-FIX (clarified), 7 suggestions |
| 6. Remediate | `/cc-remediate` | 2 fixes (blur cleanup, weather filter) |
| 7. Test | `/cc-test` | 29 unit tests for crops.ts module |

### Beta-6 Core (#232, #250, #233) — Standard Pipeline

| Step | Outcome |
|------|---------|
| Implement | 4 commits (promo gate, role rename, promote, Pi scripts) |
| Simplify | 8 fixes (activity log, soleMemberFarms, stale comments, etc.) |
| Review | 3 MUST-FIX (source injection, IdToken, test coverage) |
| Remediate | All resolved + 5 SHOULD-FIX (process list exposure, JWT delimiter, etc.) |

---

## Notable Bugs Found & Fixed

### #258 — Thumbnail Race Condition
**Root cause**: S3 upload triggered the thumbnail Lambda before the DynamoDB image record was written. The Lambda queried GSI1, found nothing, and silently skipped — `thumbnail_key` was never set.
**Fix**: Swapped order — DynamoDB write first, then S3 upload.

### Notification Map Missing Event
**Root cause**: Adding `member.role_changed` to `AppEventMap` without adding it to `SHOULD_NOTIFY_MAP` in `notification.ts` — caught by CI typecheck.

### userId ReferenceError
**Root cause**: Self-change guard in demote button referenced `userId` (undefined) instead of `currentUser?.sub`.

---

## DynamoDB Migration

Ran `scripts/migrate-roles.ts` against `litcrop-mvp` table:
- 4 membership records: manager→owner, observer→staff
- 2 profile records: preferred_role updated
- Total: 6 records, completed successfully

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Promo code: hardcoded client-side | Soft barrier for beta — formalize server-side later |
| Role rename: full codebase sweep | Few beta records, easier now than post-production |
| Crop data: bundled JSON (10KB) | Zero AWS cost, offline-capable, Vite inlines at build |
| Crop translations: in crops.json, not i18n | Single source for 100+ crops, avoids maintaining parallel key files |
| CropAutocomplete: Preact, no deps | ~200 lines, follows existing component patterns |
| Thumbnail fix: DynamoDB-first order | Eliminates GSI1 propagation race without retries |

---

## Files Created

| File | Purpose |
|------|---------|
| `src/frontend/src/data/crops.json` | 100 crop entries (EN/JA/emoji/category) |
| `src/frontend/src/lib/crops.ts` | Crop lookup helpers and search |
| `src/frontend/src/components/CropAutocomplete.tsx` | Searchable autocomplete with chips |
| `src/frontend/src/__tests__/crops.test.ts` | 29 unit tests for crop module |
| `scripts/migrate-roles.ts` | One-time DynamoDB role value migration |
| `docs/ARCHITECTURE-CROP-LIBRARY.md` | Crop library architecture |
| `docs/feedback/REVIEW-FINDINGS.md` | Beta-6 core review findings |
| `docs/feedback/REVIEW-FINDINGS-CROP-LIBRARY.md` | Crop library design review |
| `docs/feedback/REVIEW-FINDINGS-CROP-IMPL.md` | Crop library implementation review |
| `docs/feedback/REMEDIATION.md` | Beta-6 remediation report |

---

## Remaining Work

- [ ] PR + merge crop library commits to main
- [ ] Update tag v0.35 to include crop library
- [ ] Deploy API + frontend
- [ ] Smoke test: crop selection, emoji display, promote/demote buttons

---

*Session completed: 2026-04-03*
