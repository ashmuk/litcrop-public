# Task Breakdown: Auth Matrix Review (#313)

> Steps 5-7 — System Design, Tasks, Plan
> Date: 2026-04-08
> Architecture: No changes — all fixes within existing architecture

## System Design

No new components, services, or data models. The changes are:
1. **API guard modifications** — change `requiredRoles` arrays in 2 access check functions
2. **API role assignment restriction** — add validation in 1 POST endpoint
3. **Frontend cache refresh** — extend existing pattern to 2 more pages
4. **Frontend UI unlocks** — show upload/tag buttons for staff in BedDetail
5. **Documentation** — code comments + auth matrix in docs

### Change Map

```
 Layer      File                              FR    Change
──────────────────────────────────────────────────────────────
 API        src/api/src/routes/farms.ts        FR-2  Restrict POST /members role to owner|staff
 API        src/api/src/routes/beds.ts         FR-3  New assertBedMediaAccess (all members)
 API        src/api/src/routes/images.ts       FR-3  New assertImageMediaAccess (all members)
 API        src/api/src/routes/diary.ts        FR-6  Add code comment re: bridge auth
 Frontend   components/BedDetail.tsx           FR-3  Separate isReadOnly for crops vs media
 Frontend   components/DiaryPage.tsx           FR-5  Add getMyFarms() cache refresh
 Frontend   components/DeviceListPage.tsx      FR-5  Add getMyFarms() cache refresh
 Tests      __tests__/routes/farms.test.ts     FR-2  Test admin role rejection
 Tests      __tests__/routes/beds.test.ts      FR-3  Test staff image upload
 Tests      __tests__/routes/images.test.ts    FR-3  Test staff image tagging
```

## Task Sequence

### Batch 1: API Security Fix (FR-2)
**File:** `src/api/src/routes/farms.ts:646-650`
**Change:** After `FarmRoleSchema.safeParse(role)`, reject `'admin'` value:
```ts
if (parsedRole.data === 'admin') {
  throw new ValidationError("Cannot assign 'admin' role — admin is system-assigned only");
}
```
**Test:** Add test case in `farms.test.ts` — POST /members with role='admin' returns 400.

### Batch 2: API Staff Media Access (FR-3)
**File:** `src/api/src/routes/beds.ts`
**Change:** Add new access check for media operations (upload) that allows all farm members:
```ts
async function assertBedMediaAccess(bed: Bed, userId: string): Promise<void> {
  await assertFarmAccess(bed.farm_id, userId); // no requiredRoles = any member
}
```
Use `assertBedMediaAccess` for `POST /beds/:bedId/images` (line 257), keep `assertBedWriteAccess` for `PATCH /beds/:bedId`.

**File:** `src/api/src/routes/images.ts`
**Change:** Similar — create `assertImageMediaAccess` for `POST /images/:imageId/tags` that requires any farm membership (no role restriction). Keep `assertImageWriteAccess` for other write ops if any exist.

**Tests:** Add test cases for staff uploading image and staff creating tag — expect 200/201.

### Batch 3: Frontend — BedDetail Staff Media (FR-3)
**File:** `src/frontend/src/components/BedDetail.tsx`
**Change:** Split `isReadOnly` into two concerns:
- `isCropReadOnly` — staff cannot edit crop assignment (owner+ only)
- `isMediaAllowed` — all members can upload images and tag

Apply `isCropReadOnly` to crop editing controls (assign crop, edit crop form).
Apply `isMediaAllowed` to upload button and tag buttons.

### Batch 4: Frontend — Role Cache Refresh (FR-5)
**File:** `src/frontend/src/components/DiaryPage.tsx`
**Change:** Import `getMyFarms`, `setLocalFarmList`. In the existing data-fetch effect, add `getMyFarms()` to `Promise.all`, then refresh cache and recalculate `canWrite`.
- Change `canWrite` from const to state (like BedDetail's `isReadOnly` pattern)

**File:** `src/frontend/src/components/DeviceListPage.tsx`
**Change:** Same pattern — import, fetch in parallel, refresh cache, recalculate `canEdit` as state.

### Batch 5: Documentation (FR-6, FR-7)
**File:** `src/api/src/routes/diary.ts:151`
**Change:** Add code comment explaining diary-to-bed bridge authorization.

**Optional (FR-7):** Staff read-only indicator. Defer to a future pass — low priority.

## Commit Plan

| Commit | Scope | Files | FR |
|--------|-------|-------|-----|
| 1 | Restrict POST /members from assigning admin | farms.ts, farms.test.ts | FR-2 |
| 2 | Allow staff image upload + tagging | beds.ts, images.ts, beds.test.ts, images.test.ts | FR-3 |
| 3 | BedDetail split crop vs media permissions | BedDetail.tsx | FR-3 |
| 4 | Role cache refresh for DiaryPage + DeviceListPage | DiaryPage.tsx, DeviceListPage.tsx | FR-5 |
| 5 | Document diary bridge auth + auth matrix | diary.ts, REQUIREMENTS-313.md | FR-6 |

## Scope

- **Level:** Production fix (not PoC/MVP)
- **Risk:** Low — permission loosening (staff can upload) is additive, not restrictive
- **Migration:** None
- **Rollback:** Revert commits — no data changes
