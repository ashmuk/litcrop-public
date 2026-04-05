# Design: #277 — Make Geo Location Optional in Farm Creation

**Issue:** [#277](https://github.com/ashmuk/litcrop/issues/277)
**Requirements:** `docs/beta-8/277-REQUIREMENTS.md`
**Sprint:** Beta-8 | **Size:** S+ (~5-5.5 hours)
**Revision:** v2 — city dropdown with map sync (replaces plain text input)
**Date:** 2026-04-05

---

## Step 2: Architecture

### Decision: Extend Existing Patterns (No New Services)

This is a data model extension + UI flow change. No new services, tables, or external APIs are introduced. The architecture remains unchanged — we extend the existing Farm entity with one new field and relax two existing field constraints.

### Data Model Change

```
Farm (DynamoDB — single-table design)
──────────────────────────────────────
PK: FARM#{farmId}    SK: META

BEFORE                          AFTER
────────                        ─────
name: string (required)         name: string (required)
latitude: number (required)  →  latitude?: number (optional)
longitude: number (required) →  longitude?: number (optional)
elevation_m?: number            elevation_m?: number
climate_zone?: string           climate_zone?: string
                             +  location_text: string (required, 1-200 chars)
locale: Locale                  locale: Locale
theme: Theme                    theme: Theme
grid_rows: number               grid_rows: number
grid_cols: number               grid_cols: number
created_at: string              created_at: string
```

**DynamoDB impact:** Additive only. No migration needed. Existing records retain `latitude`/`longitude` values. Missing `location_text` handled by mapper default.

### New Static Data: City Library

```
src/frontend/src/data/cities.json  (~330 entries, ~25KB raw, ~5KB gzipped)
src/frontend/src/lib/cities.ts     (lookup helpers, search — mirrors lib/crops.ts)
```

**Data source:** SimpleMaps World Cities Database (CC0 — public domain)
**Coverage:** ~300 Japan cities (population > 10K, all 47 prefectures) + ~30 major world cities
**Data shape:**
```json
{ "id": "jp-chichibu", "en": "Chichibu", "ja": "秩父市", "region": "Saitama", "country": "JP", "lat": 35.99, "lng": 139.09 }
```
**Pattern:** Same as existing `crops.json` + `lib/crops.ts` — static bundle, bilingual search, O(1) lookup, free-text fallback.

### Backward Compatibility Strategy

| Scenario | Behavior |
|----------|----------|
| Existing farm WITH coordinates, no `location_text` | Mapper returns `location_text: ""` → UI shows coordinates |
| Existing farm WITH coordinates + `location_text` | Both displayed (map + text) |
| New farm WITHOUT coordinates | `location_text` displayed, map hidden, weather shows "add coordinates" prompt |
| New farm WITH coordinates | Full display (same as current behavior) |

### Scope Progression

**MVP** — This is a single-scope change (no PoC/Production split needed). The feature is small enough to ship complete.

---

## Step 3: UX Design

### FarmWizard Flow (Modified Step 2) — City Dropdown + Map Sync

```
BEFORE:                          AFTER:
┌──────────┐                     ┌──────────────────────────┐
│ Step 1   │                     │ Step 1                   │
│ Name +   │                     │ Name + Desc +            │
│ Desc     │                     │ LocationAutocomplete     │
│          │                     │ [Chi...            🔍]   │  ← searchable city dropdown
└────┬─────┘                     │  ┌ Chichibu, Saitama  ┐  │     (bilingual, free-text ok)
     ▼                           │  │ Chigasaki, Kanagawa│  │
┌──────────┐                     │  └────────────────────┘  │
│ Step 2   │                     └────────┬─────────────────┘
│ MapPicker│ ← REQUIRED                   ▼
│ (lat/lng)│                     ┌──────────────────────────┐
└────┬─────┘                     │ Step 2 (OPTIONAL)        │
     ▼                           │ MapPicker — pre-zoomed   │
┌──────────┐                     │ to selected city centroid│  ← city lat/lng → initialLat/Lng
│ Step 3   │                     │ User can drag pin        │
│ Grid +   │                     │ [← Back] [Next →] [Skip]│
│ Review   │                     └────────┬─────────────────┘
└──────────┘                              ▼
                                 ┌──────────────────────────┐
                                 │ Step 3: Grid + Review    │
                                 │ Location: Chichibu, ...  │
                                 │ Coords: 35.99, 139.09   │  ← if set
                                 └──────────────────────────┘
```

**Key UX decisions:**
1. **LocationAutocomplete** in Step 1 — searchable dropdown (clones CropAutocomplete pattern)
   - ~300 Japan cities + ~30 world cities, bilingual EN/JA search
   - Free-text fallback for unlisted locations (same as unlisted crops)
   - Grouped by country/region when browsing full list
2. **City → Map sync** — selecting a city passes its centroid as `initialLat`/`initialLng` to MapPicker in Step 2. Map starts zoomed to the selected city.
3. Step 2 (MapPicker) gains a **"Skip — add coordinates later"** link below the Next button
4. Step 2 → Step 3 navigation: `disabled` gate removed (location no longer blocks)
5. Step 3 review card shows `location_text` always, coordinates only when set
6. Submit button gated on `!locationText.trim()` (not `!location` coordinates)

### SetupForm Flow (Modified)

```
BEFORE:                          AFTER:
┌────────────────┐               ┌──────────────────────┐
│ Farm name      │               │ Farm name            │
│ Description    │               │ Description          │
│ Lat ☐  Lng ☐  │ ← required    │ LocationAutocomplete │ ← required (city dropdown)
│ [GPS]          │               │ Lat ☐  Lng ☐        │ ← optional label
│ Elevation      │               │ [GPS]               │
│ [Create]       │               │ Elevation            │
└────────────────┘               │ [Create]             │
                                 └──────────────────────┘
```

### WeatherView — No Coordinates State

```
┌─────────────────────────────────┐
│         ⛅                       │
│   Weather needs coordinates     │
│                                 │
│   Add your farm's location on   │
│   the Profile page to see       │
│   weather data.                 │
│                                 │
│   [ Go to Profile ]             │
└─────────────────────────────────┘
```

Follows existing `.empty-state` pattern from WeatherView error UI.

### ProfilePage — Conditional Display

```
WITH coordinates:                WITHOUT coordinates:
┌──────────────────┐             ┌──────────────────┐
│ [  Leaflet Map ] │             │ Location         │
│                  │             │ Saitama, Japan   │
│ Location         │             │                  │
│ 35.6762, 139.65  │             │ [Add coordinates │
│ Saitama, Japan   │             │  for weather]    │
│ Elevation: 15m   │             │                  │
└──────────────────┘             └──────────────────┘
```

---

## Step 4: Mock-up

**Skipped** — UI changes are minimal (one text input, one skip link, one conditional block). The UX diagrams above are sufficient. No standalone HTML mock-up needed for size-S.

---

## Step 5: System Design

### 5.1 Shared Types (`packages/shared/src/types/domain.ts`)

```typescript
export interface Farm {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  location_text: string;         // NEW — required, 1-200 chars
  latitude?: number;             // CHANGED — was required
  longitude?: number;            // CHANGED — was required
  elevation_m?: number;
  climate_zone?: string;
  locale: Locale;
  theme: Theme;
  grid_rows: number;
  grid_cols: number;
  created_at: string;
}
```

### 5.2 Shared Types (`packages/shared/src/types/requests.ts`)

```typescript
export interface CreateFarmRequest {
  name: string;
  location_text: string;         // NEW — required
  latitude?: number;             // CHANGED — optional
  longitude?: number;            // CHANGED — optional
  description?: string;
  elevation_m?: number;
  locale?: Locale;
  theme?: Theme;
  grid_rows?: number;
  grid_cols?: number;
}
```

`UpdateFarmRequest` already has `latitude?` and `longitude?` — just add `location_text?`.

### 5.3 Zod Schema (`packages/shared/src/schemas/index.ts`)

```typescript
export const FarmBaseSchema = z.object({
  // ...existing fields...
  location_text: z.string(),               // NEW
  latitude: z.number().nullable(),         // CHANGED from z.number()
  longitude: z.number().nullable(),        // CHANGED from z.number()
  // ...rest unchanged...
});
```

### 5.4 DynamoDB Mapper (`src/api/src/services/dynamodb.ts`)

**itemToFarm** — add location_text with backward-compat default:
```typescript
location_text: (item['location_text'] as string) ?? '',
latitude: item['latitude'] as number | undefined,
longitude: item['longitude'] as number | undefined,
```

**updateFarm** — extend type to include `location_text | latitude | longitude | elevation_m`:
```typescript
async updateFarm(
  farmId: string,
  updates: Partial<Pick<Farm, 'name' | 'description' | 'location_text' | 'latitude' | 'longitude' | 'elevation_m' | 'locale' | 'theme' | 'grid_rows' | 'grid_cols'>>,
)
```

The existing dynamic SET expression builder handles this automatically — any key in `updates` gets a SET clause.

### 5.5 API Route: POST /farms (`src/api/src/routes/farms.ts`)

```diff
- validateFarmFields(body, ['name', 'latitude', 'longitude']);
+ validateFarmFields(body, ['name', 'location_text']);
```

Add `location_text` validation to `validateFarmFields()`:
```typescript
const location_text = body['location_text'];
if (required?.includes('location_text') && (!location_text)) {
  errors.push('Missing required field: location_text');
} else if (location_text !== undefined && location_text !== null) {
  if (typeof location_text !== 'string' || location_text.trim().length === 0 || location_text.trim().length > 200) {
    errors.push("Invalid value for 'location_text': must be 1-200 characters");
  }
}
```

In `createFarm` call — pass `location_text`, make lat/lng conditional:
```typescript
farm = await dynamoRepo.createFarm(farmId, userId, {
  name: (body['name'] as string).trim(),
  location_text: (body['location_text'] as string).trim(),
  description: body['description'] as string | undefined,
  latitude: body['latitude'] as number | undefined,
  longitude: body['longitude'] as number | undefined,
  // ...rest unchanged
});
```

### 5.6 API Route: PATCH /farms (`src/api/src/routes/farms.ts`)

Extend the selective field inclusion block:
```typescript
if (body['location_text'] !== undefined) updates['location_text'] = (body['location_text'] as string).trim();
if (body['latitude'] !== undefined) updates['latitude'] = body['latitude'] as number;
if (body['longitude'] !== undefined) updates['longitude'] = body['longitude'] as number;
if (body['elevation_m'] !== undefined) updates['elevation_m'] = body['elevation_m'] as number;
```

### 5.7 API Route: GET /farms/:farmId/weather (`src/api/src/routes/weather.ts`)

Add coordinate guard before Open-Meteo call:
```typescript
if (farm.latitude == null || farm.longitude == null) {
  return c.json({
    error: 'coordinates_required',
    message: 'Weather requires farm coordinates. Update your farm location to enable weather.',
  }, 400);
}
```

### 5.8 API Route: Chat (`src/api/src/routes/chat.ts`)

**System prompt (line ~100):**
```typescript
const locationStr = (farm.latitude != null && farm.longitude != null)
  ? `${farm.latitude}°N, ${farm.longitude}°E`
  : `${farm.location_text} (coordinates not set)`;

return `${base}
## Farm Context
- Location: ${locationStr}
- Elevation: ${farm.elevation_m ?? 'unknown'}m
...`;
```

**Tool-call weather fetch (line ~249):**
```typescript
if (farm.latitude == null || farm.longitude == null) {
  return { error: 'Weather unavailable — farm coordinates not set' };
}
const params = new URLSearchParams({
  latitude: farm.latitude.toString(),
  longitude: farm.longitude.toString(),
  // ...rest
});
```

### 5.9 New: City Library (`src/frontend/src/data/cities.json` + `lib/cities.ts`)

**cities.json** — ~330 entries, static bundle (same pattern as crops.json):
```json
[
  { "id": "jp-chichibu", "en": "Chichibu", "ja": "秩父市", "region": "Saitama", "country": "JP", "lat": 35.99, "lng": 139.09 },
  ...
]
```

**lib/cities.ts** — mirrors `lib/crops.ts`:
```typescript
export interface CityEntry {
  id: string; en: string; ja: string;
  region: string; country: string;
  lat: number; lng: number;
}
export const CITIES: CityEntry[];
export const CITY_MAP: Map<string, CityEntry>;
export function searchCities(query: string, limit?: number): CityEntry[];
export function getCityDisplay(cityId: string): string;  // "Chichibu, Saitama"
export function normalizeCityInput(input: string): string;
```

### 5.10 New: LocationAutocomplete.tsx

Clone of `CropAutocomplete.tsx` adapted for cities:
- Props: `value: string`, `onChange: (cityId: string, lat: number | null, lng: number | null) => void`
- **onChange returns lat/lng** from the selected city — this is how map sync works
- Grouped by country when browsing full list (JP cities grouped by region/prefecture)
- Free-text fallback: if not in library, `onChange(text, null, null)` — no coordinates
- Quick-select chips: top 5-7 Japan cities (Tokyo, Osaka, Sapporo, Fukuoka, Nagoya, Sendai, Naha)
- WAI-ARIA combobox, IME composition handling, keyboard nav (all from CropAutocomplete)

### 5.11 Frontend: FarmWizard.tsx

**State changes:**
```typescript
const [locationText, setLocationText] = useState('');  // city display name
const [cityLat, setCityLat] = useState<number | null>(null);  // from city selection
const [cityLng, setCityLng] = useState<number | null>(null);
```

**Step 1:** Replace description-only with LocationAutocomplete:
```tsx
<LocationAutocomplete
  value={locationText}
  onChange={(text, lat, lng) => {
    setLocationText(text);
    setCityLat(lat);
    setCityLng(lng);
    // If city has coordinates and user hasn't set map yet, pre-set location
    if (lat != null && lng != null && !location) {
      setLocation({ lat, lng });
    }
  }}
/>
```

**Step 2:** MapPicker receives city centroid as initial position:
```tsx
<MapPicker
  initialLat={location?.lat ?? cityLat ?? undefined}
  initialLng={location?.lng ?? cityLng ?? undefined}
  onLocationChange={setLocation}
  onElevationChange={setElevation}
/>
```

**Step 2 skip:** Remove `disabled={!location}` gate. Add skip link:
```tsx
<button class="btn-link" onClick={() => setStep(3)}>
  {t('wizard.skip_map')} →
</button>
```

**handleCreate:** Pass `location_text`, make lat/lng conditional:
```typescript
const farm = await createFarm({
  name: name.trim(),
  location_text: locationText.trim(),
  ...(location && { latitude: location.lat, longitude: location.lng }),
  // ...rest
});
```

**Submit gate:** `disabled={submitting || !locationText.trim()}`

### 5.10 Frontend: SetupForm.tsx

- Add `location_text` to form state (default `''`)
- Add text input field before lat/lng inputs
- Remove the `isNaN(lat) || isNaN(lng)` → error gate (lines 68-72)
- Add "optional" label to lat/lng inputs
- Guard climate zone hint: check `form.latitude` is non-empty before deriving

### 5.11 Frontend: ProfilePage.tsx

Wrap FarmLocationMap in coordinate check:
```tsx
{farm.latitude != null && farm.longitude != null ? (
  <>
    <FarmLocationMap latitude={farm.latitude} longitude={farm.longitude} ... />
    <div>{farm.latitude.toFixed(4)}, {farm.longitude.toFixed(4)}</div>
  </>
) : (
  <div>{farm.location_text || t('profile.location_not_set')}</div>
)}
```

### 5.12 Frontend: WeatherView.tsx

Check if farm has coordinates before fetching. If not, show empty state with link to profile:
```tsx
if (!farm?.latitude || !farm?.longitude) {
  return (
    <div class="empty-state">
      <span class="empty-state__icon">⛅</span>
      <p class="empty-state__heading">{t('weather.needs_coordinates')}</p>
      <p class="empty-state__body">{t('weather.add_coordinates_hint')}</p>
    </div>
  );
}
```

### 5.13 Frontend: api.ts — DiscoverableFarmItem

```typescript
export interface DiscoverableFarmItem {
  id: string;
  name: string;
  description: string | null;
  location_text: string;           // NEW
  latitude: number | null;         // CHANGED
  longitude: number | null;        // CHANGED
  member_count: number;
  has_pending_request: boolean;
}
```

### 5.14 Admin Route (`src/api/src/routes/admin.ts`)

No code change needed — admin route calls `farmToResponse()` which uses `FarmBaseSchema`. Once the schema is updated, admin responses automatically include nullable lat/lng and `location_text`.

### 5.15 i18n Keys

**EN (`en.json`):**
```json
"setup": {
  "location_text": "City / Region",
  "location_text_hint": "e.g., Saitama, Japan",
  "coordinates_optional": "Coordinates (optional)"
},
"wizard": {
  "skip_map": "Skip — add coordinates later"
},
"weather": {
  "needs_coordinates": "Weather needs coordinates",
  "add_coordinates_hint": "Add your farm's precise location on the Profile page to see weather data."
},
"profile": {
  "location_not_set": "Location not set",
  "add_coordinates": "Add coordinates for weather"
}
```

**JA (`ja.json`):** Equivalent translations.

---

## Step 6: Task Breakdown

### Batch 1: Shared Types + Schema + City Data (no dependencies)
| Task | File | Change | Est |
|------|------|--------|-----|
| T1.1 | `types/domain.ts` | `location_text: string`, `latitude?`, `longitude?`, update `DiscoverableFarm` | 5m |
| T1.2 | `types/requests.ts` | `CreateFarmRequest`: add `location_text`, make lat/lng optional | 5m |
| T1.3 | `schemas/index.ts` | `FarmBaseSchema`: add `location_text`, make lat/lng nullable | 5m |
| T1.4 | `data/cities.json` | Curate ~300 JP cities + ~30 world cities (CC0 data) | 20m |
| T1.5 | `lib/cities.ts` | Lookup helpers, search, display (mirror lib/crops.ts) | 15m |

### Batch 2: API Backend (depends on Batch 1 types)
| Task | File | Change | Est |
|------|------|--------|-----|
| T2.1 | `dynamodb.ts` | Mapper backfill + updateFarm type extension | 10m |
| T2.2 | `farms.ts` | `validateFarmFields` + POST required fields + PATCH extension | 15m |
| T2.3 | `weather.ts` | Coordinate guard (return 400) | 5m |
| T2.4 | `chat.ts` | Null-safe prompt builder + tool-call weather guard | 10m |

### Batch 3: Frontend (depends on Batch 1 + city lib)
| Task | File | Change | Est |
|------|------|--------|-----|
| T3.1 | `i18n/en.json` + `ja.json` | New keys (city, skip, weather) | 10m |
| T3.2 | `LocationAutocomplete.tsx` | New component (clone CropAutocomplete, adapt for cities) | 25m |
| T3.3 | `FarmWizard.tsx` | LocationAutocomplete in Step 1, city→map sync, skip map | 20m |
| T3.4 | `SetupForm.tsx` | LocationAutocomplete, optional lat/lng, remove gate | 15m |
| T3.5 | `ProfilePage.tsx` | Conditional map/text display | 10m |
| T3.6 | `WeatherView.tsx` | "Needs coordinates" empty state | 10m |
| T3.7 | `api.ts` | `DiscoverableFarmItem` lat/lng optional, add `location_text` | 5m |

### Batch 4: Tests + Schema Tests (depends on Batch 2+3)
| Task | File | Change | Est |
|------|------|--------|-----|
| T4.1 | `schemas.test.ts` | Update fixtures for nullable lat/lng + location_text | 10m |
| T4.2 | `farms.test.ts` (new/extend) | POST without coords, PATCH with coords, validation | 20m |
| T4.3 | `weather.test.ts` (new/extend) | 400 when coordinates missing | 10m |
| T4.4 | `cities.test.ts` (new) | Search, display, normalization | 10m |

**Total estimated: ~3.5 hours implementation + 1.5 hours testing = ~5 hours**

---

## Step 7: Implementation Plan

### Execution Order

```
Batch 1 (Shared + City Data) ─┬─→ Batch 2 (API) ──────────┐
                               │                             ├─→ Batch 4 (Tests) → /simplify → /cc-review
                               └─→ Batch 3 (Frontend + UX) ─┘
```

### Checkpoints

| After | Action |
|-------|--------|
| Batch 1 | `tsc --noEmit` — verify types compile |
| Batch 2 | `npx vitest run` — verify existing tests pass |
| Batch 3 | `tsc --noEmit` — verify frontend compiles |
| Batch 4 | `npx vitest run` — full suite + new tests |
| All | `/simplify` → `/cc-review` → `/cc-remediate` if needed |

### Scope Level: MVP (single pass)

No PoC/Production split. Ship all changes in one commit targeting the `develop` branch.

### Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Type breakage across 18 files | Batch 1 first, then `tsc --noEmit` before touching anything else |
| Existing test regression | Run full suite after each batch |
| PATCH DynamoDB expression for numbers | Reuse existing dynamic SET builder — it handles any key/value pair |
| Backward compat (old farms) | Mapper default `''` for location_text + UI fallback to coordinates |
