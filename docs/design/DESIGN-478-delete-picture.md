# DESIGN-478 — Delete-picture capability (per-bed crops page, owner/admin only)

> Created: 2026-04-29 | Issue: [#478](https://github.com/ashmuk/litcrop/issues/478) | Status: design preview, not yet implemented
> Scope: design analysis grounded in the existing codebase; no new infrastructure required

---

## TL;DR

The codebase already has ~70% of the building blocks needed. This is a "wire existing primitives to a new endpoint and UI surface" job, not "create new infrastructure." Estimated effort: **~4.5 hours of focused work** (was estimated ~1-2 days in the issue body before this analysis surfaced the existing reuse).

Key reuse opportunities discovered during investigation:

| Existing primitive | Location | Reuse |
|---|---|---|
| `s3.deleteImage(storageKey)` | `src/api/src/services/s3.ts:106` | Unused since #471's lint cleanup; ready to wire. |
| `assertFarmAccess(farmId, userId, ['admin', 'owner'], isAdmin)` | `src/api/src/routes/_helpers.ts` (used in `farms.ts:389`) | Exact role-gate the issue calls for. |
| `groupByDay(images)` | `src/frontend/src/components/BedDetail.tsx:55` | Daily-bulk delete UX has its grouping primitive ready. |
| `images.ts` route file | `src/api/src/routes/images.ts` | Short and clean — natural place to add DELETE handlers next to existing GET. |

The "[crops] page" the issue references **is `BedDetail.tsx`** — confirmed by reading line 3 ("Sections: hero image, crop metadata, tag buttons, image history") and the day-grouped image rendering already in place.

---

## Architecture surface (what gets touched)

```
 Layer        File(s)                              Change
─────────────────────────────────────────────────────────────────────────────
 API route    src/api/src/routes/images.ts         + DELETE /images/:imageId
                                                   + DELETE /beds/:bedId/images?day=YYYY-MM-DD
 DDB repo     src/api/src/services/dynamodb.ts     + deleteImage(imageId)
                                                   + listImagesByBedAndDay(bedId, day)
                                                   + getDiaryEntriesByPhotoId(imageId) for cascade (if Option B chosen)
 S3 helper    src/api/src/services/s3.ts           reuse existing deleteImage(storageKey)
 Frontend     src/frontend/src/components/         + delete affordance (per-image + per-day)
              BedDetail.tsx                        + confirm modal
                                                   + role-aware visibility
              src/frontend/src/lib/api.ts          + deleteImage / deleteImagesByDay client wrappers
 Shared       packages/shared/src/types/           no new types needed
                                                   (existing ImageListItem covers both UX levels)
 Tests        src/api/src/__tests__/routes/        + 6-8 cases per endpoint
              images.test.ts                       (auth, role-gate, cascade, idempotency, etc.)
              src/frontend/src/components/         + 2-3 cases for confirm-modal flow
                                                   + role-conditional rendering
```

---

## Permission model — using existing primitives

The codebase already implements the exact pattern the issue calls for. `farms.ts:389` shows the pre-existing precedent for "owner-and-admin only" actions:

```typescript
// Existing pattern (farms.ts:389) — same exact gate we need:
const { farm } = await assertFarmAccess(farmId, userId, ['admin', 'owner'], isAdmin);
```

For #478 the call becomes:

```typescript
// Inside the new DELETE handler:
const image = await dynamoRepo.getImageById(imageId);
const bed = await dynamoRepo.getBedById(image.bed_id);
await assertFarmAccess(bed.farm_id, userId, ['admin', 'owner'], isAdmin);
// ↑ throws ForbiddenError if caller is `staff` (or no membership at all)
```

`isAdmin` is the global super-admin bypass (env allowlist of email addresses, not farm-role). Already in auth context at `middleware/auth.ts:57`. The function checks farm-role first, super-admin as override.

### Permission matrix

| Caller                  | farm-role  | isAdmin | Result        |
|-------------------------|------------|---------|---------------|
| Farm owner              | `'owner'`  | false   | ✅ allowed     |
| Farm admin              | `'admin'`  | false   | ✅ allowed     |
| Farm staff              | `'staff'`  | false   | ❌ Forbidden   |
| Non-member              | —          | false   | ❌ NotFound (intentional — opaque, prevents farm-existence enumeration) |
| Super-admin (any)       | irrelevant | true    | ✅ allowed     |
| Non-member super-admin  | —          | true    | ✅ allowed (super-admin override) |

### Subtle behavior worth noting

The middleware throws `NotFoundError` (not `ForbiddenError`) for non-members. This is deliberate — prevents enumeration of farms the caller doesn't belong to. The new DELETE handlers should preserve that pattern. For `staff` farm members specifically, throwing `ForbiddenError` is the right shape (they DO see the farm, they just can't delete).

> **Role types** are `FarmRole = 'admin' | 'owner' | 'staff'` (only three roles, no `observer`). This simplifies #478's gate: deny `staff`, allow the other two. No fourth-role decision to make.

---

## API contract — two endpoints, one cascade rule

