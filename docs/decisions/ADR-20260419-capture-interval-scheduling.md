# ADR-20260419: capture_interval Scheduling on Pi Camera Nodes (#454)

## Status
Accepted (2026-04-19) — implementation tracked in follow-up patch release v0.99.6.5.

## Context

LitCrop's Raspberry Pi camera nodes run `capture.sh` on a cron schedule installed by `install.sh`. Users set a `capture_interval` (seconds) on the web UI (litcrop.com), which the API persists; `capture.sh` reads the value on its next config-poll cycle and stores it in `INTERVAL_SECONDS`.

**The gap**: `install.sh` hard-codes the cron line at `*/30 5-20 * * *`, and `capture.sh` itself never consults `INTERVAL_SECONDS` for rate-limiting — only the `--loop` mode honors it, and production runs via cron, not `--loop`. The inline comment even acknowledges this: *"capture_interval — advisory under systemd, honored by --loop mode"*.

Consequences observable today:

1. User sets `capture_interval = 900` (15 min) in the UI → Pi still captures every 30 min.
2. User sets `capture_interval = 3600` (60 min) in the UI → Pi still captures every 30 min (2× the expected cadence).
3. The heartbeat payload emits `effective_config.capture_interval = <the UI-set value>` because it's echoed back from the config poll — **the UI sees no drift signal**, so users assume the setting is working.

