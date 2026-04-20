# Remediation Report — #462 Phase 4

## Summary
- **Review source**: `docs/feedback/REVIEW-FINDINGS.md` — section "# #462 Phase 4 review (2026-04-21)".
- **Iterations**: 1 of 3 max.
- **Status**: RESOLVED (2 SHOULD-FIX addressed; 7 NITs acknowledged but not addressed).
- **Baseline commit**: `e28fe5b` — `feat(frontend): #462 Phase 4 — ProfileActivityList + useMeActivity`.

## Findings Resolution

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | `ProfileActivityList.tsx` branches on `trigger === 'manual'` but `TriggerType = 'scheduled' \| 'motion'` — the branch is unreachable with production data. Tests fabricate `trigger: 'manual'` to hit the branch. Latent UX implication: the component also can't currently distinguish Pi vs manual UI uploads since `trigger` doesn't carry that information; the Phase 3 OR-predicate separates them via `uploaded_by` / `bed.device.registered_by`, neither of which reach the UI. | SHOULD-FIX | FIXED | Removed the dead `image_manual` branch + its i18n keys from both `en.json` and `ja.json`. The component's image-summary logic is now exhaustive over the real `TriggerType` enum (scheduled → "Pi/scheduled capture on {bed}", motion → "Motion capture on {bed}"). Updated test fixtures from `trigger: 'manual'` → `trigger: 'motion'` in `ProfileActivityList.test.ts` and `ProfileActivityList.snapshot.test.ts`; updated the F11 JA assertion (`手動アップロード:` → `動体検出:`) and its EN-absence counterpart. Regenerated the two snapshot files with `-u`. Added a `// not currently surfaced in UI` comment documenting the Pi/manual attribution gap so a future phase (v0.99.8+) can address it with a new `source: 'pi' \| 'manual'` field on `ImageActivityItem` if needed. |
| 2 | Seventeen CSS class tokens emitted by the component (`profile-activity`, `activity-item*`, `activity-skeleton*`, `activity-error`, `activity-empty`, `activity-footer`, `activity-count`) are defined nowhere in `src/frontend/src/styles/` — the component renders but appears unstyled apart from the inline rules. | SHOULD-FIX | FIXED | Added ~65 lines of CSS to `src/frontend/src/styles/components.css` at the tail under the comment `/* #462 Phase 4: ProfileActivityList */`. Covers: item flex layout (icon + body columns), hover state, link-reset, meta-row flex, skeleton keyframe animation (`activity-skeleton-pulse`), error-banner background. Uses existing CSS variables (`--color-text`, `--space-*`, `--radius-*`, `--color-primary`) with fallbacks for any that may not be defined (`--color-surface-hover`, `--color-gray-100/200`, `--color-error-surface`). No new variables introduced. |

### NITs (not addressed in this cycle)

The review called out 7 NITs in D2. All are stylistic or low-value; acceptable carry-over:

| # | Note |
|---|------|
| N1 | `useMeActivity` placed in `lib/useMeActivity.ts` rather than `lib/hooks.ts` — intentional separation (hooks.ts is localStorage-focused, this is the first data-fetching hook). |
| N2 | `relativeTimeSuffix` recomputed on every render — not memoized. Negligible at ≤20 items per page. |
| N3 | Inline-style verbosity on `section` / `h3` / `footer`. Matches existing `ProfileYouTab` convention. |
| N4 | `activity-empty` class emitted but only styled via inline rules. Consistent with other empty-state patterns in the codebase; class left in place for future theming + test selectors. |
| N5 | `activity-count` renders `${items.length} / ${totalCount}` with literal slash — not i18n'd. Numerals + slash are locale-neutral. |
| N6 | `aria-label` on icon span translates; the `role="img"` + emoji combination works for screen readers in both locales. |
| N7 | `retry()` resets `initialLoading=true` which triggers the skeleton flash. Intentional — the user kicked off the refetch, so the loading state is expected. |

## Iteration Log

### Iteration 1 (2026-04-21)
- **Findings addressed**: #1 (dead branch + keys + fixtures + assertions + snapshots), #2 (CSS additions).
- **Findings deferred**: NITs N1–N7 (low-value).
- **Validation**: 1135/1135 vitest pass (unchanged); 3 snapshots regenerated (2 in snapshot test, 1 via `-u`); shared + api typecheck clean; `make sync` no-op.
- **Outcome**: both SHOULD-FIX resolved. No further iteration required.

## Escalations

None for Phase 4 itself. One carry-over to flag:

- **Phase 1 deferred finding #5** (`createImage` spread-Omit pattern at `src/api/src/services/repositories/images.ts:84`) is still open per its JSDoc marker. Phase 4 did not touch the write path. Planned for the same v0.99.7.4 release cycle as a separate commit.

## Artifacts

- Remediation commit: (to be added alongside this report).
- Tests: unchanged count (1135 → 1135), fixtures updated to match the real `TriggerType` enum.
- Styles: `src/frontend/src/styles/components.css` extended by ~65 LOC.
- I18n: `profile.activity.summary.image_manual` key removed from both locales.

## Next

- Run `/simplify` on the Phase 4 diff for polish.
- Address the Phase 1 carry-over (`createImage` spread-Omit audit) as a separate commit in this release cycle.
- Tag `v0.99.7.4` once the full cycle is green.
