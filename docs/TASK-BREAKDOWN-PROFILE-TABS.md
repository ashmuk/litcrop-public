# Task Breakdown — Profile Page Tab Refactor

> **Design refs**: `docs/designs/DESIGNS-PROFILE-TABS.md`, `docs/designs/DESIGN-PROFILE-TABS.md`  
> **Mockup**: `docs/mockups/profile-tabs.html`  
> **Source**: `src/frontend/src/components/ProfilePage.tsx` (~1 150 LOC monolith)

---

## Tasks

### T1 — Extract ProfileFarmsTab

**Files touched**
- `src/frontend/src/components/ProfileFarmsTab.tsx` (new — ~480 LOC)
- `src/frontend/src/components/ProfilePage.tsx` (remove farm section)

**Size**: M

**Dependencies**: none (can start immediately against the current monolith)

**What moves**
- Lines 699–1018 of ProfilePage: farm list, inline expand/detail, farm name edit, confirm-delete/leave inline panel, role-change confirm, `FarmLocationMap`, `FarmDiscovery`, `JoinRequestList`, `FarmWizard` full-screen takeover, "New Farm" button, `atFarmLimit` message.
- The `FarmWizard` short-circuit (`if (showWizard) return <FarmWizard … />`) moves into `ProfileFarmsTab`; the shell only passes `showWizard`/`setShowWizard` as props.

**Props interface** (defined in ProfileFarmsTab.tsx)
```ts
interface ProfileFarmsTabProps {
  farms: FarmWithRole[];
  loading: boolean;
  activeFarmId: string;
  pendingCounts: Record<string, number>;
  canCreateFarm: boolean;
  atFarmLimit: boolean;
  showWizard: boolean;
  onShowWizard: (v: boolean) => void;
  onSwitchFarm: (id: string) => void;
  onDeleteFarm: (id: string) => void;
  onLeaveFarm: (id: string) => void;
  onWizardComplete: (id: string) => void;
  onSaveFarmName: (id: string, name: string) => Promise<void>;
  onToggleFarmDetail: (id: string) => void;
  onChangeMemberRole: (farmId: string, userId: string, role: FarmRole) => Promise<void>;
  onUpdateFarmVisibility: (farmId: string, visibility: 'public' | 'private') => Promise<void>;
  expandedFarm: string | null;
  farmMembers: FarmMemberItem[] | null;
  detailLoading: boolean;
  confirmDelete: string | null;
  setConfirmDelete: (id: string | null) => void;
  confirmLeave: string | null;
  setConfirmLeave: (id: string | null) => void;
  confirmRoleChange: { userId: string; action: 'promote' | 'demote' } | null;
  setConfirmRoleChange: (v: { userId: string; action: 'promote' | 'demote' } | null) => void;
  currentUser: ReturnType<typeof getCurrentUser>;
  isSystemAdmin: boolean;
}
```

**Acceptance criteria**
- Farm list renders identically to current behavior
- Farm expand, inline edit, delete/leave confirm, role change all work
- `FarmWizard` full-screen takeover works from Farms tab
- `FarmDiscovery` renders for staff users with no farms
- No farm-related state or handlers remain in ProfilePage.tsx

---

### T2 — Extract ProfileYouTab

**Files touched**
- `src/frontend/src/components/ProfileYouTab.tsx` (new — ~300 LOC)
- `src/frontend/src/components/ProfilePage.tsx` (remove identity section)

**Size**: M

**Dependencies**: none (parallel with T1)

**What moves**
- Lines 1020–1163 of ProfilePage: `ProfilePicture`, display name edit, signed-in email, `ChangePasswordSection`, log out button, `DeleteAccountSection`.
- `ChangePasswordSection` and `DeleteAccountSection` remain as internal function components inside `ProfileYouTab.tsx` (they are only used there).
- Settings controls (ThemeSwitcher, locale select, temp unit select) do NOT move here — they go to T3.

**Props interface**
```ts
interface ProfileYouTabProps {
  userEmail: string | null;
  displayName: string;
  profilePictureUrl: string | null;
  editingName: boolean;
  savingName: boolean;
  farms: FarmWithRole[];
  onEditName: (v: boolean) => void;
  onDisplayNameChange: (v: string) => void;
  onSaveName: () => Promise<void>;
  onLogout: () => void;
}
```

**Acceptance criteria**
- Profile picture upload/remove works
- Display name edit + save works
- Change password works (Cognito call, error mapping, all states)
- Delete account flow works (two-step API call, redirect)
- Log out works
- No identity-related state remains in ProfilePage.tsx

