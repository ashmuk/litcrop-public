# Review Findings — Beta-5 Design Documents

> Reviewed: 2026-04-02 — ARCHITECTURE.md §13, UX-DESIGNS.md §15, PREREQUISITES.md §7
> Scope: #210 (device management) + #160 (profile picture)

## Findings

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | JWT terminology: doc said "validates refresh token" — should be "validates access token (obtained from refresh token)" | MUST-FIX | FIXED |
| 2 | S3 thumbnail trigger fires on `avatars/` — suffix filter won't exclude `.jpg` avatars | MUST-FIX | FIXED |
| 3 | Option A/B conflation in auth description | SHOULD-FIX | FIXED |
| 4 | `upload_url` in config poll — UX had it, architecture didn't | SHOULD-FIX | FIXED |
| 5 | Test-shot endpoint should be farm-scoped | SHOULD-FIX | FIXED |
| 6 | Initials logic says "first character" but wireframe shows 2 chars | SHOULD-FIX | FIXED |
| 7 | Registration API missing default config values | SHOULD-FIX | FIXED |
| 8 | `admin@example.com` flagged as typo — confirmed correct | SHOULD-FIX | NOT A BUG |
| 9 | Bcrypt timing side-channel — dummy hash for missing device | SUGGESTION | FIXED |
| 10 | Access pattern 14 missing SK=`#META` | SUGGESTION | FIXED |
| 11 | Profile picture POST should return 201 | SUGGESTION | FIXED |
| 12 | No device count limit per farm | SUGGESTION | FIXED |
| 13 | Test Shot button should be disabled for offline devices | SUGGESTION | FIXED |
| 14 | sharp dependency duplication — clarify bundling strategy | SUGGESTION | FIXED |

## Summary
- **MUST-FIX**: 2/2 resolved
- **SHOULD-FIX**: 6/7 resolved (1 not a bug)
- **SUGGESTION**: 5/5 resolved
- **Status**: RESOLVED in 1 iteration
