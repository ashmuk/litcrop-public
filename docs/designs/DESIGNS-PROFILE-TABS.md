# System Design — Profile Page Tab Refactor

> **Scope**: `ProfilePage.tsx` monolith → shell + 3 tab components  
> **Route changes**: new `/help/getting-started`, new `/history`, redirect `/whats-new`  
> **Builds on**: `docs/designs/DESIGN-PROFILE-TABS.md` (UX approved), `docs/mockups/profile-tabs.html`

---

## 1. Component Architecture

### Before

```
profile/index.astro
└── ProfilePage.tsx   (~1 150 LOC)
      ├── ChangePasswordSection       (internal function component)
      ├── DeleteAccountSection        (internal function component)
      ├── FarmWizard                  (conditional full-screen takeover)
      ├── ThemeSwitcher
      ├── FarmDiscovery
      ├── JoinRequestList
      ├── ProfilePicture / Avatar
      └── FarmLocationMap
```

### After

```
profile/index.astro                  (Astro — adds footer, keeps page heading)
├── ProfilePage.tsx   (~120 LOC)     (Preact — tab shell only)
│     ├── ProfileFarmsTab.tsx        (extracted)
│     ├── ProfileYouTab.tsx          (extracted)
│     └── ProfileSystemTab.tsx       (new)
└── <footer> static legal links      (Astro — no JS)
```

### ProfilePage.tsx (shell, ~120 LOC)

Responsibilities after refactor:
- Read `?tab=` URL param on mount; default to `farms`
- Hold `activeTab: 'farms' | 'you' | 'system'` state
- Render the segmented-control tab bar (`role="tablist"`)
- Keyboard arrow-key navigation between tabs
- Push `?tab=<name>` via `history.replaceState` on switch
- Render the active `<div role="tabpanel">` (unmount-on-switch, no lazy loading needed)
- Lift shared data that crosses tabs: `farms`, `loading`, `activeFarmId`, `userEmail`, `displayName`, `profilePictureUrl`, `locale`, `tempUnit`, `preferredRole`, `isSystemAdmin`
- Pass all API call handlers as props so tabs contain no direct API imports

### ProfileFarmsTab.tsx (extracted, ~480 LOC)

Extracted directly from the current "Farm Section" block (lines 699–1018).  
Contains: farm list, inline expand, farm name edit, confirm delete/leave, role change, `FarmDiscovery`, `JoinRequestList`, `FarmWizard` takeover, `FarmLocationMap`.  
Receives as props: `farms`, `loading`, `activeFarmId`, `pendingCounts`, `canCreateFarm`, `atFarmLimit`, and all farm-related handlers.

### ProfileYouTab.tsx (extracted, ~300 LOC)

Extracted from the current "You Section" block (lines 1020–1163), minus settings controls which move to ProfileSystemTab.  
Contains: `ProfilePicture`, display name edit, email, `ChangePasswordSection`, Log out button, `DeleteAccountSection`.  
Receives as props: `userEmail`, `displayName`, `profilePictureUrl`, `farms`, and identity handlers.

### ProfileSystemTab.tsx (new, ~120 LOC)

New component. Does not call any API directly — settings persistence stays in the shell.  
Contains three cards:
1. **App Settings card** — `ThemeSwitcher`, locale select, temp unit select (wired to shell handlers)
2. **Help card** — two `<a>` links: `/help/getting-started`, `/help/device-setup`
3. **Info card** — four `<a>` links: `/history`, `/terms`, `/privacy`, `/report-bug`
4. **Version footer** — `LitCrop {__APP_VERSION__}` (same pattern as current You section)

Receives as props: `locale`, `tempUnit`, `onLocaleChange`, `onTempUnitChange`.

### Props Flow Diagram

```
ProfilePage (shell)
  │
  ├── activeTab state
  ├── farms, loading, activeFarmId, pendingCounts          ──► ProfileFarmsTab
  ├── userEmail, displayName, profilePictureUrl            ──► ProfileYouTab
  ├── locale, tempUnit, preferredRole, isSystemAdmin       ──► ProfileSystemTab
  ├── refreshFarms, handleSwitchFarm, handleDeleteFarm …   ──► ProfileFarmsTab
  ├── handleLogout, handleSaveName …                       ──► ProfileYouTab
  └── applyLocale, applyTempUnit                           ──► ProfileSystemTab
```

### What stays identical (zero changes)

- All API imports (`getMyFarms`, `updateMySettings`, etc.)
- All handler functions (`applyLocale`, `applyTempUnit`, `handleSwitchFarm`, etc.)
- All `useEffect` data loading in ProfilePage
- All sub-components: `FarmWizard`, `ThemeSwitcher`, `ProfilePicture`, `Avatar`, `FarmLocationMap`, `JoinRequestList`, `FarmDiscovery`, `ChangePasswordSection`, `DeleteAccountSection`
- `translateNavLabels`, `settingsDirty` ref, localStorage keys
- `FarmWizard` full-screen takeover pattern (shell short-circuits tab render when `showWizard === true`)

