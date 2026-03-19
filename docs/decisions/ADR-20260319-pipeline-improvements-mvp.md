# ADR-20260319: Pipeline Improvements for MVP

## Status
Accepted

## Context
The PoC was built using a 9-step AI-assisted pipeline (`/cc-define` → `/cc-design` × 6 → `/cc-implement` → `/cc-test` → `/cc-review` → `/cc-remediate` → `/simplify` → `/cc-deploy`) across 4 sessions (~9h 05min, ~$37.40 in AI token cost). While the pipeline delivered a working PoC that passed all 6 exit criteria, the retrospective (`REPORT_POC.md`) revealed five systematic timing and coordination gaps that should be addressed before MVP.

### Decision Drivers
- **Feedback loop speed**: The PoC pipeline had a ~9-hour feedback loop (implement all → review → find bugs). Shorter loops catch issues before they compound.
- **Cost efficiency**: v0.7 spent ~$9.00 (Opus) on 6 mechanical UX fixes that Sonnet agents handle at 30-40% of the cost.
- **Traceability**: Post-deploy feedback items were tracked in a Markdown doc, not GitHub Issues, reducing visibility and linkability.
- **Agent coordination**: Field-name drift between parallel agents (MF-2..MF-4) was the biggest systemic code quality issue.
- **Deployment reliability**: Ad-hoc post-deploy testing missed endpoints and locales.

## Decision

Adopt five pipeline changes for MVP development:

### 1. Per-Phase `/simplify` (was: end-of-project)

**PoC behavior**: `/simplify` ran once after all 39 tasks were complete, scanning ~21k lines. Found 12 issues including duplicated helpers that existed since Phase 3.

**MVP behavior**: Run `/simplify` at each implementation phase boundary.

```
Phase N agents build → commit → /simplify → commit cleanup → Phase N+1
```

**Rationale**: Duplication introduced in Phase 3 (`makeLatestImage` in both `farms.ts` and `plots.ts`) was built upon by Phase 4 agents. Catching it at the Phase 3 boundary prevents downstream code from depending on the duplicated version. Cost: ~$1-2 per run (Sonnet agent), saving refactoring effort later.

**When to skip**: If a phase produces fewer than 3 files or < 200 lines of new code, the `/simplify` pass is unlikely to find meaningful improvements.

### 2. Issue-First Rule for All Feedback

**PoC behavior**: Post-deploy feedback was recorded in `FEEDBACK_POC_POST_DEPLOY.md`. GitHub issues were created during or after fixes. Deferred items (F-08..F-14) had no issues until manually created later.

**MVP behavior**: Create a GitHub issue immediately when any feedback item is identified — before deciding whether to fix or defer.

```
User reports problem
  → /cc-issue-create (with milestone + labels + severity)
  → THEN decide: fix now or defer
  → If fix now: branch from issue, PR references issue (fixes #N)
  → If defer: issue stays open, tagged with target milestone
```

**Rationale**: When the feedback doc is the primary tracker, knowledge is locked in a file only the current conversation context can access. GitHub Issues provide:
- Queryable backlog (`gh issue list --milestone MVP`)
- PR linkage (automatic closure via `fixes #N`)
- Cross-session visibility (new conversation can read issue state)
- Assignability (to human or agent)

The feedback doc continues to exist as a narrative summary with issue cross-references, not as the source of truth for work tracking.

### 3. Contract Tests Gate Each Implementation Phase

**PoC behavior**: The `/cc-test` step planned 115 tests (168 were written) but none validated that actual route JSON responses conform to `@litcrop/shared` TypeScript types. The `/cc-review` step caught 4 MUST-FIX field-name mismatches (MF-1..MF-4) that would have been caught earlier by contract tests.

**MVP behavior**: Add contract tests (Zod schema or JSON snapshot validation) and run them as a gate after each implementation phase.

```
Phase N agents build → commit → run contract tests → PASS → Phase N+1
                                                    → FAIL → fix in Phase N before proceeding
```

**Contract test pattern** (example):
```typescript
import { FarmResponseSchema } from '@litcrop/shared/schemas';

test('GET /farms/:farmId response matches shared type', async () => {
  const res = await app.request('/api/v1/farms/FARM-001');
  const body = await res.json();
  expect(() => FarmResponseSchema.parse(body)).not.toThrow();
});
```

**Rationale**: Field-name drift between agents was the root cause of all 4 MUST-FIX bugs. Each contract test is ~5 lines. Running 11 contract tests (one per endpoint) after Phase 3 would have caught MF-2..MF-4 immediately — saving the full review → remediate cycle for those findings (~$4-5 in tokens, ~30 min wall clock).

**Integration with `/cc-test`**: The `/cc-test` strategy should explicitly include a "Contract Tests" section that maps each API endpoint to its shared type and specifies the validation approach (Zod parse, JSON snapshot, or structural match).

### 4. Structured Deploy Verification Checklist

**PoC behavior**: v0.6 deployment verified exit criteria (EC-1..EC-6) but didn't test the tag endpoint, chat UI, or Japanese locale via the live frontend. Six UX issues were discovered during ad-hoc v0.7 testing.