---

### T3 — Create ProfileSystemTab

**Files touched**
- `src/frontend/src/components/ProfileSystemTab.tsx` (new — ~120 LOC)

**Size**: S

**Dependencies**: T9 (i18n keys should exist before wiring labels)

**Content**
Three cards rendered with existing token-based inline styles:
1. App Settings card: `ThemeSwitcher`, locale `<select>`, temp unit `<select>`
2. Help card: two `<a>` links — `/help/getting-started` (`help.getting_started`), `/help/device-setup` (`help.device_setup`)
3. Info card: four `<a>` links — `/history` (`info.history`), `/terms` (`legal.terms`), `/privacy` (`legal.privacy`), `/report-bug` (`legal.report_bug`)
4. Version footer: `LitCrop {__APP_VERSION__}`

Each link uses the `.info-link` pattern from the mockup (flex row, icon, chevron `›`).

**Props interface**
```ts
interface ProfileSystemTabProps {
  locale: Locale;
  tempUnit: 'C' | 'F';
  onLocaleChange: (l: Locale) => void;
  onTempUnitChange: (u: 'C' | 'F') => void;
}
```

**Acceptance criteria**
- All three cards render with correct links and i18n labels
- ThemeSwitcher, locale, and temp unit controls function (fire handlers)
- Version string renders correctly from `__APP_VERSION__`
- Chevron arrows on info links match mockup

---

### T4 — Refactor ProfilePage shell

**Files touched**
- `src/frontend/src/components/ProfilePage.tsx` (replace body with tab shell — ~120 LOC after T1+T2+T3)

**Size**: S

**Dependencies**: T1, T2, T3

**What stays in the shell**
- All state declarations (unchanged)
- All `useEffect` data loading (unchanged)
- All handler functions (unchanged)
- `settingsDirty` ref, `translateNavLabels`, `refreshFarms`, computed flags
- Tab state: `activeTab`, URL param read on mount, `history.replaceState` on switch
- Tab bar render: `role="tablist"`, three `<button role="tab">`, keyboard handler
- Conditional panel render: one `<ProfileFarmsTab>`, `<ProfileYouTab>`, `<ProfileSystemTab>` per active tab; inactive tabs are not rendered (simple `activeTab === 'farms' && <ProfileFarmsTab …/>`)
- `FarmWizard` full-screen check remains: `showWizard` is shell state, passed to ProfileFarmsTab

**Tab bar CSS** (scoped inside the Preact component, inline styles matching the mockup tokens)
```
.tab-bar: sticky, surface bg, border-bottom, z-index 99
.tab-bar__inner: flex, gray-100 bg, border-radius-full, padding 3px, max-width 480px
.tab-btn: flex:1, border-radius-full, semibold 14px, hover + aria-selected states
```

**Acceptance criteria**
- Default tab is `farms` on fresh load
- `?tab=you` or `?tab=system` in URL activates correct tab on mount
- Tab switch updates URL param without page reload
- Keyboard arrow navigation cycles focus; Enter/Space activates
- Shell is under 150 LOC
- All data loading behavior is identical to the current monolith

---

### T5 — Move legal links to profile/index.astro footer

**Files touched**
- `src/frontend/src/pages/profile/index.astro`
- `src/frontend/src/components/ProfilePage.tsx` (remove Help/Legal link blocks — lines 1124–1155)

**Size**: S

**Dependencies**: T9 (i18n keys for `footer.help`)

**What to add in index.astro**
```astro
<footer style="padding:var(--space-6) var(--space-4) var(--space-4);text-align:center;font-size:var(--font-size-xs);color:var(--color-gray-400);display:flex;justify-content:center;gap:var(--space-4);flex-wrap:wrap;border-top:var(--border-default)">
  <a href="/help/getting-started" data-i18n="footer.help" style="color:var(--color-gray-400);text-decoration:none">Help</a>
  <a href="/terms"      style="color:var(--color-gray-400);text-decoration:none">Terms</a>
  <a href="/privacy"    style="color:var(--color-gray-400);text-decoration:none">Privacy</a>
  <a href="/report-bug" style="color:var(--color-gray-400);text-decoration:none">Report a Bug</a>
</footer>
```

Static Astro — no Preact, no JavaScript. The `data-i18n="footer.help"` is picked up by `i18n-labels.js`.