---

## 2. Route Changes

| Route | Before | After |
|-------|--------|-------|
| `/profile/` | single-scroll page | tab layout, `?tab=farms\|you\|system` |
| `/help/getting-started` | does not exist | new Astro page — Getting Started guide (extracted from LegalPage `whats-new` content + `guide.*` i18n keys) |
| `/history` | does not exist | new Astro page — version changelog (extracted from LegalPage `whats-new` changelog section) |
| `/whats-new` | `LegalPage page="whats-new"` | redirect to `/history` (Astro `Astro.redirect` or `<meta http-equiv>`) |

### /help/getting-started

- Uses `AuthLayout variant="hero"` (same as `/help/device-setup`)
- Bilingual `data-lang="en"/"ja"` dual-render pattern (same as device-setup)
- Content: `guide.summary`, `guide.feature_*` list, `guide.step1_title/desc` … `guide.step5_title/desc`
- Back link: `/profile/?tab=system`

### /history

- Uses `AuthLayout variant="hero"`
- Extracts the changelog section currently inside `LegalPage` (`page="whats-new"`)
- Content driven by `legal.whats_new_intro` + existing version entries
- Back link: `/profile/?tab=system`

---

## 3. CSS Strategy

No new CSS files. All new styles follow existing patterns.

| Element | CSS approach |
|---------|-------------|
| Tab bar (`.profile-tabs`) | New ruleset in `profile/index.astro` `<style>` block — scoped to this page only. Mirrors `.tab-bar` / `.tab-bar__inner` / `.tab-btn` from the mockup's `style.css`. |
| Active tab pill | `.tab-btn[aria-selected="true"]` — white fill, `box-shadow: var(--shadow-sm)`, earthy text. Token reuse only. |
| Tab panels | `display: none` / `display: block` toggled by Preact state. No CSS class toggling needed. |
| System tab cards | Reuse existing `.form-group`, `border`, `border-radius`, `var(--color-surface)` pattern already used in the You section. No new card class needed. |
| Info link rows | Inline styles matching the current Help/Legal link pattern in the monolith. |
| Legal footer (Astro) | New `<footer>` in `profile/index.astro`. Inline styles matching AuthLayout footer (`font-size-xs`, `color-gray-400`, centered flex). |
| Desktop centering | `max-width: 640px; margin: 0 auto` on tab panel content — matches the mockup's desktop rule. |

---

## 4. i18n Key Additions

### en.json additions

Under `profile`:
```json
"tab_farms":   "Farms",
"tab_you":     "You",
"tab_system":  "System",
"help":        "Help",
"info":        "Info",
"app_settings": "App Settings"
```

Under `help` (new namespace):
```json
"getting_started": "How-To: Getting Started",
"device_setup":    "How-To: Pi Camera Setup Guide"
```

Under `info` (new namespace):
```json
"history": "History"
```

Under `footer` (new namespace):
```json
"help": "Help"
```

### ja.json additions (same keys)

```json
"profile.tab_farms":   "農園",
"profile.tab_you":     "あなた",
"profile.tab_system":  "システム",
"profile.help":        "ヘルプ",
"profile.info":        "情報",
"profile.app_settings":"アプリ設定",
"help.getting_started":"はじめかた",
"help.device_setup":   "Piカメラ セットアップガイド",
"info.history":        "更新履歴",
"footer.help":         "ヘルプ"
```

### i18n-labels.js additions

`public/scripts/i18n-labels.js` — add to the `JA` map (used for static `[data-i18n]` elements rendered by Astro, not Preact):

```js
'profile.tab_farms':   '農園',
'profile.tab_you':     'あなた',
'profile.tab_system':  'システム',
'footer.help':         'ヘルプ',
```

The tab buttons and footer links rendered inside the Preact island use `t()` directly, so they do not need `i18n-labels.js` entries. Only the Astro-rendered footer links need static label support — specifically `footer.help` on the `<a data-i18n="footer.help">Help</a>` in `profile/index.astro`.

---

## 5. Accessibility Spec

Carried forward from the approved UX design; repeated here as the implementation contract:

```html
<div role="tablist" aria-label="Profile sections">
  <button role="tab" id="tab-farms"  aria-selected="true"  aria-controls="panel-farms">
  <button role="tab" id="tab-you"   aria-selected="false" aria-controls="panel-you">
  <button role="tab" id="tab-system" aria-selected="false" aria-controls="panel-system">
</div>

<div role="tabpanel" id="panel-farms"  aria-labelledby="tab-farms"  tabindex="0">
<div role="tabpanel" id="panel-you"   aria-labelledby="tab-you"   tabindex="0">
<div role="tabpanel" id="panel-system" aria-labelledby="tab-system" tabindex="0">
```

Keyboard handler on the tablist:
- `ArrowRight` / `ArrowLeft` — move focus; `Enter` / `Space` — activate
- No `tabindex` manipulation needed on tab buttons; only `aria-selected` changes
