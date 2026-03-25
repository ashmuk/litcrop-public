# BETA2-READINESS.md — Beta-2 Implementation Strategy

> Date: 2026-03-25 | Status: **PLANNED** — updated with Beta-1 feedback
> Prerequisite: Beta-1 (v0.22) merged and tagged
> Target: v0.23 (Beta-2 release)
> Feedback: docs/feedback/REVIEW-FINDINGS-BETA-1.md

---

## Purpose

Beta-2 delivers **admin capabilities, observer onboarding, cross-device settings sync, and Beta-1 refinements** — the features that transform LitCrop from a single-user tool into a multi-user collaborative platform. Includes 4 new issues from Beta-1 live feedback.

---

## 1. Prerequisite State (Beta-1 complete)

| Item | Value |
|------|-------|
| Tag | v0.22 (Beta-1) on main |
| Tests | 336 passing |
| Open Issues | 10 (7 Beta-2, 2 stretch, 1 PROD) |
| Resolved in Beta-1 | #178 (Device rename), #180 (Leave btn), #182 (admin access) |
| Feedback | 5 user items + 7 code review items (REVIEW-FINDINGS-BETA-1.md) |

---

## 2. Beta-2 Scope (10 items)

### Original (promoted from PROD)

| # | Title | Size | Area | Dependencies |
|---|-------|------|------|-------------|
| #179 | Admin dashboard (Manage menu) | L | full-stack | #182 (done in Beta-1) |
| #181 | Observer onboarding (APPLY workflow) | L | full-stack | Multi-farm membership (Phase B) |
| #90 | Settings sync (cross-device) | M | full-stack | None |

### New from Beta-1 feedback (E-series)

| # | Title | Size | Area | Dependencies |
|---|-------|------|------|-------------|
| #185 | E-01: Manager can edit farm name after setup | S | frontend | None |
| #186 | E-02: System admin never sees Leave button | S | frontend | None |
| #187 | E-03: Admin email notifications for events | L | api/infra | #179 (design together) |
| #188 | E-04: Show farm ID in Profile (disambiguate) | S | frontend | None |

### Code review SHOULD-FIX (from cc-review)

| ID | Title | Size | Area |
|----|-------|------|------|
| C1 | Add tests for admin bypass in assertFarmAccess | S | api/tests |
| C2 | Guard requiredRoles when isAdmin=true | S | api |
| C3 | Document synthetic membership overload | S | api |

---

## 3. Implementation Waves

### Wave 0 — Quick Wins (~1 hr, frontend)

**Goal**: Clear the S-sized Beta-1 refinements before the larger features.

| Order | Item | What to Do |
|-------|------|------------|
| 0.1 | #186 | Hide Leave button when `isAdmin` is true. Add `is_admin` to `GET /me/profile` response or derive from a new flag. |
| 0.2 | #185 | Add pencil icon + inline edit on farm name in ProfilePage farm card. Wire to existing `PATCH /farms/:farmId` with `name`. |
| 0.3 | #188 | Show truncated farm ID (e.g., `abc12ef...`) as subtitle on farm card. Consider showing owner email for admin view. |
| 0.4 | C2 | In `assertFarmAccess`, check synthetic `'admin'` role against `requiredRoles` before returning. One-line fix. |
| 0.5 | C5 | Add `currentUser &&` guard to Leave button check in ProfilePage. |

**Dependencies**: None — all independent.

---

### Wave 1 — Settings Sync + Admin Tests (#90 + C1, ~2–3 hrs)

**Goal**: Cross-device settings + test coverage for admin bypass.

| Step | What to Do |
|------|------------|
| 1.1 | **API**: Add `GET /api/v1/settings` — read user preferences from DynamoDB (`PK=USER#{userId}`, `SK=#SETTINGS`) |
| 1.2 | **API**: Add `PATCH /api/v1/settings` — merge-update preferences (locale, tempUnit, theme) |
| 1.3 | **Frontend**: On page load, fetch settings from API. Fall back to localStorage if offline/error. |
| 1.4 | **Frontend**: On settings change, save to both localStorage AND API. |
| 1.5 | **Tests**: API endpoint tests for settings sync. |
| 1.6 | **Tests (C1)**: Admin bypass tests — assertFarmAccess with isAdmin, GET /farms admin path, write routes reject admin without membership. |

