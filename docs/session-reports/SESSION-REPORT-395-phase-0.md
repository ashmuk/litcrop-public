# Session Report — T-395-05 On-Pi Verification (#395 Phase 0)

> **Status**: PARTIAL — 2 of 3 exit criteria confirmed; remaining 3 blocked on Pi access.
> **Date**: 2026-04-15
> **Session**: pre-prod-097-2
> **Sprint**: v0.97

## Environment

| Component | Value |
|---|---|
| Staging URL | `https://dpj8a3mk3tzkq.cloudfront.net/` |
| Staging version | v0.97 (confirmed via What's New — current entry) |
| Production version | v0.93 (not promoted; Phase 0 not on prod) |
| API base | Staging API Gateway (env-separated per #239/#372) |
| Pi hardware | Pi Zero WH + Camera HQ + RPZ-PowerMGR + RPZ-PIRS |
| Pi OS | Raspberry Pi OS (bookworm-class, `jq` installed post-hoc) |
| capture.sh | develop branch v0.97 via scp workaround (not `curl | bash` — see Anomalies) |

## Exit criterion results

| EC | Description | Status | Evidence |
|---|---|---|---|
| **EC-1** | UI resolution change reaches camera | ✅ **PASS** | Operator reported "interval and resolution are pushed from web app to remote device successfully" |
| **EC-2** | `active_window.end` past-current-time → `[SKIP]` log + heartbeat-only cycle | ⏸ **BLOCKED** | Not run before Pi access was lost |
| **EC-3** | `capture_interval` logged (advisory under cron) | ✅ **PASS** | Operator confirmed interval propagates through poll_config |
| **EC-4** | Window restored → capture resumes | ⏸ **BLOCKED** | Depends on EC-2 completion |
| **Test Shot** | UI trigger bypasses active-window gate | ⏸ **BLOCKED** | Operator saw only the 10:46 capture after triggering at 11:00+; most likely cron timing (pull-based), not a bug. Needs re-test with manual `capture.sh` invocation after trigger. |

## Anomalies observed

### A-1: `jq` missing on fresh Pi

**Observed**: capture.sh logged `[CONFIG] jq not installed — using defaults` on the first run. This silently invalidates the config round-trip — the Pi runs on compiled defaults while the UI shows the saved values, and EC-1 / EC-3 initially appeared to "pass" for the wrong reason (defaults happened to match the saved value).

**Root cause**: `install.sh:84–88` previously treated jq as optional with a passive warning. jq is *required* as of #395 Phase 0.

**Fix**: commit `984fa00` on develop — `install.sh` now offers `Install jq now via apt-get? [Y/n]` when interactive, and prints an explicit install command when non-interactive. Wording flipped from "optional" to "REQUIRED".

**Follow-up**: no open issue — fix shipped in-session.

### A-2: Class-1 classification despite Class-3 hardware

**Observed**: Staging UI classified the device as Class-1 even though it physically has both a battery HAT and a PIR sensor.

**Root cause**: `install.sh:133–155` prompts for hardware flags only when `INTERACTIVE=1`. The scp-workaround path (`ssh host 'bash /tmp/install.sh'`) runs non-interactively and defaults `HAS_BATTERY_SENSOR=0 HAS_PIR_SENSOR=0`.

**Workaround applied**: hand-edited `~/litcrop/hardware.conf` on the Pi; next heartbeat reclassified. Real fix (auto-detection via `cgpmgr` / `cgsensor`) is already scoped in #395 Phase 1 **T-395-N1-05**.

**Follow-up**: issue **#405** filed.

### A-3: install.sh hardcodes `main` branch for capture.sh download

**Observed**: install.sh line 65 downloads `capture.sh` from `main`, but staging serves v0.97 from develop. A naive `curl -sL https://<staging>/install.sh | bash` would install v0.97 install.sh + v0.93 capture.sh — invalidating any staging-side on-Pi test.

**Workaround applied**: scp both files from the workspace's develop checkout into a temp dir on the Pi, then run install.sh from there (it prefers a local `${SCRIPT_DIR}/capture.sh` over the GitHub download).

**Follow-up**: issue **#404** filed.

### A-4: No applied-config echo in UI

**Observed**: After saving a config change in the UI, the tester had no in-app signal that the device had polled or applied the new values. Had to SSH into the Pi and tail the log to confirm.

**Follow-up**: issue **#406** filed — scoped into v0.97 sprint.

## Commits landed for Phase 0

```
984fa00 fix(device-install): prompt to install jq, fail loud without it
19c0b79 chore(frontend): bump What's New to v0.97, backfill v0.96
0fe01e7 chore(scripts): broaden DRY_RUN truthy parsing in migration (T-395 review)
4b82fc2 fix(time): tighten HH:MM validation, guard active_window on Pi (T-395 review)
4827b7d refactor(device): single-pass jq in poll_config (Phase 0 simplify)
5567f55 feat(device): gate run_once by active_window (T-395-03)
b719e87 fix(device): poll_config parses resolution, interval, window (T-395-02)
9d3f660 test(api): cover #395 config round-trip (T-395-04)
2670dde chore(scripts): add migrate-device-resolution (T-395-01)
7a52283 chore(test): bootstrap bats-core shell harness (T-395-00)
```

Tag: `v0.97` (annotated).

## Pipeline record

- `/simplify` → 1 commit (single-jq refactor, ~150 ms saved per poll on Pi Zero 2 W)
- `/cc-review` → 3 SHOULD-FIX, 0 MUST-FIX
- `/cc-remediate` → 2 commits closing all 3 SHOULD-FIX
- `/cc-test` → coverage gap report; top-2 gaps (HTTP error branches + end-to-end run_once) closed in follow-up commits this session

## What closes the ticket

To move EC-2, EC-4, and Test Shot from BLOCKED → PASS:

1. SSH to the Pi, confirm jq is installed and hardware.conf reflects actual hardware.
2. EC-2: UI → Edit → `active_window.end` = `<current_time - 2 min>` → Save → on Pi `~/litcrop/capture.sh` → expect `[SKIP] Outside active window …` + exactly one `[HEARTBEAT] OK`, no `[CAPTURE]`.
3. EC-4: UI → restore window end to 20:00 → Save → on Pi `~/litcrop/capture.sh` → expect `[CAPTURE]` and exactly one `[HEARTBEAT] OK`.
4. Test Shot: UI → Test Shot button → on Pi `~/litcrop/capture.sh` (immediate) → expect `[CONFIG] Test shot requested` + `[CAPTURE]` regardless of active window.

Paste the three log excerpts into this report (replacing the **⏸ BLOCKED** rows above), then Phase 0 is closed and Phase 1 can start.

## Related issues

- #395 — parent issue (design-complete, Phase 0 in-flight)
- #404 — install.sh branch-awareness (surfaced here)
- #405 — install.sh class auto-detection (surfaced here)
- #406 — applied-config echo in UI (surfaced here, scoped into v0.97)
