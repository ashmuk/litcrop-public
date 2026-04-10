# Requirements: Tiered Device Classes (#337)

> Step 1 — Requirements (cc-define)
> Date: 2026-04-10
> Sprint: Beta-11 (Device Integration Refinement)

## 1. Problem Statement

The current Beta-11 device integration treats all camera nodes identically. In practice, devices vary in hardware capabilities:
- A basic Pi Zero W with just a camera has no power management or motion sensor
- A solar-powered node with a battery HAT needs sleep scheduling
- A PIR-equipped node can do event-triggered capture

The setup and configuration flow should adapt per device capability, not expose options that don't apply. Today the UI has scattered checks (`has_pir_sensor`, `has_battery_sensor`) but no unified concept of tiers.

## 2. Current State (from code audit)

### What exists
- `DeviceCapabilities` interface: `resolutions: string[]`, `has_battery_sensor: boolean`, `has_pir_sensor: boolean`
- Heartbeat endpoint accepts optional `capabilities` report from Pi
- `DeviceConfigForm` already checks `has_pir_sensor` to gate the **disabled state** of the motion radio (visual only — the radio has `checked={false}` and a no-op onChange; functional motion trigger is Phase 2)
- `DeviceListPage` shows "N/A" for battery when `has_battery_sensor === false`
- `install.sh` detects camera via `rpicam-hello --list-cameras`
- `capture.sh` reads `/sys/class/power_supply/*/capacity` to detect battery at runtime

### What's missing
- No unified "device class" concept — capabilities are scattered in UI
- No tier-specific defaults (capture interval, resolution, trigger mode)
- `install.sh` doesn't detect or ask about battery/PIR hardware
- Config UI doesn't progressively reveal options per tier
- No "upgrade path" UX — user can't see what features their tier lacks
- `capabilities` is `null` until first heartbeat — tier is unknown on initial device list view

## 3. Tier Definitions

| Class | Name | Capabilities | Hardware Example |
|-------|------|--------------|------------------|
| **1** | Basic | Camera only | Pi Zero W + Camera Module |
| **2** | Power-managed | Class 1 + battery sensor + sleep scheduling | Pi Zero W + battery HAT + solar |
| **3** | Sensor-equipped | Class 2 + PIR motion sensor (+ future env sensors) | Pi Zero W + PIR + battery HAT |

### Tier derivation from existing capabilities

