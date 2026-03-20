# REVIEW-FINDINGS.md

> **Reviewer**: my-reviewer | **Date**: 2026-03-20
> **Scope**: Design document amendments -- MVP Token Budget Controls + [Production] BYOK
> **Branch**: `develop` (unstaged changes)
> **Verdict**: **CONDITIONAL PASS** -- 1 MUST-FIX, 3 SHOULD-FIX, 4 SUGGESTIONS

---

## Findings

| # | File:Line | Issue | Severity |
|---|-----------|-------|----------|
| 1 | `docs/ARCHITECTURE.md:532` vs `:548` | Haiku pricing inconsistency: External API Costs says ~$0.25/1M input, $1.25/1M output; Budget Controls says ~$0.80/MTok input, ~$4.00/MTok output. 3-4x discrepancy. | **MUST-FIX** |
| 2 | `docs/ARCHITECTURE.md:550` | `retry_after` field referenced but API-CONTRACTS.md error shape uses `reset_at` inside `details`. Field name mismatch. | **SHOULD-FIX** |
| 3 | `docs/API-CONTRACTS.md:1192-1196` | BUDGET_EXCEEDED detail fields use `daily_input_used` / `daily_output_used` naming, but UsageResponse uses `input_tokens_used` / `output_tokens_used`. Inconsistent naming convention. | **SHOULD-FIX** |
| 4 | `docs/UX-DESIGNS.md:1069` | Usage bar only shows input tokens (`input_tokens_used / input_tokens_limit`). Output budget (10K) is 5x tighter than input (50K) and could exhaust first, surprising the user. | **SHOULD-FIX** |
| 5 | `docs/SYSTEM-DESIGN.md:599-602` | Budget check uses two sequential GetItem calls (user + global). BatchGetItem would halve latency. | SUGGESTION |
| 6 | `docs/SYSTEM-DESIGN.md:812` | UsageBudget TTL comment "48h from date start" could be clearer about the buffer purpose. | SUGGESTION |
| 7 | `packages/shared/src/schemas/index.ts:311-313` | `period_start` and `reset_at` are `z.string()` but represent ISO 8601. Consider `z.string().datetime()`. | SUGGESTION |
| 8 | `docs/API-CONTRACTS.md:1282` | BYOK key regex `/^sk-ant-[a-zA-Z0-9_-]{80,120}$/` may be too rigid if Anthropic changes key format. Server-side validation is the real check. | SUGGESTION |

---

## Cross-Document Consistency Check

| Check | Status | Notes |
|-------|--------|-------|
| Budget limits (50K/10K user, 500K/100K global) | PASS | Consistent across ARCHITECTURE, API-CONTRACTS, SYSTEM-DESIGN |
| 20-turn conversation limit | PASS | ARCHITECTURE.md and API-CONTRACTS.md agree |
| Model ID `claude-haiku-4-5-20251001` | PASS | All docs use same model string |
| Error codes (BUDGET_EXCEEDED, RATE_LIMITED) | PASS | All docs use same codes |
| UsageResponse shape (API-CONTRACTS / SYSTEM-DESIGN / Zod) | PASS | All three aligned (8 fields, same nesting) |
| Haiku pricing figures | **FAIL** | See Finding #1 |
| BYOK items all tagged [Production] | PASS | Section 5.13, 9.4b, scope table, deferred table all tagged |
| `retry_after` vs `reset_at` naming | **FAIL** | See Finding #2 |

## Budget Math Verification

Using the **higher** Haiku 4.5 pricing ($0.80/MTok input, $4.00/MTok output) from the Budget Controls section:

- 15 users x ~6.7 messages/user/day = 100 messages/day
- 100 messages x 1,500 input tokens = 150,000 input tokens/day = $0.12/day
- 100 messages x 300 output tokens = 30,000 output tokens/day = $0.12/day
- Daily total: ~$0.24/day, ~$7.20/month

The doc states $0.27/day ($8/month) -- close enough (rounding). The math is reasonable.

**Worst-case (all budgets maxed daily):**
- Global: 500K input + 100K output = $0.40 + $0.40 = $0.80/day = $24/month

The doc claims "budget controls cap worst-case at ~$15/month" -- this underestimates. At the higher pricing, maxing global limits daily would cost ~$24/month. At the lower pricing ($0.25/$1.25), it would be ~$0.25/day = $7.50/month. This discrepancy stems from Finding #1. Once pricing is reconciled, the worst-case claim must be recalculated.

## Security Review (BYOK)

| Check | Status | Notes |
|-------|--------|-------|
| Key encrypted at rest (KMS) | PASS | Documented in API-CONTRACTS.md storage section |
| Key never returned in full | PASS | Only `key_hint` (last 4 chars) returned |
| Key validated before storage | PASS | Server calls Anthropic `/v1/models` |
| Key stored with clear PK/SK | PASS | `PK=USER#{userId} SK=SETTINGS#API_KEY` |
| `resolveApiKey` optional (Production) | PASS | Marked with `?` in IBudgetService |
| No key material in logs | Not documented | Recommend adding explicit note that API keys must never appear in logs |

