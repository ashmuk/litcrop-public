# BETA2-READINESS.md — Beta-2 Implementation Strategy

> Date: 2026-03-25 | Status: **PLANNED** — pending Beta-1 completion
> Prerequisite: Beta-1 (v0.22) deployed and verified
> Target: v0.23 (Beta-2 release)

---

## Purpose

Beta-2 delivers **admin capabilities, observer onboarding, and cross-device settings sync** — the features that transform LitCrop from a single-user tool into a multi-user collaborative platform. These were originally scoped as PROD but are promoted to Beta-2 to get early feedback from beta testers.

---

## 1. Prerequisite State (after Beta-1)

| Item | Expected Value |
|------|---------------|
| Tag | v0.22 (Beta-1) on main |
| Tests | 340+ passing |
| Open Issues | ~6 remaining |
| Resolved in Beta-1 | #178 (Device rename), #180 (Leave btn), #182 (admin access) |

---

## 2. Beta-2 Scope

### Features (3 items, promoted from PROD)

| # | Title | Size | Area | Dependencies |
|---|-------|------|------|-------------|
| #179 | Admin dashboard (Manage menu) | L | full-stack | #182 (admin access, done in Beta-1) |
| #181 | Observer onboarding (APPLY workflow) | L | full-stack | Multi-farm membership (done in Phase B) |
| #90 | Settings sync (cross-device) | M | full-stack | None |

---

## 3. Implementation Waves

### Wave 1 — Settings Sync (#90, ~2–3 hrs)

**Rationale**: Smallest item, no dependencies, immediate user value. Warms up the API+frontend workflow before the larger features.

| Step | What to Do |
|------|------------|
| 1.1 | **API**: Add `GET /api/v1/settings` — read user preferences from DynamoDB (`PK=USER#{userId}`, `SK=#SETTINGS`) |
| 1.2 | **API**: Add `PATCH /api/v1/settings` — merge-update preferences (locale, tempUnit, theme) |
| 1.3 | **Frontend**: On page load, fetch settings from API. Fall back to localStorage if offline/error. |
| 1.4 | **Frontend**: On settings change, save to both localStorage AND API. |
| 1.5 | **Tests**: API endpoint tests + frontend integration test for sync flow. |

**Data model**:
```
PK: USER#<userId>    SK: #SETTINGS
{ locale: "ja", tempUnit: "C", theme: "earthy" }
```

---

### Wave 2 — Admin Dashboard (#179, ~4–6 hrs)

**Rationale**: Requires new page, admin-only visibility, and API endpoints. Depends on #182 (admin access) being done in Beta-1.

| Step | What to Do |
|------|------------|
| 2.1 | **Nav**: Add "Manage" (管理) tab at right end of nav, visible only when `isAdmin === true`. Non-admins never see it. |
| 2.2 | **API**: Add `GET /api/v1/admin/users` — list all users with roles and farm counts. Admin-only. |
| 2.3 | **API**: Add `GET /api/v1/admin/farms` — list all farms with member counts, creation dates. Admin-only. |
| 2.4 | **Frontend**: Create `AdminDashboard` component with 3 panels: Users, Farms, System Stats. |
| 2.5 | **Frontend**: Wire existing `/admin/stats` endpoint into System Stats panel. |
| 2.6 | **Tests**: Admin endpoint auth tests (non-admin gets 403). Dashboard rendering tests. |

**Design notes**:
- Reuse existing `/manage/` route (currently IoT device page renamed to "Device" in Beta-1). Admin dashboard gets a new route: `/admin/`.
- `isAdmin` is already computed in auth middleware (`auth.ts:33`). Expose to frontend via auth context or a dedicated endpoint.

---

### Wave 3 — Observer Onboarding (#181, ~4–6 hrs)

**Rationale**: Most complex feature — introduces a new workflow (APPLY), a new entity (join request), and a new UI flow. Tackle last.

