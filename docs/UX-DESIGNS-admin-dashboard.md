# Admin Dashboard Design — Issue #179

> **Status**: Design complete, ready for implementation
> **Route**: `/admin/`
> **Scope**: Beta-2 (read-only dashboard, no write actions)
> **Last updated**: 2026-03-25

---

## 1. Navigation Integration

### Problem
The admin tab must appear as a 5th nav item only when `isAdmin === true`. The `isAdmin` flag comes from `GET /me/profile` (async), but nav renders before the response arrives.

### Decision: Preact island approach with localStorage cache

**Why**: The nav already uses a Preact island (`DesktopNav.tsx`) that reads `getCurrentUser()` from localStorage on mount. We extend this pattern with a cached admin flag.

**Mechanism**:
1. On first profile load (in any page — `ProfilePage.tsx` already calls `getMyProfile()`), cache `is_admin` to `localStorage('litcrop-isAdmin')`.
2. Both `DesktopNav.tsx` and the mobile tab bar (currently static HTML in `BaseLayout.astro`) read this flag.
3. Since the mobile tab bar is static Astro HTML and cannot use hooks, we create a tiny `AdminTabInjector` Preact island that appends the admin tab link to `.tab-bar` if the cached flag is true.

### Changes

#### `src/frontend/src/lib/hooks.ts` (or create new helper)

```typescript
const LS_IS_ADMIN = 'litcrop-isAdmin';

export function getCachedIsAdmin(): boolean {
  try {
    return localStorage.getItem(LS_IS_ADMIN) === 'true';
  } catch {
    return false;
  }
}

export function setCachedIsAdmin(value: boolean): void {
  try {
    localStorage.setItem(LS_IS_ADMIN, String(value));
  } catch {}
}
```

#### `src/frontend/src/components/DesktopNav.tsx`

Add admin state and conditional nav item:

```typescript
// New state
const [isAdmin, setIsAdmin] = useState<boolean>(() => getCachedIsAdmin());

// In existing useEffect, after getCurrentUser():
// (non-blocking — just reads cache, no extra fetch)

// In NAV_ITEMS rendering, after the map(), conditionally append:
{isAdmin && (
  <a
    href="/admin/"
    class={`desktop-nav__link${activeTab === 'admin' ? ' desktop-nav__link--active' : ''}`}
    aria-current={activeTab === 'admin' ? 'page' : undefined}
  >
    <span aria-hidden="true">⚙️</span>
    {t('nav.admin')}
  </a>
)}
```

**Note**: `activeTab` type union must be extended to include `'admin'`.

#### `src/frontend/src/components/AdminTabInjector.tsx` (NEW)

A tiny island that injects the admin tab into the mobile bottom bar using safe DOM methods (no innerHTML to prevent XSS):

```typescript
import { useEffect } from 'preact/hooks';
import { getCachedIsAdmin } from '../lib/hooks';

interface Props {
  active?: boolean;
}

export default function AdminTabInjector({ active = false }: Props) {
  useEffect(() => {
    if (!getCachedIsAdmin()) return;
    const tabBar = document.querySelector('.tab-bar');
    if (!tabBar || tabBar.querySelector('[href="/admin/"]')) return;

    const link = document.createElement('a');
    link.href = '/admin/';
    link.className = `tab-bar__item${active ? ' tab-bar__item--active' : ''}`;
    link.setAttribute('aria-label', 'Admin dashboard');
    if (active) link.setAttribute('aria-current', 'page');

    const icon = document.createElement('span');
    icon.className = 'tab-bar__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '\u2699\uFE0F'; // gear emoji

    const label = document.createElement('span');
    label.className = 'tab-bar__label';
    label.setAttribute('data-i18n', 'nav.admin');
    label.textContent = 'Admin';

    link.appendChild(icon);
    link.appendChild(label);
    tabBar.appendChild(link);
  }, []);

  return null; // renders nothing — DOM-injection only
}
```