**MVP behavior**: `/cc-deploy` outputs a verification checklist. A Sonnet agent (or human) executes it before the deploy is considered complete.

**Standard checklist template**:
```markdown
## Deploy Verification — [version]

### API Endpoints
- [ ] GET /farms/:farmId — 200, response shape matches FarmResponse
- [ ] GET /farms/:farmId/plots — 200, array with bed_id/field_id
- [ ] GET /plots/:plotId — 200, includes latest_image
- [ ] GET /plots/:plotId/images — 200, paginated, newest-first
- [ ] POST /images/upload — 201, multipart with JPEG
- [ ] POST /images/:imageId/tags — 201, status propagates
- [ ] GET /weather/:farmId — 200, conditions translated
- [ ] PATCH /farms/:farmId — 200, fields updated
- [ ] POST /chat — 200 (stub or live)

### Frontend Pages (per locale: EN, JA)
- [ ] Crops page — farm name in header, plots listed
- [ ] Plot Detail — hero image, tags, weather strip
- [ ] Image Timeline — chronological, tap to view
- [ ] Farm Layout — fields → beds → plots render correctly
- [ ] Weather — conditions translated, no overflow at 375px
- [ ] Profile — farm name, GPS, climate zone
- [ ] Settings — theme/locale/temp-unit persist across navigation

### Cross-Cutting
- [ ] Mobile (375px) — no layout overflow or clipping
- [ ] Desktop (1024px+) — renders appropriately (MVP: responsive)
- [ ] Console — no JavaScript errors on any page
- [ ] i18n — no hardcoded English strings visible in JA mode
```

**Rationale**: The v0.7 session's $9 cost was partly Opus doing manual exploratory testing. A checklist makes verification systematic and delegable. It also prevents the "forgot to test the tag endpoint" gap from v0.6.

**Automation path**: At MVP, consider a Playwright smoke test script that automates the API endpoint checks and basic page-load assertions. The frontend checks (visual overflow, i18n completeness) may remain manual initially.

### 5. Delegate Size:S Fixes to Sonnet Agents

**PoC behavior**: v0.7 used Opus (team lead) directly for 6 small UX fixes. Total session cost: ~$9.00. The fixes were mechanical: rename strings, add i18n keys, read localStorage, apply `formatTemp()`.

**MVP behavior**: For any fix rated `size:S` or clearly mechanical:

```
Opus: creates issue with acceptance criteria + technical notes
  → Sonnet (my-builder): implements the fix, creates PR
  → Opus: reviews the diff (< 1 min)
```

**Cost comparison**:
| Approach | Per fix (est.) | 6 fixes |
|----------|---------------|---------|
| Opus direct | ~$1.50 | ~$9.00 |
| Sonnet + Opus review | ~$0.50-0.70 | ~$3.00-4.20 |
| **Savings** | | **~$5-6 (~55%)** |

**When NOT to delegate**: Fixes that require architectural judgment, cross-package coordination, or touch security-sensitive code (auth, IAM, secrets) should stay with Opus.

**Rationale**: Sonnet agents are fully capable of mechanical code changes when given clear acceptance criteria. The Opus team lead's value is in coordination, judgment, and review — not in typing `git commit` for a string rename.

## Consequences

### Positive
- Shorter feedback loops catch drift before it compounds (hours → minutes)
- Every work item is trackable in GitHub Issues from discovery
- Contract tests prevent the class of bug that caused 4/4 MUST-FIX findings
- Deploy verification becomes systematic and repeatable
- ~50% cost reduction on mechanical fixes

### Negative
- Per-phase `/simplify` adds ~$2-4 total cost across a multi-phase implementation (offset by reduced rework)
- Issue-first rule adds friction to "quick fix" workflows (offset by traceability)
- Contract tests require maintaining Zod schemas or snapshots alongside TypeScript types (offset by catching drift)

### Neutral
- Pipeline becomes more structured, which suits team/agent coordination but may feel heavyweight for solo sessions

## Revised Pipeline Flow

```
PoC Pipeline (linear):
  define → design → implement(all) → test → review → remediate
    → simplify → deploy → ad-hoc-fixes

MVP Pipeline (per-phase with gates):
  define → design → [per-phase loop]:
    implement(phase N)
      → contract tests (gate)
      → /simplify
      → commit
  → test (full suite)
  → review → remediate
  → deploy
    → verify (checklist)
    → issue-create (any findings)
    → [fix loop]: issue → branch → Sonnet fix → Opus review → merge
```

## Related

- `REPORT_POC.md` §7 (Pipeline Effectiveness) — source analysis
- `REPORT_POC.md` §10 (Lessons Learned) — source recommendations
- `FEEDBACK_POC_POST_DEPLOY.md` — post-deploy feedback tracking
- `REVIEW-FINDINGS.md` — MF-1..MF-4 field-name drift findings
- Future: ADR-007 (Authentication), ADR-008 (IaC), ADR-009 (AI/LLM framework)
