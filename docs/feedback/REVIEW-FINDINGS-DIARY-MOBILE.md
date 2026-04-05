# Review Findings: Diary Mobile Fixes (#267, #268)

> Reviewed: 2026-04-05 | Reviewer: my-reviewer agent | Status: **ACCEPTED**

## Scope
- **#267**: Bottom sheet save button hidden behind tab bar on iPhone
- **#268**: Calendar view blank on mobile — silent fetch failures and loading state

## Findings

| File:Line | Issue | Severity | Status |
|-----------|-------|----------|--------|
| `DiaryPage.tsx:switchView` | Stale list entries briefly shown as calendar dots on view switch | SHOULD-FIX | **FIXED** — `switchView()` now clears entries and sets loading before switching |
| `components.css:1687` | Double safe-area padding in `.bottom-sheet__footer` (cosmetic) | SUGGESTION | Deferred — no layout break, minor extra padding |
| `DiaryPage.tsx:258` | eslint exhaustive-deps may flag missing `loadCalendarEntries` in useEffect | SUGGESTION | Deferred — behavior is correct, deps cover all referenced values |
| `DiaryPage.tsx:249` | No beds-specific retry (retry button only retries entries) | SUGGESTION | Deferred — beds re-fetch on view re-entry |

## Verification Checklist
- [x] 603 tests passing
- [ ] iPhone Safari: bottom sheet footer visible above tab bar
- [ ] View switch (list -> calendar): skeleton shown, no stale data flash
- [ ] Calendar month nav: no unmount/flash, calendar stays visible during fetch
- [ ] Calendar error + retry: error message shown, retry button works
- [ ] Desktop (1024px+): bottom sheet dialog unaffected by mobile offset

## Verdict
Accepted after SHOULD-FIX remediation. All must-fix and should-fix items resolved.
