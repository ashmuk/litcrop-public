# Review Findings — Beta-4 Design Documents

> Reviewed: 2026-04-01 | Reviewer: cc-review (3 parallel agents)
> Scope: BETA4-CHANGE-PASSWORD.md, BETA4-DELETE-ACCOUNT.md, BETA4-EMAIL-NOTIFICATIONS.md, BETA4-ACTIVITY-LOG.md, ADR-20260401-notification-architecture.md

---

## Summary

| Severity | Count |
|----------|-------|
| **MUST-FIX** | 5 |
| **SHOULD-FIX** | 8 |
| **SUGGESTION** | 9 |

**Status: needs-remediation** (5 MUST-FIX findings)

---

## MUST-FIX

### MF-1. AccessToken gap blocks Wave 0 + Wave 1 (Cross-wave)

**Affected**: BETA4-CHANGE-PASSWORD.md, BETA4-DELETE-ACCOUNT.md
**Evidence**: `src/frontend/src/lib/auth.ts:218-220` — `setTokens(result.IdToken, ...)` discards `result.AccessToken`. `tryRefresh()` at line 132 also stores only IdToken.

Both Wave 0 (`ChangePassword`) and Wave 1 (`DeleteUser`) require the real Cognito AccessToken. The Wave 0 doc correctly identifies this gap and proposes storing both tokens. The Wave 1 doc references the Cognito `DeleteUser` action with an AccessToken but does not explicitly declare the Wave 0 fix as a **prerequisite dependency**.

**Fix**: Wave 1 doc must add an explicit prerequisite: "Requires Wave 0's AccessToken fix in auth.ts before the Cognito DeleteUser step can function."

### MF-2. TTL attribute name mismatch — uppercase vs lowercase (Wave 3 + existing bug)

**Affected**: BETA4-ACTIVITY-LOG.md line 145
**Evidence**: CDK stack `infra/lib/litcrop-stack.ts:84` defines `timeToLiveAttribute: 'TTL'` (uppercase). The activity log design uses lowercase `ttl`. DynamoDB TTL matching is case-sensitive — items written with `ttl` will **never expire**.

**Pre-existing bug**: `budget.ts:168` and `dynamodb.ts:852` also write lowercase `ttl`, meaning existing CONV# and budget items are silently never expiring.

**Fix**: Activity log design must use uppercase `TTL`. File a separate bug for the existing codebase mismatch.

### MF-3. Variable shadowing in activity route code sample (Wave 3)

**Affected**: BETA4-ACTIVITY-LOG.md line 369 vs 381
**Evidence**: `const result = requireAdmin(c)` at line 369, then `const result = await queryActivities(...)` at line 381. This is a `const` redeclaration error.

**Fix**: Rename the second to `const data = await queryActivities(...)`.

### MF-4. Event catalog mismatch — Wave 3 references 14 events, Wave 2 defines only 7 (Cross-wave)

**Affected**: BETA4-ACTIVITY-LOG.md lines 523-543, BETA4-EMAIL-NOTIFICATIONS.md AppEventMap
**Evidence**: Wave 3 lists 14 event types including `farm.updated`, `bed.updated`, `image.uploaded`, `tag.created`, `member.joined`, `member.removed`, `member.role_changed`, etc. Wave 2's `AppEventMap` only defines 7 events. The additional 7 have no typed payload, no emission point, and no `AppEventMap` entry.

Also: Wave 3 uses `join_request.created` but Wave 2 uses `join_request.submitted` — name mismatch for the same event.

**Fix**: Either (a) expand Wave 2's `AppEventMap` to include all 14 events with typed payloads and emission points, or (b) split into "Wave 2 events" (7) and "Wave 3 additions" (7) with explicit payload definitions in the Wave 3 doc. Align `join_request.created` → `join_request.submitted`.

### MF-5. i18n key count discrepancy (Wave 0)

**Affected**: BETA4-CHANGE-PASSWORD.md section 5.1
**Evidence**: Doc claims "6 new keys" but lists 8: `profile.change_password`, `profile.password_changed`, `auth.password.current`, `auth.password.current_placeholder`, `auth.errors.wrong_current_password`, `auth.errors.password_reset_required`, `auth.errors.new_password_same`, `auth.errors.fields_required`.

**Fix**: Update count from 6 to 8.

---

## SHOULD-FIX

### SF-1. Orphaned images when sole-member farm is deleted (Wave 1)

**Affected**: BETA4-DELETE-ACCOUNT.md cascade checklist
**Evidence**: `deleteFarm()` at `dynamodb.ts:866` explicitly notes "Images are NOT deleted." Images use PK=`BED#{bedId}`, not `FARM#{farmId}`, so they survive farm deletion. When a sole-member farm is deleted via the account deletion cascade, images under those beds are orphaned (no PII, but storage cost).

**Fix**: Add a row to the cascade checklist documenting that images are bed-owned, intentionally retained (no PII), and orphaned on sole-member farm deletion.

### SF-2. Admin transfer atomicity gap (Wave 1)

**Affected**: BETA4-DELETE-ACCOUNT.md lines 276-286
**Evidence**: `updateMemberRole()` + `removeFarmMember()` are two separate operations. If failure occurs between them, the farm temporarily has two admins or the user is removed before the successor is promoted.

