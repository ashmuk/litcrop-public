# REQUIREMENTS — #341 Heartbeat Auth + Env Mismatch

**Issue**: [#341 bug(device): heartbeat auth mismatch — capture.sh uses Bearer JWT but API expects X-Device-Key](https://github.com/ashmuk/litcrop/issues/341)
**Priority**: HIGH
**Sprint**: Beta-11 (Batch B — final item)
**Define date**: 2026-04-10
**Target tag**: v0.50

---

## TL;DR

`capture.sh` has **never worked end-to-end** when configured via the web UI.
Two independent bugs compound:

1. The downloaded `.env` file is missing fields the script requires, and every
   field that is present uses a `LITCROP_*` prefix the parser doesn't recognize.
2. The device endpoints use **dual auth** (JWT + `X-Device-Key`), but
   `capture.sh` only sends JWT.

The memory was mostly correct but under-counted Layer A and over-counted
Layer C. This document supersedes the memory.

---

## Current State (Broken)

### What the frontend writes to `litcrop-{deviceId}.env`

`src/frontend/src/components/DeviceRegisterForm.tsx:244-251` downloads:

```
export LITCROP_DEVICE_ID=<deviceId>
export LITCROP_API_KEY=<device_api_key>
export LITCROP_CONFIG_URL=<full config poll URL>
export LITCROP_REFRESH_TOKEN=<cognito refresh token>
export LITCROP_COGNITO_CLIENT_ID=<client id>
export LITCROP_COGNITO_REGION=ap-northeast-1
```

**Missing**: `BED_ID`, `API_BASE_URL`.

### What `capture.sh` parser accepts

`scripts/camera-node/capture.sh:41-48`:

```bash
case "$key" in
    DEVICE_ID|BED_ID|API_BASE_URL|AUTH_TOKEN|NODE_ID|TRIGGER|\
    CAPTURE_WIDTH|CAPTURE_HEIGHT|JPEG_QUALITY|INTERVAL_SECONDS|\
    MAX_RETRY|REFRESH_TOKEN|COGNITO_CLIENT_ID|AWS_REGION)
        export "$key=$value"
        ;;
esac
```

Every key in the downloaded .env is `LITCROP_*`-prefixed. Not one matches
the case statement. All values are silently dropped. There is no
`DEVICE_API_KEY` slot in the case statement at all.

### Validation gate

`capture.sh:52-57`:

```bash
for var in DEVICE_ID BED_ID API_BASE_URL AUTH_TOKEN; do
    if [ -z "${!var:-}" ]; then
        echo "[ERROR] ${var} is required. Check ${ENV_FILE}" >&2
        exit 1
    fi
done
```

With the downloaded .env, **every one of these four variables is unset**.
`capture.sh` exits immediately with `[ERROR] DEVICE_ID is required`.

### What the API actually requires

`src/api/src/app.ts:137-138` mounts JWT auth on all device endpoints:
```ts
app.use('/api/v1/devices', authMiddleware);
app.use('/api/v1/devices/*', authMiddleware);
```

Then `src/api/src/routes/devices.ts:230, 262` additionally requires an
`X-Device-Key` header in the route handler:

```ts
const headerKey = c.req.header('X-Device-Key') ?? '';
if (!headerKey) {
  return c.json({ error: { code: 'UNAUTHORIZED', message: 'X-Device-Key header required' } }, 401);
}
const { valid, device } = await verifyDeviceKey(deviceId, headerKey);
```

→ **Dual-auth pattern**: both JWT (via `authMiddleware`) AND `X-Device-Key`
   (via in-route check) required on `GET /config` and `POST /heartbeat`.

### What `capture.sh` sends

`capture.sh:144, 233, 331` — all three endpoint calls (`poll_config`,
`upload`, `send_heartbeat`) use:

```bash
printf 'header = "Authorization: Bearer %s"\n' "$AUTH_TOKEN" > "$curl_cfg"
```

Only the JWT. No `X-Device-Key`. **Config poll and heartbeat both 401.**

### The Rosetta Stone

`scripts/test-device-heartbeat.sh:68-69, 90-91` is the known-working
reference. It sends **both** headers:

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "X-Device-Key: $API_KEY" \
     "$CONFIG_URL"
```

And it uses `LITCROP_API_KEY` → `$API_KEY` internally. This script works
end-to-end because the .env it reads is named correctly and both headers
are set.

---

## The three possible layers, revisited

| Layer | Memory said | Reality | Status |
|---|---|---|---|
| A | Parser key prefix mismatch | **Mismatch + 2 missing fields** (`BED_ID`, `API_BASE_URL`) | ❌ Bug, bigger than memory thought |
| B | Heartbeat header wrong | Heartbeat **and** config-poll both missing `X-Device-Key` | ❌ Bug on 2 endpoints, not 1 |
| C | Upload flow may need device auth | Upload uses `/api/v1/beds/*` which is **JWT-only** | ✅ Not a bug |

Net: **2 real layers** to fix, **3 surfaces** broken (parser, config-poll, heartbeat).

---

## Bonus finding (not blocking #341)

`capture.sh:124-129` `refresh_token()` writes the refreshed Cognito JWT
back to the `.env` as `export AUTH_TOKEN="..."`. The awk command looks for
`^export AUTH_TOKEN=` which doesn't exist in the downloaded file (which
only has `LITCROP_REFRESH_TOKEN`, no `LITCROP_AUTH_TOKEN`).

Effect: the refreshed token is held in memory for the current run but
**never persisted**. Each cron run triggers a fresh Cognito refresh.
Inefficient, not broken. Will fix as a drive-by while we're already
touching the env parser.

---

## Desired State

1. A user registers a device via the web UI.
2. Downloads `litcrop-{deviceId}.env`.
3. `scp`s it to the Pi under `~/litcrop/.env`.
4. Runs `~/litcrop/capture.sh --loop` (or the cron line from `install.sh`).
5. Heartbeats appear on the DeviceListPage with real battery / wifi / storage
   values within one cycle.

No hand-editing the .env. No manual `DEVICE_API_KEY` export. No Cognito
client-id tweaking.

---

## File-by-file change plan

### 1. `src/frontend/src/components/DeviceRegisterForm.tsx:244-251`

Add the two missing fields `LITCROP_BED_ID` and `LITCROP_API_BASE_URL`.

**Implementation note (deviation from S-3 resolution)**: During
implementation (task #10), I grepped the frontend for its API base URL
source and found it uses `PUBLIC_API_BASE_URL`, which in production
resolves to the full URL *including* `/api/v1` suffix (e.g.
`https://host/api/v1`). Using that value directly would produce a
doubled-path bug in capture.sh which appends `/api/v1/devices/.../config`
itself.

The **server-generated** `result.config_poll_url` is the better source:
it's authoritative (built by the registration endpoint), it always
contains the full absolute URL, and test-device-heartbeat.sh already
uses the same pattern. The review finding S-3's original concern (silent
regex failure) is addressed by using a **strict regex with fail-loud
behavior** — if the pattern doesn't match, we abort the download and
surface a user-visible error instead of writing a broken .env.

```ts
// Derive API base from server-generated config_poll_url (authoritative).
// Pattern: https://host/api/v1/devices/<id>/config → https://host
// Fail loudly if the URL format changes — never silently produce a broken .env.
const match = result.config_poll_url.match(/^(https?:\/\/[^/]+)\/api\/v1\/devices\//);
if (!match) {
  showToast(t('device.env_download_failed_bad_url'), 'error');
  return;
}
const apiBase = match[1];

const content = [
  `export LITCROP_DEVICE_ID=${result.device_id}`,
  `export LITCROP_BED_ID=${bedId}`,               // NEW
  `export LITCROP_API_BASE_URL=${apiBase}`,       // NEW — fail-loud match
  `export LITCROP_API_KEY=${result.device_api_key}`,
  `export LITCROP_CONFIG_URL=${result.config_poll_url}`,
  `export LITCROP_REFRESH_TOKEN=${refreshToken || 'PASTE_YOUR_TOKEN_HERE'}`,
  `export LITCROP_COGNITO_CLIENT_ID=${cognitoClientId}`,
  `export LITCROP_COGNITO_REGION=ap-northeast-1`,
].join('\n');
```

- ✅ `bedId` is already in scope via `useState` at line 41.
- ✅ `result.config_poll_url` is server-generated in the registration
  response — checked against `src/api/src/routes/devices.ts`.
- ⚠ New i18n key `device.env_download_failed_bad_url` needed in both
  `en.json` and `ja.json`.

### 2. `scripts/camera-node/capture.sh:41-48` (env parser)

Accept `LITCROP_*`-prefixed keys and map them to the internal unprefixed
names `capture.sh` already uses. Keep the unprefixed case for backward
compatibility.

**S-1 resolution**: `LITCROP_CONFIG_URL` is dropped from the parser map.
It's still written to the downloaded .env for human troubleshooting and
for `test-device-heartbeat.sh`, but `capture.sh` does not read it —
`poll_config()` constructs the URL from `${API_BASE_URL}/api/v1/devices/${DEVICE_ID}/config`
which is sufficient.

```bash
case "$key" in
    LITCROP_DEVICE_ID)         export DEVICE_ID="$value" ;;
    LITCROP_BED_ID)            export BED_ID="$value" ;;
    LITCROP_API_BASE_URL)      export API_BASE_URL="$value" ;;
    LITCROP_API_KEY)           export DEVICE_API_KEY="$value" ;;
    LITCROP_REFRESH_TOKEN)     export REFRESH_TOKEN="$value" ;;
    LITCROP_COGNITO_CLIENT_ID) export COGNITO_CLIENT_ID="$value" ;;
    LITCROP_COGNITO_REGION)    export AWS_REGION="$value" ;;
    LITCROP_CONFIG_URL)        ;;  # intentionally ignored — see S-1
    # Backward compat — manual configs (pre-prefix era)
    DEVICE_ID|BED_ID|API_BASE_URL|DEVICE_API_KEY|AUTH_TOKEN|\
    NODE_ID|TRIGGER|CAPTURE_WIDTH|CAPTURE_HEIGHT|JPEG_QUALITY|\
    INTERVAL_SECONDS|MAX_RETRY|REFRESH_TOKEN|COGNITO_CLIENT_ID|AWS_REGION)
        export "$key=$value"
        ;;
esac
```

### 3. `capture.sh:52` (required vars check)

Add `DEVICE_API_KEY`. Remove `AUTH_TOKEN` from the hard-required list
(it's fetched on-demand via `refresh_token()` and may be empty on first run).

**S-2 resolution**: Add helpful error messages pointing to the re-download
flow so legacy manual configs surface an actionable hint, not just "var is
required":

```bash
for var in DEVICE_ID BED_ID API_BASE_URL DEVICE_API_KEY REFRESH_TOKEN; do
    if [ -z "${!var:-}" ]; then
        echo "[ERROR] ${var} is required." >&2
        echo "[HINT]  Re-download your .env from the LitCrop web UI → Devices → Setup." >&2
        echo "[HINT]  Or for legacy manual configs, add: export LITCROP_${var}=..." >&2
        exit 1
    fi
done
```

### 4. `capture.sh:144` (poll_config header)

```bash
printf 'header = "Authorization: Bearer %s"\nheader = "X-Device-Key: %s"\n' \
    "$AUTH_TOKEN" "$DEVICE_API_KEY" > "$curl_cfg"
```

### 5. `capture.sh:331` (send_heartbeat header)

```bash
printf 'header = "Authorization: Bearer %s"\nheader = "X-Device-Key: %s"\nheader = "Content-Type: application/json"\n' \
    "$AUTH_TOKEN" "$DEVICE_API_KEY" > "$hb_cfg"
```

### 6. `capture.sh:233` (upload header)

**No change.** Upload endpoint is JWT-only.

### 7. `capture.sh` — sidecar `.auth-token` file for refreshed JWT

**M-1 resolution**: Use a **sidecar file** `~/litcrop/.auth-token`, not
awk-rewriting of the .env. Decision rationale:

1. `.env` stays immutable after download — users can re-copy the same
   file to multiple Pis or to a replacement Pi without surprises.
2. Different secret lifecycles: `.env` is registration config (durable),
   `.auth-token` is a 1-hour rotating token.
3. Deleting `.auth-token` forces a fresh Cognito refresh without
   destroying registration state — useful for troubleshooting.
4. Avoids the awk rewrite fragility (quoting, comment ordering).

**Sidecar contract**:
- Path: `~/litcrop/.auth-token`
- Format: single line containing the raw JWT (no `export`, no prefix)
- Permissions: `chmod 600` set at write time
- Loaded at script top (after .env parse, before validation):
  ```bash
  if [ -f "${LITCROP_DIR}/.auth-token" ]; then
      AUTH_TOKEN=$(cat "${LITCROP_DIR}/.auth-token")
      export AUTH_TOKEN
  fi
  ```
- Written atomically by `refresh_token()`:
  ```bash
  umask 077
  printf '%s' "$new_token" > "${LITCROP_DIR}/.auth-token.tmp"
  mv "${LITCROP_DIR}/.auth-token.tmp" "${LITCROP_DIR}/.auth-token"
  chmod 600 "${LITCROP_DIR}/.auth-token"
  ```
- Drop the awk rewrite entirely (lines 126-129 of current capture.sh).

**S-7 resolution**: Add a failure counter to `refresh_token()` so an
expired `REFRESH_TOKEN` (30-day window) doesn't cause an infinite
refresh loop:

```bash
REFRESH_FAIL_FILE="${LITCROP_DIR}/.refresh-failures"
MAX_REFRESH_FAILURES=3

refresh_token() {
    # ... existing refresh logic ...
    if [ -n "$new_token" ]; then
        # Success — reset failure counter
        rm -f "$REFRESH_FAIL_FILE"
        # ... write sidecar ...
    else
        # Failure — increment counter
        local fail_count=0
        [ -f "$REFRESH_FAIL_FILE" ] && fail_count=$(cat "$REFRESH_FAIL_FILE")
        fail_count=$((fail_count + 1))
        echo "$fail_count" > "$REFRESH_FAIL_FILE"
        if [ $fail_count -ge $MAX_REFRESH_FAILURES ]; then
            log "[AUTH] Refresh failed ${fail_count}x — device needs re-registration"
            log "[AUTH] Run: rm ${REFRESH_FAIL_FILE} after fixing"
            exit 2
        fi
        log "[AUTH] Token refresh failed (${fail_count}/${MAX_REFRESH_FAILURES})"
        return 1
    fi
}
```

### 8. `capture.sh:362-369` — first-run: call `refresh_token` before
validation

The current order is: load .env → validate → run. On a fresh install, a
valid cached `AUTH_TOKEN` doesn't exist. The validation currently
requires it, which is why we move it out of the required list in step 3.
`poll_config` and `send_heartbeat` will call `refresh_token` before
their first HTTP request, so they get a fresh JWT on-demand. Flow looks
something like:

```
load .env → (no AUTH_TOKEN yet) → refresh_token() → poll_config() → ...
```

Implementation: call `refresh_token` at the top of `run_once()` (it
already is — line 362). On first run it will populate `AUTH_TOKEN` in
memory before the first endpoint call.

### 9. Tests

- `src/api/src/__tests__/routes/devices.test.ts` — already covers the
  dual-auth pattern with `X-Device-Key`. No change.
- **New**: add an integration test at `scripts/test-device-capture.sh`
  that runs the full `capture.sh --once` cycle against a mock API (or
  the real API with a test device). Optional — depends on how much
  we trust the unit coverage.
- Manual: run `capture.sh --loop` on a Pi after implementing and watch
  the DeviceListPage for live health data.

---

## Security review (pre-implementation)

### Threat model (S-6)

`DEVICE_API_KEY` is equivalent to a bearer token for the device's
heartbeat and config-poll endpoints. It is stored **plaintext** in
`~/litcrop/.env` on the Pi (mode 600). An attacker with shell access to
the Pi can impersonate the device. This is **accepted** under the
following reasoning:

1. Physical access to the Pi also grants physical camera access, which
   is a superset of the impersonation threat.
2. The key is scoped to a **single device's telemetry** — it cannot
   register new devices, read other farms' data, or modify farm state.
   The worst a compromised key allows is fake heartbeats/health data
   for that one device.
3. Server-side, the key is stored as a **bcrypt hash** — compromising
   the DynamoDB table does not leak plaintext keys.
4. Rotation path exists: re-register the device (invalidates old key)
   and download a new .env.

### Specific checks

- ✅ `DEVICE_API_KEY` is bcrypt-hashed server-side (`device-auth.ts`
  `verifyDeviceKey()` uses `bcrypt.compare`).
- ✅ Keys flow via headers only, never in URLs or query strings.
- ✅ `log()` calls do not interpolate `$DEVICE_API_KEY` (grep confirmed).
- ✅ curl uses `-K config-file` pattern to keep secrets out of
  `ps`/process list — preserved in the fix.
- ✅ `printf '%s' "$value"` format avoids `%` injection (values are
  server-generated `dk_...` strings; format string is a literal).
- ⚠ `.env` file mode: `install.sh` chmods `~/litcrop/` to 700 but does
  not explicitly chmod `.env` itself. **Add `chmod 600 "${LITCROP_DIR}/.env"`
  after the .env is copied in during install/setup.**
- ⚠ Sidecar `.auth-token` created by `refresh_token()` with
  `umask 077` + explicit `chmod 600` (see §7).

**Verdict**: Security-clean under the stated threat model. No new
vulnerabilities introduced. Two hardening items (`.env` chmod,
`.auth-token` permissions) folded into the implementation plan.

---

## Test plan

- [ ] **TC-1**: Register a fresh device via the web UI, download .env,
      copy to a Pi, run `capture.sh --once`. Expect: heartbeat 200,
      health values appear on DeviceListPage within one refresh.
      (Manual — requires a real Pi.)
- [ ] **TC-2**: Run `test-device-heartbeat.sh` — still works (regression
      check on the Rosetta Stone pattern).
- [ ] **TC-3**: Unit tests — `src/api/src/__tests__/routes/devices.test.ts`
      still passes (dual-auth contract unchanged, 790/790 stays green).
- [ ] **TC-4**: *(dropped — shellcheck not installed in dev env; see S-4.
      Filed as follow-up infra work.)*
- [ ] **TC-5**: Manual: restart the Pi cron and confirm heartbeats
      continue across AUTH_TOKEN expiration (refresh_token sidecar
      path works).
- [ ] **TC-6**: Backward-compat: user with a hand-edited unprefixed
      `.env` still works. The parser keeps the legacy unprefixed case.
- [ ] **TC-7** (S-5 follow-up): CI-runnable header integration test —
      `scripts/test-capture-sh-headers.sh` runs `capture.sh --once`
      against `nc -l` echo server, captures the raw HTTP request, and
      asserts both `Authorization: Bearer` and `X-Device-Key` are
      present on the heartbeat and config-poll requests. Tracked as a
      separate task — optional for v0.50 but strongly recommended
      before the next device-layer change to prevent regression.
- [ ] **TC-8**: Sidecar refresh-failure counter — simulate expired
      REFRESH_TOKEN, run `capture.sh --once` three times, confirm exit
      code 2 on the third attempt with the re-registration hint.

---

## Rollback strategy

- Frontend change is additive (two new lines in .env). If reverted,
  existing capture.sh setups continue to fail (same as today) — no new
  breakage.
- `capture.sh` changes are on the Pi, not in the deployed Lambda.
  Rollback = copy the old script back to the Pi. No AWS deploy involved.
- The only deployable change is the frontend .env download button.
  Revert that commit to restore the old behavior.

---

## Scope audit — files touched

Based on the `device_api_key` grep (14 hits total, excluding docs):

**Will change (2 files)**:
- `src/frontend/src/components/DeviceRegisterForm.tsx` (1 block, ~10 lines)
- `scripts/camera-node/capture.sh` (4 blocks: parser, validation, poll_config, send_heartbeat; optional refresh_token)

**Read to confirm, no change (8 files)**:
- `packages/shared/src/schemas/index.ts` — `device_api_key` field in shared schema ✓
- `packages/shared/src/types/domain.ts` — domain type ✓
- `src/api/src/services/dynamodb.ts` — bcrypt storage ✓
- `src/api/src/routes/devices.ts` — dual-auth route handler ✓
- `src/api/src/middleware/device-auth.ts` — `verifyDeviceKey()` ✓
- `src/api/src/app.ts` — CORS allows `X-Device-Key` ✓
- `src/frontend/src/lib/api.ts` — register API call returns `device_api_key` ✓
- `src/api/src/__tests__/routes/devices.test.ts` — already tests dual-auth ✓

**Docs (4 files, no change unless we refresh references)**:
- `docs/ARCHITECTURE.md`, `docs/SYSTEM-DESIGN.md`, `docs/UX-DESIGNS.md`,
  `docs/TEST-STRATEGY-BETA5.md`

**Memory note update required**:
- `~/.claude/projects/-workspace/memory/project_341_device_auth.md` — update
  to reflect "2 layers not 3" and the missing-env-fields detail.

---

## Next step

Pipeline: **define → ~~design~~ → review → remediate → implement → simplify → re-review → test → push → PR → merge**

- **Define**: ✅ this document (initial draft + remediation pass)
- **Review**: ✅ `docs/feedback/REVIEW-FINDINGS-341-DEFINE.md` (1 MUST-FIX, 6 SHOULD-FIX, 3 SUGGESTION)
- **Remediate**: ✅ this document now reflects M-1, S-1, S-2, S-3, S-4, S-6, S-7 resolutions inline
- **Design**: skipped — fix is mechanical (no new abstractions, no UI design)
- **Implement**: ready to start. Scope:
  - File 1: `DeviceRegisterForm.tsx` — add `LITCROP_BED_ID` + `LITCROP_API_BASE_URL` (~10 lines)
  - File 2: `capture.sh` — parser, required-vars check, `poll_config` header, `send_heartbeat` header, sidecar `.auth-token`, refresh failure counter (~50 lines)
  - Target tag: **v0.50** (closes Beta-11 sprint)

**Commit strategy**: single commit referencing #341. The two files are
interlocked — changing one without the other leaves the system broken
in a different way, so they must land together.

**Remaining tracked tasks** (TaskCreate'd separately, not inline here):

- **S-5**: Write `scripts/test-capture-sh-headers.sh` (CI integration test)
- **G-3**: Update `~/.claude/projects/-workspace/memory/project_341_device_auth.md`
  after the fix ships — correct "3 layers" → "2 layers" and "14 files" → "2 files"

**Deferred follow-ups** (file as separate issues after merge):

- Infra: add `shellcheck` to devcontainer + CI (S-4)
- Feature: `install.sh` creates empty `.auth-token` placeholder (G-2)