#### `src/frontend/src/layouts/BaseLayout.astro`

1. Add `'admin'` to `activeTab` type union.
2. Import and mount `AdminTabInjector` after the tab bar:

```astro
<!-- After closing </nav> of tab-bar -->
<AdminTabInjector active={activeTab === 'admin'} client:load />
```

#### `src/frontend/src/components/ProfilePage.tsx`

Already calls `getMyProfile()`. Add one line after `if (p.is_admin) setIsSystemAdmin(true)`:

```typescript
setCachedIsAdmin(p.is_admin);
```

This ensures the cache is set on every profile page visit (the first page most users see after login).

#### Cache priming on first login

Add the same `setCachedIsAdmin` call in `AuthGuard` or the login success handler so the admin tab appears immediately after first login. The exact location depends on whether the login flow already fetches `/me/profile` — if not, the tab will appear after the user's first visit to any page that fetches the profile (Profile page, which is the typical first destination).

### Visual behavior

| State | Mobile tab bar | Desktop nav |
|---|---|---|
| Not logged in | 4 tabs (no admin) | 4 links (no admin) |
| Logged in, non-admin | 4 tabs | 4 links |
| Logged in, admin, first session (no cache) | 4 tabs initially, 5th appears after profile fetch | Same |
| Logged in, admin, returning (cached) | 5 tabs immediately | 5 links immediately |

### Tab appearance

- Icon: gear emoji
- Label: "Admin"
- i18n key: `nav.admin` / Japanese: `管理`
- Position: 5th (rightmost)
- Active state: Same green highlight as other tabs

---

## 2. API Endpoints

### 2.1 GET /api/v1/admin/users

**Purpose**: List all users with their display names, roles, and farm membership counts.

**DynamoDB approach**: Scan for all `USER#` prefixed PKs with `SK = #PROFILE`. This gives us user profiles. For farm counts per user, we need a second scan or we accept the profile-only data and skip farm counts (simpler for Beta-2).

**Recommended Beta-2 approach**: Scan USER# + #PROFILE records only. Farm count per user requires N queries (one per user) which is expensive. Instead, return profile data and let the frontend show basic info. Farm counts can be added in a future phase with a GSI.

**Request**:
```
GET /api/v1/admin/users
Authorization: Bearer <token>
```

**Response** (200):
```json
{
  "users": [
    {
      "user_id": "abc-123",
      "display_name": "Tanaka Taro",
      "preferred_role": "manager",
      "created_at": "2026-03-01T10:00:00Z"
    }
  ],
  "total": 5
}
```

**Error responses**:
- `403` — `{ error: { code: "FORBIDDEN", message: "Not authorized" } }`
- `503` — `{ error: { code: "SERVICE_UNAVAILABLE", message: "Unable to retrieve user list" } }`

**DynamoDB implementation** — add `getAllUserProfiles()` to `dynamoRepo`:

```typescript
async getAllUserProfiles(): Promise<UserProfile[]> {
  const profiles: UserProfile[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await ddb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'begins_with(PK, :prefix) AND SK = :profile',
        ExpressionAttributeValues: {
          ':prefix': DDB_KEY_PREFIXES.USER,
          ':profile': '#PROFILE',
        },
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of result.Items ?? []) {
      const userId = (item['PK'] as string).slice(DDB_KEY_PREFIXES.USER.length);
      profiles.push(itemToUserProfile(item, userId));
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return profiles;
}
```

### 2.2 GET /api/v1/admin/farms

**Purpose**: List all farms with their member counts and owner info.

**DynamoDB approach**: Reuse existing `getAllFarms()` for farm metadata. For member counts, query each farm's `MEMBER#` records. At Beta-2 scale (< 50 farms), this is acceptable.

**Request**:
```
GET /api/v1/admin/farms
Authorization: Bearer <token>
```

