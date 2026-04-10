# Task Breakdown: Tiered Device Classes (#337)

> Steps 5-7 — System Design, Tasks, Plan
> Date: 2026-04-10
> Sprint: Beta-11
> Source of truth: `docs/REQUIREMENTS-337.md`
> Architecture: No changes — uses existing `DeviceCapabilities` + heartbeat pipeline

## System Design

No new components, services, or data models. Changes are:
1. **Shared helper** — `getDeviceClass()` pure function + `DeviceClass` type
2. **Frontend UI** — tier badge component + informational banners (no new inputs)
3. **Pi-side scripts** — `install.sh` prompts, `capture.sh` capability reporting + key-mismatch fix
4. **Tests** — tier derivation (5 input states)

### Design decisions (finalized)

| Decision | Choice | Rationale |
|---|---|---|
| Tier storage | Derive from capabilities | Single source of truth, no migration |
| PIR-only edge case | Promote to Class 3 | PIR is the discriminator |
| Capability detection | User-declared via install.sh prompts | Reliable, no runtime probing uncertainty |
| Motion trigger | UI placeholder only | Actual wiring deferred to Phase 2 |
| New config fields | None this sprint | Schema changes deferred to Phase 2 |

### File map

```
 Layer      File                                          FR    Change
────────────────────────────────────────────────────────────────────────────
 Shared     packages/shared/src/devices.ts                FR-1  NEW — helper + type
 Shared     packages/shared/src/index.ts                  FR-1  Re-export
 Frontend   components/DeviceListPage.tsx                 FR-4  Add static tier badge to DeviceCard
 Frontend   components/DeviceConfigForm.tsx               FR-3  Add tier badge + banner at top
 Frontend   components/TierBadge.tsx                      FR-4  NEW — reusable badge component
 Frontend   i18n/en.json + ja.json                        FR-3  New keys: device.class_*, device.tier_banner_*
 Pi         scripts/camera-node/install.sh                FR-5  Interactive Y/N prompts → .env
 Pi         scripts/camera-node/capture.sh                FR-6  capabilities payload + key mismatch fix
 Tests      packages/shared/src/__tests__/devices.test.ts FR-1  NEW — 5 input state tests
```

### `getDeviceClass()` signature

```ts
// packages/shared/src/devices.ts

import type { DeviceCapabilities } from './types/domain';

export type DeviceClass = 1 | 2 | 3 | 'unknown';

/**
 * Derive the device tier (1/2/3/unknown) from reported capabilities.
 * - Class 1: basic camera only (no sensors)
 * - Class 2: has battery sensor, no PIR
 * - Class 3: has PIR sensor (with or without battery — PIR is the discriminator)
 * - 'unknown': no capabilities reported yet (null)
 */
export function getDeviceClass(caps: DeviceCapabilities | null | undefined): DeviceClass {
  if (!caps) return 'unknown';
  if (caps.has_pir_sensor) return 3;
  if (caps.has_battery_sensor) return 2;
  return 1;
}
```

**Order matters:** PIR check first ensures PIR-without-battery correctly promotes to Class 3.

### TierBadge component signature

```tsx
// src/frontend/src/components/TierBadge.tsx
interface TierBadgeProps {
  deviceClass: DeviceClass;
  size?: 'sm' | 'md';
}

// Renders: "Class 1" | "Class 2" | "Class 3" | "Pending"
// Color coding: gray (1) / blue (2) / green (3) / yellow (unknown)
```

### Banner copy (EN + JA)

| Class | EN | JA |
|---|---|---|
| 1 | Basic camera — scheduled capture only | 基本カメラ — 定時撮影のみ |
| 2 | Power-managed — battery monitoring enabled | 電源管理対応 — バッテリー監視有効 |
| 3 | Sensor-equipped — motion capture coming soon | センサー対応 — モーション撮影は今後対応予定 |
| unknown | Device hasn't reported capabilities yet. Tier will be detected after first heartbeat. | デバイスがまだ機能を報告していません。最初のハートビート後にクラスが判定されます。 |

### install.sh prompt design

