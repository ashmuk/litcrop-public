# Requirements: #277 — Make Geo Location Optional in Farm Creation

**Issue:** [#277](https://github.com/ashmuk/litcrop/issues/277)
**Sprint:** Beta-8 — Crop Intelligence M1-M3 + UX
**Size:** S (expanded to S+ after review — 18 files, ~4-5 hours)
**Step:** 1 — Requirements (cc-define)
**Date:** 2026-04-05

---

## 1. Problem Statement

Farm creation currently **requires** latitude and longitude coordinates. This raises privacy concerns — users may not want to reveal their exact farm location, especially during initial onboarding. The map picker step blocks farm creation entirely if the user doesn't provide coordinates.

**User feedback:** Geo location must not be mandatory. City-level granularity is the minimum. Precise coordinates are opt-in for AI/elevation features.

---

## 2. Current State (What Exists)

### Data Model
| Field | Type | Required | Updatable | Where |
|-------|------|----------|-----------|-------|
| `latitude` | `number` | **YES** | NO | `domain.ts:54` |
| `longitude` | `number` | **YES** | NO | `domain.ts:55` |
| `elevation_m` | `number?` | no | NO | `domain.ts:56` |
| `climate_zone` | `string?` | no | NO | `domain.ts:57` |

**No text-based location field exists** (no city, region, or country).

### API Validation
- `POST /farms` requires `['name', 'latitude', 'longitude']` — `farms.ts:471`
- `validateFarmFields()` enforces lat/lng range validation — `farms.ts:53-68`
- `PATCH /farms/:id` does NOT allow updating location fields — `dynamodb.ts:751`

### Frontend Flow
- `FarmWizard.tsx` — 3-step wizard: Name → **MapPicker (required)** → Grid + Submit
- Step 2→3 gate: `disabled={!location}` — `FarmWizard.tsx:166`
- Submit gate: `disabled={submitting || !location}` — `FarmWizard.tsx:282`
- `MapPicker.tsx` — Interactive Leaflet map, GPS button, manual lat/lng inputs

### Downstream Dependencies
| Feature | File | Depends On | Impact if Missing |
|---------|------|-----------|------------------|
| **Weather** | `weather.ts:320` | `farm.latitude`, `farm.longitude` | **Crashes** — `fetchOpenMeteo(farm.latitude, farm.longitude)` |
| **AI Chat** | `chat.ts:100` | `farm.latitude`, `farm.longitude` | **Degrades** — shows "unknown" location in prompt |
| **Profile Map** | `ProfilePage.tsx:844-854` | `farm.latitude`, `farm.longitude` | **Crashes** — `farm.latitude.toFixed(4)` on undefined |
| **Farm Discovery** | `DiscoverableFarm` type | `latitude`, `longitude` | **Type error** — fields are non-nullable |
| **FarmLocationMap** | `FarmLocationMap.tsx:20` | `latitude: number`, `longitude: number` | **Type error** — required props |

### Zod Schema
- `FarmBaseSchema` — `latitude: z.number()`, `longitude: z.number()` — both non-nullable (`schemas/index.ts:50-51`)

---

## 3. Functional Requirements

### FR-1: Add `location_text` field to Farm entity
- New field: `location_text: string` (required, 1-200 chars)
- Represents city/region-level location (e.g., "Saitama, Japan")
- Stored in DynamoDB alongside existing fields
- Displayed when coordinates are not available

### FR-2: Make `latitude` and `longitude` optional
- Change Farm type: `latitude?: number`, `longitude?: number`
- Update Zod schema: `z.number().nullable()`
- API accepts `null` or omitted lat/lng on `POST /farms`
- `POST /farms` required fields become: `['name', 'location_text']`

### FR-3: Update FarmWizard to make map step skippable
- Step 2 (Location) must allow proceeding without setting coordinates
- Add a text input for `location_text` (required, replaces map as minimum)
- MapPicker becomes optional ("Add precise coordinates for weather and AI features")
- Show a "Skip map" link/button to proceed with text-only location
- If user provides coordinates, `location_text` can auto-populate from reverse geocode (nice-to-have, not required)

### FR-4: Graceful degradation for weather
- `GET /farms/:farmId/weather` must return a clear error (not crash) when coordinates are missing
- Return `400` with message: "Weather requires farm coordinates. Update your farm location to enable weather features."
- Frontend `WeatherView` shows a prompt to add coordinates instead of error

### FR-5: Graceful degradation for AI chat
- When lat/lng are null, chat prompt says "Location: [location_text] (coordinates not set)"
- Chat still works — provides general (non-geo-specific) recommendations
- No crash, no error
- **Two crash paths to guard:**
  - `chat.ts:100` — system prompt builder: `${farm.latitude}°N` → shows "unknown" when null
  - `chat.ts:249-250` — tool-call weather fetch: `farm.latitude.toString()` → **hard crash** if null, must guard with coordinate check before calling Open-Meteo

### FR-6: Graceful degradation for ProfilePage map
- If lat/lng are null, hide `FarmLocationMap` component
- Show `location_text` instead of coordinate display
- Existing farms with coordinates display as before (no regression)

### FR-7: Graceful degradation for DiscoverableFarm
- `DiscoverableFarm.latitude` and `.longitude` become optional
- Discovery list shows `location_text` instead of coordinates

### FR-8: Allow adding coordinates later via PATCH
- Extend `PATCH /farms/:farmId` to accept `latitude`, `longitude`, `elevation_m`
- Enables users to add/update coordinates after creation
- Validates ranges when provided (existing validation logic reused)

### FR-9: Backward compatibility
- Existing farms with coordinates are **unaffected**
- `location_text` backfill for existing farms: DynamoDB mapper sets default `""` (empty string)
- Frontend displays "Location not set" fallback when both `location_text` is empty AND coordinates are missing
- When coordinates exist but `location_text` is empty, display coordinates as location text

### FR-10: SetupForm parallel path
- `SetupForm.tsx` is a separate farm creation UI (not the wizard) — also requires updates
- Remove hard lat/lng validation gate (`isNaN(lat) || isNaN(lng)` → error toast)
- Add `location_text` input field (required)
- Make coordinate inputs optional with clear "optional" labels
- Climate zone hint derivation must handle missing latitude gracefully

### FR-11: Admin farm list
- `admin.ts:84-85` returns `latitude`/`longitude` in admin farm list response
- These become nullable — admin UI must handle display gracefully (show `location_text` or "—")

---

## 4. Non-Functional Requirements

### NFR-1: Zero additional AWS cost
- No new external API calls at runtime (reverse geocoding is nice-to-have, not required)
- `location_text` is user-provided text — no geocoding service needed

### NFR-2: Input sanitization
- `location_text` must be trimmed, max 200 chars
- No HTML/script injection — plain text only (existing pattern from name/description validation)

### NFR-3: i18n
- New i18n keys for both EN and JA:
  - `setup.location_text` / `setup.location_text_hint`
  - `weather.requires_coordinates`
  - `wizard.skip_map` / `wizard.add_coordinates_later`

### NFR-4: Test coverage
- Unit tests for API validation (location_text required, lat/lng optional)
- Unit tests for weather route when coordinates missing
- Unit tests for chat prompt when coordinates missing
- Frontend: FarmWizard can submit without coordinates

---

## 5. Constraints

| Constraint | Detail |
|-----------|--------|
| Budget | $0 additional — no geocoding API calls |
| Backward compat | Existing farms with coordinates must not break |
| DynamoDB schema | Additive only — new `location_text` attribute, existing attributes unchanged |
| No migration needed | Mapper handles missing `location_text` field gracefully |
| Size S | Keep scope tight — skip reverse geocoding, focus on core opt-in flow |

---

## 6. Out of Scope

- Reverse geocoding (coordinates → city name) — future enhancement
- Country/region dropdown selection — text input is sufficient for S-size
- Map display in farm discovery list — text location is enough
- Climate zone derivation from text location — only from coordinates

---

## 7. Acceptance Criteria

- [ ] Farm can be created with only `name` + `location_text` (no coordinates)
- [ ] Farm can be created with `name` + `location_text` + coordinates (full data)
- [ ] FarmWizard Step 2 allows skipping map picker
- [ ] Weather route returns 400 (not 500) when coordinates missing
- [ ] WeatherView shows "add coordinates" prompt when farm has no coordinates
- [ ] AI chat works without coordinates (generic advice)
- [ ] Profile page shows `location_text` when coordinates missing (no map)
- [ ] Profile page shows map + coordinates when available (no regression)
- [ ] `PATCH /farms/:id` accepts latitude/longitude updates
- [ ] Existing farms with coordinates work exactly as before
- [ ] All new i18n keys in EN + JA
- [ ] SetupForm allows submission without coordinates
- [ ] Chat tool-call weather fetch guarded against null coordinates (no crash at chat.ts:249)
- [ ] Admin farm list handles nullable lat/lng
- [ ] Existing farms without `location_text` show fallback ("Location not set" or coordinates)
- [ ] Tests pass (existing 605 + new tests for optional geo)

---

## 8. Files to Modify (Estimated)

| Layer | File | Change |
|-------|------|--------|
| **Shared** | `packages/shared/src/types/domain.ts` | `latitude?: number`, `longitude?: number`, add `location_text: string` |
| **Shared** | `packages/shared/src/types/requests.ts` | `CreateFarmRequest`: lat/lng optional, add `location_text` |
| **Shared** | `packages/shared/src/schemas/index.ts` | Schema: lat/lng nullable, add location_text |
| **API** | `src/api/src/routes/farms.ts` | Required fields, validation, PATCH extension |
| **API** | `src/api/src/routes/weather.ts` | Guard for missing coordinates |
| **API** | `src/api/src/routes/chat.ts` | Handle null lat/lng in prompt AND tool-call weather fetch (line 249-250) |
| **API** | `src/api/src/routes/admin.ts` | Nullable lat/lng in admin farm list response |
| **API** | `src/api/src/services/dynamodb.ts` | Mapper (backfill location_text) + updateFarm type extension |
| **Frontend** | `src/frontend/src/components/FarmWizard.tsx` | Skippable map step, location_text input |
| **Frontend** | `src/frontend/src/components/SetupForm.tsx` | Remove lat/lng gate, add location_text input |
| **Frontend** | `src/frontend/src/components/ProfilePage.tsx` | Conditional map/text display |
| **Frontend** | `src/frontend/src/components/WeatherView.tsx` | "Add coordinates" prompt |
| **Frontend** | `src/frontend/src/lib/api.ts` | `DiscoverableFarmItem`: lat/lng optional |
| **Frontend** | `src/frontend/src/components/FarmLocationMap.tsx` | No change (only rendered when coords exist) |
| **i18n** | `src/frontend/src/i18n/en.json` | New keys |
| **i18n** | `src/frontend/src/i18n/ja.json` | New keys |
| **Tests** | `src/api/src/__tests__/` | New test cases |
| **Tests** | `packages/shared/src/__tests__/schemas.test.ts` | Update fixtures for nullable lat/lng |

**Note:** `UpdateFarmRequest` in `requests.ts` already declares `latitude?`, `longitude?`, `elevation_m?` — pre-wired for FR-8.

---

## 9. Dependency Chain

```
None — #277 is independent of M1-M3 chain
Can be implemented in parallel with #273 (diary→bed bridge)
```

---

## 10. Next Step

Step 1 complete. Run `/cc-design` to proceed to Step 2: Architecture.