**Response** (200):
```json
{
  "farms": [
    {
      "id": "farm-abc",
      "name": "Tanaka Farm",
      "latitude": 35.6762,
      "longitude": 139.6503,
      "grid_rows": 4,
      "grid_cols": 6,
      "member_count": 3,
      "created_at": "2026-02-15T08:30:00Z"
    }
  ],
  "total": 8
}
```

**Error responses**: Same as `/admin/users`.

**DynamoDB implementation**: Combine `getAllFarms()` + `getFarmMembers()` per farm:

```typescript
// In the route handler, not the repo (to keep repo methods focused):
const farms = await dynamoRepo.getAllFarms();
const farmsWithCounts = await Promise.all(
  farms.map(async (farm) => {
    const members = await dynamoRepo.getFarmMembers(farm.id);
    return {
      ...farm,
      member_count: members.length,
    };
  }),
);
```

### 2.3 Route file changes

**File**: `src/api/src/routes/admin.ts`

Add two new route handlers to the existing admin router. Reuse the existing `getAdminIds()` guard pattern:

```typescript
// ── GET /api/v1/admin/users ──────────────────────────────────────
router.get('/users', async (c) => {
  const { userId } = getAuthContext(c);
  if (!getAdminIds().includes(userId)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Not authorized' } }, 403);
  }

  try {
    const profiles = await dynamoRepo.getAllUserProfiles();
    return c.json({ users: profiles, total: profiles.length });
  } catch (err) {
    console.error('[admin] failed to fetch users', err);
    throw new ServiceUnavailableError('Unable to retrieve user list');
  }
});

// ── GET /api/v1/admin/farms ──────────────────────────────────────
router.get('/farms', async (c) => {
  const { userId } = getAuthContext(c);
  if (!getAdminIds().includes(userId)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Not authorized' } }, 403);
  }

  try {
    const farms = await dynamoRepo.getAllFarms();
    const farmsWithCounts = await Promise.all(
      farms.map(async (farm) => {
        const members = await dynamoRepo.getFarmMembers(farm.id);
        return { ...farm, member_count: members.length };
      }),
    );
    return c.json({ farms: farmsWithCounts, total: farmsWithCounts.length });
  } catch (err) {
    console.error('[admin] failed to fetch farms', err);
    throw new ServiceUnavailableError('Unable to retrieve farm list');
  }
});
```

**Note on admin guard**: The existing code uses `ADMIN_USER_IDS` env var (Cognito sub IDs). The auth middleware uses `ADMIN_EMAILS` env var. Both patterns exist. The admin routes should continue using `getAdminIds()` for consistency with the existing `/admin/stats` route. Consider extracting a shared `requireAdmin()` helper that checks via `getAuthContext(c).isAdmin` instead, but that is a refactor for later.

---

## 3. Page Layout — AdminDashboard Component

### Overview

Replace the existing `AdminStats.tsx` with a new `AdminDashboard.tsx` that has 3 tabs: **System** (existing stats), **Users**, **Farms**.

### Tab structure

```
+------------------------------------------+
| <- Admin                                 |
+------------------------------------------+
| [ System ]  [ Users ]  [ Farms ]         |
+------------------------------------------+
|                                          |
|  (active tab content)                    |
|                                          |
+------------------------------------------+
```

### Mobile layout (< 768px)
- Tab bar: horizontal, full-width, equal-split (3 items)
- Content: single column, vertical stack
- Cards in System tab: 3-column grid (existing pattern)
- User/Farm lists: full-width card per item

### Desktop layout (>= 1024px)
- Tab bar: left-aligned, same style
- Content: constrained to `max-width: 1280px` (existing `page-main` constraint)
- User/Farm tables: proper table layout with columns

### Tab 1: System (default)

Reuse existing `AdminStats` content verbatim — entity counts (3-card grid) + budget progress bars. No changes to the existing visual design.

Data source: `GET /api/v1/admin/stats` (existing).

### Tab 2: Users

**Mobile view**: Card list

