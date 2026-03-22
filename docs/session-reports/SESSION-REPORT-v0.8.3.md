# Session Report: v0.8.3 — Budget Controls, BYOK, and Test Strategy

> Date: 2026-03-20
> Branch: develop
> Session name: litcrop-mvp-budget-test
> Commits: 2 (7 files changed, 1,027 insertions, 358 deletions)

---

## Pipeline Context

Continuation of v0.8.2 session. Added MVP token budget controls and [Production] BYOK enhancement as a design amendment to Phase E, then completed Phase F (test strategy).

```
Pipeline stage:  6 (Enhancement/MVP)
Completed:       Phase E+ (budget/BYOK amendment), Phase F (/cc-test)
Next:            Phase G (/cc-implement — dual-builder parallel implementation)
```

---

## Session Timeline

| Activity | Details |
|----------|---------|
| Budget concern raised | User flagged: 15 testers sharing Anthropic account — need abuse/cost protection |
| Design amendment | Team RITCROPPERS-amend (designer agent) added budget controls + BYOK to 5 design docs |
| Review (budget/BYOK) | Reviewer found 1 MUST-FIX (Haiku pricing wrong) + 3 SHOULD-FIX |
| Pricing research | WebSearch confirmed correct Haiku 4.5 pricing: $1.00/$5.00 per MTok |
| Remediation | Applied all 4 fixes directly (pricing, field names, UX bar, ErrorCode union) |
| Phase F: Test strategy | Analyst updated TEST-STRATEGY.md (PoC → MVP scope) |
| Phase F review | Reviewer: CONDITIONAL PASS with 5 SHOULD-FIX (ownership gaps, Zod nullability) |
| Phase F fixes | Applied all 5: ownership table +2 endpoints, §11 +3 files, Zod nullable, fixture note, BUDGET_EXCEEDED |
| Team planning | Analyzed EXECUTION-PLAN.md phases, proposed dual-builder team for Phase G |

---

## Commits

| Hash | Message | Files |
|------|---------|-------|
| `eea47e6` | docs: add MVP token budget controls and [Production] BYOK enhancement | 6 |
| `2a39fa4` | docs: Phase F — MVP test strategy, coverage plan, and schema fixes | 3 |

---

## Key Decisions Made

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | LLM model for MVP chatbot | Claude Haiku 4.5 | 15x cheaper than Sonnet; sufficient for crop planning |
| 2 | Per-user daily token budget | 50K input / 10K output | Limits individual cost; configurable via env var |
| 3 | Global daily spending cap | 500K input / 100K output | Circuit breaker for total API spend |
| 4 | Conversation turn limit | 20 turns | Prevents context growth cost explosion |
| 5 | BYOK scope | [Production] only | Not needed for 15-tester MVP; future self-service |
| 6 | Zod thumbnail_url | `.nullable()` | Images without thumbnails return null — was a real bug |
| 7 | Ownership test coverage | 12 endpoints (was 10) | Added PATCH /farms, POST /plots/:plotId/images |

---

## Phase E+ Deliverables (Budget Controls Amendment)

### MVP Token Budget Controls
- 5-layer defense: auth → daily budget → rate limit → turn limit → model lock
- DynamoDB atomic counters with 48h TTL auto-cleanup
- `GET /api/v1/usage` endpoint + `UsageResponseSchema` Zod schema
- `BUDGET_EXCEEDED` error code added to ErrorCode union
- UX usage bar: `max(input_pct, output_pct)` with tooltip
- Cost estimate: ~$9/month realistic, ~$30/month worst-case for 15 testers

### [Production] BYOK Enhancement
- `PUT/DELETE /api/v1/settings/api-key` endpoints
- KMS-encrypted storage, masked key_hint response
- UX Settings §9.4b: 4-state modal (no key, active, adding, validation failed)
- Users with own key bypass all budget limits

---

## Phase F Deliverables (Test Strategy)

| Metric | PoC | MVP | Delta |
|--------|-----|-----|-------|
| Test files | 9 | 19 | +10 |
| Test cases | ~115 | ~197 | +82 |
| Estimated test LOC | ~1020 | ~2070 | +1050 |
| Contract tests | 11 | 14 | +3 |
| Ownership tests | 0 | 12 | +12 |
| Budget tests | 0 | 8 | +8 |
| Auth middleware tests | 0 | 7 | +7 |

### Coverage Gates (blocking deploy)
- Contract tests: 100% of 14 must pass
- Auth + ownership tests: must pass
- Budget tests: must pass
- Line coverage: ≥70%
- Branch coverage: ≥60%

---

## Teams Used

### Team RITCROPPERS-amend (budget/BYOK)
| Teammate | Agent Type | Tasks | Status |
|----------|-----------|-------|--------|
| team-lead | orchestrator | Coordination, review fixes | Completed |
| designer | my-designer | Budget controls + BYOK doc updates | Shut down |

### Team RITCROPPERS (Phase F)
| Teammate | Agent Type | Tasks | Status |
|----------|-----------|-------|--------|
| team-lead | orchestrator | Coordination, Phase F fixes | Active |
| analyst | my-analyst | Test strategy (Task #1) | Idle (done) |
| reviewer | my-reviewer | Test strategy review (Task #2) | Idle (done) |

---

## Review Findings Summary

### Budget/BYOK Review
| Severity | Count | Resolved |
|----------|-------|----------|
| MUST-FIX | 1 (Haiku pricing) | 1 (100%) |
| SHOULD-FIX | 3 | 3 (100%) |
| SUGGESTION | 4 | Deferred |

### Test Strategy Review
| Severity | Count | Resolved |
|----------|-------|----------|
| SHOULD-FIX | 5 | 5 (100%) |
| SUGGESTION | 2 | Deferred |

---

## Token & Time Consumption

| Agent | Role | Estimated Tokens | Duration |
|-------|------|-----------------|----------|
| team-lead | Orchestration, fixes, commit/push | ~60K input, ~10K output | Full session |
| designer (amend) | Budget + BYOK doc updates | ~100K input, ~8K output | ~10 min |
| reviewer (amend) | Budget/BYOK review | ~48K input, ~5K output | ~3 min |
| analyst | Test strategy | ~120K input, ~10K output | ~12 min |
| reviewer (Phase F) | Test strategy review | ~80K input, ~6K output | ~8 min |
| **Session total** | | **~408K input, ~39K output** | **~40 min** |

Estimated session cost: ~$15-18 (Opus agents)

---

## Next Session: Phase G (/cc-implement)

### Team RITCROPPERS — Dual Builder Configuration
| Teammate | Agent Type | Phases | Scope |
|----------|-----------|--------|-------|
| team-lead | orchestrator | G → I | Coordination |
| builder-backend | my-builder | 0→1→3→4→6 | CDK, auth middleware, budget service, API, chat |
| builder-frontend | my-builder | 2→5→6 | Auth screens, desktop layout, budget display |
| reviewer | my-reviewer | H + I | Code review, security audit, deploy gate |

### Implementation Phases (from EXECUTION-PLAN.md)
```
Phase 0: CDK + Cognito (builder-backend)
Phase 1: Auth Backend (builder-backend)
Phase 2: Auth Frontend (builder-frontend)  ← parallel after Phase 1
Phase 3: AI Chatbot (builder-backend)      ← parallel with Phase 2
Phase 4: Image Pipeline (builder-backend)  ← parallel with Phase 2-3
Phase 5: Desktop Responsive (builder-frontend) ← CSS-only, parallel
Phase 6: Integration & Deploy (both builders + reviewer)
```

Estimated: ~12 days with parallel builders (vs ~17 sequential).
