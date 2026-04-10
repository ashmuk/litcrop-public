# Review Findings — REQUIREMENTS-341.md

**Scope**: Review of the define-step artifact for #341 heartbeat auth fix.
**Reviewer**: my-reviewer (via cc-review)
**Date**: 2026-04-10
**Status**: Pre-implementation (reviewing the requirements doc, not code)
**Source**: `docs/REQUIREMENTS-341.md`

---

## Summary

**Findings**: 1 MUST-FIX · 6 SHOULD-FIX · 3 SUGGESTION
**Verdict**: Requirements doc is substantially correct and the scope
assessment is sound (2 bugs, 2 files — not the 3/14 the memory suggested).
However, one design decision was left ambiguous ("decide during implement"
for the AUTH_TOKEN persistence path) and should be nailed down now so
implementation is deterministic. Several robustness gaps around error
handling, backward-compat, and test tooling also need to be closed before
coding starts.

---

## MUST-FIX

### M-1. `AUTH_TOKEN` persistence path — decide now, not during implement

The requirements doc (§8.7) says:

> Decide during implement — lean toward sidecar to keep the .env immutable after download.

That's a design decision being punted into implement, which violates the
define → design → implement pipeline. The choice affects:

- File layout on the Pi (1 file vs 2)
- `install.sh` file permissions (`.env` 600 vs `.env` + `.token` both 600)
- Security posture (mutating the downloaded .env vs keeping it immutable)
- Rollback granularity (sidecar can be deleted without re-downloading config)

**Decide in this review**: sidecar file `~/litcrop/.auth-token` (mode 600),
managed only by `refresh_token()`. Rationale:

1. `.env` stays immutable after download → users can re-copy the same file
   to multiple Pis or to a replacement Pi without surprises.
2. The file mode is independent — `.env` is config, `.auth-token` is a
   secret that rotates hourly. Different lifecycles.
3. Deleting `.auth-token` forces a fresh Cognito refresh without destroying
   registration state. Useful for troubleshooting.
4. `awk`-based .env rewriting (the current approach) is fragile against
   quoting and comment ordering — sidecar avoids the risk entirely.

Update §8.7 to specify:
- Path: `~/litcrop/.auth-token`
- Format: single line containing the raw JWT (no `export`, no prefix)
- Permissions: `chmod 600` set at write time
- Loaded at script top (after .env, before validation) via `[ -f ... ] && AUTH_TOKEN=$(cat ...)`
- Written by `refresh_token()` atomically: `> .auth-token.tmp && mv`

### (No other MUST-FIX)

---

## SHOULD-FIX

### S-1. `LITCROP_CONFIG_URL` is dead code in capture.sh — either remove from the parser or wire it up

The parser maps `LITCROP_CONFIG_URL → CONFIG_URL`, but `capture.sh`
constructs the config URL from `${API_BASE_URL}/api/v1/devices/${DEVICE_ID}/config`
at `poll_config():140`. `CONFIG_URL` is **never read** by the script.

Choice:

- **Option A** — drop the `LITCROP_CONFIG_URL` mapping from the parser. The
  field is still downloaded in the .env (for human troubleshooting and for
  `test-device-heartbeat.sh`), but capture.sh ignores it.
- **Option B** — if `CONFIG_URL` is set, use it verbatim in `poll_config()`
  instead of constructing. More resilient to API path changes.

Recommend **Option A** for this PR — smaller diff, less risk. File a
follow-up issue for Option B if the API path ever changes.

### S-2. Required-vars check breaks existing manual configs

Adding `DEVICE_API_KEY` and `REFRESH_TOKEN` to the required list will break
any Pi running a hand-edited legacy `.env` without those fields. The memory
says capture.sh "has never worked end-to-end" via the web UI, but doesn't
say whether QA/dev Pis exist with manual configs.

Mitigation: add a helpful error message pointing to the re-download flow:

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

### S-3. `result.config_poll_url` regex strip may over-match

The proposed derivation in §file 1:

```ts
const apiBase = result.config_poll_url.replace(/\/api\/v1\/devices\/.*$/, '');
```

This assumes `config_poll_url` always contains `/api/v1/devices/` literally.
Verify that assumption in `src/api/src/routes/devices.ts` (where the URL is
constructed) and `src/frontend/src/lib/api.ts` (where the type is defined).
If the API ever returns a different path, the regex silently produces
`result.config_poll_url` unchanged, and the derived `API_BASE_URL` will be
broken in a confusing way.

**Fix**: pass `API_BASE_URL` explicitly from the frontend rather than
deriving it. The frontend already knows its API base URL from config — use
that. One less implicit contract between backend and script.

### S-4. Test plan TC-4 depends on `shellcheck` which isn't installed

`shellcheck not found` at the dev env. The review command `/cc-review`
specifically checks this. If TC-4 is blocking, CI will need shellcheck
added. Either:

- Add `shellcheck` to the devcontainer + CI workflow, OR
- Remove TC-4 from the test plan and rely on manual review

Recommend removing TC-4 for this PR (scope creep) and filing a follow-up
infra issue to add shellcheck to the base image.

### S-5. No integration test for end-to-end capture.sh cycle

The test plan relies on manual TC-1 (run on a real Pi) to validate the fix.
This is fragile: the bug has existed since Beta-5 because nobody noticed
it, and a manual test without a real Pi in the loop can regress again.

Options:

- **A** — Add a shell-based integration test that stubs out the curl calls
  and asserts the headers sent. Lightweight, CI-runnable.
- **B** — Add a full mock-API test using a local `wiremock` or similar.
  Heavier setup.
- **C** — Live-test on a Pi once, then rely on the pre-existing
  `devices.test.ts` backend tests for the contract surface.

