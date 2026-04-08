# Architecture: Searchable Crop Library (#216 + #257 + #329)

> `crop_type` remains a free `string` in DynamoDB.
> Library relocated to `packages/shared/src/` (used by both frontend and API).

> **Note**: Sections 1-6 below were written for the original #216 scope.
> Paths and schemas have since evolved — see Section 7 for current state.

---

## 1. Data File

**Location**: `packages/shared/src/data/crop-library.json`
*(Originally `src/frontend/src/data/crops.json` — relocated to shared package
when the API began using crop metadata for smart-defaults and diary bridging.)*

Rationale: The data is consumed by both frontend (autocomplete, display) and API
(harvest estimation, diary entry validation). The frontend bundler (Vite) inlines
the ~25 KB JSON import with zero runtime fetch cost.

**Schema** (per entry) — see Section 7a for the full current schema:

```ts
interface CropEntry {
  id: string;                    // machine key, e.g. "tomato", "edamame"
  emoji: string;                 // single emoji, e.g. "🍅"
  category: string;              // grain | fruit | vegetable | root | leafy | legume | herb | other
  en: string;                    // English display name
  ja: string;                    // Japanese display name
  days_to_harvest_min?: number;  // added #275
  days_to_harvest_max?: number;  // added #275
  season?: string[];             // added #275
  companions?: string[];         // added #275
}
```

Design notes:
- `id` is the value stored in `crop_type`. Matches existing values (`rice`,
  `tomato`, etc.) so current data needs no migration.
- Translations live in the data file, not in i18n JSON. The i18n crop_type keys
  (`add_plot.crop_types.*`) remain for backward compatibility but the
  autocomplete reads directly from `crops.json`. This avoids maintaining 100+
  keys in two i18n files.
- Categories are a flat string, not a nested structure. Canonical enum:
  `grain | fruit | vegetable | root | leafy | legume | herb | other`.

**Existing constant update**: `CROP_TYPES` in `packages/shared/src/constants.ts`
stays as-is (the 8-item tuple). It is only used by the frontend dropdown which
this feature replaces. Deprecate it with a `@deprecated` JSDoc pointing to
`crops.json`. Remove it in a later cleanup pass.

---

## 2. Crop Lookup Module

**Shared library**: `packages/shared/src/crop-library.ts`
*(Types, O(1) lookup, `estimateHarvestDate()`, and data re-exports.)*

**Frontend utilities**: `src/frontend/src/lib/crops.ts`
*(Search, display helpers, normalization — imports from `@litcrop/shared`.)*

See actual files for current implementation. Original design spec omitted for brevity
— the API surface is stable: `CROPS`, `CROP_MAP`, `getCropMeta()`, `getCropEmoji()`,
`getCropName()`, `getCropDisplay()`, `searchCrops()`, `normalizeCropType()`.

**Locale handling**: `getCropName` and `getCropDisplay` call `getLocale()` internally
(exported from `i18n.ts`) instead of requiring a `locale` parameter. This matches
how `t()` works — no locale prop needed in components.

Design notes:
- No debounce needed in the search function itself -- 100 items is trivially
  fast to filter synchronously. Debounce only the input event handler (see
  component below).
- `getCropEmoji` uses `'🌱'` (seedling) as the fallback for free-text crops
  not in the library. This is visually neutral and communicates "crop" without
  implying a specific type.

---

## 3. Autocomplete Component

**File**: `src/frontend/src/components/CropAutocomplete.tsx`

**Behavior**:

```
+------------------------------------------+
| [🍅 Tomato                          x ]  |  <-- text input with clear button
+------------------------------------------+
| 🌾 Rice  🍅 Tomato  🥒 Cucumber  ...    |  <-- quick-select chips (top 8)
+------------------------------------------+
|  --- Fruit ---                           |  <-- grouped dropdown (visible on focus/type)
|  🍅 Tomato                               |
|  🍆 Eggplant                             |
|  --- Leafy ---                           |
|  🥬 Lettuce                              |
|  🥬 Cabbage                              |
+------------------------------------------+
```

**Props**:

```ts
interface CropAutocompleteProps {
  value: string;                    // current crop_type value
  onChange: (value: string) => void;
  placeholder?: string;
}
```

No `locale` prop — locale is resolved internally via `getLocale()`.

**Interaction rules**:

| Action | Result |
|--------|--------|
| Focus empty input | Show all crops grouped by category |
| Type 2+ chars | Filter list, show max 10 matches (flat, no grouping) |
| Click chip | Set value immediately, close dropdown |
| Click dropdown item | Set value, close dropdown |
| Arrow keys + Enter | Navigate and select in dropdown |
| Tab | Close dropdown without selecting, move focus to next field (WAI-ARIA) |
| Escape | Close dropdown, keep current value |
| Type unmatched text + blur | Normalize via `normalizeCropType()`, accept as free-text if no match |
| Clear button | Set value to `""` |