```
+--------------------------------------------+
| [user icon]  Tanaka Taro                   |
|     manager . Joined Mar 2026              |
|     abc123...                              |
+--------------------------------------------+
| [user icon]  (no name)                     |
|     observer . Joined Feb 2026             |
|     def456...                              |
+--------------------------------------------+
```

**Desktop view**: Table

| Display Name | Preferred Role | Created | User ID |
|---|---|---|---|
| Tanaka Taro | manager | 2026-03-01 | abc-123-... |
| (no name) | observer | 2026-02-15 | def-456-... |

Data source: `GET /api/v1/admin/users` (new).

**Empty state**: "No registered users found."

### Tab 3: Farms

**Mobile view**: Card list

```
+--------------------------------------------+
| [farm icon]  Tanaka Farm                   |
|     4x6 grid . 3 members                  |
|     35.6762, 139.6503                      |
+--------------------------------------------+
```

**Desktop view**: Table

| Farm Name | Grid | Members | Location | Farm ID |
|---|---|---|---|---|
| Tanaka Farm | 4x6 | 3 | 35.68, 139.65 | farm-abc... |

Data source: `GET /api/v1/admin/farms` (new).

**Empty state**: "No farms found."

### Tab interaction
- URL hash: `/admin/#users`, `/admin/#farms`, `/admin/#system` (default)
- Tabs are keyboard navigable (left/right arrows within tablist)
- ARIA: `role="tablist"` on container, `role="tab"` on each tab, `role="tabpanel"` on content
- Data is fetched lazily per tab (not all at once) to avoid unnecessary API calls
- Each tab caches its data for the session (no re-fetch on tab switch)
- Auto-refresh (60s) applies only to the System tab (existing behavior)

### Action buttons

**Beta-2 scope: Read-only.** No action buttons. Future phases may add:
- Users tab: "Promote to admin", "Remove user"
- Farms tab: "Delete farm", "Transfer ownership"

---

## 4. Component Architecture

### File manifest

| File | Action | Purpose |
|---|---|---|
| `src/frontend/src/components/AdminDashboard.tsx` | **CREATE** | Main dashboard island with tab switching |
| `src/frontend/src/components/AdminTabInjector.tsx` | **CREATE** | Injects admin tab into mobile nav |
| `src/frontend/src/components/AdminStats.tsx` | **KEEP** | Extracted into AdminDashboard's System tab (import as child) |
| `src/frontend/src/components/DesktopNav.tsx` | **MODIFY** | Add conditional admin nav link |
| `src/frontend/src/layouts/BaseLayout.astro` | **MODIFY** | Add `'admin'` to activeTab union, mount AdminTabInjector |
| `src/frontend/src/pages/admin/index.astro` | **MODIFY** | Replace AdminStats with AdminDashboard |
| `src/frontend/src/lib/api.ts` | **MODIFY** | Add `getAdminUsers()`, `getAdminFarms()` client functions |
| `src/frontend/src/lib/hooks.ts` | **MODIFY** | Add `getCachedIsAdmin()`, `setCachedIsAdmin()` |
| `src/frontend/src/components/ProfilePage.tsx` | **MODIFY** | Call `setCachedIsAdmin()` on profile fetch |
| `src/frontend/src/i18n/en.json` | **MODIFY** | Add `nav.admin`, `admin.*` keys |
| `src/frontend/src/i18n/ja.json` | **MODIFY** | Add Japanese translations |
| `src/api/src/routes/admin.ts` | **MODIFY** | Add `/users` and `/farms` route handlers |
| `src/api/src/services/dynamodb.ts` | **MODIFY** | Add `getAllUserProfiles()` method |

### Component hierarchy

```
pages/admin/index.astro
  BaseLayout (activeTab="admin")
    DesktopNav (shows admin link if cached isAdmin)
    AdminTabInjector (injects mobile tab if cached isAdmin)
    AdminDashboard (client:load)
      TabBar (System | Users | Farms)
      AdminStats (when System tab active)
      AdminUserList (inline, when Users tab active)
      AdminFarmList (inline, when Farms tab active)
```