```sh
# Added after camera detection, before .env download

echo ""
echo "== Hardware Configuration =="
read -r -p "Does this device have a battery HAT? [y/N] " battery_answer
HAS_BATTERY_SENSOR=$( [[ "$battery_answer" =~ ^[yY] ]] && echo "1" || echo "0" )

read -r -p "Does this device have a PIR motion sensor? [y/N] " pir_answer
HAS_PIR_SENSOR=$( [[ "$pir_answer" =~ ^[yY] ]] && echo "1" || echo "0" )

# Write to .env (preserve existing keys if file exists)
cat >> ~/litcrop/.env <<EOF
HAS_BATTERY_SENSOR=$HAS_BATTERY_SENSOR
HAS_PIR_SENSOR=$HAS_PIR_SENSOR
EOF

echo "Hardware flags saved to ~/litcrop/.env"
```

**Non-interactive fallback:** Allow `install.sh --has-battery --has-pir` flags for unattended installs (SUGGESTION from review; low priority).

### capture.sh heartbeat payload changes

**Current (broken) payload:**
```json
{
  "battery_pct": 85,         // ❌ API expects battery_level
  "wifi_dbm": -67,           // ❌ API expects wifi_signal_dbm
  "storage": "ok"            // ❌ API expects storage_status
}
```

**New payload:**
```json
{
  "battery_level": 85,
  "wifi_signal_dbm": -67,
  "storage_status": "ok",
  "capabilities": {
    "has_battery_sensor": true,
    "has_pir_sensor": false,
    "resolutions": ["1920x1080", "1280x720"]
  }
}
```

**Derivation logic in capture.sh:**
```sh
# Read hardware flags from .env (sourced at script start)
has_battery_sensor=$( [ "$HAS_BATTERY_SENSOR" = "1" ] && echo "true" || echo "false" )
has_pir_sensor=$( [ "$HAS_PIR_SENSOR" = "1" ] && echo "true" || echo "false" )

# Build heartbeat JSON (jq-assembled to avoid escaping issues)
heartbeat_payload=$(jq -n \
  --argjson battery "${battery_level:-null}" \
  --argjson wifi "${wifi_signal:-null}" \
  --arg storage "${storage_status}" \
  --argjson has_batt "$has_battery_sensor" \
  --argjson has_pir "$has_pir_sensor" \
  '{
    battery_level: $battery,
    wifi_signal_dbm: $wifi,
    storage_status: $storage,
    capabilities: {
      has_battery_sensor: $has_batt,
      has_pir_sensor: $has_pir,
      resolutions: ["1920x1080", "1280x720"]
    }
  }')
```

## Task Sequence (5 batches)

### Batch 1: Shared helper + types (FR-1)
**Files:** `packages/shared/src/devices.ts` (new), `packages/shared/src/index.ts`, `packages/shared/src/__tests__/devices.test.ts` (new)

**Tasks:**
1. Create `devices.ts` with `DeviceClass` type and `getDeviceClass()` function
2. Add tests for all 5 input states:
   - `{false, false}` → `1`
   - `{true, false}` → `2`
   - `{true, true}` → `3`
   - `{false, true}` → `3` (PIR-promoted)
   - `null` / `undefined` → `'unknown'`
3. Re-export from `packages/shared/src/index.ts`

**Acceptance:** `npm test packages/shared` passes with 5 new tests.

### Batch 2: TierBadge component (FR-4 dependency)
**Files:** `src/frontend/src/components/TierBadge.tsx` (new), `src/frontend/src/i18n/{en,ja}.json`

**Tasks:**
1. Create `TierBadge` component with size prop and color-coded styling
2. Add i18n keys: `device.class_1`, `device.class_2`, `device.class_3`, `device.class_pending`
3. Use existing badge CSS tokens (consistent with existing status badges)

**Acceptance:** Component renders all 4 states correctly; visible in isolation.

### Batch 3: DeviceListPage integration (FR-4)
**Files:** `src/frontend/src/components/DeviceListPage.tsx`

