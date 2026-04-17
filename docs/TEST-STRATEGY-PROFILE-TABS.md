# Test Strategy — Profile Page Tab Refactor

> Covers the components introduced or modified in the Profile Tab refactor:
> `ProfilePage.tsx` (shell), `ProfileFarmsTab.tsx`, `ProfileYouTab.tsx`,
> `ProfileSystemTab.tsx`, `GettingStartedGuide.tsx`, `VersionHistory.tsx`,
> and the new routes `/help/getting-started`, `/history`, `/whats-new` (redirect).

---

## 1. Unit Tests (vitest)

File location: `src/frontend/src/__tests__/profile-tabs.test.ts`

Follow the existing pattern in `Avatar.test.ts` and `auth.test.ts` — pure function
and logic tests, no DOM rendering required where avoidable.

### 1a. Tab switching logic (pure functions extracted from ProfilePage)

These exercise the `switchTab` / `handleTabKeyDown` logic. Extract the tab-name
validation helper into a testable unit or test it by importing the module with
mocked `window.location` / `history`.

| # | Test description |
|---|-----------------|
| U-1 | Default `activeTab` is `'farms'` when `?tab=` is absent from the URL |
| U-2 | `?tab=you` in the URL sets `activeTab` to `'you'` on mount |
| U-3 | `?tab=system` in the URL sets `activeTab` to `'system'` on mount |
| U-4 | An invalid `?tab=unknown` value leaves `activeTab` as `'farms'` (unchanged) |
| U-5 | `switchTab('you')` calls `history.replaceState` with `?tab=you` |
| U-6 | `handleTabKeyDown` with `ArrowRight` on `'farms'` advances to `'you'` |
| U-7 | `handleTabKeyDown` with `ArrowLeft` on `'farms'` wraps to `'system'` (circular) |
| U-8 | `handleTabKeyDown` with `ArrowRight` on `'system'` wraps to `'farms'` |

Implementation note: mock `window.location.search` and `history.replaceState`
using `vi.stubGlobal` — same pattern used in `auth.test.ts` for Cognito mocks.

### 1b. i18n key coverage

File: `src/frontend/src/__tests__/profile-tabs-i18n.test.ts`

Import `t` from `../i18n/i18n` and assert each new key resolves to a non-empty,
non-key string in both locales. Pattern mirrors how `crops.test.ts` tests label
lookups.

| # | Test description |
|---|-----------------|
| I-1 | `t('profile.tab_farms')` returns `'Farms'` (EN) and `'農園'` (JA) |
| I-2 | `t('profile.tab_you')` returns `'You'` (EN) and `'あなた'` (JA) |
| I-3 | `t('profile.tab_system')` returns `'System'` (EN) and `'システム'` (JA) |
| I-4 | `t('help.getting_started')` returns `'How-To: Getting Started'` (EN) |
| I-5 | `t('info.history')` returns `'History'` (EN) and `'更新履歴'` (JA) |
| I-6 | None of the new keys return a raw dot-notation string (regression guard) |

### 1c. ProfileSystemTab structural assertions

File: `src/frontend/src/__tests__/ProfileSystemTab.test.tsx`

Render with `@testing-library/preact` (if available) or snapshot the JSX output.
The component takes props and has no API calls — safe to render in isolation.

| # | Test description |
|---|-----------------|
| S-1 | Renders exactly 3 card `<div>` containers (App Settings, Help, Info) |
| S-2 | Help card contains an `<a href="/help/getting-started">` link |
| S-3 | Help card contains an `<a href="/help/device-setup">` link |
| S-4 | Info card contains links to `/history`, `/terms`, `/privacy`, `/report-bug` |
| S-5 | Version footer text matches `LitCrop` prefix (presence check, not exact version) |
| S-6 | Locale select fires `onLocaleChange` when value changes |
| S-7 | Temp unit select fires `onTempUnitChange` when value changes |

### 1d. GettingStartedGuide step count

| # | Test description |
|---|-----------------|
| G-1 | Renders exactly 5 `GuideStep` instances (numbered 1–5) |
| G-2 | Back link `href` is `/profile/?tab=system` |
| G-3 | Footer row contains links to `/terms`, `/privacy`, `/history`, `/report-bug` |

### 1e. VersionHistory entry count and current marker

The component hard-codes 10 `VersionEntry` nodes (v0.90–v0.99.1). The `current`
prop is only passed to `v0.99.1`.

| # | Test description |
|---|-----------------|
| V-1 | Renders 10 version entry containers |
| V-2 | Exactly 1 entry carries the `current` badge |
| V-3 | The `current` entry displays version string `v0.99.1` |
| V-4 | Back link `href` is `/profile/?tab=system` |

---

## 2. Integration Tests (vitest)

File: `src/frontend/src/__tests__/ProfilePage.integration.test.tsx`

Render the full `ProfilePage` shell with all child tab components. Mock all API
calls (`getMyFarms`, `getMyProfile`, `getMySettings`) with `vi.mock`. Use
`@testing-library/preact` for queries.