| Step | What to Do |
|------|------------|
| 3.1 | **Data model**: Add join request entity in DynamoDB: `PK=FARM#{farmId}`, `SK=JOIN_REQUEST#{userId}`, `status: pending/approved/rejected`, `requested_at`, `resolved_at`. |
| 3.2 | **API**: Add `POST /api/v1/farms/{farmId}/join` — observer submits join request. |
| 3.3 | **API**: Add `GET /api/v1/farms/{farmId}/join-requests` — admin/manager lists pending requests. |
| 3.4 | **API**: Add `PATCH /api/v1/farms/{farmId}/join-requests/{userId}` — approve or reject. On approve, create FARM_MEMBER record. |
| 3.5 | **API**: Add `GET /api/v1/farms/discoverable` — list farms that allow join requests (public/discoverable flag on farm). |
| 3.6 | **Frontend**: Post-login observer landing page — show discoverable farms with "Request to Join" button. |
| 3.7 | **Frontend**: Admin/manager view — pending requests list with approve/reject actions. Integrate into admin dashboard or farm detail. |
| 3.8 | **Data model**: Add `discoverable: boolean` flag to farm entity (default: true for existing farms). |
| 3.9 | **Tests**: Full APPLY workflow tests: request → list → approve → verify membership. Rejection flow. Duplicate request handling. |

**Design decisions needed** (resolve during `/cc-design`):
- Where does the approval UI live — admin dashboard (#179) or farm detail page?
- Notification mechanism — in-app badge vs email vs none for Beta-2?
- Should observers see farm details (location, beds) before joining?

---

## 4. Dependencies & Ordering

```
Beta-1 (v0.22)
  └── #182 admin access ──────────┐
                                   ▼
Beta-2 (v0.23)                   Wave 2: #179 admin dashboard
  Wave 1: #90 settings sync       │
                                   ▼
                                 Wave 3: #181 observer onboarding
                                   (approval UI in admin dashboard)
```

- **#90** is independent — can start immediately after Beta-1.
- **#179** depends on #182 (admin access bypass) being live.
- **#181** depends on #179 for the approval UI placement.
- All three waves are sequential due to these dependencies.

---

## 5. Scope Summary

| Category | Count | Items |
|----------|-------|-------|
| Features | 3 | #179, #181, #90 |
| New API endpoints | ~6 | settings (2), admin (2), join flow (2+) |
| New pages/components | ~3 | AdminDashboard, ObserverLanding, JoinRequestList |
| **Estimated effort** | **~10–15 hrs** | Across 3 waves |

---

## 6. What Remains for PROD (v1.0)

After Beta-2, the PROD backlog shrinks to:

| # | Title | Size | Notes |
|---|-------|------|-------|
| #168 | Soft delete for farm deletion | L | DynamoDB TTL or scheduled Lambda |
| UX-5 | Bed → Crop 1:N model | L | Data model migration, ADR needed |

Plus any new issues discovered during Beta-1 and Beta-2 testing.

---

## 7. Exit Criteria

- [ ] #90 settings sync working cross-device (verify on 2 browsers)
- [ ] #179 admin dashboard visible only to admins, showing users + farms + stats
- [ ] #181 observer can request to join, admin can approve/reject
- [ ] Tests pass (target: 370+)
- [ ] Deploy to CloudFront
- [ ] Live verification: admin flow + observer flow + settings sync
- [ ] Tag v0.23 (Beta-2)
- [ ] Create PR develop → main

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| #181 APPLY workflow complexity | Scope creep | Keep notification simple (in-app badge only). No email for Beta-2. |
| Admin dashboard design unclear | Delays Wave 2 | Run `/cc-design` for #179 before implementation. |
| Observer landing page UX | Poor first impression | Design with `/cc-design` — mobile-first, clear CTA. |
| DynamoDB query patterns for join requests | GSI needed? | Evaluate: farm-scoped queries (PK=FARM#) should work without new GSI. |

---

*Generated: 2026-03-25 | Session: litcrop-beta-1*
