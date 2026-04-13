# Session Report: PrePROD-2

> Session: `pre-prod-092` | Date: 2026-04-13 | Branch: `develop`

---

## Summary

Three commits delivering E2E testing infrastructure, 5 production hotfixes from live user testing, and the #240 install.sh URL finalization. Total: **33 files changed, 2,148 insertions**.

```
 Session start:  v0.91 (6d653da)
 Session end:    3 commits ahead (3dfe98b)
 Tests:          796 → 799 unit + 46 E2E = 845 total
 Open issues:    13 (down from 14 — #240 closed)
```

---

## Commits

| # | SHA | Type | Scope | Description |
|---|-----|------|-------|-------------|
| 1 | `7d35be3` | test | e2e | Playwright E2E tests — 5 golden paths + 3 category suites |
| 2 | `261ce7c` | fix | multi | 5 production hotfixes from live testing on litcrop.com |
| 3 | `3dfe98b` | feat | device | Finalize install.sh URL at litcrop.com (Closes #240) |

---

## Deliverable 1: F-11 + F-12 — Playwright E2E Tests

### F-11: Golden-Path Tests (31 tests)

| Spec file | Tests | What it covers |
|-----------|-------|----------------|
| `login.spec.ts` | 7 | Login form, validation, Cognito error mapping, successful redirect |
| `farm-crud.spec.ts` | 8 | Dashboard rendering, bed grid, farm creation wizard |
| `bed-lifecycle.spec.ts` | 6 | Bed grid, BedDetail, crop info, edit form, empty state |
| `diary-entry.spec.ts` | 5 | Entry list, bottom sheet form, submit, calendar toggle |
| `device-flow.spec.ts` | 5 | Device list, register form, credential display |

### F-12: Category Tests (15 tests)

| Spec file | Tests | What it covers |
|-----------|-------|----------------|
| `security.spec.ts` | 5 | Auth redirect, CSP (soft), XSS protection, token leak, HSTS (soft) |
| `performance.spec.ts` | 5 | Page load <3s, dashboard <5s, transfer <500KB, LCP <2.5s, no render loops |
| `accessibility.spec.ts` | 5 | axe-core WCAG 2.1 AA on login/register/dashboard/diary, keyboard nav |

### Infrastructure

| File | Purpose |
|------|---------|
| `playwright.config.ts` | Chromium project, webServer auto-starts Astro on :4321 |
| `e2e/tsconfig.json` | Isolated TS config (avoids rootDir conflict) |
| `e2e/fixtures/auth.ts` | `authenticatedPage` + `mockApi` fixtures, Cognito interception |
| `e2e/fixtures/mock-data.ts` | Farm, beds, diary, devices, crops, API response wrappers |
| `pr-checks.yml` | New `e2e` job: install Chromium, run tests, upload report on failure |
| `package.json` | `test:e2e` and `test:e2e:ui` scripts |

### Key Design Decisions

- **Route interception, not real AWS** — tests intercept Cognito + API at the network layer via Playwright. No credentials needed in CI.
- **Auth fixture seeds localStorage** — `addInitScript` sets tokens before first navigation, so Preact islands think they're authenticated.
- **404 catch-all** — unregistered API routes return a loud 404, preventing silent test passes on missing stubs.

---

## Deliverable 2: Production Hotfixes (5 fixes)

From live testing at litcrop.com by the project owner.

### Fix 1: Registration preferences lost on first login

| Aspect | Detail |
|--------|--------|
| **Symptom** | New user selects JA locale + Fahrenheit, but after login sees EN + Celsius |
| **Root cause** | RegisterForm stored to `litcrop-locale` / `litcrop-temp-unit`, but ProfilePage called `getMySettings()` which returned server defaults and overwrote them |
| **Fix** | RegisterForm now stores to `litcrop-pendingLocale` / `litcrop-pendingTempUnit`. ProfilePage reads pending keys and calls `updateMySettings()` **before** `getMySettings()` |
| **Files** | `RegisterForm.tsx`, `ProfilePage.tsx` |

### Fix 2: Default theme changed to Earthy

| Aspect | Detail |
|--------|--------|
| **Change** | `DEFAULT_SETTINGS.theme` and `DEFAULT_THEME` constant: `'system'` → `'earthy'` |
| **Impact** | New users only. Existing users keep their saved theme. |
| **Files** | `_types.ts`, `constants.ts`, `me.test.ts`, `profile-picture.test.ts`, `fixtures/index.ts` |

### Fix 3: 茅野市 (Chino, Nagano) added to cities

| Aspect | Detail |
|--------|--------|
| **Symptom** | User could not find Chino in the farm creation city picker |
| **Root cause** | City list had 114 JP cities; Chino (pop ~70K) was missing despite exceeding the 10K threshold |
| **Fix** | Added `jp-chino` entry to `cities.json` |
| **Tests** | +2 tests: search by EN ("Chino") and JA ("茅野") |

### Fix 4: Admin page security guard

| Aspect | Detail |
|--------|--------|
| **Symptom** | Owner-role user (via promo code) could navigate to `/admin/` and see loading skeleton |
| **Root cause** | AdminDashboard had no client-side access check before rendering |
| **Fix** | Added `getCachedIsAdmin()` check at top of `useEffect`. Non-admin users see "Not authorized" immediately, no API call made |
| **Defense layers** | Nav hiding (UX) + client-side guard (NEW) + server-side 403 (authoritative) |
| **Files** | `AdminDashboard.tsx` |

### Fix 5: Email mandatory marker

| Aspect | Detail |
|--------|--------|
| **Symptom** | Name field shows `*` but email field does not, despite both being required |
| **Fix** | Added ` *` to email label in RegisterForm |

### Test impact: 796 → 799 (+3)

- 2 city search tests (Chino EN/JA)
- 1 registration preferences bulk sync test (locale + temp_unit + theme PATCH)

---

## Deliverable 3: #240 — install.sh URL at litcrop.com

| Aspect | Detail |
|--------|--------|
| **Goal** | `curl -sL https://litcrop.com/install.sh | bash` works |
| **Mechanism** | Symlink `src/frontend/public/install.sh` → `scripts/camera-node/install.sh`. Astro serves `public/` files at root via CloudFront/S3. |
| **Setup guide** | Expanded from 3 → 4 steps in DeviceRegisterForm |
| **TTY detection** | `install.sh` now detects `curl | bash` (non-interactive) and uses safe defaults instead of hanging on `read -rp` prompts |

### New 4-step setup guide

```
Step 1: Download config file (.env with device credentials)
Step 2: Install LitCrop on Pi (curl -sL https://litcrop.com/install.sh | bash)
Step 3: Copy config to Pi and test (scp + capture.sh)
Step 4: Verify status (offline → online indicator)
```

### Non-interactive mode defaults

| Prompt | Interactive | Non-interactive (curl) |
|--------|------------|----------------------|
| Cron job | Ask Y/n | Auto-enable + log |
| Battery HAT | Ask y/N | Default: No (Class 1) |
| PIR sensor | Ask y/N | Default: No (Class 1) |

User can re-run `bash ~/litcrop/install.sh` manually to reconfigure hardware.

---

## Pipeline Discipline

Every deliverable followed the required pipeline:

```
/cc-implement → /simplify → /cc-review → /cc-remediate
```

| Deliverable | Simplify findings | Review findings | Remediated |
|-------------|------------------|-----------------|------------|
| F-11/F-12 E2E | 7 files DRY-ed (~235 LOC extracted) | 5 SHOULD-FIX, 8 SUGGESTION | 5/5 fixed |
| 5 hotfixes | 2 files simplified (useEffect merge, isValidLocale) | 2 SHOULD-FIX, 3 SUGGESTION | 2/2 fixed |
| #240 install.sh | 1 stale comment fixed | 2 SHOULD-FIX (drift risk, piped stdin) | 2/2 fixed |

### Notable review catches

- **`/me` vs `/me/profile` stub mismatch** in category tests — would have caused silent 404s
- **useEffect race condition** in AdminDashboard — second effect captured stale `forbidden=false`
- **Hardcoded `'earthy'`** string instead of `DEFAULT_THEME` constant
- **`read -rp` fails on piped stdin** — `curl | bash` would hang or skip prompts silently

---

## P-Item Audit Status: 31/38 (82%)

| Status | Items |
|--------|-------|
| Resolved (this session) | F-11 (Playwright E2E), F-12 (test categories) |
| Resolved (prior) | F-15, F-08, F-32/F-34, + 24 others |
| Remaining | F-21 (CSP nonce), F-25 (rate limiter), F-26/28 (caching), F-27/29 (aspirational) |

---

## Issue State

| Category | Count | Issues |
|----------|-------|--------|
| Closed this session | 1 | #240 |
| Closed prior session | 7 | #238, #239, #245, #256, #370, #372, #369 |
| Open — Pre-PROD | 3 | #280, #281, #334 |
| Open — AI Track | 4 | #183, #320, #333 + F-25 |
| Open — Backlog | 6 | #168, #242, #279, #284, #323, #324 |
| **Total open** | **13** | |

---

## What's Next

| Priority | Item | Scope |
|----------|------|-------|
| 1 | #280 — Release notes, what's new, disclaimer pages | Pre-PROD |
| 2 | #281 — Free vs paid tier design (monetization) | Pre-PROD |
| 3 | #334 — Capacity analysis and scalability review | Pre-PROD |
| 4 | F-25 — Per-user rate limiter | AI Phase 1 |
| 5 | Register admin account (`admin@example.com`) at litcrop.com | Operational |

---

## Files Changed (33 total)

```
 .github/workflows/pr-checks.yml          |  40 +-
 .gitignore                                |   5 +
 TASKS.md                                  |  16 +-
 e2e/fixtures/auth.ts                      | 212 ++++
 e2e/fixtures/mock-data.ts                 | 453 +++++++++
 e2e/tests/bed-lifecycle.spec.ts           | 141 +++
 e2e/tests/categories/accessibility.spec.ts| 137 +++
 e2e/tests/categories/performance.spec.ts  | 155 +++
 e2e/tests/categories/security.spec.ts     | 116 +++
 e2e/tests/device-flow.spec.ts             | 167 +++
 e2e/tests/diary-entry.spec.ts             | 158 +++
 e2e/tests/farm-crud.spec.ts               | 146 +++
 e2e/tests/login.spec.ts                   | 125 +++
 e2e/tsconfig.json                         |  12 +
 package-lock.json                         |  88 ++
 package.json                              |   6 +-
 packages/shared/src/constants.ts          |   2 +-
 playwright.config.ts                      |  42 +
 scripts/camera-node/install.sh            |  35 +-
 src/api/src/__tests__/fixtures/index.ts   |   2 +-
 src/api/src/__tests__/routes/me.test.ts   |  23 +-
 src/api/src/__tests__/routes/profile-picture.test.ts | 2 +-
 src/api/src/services/repositories/_types.ts |  2 +-
 src/frontend/public/install.sh            |   1 + (symlink)
 src/frontend/src/__tests__/cities.test.ts |  10 +
 src/frontend/src/components/AdminDashboard.tsx | 8 +-
 src/frontend/src/components/DeviceRegisterForm.tsx | 31 +-
 src/frontend/src/components/ProfilePage.tsx | 19 +-
 src/frontend/src/components/RegisterForm.tsx | 6 +-
 src/frontend/src/data/cities.json         |   1 +
 src/frontend/src/i18n/en.json             |  18 +-
 src/frontend/src/i18n/ja.json             |  18 +-
 tsconfig.base.json                        |   3 +-
 33 files changed, 2148 insertions(+), 52 deletions(-)
```
