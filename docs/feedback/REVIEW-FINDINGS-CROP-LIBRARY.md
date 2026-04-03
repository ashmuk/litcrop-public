# Review Findings -- Crop Library Design (#216 + #257)

> Reviewed: 2026-04-03
> Artifacts: REQUIREMENTS.md (Beta-6 section), ARCHITECTURE-CROP-LIBRARY.md
> Scope: Frontend-only searchable crop library with 100+ crops, bilingual search, emoji display

## Findings

| # | File/Section | Finding | Severity |
|---|-------------|---------|----------|
| 1 | ARCHITECTURE `searchCrops()` | Japanese search uses `c.ja.includes(q)` without `.toLowerCase()`. This is correct for CJK (no case), but the English path lowercases the query while the Japanese path does not normalize. When a user types mixed-script input (romaji like "toma" expecting to match Japanese entries), there is no romaji-to-kana conversion. This is acceptable for v1, but the architecture should explicitly note that romaji search is out of scope. | SHOULD-FIX |
| 2 | ARCHITECTURE `CropAutocomplete` props | The component requires a `locale: 'en' \| 'ja'` prop, but `BedDetail.tsx` has no access to the current locale. The i18n module's `detectLocale()` is a private function, not exported. The architecture must specify how the locale is obtained -- either by exporting `detectLocale` from `i18n.ts`, adding a `getLocale()` export, or having the component call `detectLocale` internally. | MUST-FIX |
| 3 | REQUIREMENTS vs ARCHITECTURE | Category naming inconsistency: REQUIREMENTS.md uses plural form (`"vegetables"`) while ARCHITECTURE.md uses a mix of singular adjective/noun (`fruit \| root \| leafy \| legume \| herb \| other`). Additionally, REQUIREMENTS.md says "vegetables, fruits, grains, herbs" (CR-10) while ARCHITECTURE uses a different taxonomy (`fruit \| root \| leafy \| legume \| herb \| other`). These must be reconciled into one canonical enum. | MUST-FIX |
| 4 | ARCHITECTURE 4b | The emoji display pattern `getCropEmoji(bed.crop_type) + ' ' + getCropName(bed.crop_type, locale)` has two problems: (a) it also requires `locale` which is unavailable (same as Finding #2), and (b) if `bed.crop_type` is empty/undefined, `getCropEmoji` returns `''` and `getCropName` returns `''`, but the expression evaluates to `' '` (a single space) which is truthy, so the `\|\| t('bed.empty')` fallback never triggers. The null-guard logic needs to be redesigned. | MUST-FIX |
| 5 | ARCHITECTURE 4b | `WeatherView.tsx` also displays `crop_type` (line 321: mapping bed crop types as a comma-separated list) but is not listed in the integration points. While Weather is read-only context, the crop names there are raw `crop_type` strings without localization. | SHOULD-FIX |
| 6 | ARCHITECTURE 4b | The `aria-label` attributes in both `FarmOverview.tsx` (line 183) and `FarmLayoutView.tsx` (line 122) include raw `bed.crop_type` strings. These should also use `getCropName()` for localized accessible names. | SHOULD-FIX |
| 7 | ARCHITECTURE `searchCrops` | The search function uses `.includes(q)` (substring match) but the interaction table says "Type 2+ chars: Filter list". The function itself has no minimum-length guard. The 2-char minimum is only enforced by the component's debounce/event handler, but this is not documented in the search function's contract. If called with `q=""` it returns the first 10 crops, not all crops. Clarify behavior for empty-string queries vs the "Focus empty input: Show all crops" interaction. | SHOULD-FIX |
| 8 | ARCHITECTURE `CropEntry` schema | The `id` field for the existing `"other"` crop type in `CROP_TYPES` is ambiguous. If `crops.json` includes an entry with `id: "other"`, what emoji and name does it get? If it is excluded, free-text users who previously selected "other" will see the raw string "other" with a seedling fallback emoji. The architecture should explicitly state how `"other"` is handled. | SHOULD-FIX |
| 9 | ARCHITECTURE | Japanese IME (Input Method Editor) composition events are not addressed. During IME composition (e.g., typing hiragana before converting to kanji), the `input` event fires on every keystroke including intermediate composition states. The 150ms debounce alone is insufficient -- the component must check `event.isComposing` or listen for `compositionend` to avoid filtering on partial IME input. Without this, the dropdown will flicker rapidly during Japanese text entry. | MUST-FIX |
| 10 | ARCHITECTURE 4c | `AddPlotForm.tsx` is listed as a potential integration point, but this component is DEPRECATED (redirects to `/profile/`). The architecture should remove this reference to avoid wasted implementation effort. | SUGGESTION |
| 11 | ARCHITECTURE 1 | The `CropType` type alias in `packages/shared/src/constants.ts` (line 93: `export type CropType = typeof CROP_TYPES[number]`) is not mentioned. While `CropType` is not currently imported anywhere in `/src/`, it is a public export from the shared package. The deprecation plan should cover both `CROP_TYPES` and `CropType`. | SUGGESTION |
| 12 | REQUIREMENTS NF-04 | Accessibility requirement mentions "keyboard navigation, ARIA labels" but the architecture's keyboard spec has a gap: there is no documented behavior for Tab key. When the user presses Tab while the dropdown is open, should it close the dropdown and move focus to the next form field (crop_variety), or should Tab select the highlighted item? Standard combobox pattern (WAI-ARIA APG) says Tab should close without selecting. | SHOULD-FIX |
| 13 | ARCHITECTURE 3 | The "Type unmatched text + blur" interaction accepts free text, but the architecture does not specify validation or normalization. If a user types "TOMATO" (uppercase) and blurs, it will be stored as the raw string "TOMATO" rather than matching the existing `id: "tomato"`. A case-insensitive match-on-blur step would prevent duplicate entries. | SHOULD-FIX |
| 14 | ARCHITECTURE 3 | Quick-select chips are described as "Hardcoded top-8 crop IDs (matching current CROP_TYPES)" but `CROP_TYPES` includes `"other"` which does not make sense as a quick-select chip. The chip list should be explicitly enumerated (7 specific crops, excluding "other") or the architecture should clarify that "other" is included with a specific UX treatment. | SHOULD-FIX |
| 15 | REQUIREMENTS C-04 | Constraint says "Emoji icons must be visible in all 3 themes (light/dark/earthy)" but the architecture has no verification plan or design guidance for this. Some emoji render poorly on dark backgrounds (e.g., dark-colored vegetables). A visual test or theme-specific contrast check should be specified. | SUGGESTION |

## Summary

- **MUST-FIX**: 4 findings (locale access gap, category naming, null-guard logic, IME handling)
- **SHOULD-FIX**: 7 findings (romaji note, WeatherView omission, aria-label localization, search contract, "other" handling, Tab key behavior, case-insensitive blur, chips list)
- **SUGGESTION**: 3 findings (deprecated AddPlotForm, CropType alias, emoji theme check)

## Recommendations

### Finding 1 (romaji search)
Add a note to the architecture: "Romaji-to-kana transliteration is out of scope for v1. Japanese search matches hiragana/katakana/kanji input only."

### Finding 2 (locale access)
Export `detectLocale` (or create a `getLocale(): Locale` wrapper) from `src/frontend/src/i18n/i18n.ts`. Alternative: have `CropAutocomplete` and `getCropName` call `detectLocale` internally, removing the `locale` parameter from their APIs entirely. This is simpler and consistent with how `t()` already works.

### Finding 3 (category enum)
Pick one canonical enum and use it in both documents. Recommended: `grain | vegetable | fruit | root | leafy | legume | herb | other` -- adding "vegetable" as a general catch-all while keeping the specific subcategories. Or simplify to: `grain | fruit | vegetable | herb | other` if the list of 100 crops does not need fine-grained categories.

### Finding 4 (null-guard)
Change the display pattern to guard before concatenation:
```ts
const display = bed.crop_type
  ? `${getCropEmoji(bed.crop_type)} ${getCropName(bed.crop_type, locale)}`
  : t('bed.empty');
```
Or embed the guard in a single helper: `getCropDisplay(cropType, locale): string`.

### Finding 5 (WeatherView)
Add `WeatherView.tsx` line 321 to the integration points table in the architecture.

### Finding 6 (aria-label)
Update the `aria-label` attributes to use `getCropName()` so screen readers announce localized crop names.

### Finding 9 (IME)
Add to the architecture's implementation notes:
- Listen for `compositionstart` / `compositionend` events.
- While `isComposing === true`, suppress search filtering.
- Trigger filtering only after `compositionend` fires.
This is a standard pattern for Japanese/Chinese text input in autocomplete components.

### Finding 12 (Tab key)
Add to the interaction rules table: "Tab: Close dropdown without selecting, move focus to next field (per WAI-ARIA combobox pattern)."

### Finding 13 (case-insensitive blur)
On blur, before accepting free text, attempt a case-insensitive match against `CROP_MAP`. If a match is found, use the canonical `id` instead of the raw input. This prevents `"TOMATO"` and `"tomato"` from becoming separate values.

### Finding 14 (chips excluding "other")
Explicitly enumerate 7 chips: `['rice', 'tomato', 'cucumber', 'eggplant', 'lettuce', 'daikon', 'cabbage']`. Document that "other" is excluded because the free-text input already serves that purpose.

## Verification Needed

- [ ] Confirm the full list of files that reference `crop_type` for display (grep result shows 6 files -- ensure all are addressed)
- [ ] Validate that the proposed 100+ crop entries in `crops.json` stay under the 20KB budget
- [ ] Test emoji rendering across all three themes (light, dark, earthy) -- especially dark-background emoji visibility
- [ ] Test Japanese IME input flow end-to-end in the autocomplete component
- [ ] Verify that existing beds with `crop_type: "other"` display acceptably after the change
