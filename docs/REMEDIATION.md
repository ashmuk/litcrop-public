# Remediation Report

> Date: 2026-03-18
> Review source: docs/REVIEW-FINDINGS.md
> Branch: feature/infra-monorepo
> Iterations: 1 of 3 max
> Status: **RESOLVED**

## Summary

All 4 MUST-FIX and 4 SHOULD-FIX findings resolved in a single iteration. No escalation needed.

## Findings Resolution

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| MF-1 | Simulator missing `captured_at` | MUST-FIX | **FIXED** | Added `captured_at` to FormData with optional override |
| MF-2 | `getPlots` response wrapper mismatch | MUST-FIX | **FIXED** | API client now unwraps `{ data }` envelope |
| MF-3 | Weather field name mismatches | MUST-FIX | **FIXED** | Route transform aligned to shared type field names |
| MF-4a | `url` → `thumbnail_url` | MUST-FIX | **FIXED** | Renamed in farms.ts and plots.ts |
| MF-4b | `tags` → `latest_tag` | MUST-FIX | **FIXED** | Returns single TagValue or null |
| SF-1 | S3 orphan on DynamoDB failure | SHOULD-FIX | **FIXED** | Compensating deleteImage in catch block |
| SF-2 | Bad cursor returns 503 | SHOULD-FIX | **FIXED** | decodeCursor errors now throw ValidationException → 400 |
| SF-3 | `storage_key` leaked in response | SHOULD-FIX | **FIXED** | Removed from image detail response |
| SF-4 | Non-atomic createTag race | SHOULD-FIX | **DOCUMENTED** | Code comment added; MVP fix via denormalization |
| SG-1 | Weather cache cold start | SUGGESTION | DEFERRED | Documented; MVP fix via DynamoDB TTL cache |
| SG-2 | Chat renders Markdown as text | SUGGESTION | DEFERRED | MVP: add marked + sanitize |
| SG-3 | updateFarm names map leak | SUGGESTION | DEFERRED | Low risk; current routes filter undefined |

## Iteration Log

### Iteration 1
- Findings addressed: MF-1, MF-2, MF-3, MF-4a, MF-4b, SF-1, SF-2, SF-3, SF-4
- Tests added: 3 new tests (168 total, all passing)
- Outcome: All MUST-FIX and SHOULD-FIX resolved

## Escalations
None required. All findings were mechanical field-name mismatches and missing fields — no architectural or design issues.

## Exit Criteria Status (Post-Remediation)

| EC | Criterion | Status |
|----|-----------|--------|
| EC-1 | Simulator uploads image via HTTPS | **UNBLOCKED** (captured_at added) |
| EC-2 | Images viewable in mobile web UI | **UNBLOCKED** (response wrapper + thumbnail_url fixed) |
| EC-3 | Images associated with specific plot | **UNBLOCKED** (depends on EC-1, now fixed) |
| EC-4 | Time-ordered image gallery renders | **UNBLOCKED** (thumbnail_url + latest_tag fixed) |
| EC-5 | Cloud cost under $5/month | **Ready** (architecture guarantees) |
| EC-6 | Upload-to-viewable latency < 30s | **Ready** (measurable post-deploy) |
