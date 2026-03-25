# Beta-2 Post-Deploy Feedback (v0.28)

> Date: 2026-03-25
> Source: Live testing on deployed site
> Tester: Admin user

---

## F-01: Settings (locale, theme) not persisting reliably

**Severity**: HIGH
**Page**: Profile → settings section
**Symptoms**:
- Color theme changes but reverts on page reload
- Language selection not reflected consistently
- Settings appear to save (toast shows) but don't stick

**Possible causes**:
1. The new `GET /me/settings` API returns defaults (`{ locale: 'en', temp_unit: 'C', theme: 'system' }`) because the `#SETTINGS` DynamoDB item was never created — the user changed settings before the API was deployed, so localStorage has values but DynamoDB has nothing. On reload, the API's defaults overwrite localStorage.
2. The `settingsDirty` ref prevents overwrite during the same page session, but on a fresh page load it resets to `false`, so the API defaults win.
3. The `SETTINGS` key prefix (`#SETTINGS`) may not exist in the deployed DynamoDB table if CDK hasn't been re-deployed since the settings feature was added. The key prefix is just a constant — no schema migration needed — but the Lambda must be updated with the new code.

**Investigation needed**:
- Check if the deployed Lambda has the settings sync code (v0.25+)
- Check browser console for API errors on `/me/settings`
- Check if `PATCH /me/settings` is actually being called (network tab)
- If API returns defaults, the `getMySettings().then()` callback overwrites localStorage on every load

---

## F-02: Admin [Manage] tab intermittent on desktop

**Severity**: HIGH
**Page**: Desktop navigation bar (1024px+)
**Symptoms**:
- Admin tab (gear icon) sometimes appears, sometimes doesn't
- Behavior is inconsistent — works on some page loads, not others
- Mobile bottom bar may have the same issue

**Possible causes**:
1. `getCachedIsAdmin()` reads `localStorage('litcrop-isAdmin')`. The cache is set by `ProfilePage.tsx` via `setCachedIsAdmin(p.is_admin === true)`. If the user navigates to a non-Profile page first, the cache hasn't been set yet → `DesktopNav` reads `false` → no admin tab.
2. The `DesktopNav` component reads `isAdmin` as a `const` (not state), so it's evaluated once at mount. If the Profile page loads later and sets the cache, the DesktopNav on the current page doesn't re-render.
3. `AdminTabInjector` (mobile) runs on mount — if the cache isn't set yet, the tab is never injected. No mechanism to retry after the cache is populated.
4. Race condition: `getMyProfile()` hasn't completed by the time `DesktopNav` mounts.

**Root cause likely**: The admin cache is only populated on Profile page visit. Any page visited before Profile won't show the admin tab until a full page reload after Profile has been visited.

**Fix options**:
- (a) Move `setCachedIsAdmin` into `AuthGuard` so it runs on every page load
- (b) Have `DesktopNav` fetch `/me/profile` itself (adds an API call per page)
- (c) Set the admin flag during login flow (in `signIn` success handler)

---

## F-03: Admin cannot delete farm named 'test'

**Severity**: MEDIUM
**Page**: Profile → farm card → Delete button
**Symptoms**:
- Clicking Delete on the 'test' farm does nothing or shows error
- Admin user is not the owner of 'test' farm (created by another user)

**Possible causes**:
1. The `DELETE /farms/:farmId` endpoint requires `admin` or `manager` role via `assertFarmAccess(farmId, userId, ['admin', 'manager'])`. But this endpoint does NOT pass `isAdmin` (system admin bypass). So a system admin who is not a farm member gets 404.
2. The frontend shows the Delete button based on `isAdmin` (per-farm role, `farm.role === 'admin' || farm.role === 'manager'`). For system admin viewing all farms via `getAllFarms()`, the role is set to `'admin'` (synthetic). So the button appears, but the API rejects the request because DELETE doesn't have the admin bypass.
3. This is the same pattern as the PATCH endpoint — write routes intentionally don't get admin bypass. But for DELETE, the system admin should be able to delete any farm.

**Fix needed**: Either (a) pass `isAdmin` to `assertFarmAccess` in the DELETE route, or (b) add a separate admin delete path that checks `isAdmin` from auth context.

---

## Priority

| # | Issue | Severity | Likely Fix |
|---|-------|----------|-----------|
| F-02 | Admin tab intermittent | HIGH | Move setCachedIsAdmin to AuthGuard |
| F-01 | Settings not persisting | HIGH | Check deploy state; may be stale Lambda |
| F-03 | Admin can't delete farm | MEDIUM | Add isAdmin bypass to DELETE route |

---

*Collected: 2026-03-25 | v0.28 post-deploy*
