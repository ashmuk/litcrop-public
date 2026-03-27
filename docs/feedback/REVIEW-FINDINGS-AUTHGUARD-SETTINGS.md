# Review Findings: AuthGuard Settings Sync

> Date: 2026-03-27 | Reviewer: my-reviewer agent | Scope: Settings timing fix (F-01 follow-up)

## Verdict: APPROVE — SHOULD-FIX items remediated

## Findings

| File:Line | Issue | Severity | Status |
|-----------|-------|----------|--------|
| `AuthGuard.tsx:45,49` | No validation of locale/temp_unit against allowed values (ProfilePage validates) | SHOULD-FIX | FIXED — added THEME_OPTIONS/LOCALE_OPTIONS/temp_unit validation |
| `AuthGuard.tsx:37-60` | Duplicate settings-sync logic between AuthGuard and ProfilePage | SUGGESTION | Noted — extract shared utility in future refactor |
| `AuthGuard.tsx:58` | `settings-synced` only fires on theme change, not unconditionally like ProfilePage | SUGGESTION | Accepted — conditional dispatch is intentional to avoid no-op re-renders |
| `AuthGuard.tsx:37` | Race condition with ProfilePage settings sync (two API calls on /profile/) | SUGGESTION | Accepted — harmless, both write same values |

## Positives

- Change-detection guards prevent unnecessary DOM mutations and event dispatches
- Non-blocking fire-and-forget pattern consistent with existing getMyProfile() call
- Error logging present (not silently swallowed)
- First-login edge case handled correctly (null !== value → applies settings)
