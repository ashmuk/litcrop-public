# Beta-7 Requirements: Farm Diary

> Step 1 of the design pipeline (`cc-define`). Generated 2026-04-03.
> Issues: #245 (epic), #246 (work log), #247 (calendar)

---

## 1. Problem Statement

LitCrop is currently a **monitoring tool** — users view crop status, weather, and camera images passively. There is no way to record daily farm work, track costs, or visualize crop timelines. Users need to log what they did, what it cost, and see their farm activity on a calendar to plan ahead.

The Farm Diary transforms LitCrop from a monitoring tool into a **farm management tool**.

## 2. Stakeholders

| Stakeholder | Need |
|-------------|------|
| **Farm owner** | Log daily work, track costs per bed, plan via calendar |
| **Farm staff** | Quick-add entries for their assigned work |
| **Admin** | View all diary entries across farms (future) |

## 3. Scope

### 3.1 In Scope (Beta-7)

| ID | Feature | Issue |
|----|---------|-------|
| F1 | **Work Log** — CRUD for daily farm activity entries | #246 |
| F2 | **Cost Tracking** — per-entry cost items (materials, seeds, labor) | #246 |
| F3 | **Farm Calendar** — monthly grid showing diary entries by date | #247 |
| F4 | **Crop Timeline** — horizontal bars showing planted_at → expected_harvest per bed | #247 |
| F5 | **Weather Overlay** — frost/rain markers from weather API on calendar _(conditional — implement if time permits)_ | #247 |
| F6 | **Bottom Nav Tab** — new "Diary" tab between Weather and Device | #245 |
| F7 | **i18n** — all new strings in EN and JA | #245 |

### 3.2 Out of Scope (Deferred)

| Feature | Sprint | Issue |
|---------|--------|-------|
| ROI Dashboard (cost analysis, harvest yields) | Beta-8 | #248 |
| Gantt chart view | Beta-8 | #248 |
| Season-over-season comparison | Beta-8 | #248 |
| Reminders / scheduled tasks | Production | — |
| CSV export | Production | — |
| AI chat on all pages | PENDING | #183 |
| Soft delete | PENDING | #168 |

---

## 4. Functional Requirements

### FR-1: Diary Entry CRUD (#246)

**FR-1.1** Users can **create** a diary entry with:
- `date` (ISO date `YYYY-MM-DD`, required, defaults to today). Represents the farm's **local date**. Server-side "not future" validation allows +1 calendar day from UTC to accommodate timezone differences (e.g., JST = UTC+9).
- `category` (enum, required — see categories below)
- `description` (string, 1-1000 chars, required)
- `time_spent_minutes` (positive integer, optional)
- `bed_id` (UUID, optional — references existing bed in same farm)
- `photo_ids` (array of image UUIDs, optional — references existing images, max 5)
- `costs` (array of cost items, optional — see FR-2)

**FR-1.2** Users can **list** diary entries for a farm within a date range:
- Query params: `from` (ISO date), `to` (ISO date), `category` (optional filter)
- Default range: current month (1st → last day)
- Results grouped by date, sorted newest-first within each date
- Paginated via cursor (consistent with existing API pattern)

**FR-1.3** Users can **update** a diary entry (all fields except `date` and `created_by`)

