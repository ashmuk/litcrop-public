# Review Findings -- Beta-6 Sprint (5 commits)

**Reviewer**: my-reviewer (Opus 4.6)
**Date**: 2026-04-03
**Branch**: `develop` (commits `1df7310..fd7e9dc`)
**Scope**: Promo code gate, role rename (#232), member promotion (#250), Pi scripts (#233), simplify fixes

---

## Summary

The Beta-6 sprint delivers five commits covering role rename, member promotion, Pi camera node setup, a promo-code registration gate, and post-simplify fixes. The role rename is thorough and consistent across 31+ files. The member promotion endpoint has correct authorization checks. The Pi scripts are a significant improvement over the previous version. Several security and quality issues require attention before production readiness.

| Severity | Count |
|----------|-------|
| **MUST-FIX** | 3 |
| **SHOULD-FIX** | 6 |
| **SUGGESTION** | 7 |

**Status: requires remediation** (3 MUST-FIX findings)

### Positives

- Role rename is comprehensive: types, schemas, API, frontend, tests, seed data, and migration script all updated consistently.
- `updateMemberRole` uses `TransactWriteCommand` for atomic dual-record updates -- good data integrity practice.
- The promotion endpoint correctly restricts to `staff -> owner` only and requires `admin` or `owner` access.
- The upload function properly hides the auth token from process lists using a curl config file (`-K`).
- The migration script supports `DRY_RUN=1` mode -- essential for safe production migration.
- Activity log subscription for `member.role_changed` is properly wired with typed event payload.

---

## Findings

| # | File:Line | Issue | Severity |
|---|-----------|-------|----------|
| 1 | `src/frontend/src/components/RegisterForm.tsx:57` | Promo code `LITCROP2026` is hardcoded in client-side JavaScript -- trivially extractable from the bundle | SHOULD-FIX |
| 2 | `scripts/camera-node/capture.sh:32-33` | `.env` file is sourced with `source "$ENV_FILE"` which executes arbitrary shell code, replacing the previous safe key=value parser | MUST-FIX |
| 3 | `scripts/camera-node/capture.sh:98` | `sed -i` writes refreshed JWT token into `.env` -- if the token contains the sed delimiter `\|` or special characters, the sed command will fail or corrupt the file | SHOULD-FIX |
| 4 | `scripts/camera-node/capture.sh:267` | Heartbeat sends `AUTH_TOKEN` via `-H` flag directly on command line, visible in `/proc/*/cmdline` -- inconsistent with upload which uses `-K` config file | SHOULD-FIX |
| 5 | `scripts/camera-node/capture.sh:264` | Heartbeat JSON payload constructed via string interpolation -- if `wifi_dbm` or `battery` contain unexpected values, the JSON is malformed | SHOULD-FIX |
| 6 | `scripts/camera-node/capture.sh:198` | `response_file=$(mktemp)` no longer has `chmod 600` (removed from old code) -- temp files may be world-readable depending on umask | SUGGESTION |
| 7 | `src/api/src/__tests__/routes/farms.test.ts` | Promotion endpoint has no test coverage -- zero tests for `PATCH /:farmId/members/:targetUserId` | MUST-FIX |
| 8 | `src/api/src/routes/farms.ts:670` | No guard preventing self-promotion -- an owner PATCHing themselves gets a confusing `ValidationError` ("Only staff can be promoted") instead of a clear message; cosmetic only since authorization prevents abuse | SUGGESTION |
| 9 | `src/frontend/src/components/ProfilePage.tsx:230-234` | `soleMemberFarms` filter includes `owner` role farms, but the variable name is now misleading -- it shows all admin+owner farms, not just sole-member farms | SUGGESTION |
| 10 | `scripts/camera-node/capture.sh:93` | Token refresh extracts `AccessToken` but the deleted `refresh-token.sh` documented that the API Gateway JWT authorizer requires `IdToken` (for `aud` claim); if true, the refreshed token will be silently rejected | MUST-FIX |
| 11 | `scripts/camera-node/install.sh:16` | `SCRIPT_DIR` fallback `\|\| echo "/tmp/litcrop-setup"` is fragile when script is piped from curl | SUGGESTION |
| 12 | `src/api/src/services/activity.ts:378-389` | `member.role_changed` activity record sets `target_name: ''` -- should look up target user's display name for consistency with other activity entries | SHOULD-FIX |
| 13 | `scripts/camera-node/capture.sh:112-113` | `poll_config` sends `AUTH_TOKEN` via `-H` flag on command line (same process-list exposure as F4) | SHOULD-FIX |
| 14 | `scripts/camera-node/capture.sh:80-90` | `refresh_token` sends `REFRESH_TOKEN` and `COGNITO_CLIENT_ID` in `-d` JSON body on command line -- visible in process list | SHOULD-FIX (grouped with F4, F13) |
| 15 | `scripts/migrate-roles.ts:33-37` | Migration script uses full table `Scan` -- acceptable for one-time use, but add a comment warning about cost/time on large tables | SUGGESTION |
| 16 | `src/frontend/src/components/RegisterForm.tsx:130-145` | Promo code validation timer reference is never cleared on component unmount -- minor memory leak | SUGGESTION |

---

## Detailed Recommendations

### F2 (MUST-FIX): .env source injection

The old `capture.sh` used a safe line-by-line parser with a `case` statement whitelist for known keys. The new version runs `source "$ENV_FILE"` which executes any shell command in the file. If the `.env` file is tampered with or downloaded from a compromised source, arbitrary code runs as the Pi user.

**Fix**: Validate the `.env` file format before sourcing:
```bash
# Validate: only lines matching 'export KEY=VALUE', comments, or empty
if grep -qvE '^\s*(#|$|export [A-Za-z_][A-Za-z_0-9]*=)' "$ENV_FILE"; then
    echo "[ERROR] Invalid .env format" >&2
    exit 1
fi
```
Or restore the safe key=value parser from the previous version.

### F7 (MUST-FIX): Missing promotion endpoint tests

The `PATCH /:farmId/members/:targetUserId` endpoint needs test coverage for at minimum:
- Happy path: admin/owner promotes staff to owner (expect 200)
- Staff user attempts promotion (expect 404 -- fails `assertFarmAccess`)
- Target is already an owner (expect 400 -- "Only staff members can be promoted")
- Target is not a member (expect 404)
- Role value is not `owner` (expect 400 -- "Only promotion to 'owner' is supported")
- Non-member caller (expect 404)

### F10 (MUST-FIX): AccessToken vs. IdToken mismatch

The deleted `refresh-token.sh` explicitly documented: "Uses IdToken (not AccessToken). The API Gateway JWT authorizer requires the `aud` claim which is only present in Cognito ID tokens."

The new `refresh_token()` function extracts `AccessToken`:
```bash
new_token=$(echo "$response" | grep -o '"AccessToken":"[^"]*"' | cut -d'"' -f4)
```

If the API Gateway JWT authorizer validates `IdToken`, this refreshed token will be rejected with 401 on every request after token expiry. **Verify** which token type the authorizer expects, then change the extraction accordingly:
```bash
# If IdToken is required:
new_token=$(echo "$response" | grep -o '"IdToken":"[^"]*"' | cut -d'"' -f4)
```

### F1 (SHOULD-FIX): Hardcoded promo code

The promo code `LITCROP2026` is in the client-side JavaScript bundle. While described as a "soft barrier" for beta, anyone can view source to extract it. Acceptable for beta if documented as intentional. For any meaningful barrier, move validation server-side to the `PATCH /me/profile` endpoint when `preferred_role === 'owner'`.

### F3 (SHOULD-FIX): sed delimiter collision on token write

JWT tokens can contain `/`, `+`, `=`. The sed command uses `|` as delimiter. A token containing `|` will break the replacement. Use `awk` instead (as the old `refresh-token.sh` did):
```bash
awk -v token="$new_token" '{
    if ($0 ~ /^export AUTH_TOKEN=/) print "export AUTH_TOKEN=\"" token "\""
    else print
}' "$ENV_FILE" > "${ENV_FILE}.tmp" && mv "${ENV_FILE}.tmp" "$ENV_FILE"
```

### F4, F13, F14 (SHOULD-FIX): Token exposure in process list

The heartbeat, config poll, and token refresh functions pass secrets via command-line arguments (`-H` and `-d` flags). On multi-user systems, `/proc/PID/cmdline` is world-readable and exposes these tokens. Use the same `-K` config file approach already used in the `upload()` function, or pipe sensitive data via stdin using `--data-binary @-`.

### F5 (SHOULD-FIX): Heartbeat JSON construction

```bash
local payload="{\"wifi_dbm\":${wifi_dbm},\"storage\":\"${storage}\",\"battery_pct\":${battery}}"
```
If `battery` reads from `/sys/class/power_supply/*/capacity` and gets an unexpected value (empty, multi-line, non-numeric), the JSON is malformed. Validate numeric values before interpolation, or use `jq` when available:
```bash
if command -v jq &>/dev/null; then
    payload=$(jq -nc --argjson w "${wifi_dbm:-null}" --arg s "$storage" --argjson b "${battery:-null}" \
        '{wifi_dbm:$w,storage:$s,battery_pct:$b}')
fi
```

### F12 (SHOULD-FIX): Empty target_name in role_changed activity

The `fromPayload` handler for `member.role_changed` sets `target_name: ''`. Other handlers like `member.removed` include the target user's display name. Look up the target user's profile in the route handler and include their name in the event payload for consistent activity log readability.

---

## Alignment Check

| Requirement | Status | Notes |
|-------------|--------|-------|
| #232: Rename manager/observer to owner/staff | PASS | Comprehensive across types, schemas, API, frontend, tests, seed, migration |
| #250: Owner can promote staff | PARTIAL | Endpoint logic correct but has zero test coverage (F7) |
| #233: Pi setup with config polling/heartbeat | PARTIAL | Functional but has security regressions: source injection (F2), token type mismatch (F10) |
| Promo code gate | PASS | Works as soft barrier; hardcoded code is acceptable for beta if intentional |
| Simplify fixes | PASS | Activity subscription, soleMemberFarms filter, stale comment cleanup |

---

## Verification Needed

- [ ] Confirm whether API Gateway JWT authorizer expects `IdToken` or `AccessToken` (determines severity of F10)
- [ ] Run `npm test` / `vitest` to verify all existing tests pass with role rename changes
- [ ] Add promotion endpoint tests (F7)
- [ ] Test `capture.sh` on actual Pi hardware with token refresh flow
- [ ] Validate `.env` source safety with a file containing shell metacharacters
- [ ] Run `migrate-roles.ts` with `DRY_RUN=1` against staging data before live migration

---

## Safety Assessment

No destructive or irreversible operations in this changeset. The migration script (`migrate-roles.ts`) modifies DynamoDB records in-place but supports `DRY_RUN=1` mode. The role rename is a breaking change for any existing data -- the migration script must be run before deploying the API changes.

**Migration order**: (1) Deploy migration script, (2) Run with `DRY_RUN=1` to verify, (3) Run live, (4) Deploy API + frontend.

---

**Recommendation**: Address the 3 MUST-FIX items before merging to `main`. The SHOULD-FIX items should be addressed before production but do not block the `develop` integration.

*Review completed: 2026-04-03 | Status: requires remediation*