**Fix**: Either (a) use `TransactWriteCommand` to make the transfer atomic, or (b) document as accepted risk at MVP scale.

### SF-3. Session expiry vs wrong password ambiguity (Wave 0)

**Affected**: BETA4-CHANGE-PASSWORD.md section 4.3
**Evidence**: `NotAuthorizedException` covers both "wrong current password" and "expired/revoked token." The i18n message says "Current password is incorrect" — misleading when the real cause is session expiry.

**Fix**: Before calling `changePassword()`, check if `getCognitoAccessToken()` returns null. If so, show session-expired message and redirect to `/login/`, matching RegisterForm's existing pattern.

### SF-4. Lambda fire-and-forget may lose emails (Wave 2)

**Affected**: BETA4-EMAIL-NOTIFICATIONS.md lines 402-413
**Evidence**: `emit()` creates a microtask; the SES call is a floating promise. After Lambda returns the HTTP response, the execution context freezes. In-flight async work (SES send) may not complete.

**Fix**: Add a "Lambda Execution Model" section documenting the accepted risk (~5-10% email loss). Suggest future mitigation: await the SES call or switch to SNS. Add a CloudWatch metric for send failures.

### SF-5. IAM condition uses synth-time env var (Wave 2)

**Affected**: BETA4-EMAIL-NOTIFICATIONS.md lines 273-282
**Evidence**: `ses:FromAddress` condition resolves `process.env['SES_FROM_EMAIL']` at CDK synth time. If unset during CI/CD, the policy effectively denies all SES calls.

**Fix**: Add a guard (e.g., `if (!sesFromEmail) throw new Error(...)`) or use an SSM parameter reference.

### SF-6. CDK-Nag will flag SES wildcard resource (Wave 2)

**Affected**: BETA4-EMAIL-NOTIFICATIONS.md lines 286-293
**Evidence**: SES `SendEmail` doesn't support resource-level ARNs, requiring `resources: ['*']`. The doc claims no NagSuppression is needed, but `AwsSolutions-IAM5` flags literal wildcards regardless of condition keys.

**Fix**: Add a `NagSuppression` entry: "SES SendEmail does not support resource-level ARN restrictions; scoped by ses:FromAddress condition key."

### SF-7. Tab count disagreement between Wave 2 and Wave 3

**Affected**: BETA4-EMAIL-NOTIFICATIONS.md, BETA4-ACTIVITY-LOG.md
**Evidence**: Wave 2 proposes a 4th "Notifications" tab. Wave 3 proposes a 4th "Activity" tab. Both as tab #4, resulting in 5 total tabs if both are implemented.

**Fix**: Agree on final tab order. Suggested: System, Users, Farms, Activity, Notifications (or fold notification prefs into a Settings sub-section of System tab).

### SF-8. Session expiry during password change under-specified (Wave 0)

**Affected**: BETA4-CHANGE-PASSWORD.md sections 4.2, 7
**Evidence**: Test plan mentions token expiry but the design doesn't specify the UX behavior. Should show `auth.session_expired` and redirect to `/login/` after 2 seconds.

**Fix**: Add a paragraph specifying this behavior explicitly.

---

## SUGGESTION

| # | Wave | Issue |
|---|------|-------|
| S-1 | W0 | Line number citation "lines 16-36 for logic" should be "lines 19-37" |
| S-2 | W0 | Document that Cognito doesn't enforce password history (users can revert to old passwords) |
| S-3 | W0 | Add a backlog issue reference for the eventual `getAccessToken()` rename |
| S-4 | W0 | Note that ChangePasswordSection introduces a new disclosure widget pattern (no existing collapsible on ProfilePage) |
| S-5 | W0 | Note that `REFRESH_TOKEN_AUTH` does not return a new RefreshToken |
| S-6 | W1 | Verify actual TTL value on CONV# items (claimed 24h) |
| S-7 | W1 | ProfilePage line number references (569, 655) should be treated as approximate |
| S-8 | W1 | Document that dangling Cognito identity (browser closed before DeleteUser) is accepted tech debt |
| S-9 | W3 | Add note: "Primary table PK is for writes/TTL only; GSI2 is for all reads" |

---

## Positive Notes

- AccessToken gap analysis in Wave 0 is thorough and correctly identifies the root cause
- DynamoDB PK/SK patterns, method signatures, and cascade logic verified accurate across all docs
- GSI2 "unused" claim confirmed correct — zero references in application code, safe to repurpose
- CDK password policy, Cognito API specs, and admin middleware patterns all verified
- Notification preferences entity (`#NOTIFICATION_PREFS`) has no key collisions
- Cost impact analysis is sound — all within free tier / $5 ceiling
- ADR reasoning for Option A (SES direct) is well-justified at project scale

---

## Pre-existing Bug Discovered

**TTL attribute case mismatch**: CDK defines `timeToLiveAttribute: 'TTL'` (uppercase) but `dynamodb.ts:852` and `budget.ts:168` write lowercase `ttl`. Existing CONV# and budget items are silently never expiring. This should be filed as a separate bug fix independent of Beta-4.

---

## Next Steps

1. **Remediate MUST-FIX findings** via `/cc-remediate`
2. SHOULD-FIX items should be addressed during remediation where straightforward
3. SUGGESTION items are at implementer discretion
4. File separate bug for pre-existing TTL case mismatch
