# TASK BREAKDOWN — #395 Device Capture Production Hardening

> **Status**: Step 6 (cc-design — Task Breakdown) — 2026-04-15
> **Source**: `docs/DESIGNS-395.md`, `docs/decisions/ADR-20260414-device-capture-production-hardening.md`
> **Phase ordering**: Phase 0 MUST land in its own PR before Phase 1 begins.

---

## Legend

| Field | Meaning |
|-------|---------|
| ID | `T-395-NN` — N0 = Phase 0, N1 = Phase 1 |
| Size | S (≤30 min), M (≤2 h), L (half-day), XL (full day) |
| Dep | Task IDs that must complete first |
| Test | unit / integration / manual-on-Pi |

---

## Phase 0 — Fix broken round-trip (blocks Phase 1)

### T-395-00 — Shell test harness bootstrap (NEW — blocks all shell unit tests)

- **Size**: S
- **Dep**: –
- **Files**:
  - `/workspace/scripts/camera-node/__tests__/` (new directory)
  - `/workspace/scripts/camera-node/__tests__/helpers.bash` (new — curl/cgpmgr/jq stubs)
  - `/workspace/package.json` devDependency: `bats-core`
  - `/workspace/scripts/camera-node/__tests__/README.md` (how to run)
- **Description**: Install `bats-core` (or simple source-and-stub harness). Provide `mock_curl()`, `mock_cgpmgr()`, `mock_jq_ok()` helpers. Document: `npx bats scripts/camera-node/__tests__/`.
- **Test**: meta — one smoke test that runs a no-op `bats` assertion successfully.
- **Exit**: `npm run test:shell` passes a single smoke test.

### T-395-01 — DynamoDB migration: normalize `resolution`

- **Size**: M
- **Dep**: –
- **Files**: `/workspace/scripts/migrate-device-resolution.ts` (new)
- **Description**: Scan `DEVICE#*`, rewrite any `resolution` attr failing `/^\d+x\d+$/` to `'1920x1080'`. Mirror `migrate-roles.ts`. `DRY_RUN=1` default.
- **Test**: unit + manual dry-run against dev table
- **Exit**: Dry-run shows 0 malformed values OR explicit list of fixes applied

### T-395-02 — `poll_config()` parses resolution, capture_interval, active_window

- **Size**: M
- **Dep**: –
- **Files**: `/workspace/scripts/camera-node/capture.sh` (lines 194–244)
- **Description**: Replace jq parsing block per DESIGNS-395 §2.1.1. Guard every numeric field with regex.
- **Test**: unit (shell; mock curl; assert exported vars)
- **Exit**: Three assertions pass against fixture `{resolution:"1280x720", capture_interval:3600, active_window:{start:"06:00", end:"18:00"}}`

### T-395-03 — Add `in_active_window()` and gate `run_once()`

- **Size**: S
- **Dep**: T-395-00, T-395-02
- **Files**: `/workspace/scripts/camera-node/capture.sh`
- **Description**: Helper per DESIGNS-395 §2.1.2. Gate `run_once` after `poll_config`. `test_shot` bypasses. Outside-window path still sends heartbeat (exactly once). Inside-window path sends heartbeat after capture (existing behavior, exactly once).
- **Test**: unit (set `ACTIVE_WINDOW_*`; confirm `capture()` not called outside window; confirm `send_heartbeat` called exactly once per cycle in both branches)
- **Exit**:
  - `ACTIVE_WINDOW_END=12:00` at 13:00 → `[SKIP]` + `[HEARTBEAT]` log sequence, exactly 1 heartbeat call
  - `ACTIVE_WINDOW_END=23:59` at 13:00 → `[START]` + capture + `[HEARTBEAT]` sequence, exactly 1 heartbeat call
  - Double-heartbeat regression check: neither branch calls `send_heartbeat` twice
  - Midnight-crossing window (e.g., `22:00` → `04:00`): log `[CONFIG] Warning: cross-midnight window not supported, using defaults` and fall back to 05:00–20:00 (string comparison breaks otherwise)

