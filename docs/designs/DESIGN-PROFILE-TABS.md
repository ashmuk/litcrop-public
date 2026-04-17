# Design — Profile Page Tab Restructure

> **Date**: 2026-04-17
> **Scope**: Refactor `/profile/` from single-scroll to a three-tab layout
> **Trigger**: User feedback — page is "getting messy" with all sections in one scroll

## Problem

The Profile page currently renders four unrelated domains in one vertical scroll:
1. Farm management (list, switch, create, join requests)
2. User identity (avatar, name, email, password, delete account)
3. App settings (theme, locale, temp unit)
4. Legal/info links (Terms, Privacy, What's New, Report Bug, Help)

On mobile this creates a long scroll; on desktop the content is sparse and unfocused.

## Design Decision

### Tab structure (3 tabs + footer)

| Tab | Icon | EN | JA | Default? |
|-----|------|----|----|----------|
| **Farms** | 🌾 | Farms | 農園 | **Yes** — most-used on mount |
| **You** | 👤 | You | あなた | |
| **System** | ⚙ | System | システム | |

### Footer (below tabs, always visible)

| Link | Target |
|------|--------|
| Help | /help/getting-started |
| Terms | /terms |
| Privacy | /privacy |
| Report a Bug | /report-bug |

### Tab → content mapping

**Farms tab**
- Farm list with switch/active indicator
- "New Farm" wizard trigger
- Join request list (owner view)
- Farm discovery (staff view)

**You tab**
- Profile picture + edit/delete
- Display name + edit
- "Signed in as" email
- Change password (collapsible)
- Delete account (danger zone, at bottom)

**System tab**
- Theme switcher (Light / Dark / Earthy / System)
- Language selector (EN / 日本語)
- Temperature unit (°C / °F)
- **Help** category card:
  - How-To: Getting Started (→ /help/getting-started)
  - How-To: Pi Camera Setup Guide (→ /help/device-setup)
- **Info** category card:
  - History (version changelog, extracted from the old What's New how-to page)
  - Terms of Service (→ /terms)
  - Privacy Policy (→ /privacy)
  - Report a Bug (→ /report-bug)
- App version footer (`LitCrop v0.99.1`)

> **Note on the What's New split**: the current `/whats-new` page contains
> both a "Getting Started" how-to guide AND a version changelog. This
> redesign splits them:
> - The how-to becomes `/help/getting-started` (new page, linked from Help)
> - The changelog becomes `/history` (new page, linked from Info)
> - The old `/whats-new` route can redirect to `/history` for backward compat

### Tab bar UX

| Property | Decision | Rationale |
|----------|----------|-----------|
| Position | Sticky at top of content area (below page heading) | Stays visible on scroll within each tab |
| Style | Segmented-control-style pill (not underline tabs) | Matches the earthy theme's rounded aesthetic |
| Deep-link | `?tab=farms\|you\|system` URL param | Shareable, bookmarkable |
| Default | `farms` (or URL param if present) | Farm management is the primary action |
| Persistence | No localStorage — always default to Farms | Avoids confusion on fresh visit |
| Mobile | Full-width segmented bar, equal thirds | All three fit at 375px |
| Desktop | Centered segmented bar, max-width 480px | Doesn't stretch across 1280px layout |
| Animation | None — instant panel swap | Keeps it fast; no swipe gesture |

### Accessibility

- `role="tablist"` on the tab bar
- `role="tab"` + `aria-selected` on each tab button
- `role="tabpanel"` + `aria-labelledby` on each content panel
- Keyboard: arrow keys move focus between tabs; Enter/Space activates
- `id` linkage: tab `id="tab-farms"` ↔ panel `aria-labelledby="tab-farms"`

### i18n

New keys needed in `en.json` / `ja.json` (under `profile.*`):
- `profile.tab_farms` / `農園`
- `profile.tab_you` / `あなた`
- `profile.tab_system` / `システム`

Tab labels also get `data-i18n` for the static-label translation path (same as nav labels).

## Component plan

### Current: `ProfilePage.tsx` (monolith, ~1150 LOC)

### After:
```
ProfilePage.tsx        (~100 LOC) — tab bar + state + panel switch
├── ProfileFarmsTab    (extracted from existing farm section)
├── ProfileYouTab      (extracted from existing identity section)
└── ProfileSystemTab   (new: settings + help/whats-new + version)
```

Legal links move OUT of ProfilePage entirely → into the Astro template
(`profile/index.astro`) as a static footer below the Preact island.

### What stays the same
- All API calls, state management, and handlers stay inside ProfilePage
- The tab components receive props/callbacks, not own state
- No new API endpoints; no schema changes

## Visual reference

See `docs/mockups/profile-tabs.html` for the interactive mockup.
