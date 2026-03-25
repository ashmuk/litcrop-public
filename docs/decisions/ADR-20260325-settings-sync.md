# ADR-20260325: Cross-Device Settings Sync

## Status
Accepted (2026-03-25)

## Context
User preferences (locale, temperature unit, theme) are stored in localStorage only. Changing settings on desktop does not reflect on mobile, and clearing browser data loses all preferences. This is issue #90.

### Current State
- Three localStorage keys: `litcrop-locale`, `litcrop-temp-unit`, `litcrop-theme`
- `ProfilePage.tsx` reads/writes locale and temp unit
- `ThemeSwitcher.tsx` reads/writes theme
- `applyLocale()` currently syncs locale to the active *farm* via `updateFarm()` — this is incorrect because locale is a user preference, not a farm attribute
- No server-side persistence of user preferences

### Requirements
- Settings must sync across devices for the same user
- First load on a new device should reflect the user's saved preferences
- UI must remain responsive (no blocking network calls for settings changes)
- Must work offline (localStorage fallback when API is unreachable)

### Decision Drivers
- Beta testers use both desktop and mobile
- The existing `GET/PATCH /me/profile` pattern provides a template
- DynamoDB `USER#` partition already hosts profile data — adding settings is zero-cost in terms of access patterns

## Options Considered

### Option A: Merge settings into User Profile record
- **Description**: Add `locale`, `temp_unit`, `theme` fields to the existing `USER#{userId} / #PROFILE` DynamoDB item. Modify `getUserProfile` and `upsertUserProfile` to include these fields.
- **Pros**: Single DB read for profile + settings; no new endpoints
- **Cons**: Widens `upsertUserProfile` (risks overwriting profile fields on settings-only updates); breaks `itemToUserProfile` and all tests mocking it; couples two independent concerns; PATCH semantics become ambiguous (is the caller updating their name or their locale?)
- **Rejected**: Coupling profile and settings violates single-responsibility; would require updating all existing profile tests

### Option B: Separate #SETTINGS DynamoDB item (chosen)
- **Description**: Create a new item `PK=USER#{userId}, SK=#SETTINGS` storing `{ locale, temp_unit, theme, updated_at }`. Add `GET /me/settings` and `PATCH /me/settings` routes to the existing `me.ts` router.
- **Pros**: Clean separation from profile; independent fetch/update; follows the `#PROFILE` precedent; zero impact on existing profile code and tests; same `USER#` partition (no new GSI)
- **Cons**: One additional DynamoDB read on profile page load (but it's a single `GetItem`, ~1ms)
- **Chosen**: Best fit for existing patterns and minimal coupling

### Option C: Store settings in Cognito custom attributes
- **Description**: Use Cognito user pool custom attributes (`custom:locale`, `custom:theme`, `custom:temp_unit`). Read from JWT claims.
- **Pros**: Available in every JWT without an API call; no DynamoDB cost
- **Cons**: Cognito custom attributes are limited (max 50, 2048 bytes total); changing them requires `UpdateUserAttributes` API call (slow); values not available until next token refresh; Cognito is not designed for frequently changing data
- **Rejected**: Poor fit for settings that change often

## Decision

**Option B** — Separate `#SETTINGS` DynamoDB item with dedicated API endpoints.

### Data Model
```
PK: USER#{userId}    SK: #SETTINGS
{
  locale:     "en" | "ja"                          (default: "en")
  temp_unit:  "C" | "F"                            (default: "C")
  theme:      "light" | "dark" | "earthy" | "system"  (default: "system")
  updated_at: ISO-8601 string
}
```

### API Endpoints
- `GET /api/v1/me/settings` — Returns stored settings or defaults if no item exists
- `PATCH /api/v1/me/settings` — Merge-updates provided fields, returns full settings

### Frontend Strategy
- **Read**: localStorage is primary (synchronous, zero latency). API fetch on mount overwrites localStorage if values differ (API is authoritative).
- **Write**: Both localStorage and API are updated together. localStorage is immediate; API is fire-and-forget for responsiveness. Network failure does not block the user.
- **Offline**: localStorage values remain as fallback. Next successful API call will sync.

### Ownership Correction
`applyLocale()` currently calls `updateFarm(activeFarmId, { locale })`, treating locale as a farm attribute. This ADR corrects ownership: locale is a user preference stored in `#SETTINGS`, not on the farm record. The farm's `locale` field remains for backward compatibility but is no longer the primary source.

## Consequences

### Positive
- Settings persist across devices and browser data clears
- Existing profile code is untouched
- Follows established `#PROFILE` pattern in the same partition
- Fire-and-forget writes maintain UI responsiveness

### Negative
- One additional DynamoDB `GetItem` per profile page load (~1ms, negligible)
- Settings and profile are fetched separately (two network requests on mount)

### Risks
- **Race condition**: If user changes a setting while the initial fetch is in-flight, the fetch response could overwrite the new value. Mitigate by tracking a `settingsDirty` flag.
- **Cache staleness**: If another device changes settings, the current device won't know until the next profile page load. Acceptable for beta — real-time sync (WebSocket) deferred to PROD.

## Rollback Plan
Remove the `#SETTINGS` DynamoDB items and the two routes from `me.ts`. Revert frontend to localStorage-only. No data migration needed — the items are standalone.