**Acceptance criteria**
- Footer always visible regardless of active tab
- Four links render correctly at mobile and desktop widths
- Help/Legal/Info section blocks are removed from ProfilePage.tsx
- "Back to app" from `/report-bug` still goes to `/profile/` (confirmed existing behavior — no change needed)

---

### T6 — Create /help/getting-started page

**Files touched**
- `src/frontend/src/pages/help/getting-started.astro` (new)

**Size**: S

**Dependencies**: none (standalone static page)

**Approach**
- Use `AuthLayout variant="hero"` (same shell as `/help/device-setup`)
- Apply the same bilingual `data-lang="en"/"ja"` dual-render pattern and the `html[data-locale="ja"] [data-lang="en"] { display:none }` CSS rule
- Content comes from the existing `guide.*` i18n keys already in en.json and ja.json: `guide.summary`, `guide.feature_*`, `guide.step1_title` … `guide.step5_title/desc`
- Getting Started guide steps are already authored — no new copy needed
- Navigation: back link to `/profile/?tab=system`; do NOT link back to `/whats-new`
- Style: reuse `.help-page`, `.help-section`, `.help-list`, `.help-callout` from device-setup (extract shared CSS to `AuthLayout` or keep scoped — builder's call, keeping it scoped is fine)

**Acceptance criteria**
- Page renders at `/help/getting-started` (no auth required)
- EN and JA both display correctly with locale toggle
- Back link returns to `/profile/?tab=system`
- No reference to `/whats-new`

---

### T7 — Create /history page

**Files touched**
- `src/frontend/src/pages/history.astro` (new)
- `src/frontend/src/components/LegalPage.tsx` (optional: extract changelog section, or duplicate — builder's call)

**Size**: S

**Dependencies**: none (standalone)

**Approach**
- Use `AuthLayout variant="hero"` or pass `page="history"` to `LegalPage` (if LegalPage is extended)
- Simpler option: new static Astro page rendering the changelog content from `legal.whats_new_intro` + version entries already in LegalPage's `whats-new` case
- Back link: `/profile/?tab=system`
- Title: "History — LitCrop"

**Acceptance criteria**
- Page renders at `/history`
- Changelog content is identical to what was in `/whats-new` (changelog section only)
- Back link returns to `/profile/?tab=system`

---

### T8 — Redirect /whats-new → /history

**Files touched**
- `src/frontend/src/pages/whats-new.astro` (replace content)

**Size**: XS

**Dependencies**: T7 must be complete (target route must exist)

**Implementation**
```astro
---
return Astro.redirect('/history', 301);
---
```

**Acceptance criteria**
- Visiting `/whats-new` redirects to `/history` with 301
- No broken links from AuthLayout footer (T10 updates that link)
- Old bookmarks work

---

### T9 — i18n key additions

**Files touched**
- `src/frontend/src/i18n/en.json`
- `src/frontend/src/i18n/ja.json`
- `src/frontend/public/scripts/i18n-labels.js`

**Size**: XS

**Dependencies**: none (can be done first)

**Keys to add** (exact values in DESIGNS-PROFILE-TABS.md Section 4)
- `profile.tab_farms`, `profile.tab_you`, `profile.tab_system`
- `profile.help`, `profile.info`, `profile.app_settings`
- `help.getting_started`, `help.device_setup`
- `info.history`
- `footer.help`

**i18n-labels.js** — add 4 JA entries to the `JA` map for static-rendered elements.

**Acceptance criteria**
- `t('profile.tab_farms')` returns "Farms" in EN, "農園" in JA
- `t('footer.help')` returns "Help" / "ヘルプ"
- `t('help.getting_started')` returns the correct string in both locales
- No missing-key warnings in the console

---

### T10 — Update AuthLayout footer

**Files touched**
- `src/frontend/src/layouts/AuthLayout.astro`

**Size**: XS

**Dependencies**: T7, T8

**Change**
Replace `<a href="/whats-new">What's New</a>` in the AuthLayout default-variant footer with `<a href="/history">History</a>` (and optionally add a Help link: `<a href="/help/getting-started">Help</a>`).

The design specifies a Help link in the profile footer (T5). The AuthLayout footer on auth screens (login, register, reset) is separate — the minimum change here is removing the dead `/whats-new` link and pointing it at `/history`.

**Acceptance criteria**
- AuthLayout footer no longer links to `/whats-new`
- Footer links to `/history` and `/terms` and `/privacy`
- Login/register/reset pages are not broken

---

### T11 — Verification

**Files touched**: none (read-only checks)

**Size**: S

**Dependencies**: T1–T10 all complete

**Checklist**
- [ ] `npx astro build` completes without errors (catches SSR import failures)
- [ ] `tsc --build` passes (no TypeScript errors in new component files)
- [ ] `vitest run` passes (no regressions in existing tests)
- [ ] Manual smoke: visit `/profile/`, switch all three tabs, confirm no console errors
- [ ] Manual smoke: visit `/profile/?tab=system`, confirm System tab is active on load
- [ ] Manual smoke: keyboard navigation (Tab to tab bar, Arrow keys, Enter)
- [ ] Manual smoke: farm operations from Farms tab (switch, expand, delete confirm)
- [ ] Manual smoke: locale change from System tab re-translates page
- [ ] Manual smoke: `/help/getting-started` and `/history` render in both EN and JA
- [ ] Manual smoke: `/whats-new` redirects to `/history`
- [ ] WCAG: color contrast of active tab pill (white on `--color-primary-dark`) ≥ 4.5:1
- [ ] WCAG: focus ring visible on tab buttons (check earthy theme)
- [ ] Screen reader: VoiceOver announces "Farms, tab, 1 of 3, selected" on farms tab

---

## Build Plan

### Recommended order

```
Phase 1 — Parallel (no dependencies)
  T9  i18n keys              (XS — do first so keys exist for T3)
  T1  Extract ProfileFarmsTab (M)
  T2  Extract ProfileYouTab  (M)
  T6  /help/getting-started  (S — independent static page)

Phase 2 — After T9 unblocked
  T3  ProfileSystemTab       (S — needs T9 keys)
  T5  Move legal links       (S — needs T9 for footer.help)

Phase 3 — After T1+T2+T3 complete
  T4  ProfilePage shell refactor (S — assembles the three tab components)

Phase 4 — Parallel
  T7  /history page          (S)
  T10 AuthLayout footer      (XS)

Phase 5 — After T7
  T8  /whats-new redirect    (XS)

Phase 6 — All complete
  T11 Verification           (S)
```

### Parallelization

Two engineers can work simultaneously:
- Engineer A: T9 → T1 → T4 → T8
- Engineer B: T2 → T3 → T5 → T6 → T7 → T10 → T11

Single engineer sequential order: T9, T1, T2, T3, T4, T5, T6, T7, T8, T10, T11.

### Estimated effort

| Task | Size | Estimated hours |
|------|------|----------------|
| T1   | M    | 3–4 h |
| T2   | M    | 2–3 h |
| T3   | S    | 1–2 h |
| T4   | S    | 1–2 h |
| T5   | S    | 0.5 h |
| T6   | S    | 1–2 h |
| T7   | S    | 1 h   |
| T8   | XS   | 0.25 h |
| T9   | XS   | 0.5 h |
| T10  | XS   | 0.25 h |
| T11  | S    | 1–2 h |
| **Total** | | **11–18 h** |

Single engineer, realistic pace: **1.5–2 days**.

---

## Risk Items

| Risk | Severity | Mitigation |
|------|----------|------------|
| Props interface for ProfileFarmsTab is large (18+ props) | Low | Consider grouping farm-operation handlers into a single `farmHandlers` object if it feels unwieldy — but correctness over elegance, don't over-engineer |
| `ChangePasswordSection` and `DeleteAccountSection` move with `ProfileYouTab` — they currently live as top-level functions in `ProfilePage.tsx` | Low | Move them into the new `ProfileYouTab.tsx` file; they are self-contained |
| `ThemeSwitcher` currently lives inside the You section — must move to System tab without breaking the earthy/dark theme toggle | Medium | ThemeSwitcher reads from localStorage internally and fires a custom event; it has no API dependency. Moving it is safe — just import in ProfileSystemTab instead. Confirm with `npx astro build`. |
| `/whats-new` is linked from AuthLayout footer — T8 must happen after T7 is deployed | Low | Do T7 before T8; they are sequential in Phase 4/5 |
| `translateNavLabels` reads `[data-i18n]` elements including the new tab bar labels | Low | Tab bar is inside the Preact island; `translateNavLabels` targets the Astro-rendered DOM. Tab labels use `t()` directly inside Preact. No conflict. |
| `npx astro build` needed after any Preact component change | Medium | Include `astro build` in T11 checklist; do not rely only on `tsc` + `vitest` |