| Class | has_battery_sensor | has_pir_sensor | Notes |
|-------|---|---|---|
| 1 | false | false | Basic camera only |
| 2 | true  | false | Power-managed |
| 3 | true  | true  | Full sensor suite |
| 3 (promoted) | false | true | PIR is the discriminator — promoted to Class 3 regardless of battery (resolved per §11 #2) |

All 4 capability combinations map to a defined class; no invalid states.

## 4. Functional Requirements

### FR-1: Derive Device Class from Capabilities (no storage change)
Add a helper `getDeviceClass(caps: DeviceCapabilities | null): 1 | 2 | 3 | 'unknown'` in `packages/shared/src/devices.ts`.
- Returns `1` | `2` | `3` based on sensor presence
- Returns `'unknown'` when `caps === null` (before first heartbeat)
- Priority: **HIGH**

### FR-2: ~~Tier-Aware Default Suggestions~~ — DEFERRED to Phase 2
UI hints showing "Recommended for Class N" next to existing config fields. Not needed for MVP — the tier badge + banner give users adequate tier awareness. Track as a separate Phase 2 issue.

Suggested defaults (for reference when implemented):

| Setting | Class 1 hint | Class 2 hint | Class 3 hint |
|---|---|---|---|
| capture_interval (sec) | 1800 (30m) | 3600 (1h) | 900 (15m) |
| resolution | 1280×720 | 1920×1080 | 1920×1080 |
| jpeg_quality | 80 | 85 | 85 |
| active_window | 05:00–20:00 | 06:00–18:00 | 00:00–23:59 |

- Priority: **DEFERRED** (Phase 2)

### FR-3: Tier Badge + Adaptive Progressive Disclosure (no new config fields — MVP scope)
`DeviceConfigForm.tsx` should progressively adapt based on `getDeviceClass(device.capabilities)` using **only existing schema fields**:

**All classes (no change):**
- node_name, bed_id, capture_interval, resolution, jpeg_quality, active_window — already present

**Tier-aware behavior (no new fields):**
- **Tier badge** at the top of the form: "Class 1" / "Class 2" / "Class 3" / "Pending"
- **Class 1** banner: "Basic camera — scheduled capture only" (informational)
- **Class 2** banner: "Power-managed — battery monitoring enabled" (informational)
- **Class 3** banner: "Sensor-equipped — motion capture coming soon" (informational; motion trigger implementation is Phase 2)
- **Unknown** (null capabilities) banner: "Device hasn't reported capabilities yet. Tier will be detected after first heartbeat."

**Behavior preserved (already works today):**
- `hasPirSensor` check (`DeviceConfigForm.tsx:55`) still gates the **disabled state** of the motion radio. Note: the motion radio is currently a **visual placeholder only** — it has `checked={false}` hardcoded and a no-op `onChange` (`DeviceConfigForm.tsx:339-345`). Wiring motion as a functional trigger is a Phase 2 scope item.
- `availableResolutions` (lines 57-60) still reads from `capabilities.resolutions`
- `has_battery_sensor` check still drives battery display in DeviceListPage (line 86)

**Explicit non-goal for MVP:** No new config fields (battery_threshold, sleep_start/end, motion_cooldown_sec). Those go to Phase 2 as a separate issue — they require schema changes, DynamoDB persistence, and capture.sh logic.

- Priority: **HIGH**

### FR-4: Tier Badge in DeviceListPage
Show a compact static tier badge next to each device: "Class 1" / "Class 2" / "Class 3" / "Pending" (for unknown). Plain visual element — no click-to-expand for MVP.
- Priority: **MEDIUM**

### FR-5: install.sh Capability Prompts
Enhance `install.sh` to ask the user about hardware during interactive setup (confirmed per §11 #3):
```
Does this device have a battery HAT? [y/N]
Does this device have a PIR motion sensor? [y/N]
```
Store answers in `~/litcrop/hardware.conf` (separate from `.env` — see note below):
```
HAS_BATTERY_SENSOR=1
HAS_PIR_SENSOR=0
```

**Implementation note:** During implementation we chose to write to a dedicated `~/litcrop/hardware.conf` file (mode 600) rather than appending to `.env`. Rationale: `.env` is downloaded fresh from the web UI on credential rotation; mixing hardware flags in would risk wiping them on every `.env` refresh. `hardware.conf` is set once at install and survives independently.

- Priority: **HIGH** — blocks FR-6 (capture.sh reads these flags)

### FR-6: capture.sh Capability Reporting
`capture.sh` should include a `capabilities` object in the heartbeat request, reading from the `HAS_*` flags written to `~/litcrop/.env` by FR-5. Today capture.sh reports only health metrics (battery, wifi, storage) — no `capabilities` field.

Derivation logic (user-declared, not runtime-probed — keeps a single source of truth):
```sh
has_battery_sensor=$( [ "$HAS_BATTERY_SENSOR" = "1" ] && echo "true" || echo "false" )
has_pir_sensor=$(     [ "$HAS_PIR_SENSOR"     = "1" ] && echo "true" || echo "false" )
resolutions='["1920x1080","1280x720"]'  # hardcoded for now; rpicam-hello detection is Phase 2
```

**Drive-by fix (piggybacks on this FR):** The current capture.sh heartbeat payload uses keys that do NOT match the API schema:

| Current capture.sh key | API schema key (`DeviceHeartbeatRequestSchema`) |
|---|---|
| `battery_pct` | `battery_level` |
| `wifi_dbm` | `wifi_signal_dbm` |
| `storage` | `storage_status` |

This is a pre-existing bug that means health metrics never actually reach DynamoDB. Fix alongside FR-6 since we're already touching capture.sh's heartbeat payload.

- Priority: **HIGH** — blocks tier detection; also fixes silent heartbeat payload bug

### FR-7: Tier-Aware install.sh Branching (optional)
`install.sh` currently detects camera but skips PIR/battery. Enhance to:
- If `HAS_BATTERY_SENSOR=1`: install battery monitoring dependencies (none needed beyond `/sys/class/power_supply` which is kernel-provided)
- If `HAS_PIR_SENSOR=1`: install PIR GPIO dependencies (future)
- Priority: **LOW** — mostly documentation; functionally Class 1 install works for any tier

## 5. Non-Functional Requirements

### NFR-1: No Data Migration
Deriving class from capabilities means no DynamoDB migration. Existing devices continue to work — they report capabilities via heartbeat as today, and the UI starts showing tier badges automatically.

### NFR-2: Backward Compatibility
Old devices running pre-Beta-11 `capture.sh` don't report `capabilities`. The system must gracefully show them as "Class unknown" and not crash.

### NFR-3: Single Source of Truth
Tier derivation logic must exist in exactly one place (shared helper). Any new tier-aware code (backend or frontend) must import this helper — no inline class calculation.

### NFR-4: Forward Compatibility
Adding new capabilities (e.g., `has_env_sensor`) should not break existing tier logic. The helper must handle unknown future fields gracefully.

## 6. Constraints

- **Budget:** No infrastructure changes — no backend API changes either (the `capabilities` field is already present in `DeviceHeartbeatRequestSchema`)
- **Scope:** No new hardware support — only tier-aware UI/config based on existing capability fields
- **Rollout:** Progressive enhancement — Class 1 devices (no capabilities) keep working unchanged
- **Scope Level:** MVP (fits Beta-11 sprint; no external dependencies)

## 7. Design Questions

1. **Tier stored vs derived?**
   - **Recommendation:** Derive. Simpler, no migration, single source of truth.
2. **PIR without battery — Class 3 or invalid?**
   - **Recommendation:** Class 3. PIR is the discriminator; battery is assumed present (Pi needs power regardless).
3. **When to detect capabilities — install.sh or first heartbeat?**
   - **Recommendation:** Both. install.sh asks user (via prompts and .env), capture.sh reports them in first heartbeat. Auto-detection can be added later as an enhancement.
4. **Default trigger for Class 3 — scheduled or motion?**
   - **Recommendation:** Scheduled (current default). Motion trigger gated behind a feature flag in Phase 2.

## 8. Out of Scope (for this sprint — defer to Phase 2)

- **New config fields** (battery_threshold, sleep_start/end, motion_cooldown_sec, event burst count) — require schema changes, DynamoDB persistence, and capture.sh logic. Create a separate Phase 2 issue.
- **Motion trigger implementation** — UI radio already exists (gated by `hasPirSensor`). Actual capture-triggering logic in capture.sh is Phase 2.
- **Environmental sensor support** (DHT22, temperature/humidity) — future DeviceCapabilities extension
- **Hardware auto-detection scripts** (GPIO probing) — currently user-declared via install.sh prompts
- **Device firmware updates** — separate sprint
- **Multi-camera nodes** — device model assumes one camera per node

## 8a. MVP Scope Summary

This sprint ships a UI-layer enhancement **without any DB or API schema changes**:
- Tier derivation helper (pure function, no persistence)
- Static tier badge in DeviceListPage + DeviceConfigForm
- Informational tier banners in DeviceConfigForm (no new input fields, no hints — hints deferred to Phase 2)
- Pi-side reporting — `install.sh` interactive prompts + `capture.sh` includes `capabilities` in heartbeat
- Drive-by: fix pre-existing capture.sh heartbeat key mismatches (`battery_pct` → `battery_level`, etc.)

All existing devices continue to work unchanged. New devices progressively gain tier awareness as they report capabilities via heartbeat.

## 8b. Phase 2 Schema Delta (for future issue)

When Phase 2 ships functional tier-specific config, the following schema changes will be needed:

**Domain types** (`packages/shared/src/types/domain.ts`):
- Change `trigger_type: 'scheduled'` literal → `trigger_type: 'scheduled' | 'motion'` union
- Add optional fields to `Device`: `battery_threshold?: number`, `sleep_window?: { start: string; end: string }`, `motion_cooldown_sec?: number`, `event_burst_count?: number`

**Schemas** (`packages/shared/src/schemas/index.ts`):
- Update `DeviceConfigSchema` to include the new fields
- Update `DeviceConfigResponseSchema` (poll endpoint) to send them to the Pi

**DynamoDB** (`src/api/src/services/dynamodb.ts`):
- Backward-compatible migration — new fields are nullable/optional
- `itemToDevice()` mapping must handle null → undefined

**capture.sh**:
- Read new fields from `/devices/:id/config` response
- Implement GPIO polling loop for motion trigger (if `trigger_type === 'motion'`)
- Respect `battery_threshold` before capturing
- Respect `sleep_window` to enter low-power mode

**DeviceConfigForm.tsx**:
- Wire the motion radio `onChange` to actually set `triggerType`
- Add input fields for the new Class 2/3 config
- Add validation (e.g., `battery_threshold` between 0-100)

## 9. Deliverables

1. `docs/REQUIREMENTS-337.md` (this doc)
2. `docs/TASK-BREAKDOWN-337.md` (from /cc-design)
3. ADR entry in `ARCHITECTURE.md` or `docs/decisions/` for the derived-vs-stored decision
4. New `packages/shared/src/devices.ts` with `getDeviceClass()` helper — exported via `packages/shared/src/index.ts`
5. Updated `DeviceConfigForm.tsx` (tier badge + banners, preserve existing hasPirSensor check)
6. Updated `DeviceListPage.tsx` (static tier badge on DeviceCard)
7. Updated `capture.sh` — add `capabilities` to heartbeat payload + fix pre-existing key mismatches
8. Updated `install.sh` — interactive Y/N prompts, write `HAS_*` flags to `~/litcrop/.env`
9. Tests for tier derivation logic (5 input states)
10. Phase 2 follow-up issue tracking the deferred items (see §8b)

## 10. Success Criteria

- [ ] `getDeviceClass(caps)` returns correct tier for all 5 input states:
  - `{false, false}` → `1`
  - `{true,  false}` → `2`
  - `{true,  true}`  → `3`
  - `{false, true}`  → `3` (PIR-promoted edge case)
  - `null` → `'unknown'`
- [ ] Automated tests cover all 5 states above
- [ ] DeviceListPage shows static tier badge on each DeviceCard (including "Pending" for null)
- [ ] DeviceConfigForm shows tier badge + tier-appropriate informational banner (no new config fields)
- [ ] Class 3 banner does NOT promise motion trigger functionality (worded as "coming soon")
- [ ] Existing `hasPirSensor` and `has_battery_sensor` checks continue to work unchanged
- [ ] capture.sh reports `capabilities` object in heartbeat (verified via heartbeat endpoint logs)
- [ ] capture.sh heartbeat payload uses correct API schema keys (`battery_level`, `wifi_signal_dbm`, `storage_status`) — drive-by fix from FR-6
- [ ] install.sh prompts user for battery/PIR presence and writes `HAS_BATTERY_SENSOR` / `HAS_PIR_SENSOR` to `~/litcrop/.env`
- [ ] No schema changes to domain types, DynamoDB, or API request/response
- [ ] No existing device breaks after deploy (backward compat)
- [ ] All tests pass

## 11. User-Confirmed Decisions (2026-04-10)

1. **Derive tier from capabilities** — no `device_class` field in storage. Single source of truth = `DeviceCapabilities`.
2. **PIR without battery → Class 3** — PIR is the discriminator. Battery is assumed present on any Pi.
3. **install.sh uses interactive Y/N prompts** — written to `~/litcrop/hardware.conf` (not `.env`, per implementation choice — see FR-5 note) as `HAS_BATTERY_SENSOR=1` / `HAS_PIR_SENSOR=1`. Flag-based fallback (`install.sh --has-battery --has-pir`) for unattended installs is optional.
4. **Class 3 default trigger_type stays `scheduled`** — motion trigger UI radio already exists (gated by `hasPirSensor`). Actual motion-triggered capture logic is Phase 2.

## 12. Next Steps

Run `/cc-design` to proceed to Step 2 (Architecture) and subsequent steps. Key decisions for cc-design:
- `getDeviceClass()` signature and location (`packages/shared/src/devices.ts`)
- Tier badge component — reusable between DeviceListPage and DeviceConfigForm
- Banner copy for each tier (EN + JA)
- install.sh prompt wording and .env schema
- capture.sh heartbeat payload changes