### Data flow

```
                                          localStorage
                                         'litcrop-isAdmin'
                                              |
                                    +---------+---------+
                                    v                   v
                              DesktopNav          AdminTabInjector
                           (reads on mount)      (reads on mount)
                                    |
ProfilePage --getMyProfile()--> setCachedIsAdmin()


AdminDashboard
  |
  +-- tab === 'system' --> getAdminStats()  --> AdminStats
  +-- tab === 'users'  --> getAdminUsers()  --> user list/table
  +-- tab === 'farms'  --> getAdminFarms()  --> farm list/table
```

### Frontend API client additions

Add to `src/frontend/src/lib/api.ts`:

```typescript
// ── Admin Endpoints ─────────────────────────────────────────────

export interface AdminUserItem {
  user_id: string;
  display_name: string;
  preferred_role: 'manager' | 'observer';
  created_at: string;
}

export interface AdminUsersResponse {
  users: AdminUserItem[];
  total: number;
}

export interface AdminFarmItem {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  grid_rows: number;
  grid_cols: number;
  member_count: number;
  created_at: string;
}

export interface AdminFarmsResponse {
  farms: AdminFarmItem[];
  total: number;
}

/** GET /api/v1/admin/users — admin only */
export async function getAdminUsers(): Promise<AdminUsersResponse> {
  return request<AdminUsersResponse>('GET', '/admin/users');
}

/** GET /api/v1/admin/farms — admin only */
export async function getAdminFarms(): Promise<AdminFarmsResponse> {
  return request<AdminFarmsResponse>('GET', '/admin/farms');
}
```

---

## 5. AdminDashboard Component Spec

### State management

```typescript
type AdminTab = 'system' | 'users' | 'farms';

// State
const [activeTab, setActiveTab] = useState<AdminTab>(() => {
  const hash = window.location.hash.slice(1);
  return ['system', 'users', 'farms'].includes(hash)
    ? hash as AdminTab
    : 'system';
});

// Lazy-loaded data caches
const [users, setUsers] = useState<AdminUserItem[] | null>(null);
const [farms, setFarms] = useState<AdminFarmItem[] | null>(null);

// Loading/error per tab
const [usersLoading, setUsersLoading] = useState(false);
const [farmsLoading, setFarmsLoading] = useState(false);
const [usersError, setUsersError] = useState(false);
const [farmsError, setFarmsError] = useState(false);
```

### Tab switching
```typescript
function switchTab(tab: AdminTab) {
  setActiveTab(tab);
  window.location.hash = tab;
  // Fetch data if not already loaded
  if (tab === 'users' && users === null) fetchUsers();
  if (tab === 'farms' && farms === null) fetchFarms();
}
```

### Skeleton loading

Follow existing pattern from `AdminStats.tsx`:
- System tab: 3 skeleton cards (existing)
- Users tab: 3 skeleton rows (height: 64px, full width)
- Farms tab: 3 skeleton rows (height: 64px, full width)

### 403 handling

The existing `AdminStats` pattern handles 403 gracefully. `AdminDashboard` should show the same "Not Authorized" empty state if any admin endpoint returns 403, rather than per-tab 403 handling. A single 403 from `/admin/stats` (fetched on mount for the System tab) should gate the entire dashboard.

---

## 6. Accessibility Checklist

- [x] Tab bar uses `role="tablist"`, tabs use `role="tab"`, panels use `role="tabpanel"`
- [x] `aria-selected="true"` on active tab, `aria-controls` linking tab to panel
- [x] Keyboard: Left/Right arrows move between tabs, Enter/Space activates
- [x] Admin nav item has `aria-label="Admin dashboard"`
- [x] Color contrast: inherits existing design tokens (already WCAG AA compliant)
- [x] Loading states announce via `aria-live="polite"` on the tab panel
- [x] Focus management: when switching tabs, focus moves to the panel content
- [x] Touch targets: tabs are min 44px height (matching existing tab bar)
- [x] Screen reader: table headers use `<th scope="col">` on desktop
- [x] Empty states are descriptive, not just blank

