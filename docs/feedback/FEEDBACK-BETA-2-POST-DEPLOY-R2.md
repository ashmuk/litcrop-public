# Beta-2 Post-Deploy Feedback Round 2 (v0.28)

> Date: 2026-03-25
> Source: Live testing on deployed site (desktop Chrome)
> Tester: Admin + 'ひさし' accounts

---

## F-04: Admin tab not shown on first page after login

**Severity**: HIGH
**Steps to reproduce**: Login as admin → lands on Crops page → no Admin tab in nav
**Expected**: Admin tab visible immediately
**Actual**: Admin tab appears only after navigating to another page

**Root cause**: AuthGuard fetches `/me/profile` and calls `setCachedIsAdmin()`, but `DesktopNav` has already rendered by the time the async call completes. `DesktopNav` reads `getCachedIsAdmin()` as a `const` at mount — it never re-reads after the cache is updated.

**Fix needed**: Either (a) DesktopNav must listen for cache changes (event-based), or (b) AuthGuard must set the cache BEFORE DesktopNav renders (blocking), or (c) DesktopNav re-reads the cache after a short delay or via a custom event.

---

## F-05: Admin tab leaks to non-admin user via localStorage cache

**Severity**: HIGH (security UX)
**Steps to reproduce**: Login as admin → admin tab cached → logout → login as 'ひさし' (non-admin) → admin tab briefly visible
**Expected**: Admin tab never shown for non-admin users
**Actual**: Admin tab appears on first page (from stale cache), disappears on navigation

**Root cause**: `localStorage('litcrop-isAdmin')` is not cleared on logout. When a different user logs in on the same browser, the previous user's admin cache persists until AuthGuard re-fetches the profile.

**Fix needed**: Clear `litcrop-isAdmin` on logout (in `signOut()` function).

---

## F-06: Settings (theme, locale) leak between user sessions

**Severity**: HIGH (privacy/UX)
**Steps to reproduce**: Login as 'ひさし' → set theme to 'earthy', locale to 'ja' → logout → login as 'admin' → admin sees earthy theme and Japanese locale
**Expected**: Each user sees their own settings
**Actual**: Settings from previous session carry over via localStorage

**Root cause**: `localStorage` keys (`litcrop-theme`, `litcrop-locale`, `litcrop-temp-unit`) are not user-scoped. They persist across logout/login. The API settings sync (`getMySettings()`) should overwrite on login, but:
1. If admin has no `#SETTINGS` item in DynamoDB, the API returns defaults with `updated_at: ''`
2. The fix from F-01 (`if (!s.updated_at) return`) skips the overwrite — so the previous user's localStorage values persist

**Fix needed**: Clear all user-specific localStorage keys on logout. This is the authoritative fix — localStorage should represent the CURRENT user's state, not a stale session.

---

## Priority

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| F-05 | Admin cache leaks between users | HIGH | Clear litcrop-isAdmin on signOut() |
| F-06 | Settings leak between users | HIGH | Clear litcrop-* keys on signOut() |
| F-04 | Admin tab not on first page | HIGH | Event-based re-render in DesktopNav |

---

*Collected: 2026-03-25 | v0.28 post-deploy round 2*