## Scope Tagging Verification

| Item | Expected | Actual | Status |
|------|----------|--------|--------|
| PUT /api/v1/settings/api-key | [Production] | [Production] | PASS |
| DELETE /api/v1/settings/api-key | [Production] | [Production] | PASS |
| UX 9.4b API Key Settings | [Production] | [Production] | PASS |
| resolveApiKey in IBudgetService | [Production] | [Production] (comment) | PASS |
| BYOK in scope progression table | Production column | Production column | PASS |
| GET /api/v1/usage | [MVP] | [MVP] | PASS |
| Budget controls (all) | [MVP] | [MVP] | PASS |
| No MVP scope creep from BYOK | -- | -- | PASS |

## DynamoDB Design Review

| Aspect | Assessment |
|--------|-----------|
| PK/SK pattern (`USAGE#{userId}`, `DAY#{date}`) | Sensible, follows single-table design. `USAGE#GLOBAL` for aggregate is clean. |
| TTL (48h) | Appropriate -- full buffer day after budget day ends. Auto-cleanup by DynamoDB. |
| Atomic ADD operations | Correct for concurrent counter updates. Avoids read-modify-write races. |
| Hot partition risk | Low at 15 users. `USAGE#GLOBAL` is a single item updated on every chat -- acceptable at MVP scale but would need sharding at Production. |

## API Contract Completeness

| Aspect | Status |
|--------|--------|
| Error codes documented | PASS |
| Response shapes with types | PASS |
| Budget error response shape | PASS |
| HTTP `Retry-After` header on 429 | Not documented -- standard practice, consider adding |
| UsageResponse for GET /api/v1/usage | PASS |
| Endpoint added to summary table | PASS |
| BYOK endpoints (PUT/DELETE) | PASS |

## Doc Integration Quality

All amendments integrate naturally into existing section structures:
- ARCHITECTURE.md: Budget controls table placed after cost analysis (logical flow)
- API-CONTRACTS.md: Section numbering (5.12, 5.13) follows established pattern
- SYSTEM-DESIGN.md: UsageBudget entity near ConversationMessage; IBudgetService near IChatService
- UX-DESIGNS.md: 9.4a/9.4b sub-sections under existing Settings (9.4)
- Zod schema appended after ChatResponseSchema, following same comment style

---

## Recommendations

### MUST-FIX

**Finding #1 -- Reconcile Haiku pricing**: Determine the correct Haiku 4.5 pricing and update both sections of ARCHITECTURE.md to use the same figures. Recalculate the worst-case budget cap. The External API Costs section (line 532) says $0.25/$1.25; the Budget Controls section (line 548) says $0.80/$4.00. One set is wrong. After reconciliation, verify the "$15/month worst case" claim.

### SHOULD-FIX

**Finding #2 -- Align retry_after vs reset_at**: In ARCHITECTURE.md line 550, change `retry_after` to `reset_at` to match the API-CONTRACTS.md error response shape. Optionally, also document an HTTP `Retry-After` header (seconds until midnight UTC) on 429 responses.

**Finding #3 -- Align error detail field names with UsageResponse**: In the BUDGET_EXCEEDED error details (API-CONTRACTS.md lines 1192-1196), rename `daily_input_used` to `input_tokens_used`, `daily_output_used` to `output_tokens_used`, `daily_input_limit` to `input_tokens_limit`, `daily_output_limit` to `output_tokens_limit`. This aligns with the UsageResponse field names used everywhere else.

**Finding #4 -- Usage bar should reflect both token types**: Update UX-DESIGNS.md 9.4a to show whichever budget is closer to exhaustion: "Usage bar shows `max(input_pct, output_pct)` where `pct = tokens_used / tokens_limit * 100`." Alternatively, show two separate bars for input and output.

### SUGGESTIONS

**Finding #5**: Note BatchGetItem as an implementation optimization in the sequence diagram comment.

**Finding #6**: Clarify TTL buffer: "TTL: 48h from date start (keeps counters readable for one day after budget period ends)."

**Finding #7**: Consider `z.string().datetime()` for ISO 8601 fields. Consistent with existing patterns (other schemas use `z.string()`), so this is optional.

**Finding #8**: Relax BYOK regex to `/^sk-ant-.{20,200}$/` since server-side Anthropic API validation is the authoritative check.

---

## Verdict

**CONDITIONAL PASS**

The design amendments are well-structured, internally consistent on scope tagging and budget limits, and integrate cleanly into existing documents. The Zod schema aligns with the API contract. BYOK is properly scoped to [Production] with no MVP scope creep. DynamoDB design is appropriate for MVP scale. The sequence diagram correctly shows budget check before LLM call and counter update after.

**Blocking issue**: The Haiku pricing inconsistency (Finding #1) undermines the cost analysis that justifies the $5/month budget constraint. The worst-case cap claim ($15/month) cannot be verified until pricing is reconciled.

**Non-blocking issues**: Three SHOULD-FIX items are naming/UX consistency issues that should be resolved before implementation to avoid confusion during coding.

Once Finding #1 is resolved with reconciled pricing figures, this review can be upgraded to **PASS**.
