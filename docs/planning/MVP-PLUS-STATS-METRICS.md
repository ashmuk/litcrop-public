# LitCrop Stats & Metrics (v0.1–v0.15)

> Generated: 2026-03-22
> Scope: Full project history — PoC (v0.1–v0.9) + MVP+ (v0.10–v0.15)
> Purpose: Raw data for post-mortem analysis of the full development pipeline

---

## 0. Full Version History

### Per-Version Summary

| Ver | Date | Scope | Commits | +Lines | -Lines | Net | Cumul Lines | Cumul Commits | Tests |
|-----|------|-------|---------|--------|--------|-----|-------------|---------------|-------|
| v0.1 | 2026-03-17 | PoC init | 26 | — | — | 11,286 | 11,286 | 26 | — |
| v0.2 | 2026-03-17 | PoC features | 7 | +6,260 | -37 | +6,223 | 17,545 | 33 | — |
| v0.3 | 2026-03-17 | PoC patch | 2 | +29 | 0 | +29 | 17,574 | 35 | — |
| v0.4 | 2026-03-18 | PoC features | 8 | +17,660 | -1 | +17,659 | 35,234 | 43 | — |
| v0.5 | 2026-03-18 | PoC features | 8 | +3,807 | -271 | +3,536 | 38,770 | 51 | 168 |
| v0.6 | 2026-03-18 | PoC features | 6 | +1,160 | 0 | +1,160 | 39,930 | 57 | — |
| v0.7 | 2026-03-19 | PoC deploy | 18 | +33,500 | -508 | +32,992 | 72,927 | 75 | — |
| v0.8 | 2026-03-20 | PoC refinement | 23 | +14,625 | -2,325 | +12,300 | 85,241 | 98 | 262 |
| v0.9 | 2026-03-21 | PoC→MVP bridge | 20 | +4,444 | -92 | +4,352 | 89,593 | 118 | 288 |
| | | **PoC subtotal** | **118** | | | | **89,593** | **118** | **288** |
| v0.10 | 2026-03-22 | Phase A CI/CD | 13 | +9,789 | -4,143 | +1,543 | 91,136 | 131 | 303 |
| v0.11 | 2026-03-22 | Phase B Multi-Farm | 3 | +1,275 | -114 | +1,161 | 92,297 | 134 | 303 |
| v0.12 | 2026-03-22 | Phase C Vision | 4 | +2,492 | -73 | +2,419 | 94,716 | 138 | 303 |
| v0.13 | 2026-03-22 | Phase D UX | 11 | +7,739 | -3,042 | +4,697 | 99,413 | 149 | 287 |
| v0.14 | 2026-03-22 | Phase E+F Sec+Qual | 7 | +697 | -79 | +618 | 100,031 | 156 | 321 |
| v0.15 | 2026-03-22 | Camera Node | 6 | +1,130 | -18 | +1,112 | 101,143 | 162 | 321 |
| v0.16 | 2026-03-23 | Feedback R1 (F-01..F-09) | 1 | +358 | -50 | +308 | 101,451 | 163 | 321 |
| v0.17 | 2026-03-23 | Plan limits (F-11/F-12/F-16) | 4 | +92 | -11 | +81 | 101,532 | 167 | 323 |
| v0.18 | 2026-03-23 | Farm context pane (F-13) | 1 | +160 | -9 | +151 | 101,683 | 168 | 328 |
| v0.19 | 2026-03-23 | Weather loc + sync (F-04/F-08/#90) | 2 | +59 | -6 | +53 | 101,736 | 170 | 328 |
| v0.20 | 2026-03-24 | Roles, profiles, leave, CORS, scroll | 23 | +629 | -49 | +580 | 102,316 | 193 | 336 |
| | | **MVP+ subtotal** | **52** | **+23,791** | **-7,545** | | **+12,143** | **52** | **328** |
| | | **Post-deploy subtotal** | **31** | **+1,298** | **-125** | | **+1,173** | **31** | **336** |
| | | **Grand total** | **193** | | | | **102,316** | **193** | **336** |

### Timeline (calendar days)

| Period | Days | Versions | Commits | Scope |
|--------|------|----------|---------|-------|
| 2026-03-17 | Day 1 | v0.1–v0.3 | 35 | PoC init + features |
| 2026-03-18 | Day 2 | v0.4–v0.6 | 22 | PoC features + tests |
| 2026-03-19 | Day 3 | v0.7 | 18 | PoC deploy + CDK |
| 2026-03-20 | Day 4 | v0.8 | 23 | PoC refinement |
| 2026-03-21 | Day 5 | v0.9 | 20 | PoC→MVP bridge |
| 2026-03-22 | Day 6 | v0.10–v0.15 | 44 | All 6 MVP+ phases + camera |
| 2026-03-23 | Day 7 | v0.16–v0.19 | 8 | Post-deploy feedback R1–R3 |
| 2026-03-24 | Day 8 | v0.20 | 23 | Roles, profiles, CORS, scroll, leave |
| **Total** | **8 days** | **20 versions** | **193** | |

### Scope Totals

| Scope | Versions | Commits | Days | Net Lines | Tests (final) |
|-------|----------|---------|------|-----------|---------------|
| PoC (v0.1–v0.9) | 9 | 118 | 5 | 89,593 | 288 |
| MVP+ (v0.10–v0.15) | 6 | 44 | 1 | +11,550 | 321 |
| Post-deploy (v0.16–v0.20) | 5 | 31 | 2 | +1,173 | 336 |
| **Total** | **20** | **193** | **8** | **102,316** | **336** |

---

## 1. MVP+ Phase Timeline

| Phase | Version | Session | Date | Commits | Key Deliverable |
|-------|---------|---------|------|---------|-----------------|
| A — CI/CD | v0.10 | v0.10 | 2026-03-22 | 3 | pr-checks.yml + deploy.yml |
| B — Multi-Farm | v0.11 | v0.11 | 2026-03-22 | 3 | FARM_MEMBER, roles, farm switching |
| C — Vision | v0.12 | v0.12 | 2026-03-22 | 4 | Time-lapse, lightbox, chat markdown |
| D — UX Restructure | v0.13 | v0.13 | 2026-03-22 | 11 | Farm→Bed, map picker, profile |
| E — Security | v0.14 | v0.14 | 2026-03-22 | 7 | RemovalPolicy RETAIN + remediations |
| F — Quality | v0.14 | v0.14 | 2026-03-22 | (included in E) | Schema tests, timezone, 503→404 |
| Camera Node | v0.15 | v0.15 | 2026-03-22 | 6 | Capture script, setup guide, security |
| **Total** | | | | **31** | |

---

## 2. Codebase Metrics

### Current Size (v0.15)

| Package | Lines (prod) | Lines (test) | Files |
|---------|-------------|-------------|-------|
| `packages/shared` | 1,066 | ~600 | 12 |
| `src/api` | 3,418 | ~2,400 | 20 |
| `src/frontend` | 6,336 | — | 48 |
| `src/simulator` | 332 | ~100 | 4 |
| `infra` (CDK) | 509 | — | 1 |
| `scripts` | ~500 | — | 4 |
| **Total** | **~12,161** | **~3,100** | **89** |

### Component Counts

| Category | Count |
|----------|-------|
| Frontend components (`.tsx`) | 24 |
| API route files | 9 |
| Zod schemas (exported) | 24 |
| ADRs | 13 |
| Test files | 19 |
| Tests | 321 |
| i18n languages | 2 (EN, JA) |

### MVP+ Code Changes (v0.10→v0.15)

| Metric | Value |
|--------|-------|
| Total files changed | 116 |
| Files added | 36 |
| Files modified | 69 |
| Files deleted | 0 |
| Lines inserted | +13,016 |
| Lines deleted | -3,009 |
| Net change | +10,007 |
| Production code (non-test) | +4,346 / -1,927 = net +2,419 |
| Test code | +1,266 / -918 = net +348 |

---

## 3. Git & GitHub Metrics

### Commits

| Scope | Count |
|-------|-------|
| Total repo commits (all time) | 164 |
| MVP+ commits (v0.10–v0.15) | 31 |
| PoC commits (v0.1–v0.9) | ~133 |
| MVP+ % of total | 19% |

### Tags

| Tag | Scope | Milestone |
|-----|-------|-----------|
| v0.1–v0.9 | PoC | 9 tags |
| v0.10 | MVP+ Phase A | CI/CD |
| v0.11 | MVP+ Phase B | Multi-farm |
| v0.12 | MVP+ Phase C | Vision closure |
| v0.13 | MVP+ Phase D | UX restructure |
| v0.14 | MVP+ Phase E+F | Security + quality |
| v0.15 | MVP+ Camera | Scripts + guide |
| **Total** | | **15 tags** |

### Pull Requests

| Metric | Count |
|--------|-------|
| Total PRs (all time) | 13 |
| PRs merged | 13 |
| PRs rejected | 0 |
| MVP+ PRs (#123–#130) | 8 |

### Issues

| Metric | Count |
|--------|-------|
| Total issues (all time) | 30+ (GitHub) |
| Closed | 30 |
| Open | 1 (#90 — BETA) |
| MVP+ issues created | ~15 |
| MVP+ issues closed | ~15 |

---

## 4. Test Metrics

### Test Count Trajectory

| Version | Tests | Files | Delta | Cause |
|---------|-------|-------|-------|-------|
| v0.9 (baseline) | 288 | 17 | — | PoC complete |
| v0.10 (Phase A) | 303 | 17 | +15 | CI/CD + auth tests |
| v0.11 (Phase B) | 303 | 17 | 0 | Multi-farm (same count) |
| v0.12 (Phase C) | 303 | 17 | 0 | Time-lapse (no new tests) |
| v0.13 (Phase D) | 287 | 18 | -16 | Simpler model = fewer tests needed |
| v0.13 + remediate | 287 | 18 | 0 | Remediation (+16 beds tests, -16 plot tests) |
| v0.14 (Phase E+F) | 321 | 19 | +34 | Schema tests added |
| v0.15 (Camera) | 321 | 19 | 0 | Shell scripts (no vitest) |

### Test Coverage by Layer

| Layer | Test Files | Tests | Notes |
|-------|-----------|-------|-------|
| Shared (constants, validation, schemas) | 3 | 99 | 34 new schema tests in Phase F |
| API routes | 7 | ~140 | beds.test.ts added in remediation |
| API services | 2 | ~50 | DynamoDB + S3 mocks |
| API middleware | 1 | ~15 | Ownership/auth edge cases |
| Contracts | 1 | ~17 | Zod schema validation |
| Simulator | 1 | ~5 | Upload retry logic |

---

## 5. Review & Remediation Metrics

### Phase D Review

| Severity | Found | Resolved | Deferred |
|----------|-------|----------|----------|
| MUST-FIX | 3 | 3 | 0 |
| SHOULD-FIX | 4 | 4 | 0 |
| SUGGESTION | 3 | 0 | 3 |
| **Total** | **10** | **7** | **3** |

Findings:
- M1: Bed detail missing url+tags on latest_image
- M2: PATCH /beds null values silently dropped
- M3: No tests for beds routes
- S1: BedStatus kept 5 values (intentional)
- S2: BatchWrite UnprocessedItems unchecked
- S3: Grid expansion didn't create new beds
- S4: 410 Gone used NOT_FOUND error code

### Final MVP+ Review

| Severity | Found | Resolved | Deferred |
|----------|-------|----------|----------|
| MUST-FIX | 1 | 1 | 0 |
| SHOULD-FIX | 3 | 3 | 0 |
| SUGGESTION | 4 | 0 | 4 |
| **Total** | **8** | **4** | **4** |

Findings:
- M1: CDK budget env var name mismatch
- S1: Admin 403 used UNAUTHORIZED
- S2: plots/view.astro content flash
- S3: Weather hardcoded timezone

### Camera Node E2E Review

| Severity | Found | Resolved | Deferred |
|----------|-------|----------|----------|
| MUST-FIX | 3 | 3 | 0 |
| SHOULD-FIX | 3 | 3 | 0 |
| SUGGESTION | 3 | 0 | 3 |
| **Total** | **9** | **6** | **3** |

Findings:
- M1: JWT authorizer rejects access tokens (no `aud` claim)
- M2: Thumbnail Lambda lacks DynamoDB read permission
- M3: Spool timestamp reconstruction corrupts timezone offset

### Camera Security Review

| Severity | Found | Resolved | Deferred |
|----------|-------|----------|----------|
| MUST-FIX | 5 | 5 | 0 |
| SHOULD-FIX | 5 | 5 | 0 |
| SUGGESTION | 3 | 0 | 3 |
| **Total** | **13** | **10** | **3** |

### Simplification Passes

| Pass | Files Reviewed | Fixes Applied | Lines Removed |
|------|---------------|---------------|---------------|
| Batch 1 (shared) | 8 | 3 | ~10 |
| Batch 2 (API) | 9 | 1 | ~5 |
| Batch 3 (frontend) | 7 | 5 | ~15 |
| Phase D aggregate | 7 | 7 | -19 net |
| Phase E+F | 4 | 0 (clean) | 0 |
| Camera node | 3 | 0 (clean) | 0 |

### Aggregate Review Stats

| Metric | Total |
|--------|-------|
| Reviews conducted | 4 |
| Total findings | 40 |
| MUST-FIX found | 12 |
| MUST-FIX resolved | 12 (100%) |
| SHOULD-FIX found | 15 |
| SHOULD-FIX resolved | 15 (100%) |
| SUGGESTION found | 13 |
| SUGGESTION resolved | 0 (deferred) |
| Remediation iterations | 4 (1 per review, no repeats) |
| Escalations to architect | 0 |
| Simplification passes | 6 |
| Simplification fixes | 16 |

---

## 6. Pre-existing Bugs Discovered

Bugs that existed before MVP+ but were found during this work:

| Bug | Latent Since | Found By | Impact |
|-----|-------------|----------|--------|
| Thumbnail Lambda lacks DynamoDB read | Phase B (CDK stack) | Camera E2E review | No thumbnails in production |
| JWT authorizer rejects access tokens | Phase B (CDK stack) | Camera E2E review | Would block all non-browser clients |
| CDK budget env var name mismatch | Phase B (chat budget) | Final review | Budget overrides silently ignored |
| CloudFront serves from PoC bucket | Phase A (deploy config) | Post-deploy testing | All deploys to wrong bucket |

---

## 7. Pipeline Step Usage

### Skills Invoked (this session)

| Skill | Invocations | Notes |
|-------|-------------|-------|
| `/cc-design` | 1 | Steps 2-7 for Phase D |
| `/cc-implement` | 1 | 4 batches for Phase D |
| `/cc-review` | 4 | Phase D, final, camera E2E, camera security |
| `/cc-remediate` | 4 | After each review |
| `/simplify` | 6 | Per batch + Phase E+F + camera |
| `/cc-commit` | 5 | Manual staging |
| `/cc-push` | 3 | To origin |
| `/cc-pr-create` | 4 | develop → main |
| `/cc-pr-merge` | 4 | After CI green |
| `/cc-tag-create` | 2 | v0.13, v0.14, v0.15 |
| `/cc-issue-create` | 1 | #125 (data model migration) |

### Agent Usage

| Agent Type | Invocations | Purpose |
|-----------|-------------|---------|
| `my-designer` (Opus) | 1 | Phase D UX design |
| `my-architect` (Opus) | 1 | Phase D system design |
| `my-analyst` (Sonnet) | 1 | Phase D task breakdown |
| `my-builder` (Opus/Sonnet) | 8 | Implementation batches + remediations |
| `my-reviewer` (Opus) | 4 | All reviews |
| `code-simplifier` (Sonnet) | 6 | Per-batch simplification |
| `Explore` | 1 | Camera/image feature scan |

### Model Selection

| Model | Usage | Rationale |
|-------|-------|-----------|
| **Opus** | Architecture, design, review, complex implementation | Strategic decisions, cross-package coordination |
| **Sonnet** | Task breakdown, simplification, small fixes, remediations | Tactical work, well-scoped tasks |

---

## 8. Architecture Metrics

### Data Model Evolution

| Version | Entities | DDB Queries (farm overview) | Notes |
|---------|----------|---------------------------|-------|
| v0.9 (PoC) | 6 (Farm, Field, Bed, Plot, Image, Tag) | N+1 (field→bed→plot tree) | Over-engineered |
| v0.13 (Phase D) | 4 (Farm, Bed, Image, Tag) | 2 (farm meta + beds) | Flattened |
| **Reduction** | **-2 entities** | **~90% fewer queries** | |

### API Endpoints

| Version | Endpoints | Notes |
|---------|-----------|-------|
| v0.9 | 11 | Plot-based |
| v0.13 | 13 | Bed-based + 410 stubs |
| v0.15 | 13 | + thumbnail Lambda fix |

### Frontend Components

| Version | Components | New in MVP+ |
|---------|-----------|------------|
| v0.9 | 18 | — |
| v0.15 | 24 | MapPicker, FarmWizard, ProfilePage, BedDetail, BedGridLayout, FarmLayoutView (rewritten) |

### New Dependencies Added

| Dependency | Version | Size (gzip) | Phase | Rationale |
|-----------|---------|-------------|-------|-----------|
| `leaflet` | 1.9.x | ~40KB | D | Map picker |
| `@types/leaflet` | — | dev only | D | TypeScript types |

---

## 9. Deploy & Infrastructure Metrics

### Deployments

| # | Trigger | Result | Issue Found |
|---|---------|--------|-------------|
| 1 | PR #126 merge | Success | — |
| 2 | PR #127 merge | Success | — |
| 3 | PR #128 merge | Success | — |
| 4 | PR #129 merge | Success | Login 400 (missing Cognito env vars) |
| 5 | PR #130 merge | Success | Stale CloudFront cache (wrong S3 bucket) |

### Deploy Issues

| Issue | Root Cause | Time to Detect | Time to Fix |
|-------|-----------|---------------|-------------|
| Login 400 | `PUBLIC_COGNITO_CLIENT_ID` not in deploy.yml | Immediate (first test) | ~10 min |
| Stale JS hashes | CloudFront serving from `litcrop-poc-static` not `litcrop-mvp-static` | ~45 min (debugging cache) | ~5 min (once identified) |

### GitHub Environment Variables (Production)

| Variable | Value | When Set |
|----------|-------|----------|
| `PUBLIC_API_BASE_URL` | set | Phase A |
| `CLOUDFRONT_DIST_ID` | set | Phase A |
| `FRONTEND_BUCKET` | `litcrop-poc-static` (fixed) | Session (was wrong) |
| `PUBLIC_COGNITO_CLIENT_ID` | set | Session (was missing) |
| `PUBLIC_COGNITO_REGION` | set | Session (was missing) |
| `AWS_REGION` | set | Phase A |

---

## 10. Session Reports

| Report | Version | Scope | Commits | Tests |
|--------|---------|-------|---------|-------|
| SESSION-REPORT-v0.1 | v0.1 | PoC init | — | — |
| SESSION-REPORT-v0.2 | v0.2 | PoC features | — | — |
| SESSION-REPORT-v0.4 | v0.4 | PoC features | — | — |
| SESSION-REPORT-v0.5 | v0.5 | PoC features | — | — |
| SESSION-REPORT-v0.6 | v0.6 | PoC features | — | — |
| SESSION-REPORT-v0.7 | v0.7 | PoC deploy | — | — |
| SESSION-REPORT-v0.8.1 | v0.8.1 | PoC refinement | — | — |
| SESSION-REPORT-v0.8.2 | v0.8.2 | PoC refinement | — | — |
| SESSION-REPORT-v0.8.3 | v0.8.3 | PoC refinement | — | — |
| SESSION-REPORT-v0.8.4 | v0.8.4 | PoC refinement | — | — |
| SESSION-REPORT-v0.9 | v0.9 | PoC → MVP bridge | 5 | 288 |
| SESSION-REPORT-v0.10 | v0.10 | MVP+ Phase A | 3 | 303 |
| SESSION-REPORT-v0.11 | v0.11 | MVP+ Phase B | 3 | 303 |
| SESSION-REPORT-v0.12 | v0.12 | MVP+ Phase C | 4 | 303 |
| SESSION-REPORT-v0.13 | v0.13 | MVP+ Phase D | 11 | 287 |
| SESSION-REPORT-v0.14 | v0.14 | MVP+ Phase E+F | 7 | 321 |
| SESSION-REPORT-v0.15 | v0.15 | Camera node | 6 | 321 |

---

## 11. Readiness Criteria

### April Field Evaluation (16 criteria)

| # | Criterion | Met | Version |
|---|-----------|-----|---------|
| 1 | Demo farm pre-seeded | Yes | v0.11 |
| 2 | Farm creation wizard + map | Yes | v0.13 |
| 3 | Farm switching | Yes | v0.11 |
| 4 | Bed-grid layout | Yes | v0.13 |
| 5 | Camera → bed association | Yes | v0.13 |
| 6 | Admin-managed membership | Yes | v0.11 |
| 7 | Time-lapse playback | Yes | v0.12 |
| 8 | Weather + crop impact | Yes | v0.9 |
| 9 | AI chat (stub + markdown) | Yes | v0.12 |
| 10 | Japanese UI complete | Yes | v0.9 |
| 11 | Mobile UX | Yes | v0.9 |
| 12 | Desktop layout | Yes | v0.9 |
| 13 | CI/CD operational | Yes | v0.10 |
| 14 | Profile page | Yes | v0.13 |
| 15 | Camera node scripts + guide | Yes | v0.15 |
| 16 | 3 user accounts | No | Post-deploy |
| **Total** | | **15/16** | |

---

## 12. Key Observations (for post-mortem)

### What Worked Well

1. **Per-batch simplify/review/remediate cycle** caught 12 MUST-FIX bugs before they reached production
2. **Data model flattening (Phase D)** reduced 2 entities and ~90% of farm overview queries
3. **Camera E2E review** discovered 2 pre-existing infra bugs that would have blocked field deployment
4. **Deprecated aliases** enabled incremental migration without breaking downstream code

### What Didn't Work Well

1. **CloudFront origin bucket mismatch** — deploy uploaded to `litcrop-mvp-static` but CloudFront served from `litcrop-poc-static`. Not detected until live testing.
2. **Missing Cognito env vars in CI/CD** — `PUBLIC_COGNITO_CLIENT_ID` not added to deploy.yml when auth was implemented (Phase B), only caught when testing login on live site.
3. **Cache invalidation debugging** — spent ~45 minutes investigating CloudFront caching before discovering the root cause was the wrong S3 bucket.
4. **Test count dropped in Phase D** — from 303 to 287 due to simpler model, then recovered to 321 with schema tests. The dip could concern stakeholders.

### Pipeline Observations

1. **Reviews found more bugs in integration boundaries** (API←→CDK, CDK←→CloudFront, script←→API) than within individual layers
2. **Simplification passes rarely found issues** after the first major Phase D pass — diminishing returns on later phases
3. **Shell scripts** (camera node) had more security concerns than TypeScript code — `source` injection, process list exposure, world-readable configs
4. **The review→remediate cycle never required >1 iteration** — all findings were fixable on first pass (no escalations)
5. **FR-3.6 (side-by-side)** was deferred — the only MVP+ item not delivered. Acceptable given P2 priority.

---

> Generated 2026-03-22 | Source: session reports v0.10–v0.15, git history, GitHub API
> Purpose: Post-mortem data for pipeline analysis
