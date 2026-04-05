# Requirements: #274 — Integrate Public Crop Library for Species Metadata (M2)

**Issue:** [#274](https://github.com/ashmuk/litcrop/issues/274)
**Sprint:** Beta-8 — Crop Intelligence M1-M3 + UX
**Size:** L
**Step:** 1 — Requirements (cc-define)
**Date:** 2026-04-05
**ADR:** `docs/decisions/ADR-20260405-static-first-crop-library.md`
**Blocks:** #275 (M3 smart defaults)

---

## 1. Problem Statement

The existing crop library (`src/frontend/src/data/crops.json`) contains 100 crops with basic display data (id, emoji, category, EN/JA names) but **no growing metadata**. Users cannot see:
- How long a crop takes to harvest (days_to_harvest)
- Which season is optimal for planting
- Which crops are good companions for rotation

This blocks M3 (#275 smart defaults) which needs `days_to_harvest` to auto-calculate `expected_harvest` dates, and #276 (reserved vs actual UX) which needs planned vs actual data.

## 2. Current State

### Existing crop data (`src/frontend/src/data/crops.json`)
- **100 entries**, ~10KB
- Fields: `id`, `emoji`, `category`, `en`, `ja`
- Frontend-only — not available to the API
- Used by: `CropAutocomplete`, `BedDetail`, `FarmOverview`, `FarmLayoutView`, `WeatherView`

### Existing helpers (`src/frontend/src/lib/crops.ts`)
- `CROPS`, `CROP_MAP`, `QUICK_SELECT_CROPS`
- `getCropEmoji()`, `getCropName()`, `getCropDisplay()`, `searchCrops()`, `normalizeCropType()`
- Used by 6 frontend components + 1 test file

### API has no crop library
- `crop_type` on Bed is a free-text string
- No endpoint to look up crop metadata
- Chat AI has no crop growing knowledge (beyond what's in the LLM's training data)

---

## 3. Functional Requirements

### FR-1: Enhance crop data with growing metadata
Extend each crop entry with:
```typescript
{
  id: string;           // existing
  emoji: string;        // existing
  category: string;     // existing
  en: string;           // existing
  ja: string;           // existing
  days_to_harvest_min?: number;   // NEW — minimum days from planting to harvest
  days_to_harvest_max?: number;   // NEW — maximum days
  season?: string[];              // NEW — optimal planting seasons ["spring", "summer", "fall", "winter"]
  companions?: string[];          // NEW — companion crop ids for rotation suggestions
}
```
- Not all crops need all fields (metadata is optional per crop)
- Data curated from USDA Plants Database + OpenFarm (CC0) at development time
- No runtime API calls to external sources

### FR-2: Move crop data to shared package
- Move `crops.json` from `src/frontend/src/data/` to `packages/shared/src/data/crop-library.json`
- Export types and data from `@litcrop/shared`
- Frontend imports redirect to shared package
- API can import the same data

### FR-3: Create shared crop library module
- New `packages/shared/src/crop-library.ts`:
  - Export `CropEntry` type (with new metadata fields)
  - Export `CROPS: CropEntry[]` (full list)
  - Export `CROP_MAP: Map<string, CropEntry>` (O(1) lookup)
  - Export `getCropMeta(cropId: string): CropEntry | undefined`
- Frontend `lib/crops.ts` becomes a thin wrapper importing from `@litcrop/shared`

### FR-4: Create API endpoint `GET /api/v1/crop-library/:cropId`
- Returns crop metadata for a given crop ID
- 200 with crop entry if found
- 404 if not found
- No authentication required (public reference data)
- Response shape:
```json
{
  "id": "tomato",
  "emoji": "🍅",
  "category": "fruit",
  "en": "Tomato",
  "ja": "トマト",
  "days_to_harvest_min": 60,
  "days_to_harvest_max": 85,
  "season": ["spring", "summer"],
  "companions": ["basil", "carrot", "parsley"]
}
```

### FR-5: Create API endpoint `GET /api/v1/crop-library`
- Returns full crop library (all entries)
- Used by frontend for search/autocomplete if needed
- Response: `{ data: CropEntry[] }`
- Cache-Control header for browser caching (immutable static data)

### FR-6: Update frontend imports
- `lib/crops.ts` imports `CropEntry`, `CROPS`, `CROP_MAP` from `@litcrop/shared`
- Re-exports display helpers (`getCropEmoji`, `getCropName`, etc.) — these stay frontend-only (locale-dependent)
- All existing component imports continue to work (no breaking change)

### FR-7: Backward compatibility for free-text crops
- Crops not in the library (user-entered free text) return `undefined` from `getCropMeta()`
- Frontend and API handle missing metadata gracefully (show "—" or skip)
- No validation change — `crop_type` on Bed remains free text

---

## 4. Non-Functional Requirements

### NFR-1: Zero additional AWS cost
- Static data bundled at build time — no DynamoDB, no external API
- API endpoint reads from in-memory import (no DB call)

### NFR-2: Data quality
- Growing metadata curated from authoritative sources (USDA, OpenFarm CC0)
- Days-to-harvest expressed as ranges (min/max) to account for climate variation
- Season expressed as array (crops can span multiple seasons)
- Companions are crop IDs referencing other entries in the library

### NFR-3: Bundle size
- Current: ~10KB (100 entries)
- Target: ~25-30KB with metadata (same 100 entries + new fields)
- Acceptable — less than cities.json (~20KB)

### NFR-4: Test coverage
- Shared: crop-library module tests (lookup, getCropMeta)
- API: GET /crop-library/:cropId (200, 404)
- API: GET /crop-library (200, returns all)
- Frontend: existing crops.test.ts updated for shared imports

---

## 5. Constraints

| Constraint | Detail |
|-----------|--------|
| Static-first (ADR) | No runtime external API calls. Data curated at dev time. |
| Budget | $0 additional — in-memory data, no DB |
| Shared package | Data must be in `packages/shared/` (not frontend-only) |
| Backward compat | Existing CropAutocomplete, getCropEmoji, etc. must keep working |
| Free-text crops | `crop_type` on Bed remains free text — library is reference, not constraint |

---

## 6. Out of Scope

- Dynamic API fallback for exotic crops — tracked as #284 (Pre-Production)
- Crop variety metadata (e.g., Cherry Tomato vs Beefsteak) — per-variety data is too granular
- Planting calendar visualization — that's part of #276 (reserved vs actual UX)
- AI-powered crop recommendations — that's #278 (Beta-11)

---

## 7. Acceptance Criteria

- [ ] `crop-library.json` in shared package with 100 crops + growing metadata
- [ ] `CropEntry` type exported from `@litcrop/shared` with new fields
- [ ] `getCropMeta()` returns metadata for known crops, undefined for unknown
- [ ] `GET /api/v1/crop-library/tomato` → 200 with full metadata
- [ ] `GET /api/v1/crop-library/unknown` → 404
- [ ] `GET /api/v1/crop-library` → 200 with all entries
- [ ] Frontend `CropAutocomplete` still works (no regression)
- [ ] Frontend `getCropEmoji`, `getCropName`, `getCropDisplay` still work
- [ ] `searchCrops` still works with bilingual search
- [ ] Shared package builds successfully
- [ ] All existing tests pass + new tests for crop library
- [ ] No external API calls at runtime

---

## 8. Files to Modify/Create

| Layer | File | Change |
|-------|------|--------|
| **Shared** | `packages/shared/src/data/crop-library.json` | NEW — enhanced 100 crops with metadata |
| **Shared** | `packages/shared/src/crop-library.ts` | NEW — types, CROPS, CROP_MAP, getCropMeta |
| **Shared** | `packages/shared/src/index.ts` | Export crop-library module |
| **API** | `src/api/src/routes/crop-library.ts` | NEW — GET endpoints |
| **API** | `src/api/src/app.ts` | Register crop-library routes |
| **Frontend** | `src/frontend/src/lib/crops.ts` | Redirect imports to @litcrop/shared |
| **Frontend** | `src/frontend/src/data/crops.json` | DELETE — replaced by shared data |
| **Tests** | `packages/shared/src/__tests__/crop-library.test.ts` | NEW — library tests |
| **Tests** | `src/api/src/__tests__/routes/crop-library.test.ts` | NEW — API endpoint tests |
| **Tests** | `src/frontend/src/__tests__/crops.test.ts` | Update for shared imports |

---

## 9. Data Curation Plan

For each of the 100 crops, add metadata sourced from USDA/OpenFarm:

| Category | Example | days_to_harvest | season | companions |
|----------|---------|----------------|--------|------------|
| grain | Rice | 120-150 | spring,summer | soybean |
| fruit | Tomato | 60-85 | spring,summer | basil,carrot |
| vegetable | Cucumber | 50-70 | spring,summer | bean,corn |
| leafy | Lettuce | 30-60 | spring,fall | carrot,radish |
| root | Daikon | 50-70 | fall,winter | carrot |
| legume | Soybean | 80-120 | spring,summer | corn |
| herb | Basil | 50-75 | spring,summer | tomato |

Crops without reliable data get no metadata fields (optional fields remain undefined).

---

## 10. Next Step

Step 1 complete. Run `/cc-design` to proceed to Step 2: Architecture.
