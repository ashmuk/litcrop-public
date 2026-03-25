# Remediation Report

> Date: 2026-03-20
> Review source: docs/REVIEW-FINDINGS.md
> Branch: develop
> Iterations: 1 of 3 max (residual fix applied within same iteration)
> Status: **RESOLVED**

## Summary

All 6 MUST-FIX and 7 SHOULD-FIX findings resolved in a single iteration. 1 residual (HourlyForecast/DailyForecast field naming in API-CONTRACTS.md §8) caught during re-validation and fixed immediately. No escalation needed.

## Findings Resolution

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| MF-1 | 403 vs 404 for ownership failures | MUST-FIX | **FIXED** | API-CONTRACTS.md: all ownership 403→404; §4b code example updated; FORBIDDEN reserved for future RBAC. UX-DESIGNS.md: 403 error row → 404 generic "Farm not found" |
| MF-2 | Pagination envelope mismatch | MUST-FIX | **FIXED** | SYSTEM-DESIGN.md: `pagination` → `meta`, removed `has_more`, added `limit` |
| MF-3 | Weather response field naming | MUST-FIX | **FIXED** | API-CONTRACTS.md §8: CurrentWeather, HourlyForecast, DailyForecast all aligned to Zod short names |
| MF-4 | Zod FarmBaseSchema missing `user_id` | MUST-FIX | **FIXED** | Added `user_id: z.string()` to FarmBaseSchema |
| MF-5 | Zod ImageDetailResponseSchema missing `thumbnail_url` | MUST-FIX | **FIXED** | Added `thumbnail_url: z.string().nullable()` to ImageDetailResponseSchema |
| MF-6 | S3 bucket name inconsistency | MUST-FIX | **FIXED** | All `litcrop-poc-images` → `litcrop-mvp-images` in API-CONTRACTS.md |
| SF-1 | FarmPlotItem / PlotSummary field alignment | SHOULD-FIX | **FIXED** | Added `bed_id`, `field_id` to PlotSummary; removed `url` from LatestImage |
| SF-2 | ImageListItem vs ImageSummary divergence | SHOULD-FIX | **FIXED** | Changed to flat `latest_tag` in API-CONTRACTS.md; removed TagSummary |
| SF-3 | ChatResponse.tool_calls undocumented | SHOULD-FIX | **FIXED** | Added optional `tool_calls` to API-CONTRACTS.md §5.11 |
| SF-4 | CropImpact severity enum mismatch | SHOULD-FIX | **FIXED** | `"critical"` → `"danger"`, added `"good"` in API-CONTRACTS.md §8 |
| SF-5 | UX 403 error state | SHOULD-FIX | **FIXED** | Addressed as part of MF-1 |
| SF-6 | Single-farm-per-user constraint undocumented | SHOULD-FIX | **FIXED** | Added constraint callout in ARCHITECTURE.md §4 |
| SF-7 | UX-DESIGNS.md duplicate section numbering | SHOULD-FIX | **FIXED** | Toast Notification renumbered to §5.11 |

## Iteration Log

### Iteration 1
- Findings addressed: MF-1 through MF-6, SF-1 through SF-7
- Outcome: 12/13 fixed; 1 residual (MF-3 partial — HourlyForecast/DailyForecast field names)

### Iteration 1b (residual fix)
- Findings addressed: MF-3 residual (HourlyForecast + DailyForecast field naming in API-CONTRACTS.md §8)
- Outcome: All 13 findings fully resolved

## Escalations
None required. All findings were cross-document consistency mismatches — no architectural or design flaws.

## Phase E Gate Status (Post-Remediation)

| Gate | Verdict | Status |
|------|---------|--------|
| Gate 1: Architecture + System Design | CONDITIONAL PASS → **PASS** | All findings resolved |
| Gate 2: UX + API Contracts | CONDITIONAL PASS → **PASS** | All findings resolved |

**Phase E is complete.** Design documents are internally consistent and ready for task breakdown / implementation.
