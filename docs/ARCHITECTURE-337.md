# ARCHITECTURE-337: Tiered Device Classes

> Backfilled from implementation (2026-04-12). Original issue #337 shipped in Beta-11 (v0.48).

## Overview

Device tiers classify camera nodes by hardware capability. Classification is **derived at runtime** from `DeviceCapabilities`, not stored as a separate field.

## Tier Model

| Class | Discriminator | Hardware | Example |
|-------|--------------|----------|---------|
| 1 (Basic) | No sensors | Camera only | Pi Zero W |
| 2 (Standard) | Battery sensor | Camera + INA219 | Pi Zero W + battery HAT |
| 3 (Advanced) | PIR sensor | Camera + PIR (+ optional battery) | Pi Zero W + PIR module |
| unknown | No heartbeat yet | — | Newly registered device |

**Key decision**: PIR sensor is the primary discriminator — a device with PIR but no battery sensor is still Class 3. This avoids false negatives where an advanced device lacks one optional sensor.

## Classification Logic

Pure function `getDeviceClass(caps)` in `packages/shared/src/devices.ts`:
1. If `caps` is null/undefined → `'unknown'`
2. If `has_pir_sensor` → Class 3
3. If `has_battery_sensor` → Class 2
4. Otherwise → Class 1

## Architectural Decisions

### ADR-337-01: Derived tiers, not stored
Tiers are computed from capabilities on each render/request, not stored in DynamoDB. This means upgrading hardware (adding a PIR module) automatically promotes the device class on the next heartbeat — no manual reclassification needed.

### ADR-337-02: hardware.conf separation
Device capabilities are declared in `~/litcrop/hardware.conf` (mode 600), separate from `.env`. Rationale: `.env` is re-downloaded on credential rotation and would wipe hardware flags. `hardware.conf` is written once by `install.sh` and persists independently.

### ADR-337-03: User-declared capabilities
Chose install-time prompts ("Does this device have a battery sensor? [y/N]") over runtime GPIO probing. Rationale: GPIO detection is unreliable across HAT manufacturers and requires root access. User declaration is a single source of truth.

### ADR-337-04: TIER_PRESENTATION export
`TierBadge.tsx` exports a `TIER_PRESENTATION` object mapping tier → color/label/icon. Reused by `TierInfoModal.tsx` and `DeviceConfigForm.tsx` to prevent color/label desync across UI surfaces.

### ADR-337-05: Motion trigger deferred
UI radio for motion-triggered capture exists (gated by `hasPirSensor` flag) but functional motion capture is deferred to Phase 2. The radio is visible but the backend ignores the `trigger: 'motion'` value for now.

## Component Map

| Component | File | Role |
|-----------|------|------|
| `getDeviceClass()` | `packages/shared/src/devices.ts` | Tier classification (pure) |
| `TierBadge.tsx` | `src/frontend/src/components/TierBadge.tsx` | Color-coded tier pill |
| `TierInfoModal.tsx` | `src/frontend/src/components/TierInfoModal.tsx` | Hardware reference pane |
| `DeviceConfigForm.tsx` | `src/frontend/src/components/DeviceConfigForm.tsx` | Config form with tier context |
| `DeviceListPage.tsx` | `src/frontend/src/components/DeviceListPage.tsx` | Device cards with tier badges |

## API Surface

- `POST /api/v1/devices/:deviceId/heartbeat` — accepts optional `capabilities` object
- `DeviceHeartbeatRequestSchema` validates: `has_battery_sensor`, `has_pir_sensor`, `resolutions[]`
- Heartbeat key mapping corrected in Beta-11: `battery_pct` → `battery_level`, `wifi_dbm` → `wifi_signal_dbm`
