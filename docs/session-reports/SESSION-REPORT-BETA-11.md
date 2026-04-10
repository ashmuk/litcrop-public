# Session Report: Beta-11 (Device Tier Classes)

> Date: 2026-04-10
> Session: beta-11 (#337 implementation session)
> Base tag: v0.47
> Branch: develop (10 unpushed commits)
> Tests: 781 → 790 (+9)
> Commits: 10

## Summary

Tackled Beta-11's core design task (#337 tiered device classes) through the full pipeline:
`/cc-define` → `/cc-design` → `/cc-implement` → `/simplify` → `/cc-review` → `/cc-remediate` → `/cc-test`.

Shipped a UI-layer tier system for camera nodes with zero schema changes. Discovered and partially fixed a dormant Beta-5 bug in the heartbeat payload (key mismatch), and filed a follow-up issue (#341) for the blocking auth mismatch that prevents end-to-end validation.

Also performed Beta-11 scope reorganization: moved #240 and #242 out of the sprint to focus Beta-11 on tier work only.

## Completed Work

### #337 — Tiered Device Classes (step:implement, pending merge)

Adaptive UI that classifies camera nodes as Class 1 (basic), Class 2 (power-managed), or Class 3 (sensor-equipped) based on reported `DeviceCapabilities`. Tier drives UI visibility of config options and provides informational banners.

**Full pipeline execution:**

| Stage | Output |
|---|---|
| `/cc-define` | `docs/REQUIREMENTS-337.md` — 7 FRs, current-state audit, tier matrix |
| `/cc-define` checkpoint review | 3 MUST-FIX resolved before design phase |
| `/cc-design` | `docs/TASK-BREAKDOWN-337.md` — 5-batch plan, shared helper signature, banner copy (EN/JA), install.sh prompts |
| `/cc-implement` | 5 batches committed |
| `/simplify` | 3 parallel agent reviews — found phantom color tokens + nested ternary + duplication |
| `/cc-review` | my-reviewer found 1 MUST-FIX (schema nullability), 2 SHOULD-FIX, 3 SUGGESTIONS |
| `/cc-remediate` | Applied all MUST-FIX + 2 SHOULD-FIX, +3 regression tests |
| `/cc-test` | 790 tests passing, verified coverage matches success criteria |

**10 commits on develop:**

| Commit | Description |
|--------|-------------|
| `dd02152` | Design assets: LitCrop visual style guide + reference mockup |
| `27ed86a` | Requirements doc for #337 |
| `37e81ec` | Task breakdown + 5-batch plan |
| `4b19b43` | `getDeviceClass()` shared helper + 6 tests (5 input states + undefined) |
| `5f57ca5` | `TierBadge` component + i18n (EN/JA) |
| `dee79c2` | DeviceListPage tier badge integration |
| `3ec0aa4` | DeviceConfigForm tier badge + informational banners |
| `05459ed` | Pi-side: install.sh prompts + capture.sh capabilities (+ drive-by heartbeat key fix) |
| `6b630a8` | Simplify: `TIER_PRESENTATION` shared record + real `--color-status-*` tokens |
| `6416653` | Remediation: `wifi_signal_dbm.nullable()` + 3 new contract tests |

**Design decisions (user-confirmed):**

1. **Derive tier from capabilities** — no storage change, single source of truth
2. **PIR without battery → Class 3** — PIR is the discriminator
3. **install.sh uses interactive Y/N prompts → `~/litcrop/hardware.conf`** — separate file from `.env` for safety
4. **Motion trigger stays deferred to Phase 2** — visual placeholder only

**Tier matrix implemented:**

| Class | has_battery_sensor | has_pir_sensor | UI State |
|---|---|---|---|
| 1 | false | false | Static label "🫘 Basic camera" |
| 2 | true | false | Static label "🪫 Power-managed" |
| 3 | true | true | Static label "📡 Sensor-equipped" |
| 3 (promoted) | false | true | Same as above |
| unknown | null | null | "Pending" badge + "detecting" banner |

### Drive-by Fix: capture.sh Heartbeat Key Mismatch

While touching capture.sh for FR-6, discovered pre-existing Beta-5 bug where heartbeat payload used wrong keys:

| Old (broken, silently dropped) | New (matches API schema) |
|---|---|
| `battery_pct` | `battery_level` |
| `wifi_dbm` | `wifi_signal_dbm` |
| `storage` | `storage_status` |

Device health metrics have been silently dropped since Beta-5. Now fixed.

## Issues

### Created

| Issue | Title | Status |
|---|---|---|
| **#341** | bug(device): heartbeat auth mismatch — capture.sh uses Bearer JWT but API expects X-Device-Key | Open, priority:high |

**Discovered by reviewer:** `capture.sh` sends `Authorization: Bearer $AUTH_TOKEN` (user's Cognito JWT) but the heartbeat route requires `X-Device-Key` via `verifyDeviceKey()`. Device heartbeats have never worked end-to-end. This blocks field validation of #337 but is pre-existing and out of scope.

### Scope Reorg (Beta-11)

| Issue | Moved From | Moved To | Reason |
|---|---|---|---|
| #240 install.sh URL | Beta-11 | Pre-Production | Depends on #238 custom domain |
| #242 device-to-cloud animation | Beta-11 | Backlog/PENDING | Not mandatory; existing text docs sufficient |

**Beta-11 is now a focused 2-issue sprint:** #337 (implementation done) + #341 (follow-up bug). With those closed, Beta-11 is complete.

## Architecture Artifacts

| File | Change |
|---|---|
| `docs/REQUIREMENTS-337.md` | NEW — 7 FRs, tier matrix, §8b Phase 2 schema delta |
| `docs/TASK-BREAKDOWN-337.md` | NEW — 5-batch plan with bash snippets |
| `packages/shared/src/devices.ts` | NEW — `getDeviceClass()` + `DeviceClass` type |
| `packages/shared/src/__tests__/devices.test.ts` | NEW — 6 tests (all tier states) |
| `src/frontend/src/components/TierBadge.tsx` | NEW — badge + `TIER_PRESENTATION` record |
| `src/frontend/src/components/DeviceListPage.tsx` | Added tier badge in DeviceCard |
| `src/frontend/src/components/DeviceConfigForm.tsx` | Added tier badge + informational banner |
| `scripts/camera-node/install.sh` | Added hardware prompts → `~/litcrop/hardware.conf` |
| `scripts/camera-node/capture.sh` | Reports `capabilities` + fixed payload keys |
| `packages/shared/src/schemas/index.ts` | `wifi_signal_dbm.nullable()` fix |
| `src/api/src/__tests__/contracts-beta5.test.ts` | +3 heartbeat schema regression tests |
| `src/frontend/src/i18n/en.json` + `ja.json` | +8 tier i18n keys each |

## Test Health

```
  Metric      v0.47      End        Delta
──────────────────────────────────────────
  Suites      36         37         +1 (devices.test.ts)
  Tests       781        790        +9
  Pass rate   100%       100%       —
```

**New tests (9):**
- 6 `getDeviceClass()` tests (Class 1/2/3/3-promoted/null/undefined)
- 3 `DeviceHeartbeatRequestSchema` contract tests (null wifi, null battery, capabilities payload)

## Pipeline Discipline

Each pipeline stage produced concrete outcomes:

| Stage | Findings | Resolution |
|---|---|---|
| `/cc-define` checkpoint review | 3 MUST-FIX, 8 SHOULD-FIX, 3 SUGGESTIONS | All resolved before design |
| `/simplify` | 2 ISSUE, 5 SUGGESTION | Shared `TIER_PRESENTATION`, real tokens |
| `/cc-review` | 1 MUST-FIX, 2 SHOULD-FIX, 3 SUGGESTIONS | Schema nullability + docs drift fixed; #341 filed for pre-existing auth bug |
| `/cc-test` | Coverage assessment | 9 new tests match all success criteria; 790 passing |

## What's Next

| Priority | Item | Scope |
|---|---|---|
| 1 | Push 10 commits + create PR for #337 | ops |
| 2 | Merge #337 to main (auto-deploy) | ops |
| 3 | #341 fix (heartbeat auth) — unblocks #337 field validation | Beta-11 |
| 4 | Start Pre-PROD design sprint (#281 + #334) | Pre-PROD |

## Outstanding Risks

```
  ⚠  #341 blocks end-to-end validation of #337 capability reporting in production
     — device health has been silently broken since Beta-5
  ⚠  10 unpushed commits on develop — push ASAP to avoid work-at-risk
  ⚠  v0.47 tag is 9+ commits behind HEAD — needs update after push
  ⚠  No BedDetail/DeviceConfigForm component test infra (known gap, reviewer
     flagged in both #313 and #337 reviews)
```

## Key Insights

**The drive-by heartbeat key fix exposed two latent bugs at once:**
1. Payload keys didn't match API schema (fixed in this session)
2. `wifi_signal_dbm` was `.optional()` not `.nullable().optional()` — caught by reviewer

Both were hidden because the first bug was masking the second. The pipeline's simplify→review→remediate progression surfaced them in sequence.

**`hardware.conf` vs `.env` separation** was an implementation divergence from the requirements doc, justified by a clean rationale:
- `.env` is downloaded fresh on credential rotation
- `hardware.conf` is set once at install
- Mixing would wipe hardware flags on every credential refresh

The reviewer flagged the requirements doc as outdated — now fixed.

**Beta-11 scope reorganization** showed the value of questioning sprint membership. Two issues (#240, #242) were nominally Beta-11 but neither was blocking the core device work. Moving #240 to Pre-PROD (where its #238 dependency lives) and #242 to backlog tightens Beta-11 to exactly what's needed.