### T-395-04 — Phase 0 API/repo tests

- **Size**: S
- **Dep**: –
- **Files**: `/workspace/src/api/src/__tests__/routes/devices.test.ts`, `contracts-beta5.test.ts`
- **Description**: Assert `GET /devices/:id/config` returns `resolution`, `active_window`, `capture_interval`. Confirm PATCH round-trip.
- **Test**: unit (vitest)
- **Exit**: Tests green; 100% coverage on the three fields

### T-395-05 — Phase 0 on-Pi verification

- **Size**: M
- **Dep**: T-395-01, T-395-02, T-395-03, T-395-04
- **Files**: `/workspace/docs/session-reports/SESSION-REPORT-395-phase-0.md` (post-run)
- **Description**: Deploy to one physical Pi. UI changes. Wait ≤30 min. Confirm in logs.
- **Test**: manual-on-Pi
- **Exit**: Exit criteria in ADR Phase 0 and DESIGNS-395 §2.3 satisfied

---

## Phase 1 — Power management + new config fields

### T-395-N1-01 — Schema additions (6 layers)

- **Size**: M
- **Dep**: Phase 0 complete + merged
- **Files**:
  - `/workspace/packages/shared/src/schemas/index.ts` (lines 470, 488)
  - `/workspace/packages/shared/src/types/domain.ts` (line 188 + `Device` interface)
  - `/workspace/src/api/src/routes/devices.ts` (lines 36, 241)
  - `/workspace/src/api/src/services/repositories/devices.ts` (lines 6, 32, 127)
- **Description**: Add four fields across all six layers per DESIGNS-395 §3.1. Must be in one commit.
- **Test**: unit (vitest — every layer)
- **Exit**: New fields round-trip through PATCH → GET `/config`

### T-395-N1-02 — Frontend form controls + i18n

- **Size**: M
- **Dep**: T-395-N1-01
- **Files**:
  - `/workspace/src/frontend/src/components/DeviceConfigForm.tsx`
  - `/workspace/src/frontend/src/i18n/en.json` (after line 652)
  - `/workspace/src/frontend/src/i18n/ja.json` (after line 652)
- **Description**: Four new inputs per DESIGNS-395 §3.1.5. Capability gating: PIR → cooldown+max/hr; battery → sleep; sleepEnabled → threshold.
- **Test**: unit (Vitest component — assert disabled states)
- **Exit**: Form renders four controls; save round-trips; capability gating correct

### T-395-N1-03 — capture.sh reads new fields + maybe_sleep

- **Size**: M
- **Dep**: T-395-N1-01
- **Files**: `/workspace/scripts/camera-node/capture.sh`
- **Description**:
  1. Extend `poll_config` jq block for new fields
  2. Add `HAS_POWER_MGMT` to parser allow-list (line 103)
  3. Append `maybe_sleep()` per §3.2
  4. Wire into `run_once`
  5. Change TRIGGER default to `"${LITCROP_TRIGGER:-${TRIGGER:-scheduled}}"` (line 91)
- **Test**: unit (shell; mock cgpmgr; assert correct args)
- **Exit**: With `HAS_POWER_MGMT=1, SLEEP_ENABLED=true, BATTERY_THRESHOLD=20, batt=80`, logs `[POWER] Setting wake timer: 1800s`

### T-395-N1-04 — Systemd unit files

- **Size**: S
- **Dep**: –
- **Files**:
  - `/workspace/scripts/camera-node/systemd/litcrop-capture.service.tmpl` (new)
  - `/workspace/scripts/camera-node/systemd/litcrop-capture.timer` (new)
- **Description**: Per DESIGNS-395 §3.5. Template uses `__LITCROP_HOME__` / `__LITCROP_USER__`. Timer is not a template.
- **Test**: unit (`systemd-analyze verify` on rendered file)
- **Exit**: No warnings on sed-substituted output

### T-395-N1-05 — install.sh rewrite