**FR-1.4** Users can **delete** a diary entry (hard delete — no soft delete pattern per #168 status)

**FR-1.5** Only farm members can create/read entries. Only entry creator + admin/owner can update/delete.

**FR-1.6** All single-entry endpoints (GET/:id, PATCH, DELETE) MUST enforce a **farm-scope guard**: after fetching an entry by ID (via GSI1), the server MUST verify `entry.farm_id === :farmId` before returning data or allowing mutation. This prevents IDOR attacks where a user supplies their own farm ID but a victim's entry ID. This matches the `assertBedAccess` pattern in `beds.ts`.

### FR-2: Cost Tracking (#246)

**FR-2.1** Each diary entry can have 0-10 cost items:
```
{ item: string (1-100 chars), amount: number (>= 0), currency: 'JPY' | 'USD' }
```

**FR-2.2** Costs are embedded in the diary entry (not separate entities) for Beta-7 simplicity.

**FR-2.3** Cost totals are displayed per entry in the list view.

### FR-3: Work Categories (#246)

**FR-3.1** Categories are a fixed enum (not user-configurable in Beta-7):

| Key | EN Label | JA Label | Color |
|-----|----------|----------|-------|
| `planting` | Planting | 植付け | `#22c55e` (green) |
| `watering` | Watering | 水やり | `#3b82f6` (blue) |
| `fertilizing` | Fertilizing | 施肥 | `#a855f7` (purple) |
| `harvesting` | Harvesting | 収穫 | `#f59e0b` (amber) |
| `weeding` | Weeding | 除草 | `#84cc16` (lime) |
| `pest_control` | Pest Control | 害虫駆除 | `#ef4444` (red) |
| `maintenance` | Maintenance | 整備 | `#6b7280` (gray) |
| `purchase` | Purchase | 購入 | `#f97316` (orange) |
| `other` | Other | その他 | `#9ca3af` (light gray) |

**FR-3.2** Each category has a distinct color for calendar dot visualization.

### FR-4: Farm Calendar (#247)

**FR-4.1** Monthly calendar grid view:
- 7-column grid (Sun–Sat or Mon–Sun based on locale)
- Days with diary entries show colored dots (one per category present that day)
- Tapping a day shows the entry list for that date
- Navigation: prev/next month arrows + month/year header

**FR-4.2** Crop timeline bars overlaid below the calendar:
- Each bar represents one bed: `planted_at` → `expected_harvest`
- Bars labeled with bed name + crop type
- Current date marker (vertical line)
- Clicking a bar navigates to `/beds/view?id=<bedId>`
- Data source: existing beds API (`getBeds()` returns `planted_at`, `expected_harvest`)

**FR-4.3** Weather overlay markers _(conditional scope — implement if time permits after F1-F4)_:
- Show icons for frost warnings, heavy rain from weather API
- Historical weather events on past dates (if available from weather service)
- Data source: existing weather API

### FR-5: Navigation (#245)

**FR-5.1** New bottom nav tab order (5 tabs for all users):
```
🌾 Crops → ⛅ Weather → 📓 Diary → 📡 Device → 🌱 Profile
```

**FR-5.2** Diary tab:
- Icon: `📓` (notebook)
- Label: "Diary" (EN) / "日誌" (JA)
- Route: `/diary`
- `data-i18n="nav.diary"`

**FR-5.3** Admin tab (via `AdminTabInjector`) becomes 6th tab when present.

**FR-5.4** Desktop nav bar (`DesktopNav.tsx`) must also include Diary link.

### FR-6: Internationalization (#245)

**FR-6.1** All new UI strings added to both `en.json` and `ja.json`:
- Navigation labels
- Category names
- Form labels and placeholders
- Error messages
- Empty states

**FR-6.2** Calendar day names and month names follow locale.

**FR-6.3** Currency formatting follows locale (`¥1,000` vs `$10.00`).

---

## 5. Non-Functional Requirements

### NFR-1: Performance
- Diary entry list must load within 1s for up to 100 entries/month
- Calendar view must render within 500ms (no external chart libraries)
- Calendar is pure CSS/Preact — no external dependencies (per #247 spec)

### NFR-2: Cost (AWS Budget)
- **No new DynamoDB table** — diary entities stored in existing `litcrop-mvp` table
- **No new Lambda functions** — diary routes added to existing API Lambda
- **No new GSI** unless date-range queries prove insufficient with SK-based `begins_with`
- Must stay within $1.18/mo budget ($5 ceiling)

### NFR-3: Accessibility
- Calendar grid must be keyboard-navigable (arrow keys between days)
- Category color dots must have text alternatives (not color-only)
- Form inputs must have associated labels
- Minimum 16px font for outdoor readability (per existing `tokens.css`)

### NFR-4: Data Integrity
- Diary entries scoped to farm (farm members only)
- Entry creator tracked via `created_by` field
- Bed references validated against farm's actual beds
- If a referenced bed no longer exists (deleted after diary entry was created), `bed_name` returns `null` and the UI renders "(deleted bed)"
- Cost amounts validated as non-negative numbers

### NFR-5: Consistency
- Follow existing Hono route patterns (see `routes/beds.ts`, `routes/devices.ts`)
- Follow existing Zod validation patterns (see `packages/shared/src/schemas/index.ts`)
- Follow existing DynamoDB key conventions (see `constants.ts` prefixes)
- Follow existing i18n key naming conventions (dot-separated, nested)
- Follow existing component patterns (Preact islands with `client:load`)

---

## 6. Data Model Requirements

### DM-1: New DDB Key Prefixes

Add to `DDB_KEY_PREFIXES` in `packages/shared/src/constants.ts`:

```
DIARY: 'DIARY#'
```

> Note: Costs are embedded in diary entries (not separate entities) for Beta-7.
> COST# and HARVEST# prefixes deferred to Beta-8 when ROI dashboard needs independent cost/harvest records.

### DM-2: Diary Entry Entity

```
PK:  FARM#{farmId}
SK:  DIARY#{date}#{entryId}    (date = YYYY-MM-DD, entryId = UUID)

GSI1PK: DIARY#{entryId}
GSI1SK: #META

Fields:
  id:                 string (UUID)
  farm_id:            string (UUID)
  date:               string (YYYY-MM-DD)
  category:           DiaryCategory enum
  description:        string (1-1000 chars)
  time_spent_minutes: number | null
  bed_id:             string | null (UUID, references bed in same farm)
  photo_ids:          string[] (max 5, references existing image IDs)
  costs:              CostItem[] (max 10)
  created_by:         string (userId)
  created_at:         string (ISO 8601)
  updated_at:         string (ISO 8601)
```

### DM-3: Key Design Rationale

| Decision | Rationale |
|----------|-----------|
| PK = `FARM#` | Farm-scoped access, consistent with beds/devices/members |
| SK prefix = `DIARY#{date}#` | Enables `between` queries for date ranges — no GSI needed. For full-month optimization, `begins_with('DIARY#2026-04')` can be used as a shortcut. |
| Date in SK | Natural sort order: entries within a month are sorted by date. Use `ScanIndexForward: false` for newest-first. |
| GSI1 for ID lookup | Consistent with beds/images/devices — enables direct entry fetch by UUID. Use `DDB_KEY_PREFIXES.META` constant (not hardcoded `'#META'`). |
| Embedded costs | Avoids separate entity for Beta-7; simpler writes, atomic updates |
| No COST#/HARVEST# prefix yet | Deferred to Beta-8 when independent cost/harvest records are needed for ROI |

### DM-4: Access Patterns

| Pattern | Query | Index | Notes |
|---------|-------|-------|-------|
| List entries for farm in date range | PK=`FARM#{farmId}`, SK `between` `DIARY#{from}` and `DIARY#{to}~` | Primary | Canonical method. Tilde (`~`, U+007E) is the upper-bound sentinel — sorts after all date+UUID strings, avoids `\xff` encoding issues. Use `ScanIndexForward: false` for newest-first. |
| List entries for farm in a month _(optimization)_ | PK=`FARM#{farmId}`, SK `begins_with` `DIARY#{YYYY-MM}` | Primary | Only valid when `from` and `to` span an exact calendar month. Use `ScanIndexForward: false`. |
| Get entry by ID | GSI1PK=`DIARY#{entryId}`, GSI1SK=`DDB_KEY_PREFIXES.META` | GSI1 | After fetch, MUST verify `entry.farm_id === :farmId` (farm-scope guard per FR-1.6). |
| Filter by category | Client-side filter on query results (low volume per month) | — | |

> **Important:** `between` is the canonical query operator for all date-range queries. `begins_with` is an optional optimization for the full-month case only. Partial-month ranges (e.g., `from=04-10, to=04-20`) MUST use `between`.

### DM-5: Item Size Estimate

Estimated max item size at field caps: ~3 KB (description 1000 chars + 10 cost items + 5 photo_ids + fixed fields + DDB attribute overhead). Well within the 400 KB DynamoDB item limit. Monitor if Beta-8 adds embedded harvest records.

---

## 7. API Requirements

### API-1: Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/farms/:farmId/diary` | JWT + farm member | Create diary entry |
| `GET` | `/api/v1/farms/:farmId/diary` | JWT + farm member | List entries (date range) |
| `GET` | `/api/v1/farms/:farmId/diary/:entryId` | JWT + farm member | Get single entry (farm-scope guard: verify `entry.farm_id === :farmId`) |
| `PATCH` | `/api/v1/farms/:farmId/diary/:entryId` | JWT + creator/admin/owner | Update entry (farm-scope guard + creator/role check) |
| `DELETE` | `/api/v1/farms/:farmId/diary/:entryId` | JWT + creator/admin/owner | Delete entry (farm-scope guard + creator/role check) |

> **Security:** All single-entry endpoints MUST: (1) call `assertFarmAccess(:farmId, userId)`, (2) fetch entry via GSI1, (3) verify `entry.farm_id === :farmId`, (4) for mutations, check `entry.created_by === userId` OR user role is admin/owner. Follows `assertBedAccess` pattern.

### API-2: Query Parameters (GET list)

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `from` | ISO date | 1st of current month | Start date (inclusive) |
| `to` | ISO date | Last day of current month | End date (inclusive) |
| `category` | DiaryCategory | — | Optional filter |
| `limit` | integer (1-100) | 50 | Max entries per page |
| `cursor` | string | — | Pagination cursor |

### API-3: Request/Response Shapes

**Create Request (POST):**
```json
{
  "date": "2026-04-03",
  "category": "planting",
  "description": "Planted tomato seedlings in bed A1",
  "time_spent_minutes": 45,
  "bed_id": "uuid-of-bed",
  "photo_ids": ["uuid-of-image"],
  "costs": [
    { "item": "Tomato seedlings x10", "amount": 500, "currency": "JPY" }
  ]
}
```

**List Response (GET):**
```json
{
  "data": [
    {
      "id": "entry-uuid",
      "date": "2026-04-03",
      "category": "planting",
      "description": "Planted tomato seedlings in bed A1",
      "time_spent_minutes": 45,
      "bed_id": "uuid-of-bed",
      "bed_name": "A1",
      "costs": [{ "item": "Tomato seedlings x10", "amount": 500, "currency": "JPY" }],
      "cost_total": 500,
      "created_by": "user-uuid",
      "created_at": "2026-04-03T09:00:00Z"
    }
  ],
  "meta": {
    "count": 1,
    "limit": 50,
    "next_cursor": null
  }
}
```

### API-4: Validation Rules (Zod)

- `date`: ISO date string (`YYYY-MM-DD`), not future (+1 day tolerance from UTC for timezone accommodation per FR-1.1)
- `from`/`to` (list endpoint): ISO date strings, `from <= to`, maximum span 366 days
- `category`: One of the 9 enum values
- `description`: String, 1-1000 characters, trimmed
- `time_spent_minutes`: Positive integer, max 1440 (24 hours)
- `bed_id`: Valid UUID or null; must belong to same farm (server-side check)
- `photo_ids`: Array of UUIDs, max 5; must reference existing images **in the same farm** (server-side check: each image's bed must belong to `entry.farm_id`)
- `costs`: Array, max 10 items; each: `item` (1-100 chars), `amount` (>= 0, max 99999999), `currency` ('JPY' | 'USD')

---

## 8. Frontend Requirements

### FE-1: New Files

| File | Purpose |
|------|---------|
| `/src/pages/diary.astro` | Diary page (Astro layout + island) |
| `/src/components/DiaryPage.tsx` | Main diary island (list + calendar toggle) |
| `/src/components/DiaryEntryForm.tsx` | Create/edit entry form |
| `/src/components/DiaryCalendar.tsx` | Monthly calendar grid |
| `/src/components/CropTimeline.tsx` | Horizontal crop bars below calendar |

### FE-2: Modified Files

| File | Change |
|------|--------|
| `BaseLayout.astro` | Add 📓 Diary tab (3rd position) between Weather and Device. Extend `activeTab` prop union to include `'diary'`. Update the inline JA translation map to include `nav.diary: '日誌'` (this map is hardcoded, not driven by `ja.json`). |
| `AdminTabInjector.tsx` | Adjust — admin tab becomes 6th when Diary is present |
| `DesktopNav.tsx` | Add Diary link |
| `lib/api.ts` | Add diary API functions |
| `i18n/en.json` | Add `nav.diary`, `diary.*` keys |
| `i18n/ja.json` | Add `nav.diary`, `diary.*` keys |
| `packages/shared/src/constants.ts` | Add `DIARY` prefix |
| `packages/shared/src/schemas/index.ts` | Add diary schemas |
| `packages/shared/src/types/domain.ts` | Add `DiaryEntry`, `CostItem`, `DiaryCategory` types |

### FE-3: UI States

| State | Display |
|-------|---------|
| Loading | Skeleton tiles (consistent with FarmOverview) |
| Empty (no entries) | Empty state illustration + "Log your first activity" CTA |
| List view | Entries grouped by date, category icon + color, cost total |
| Calendar view | Monthly grid with category-colored dots per day |
| Error | Error banner with retry button |

### FE-4: View Toggle

- Two views: **List** (default) and **Calendar**
- Toggle button in page header (consistent with existing UI patterns)
- View preference persisted in localStorage (`litcrop-diary-view`)

---

## 9. Constraints

| # | Constraint | Source |
|---|-----------|--------|
| C1 | AWS monthly cost must not exceed ~$1.18 ($5 ceiling) | Budget memory |
| C2 | No external chart/calendar libraries — pure CSS/Preact | #247 spec |
| C3 | Design docs must be reviewed before implementation | User feedback memory |
| C4 | All UI strings in both EN and JA | Existing i18n requirement |
| C5 | Follow existing single-table DynamoDB pattern | Architecture convention |
| C6 | Calendar must be accessible (keyboard nav, ARIA) | NFR-3 |
| C7 | Use existing Hono route + Zod validation patterns | Code convention |
| C8 | Mobile-first, 480px min-width | Existing design system |

---

## 10. Dependencies

| Dependency | Status | Impact |
|------------|--------|--------|
| Beds API (`planted_at`, `expected_harvest`) | Exists | Calendar crop timeline reads from this |
| Weather API | Exists | Calendar weather overlay reads from this |
| Image upload pipeline | Exists | Photo references reuse existing image IDs |
| Farm membership + access control | Exists | `assertFarmAccess()` reused for diary routes |
| Activity log (events) | Exists | Diary events emitted for farm activity feed |

---

## 11. Acceptance Criteria

### AC-1: Work Log
- [ ] Can create a diary entry with all fields
- [ ] Can list entries filtered by date range
- [ ] Can update own entries
- [ ] Can delete own entries
- [ ] Admin/owner can update/delete any entry
- [ ] Staff can only modify their own entries
- [ ] Entries validate bed_id belongs to same farm

### AC-2: Cost Tracking
- [ ] Can add up to 10 cost items per entry
- [ ] Cost totals displayed in list view
- [ ] Currency correctly formatted per locale

### AC-3: Calendar
- [ ] Monthly grid renders correctly
- [ ] Days with entries show category-colored dots
- [ ] Tapping a day shows that day's entries
- [ ] Prev/next month navigation works
- [ ] Crop timeline bars display below calendar
- [ ] Clicking a crop bar navigates to bed detail
- [ ] Calendar grid responds to arrow-key navigation; all interactive elements reachable via Tab

### AC-4: Navigation
- [ ] Diary tab visible in bottom nav (3rd position)
- [ ] Diary tab visible in desktop nav
- [ ] Admin tab still works as 6th tab
- [ ] Active state highlights correctly

### AC-5: i18n
- [ ] All strings present in en.json and ja.json
- [ ] Category names translated
- [ ] Calendar month/day names follow locale
- [ ] No missing translation keys

### AC-6: Budget
- [ ] No new DynamoDB table created
- [ ] No new Lambda function created
- [ ] DynamoDB operations fit existing on-demand capacity

---

## 12. Recommended Next Step

> Step 1 complete. Run `/cc-design` to proceed to Step 2: Architecture.
>
> The design phase should produce:
> - DynamoDB schema ADR
> - API contract details
> - UI wireframes / component tree
> - Sequence diagrams for key flows
> - Store in `docs/designs/BETA7-DESIGN.md`
