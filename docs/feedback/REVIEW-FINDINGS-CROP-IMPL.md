# Review Findings: Crop Library Implementation

**Date:** 2026-04-03
**Reviewer:** my-reviewer (independent)
**Scope:** 4 commits on `develop` (448316d..88d6f39) covering #216 + #257
**Verdict:** CONDITIONAL ACCEPT -- 1 SHOULD-FIX, rest are SUGGESTION

---

## Summary

The crop library implementation is well-structured and achieves the core requirements. The data file is clean (100 entries, no duplicates, < 10KB), the lookup module uses proper O(1) maps, the CropAutocomplete follows WAI-ARIA combobox patterns, and emoji display integrates cleanly into existing views. No security vulnerabilities found. No backend changes required. IME composition handling for Japanese input is correctly implemented.

### Positives

- **Data integrity**: 100 crops, zero duplicates, all 5 fields present on every entry, file is 9.9KB (well under the 20KB NF-01 limit)
- **Backward compatibility**: All 8 original `CROP_TYPES` (`rice`, `tomato`, `cucumber`, `eggplant`, `lettuce`, `daikon`, `cabbage`, `other`) are present in crops.json
- **O(1) lookups**: `CROP_MAP` is a `Map<string, CropEntry>` built once at module load; `entryIndexMap` avoids O(n^2) in grouped render
- **Security**: No unsafe HTML injection patterns, no innerHTML, no XSS vectors. Crop names are rendered as text nodes. Free-text input is normalized but never interpreted as HTML
- **Accessibility**: Full ARIA combobox pattern (`role="combobox"`, `aria-expanded`, `aria-autocomplete="list"`, `aria-controls`, `aria-activedescendant`), keyboard nav (ArrowUp/Down, Enter, Escape, Tab), `aria-label` on clear button
- **IME handling**: Correct use of `compositionstart`/`compositionend` to suppress filtering during Japanese input composition
- **Timer cleanup**: Debounce timer properly cleared on unmount via `useEffect` cleanup
- **Zero AWS cost**: Bundled JSON, no API calls (CR-09 met)

---

## Findings

| File:Line | Issue | Severity |
|-----------|-------|----------|
| `src/frontend/src/lib/crops.ts:24` | QUICK_SELECT_CROPS has 7 entries; CR-04 requires "top-8 crops shown as quick-select chips" | SHOULD-FIX |
| `src/frontend/src/components/CropAutocomplete.tsx:48` | `doSearch` with empty query returns full `CROPS` array (100 items) but `searchCrops('', 10)` returns only 10. Inconsistent: component bypasses the search helper's limit | SUGGESTION |
| `src/frontend/src/components/CropAutocomplete.tsx:168` | `listId` is a hardcoded string `'crop-autocomplete-list'`. If two instances ever mount simultaneously, IDs collide. Low risk since BedDetail only uses one | SUGGESTION |
| `src/frontend/src/components/CropAutocomplete.tsx:82-95` | `handleBlur` uses 200ms `setTimeout` without cleanup. If component unmounts during that 200ms window, the callback fires on stale state. Not a crash risk in Preact but could log warnings | SUGGESTION |
| `src/frontend/src/components/CropAutocomplete.tsx:226` | No "no results" message when `results.length === 0`. User types a non-matching query and sees the dropdown disappear silently. Screen readers get no feedback | SUGGESTION |
| `src/frontend/src/components/WeatherView.tsx:322` | `getCropName(b.crop_type)` returns `''` for falsy crop_type. If a bed has no crop, it contributes an empty string to the comma-joined list, producing `", Tomato, "` | SUGGESTION |
| `src/frontend/src/i18n/i18n.ts:18-21` | `getLocale()` is a trivial wrapper around `detectLocale()`. The JSDoc comment from `detectLocale` was left on line 18 but now describes the wrong function. Comment says "Resolve locale..." but sits above `getLocale`, not `detectLocale` | SUGGESTION |
| `src/frontend/src/components/CropAutocomplete.tsx:233-258` | Grouped view renders `<div role="option">` inside `<li>` which contains a `<div role="presentation">` header. The `<li>` acts as a group wrapper but has no `role="group"` or `aria-label`. WAI-ARIA listbox pattern recommends `role="group"` with `aria-labelledby` on grouped containers | SUGGESTION |

---

## Recommendations

### F-01 (SHOULD-FIX): Quick-select chips count mismatch

CR-04 states "top-8 crops shown as quick-select chips". The current `QUICK_SELECT_CROPS` has 7 entries (excludes `other`). The JSDoc says "top 7, excluding other" which contradicts the requirement.

**Fix:** Add `'other'` back to `QUICK_SELECT_CROPS` to match the original 8 `CROP_TYPES`, or update the requirement if the product decision was intentionally 7. Clarify with the user.

```typescript
// crops.ts:24
export const QUICK_SELECT_CROPS = ['rice', 'tomato', 'cucumber', 'eggplant', 'lettuce', 'daikon', 'cabbage', 'other'] as const;
```

### F-02 (SUGGESTION): Inconsistent full-list behavior