**Implementation notes**:
- Input debounce: 150ms on keystroke before filtering. UX polish, not performance.
- **IME handling**: Listen for `compositionstart`/`compositionend`. While
  `isComposing === true`, suppress search filtering. Filter only after
  `compositionend`. This prevents dropdown flicker during Japanese input.
- Keyboard navigation: `aria-activedescendant` pattern. The input keeps focus;
  arrow keys move a visual highlight; Enter selects.
- Accessibility: `role="combobox"`, `aria-expanded`, `aria-autocomplete="list"`,
  dropdown uses `role="listbox"` with `role="option"` items.
- Quick-select chips: 7 specific crops (excluding "other"):
  `['rice', 'tomato', 'cucumber', 'eggplant', 'lettuce', 'daikon', 'cabbage']`.
  "Other" is excluded because the free-text input serves that purpose.
- Category grouping: When showing the full unfiltered list, group by `category`
  with a non-interactive heading row. When filtering, show a flat list.
- No external dependencies. ~150-line Preact component using existing CSS vars.

---

## 4. Integration Points

### 4a. BedDetail.tsx (crop editing)

Replace the `<select>` block (lines 303-310) with `<CropAutocomplete>`:

```tsx
// Before:
<select id="crop-type" class="form-input" ...>
  <option value="">---</option>
  {CROP_TYPES.map(c => <option ...>{t(`add_plot.crop_types.${c}`)}</option>)}
</select>

// After:
<CropAutocomplete
  value={cropForm.crop_type}
  onChange={(v) => setCropForm({ ...cropForm, crop_type: v })}
  placeholder={t('bed.select_crop')}
/>
```

### 4b. Emoji display (read-only locations)

Three files currently show `crop_type` as plain text. Add emoji prefix using
`getCropEmoji`:

| File | Line | Current | After |
|------|------|---------|-------|
| `FarmOverview.tsx` | 194 | `bed.crop_type \|\| t('bed.empty')` | `getCropDisplay(bed.crop_type) \|\| t('bed.empty')` |
| `FarmLayoutView.tsx` | 135 | `bed.crop_type \|\| t('bed.empty')` | `getCropDisplay(bed.crop_type) \|\| t('bed.empty')` |
| `BedDetail.tsx` | 258 | crop type display | Same pattern |
| `WeatherView.tsx` | 321 | raw `crop_type` string | `getCropName(bed.crop_type)` |

Note: `getCropDisplay()` returns `''` for undefined/null crop_type, so the
`|| t('bed.empty')` fallback works correctly.

---

## 5. i18n Strategy

- **crops.json** owns crop names (en + ja columns). This is the single source
  of truth for 100+ crops.
- **Existing i18n keys** (`add_plot.crop_types.rice`, etc.) are kept but no
  longer referenced by the autocomplete. They can be removed in a future cleanup
  without breaking anything.
- **New i18n keys** needed (add to both `en.json` and `ja.json`):
  - `bed.select_crop` -- placeholder text for autocomplete input
  - `bed.category.grain` / `bed.category.fruit` / `bed.category.vegetable` /
    `bed.category.root` / `bed.category.leafy` / `bed.category.legume` /
    `bed.category.herb` / `bed.category.other` -- category headings
- **`"other"` crop type**: Included in `crops.json` with `emoji: "🌱"` and
  `category: "other"`. Excluded from quick-select chips (free-text serves that role).

---

## 6. File Summary

| Action | File | Type |
|--------|------|------|
| Create | `packages/shared/src/data/crop-library.json` | Data (~25 KB) |
| Create | `packages/shared/src/crop-library.ts` | Shared lookup module |
| Create | `src/frontend/src/lib/crops.ts` | Frontend display/search utilities |
| Create | `src/frontend/src/components/CropAutocomplete.tsx` | UI component |
| Modify | `src/frontend/src/components/BedDetail.tsx` | Replace `<select>` |
| Modify | `src/frontend/src/components/FarmOverview.tsx` | Add emoji display |
| Modify | `src/frontend/src/components/FarmLayoutView.tsx` | Add emoji display |
| Modify | `src/frontend/src/i18n/en.json` | Add new keys |
| Modify | `src/frontend/src/i18n/ja.json` | Add new keys |
| Modify | `packages/shared/src/constants.ts` | Deprecate `CROP_TYPES` |

No new dependencies. No backend changes. No DynamoDB migration.

---

## 7. Data Sources & Attribution (#329)

The crop library contains agronomic data fields that are **not user-editable**.
All values are compiled from published agricultural references and bundled as
static JSON at build time. This section documents the external sources used and
the rationale for each data field.

### 7a. Current Schema (100 crops)

**Location**: `packages/shared/src/data/crop-library.json`
(Moved from `src/frontend/src/data/crops.json` — now shared between frontend and API.)