**Data model**:
```
PK: USER#<userId>    SK: #SETTINGS
{ locale: "ja", tempUnit: "C", theme: "earthy" }
```

---

### Wave 2 — Admin Dashboard (#179, ~4–6 hrs)

**Goal**: Admin-only dashboard with user, farm, and activity visibility.

| Step | What to Do |
|------|------------|
| 2.1 | **Nav**: Add "Manage" (管理) tab at right end of nav, visible only when `isAdmin === true`. Non-admins never see it. |
| 2.2 | **API**: Add `GET /api/v1/admin/users` — list all users with roles and farm counts. Admin-only. |
| 2.3 | **API**: Add `GET /api/v1/admin/farms` — list all farms with member counts, creation dates. Admin-only. |
| 2.4 | **Frontend**: Create `AdminDashboard` component with 3 panels: Users, Farms, System Stats. |
| 2.5 | **Frontend**: Wire existing `/admin/stats` endpoint into System Stats panel. |
| 2.6 | **Tests**: Admin endpoint auth tests (non-admin gets 403). Dashboard rendering tests. |

**Design notes**:
- Admin dashboard gets a new route: `/admin/`.
- `isAdmin` is already computed in auth middleware (`auth.ts:33`). Expose to frontend via `GET /me/profile` response (added in Wave 0).

---

### Wave 3 — Observer Onboarding (#181, ~4–6 hrs)

**Goal**: APPLY workflow — observers discover and request to join farms.