- **Size**: L
- **Dep**: T-395-N1-04
- **Files**: `/workspace/scripts/camera-node/install.sh`
- **Description**:
  1. `--non-interactive` flag handling (line 26–30)
  2. Replace cron block (lines 109–131) with `install_systemd_units()` per §3.4
  3. Replace hardware prompts (lines 133–165) with auto-detection
  4. Add legacy-cron removal
  5. Add `.env` `TRIGGER=` scrub
- **Test**: unit (shell; run against temp $HOME)
- **Exit**: End-to-end non-interactively; rendered systemd files valid; hardware.conf correct

### T-395-N1-06 — Integration tests + edge cases

- **Size**: M
- **Dep**: T-395-N1-01, T-395-N1-02, T-395-N1-03
- **Files**:
  - `/workspace/src/api/src/__tests__/routes/devices.test.ts`
  - `/workspace/src/api/src/__tests__/services/repositories/devices.test.ts`
  - `/workspace/src/frontend/src/components/__tests__/DeviceConfigForm.test.tsx` (create if missing)
  - `/workspace/scripts/camera-node/__tests__/test-maybe-sleep.bats`
  - `/workspace/scripts/camera-node/__tests__/test-poll-config-fields.bats`
- **Description**: Cover all four new fields at API + form + shell layers. Must-have edge cases:
  - `itemToDevice` legacy item (no new fields) → defaults returned
  - Battery sysfs `"Unknown"` / empty / multi-line → `maybe_sleep` treats as 100%
  - `cgpmgr` missing vs `cgpmgr -set` non-zero (two distinct paths)
  - `jq` missing → log emitted, defaults kept
  - `test_shot_requested=true` + outside-window → bypass confirmed
  - Capability-gated disabled states in form
- **Test**: unit + integration + bats
- **Exit**: Full suite green; coverage on new fields ≥90%

### T-395-N1-08 — install.sh idempotency test (NEW)

- **Size**: S
- **Dep**: T-395-N1-05
- **Files**: `/workspace/scripts/camera-node/__tests__/test-install-idempotent.bats`
- **Description**: Run `install.sh` twice against temp `$HOME`. Assert no duplicate systemd units, no duplicate cron entries, no duplicate `hardware.conf` appends. Test legacy cron cleanup when `capture.sh` path differs.
- **Test**: bats
- **Exit**: Two sequential runs produce identical final state (no duplicates)

### T-395-N1-07 — Phase 1 on-Pi verification

- **Size**: L
- **Dep**: All T-395-N1-* above
- **Files**: `/workspace/docs/session-reports/SESSION-REPORT-395-phase-1.md`
- **Description**: One Class-2 Pi (battery HAT + cgpmgr). Enable sleep from UI. Observe 3 consecutive wake→capture→upload→sleep cycles.
- **Test**: manual-on-Pi
- **Exit**: Three consecutive successful cycles; no unexpected reboots; battery discharge rate slower than Beta-11 baseline

---

## Summary table

| ID | Size | Dep chain | Test |
|----|------|-----------|------|
| T-395-00 | S | – | meta (bootstrap) |
| T-395-01 | M | – | unit + manual |
| T-395-02 | M | T-395-00 | unit (bats) |
| T-395-03 | S | T-395-00, T-395-02 | unit (bats) |
| T-395-04 | S | – | unit (vitest) |
| T-395-05 | M | 01, 02, 03, 04 | manual |
| T-395-N1-01 | M | Phase 0 merged | unit |
| T-395-N1-02 | M | N1-01 | unit |
| T-395-N1-03 | M | N1-01 | unit (bats) |
| T-395-N1-04 | S | – | systemd-analyze |
| T-395-N1-05 | L | N1-04 | unit (bats) |
| T-395-N1-06 | M | N1-01, N1-02, N1-03 | unit + integ + bats |
| T-395-N1-07 | L | all N1-* | manual |
| T-395-N1-08 | S | N1-05 | unit (bats) |
