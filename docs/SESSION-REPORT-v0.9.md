# Session Report: v0.9 — Security Hardening, Scope Realignment & MVP+ Planning

> Date: 2026-03-21
> Tag: v0.9 (307296a on develop)
> Branch: develop → main (PR #116 merged)
> Commits: 6 since v0.8 (develop), 1 merge commit (main)
> Tests: 280 → 288 (+8 edge-case tests)
> Deploy: AWS (CDK + S3 + CloudFront invalidation)

---

## Pipeline Context

This session covered two distinct phases: **implementation** (v0.9 batched fixes) and **strategic planning** (MVP+ scope realignment).

```
Pipeline:   v0.9 implementation (Batches 1-5) + deploy + merge + tag
            → strategic review → scope realignment → MVP+ planning docs
Previous:   v0.8 (deployed), v0.8.4 session (SDK migration, deploy fixes)
Next:       MVP+ pipeline via docs/MVP-PLUS-READINESS.md
```

---

## Session Timeline

| Phase | Activity |
|-------|----------|
| **Setup** | Read MVP-POST-PLAN.md, REPORT_MVP.md, ARCHITECTURE.md, SYSTEM-DESIGN.md, EXECUTION-PLAN.md |
| **Planning** | Created consolidated action dashboard — 22 items across 6 batches, security-first ordering |
| **Team 1** | Created team RITCROPPERS-v0.9 — 28 tasks, dependency chains, STOP gate at Batch 5 |
| **Batch 1** | v09-builder-1: C6, S11, S7, S8 (security fixes) — reviewer + simplifier in parallel |
| **Batch 2** | v09-builder-1: N3, Q7 (bug fixes) — reviewer found locale flash SHOULD-FIX |
| *Team crash* | Team RITCROPPERS-v0.9 died — memory captured state |
| **Team 2** | Created team RITCROPPERS-v09-B — resumed from Batch 2 commit |
| **Batch 2 commit** | Committed d6b019d with all reviewer/simplifier fixes applied |
| **Batch 3** | v09-builder-1: Q4, Q9, Q10 + verified Q5, N5 — reviewer found budget.ts MUST-FIX |
| **Batch 4** | v09-builder-1: Q8, S5 — reviewer found degreeToCardinal NaN SHOULD-FIX |
| **Batch 5** | v09-builder-2: T3, T4, T5, T6 (+8 tests) — reviewer + simplifier both clean |
| *Team crash* | Team RITCROPPERS-v09-B died — memory captured state |
| **Recovery** | Read memory, verified 288 tests pass, ran review + simplify for Batch 5 |
| **Commit B5** | Committed 307296a |
| **STOP gate** | Presented full B1-B5 summary — user approved |
| **Push** | Pushed 5 commits to origin/develop |
| **PR** | Created PR #116 (develop → main), 37 commits, 105 files |
| **Merge** | PR #116 merged to main (bd22c1a) |
| **Tag** | v0.9 tag created on develop (307296a), pushed to origin |
| **Deploy** | CDK deploy (API Lambda + Thumbnail IAM) + frontend build + S3 sync + CloudFront invalidation |
| **Review** | Full scope inventory — found 9 omitted items across 6 source documents |
| **Planning** | Created 4 MVP+ planning docs (ALL-ITEMS, REVISE-PLAN, USE-CASES, READINESS) |
| **Push** | Pushed planning docs to origin/develop |

---

## Implementation: v0.9 Batches (17 items)

### Batch 1 — Security (commit 1cae495)

| ID | Description | GH |
|----|-------------|-----|
| C6 | Hide chat model name from /usage response | #104 |
| S11 | Strip storage_key from image API responses | #105 |
| S7 | Sanitize LLM error body in CloudWatch logs | #106 |
| S8 | Thumbnail Lambda least-privilege IAM | #107 |

### Batch 2 — Bugs (commit d6b019d)

| ID | Description | GH |
|----|-------------|-----|
| N3 | Weather i18n hydration — synchronous localStorage init | #108 |
| Q7 | JSON parse errors return 400 BAD_REQUEST not 500 | #109 |

### Batch 3 — Robustness (commit 8116e68)

| ID | Description | GH |
|----|-------------|-----|
| Q4 | Bound weather cache Map to 100 entries (oldest-first eviction) | #110 |
| Q9 | JPEG magic bytes guard for buffers < 3 bytes | #111 |
| Q10 | Align TABLE_NAME/BUCKET fallbacks to litcrop-dev (was litcrop-poc) | #112 |
| Q5 | Budget non-null assertions — verified already safe (no change) | — |
| N5 | PlotDetail upload — verified correct (no change) | — |

### Batch 4 — UX + Docs (commit ec4dc2b)

| ID | Description | GH |
|----|-------------|-----|
| Q8 | Wind direction degreeToCardinal() with NaN/negative guard | #113 |
| S5 | Rate limiter Lambda caveat documented in code + ARCHITECTURE.md | #114 |

### Batch 5 — Tests (commit 307296a)

| ID | Description | GH |
|----|-------------|-----|
| T3 | Auth middleware: rejects no-iss and non-Cognito issuer (+2 tests) | #115 |
| T4 | Ownership: blocks cross-user POST to plots and images (+2 tests) | #115 |
| T5 | Budget: exact boundary allowed, one-over blocked (+2 tests) | #115 |
| T6 | Plot creation: empty crop_type and oversized variety rejected (+2 tests) | #115 |

---

## Review Findings & Remediation

### MUST-FIX (2 found, 2 resolved in-session)

| Finding | Source | Resolution |
|---------|--------|------------|
| `ImageUploadResponse` type still had `storage_key` after schema removal | Batch 1 reviewer | Fixed by simplifier (same finding independently) |
| `budget.ts` TABLE_NAME fallback still `litcrop-poc` after Q10 fixed `dynamodb.ts` | Batch 3 reviewer | Fixed by lead + also caught `s3.ts` (3 files aligned) |

### SHOULD-FIX (3 found, 3 resolved in-session)

| Finding | Source | Resolution |
|---------|--------|------------|
| `usage.test.ts` stale model assertion | Batch 1 reviewer | Builder-1 applied fix |
| WeatherView `useState('en')` + useEffect causes locale flash | Batch 2 reviewer | Builder-1 applied synchronous `getInitialLocale()` |
| `degreeToCardinal` unsafe for NaN/negative (JS `%` preserves sign) | Batch 4 reviewer | Lead applied `((x % 8) + 8) % 8` + `Number.isFinite` guard |

### Simplifier Fixes (3 applied)

| Fix | Batch |
|-----|-------|
| Removed `storage_key` from `ImageUploadResponse` type | B1 |
| Added `BAD_REQUEST` to `ErrorCode` union type | B2 |
| Removed dead `TEST_USER_ID` import in `app.test.ts` | B2 |

---

## Team Operations

### Team 1: RITCROPPERS-v0.9

| Agent | Type | Work Done |
|-------|------|-----------|
| v09-builder-1 | my-builder (Sonnet) | Batches 1-4 implementation |
| v09-builder-2 | my-builder (Sonnet) | Batch 5 tests |
| v09-reviewer | my-reviewer (Opus) | Review gate for Batches 1-2 |
| v09-simplifier | code-simplifier | /simplify for Batches 1-2 |

**Outcome**: Died mid-session after Batch 2. Memory captured full state.

### Team 2: RITCROPPERS-v09-B

| Agent | Type | Work Done |
|-------|------|-----------|
| v09-builder-1 | my-builder (Sonnet) | Batches 3-4 implementation |
| v09-builder-2 | my-builder (Sonnet) | Batch 5 tests |
| v09-reviewer | my-reviewer (Opus) | Review gate for Batches 3-4 |
| v09-simplifier | code-simplifier | /simplify for Batches 3-4 |

**Outcome**: Died mid-session during Batch 5. Memory captured full state.

### Recovery (no team)

Batch 5 review + simplify ran as standalone agents. Commit, push, PR, merge, tag, deploy all done by lead.

### Lesson Learned

Teams die when context fills up. The memory system (`project_v09_builder2_batch5.md`) enabled clean recovery both times — no work was lost. **Key pattern**: write memory at each batch boundary, not just at session end.

---

## Strategic Planning: MVP+ Scope Realignment

### Scope Review Findings

Conducted full-scope inventory across 6 source documents. Found **9 items omitted** from all phase plans:

| ID | Description | Source |
|----|-------------|--------|
| F-09 | Map picker for farm location | FEEDBACK |
| F-10 | Elevation auto-fetch | FEEDBACK |
| F-14 | Time-lapse playback (Vision MVP deliverable #3) | FEEDBACK / Vision |
| S3 | Auth middleware root path gap | REVIEW-FINDINGS |
| S4 | Pagination cursor DynamoDB injection | REVIEW-FINDINGS |
| S6 | Chat stub XSS sanitization | REVIEW-FINDINGS |
| Q6 | Image ownership 503→404 | REVIEW-FINDINGS |
| SF-4 | Chat Markdown rendering | REPORT_POC |
| SG-3 | updateFarm ExpressionAttributeNames leak | REPORT_POC |

### Documents Created

| Document | Purpose | Items |
|----------|---------|-------|
| `docs/MVP-PLUS-ALL-ITEMS.md` | Complete 72-item inventory | 25 done, 47 remaining |
| `docs/MVP-PLUS-REVISE-PLAN.md` | Scope proposal: MVP+ / PROD-1 / PROD-2 | 18 / 12 / 11 items |
| `docs/USE-CASES.md` | 5 personas, 10 use cases, templates | Shared farm decision pending |
| `docs/MVP-PLUS-READINESS.md` | Session entry point, 4-step pipeline | Next session starts here |

### Proposed Scope (MVP+ = v1.0, ~12-14h)

```
Phase A: CI/CD Foundation (4 items)        ~1h
Phase B: Vision Closure (F-14, FR-3.5, SF-4) ~4h
Phase C: UX + Security (F-09, F-10, S3/S4/S6, S10) ~4h
Phase D: Quality (Q6, SG-3, Q12, T8-T9)   ~3h
```

**Key decision**: F-14 (time-lapse) is P0 — it's the missing Vision MVP deliverable and appears in 4 of 10 use cases.

---

## Metrics

| Metric | v0.8 | v0.9 | Delta |
|--------|------|------|-------|
| Tests | 280 | 288 | +8 |
| Test files | 17 | 17 | 0 |
| GH issues (closed) | — | 12 | +12 |
| Commits (session) | — | 6 | +6 |
| Files changed | — | 16 (code) + 4 (docs) | 20 |
| Security fixes | — | 4 (C6, S11, S7, S8) | — |
| Reviewer findings | — | 2 MUST + 3 SHOULD (all resolved) | — |
| Planning docs | — | 4 new | — |

---

## Deployment Record

| Step | Command | Result |
|------|---------|--------|
| CDK deploy | `npx cdk deploy` | LitCropStack updated (API Lambda + Thumbnail IAM) |
| Frontend build | `npm run build` | 12 pages built (1.5s) |
| S3 sync | `aws s3 sync dist/ s3://litcrop-mvp-static/ --delete` | Files uploaded |
| CloudFront | `aws cloudfront create-invalidation --paths "/*"` | Invalidation I5ALFJUFBG6QV5798JT4HC7SDS |
| API health | `/health` | 200 OK |
| Frontend | https://dpj8a3mk3tzkq.cloudfront.net | 200 OK |

---

## Git Operations

| Operation | Detail |
|-----------|--------|
| Commits | 6 on develop (5 batches + 1 planning docs) |
| Push | 6 commits pushed to origin/develop |
| PR | #116 (develop → main, 37 commits, 105 files, +17365/-2351) |
| Merge | PR #116 merged (bd22c1a) |
| Tag | v0.9 (307296a on develop), pushed to origin |

---

## Open Items

### Pending Decisions (for next session)

1. Shared farm access model for April evaluation (Option D recommended)
2. FR-3.6 side-by-side: MVP+ if time, else PROD-1
3. SSE streaming: recommended PROD-1

### Open GitHub Issues (5)

| # | Title | Scope |
|---|-------|-------|
| #55 | Map picker for farm location (F-09) | MVP+ |
| #56 | Elevation auto-fetch (F-10) | MVP+ |
| #58 | Soil pH monitoring (F-13) | Production |
| #59 | Time-lapse playback (F-14) | MVP+ |
| #90 | Settings cross-device sync | PROD-1 |

### Next Session Entry Point

```
Read docs/MVP-PLUS-READINESS.md → follow 4-step pipeline
```

---

> Session duration: ~3 hours
> Model: Claude Opus 4.6 (1M context)
> Teams: 2 created (both crashed, both recovered via memory)
> Agents spawned: 8 (2 builders, 2 reviewers, 2 simplifiers, 2 explorers)