| # | Test description |
|---|-----------------|
| INT-1 | Renders with `?tab=system` URL param → System tab panel is visible, Farms panel is not in the DOM |
| INT-2 | Renders with no `?tab=` → Farms panel is present, You and System panels are not in the DOM |
| INT-3 | Clicking the `You` tab button sets `aria-selected="true"` on `#tab-you` and `aria-selected="false"` on the other two |
| INT-4 | `ArrowRight` keydown on `#tab-farms` shifts focus/selection to `#tab-you`; `URL` param updates to `?tab=you` |
| INT-5 | `Enter` keydown on a tab button that is focused (but not active) activates that tab |

---

## 3. E2E Tests (Playwright)

Directory: `e2e/tests/profile-tabs.spec.ts`

Follow the auth fixture pattern from `farm-crud.spec.ts` — use
`authenticatedPage` and `mockApi` to stub `/api/v1/farms`, `/api/v1/me/profile`,
`/api/v1/me/settings`.

### 3a. /profile/ loading and tab switching

| # | Test description |
|---|-----------------|
| E-1 | `/profile/` loads and the Farms tab is active by default (`#tab-farms[aria-selected="true"]`) |
| E-2 | Clicking `#tab-you` makes the You panel visible; `#panel-farms` is removed from DOM |
| E-3 | Clicking `#tab-system` makes the System panel visible with all 3 cards rendered |
| E-4 | After clicking `#tab-system`, the URL contains `?tab=system` (no page reload) |

### 3b. Deep-link via URL param

| # | Test description |
|---|-----------------|
| E-5 | Navigating to `/profile/?tab=system` on load activates `#tab-system[aria-selected="true"]` without clicking |
| E-6 | Navigating to `/profile/?tab=you` on load activates `#tab-you[aria-selected="true"]` |

### 3c. Static pages

| # | Test description |
|---|-----------------|
| E-7 | `/help/getting-started` renders and contains 5 numbered step circles |
| E-8 | `/help/getting-started` back link points to `/profile/?tab=system` |
| E-9 | `/history` renders and displays at least 10 version entries |
| E-10 | `/history` shows exactly 1 element with the `current` badge |
| E-11 | `/whats-new` responds with a 301 redirect to `/history` (verify via `page.goto` response status or final URL) |

### 3d. Accessibility

| # | Test description |
|---|-----------------|
| A-1 | `[role="tablist"]` has `aria-label="Profile sections"` |
| A-2 | All three `[role="tab"]` buttons have `aria-controls` pointing to existing `[role="tabpanel"]` IDs |
| A-3 | The active tabpanel has `tabindex="0"` |
| A-4 | `ArrowRight` on `#tab-farms` moves keyboard focus to `#tab-you` (verify via `document.activeElement`) |

---

## 4. What NOT to Test Here

These are covered by existing test files and must not be duplicated:

- Farm CRUD (create, delete, leave, role change) — `e2e/tests/farm-crud.spec.ts`
- Login / register / reset auth flows — `e2e/tests/login.spec.ts`
- ThemeSwitcher toggle behavior — ThemeSwitcher has its own internal localStorage logic; its behavior is not changed by this refactor
- Change password / delete account flows (Cognito calls) — unchanged handlers; covered by `auth.test.ts` pure-function tests

---

## 5. Priority Order

### Must Have (write first — highest risk, zero prior coverage)

1. **U-1 to U-4** — Tab URL param reading: this is new logic with no existing test coverage; a regression here silently breaks deep-linking.
2. **E-1, E-5, E-6** — Default tab + deep-link: the most user-visible behaviors and the ones most likely to regress during future shell changes.
3. **E-11** — `/whats-new` redirect: bookmarks break silently without this.
4. **I-1 to I-6** — i18n key coverage: missing keys show raw dot-notation strings to users; fast to write, high signal.
5. **S-1 to S-4** — ProfileSystemTab link structure: the Info and Help card links are the primary navigation surface for the new content; wrong `href` values are invisible to TypeScript.

### Nice to Have (write after must-haves)

6. **G-1, V-1 to V-3** — Step/entry count assertions: useful regression guards but static content; lower churn value.
7. **INT-1 to INT-5** — Integration render tests: valuable for keyboard nav but require `@testing-library/preact` setup; higher setup cost.
8. **A-1 to A-4** — ARIA attribute E2E tests: confirm the accessibility contract is live but partially overlaps with the unit-level aria-selected checks (U-6 to U-8).
9. **E-7, E-8, E-9, E-10** — Static page content E2E: low regression risk for static markup; useful for CI smoke but not blocking.

---

## Implementation Notes for /cc-implement

- All new vitest files go in `src/frontend/src/__tests__/` alongside existing tests.
- New E2E file is `e2e/tests/profile-tabs.spec.ts`; import auth fixtures from `../fixtures/auth`.
- Stub the following API routes in E2E `beforeEach`: `GET /api/v1/farms` (return `API_FARMS_LIST`), `GET /api/v1/me/profile` (return `API_ME`), `GET /api/v1/me/settings` (return `{ locale: 'en', temp_unit: 'C' }`).
- For U-5 to U-8, use `vi.stubGlobal('history', { replaceState: vi.fn() })` before import to capture URL side-effects.
- ProfileSystemTab unit tests do not need auth; render with stub props: `locale="en"`, `tempUnit="C"`, `onLocaleChange={vi.fn()}`, `onTempUnitChange={vi.fn()}`.
- The `__APP_VERSION__` global is injected by Vite at build time; in vitest, add `define: { __APP_VERSION__: '"test"' }` to `vitest.config.ts` if not already present.