```ts
interface CropEntry {
  id: string;                        // machine key, e.g. "tomato"
  emoji: string;                     // single emoji
  category: string;                  // grain | fruit | vegetable | root | leafy | legume | herb | other
  en: string;                        // English display name
  ja: string;                        // Japanese display name
  days_to_harvest_min?: number;      // min days from planting/transplant to harvest
  days_to_harvest_max?: number;      // max days from planting/transplant to harvest
  days_seed_to_seedling_min?: number; // #329 — min days from seed sow to transplant-ready
  days_seed_to_seedling_max?: number; // #329 — max days from seed sow to transplant-ready
  season?: string[];                 // recommended planting seasons
  companions?: string[];             // companion planting suggestions (crop ids)
}
```

### 7b. External Reference Sources

| Source | Language | Used for | Notes |
|--------|----------|----------|-------|
| **Takii Seeds (タキイ種苗)** cultivation guides | JA | Harvest timing, nursery periods, transplant stages | Primary source for Japan-market varieties. Seed packet data and online growing manuals. |
| **Sakata Seeds (サカタのタネ)** growing guides | JA | Tomato, pepper, eggplant, melon family timings | Especially reliable for fruit vegetables and grafted seedling schedules. |
| **JA (農業協同組合)** regional growing calendars | JA | Season windows, planting schedules | Regional extension guidance; varies by prefecture. |
| **Prefectural agricultural extension centers (農業改良普及センター)** | JA | Nursery durations, transplant timing, direct-seed guidance | Nagano, Chiba, Hokkaido publications consulted. Authoritative for Japanese growing conditions. |
| **USDA Plant Hardiness / Germination guides** | EN | Cross-reference for germination and harvest timelines | Used to validate Japanese-source data and fill gaps for non-traditional Japanese crops. |
| **University Extension services** (US state agriculture departments) | EN | Crop-specific growing guides | Cross-reference source; secondary to Japanese data for Japan-targeted app. |
| **NHK やさいの時間 / 家庭菜園 guides** | JA | Home garden context, simplified timelines | Useful for home-scale farming assumptions (vs commercial agriculture). |

### 7c. Data Field Rationale

**`days_to_harvest_min/max`** (added Beta-8, #275)
- Represents days from **transplant** (or direct-sow for direct-seed crops) to first harvest.
- Uses `max` for smart-default estimation (conservative — better to predict later than surprise early).
- Source: Takii/Sakata seed packets, cross-referenced with USDA extension data.
- 98 of 100 crops populated; `tea` and `other` are null (perennial/placeholder).

**`days_seed_to_seedling_min/max`** (#329)
- Represents days from **seed sowing in nursery** to **transplant-ready seedling**.
- 37 of 100 crops have data. The other 63 are null for one of these reasons:

| Null reason | Count | Examples |
|-------------|-------|---------|
| Always direct-seeded (taproot, fast-growing) | 30 | daikon, carrot, spinach, all legumes |
| Tree fruit / perennial (grafted or cutting-propagated) | 18 | apple, grape, peach, blueberry |
| Vegetative propagation (tubers, rhizomes, runners) | 13 | potato, ginger, strawberry, mint |
| Mushroom (substrate-grown) | 3 | shiitake, enoki, maitake |
| Placeholder | 1 | other |

- **Japan-specific adjustments**: Nursery durations reflect Japanese practice, which
  can differ from Western sources. For example:
  - Eggplant/pepper nursery is 55-80 days in Japan (heated greenhouse start in Feb
    for May transplant) vs 6-8 weeks in US extension guides.
  - Rice uses the Japanese box-seedling system (箱育苗): 20-30 days.
  - Green onion (長ネギ) has a 50-70 day nursery standard in Kanto-region practice.
- **Confidence tiers**:
  - High: tomato, eggplant, peppers, cucumber, brassicas, rice, onion, lettuce (well-documented, consistent across sources)
  - Medium-high: basil, pumpkin, shiso, chive, kale, parsley (good data, minor varietal variation)
  - Medium: rosemary, lavender, thyme, asparagus, celery (rarely seed-started; most growers use cuttings/crowns)

### 7d. Smart-Default Harvest Calculation

**Function**: `estimateHarvestDate()` in `packages/shared/src/crop-library.ts`

Accepts `(plantedDate, cropId, plantMethod?)` where `plantMethod` is optional `PlantMethod` type (#329):
```
Seedling mode:  harvest = planted_at + days_to_harvest_max
Seed mode:      harvest = planted_at + days_seed_to_seedling_max + days_to_harvest_max
```

- Uses `_max` values (conservative estimate).
- Returns `null` if the crop has no harvest data, or if seed mode is selected but
  the crop has no nursery data (direct-seed crops, trees, etc.).
- The UI should hide or disable the seed/seedling toggle for crops where
  `days_seed_to_seedling` is null — the distinction is not meaningful.

### 7e. Maintenance Policy

- Data is **static and bundled** — no runtime API calls.
- Updates should reference the sources above and note the change in commit messages.
- Future dynamic crop API (#284) may supplement this data at runtime, but the
  static library remains the baseline fallback.
- When adding new crops, all agronomic fields are optional — the library gracefully
  handles missing data (smart-default returns null, UI shows no estimate).