When `doSearch('')` is called (focus with empty input), it passes the full `CROPS` array (100 items) to state. But `searchCrops('', 10)` would return only 10. The component intentionally bypasses the helper to show all crops for grouped browsing. This is actually reasonable behavior but the comment in `searchCrops` JSDoc ("Empty query returns the first `limit` crops") does not document that the component uses the raw array for the full-browse case.

**Fix:** Add a brief comment in `doSearch` explaining the intentional bypass:
```typescript
// Show all crops for category browsing when no filter text
setResults(query ? searchCrops(query, 10) : CROPS);
```

### F-03 (SUGGESTION): Hardcoded listbox ID

Low risk but worth noting. If the component is ever reused (e.g., in an "Add Plot" dialog), IDs will collide.

**Fix:** Use `useId()` (Preact 10.19+) or a counter-based ID generator.

### F-04 (SUGGESTION): Blur timeout cleanup

The 200ms timeout in `handleBlur` is not tracked for cleanup. If the user rapidly navigates away from the page while the dropdown is open, the callback runs on unmounted state.

**Fix:** Store the timeout ID in a ref and clear it in the unmount cleanup effect.

### F-05 (SUGGESTION): Missing "no results" feedback

When the user types a query that matches no crops, the dropdown disappears. Screen reader users receive no feedback.

**Fix:** Add a "No matches found" `<li role="option" aria-disabled="true">` when `results.length === 0 && inputText.length > 0`.

### F-06 (SUGGESTION): Empty strings in WeatherView join

`getCropName('')` returns `''`, which when joined with `, ` produces double commas.

**Fix:** Filter falsy values before joining:
```typescript
card.affected_beds.map(b => getCropName(b.crop_type)).filter(Boolean).join(', ')
```

### F-07 (SUGGESTION): Misplaced JSDoc comment

The comment "Resolve locale from `<html data-locale>` attribute or localStorage, fallback to 'en'." now sits above `getLocale()` but actually describes `detectLocale()`.

**Fix:** Move the JSDoc to `detectLocale` and give `getLocale` its own brief doc:
```typescript
/** Get the active locale ('en' | 'ja'). */
export function getLocale(): Locale {
```

### F-08 (SUGGESTION): Grouped listbox structure

For strict WAI-ARIA compliance, grouped options in a listbox should use `role="group"` with `aria-labelledby` pointing to the category header.

**Fix:** On the wrapping `<li>`, add `role="group"` and `aria-labelledby={`category-${category}`}`, and add a matching `id` on the category header `<div>`.

---

## Alignment Checklist

| Criterion | Status | Notes |
|-----------|--------|-------|
| CR-01: 100+ crops with EN, JA, emoji, category | PASS | 100 entries, all fields present |
| CR-02: Searchable autocomplete replaces dropdown | PASS | CropAutocomplete replaces `<select>` in BedDetail |
| CR-03: Search in EN and JA | PASS | `searchCrops` filters on both `c.en` and `c.ja` |
| CR-04: Top-8 quick-select chips | PARTIAL | 7 chips, not 8 (see F-01) |
| CR-05: Free-text entry for unlisted crops | PASS | `normalizeCropType` on blur, falls through to raw input |
| CR-06: Emoji on Crops list (FarmOverview) | PASS | `getCropDisplay()` used |
| CR-07: Emoji on Layout grid (FarmLayoutView) | PASS | `getCropDisplay()` used |
| CR-08: Emoji on Bed detail header | PASS | `getCropDisplay()` in `cropLabel` |
| CR-09: No additional AWS cost | PASS | Bundled JSON, zero API calls |
| CR-10: Category organization | PASS | 8 categories in data, grouped view in dropdown |
| NF-01: Data file < 20KB | PASS | 9.9KB |
| NF-04: Accessible keyboard + ARIA | PASS | Full combobox pattern implemented |
| C-01: No backend changes | PASS | Frontend-only changes |
| C-02: Existing 8 crop types remain valid | PASS | All present in crops.json |

---

## Security Assessment

| Check | Result |
|-------|--------|
| XSS via crop names | SAFE -- all rendered as text nodes, no unsafe HTML patterns |
| Input validation | SAFE -- `normalizeCropType` is pure string matching, no eval/regex injection |
| Secrets in code/logs | NONE |
| Auth/authz changes | NONE |

---

## Verification Needed

- [ ] Manual test: type a Japanese crop name (e.g., "tomato" in hiragana) and confirm IME composition does not trigger premature filtering
- [ ] Manual test: type a non-matching query and observe that free-text is preserved on blur
- [ ] Manual test: verify emoji icons render correctly in all 3 themes (light, dark, earthy)
- [ ] Manual test: keyboard-only navigation through the full grouped list (ArrowDown through all 100 items)
- [ ] Confirm product intent on 7 vs 8 quick-select chips (F-01)

---

## Tests

No unit tests were added for `crops.ts` or `CropAutocomplete.tsx`. The project has an existing test directory (`src/frontend/src/__tests__/`) with auth and Avatar tests. While not a blocker, the pure functions in `crops.ts` (`searchCrops`, `normalizeCropType`, `getCropEmoji`, `getCropName`, `getCropDisplay`) are excellent candidates for unit tests.

---

*Reviewed by: my-reviewer (independent)*
*Review policy: /workspace/.agent/subagents/my-reviewer.md*
