# Architecture: Searchable Crop Library (#216 + #257)

> Scope: **Frontend-only** -- no backend, no schema changes.
> `crop_type` remains a free `string` in DynamoDB.

---

## 1. Data File

**Location**: `src/frontend/src/data/crops.json`

Rationale: This data is consumed exclusively by the frontend. Placing it in
`packages/shared/` would imply backend use (validation, migration) which is
explicitly out of scope. The frontend bundler (Vite) will inline a <20 KB JSON
import with zero runtime fetch cost.

**Schema** (per entry):

```ts
interface CropEntry {
  id: string;        // machine key, e.g. "tomato", "edamame"
  emoji: string;     // single emoji, e.g. "🍅"
  category: string;  // grouping key, e.g. "fruit", "root", "leafy", "grain", "legume", "herb"
  en: string;        // English display name
  ja: string;        // Japanese display name
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

**File**: `src/frontend/src/lib/crops.ts`

```ts
import cropsData from '../data/crops.json';

export type CropEntry = { id: string; emoji: string; category: string; en: string; ja: string };

/** Full list, imported once at bundle time. */
export const CROPS: CropEntry[] = cropsData;

/** O(1) lookup by id. */
export const CROP_MAP: Map<string, CropEntry> = new Map(cropsData.map(c => [c.id, c]));

/** Get emoji for a crop_type string. Returns fallback for unknown/free-text crops. */
export function getCropEmoji(cropType: string | undefined): string {
  if (!cropType) return '';
  return CROP_MAP.get(cropType)?.emoji ?? '🌱';
}

/** Get localized name for a crop_type string. Returns the raw string for unknown crops.
 *  Locale is auto-detected from the i18n module (same as t()). */
export function getCropName(cropType: string | undefined): string {
  if (!cropType) return '';
  const locale = getLocale();
  return CROP_MAP.get(cropType)?.[locale] ?? cropType;
}

/** Combined display string: "🍅 Tomato". Returns empty string if no crop. */
export function getCropDisplay(cropType: string | undefined): string {
  if (!cropType) return '';
  return `${getCropEmoji(cropType)} ${getCropName(cropType)}`;
}

/** Search crops by substring match on en or ja name.
 *  Empty query returns all crops (for "show all on focus" behavior).
 *  Romaji-to-kana transliteration is out of scope for v1. */
export function searchCrops(query: string, limit = 10): CropEntry[] {
  if (!query) return CROPS.slice(0, limit);
  const q = query.toLowerCase();
  return CROPS.filter(c =>
    c.en.toLowerCase().includes(q) || c.ja.includes(q)
  ).slice(0, limit);
}

/** Case-insensitive match on blur: normalize free-text to canonical id if possible. */
export function normalizeCropType(input: string): string {
  if (!input) return '';
  const lower = input.toLowerCase();
  const match = CROPS.find(c =>
    c.id === lower || c.en.toLowerCase() === lower || c.ja === input
  );
  return match?.id ?? input;
}
```

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
| Create | `src/frontend/src/data/crops.json` | Data (~15 KB) |
| Create | `src/frontend/src/lib/crops.ts` | Lookup module |
| Create | `src/frontend/src/components/CropAutocomplete.tsx` | UI component |
| Modify | `src/frontend/src/components/BedDetail.tsx` | Replace `<select>` |
| Modify | `src/frontend/src/components/FarmOverview.tsx` | Add emoji display |
| Modify | `src/frontend/src/components/FarmLayoutView.tsx` | Add emoji display |
| Modify | `src/frontend/src/i18n/en.json` | Add new keys |
| Modify | `src/frontend/src/i18n/ja.json` | Add new keys |
| Modify | `packages/shared/src/constants.ts` | Deprecate `CROP_TYPES` |

No new dependencies. No backend changes. No DynamoDB migration.