---

## 7. i18n Keys

Add to `en.json`:
```json
{
  "nav.admin": "Admin",
  "admin.system": "System",
  "admin.users": "Users",
  "admin.farms": "Farms",
  "admin.no_users": "No registered users found.",
  "admin.no_farms": "No farms found.",
  "admin.user_count": "{count} users",
  "admin.farm_count": "{count} farms",
  "admin.joined": "Joined",
  "admin.members": "members",
  "admin.grid": "grid"
}
```

Add to Japanese (`ja.json`):
```json
{
  "nav.admin": "管理",
  "admin.system": "システム",
  "admin.users": "ユーザー",
  "admin.farms": "ファーム",
  "admin.no_users": "登録ユーザーが見つかりません。",
  "admin.no_farms": "ファームが見つかりません。",
  "admin.joined": "参加日",
  "admin.members": "メンバー",
  "admin.grid": "グリッド"
}
```

Also add to the inline `JA` map in `BaseLayout.astro`:
```javascript
'nav.admin': '管理',
```

---

## 8. Updated Admin Page Template

**File**: `src/frontend/src/pages/admin/index.astro`

```astro
---
/**
 * Admin Dashboard — #179
 * Tabbed admin interface: System stats, Users, Farms.
 * Accessible at /admin/ — visible in nav only for admins.
 */
import BaseLayout from '../../layouts/BaseLayout.astro';
import AdminDashboard from '../../components/AdminDashboard';
---

<BaseLayout title="LitCrop — Admin" activeTab="admin">
  <div
    style="display:flex;align-items:center;padding:var(--space-4);background:var(--color-surface);border-bottom:var(--border-default);position:sticky;top:0;z-index:100"
  >
    <h1 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold)">
      Admin
    </h1>
  </div>

  <AdminDashboard client:load />
</BaseLayout>
```

---

## 9. CSS Additions

No new CSS file needed. The admin dashboard reuses existing design tokens and component classes. Specific inline styles follow the existing pattern used throughout the codebase (ProfilePage, AdminStats, ManagePage all use inline styles).

The tab bar within AdminDashboard uses:
- `display: flex; gap: 0; border-bottom: var(--border-default)`
- Each tab: `padding: var(--space-3) var(--space-4); cursor: pointer; border-bottom: 2px solid transparent`
- Active tab: `border-bottom-color: var(--color-primary); color: var(--color-primary); font-weight: var(--font-weight-semibold)`
- Inactive tab: `color: var(--color-gray-500)`

Desktop table:
- Uses existing `font-size-sm`, `border-default`, `radius-md` tokens
- Table within a card: `background: var(--color-surface); border: var(--border-default); border-radius: var(--radius-md); overflow: hidden`
- Table rows: `border-bottom: var(--border-default)` except last
- Table cells: `padding: var(--space-3) var(--space-4)`

---

## 10. Implementation Order

1. **API layer first**: Add `getAllUserProfiles()` to dynamodb.ts, add `/users` and `/farms` routes to admin.ts
2. **Frontend API client**: Add `getAdminUsers()`, `getAdminFarms()` to api.ts
3. **Navigation**: Add `getCachedIsAdmin`/`setCachedIsAdmin` to hooks, modify ProfilePage, create AdminTabInjector, modify DesktopNav and BaseLayout
4. **Dashboard component**: Create `AdminDashboard.tsx`, update admin page template
5. **i18n**: Add translation keys
6. **Testing**: Admin route tests (follow existing `__tests__/routes/admin.test.ts` pattern), component smoke test

---

## 11. Out of Scope (Future)

- Pagination on users/farms lists (unnecessary at Beta-2 scale < 100 records)
- Write operations (promote user, delete farm from admin)
- Search/filter within users/farms lists
- GSI for efficient farm-count-per-user queries
- Admin notification system
- Audit log viewer