```
DELETE /api/v1/images/:imageId
  Auth:        Bearer JWT
  Permission:  owner / admin (farm-scoped) OR super-admin
  Response:    204 No Content (success — idempotent; second call returns 204 too)
               401 if no auth
               403 if staff (or non-member's farm)
               404 if image doesn't exist OR caller can't see the farm
  Cascades:    deletes image's tags (existing dynamoRepo.getTagsForImage helps locate them)
               deletes S3 object + thumbnail (existing s3.deleteImage helps)
               diary entries that reference this image_id in photo_ids — see below
  Audit:       emit `image.deleted` event via existing appEvents

DELETE /api/v1/beds/:bedId/images?day=YYYY-MM-DD
  Auth:        Bearer JWT
  Permission:  owner / admin (farm-scoped) OR super-admin
  Query:       `day` is required, ISO 8601 date (UTC)
  Response:    200 OK { deleted_count: N, image_ids: [string] }
               400 if `day` is missing/malformed
               401 / 403 / 404 same as single-delete
  Cascades:    same as single-delete, batched
  Audit:       emit `images.bulk_deleted` once with the image-id list
```

### Why 204 vs 200 for the two endpoints

- **204 (single)**: REST-idiomatic for delete-success-no-body.
- **200 (bulk)**: needs a body for the count + ID list; 200-with-body is the natural fit.

Either choice is defensible; the convention here matches what I'd recommend for a tidy contract.

---

## UI changes — BedDetail.tsx surface

`BedDetail.tsx` already renders images grouped by day via `groupByDay(images)` (line 55). Image history is the natural insertion point for delete affordances.

### Recommended insertion points

| Existing surface                              | New affordance (owner/admin only) |
|-----------------------------------------------|-----------------------------------|
| Day group header (e.g. "April 23 — 12 images") | + "Delete N images from {date}" link → opens daily-bulk confirm modal |
| Per-image thumbnail in the day's grid          | + Hover/long-press → 🗑 icon → opens single-image confirm modal |
| Single-image lightbox (`ImageViewer.tsx`)      | + 🗑 button in toolbar → single-image confirm + close lightbox after |

### Confirm modal designs

**Single-image delete** (priority 1):
- Thumbnail + capture timestamp + tag count + "Delete" button.
- One click, no friction. Reversible only from AWS S3 backups (if enabled), but UX-irreversible.

**Daily-bulk delete** (priority 2):
- Shows N image count + date.
- Warning text: "This will permanently delete N pictures from {date}. This cannot be undone."
- Button text encodes count: `[Delete 12 images]`.
- Could optionally require typing the date string for friction; probably overkill — the count + thumbnails IS the cue.

### Role-conditional rendering

Read `farm.role` from existing context. `BedDetail.tsx` already has `farm + bed` in scope after `getBed(bedId)` returns. One-line gate:

```typescript
const canDeletePictures = farm.role !== 'staff';
// Or equivalently: farm.role === 'owner' || farm.role === 'admin'
```

Wrap delete affordances in `{canDeletePictures && <DeleteButton .../>}`.

---

## Cascade behavior — the actually-tricky part

### Tags

Each image can have N tags (`Tag` entity, image-scoped). Tags are independent DDB rows keyed by image_id.

**Decision**: tags should be deleted with the image. If the image is gone, tags pointing at a non-existent image are tombstones. Use a `TransactWrite` to delete image + all its tags atomically.

### Diary entries

`DiaryEntry.photo_ids: string[]` references image IDs. Hard-deleting an image leaves diary entries with stale references. Three options:

| Option | Cost | Behavior |
|---|---|---|
| **A. Filter at read-time** | Cheapest. Diary read handler resolves `photo_ids` to images; missing ones get filtered or marked. | Diary entries effectively shed orphaned photos. UI shows fewer images than the entry "had" originally. |
| **B. Patch diary entries on delete** | Most expensive. Each delete fans out to find every diary entry referencing the image and remove the ID. | Diary entries stay accurate but the delete operation does N+1 DDB writes. |
| **C. Soft-delete the image** | Mid-cost. Add `deleted_at` to `Image`; reads filter out soft-deleted; diary entries can still resolve to a "[deleted]" placeholder. | Storage cost stays (S3 object kept). UX shows a placeholder gracefully. |

### Recommendation: Option A (filter at read-time)

Simplest and matches how most photo-management systems work: deleted = gone, references are stale-by-design. Diary entries don't break — they just show fewer photos. The trade-off ("where did my photo go?") is explicitly accepted in the issue body ("no undo button").

If audit/recoverability becomes critical post-pilot, **Option C** (soft-delete) is the upgrade path. Adds a `deleted_at` column the repo carries forever — overengineered for a pilot-phase tool but worth revisiting at v1.0+.

---

## Test plan — what verifies the contract

### Unit tests (`src/api/src/__tests__/routes/images.test.ts`)