| Step | What to Do |
|------|------------|
| 3.1 | **Data model**: Add join request entity: `PK=FARM#{farmId}`, `SK=JOIN_REQUEST#{userId}`, `status: pending/approved/rejected`, `requested_at`, `resolved_at`. |
| 3.2 | **API**: Add `POST /api/v1/farms/{farmId}/join` — observer submits join request. |
| 3.3 | **API**: Add `GET /api/v1/farms/{farmId}/join-requests` — admin/manager lists pending requests. |
| 3.4 | **API**: Add `PATCH /api/v1/farms/{farmId}/join-requests/{userId}` — approve or reject. On approve, create FARM_MEMBER record. |
| 3.5 | **API**: Add `GET /api/v1/farms/discoverable` — list farms with discoverable flag. |
| 3.6 | **Frontend**: Post-registration wizard step — "Which farm would you like to join?" showing discoverable farms with "Request to Join" buttons. (F4 feedback) |
| 3.7 | **Frontend**: Admin/manager view — pending requests list with approve/reject. Integrate into admin dashboard (#179). |
| 3.8 | **Data model**: Add `discoverable: boolean` flag to farm entity (default: true). |
| 3.9 | **Tests**: Full APPLY workflow: request → list → approve → verify membership. Rejection + duplicate handling. |

**Design decisions needed** (resolve during `/cc-design`):
- Notification mechanism — in-app badge vs email (#187) vs none for Beta-2?
- Should observers see farm details (location, beds) before joining?

---

### Wave 4 — Admin Notifications (#187, ~3–4 hrs)

**Goal**: Email admin on critical platform events.

| Step | What to Do |
|------|------------|
| 4.1 | **Infra**: Add SES identity or SNS topic to CDK LitCropStack. IAM permissions for Lambda. |
| 4.2 | **API**: Create `notifyAdmin(event, details)` utility function using SES/SNS. |
| 4.3 | **API**: Hook into: farm creation (`POST /farms`), farm deletion (`DELETE /farms`), member join, member leave, new user profile creation. |
| 4.4 | **Templates**: Simple plain-text email: `[LitCrop] New farm created: "Farm Name" by user@example.com` |
| 4.5 | **Tests**: Mock SES/SNS in tests. Verify notification is triggered on each event. |

**Dependencies**: Should be designed alongside #179 (Wave 2). Implement after Wave 3.

---

## 4. Dependencies & Ordering

```
Beta-1 (v0.22) ✅
  └── #182 admin access ──────────────────────┐
                                               ▼
Beta-2 (v0.23)                               Wave 2: #179 admin dashboard
  Pre:   docs conflict resolution (DONE)       │
  Wave 0: #185 #186 #188 C2 C5 S1 S2          ▼
  Wave 1: #90 settings + C1 tests + S3       Wave 3: #181 observer onboarding
                                               │
                                               ▼
                                             Wave 4: #187 admin notifications
                                               │
                                               ▼
                                             Wave 5: security & quality (S4-S8, Q4-Q9, T3-T6)
```

- **Pre** is done — docs conflicts resolved (2 commits).
- **Wave 0** is independent — start immediately.
- **Wave 1** is independent — can run in parallel with Wave 0.
- **Wave 2** depends on #182 (live) + Wave 0.1 (`isAdmin` exposed to frontend).
- **Wave 3** depends on Wave 2 for approval UI placement.
- **Wave 4** depends on Waves 2+3 for the events to notify on.
- **Wave 5** is independent — can start any time after Wave 0.

---

## 5. Scope Summary

| Category | Count | Items |
|----------|-------|-------|
| Docs (Pre) | 2 | REQUIREMENTS.md + ARCHITECTURE.md conflict resolution (**DONE**) |
| Quick wins (S) | 7 | #185, #186, #188, C2, C5, S1, S2 |
| Features (M) | 1 | #90 |
| Features (L) | 3 | #179, #181, #187 |
| Code quality + tests | 2 | C1 (admin tests), S3 (timezone) |
| Security & quality | 10 | S4, S5, S7, S8, Q4, Q5, Q6, Q8, Q9, T3-T6 |
| **Total** | **25** | 6 waves (Pre done) |
| New API endpoints | ~8 | settings (2), admin (2), join flow (3+), notifications |
| New pages/components | ~4 | AdminDashboard, ObserverLanding, JoinRequestList, FarmNameEditor |
| **Estimated effort** | **~20–28 hrs** | Across 6 waves |

**Tracker**: See [TASK-BREAKDOWN-BETA-2.md](TASK-BREAKDOWN-BETA-2.md) for per-item checklist.

---

## 6. What Remains for PROD (v1.0)

After Beta-2, the PROD backlog:

| # | Title | Size | Notes |
|---|-------|------|-------|
| #168 | Soft delete for farm deletion | L | DynamoDB TTL or scheduled Lambda |
| UX-5 | Bed → Crop 1:N model | L | Data model migration, ADR needed |
| #160 | Profile picture support | M | Moved from Beta-2 stretch |
| #183 | AI chat on all pages | M | Moved from Beta-2 stretch |
| — | 14 SUGGESTION items from Phase H review | — | Low priority polish |
| — | G1-G2 i18n "Plot" terminology cleanup | — | Low priority |

---

## 7. Exit Criteria

- [ ] Wave 0: all S-sized refinements closed (#185, #186, #188, C2, C5)
- [ ] #90 settings sync working cross-device (verify on 2 browsers)
- [ ] C1 admin bypass tests added and passing
- [ ] #179 admin dashboard visible only to admins, showing users + farms + stats
- [ ] #181 observer can discover farms, request to join, admin can approve/reject
- [ ] #181 observer wizard includes farm picker on signup (F4)
- [ ] #187 admin receives email on account/farm/member events
- [ ] Tests pass (target: 380+)
- [ ] Deploy to CloudFront
- [ ] Live verification: admin flow + observer flow + settings sync + notifications
- [ ] Tag v0.23 (Beta-2)
- [ ] Create PR develop → main

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| #187 SES/SNS setup complexity | Delays Wave 4 | Use SES direct send (simpler than SNS). Timebox infra to 1 hr. |
| #181 APPLY workflow scope creep | Timeline slip | Keep notification in-app only for Beta-2. Email via #187 separately. |
| Admin dashboard design unclear | Delays Wave 2 | Run `/cc-design` for #179 before implementation. |
| Observer landing page UX | Poor first impression | Design with `/cc-design` — mobile-first, clear CTA. |
| DynamoDB query patterns for join requests | GSI needed? | Farm-scoped queries (PK=FARM#) should work without new GSI. |
| `isAdmin` exposure to frontend | Security | Never trust client-side isAdmin for authorization. Server-side only. Frontend uses it for UI visibility, not access control. |

---

*Generated: 2026-03-25 | Updated: 2026-03-25 (Beta-1 feedback) | Session: litcrop-beta-1*