Recommend **Option A** — write a test script
`scripts/test-capture-sh-headers.sh` that runs `capture.sh --once` against
a local echo server (e.g. `nc -l`), captures the raw HTTP request, and
greps for `X-Device-Key`. Runtime <5s, catches regressions.

### S-6. Security: `DEVICE_API_KEY` is plaintext in a file on the Pi

The requirements doc §Security correctly notes that `DEVICE_API_KEY` is
bcrypt-hashed server-side. But client-side it's plaintext, sitting in
`~/litcrop/.env` with mode 600. This is fine under the threat model
("the Pi is trusted"), but the doc should explicitly state the threat
model so a future reader doesn't treat this as a bug:

> **Threat model**: `DEVICE_API_KEY` is equivalent to a bearer token for
> the device's heartbeat/config endpoints. It is stored plaintext in
> `~/litcrop/.env` (mode 600). An attacker with shell access to the Pi
> can impersonate the device. This is accepted because physical access
> to the Pi grants camera access anyway, and the key is scoped to a
> single device's telemetry (no farm-wide authority).

Add this paragraph to REQUIREMENTS-341.md §Security review.

### S-7. `refresh_token()` first-run race

Proposed flow: `load .env → refresh_token() → poll_config()`. But if
`REFRESH_TOKEN` is expired (30-day window), `refresh_token()` returns 1
and `AUTH_TOKEN` stays empty. `poll_config()` then runs with empty token,
gets 401, logs "Auth expired — refreshing token", calls `refresh_token()`
again, infinite loop of useless refreshes.

Mitigation: track a refresh-failure counter in `refresh_token()`. After
N consecutive failures, give up and log a clear error pointing to
re-registration.

```bash
REFRESH_FAIL_COUNT=${REFRESH_FAIL_COUNT:-0}
# ... on failure:
REFRESH_FAIL_COUNT=$((REFRESH_FAIL_COUNT + 1))
if [ $REFRESH_FAIL_COUNT -ge 3 ]; then
    log "[AUTH] Refresh failed 3x — device may need re-registration"
    exit 2
fi
```

---

## SUGGESTIONS

### G-1. Sidecar file format — use `AUTH_TOKEN=<jwt>` format for future extensibility

If a second refresh-related secret is ever added, the sidecar file
structure won't have to change. Minor — a single-line raw JWT works
too.

### G-2. Update `install.sh` to create `.auth-token` placeholder at setup

Not strictly required (refresh_token creates it on first run), but
creating an empty `.auth-token` with mode 600 during install avoids a
race where the first run is interrupted before `chmod` lands.

### G-3. Name the memory update

The requirements doc mentions updating
`~/.claude/projects/-workspace/memory/project_341_device_auth.md` after
the fix ships. Make this a concrete task in the implementation plan
(TaskCreate), not just a prose note — otherwise it gets forgotten.

---

## Verified assumptions

- ✅ `bedId` is in `DeviceRegisterForm` scope at line 244 (`useState` at
  line 41, already used at lines 55/74/82/381)
- ✅ Upload route `/api/v1/beds/:bedId/images` is JWT-only (verified via
  `app.ts:126` — no device-key middleware mounted on `/api/v1/beds/*`)
- ✅ `verifyDeviceKey` exists at `src/api/src/middleware/device-auth.ts:27`
  and is called from both `devices.ts:236` (config) and `devices.ts:268`
  (heartbeat) — dual-auth confirmed on both endpoints

## Falsified assumptions

- ❌ Memory said "~14 files need changes" — only **2 files** change
  (frontend `DeviceRegisterForm.tsx` + Pi `capture.sh`). The other 12
  `device_api_key` references are already correct and read-only.
- ❌ Memory said "3 layered bugs" — only **2 real bugs**. Upload flow
  is not broken.

---

## Security review

### Scope

- Client-side: plaintext `DEVICE_API_KEY` storage on Pi → see S-6 (threat model)
- Transport: headers sent over HTTPS → ✅ safe
- Backend: dual-auth already enforced on both endpoints → ✅ no change
- Logs: confirmed `log()` calls don't interpolate `$DEVICE_API_KEY` → ✅ safe
- Process list: existing `-K curl-config-file` pattern keeps secrets out
  of `ps` output → ✅ preserved in the fix
- `printf` interpolation: `$DEVICE_API_KEY` values are server-generated
  (format `dk_...` from the registration API) so `%` chars are unlikely
  but not impossible. Use `%s` format only (already does).

**Verdict**: Security-clean pending S-6 threat-model doc update.

---

## Alignment with plan

Checked against:

- Issue #341 — ✅ addresses root cause (dual-auth + missing env fields)
- `project_341_device_auth.md` memory — ✅ supersedes with corrected scope
- Pipeline discipline — ⚠ define should nail down the AUTH_TOKEN persistence
  approach (M-1)
- Batch B restart-point plan — ✅ matches "fresh session investigation then
  fix" even though we're doing both in one session

---

## Recommendation

**Hold implementation until M-1 is resolved** (explicitly pick sidecar or
.env rewrite, not "decide later"). The SHOULD-FIX items can be folded into
the implementation PR but should be tracked in the task list so none get
dropped.

Specifically before writing code:

1. Update `docs/REQUIREMENTS-341.md` §8.7 with M-1 resolution (sidecar)
2. Update §file 1 with S-3 resolution (pass `API_BASE_URL` explicitly)
3. Update §Security with S-6 threat model paragraph
4. Drop TC-4 from §Test plan (S-4)
5. Create tasks for S-2, S-5, S-7, G-3 so they're tracked in implementation

Then proceed to implement with a clean, deterministic plan.