This is a silent divergence bug. Field-reported by the pilot operator in the v0.99.6.1 feedback session (GitHub issue #454).

### Current state

| Layer       | File                               | Behavior                                                              |
|-------------|------------------------------------|-----------------------------------------------------------------------|
| Install     | `scripts/camera-node/install.sh:191` | Hard-coded `CRON_LINE="*/30 5-20 * * * ..."`                          |
| Runtime     | `scripts/camera-node/capture.sh:240` | Stores `INTERVAL_SECONDS` from config poll; never checks it for gating |
| Heartbeat   | `scripts/camera-node/capture.sh:395` | Echoes `INTERVAL_SECONDS` back as `effective_config.capture_interval` |
| API schema  | `packages/shared/src/schemas/index.ts` | `capture_interval: z.number().int().min(MIN_CAPTURE_INTERVAL).max(MAX_CAPTURE_INTERVAL)` |

### Decision Drivers

1. **Silent-divergence must end** — the UI and the Pi must either agree, or the UI must surface the disagreement. Current state is neither.
2. **Patch-level scope** — v0.99.6.x cadence. Size L changes (full systemd migration) don't fit.
3. **Honesty to the operator** — "what did I ask for vs what's running" should be answerable from the device card alone.
4. **Pi Zero WH CPU budget** — 1 GHz single-core ARM11. Any option that increases the per-hour wakeup rate must be tolerable on that hardware.
5. **Zero crontab corruption risk** — the Pi is remote; a broken crontab needs physical access to fix.
6. **Path to DESIGNS-395 Phase 1 (systemd timers)** — the chosen option should be a stepping stone, not a replaced-later throwaway.
7. **Existing Pi upgrade path** — the pilot's Pi already has an old cron line. `install.sh` must update it on re-run (currently it skips).
8. **Budget** — monthly AWS cost must stay within the $1.18 baseline / $5 ceiling.

## Options Considered

### Option A — Documentation + UI clamp

UI and API clamp `capture_interval` to multiples of 30 min. Pi-side unchanged. Tooltip explains the 30-min minimum.

- **Pros**: Ships in hours; zero Pi-side change; no crontab risk.
- **Cons**: Hides the real issue behind a UX constraint. User can't pick 15 min even if their Class-3 device could handle it. Doesn't prepare for systemd migration. Doesn't solve the silent-divergence root cause — it works around it.
- **Size**: S.

### Option B — Dynamic cron rewrite

`capture.sh` rewrites the crontab line via `crontab -` when the interval changes.

- **Pros**: User gets the exact interval. No 5-min rounding.
- **Cons**:
  - **Crontab race**: `crontab -` is atomic via rename(2), but cron can still fire capture.sh N+1 mid-update under the old schedule while capture.sh N is rewriting. Outcome: duplicate capture, not corruption — mitigatable with a `flock(1)` wrapper but that complexity pushes the true size beyond M.
  - Requires user-level crontab write permission on every run.
  - Observability: "what schedule is cron actually running?" is answerable only by `crontab -l` on the Pi — no audit trail of changes.
  - Doesn't align with systemd future — systemd timer would replace all this logic.
- **Size**: M (understated once locking is added; realistically M+).

### Option C — Hybrid fast-tick + self-skip (recommended)

`install.sh` sets cron to `*/5 5-20 * * *` (every 5 min). `capture.sh` consults `INTERVAL_SECONDS` + a last-capture timestamp; if `now - last_capture < INTERVAL_SECONDS`, it logs `[SKIP]` and skips the `rpicam-still` call **but still sends the heartbeat**.

- **Pros**:
  - Effective interval matches the UI setting, rounded up to the 5-min tick.
  - Heartbeat freshness goes from "every 30 min" → "every 5 min" as a side effect. The UI's device card becomes near-real-time without additional work.
  - No crontab rewrite after install — cron is set once.
  - `[SKIP]` log line gives the operator a visible ground-truth when capture.sh fires but declines to capture. Silent-divergence gap closes.
  - Clean migration path to Option D: replace cron with a systemd timer later; capture.sh's skip logic is unchanged.
- **Cons**:
  - 6× more `capture.sh` invocations (12/hr vs 2/hr). Each skip-path boots bash, sources `.env`, reads `hardware.conf`, loads auth sidecar, sends heartbeat, then skips. Independent architectural review estimates ~100–150 ms CPU per skip on Pi Zero WH → ~1.8 s CPU/hr added. Tolerable; capture-path dominates at ~2–4 s when a capture does fire.
  - Log noise from `[SKIP]` lines — mitigated by 1-line format and the existing 1 MB log rotation.
  - 6× more heartbeat DynamoDB writes (~480 writes/day/device instead of ~80). Still well inside DynamoDB free tier for pilot scale.
- **Size**: M.

### Option D — Systemd timer migration (DESIGNS-395 Phase 1)

Replace cron entirely with systemd `.service` + `.timer` units. Dynamic interval via drop-in overrides.

- **Pros**: Native dynamic interval. Better observability via `journalctl`. Aligned with documented long-term direction.
- **Cons**: Full install.sh rewrite. Pulls in broader DESIGNS-395 Phase 1 scope. Requires root/systemd write permission — install.sh currently runs as the user, not sudo. Size L.
- **Size**: L. Not feasible as a patch release.

### Rejected on sight

- **Option E — `at(1)` self-reschedule**: `at` is not default-enabled on Pi OS Lite. Adding a daemon for one purpose is worse than the problem.
- **Option F — capture.sh spawns `sleep` children**: orphan-process graveyard, no cleanup discipline, debugging nightmare on a headless Pi.

## Decision

**We choose Option C** — hybrid fast-tick cron (`*/5 5-20`) + capture.sh self-skip gated on `INTERVAL_SECONDS`.

**Why**:
- Closes the silent-divergence gap with an observable signal (`[SKIP]` log + freshened heartbeat).
- Respects patch-level scope (fits v0.99.6.5).
- Delivers a concrete UX improvement (6× heartbeat freshness) as a side benefit, not just bug-mitigation.
- Survives the Pi Zero WH CPU budget — the skip-path cost estimate is ~1.8 s CPU/hr added, versus the existing ~2–4 s per capture. Not close to saturation.
- Maps cleanly onto the eventual Option D migration: `systemd timer` replaces `cron`; `capture.sh`'s gating logic is reused verbatim.

### Progression trigger to Option D

Option C is a *stepping stone*. Advance to Option D (systemd timers) when **any** of these fires:

- Device fleet exceeds 50 concurrent devices (heartbeat cost becomes non-trivial).
- A user legitimately requests `interval < 300s` (sub-5-min, e.g., a 60s rapid-capture for pest monitoring).
- DESIGNS-395 Phase 1 ships for other reasons (e.g., service-level observability, OS upgrades).

Until one of those triggers, the 5-min granularity + Option C is the right ceiling for pilot-phase operations.

## Implementation Plan (for v0.99.6.5)

### install.sh

1. **Cron line**: `CRON_LINE="*/5 5-20 * * * ${LITCROP_DIR}/capture.sh >> ${LITCROP_DIR}/logs/capture.log 2>&1"`
2. **Schema version marker**: prepend a comment line so future migrations key off a version, not a filename grep:
   ```bash
   CRON_HEADER="# LitCrop cron schema v2 (fast-tick + self-skip) — do not edit manually"
   ```
3. **Migration logic** — replace the current `skipping` branch:
   ```bash
   # Anchor the match on /litcrop/capture.sh (not bare "capture.sh") so
   # unrelated user cron entries like /usr/local/bin/video-capture.sh
   # aren't deleted as collateral. The `|| true` survives the
   # grep-returns-1-when-all-filtered case (a pilot Pi whose crontab
   # contains nothing but the old LitCrop v1 line) under `set -euo pipefail`.
   _migrate_pattern='(/litcrop/capture\.sh|LitCrop cron schema)'
   if crontab -l 2>/dev/null | grep -qE "$_migrate_pattern"; then
       info "Removing outdated LitCrop cron entries (schema migration)"
       crontab -l 2>/dev/null | grep -vE "$_migrate_pattern" | crontab - || true
   fi
   # Install new entry unconditionally
   (crontab -l 2>/dev/null; echo "$CRON_HEADER"; echo "$CRON_LINE") | crontab -
   info "Installed cron schema v2: every 5 min, 5am-8pm"
   ```

### capture.sh

1. **Last-capture timestamp** — track via a sidecar file, not the images directory (which can be cleared by upload cleanup):
   ```bash
   LAST_CAPTURE_FILE="${LITCROP_DIR}/.last-capture"
   ```
2. **Gating function** — called from `main()` before `capture()`:
   ```bash
   should_capture_now() {
       # No interval configured → always capture (legacy behavior)
       [[ ! "${INTERVAL_SECONDS:-}" =~ ^[0-9]+$ ]] && return 0
       # No prior capture yet → always capture
       [ ! -f "$LAST_CAPTURE_FILE" ] && return 0
       # Within interval → skip
       local last_mtime now_sec elapsed
       last_mtime=$(stat -c%Y "$LAST_CAPTURE_FILE" 2>/dev/null || stat -f%m "$LAST_CAPTURE_FILE" 2>/dev/null || echo 0)
       now_sec=$(date +%s)
       elapsed=$((now_sec - last_mtime))
       if [ "$elapsed" -lt "$INTERVAL_SECONDS" ]; then
           log "[SKIP] interval not elapsed (last=${elapsed}s ago, need ${INTERVAL_SECONDS}s)"
           return 1
       fi
       return 0
   }
   ```
3. **Capture side-effect**: on successful capture, `touch "$LAST_CAPTURE_FILE"`.
4. **Heartbeat invariant**: `send_heartbeat` runs unconditionally, even when capture is skipped. This is the freshness win; do not gate it.
5. **Test-shot bypass**: when `LITCROP_TRIGGER=test_shot`, skip the `should_capture_now` check — test shots must fire immediately.

### API schema

1. **MIN_CAPTURE_INTERVAL**: verify current minimum is ≥ 300 (5 min). If lower, raise to 300 so a user can't request a sub-tick interval.
2. **Optional UI hint**: DeviceConfigForm shows "Rounded up to 5-min ticks" under the interval field. Non-blocking — can be deferred if scope tight.

### Tests

Add to `scripts/camera-node/__tests__/smoke.bats` or a new `interval-gating.bats`:

- `run_once skips capture when last-capture mtime is within interval`
- `run_once captures when last-capture mtime is beyond interval`
- `run_once captures when .last-capture is missing (first run)`
- `heartbeat still fires on skip path`
- `test_shot trigger bypasses skip gate`
- `INTERVAL_SECONDS unset → always captures (legacy mode)`

Add to `install-hardening.bats`:

- `cron installed with schema v2 header`
- `cron re-install removes old v1 line and installs v2 cleanly`
- `cron re-install preserves unrelated user cron entries`

### Documentation

- `README.md` device section: note the 5-min tick + interval rounding semantics.
- `src/frontend/src/pages/help/device-setup.astro`: one sentence in the how-it-works paragraph.

## Consequences

### Positive

- Silent-divergence bug closes. Heartbeat freshness 6× better for free.
- Users see honest interval behavior; `[SKIP]` log line gives ground truth.
- install.sh gains a proper cron upgrade path (schema version header → future migrations are trivial).
- Migration path to systemd timers remains open and cheap.

### Negative / Risks

- ~6× more Pi Zero WH wakeups/hour. Pre-validated as tolerable (~1.8s CPU/hr skip overhead).
- Log volume up ~5–6× — still rotates at 1 MB so unbounded growth is prevented.
- DynamoDB write volume per device up 6× — ~480 heartbeats/day vs ~80. Within free tier for pilot; re-evaluate at >50 devices.
- Mitigations above plus the Option D progression trigger at 50 devices / sub-5-min requests.

### Rollback Plan

1. Revert `scripts/camera-node/install.sh` cron line to `*/30 5-20 * * *`.
2. Revert `scripts/camera-node/capture.sh`: remove `should_capture_now()` and the `LAST_CAPTURE_FILE` writes.
3. Revert API `MIN_CAPTURE_INTERVAL` if changed.
4. Existing Pis re-run install.sh (schema v2 header detects and replaces v1, but revert also replaces v2 with v1 cleanly — the logic is symmetric).
5. No data migration needed (heartbeat payload shape unchanged; DynamoDB attributes are additive).

## References

- Issue #454 — capture_interval vs cron silent-divergence
- Issue #395 — DESIGNS-395 device install rewrite (Phase 1 destination)
- `scripts/camera-node/install.sh` (cron schema line 191 today)
- `scripts/camera-node/capture.sh` (config poll at 194–270, heartbeat at 359–460)
- `packages/shared/src/schemas/index.ts` (MIN_CAPTURE_INTERVAL constant)
- [ADR-20260317-device-communication](ADR-20260317-device-communication.md) — base heartbeat contract
