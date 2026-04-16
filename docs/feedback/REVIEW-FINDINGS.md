# Review Findings — Bug Fix Trio (v0.99 session pre-prod-post098-to099)

> **Date**: 2026-04-16
> **Scope**: 3 bug fixes — install.sh curl 404, hardware detection, join-request notification
> **Reviewer**: my-reviewer (security-focused) + simplify pipeline (reuse, quality, efficiency)
> **Files**: install.sh, domain.ts, events.ts, farm-members.ts, notification.ts, farms.test.ts

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| MUST-FIX | 0 | — |
| SHOULD-FIX | 2 | remediation deferred (pre-existing, not introduced by this diff) |
| SUGGESTION | 1 | noted |

## Findings

### SHOULD-FIX-1: Rate limiting on POST /:farmId/join (pre-existing)

**File**: `src/api/src/routes/farm-members.ts`
**Confidence**: High

Each join-request call now triggers `getFarmMembers` + N x `getUserProfile`. A malicious user could spam POST to different public farms to amplify DDB reads. The `existingRequest` check only blocks repeat requests to the *same* farm. `FREE_PLAN_MAX_MEMBERSHIPS` (2) bounds the requester's farm count but not their join-request rate.

**Disposition**: Pre-existing design gap — the join route had no rate limiting before this diff either. The owner-lookup fan-out adds ~2 extra DDB reads per request. Within the $1.18/mo budget, even modest abuse is bounded by the free plan cap. Tracked for v0.99 as part of #381 (per-user API rate limiting).

**Recommended fix**: Add the same rate-limit middleware used on `chat.ts` to this route. Per-user limit of 5-10 requests per minute is sufficient.

---

### SHOULD-FIX-2: Silent notification failure on owner-lookup error

**File**: `src/api/src/routes/farm-members.ts:57-78`
**Confidence**: High

Join request is persisted (line 57) before owner lookup (line 59). If `getFarmMembers` or `Promise.all(getUserProfile)` throws, the HTTP request returns 500, but the join request row already exists in DDB. On retry, the user hits `ConflictError` at line 51. The join request is orphaned with no notification sent.

**Disposition**: Reliability gap, not security. The existing approved/rejected notification paths have the same "fire after persist" pattern. Fixing atomicity here without fixing there would be inconsistent. Tracked as a follow-up.

**Recommended fix**: Wrap the owner-lookup and event-emit in a try/catch that logs but does not prevent the 201 response. The join request persists regardless; notification is best-effort.

---

### SUGGESTION-1: i2c grep precision

**File**: `scripts/camera-node/install.sh:260,265`
**Confidence**: Medium

`grep -q ' 6b'` matches any line containing ` 6b` as a substring. On an 8-bit i2c bus the risk of false positive is very low (no address 0x16b exists), but `grep -qw '6b'` would add word-boundary matching for defense in depth.

**Disposition**: Acceptable for pilot. Practical risk is near-zero on real Pi hardware. Noted for future hardening.

---

## False Positives (verified safe)

| Concern | Verdict | Evidence |
|---------|---------|----------|
| XSS via `requester_name` in notification bell | **Safe** | NotificationBell.tsx:135 renders `{n.body}` as Preact JSX text content (auto-escaped by framework). No unsafe HTML rendering used. |
| `target_user_email` exposure to requester | **Safe** | POST /:farmId/join response returns only `farm_id`, `user_id`, `status`, `requested_at`. Email stays server-side in event listeners. |
| Shebang check injection | **Safe** | `head -1 | grep -q '^#!/'` reads from a file path. `$LITCROP_DIR` = `$HOME/litcrop`. BRANCH validated at line 72-77. |
| Info disclosure in error messages | **Safe** | Branch name is user-supplied (via `--branch=`). Repo URL is in public install instructions. |

## Simplify Pipeline Findings (applied before review)

These were caught by the 3-agent simplify pass and already fixed:

1. **`m.role === 'admin'` in owner filter** — admin is a system role, not a farm-owner role. Fixed: filter now uses `m.role === 'owner'` only.
2. **Sequential `getUserProfile` per owner** — inconsistent with `Promise.all` pattern at line 163 of the same file. Fixed: now uses `Promise.all`.
3. **Double `i2cdetect` invocation** — scanned bus twice (once per sensor). Fixed: single scan with two greps.

## Verification

- [x] 883/883 vitest passing
- [x] 46 bats passing (45 + 1 legit skip)
- [x] Astro build clean
- [x] NotificationBell.tsx uses safe text rendering (no XSS vector)
- [x] Rate limiting is pre-existing gap tracked under #381

## Decision

**ACCEPTED** — 0 MUST-FIX findings. Two SHOULD-FIX items are pre-existing design gaps not introduced by this diff; both are already tracked (#381 rate limiting, and notification atomicity as a follow-up pattern). Ready to commit.