**Tasks:**
1. Import `getDeviceClass` and `TierBadge`
2. Add badge to `DeviceCard` header next to the device name
3. Size: `sm` to fit the compact card layout

**Acceptance:** Each device card shows a tier badge; "Pending" for devices that haven't sent capabilities.

### Batch 4: DeviceConfigForm integration (FR-3)
**Files:** `src/frontend/src/components/DeviceConfigForm.tsx`, i18n files

**Tasks:**
1. Import `getDeviceClass` and `TierBadge`
2. Add tier badge at the top of the form (next to device name or title)
3. Add informational banner below the badge based on tier (EN/JA copy per design table)
4. Preserve all existing behavior (`hasPirSensor`, `availableResolutions`, etc.)
5. Add i18n keys: `device.tier_banner_1`, `device.tier_banner_2`, `device.tier_banner_3`, `device.tier_banner_unknown`

**Acceptance:** Opening config form for any device shows tier badge + appropriate banner. Motion radio still disabled/placeholder as before.

### Batch 5: Pi-side scripts (FR-5 + FR-6 + drive-by fix)
**Files:** `scripts/camera-node/install.sh`, `scripts/camera-node/capture.sh`

**Tasks:**
1. **install.sh** — Add hardware prompts after camera detection; write `HAS_BATTERY_SENSOR` and `HAS_PIR_SENSOR` to `~/litcrop/.env`
2. **capture.sh** — Read flags from .env; construct heartbeat payload with `capabilities` object AND corrected keys (`battery_level`, `wifi_signal_dbm`, `storage_status`)
3. Test locally that the payload JSON structure matches `DeviceHeartbeatRequestSchema`
4. Update script comments to document the .env flags

**Acceptance:** Manual test on Pi produces a heartbeat that passes API schema validation and includes `capabilities`. API logs show capability persistence.

## Commit Plan

| Commit | Scope | Files | FR | Priority |
|--------|-------|-------|-----|----------|
| 1 | Shared `getDeviceClass()` helper + tests | devices.ts, index.ts, devices.test.ts | FR-1 | HIGH |
| 2 | TierBadge component + i18n | TierBadge.tsx, en.json, ja.json | FR-4 | HIGH |
| 3 | DeviceListPage tier badge | DeviceListPage.tsx | FR-4 | MEDIUM |
| 4 | DeviceConfigForm tier badge + banners | DeviceConfigForm.tsx, i18n additions | FR-3 | HIGH |
| 5 | install.sh prompts + capture.sh payload fix | install.sh, capture.sh | FR-5, FR-6 | HIGH |

## Risk & Rollback

### Risks

1. **Pi-side script changes are hard to test in CI** — no simulated Pi environment. Mitigation: manual test on one live device before broad rollout.
2. **Existing devices send old-format heartbeats** — the `battery_pct`/`wifi_dbm`/`storage` keys will continue to be ignored (as they have been). New heartbeats will use correct keys. No regression.
3. **`capabilities` arriving for the first time** — existing API code already handles this correctly (optional field in schema). No risk.
4. **i18n key misses** — missing banner translations will show the key instead of text. Mitigation: add keys in the same commit as the component that uses them.

### Rollback

- **Frontend:** Revert the commits; no DB state to undo
- **Pi-side:** Revert capture.sh — key mismatch bug returns but doesn't break anything further (already silently broken)
- **Shared helper:** Pure function with no side effects — safe to remove

## Scope Confirmation

- **Level:** MVP (Beta-11 sprint)
- **Size:** M (5 batches, ~3-4 files per batch)
- **Risk:** LOW — additive UI changes + a Pi script fix for a silent bug
- **Migration:** None
- **API changes:** None (capabilities field already in schema)

## Out of Scope (per REQUIREMENTS-337.md §8 / §8b)

- FR-2 tier-aware hint suggestions (deferred)
- Motion trigger functional wiring (deferred)
- New config fields: battery_threshold, sleep_window, motion_cooldown_sec (deferred, requires schema changes)
- Runtime GPIO probing for hardware detection (user-declared only)
- Environmental sensors (DHT22)