| Test | Setup | Assertion |
|---|---|---|
| Single delete — happy path | owner deletes own image | 204 + tags gone + S3 called |
| Single delete — staff role denied | staff caller | 403 |
| Single delete — non-member denied | non-member caller | 404 (opacity) |
| Single delete — image not found | unknown id | 404 |
| Single delete — idempotent re-delete | second call after first succeeded | 204 (or 404 — decide upfront) |
| Single delete — tag cascade | image with 3 tags | 0 tags after |
| Bulk delete — happy path | owner, day with 12 images | `deleted_count=12` |
| Bulk delete — invalid day param | missing/malformed date | 400 |
| Bulk delete — staff denied | staff caller | 403 |
| Bulk delete — empty day | 0 images for day | `deleted_count=0` (200, not 404) |

### Component tests (`src/frontend/src/__tests__/BedDetail.test.tsx`)

| Test | Assertion |
|---|---|
| Owner sees delete affordances | `role='owner'` → 🗑 icons render |
| Staff sees no delete affordances | `role='staff'` → 🗑 icons hidden |
| Confirm modal — single | click 🗑 → modal opens with thumbnail |
| Confirm modal — daily bulk | click "Delete N images" → modal with count |

### Cascade test (in `diary-utils.test.ts` or new file)

| Test | Assertion |
|---|---|
| Diary entry with deleted `photo_id` resolves | missing photos filtered from response (Option A) |

---

## Effort estimate (revised down thanks to existing infrastructure)

```
 Surface                  Estimate    Notes
─────────────────────────────────────────────────────────────────────────────
 API DELETE single        ~30 min     boilerplate from existing GET handler
 API DELETE bulk          ~45 min     new query + batch fan-out
 DDB repo additions       ~30 min     deleteImage + listByBedAndDay + tag txn
 Frontend confirm modal   ~45 min     reuse existing modal patterns from BedDetail
 Frontend hooks + API     ~20 min     deleteImage / deleteImagesByDay client wrappers
 Cascade (Option A)       ~15 min     filter at diary read-time
 Tests (8-10 cases)       ~60 min
 i18n (EN + JA)           ~10 min     "Delete N images" / "削除"
─────────────────────────────────────────────────────────────────────────────
 TOTAL                    ~4.5 hours  (was estimated ~1-2 days; existing infra cuts it)
```

---

## Risks worth naming upfront

### 1. Cascade-ownership confusion

If diary entries can reference images from OTHER beds (cross-bed photo upload), Option A's filter still handles it gracefully. But Option B's "patch all diary entries" would need to scan beyond the deleted image's bed — can get expensive. **Action**: confirm scope before implementation — are images cross-referenced or bed-scoped only? Read the diary route to verify.

### 2. Idempotency on bulk

If two operators delete the same day's images concurrently, the second call returns 0 images deleted. That's fine semantically but the UX should handle "0 deleted" gracefully — say "already deleted" rather than "failed".

### 3. S3 deletion eventual consistency

`S3.deleteObject` is strongly consistent for new buckets, but signed URLs cached by CDN can serve a stale image briefly. For thumbnails behind CloudFront, cache TTL governs the window. Worth a one-line note in the issue; not a blocker.

### 4. Audit log

The issue doesn't mention audit but should — both for "who deleted what" forensics and for compliance. Wire to existing `appEvents` (`image.deleted` event with `actor_id`, `image_id`, `bed_id`, `farm_id`). Tiny change, high value.

### 5. Wave E2 soak compatibility

#478 touches `/images` and `/beds` endpoints — different surface from `getActiveCropForBed` (which the soak watches), so no confounding. Safe to ship during or after the soak. The new DELETE will exercise S3 + DDB + the membership middleware — worth its own e2e test that runs as part of CI even before merge.

---

## Implementation sequence (recommended)

1. **Hour 1**: API DELETE single (with happy-path test). Get the round-trip working end-to-end before adding bulk.
2. **Hour 2**: API DELETE bulk + cascade Option A. Tags+S3 cascade. Diary read-time filter.
3. **Hour 3**: BedDetail.tsx UI — confirm modals + role-conditional rendering + i18n.
4. **Hour 4**: Tests (unit + 1-2 e2e), audit event, refinement.
5. **Hour 5**: Browser-test on staging — log in as owner, delete a real test image, verify behavior end-to-end.

Ship as `feat(images): #478 delete-picture capability...` on a feature branch (same pattern as #470's hydration fix). Merge to develop after verification. Batch into the next ship cycle (likely v0.99.8.6 or v0.99.9.0 depending on timing relative to Wave E2 soak end on 2026-05-13).

---

## Related

- Issue: [#478](https://github.com/ashmuk/litcrop/issues/478) — feat(images): delete-picture capability on per-bed crops page — owner/admin only
- Existing image route: [`src/api/src/routes/images.ts`](../../src/api/src/routes/images.ts)
- BedDetail (UI surface): [`src/frontend/src/components/BedDetail.tsx`](../../src/frontend/src/components/BedDetail.tsx)
- S3 delete helper: [`src/api/src/services/s3.ts`](../../src/api/src/services/s3.ts) (`deleteImage` at line 106)
- Role-gate precedent: [`src/api/src/routes/farms.ts`](../../src/api/src/routes/farms.ts) line 389
- Permission middleware: [`src/api/src/routes/_helpers.ts`](../../src/api/src/routes/_helpers.ts) (`assertFarmAccess`)
