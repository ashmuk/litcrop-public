# DESIGNS — #395 Device Capture Production Hardening (System Design)

> **Status**: Step 5 (cc-design — System Design) — 2026-04-15
> **Pipeline**: 1 ✅ → 2 ✅ → 3+4 ✅ (ADR v2) → **5** → 6 → 7 (STOP) → 8 → 9
> **Source of truth for decisions**: `docs/decisions/ADR-20260414-device-capture-production-hardening.md`
> **Scope**: MVP Phase 0 (round-trip fix) + MVP Phase 1 (power management & new config fields). Motion is out of scope.

---

## 1. Purpose

The ADR defines *what* we are doing; this doc defines *exactly how*. Every file path is absolute, every snippet is copy-paste-ready.

---

## 2. Phase 0 — Fix broken config round-trip

### 2.1 File: `/workspace/scripts/camera-node/capture.sh`

**Goal**: teach `poll_config()` to honor `resolution`, `capture_interval`, and `active_window` from the API, and gate `run_once()` by the active window.

#### 2.1.1 Replace `poll_config()` body (current: lines 194–244)

Replace the inner parsing block (current lines 216–237). Keep the HTTP/auth wrapper untouched.

```bash
if [ "$http_code" = "200" ] && [ -n "$body" ]; then
    if command -v jq &>/dev/null; then
        # resolution — API returns "1920x1080"; split on 'x'
        local res
        res=$(echo "$body" | jq -r '.resolution // empty' 2>/dev/null)
        if [[ "$res" =~ ^([0-9]+)x([0-9]+)$ ]]; then
            CAPTURE_WIDTH="${BASH_REMATCH[1]}"
            CAPTURE_HEIGHT="${BASH_REMATCH[2]}"
        fi

        # jpeg_quality — integer 50..100
        local q
        q=$(echo "$body" | jq -r '.jpeg_quality // empty' 2>/dev/null)
        [[ "$q" =~ ^[0-9]+$ ]] && JPEG_QUALITY="$q"

        # capture_interval — advisory under systemd, honored by --loop
        local ci
        ci=$(echo "$body" | jq -r '.capture_interval // empty' 2>/dev/null)
        [[ "$ci" =~ ^[0-9]+$ ]] && export INTERVAL_SECONDS="$ci"

        # active_window — {start, end} as HH:MM
        local aw_start aw_end
        aw_start=$(echo "$body" | jq -r '.active_window.start // "05:00"' 2>/dev/null)
        aw_end=$(echo "$body"   | jq -r '.active_window.end   // "20:00"' 2>/dev/null)
        export ACTIVE_WINDOW_START="$aw_start"
        export ACTIVE_WINDOW_END="$aw_end"

        # test_shot_requested — use LITCROP_TRIGGER namespace per ADR §Trigger-variable naming
        local test_shot
        test_shot=$(echo "$body" | jq -r '.test_shot_requested // false' 2>/dev/null)
        if [ "$test_shot" = "true" ]; then
            export LITCROP_TRIGGER="test_shot"
            TRIGGER="test_shot"
            log "[CONFIG] Test shot requested"
        fi

        log "[CONFIG] Applied: ${CAPTURE_WIDTH}x${CAPTURE_HEIGHT} q${JPEG_QUALITY} window=${ACTIVE_WINDOW_START}-${ACTIVE_WINDOW_END} interval=${INTERVAL_SECONDS:-unset}"
    else
        log "[CONFIG] jq not installed — using defaults"
    fi
elif [ "$http_code" = "401" ]; then
    log "[CONFIG] Auth expired — refreshing token"
    refresh_token
else
    log "[CONFIG] Poll failed (HTTP ${http_code}) — using defaults"
fi
```

#### 2.1.2 Add `in_active_window()` helper + gate `run_once()`

Insert the helper just above `run_once()` (currently at line 417):

```bash
# Return 0 if now falls inside ACTIVE_WINDOW_START..ACTIVE_WINDOW_END (inclusive start, exclusive end)
in_active_window() {
    local now_hm; now_hm=$(date +%H:%M)
    local start="${ACTIVE_WINDOW_START:-05:00}"
    local end="${ACTIVE_WINDOW_END:-20:00}"
    [[ "$now_hm" > "$start" || "$now_hm" == "$start" ]] && [[ "$now_hm" < "$end" ]]
}
```

Modify `run_once()` — the window gate runs **after** `poll_config()` so a freshly pushed window takes effect immediately, but **before** the (expensive) camera invocation:

```bash
run_once() {
    rotate_log
    log "[START] device=${DEVICE_ID} bed=${BED_ID} trigger=${TRIGGER}"

    refresh_token || true
    poll_config  || true

    # Active-window gate — test_shot requests bypass the gate
    if [ "$TRIGGER" != "test_shot" ] && ! in_active_window; then
        log "[SKIP] Outside active window ${ACTIVE_WINDOW_START:-05:00}-${ACTIVE_WINDOW_END:-20:00}"
        send_heartbeat
        return 0
    fi

    local filepath
    filepath=$(capture) || { send_heartbeat; return 1; }
    upload "$filepath" || true
    send_heartbeat
    upload_spool
    log "[DONE]"
}
```

### 2.2 Phase 0 data flow

```
┌─────────────────────┐     PATCH /farms/:f/devices/:d         ┌──────────────┐
│  DeviceConfigForm   │────────────────────────────────────────▶│  API route   │
│  (resolution,       │                                         │  devices.ts  │
│   active_window,    │                                         └──────┬───────┘
│   capture_interval) │                                                │
└─────────────────────┘                                                ▼
                                                           ┌────────────────────┐
                                                           │ updateDeviceConfig │
                                                           └──────┬─────────────┘
                                                                  ▼
                                                            ┌──────────┐
                                                            │ DynamoDB │
                                                            └────┬─────┘
                                                                 │ read
                                                                 ▼
                                    GET /devices/:d/config ┌────────────┐
       ┌─────────────────────────────────────────────────▶│ deviceRouter│
       │  { resolution, active_window, capture_int }       └────────────┘
       │
┌──────┴─────────────┐
│ capture.sh         │   ← NEW: parses three fields, gates run_once by window
│ poll_config()      │
└────────────────────┘
```

### 2.3 Phase 0 exit criteria

- UI change "resolution = 1280x720" reflected in next on-Pi capture within 30 min.
- UI change "active_window.end = 12:00" → Pi skips captures ≥12:00 with `[SKIP]` log line.
- Unit test: mock response with `resolution: "1280x720"` sets `CAPTURE_WIDTH=1280`, `CAPTURE_HEIGHT=720`.
- Pi log shows `[CONFIG] Applied: ... interval=<seconds>` after config poll — confirms `capture_interval` parsed (advisory under systemd).

### 2.3.1 `capture_interval` semantics under systemd (IMPORTANT)

Under systemd, cadence is driven by `litcrop-capture.timer`'s `OnCalendar` expression, not by `INTERVAL_SECONDS`. `capture_interval` from config becomes **advisory**:

- The script exports `INTERVAL_SECONDS` so `--loop` mode (legacy / non-systemd setups) honors it.
- Under systemd, the field is logged but does not change cadence without re-provisioning the timer.
- UI copy must document this: a future ADR will reconcile (e.g., `poll_config` regenerates `litcrop-capture.timer` when interval changes significantly).

**For Phase 0**: No UI change. User-set `capture_interval` will appear in Pi logs but timer cadence remains the 30-minute default from `install.sh`. Document in release note.

### 2.4 Backward compatibility

| Scenario | Behavior |
|----------|----------|
| Old capture.sh (Beta-11) + new API | Unchanged — old script never read these fields |
| New capture.sh + old API returning `resolution_width` | Zod default prevents crash; width regex fails; stays at env default |
| Device with no `hardware.conf` | `HAS_BATTERY_SENSOR=0, HAS_PIR_SENSOR=0` — existing Beta-11 branch |

---

## 3. Phase 1 — Power management + new config fields

### 3.1 Atomic six-layer schema change

All six layers land in one PR; any subset creates a silent drop.

#### 3.1.1 `/workspace/packages/shared/src/schemas/index.ts`

**DeviceConfigResponseSchema** (around line 470) — add four fields with `.default()`:

```typescript
export const DeviceConfigResponseSchema = z.object({
  capture_interval: z.number(),
  resolution: z.string(),
  jpeg_quality: z.number(),
  active_window: ActiveWindowSchema,
  trigger_type: z.literal('scheduled'),
  bed_id: z.string(),
  upload_url: z.string(),
  test_shot_requested: z.boolean(),
  // --- #395 Phase 1 ---
  motion_cooldown_sec: z.number().int().min(10).max(600).default(60),
  max_motion_per_hour: z.number().int().min(1).max(120).default(10),
  sleep_enabled: z.boolean().default(false),
  battery_threshold: z.number().int().min(5).max(50).default(20),
});
```

**UpdateDeviceRequestSchema** (around line 488) — add four optional validated fields:

```typescript
export const UpdateDeviceRequestSchema = z.object({
  node_name: NodeNameSchema.optional(),
  bed_id: z.string().min(1).optional(),
  capture_interval: z.number().int().min(MIN_CAPTURE_INTERVAL).max(MAX_CAPTURE_INTERVAL).optional(),
  resolution: z.string().optional(),
  jpeg_quality: z.number().int().min(50).max(100).optional(),
  active_window: ActiveWindowSchema.optional(),
  // --- #395 Phase 1 ---
  motion_cooldown_sec: z.number().int().min(10).max(600).optional(),
  max_motion_per_hour: z.number().int().min(1).max(120).optional(),
  sleep_enabled: z.boolean().optional(),
  battery_threshold: z.number().int().min(5).max(50).optional(),
});
```

#### 3.1.2 `/workspace/packages/shared/src/types/domain.ts` (line 188)

Add the four fields to `DeviceConfigResponse` and `Device` interfaces.

#### 3.1.3 `/workspace/src/api/src/routes/devices.ts` (line 36)

```typescript
const DEVICE_DEFAULTS = {
  capture_interval: 1800,
  resolution: '1920x1080',
  jpeg_quality: 85,
  active_window_start: '05:00',
  active_window_end: '20:00',
  // --- #395 Phase 1 ---
  motion_cooldown_sec: 60,
  max_motion_per_hour: 10,
  sleep_enabled: false,
  battery_threshold: 20,
};
```

Config GET handler (line 241) must return the four new fields.

#### 3.1.4 `/workspace/src/api/src/services/repositories/devices.ts`

- `createDevice` (line 32): extend input type and Item payload
- `updateDeviceConfig` Partial (line 127): add four fields
- `itemToDevice` (line 6): surface four new fields with `?? default` fallback

#### 3.1.5 `/workspace/src/frontend/src/components/DeviceConfigForm.tsx`

Four new JSX controls, each capability-gated:

```tsx
{/* Motion cooldown — gated on PIR */}
<input type="number" min={10} max={600} step={10}
  value={motionCooldown} disabled={!hasPirSensor}
  onInput={(e) => setMotionCooldown(Number((e.target as HTMLInputElement).value))} />

{/* Max captures per hour — gated on PIR */}
<input type="number" min={1} max={120}
  value={maxPerHour} disabled={!hasPirSensor}
  onInput={(e) => setMaxPerHour(Number((e.target as HTMLInputElement).value))} />

{/* Sleep enabled — gated on battery sensor */}
<input type="checkbox" checked={sleepEnabled}
  disabled={!device.capabilities?.has_battery_sensor}
  onChange={(e) => setSleepEnabled((e.target as HTMLInputElement).checked)} />

{/* Battery threshold — gated on sleepEnabled */}
<input type="number" min={5} max={50}
  value={batteryThreshold} disabled={!sleepEnabled}
  onInput={(e) => setBatteryThreshold(Number((e.target as HTMLInputElement).value))} />
```

#### 3.1.6 i18n — EN + JA

```json
"field_motion_cooldown": "Motion cooldown (s)" / "動体クールダウン（秒）",
"field_max_per_hour": "Max captures per hour" / "1時間あたりの最大撮影数",
"field_sleep_enabled": "Enable deep sleep between captures" / "撮影間のディープスリープを有効化",
"field_battery_threshold": "Battery threshold (%)" / "バッテリー閾値（%）"
```

### 3.2 `maybe_sleep()` in capture.sh

Append after `upload_spool`, before `run_once`:

```bash
maybe_sleep() {
    [ "${HAS_POWER_MGMT:-0}" != "1" ] && return 0
    [ "${SLEEP_ENABLED:-false}" != "true" ] && return 0

    local batt
    batt=$(cat /sys/class/power_supply/*/capacity 2>/dev/null | head -1 || echo "")
    [[ ! "$batt" =~ ^[0-9]+$ ]] && batt=100

    if (( batt < ${BATTERY_THRESHOLD:-20} )); then
        log "[POWER] Battery ${batt}% < threshold ${BATTERY_THRESHOLD:-20}% — skipping sleep"
        return 0
    fi

    local wake_sec="${INTERVAL_SECONDS:-1800}"
    log "[POWER] Setting wake timer: ${wake_sec}s, shutting down"
    command -v cgpmgr >/dev/null 2>&1 || { log "[POWER] cgpmgr not found"; return 0; }
    cgpmgr -set "$wake_sec" || { log "[POWER] cgpmgr -set failed"; return 0; }
    cgpmgr -shutdown || log "[POWER] cgpmgr -shutdown failed"
}
```

Call as last step of `run_once()`, after `upload_spool`.

### 3.3 `hardware.conf` — add `HAS_POWER_MGMT`

`capture.sh` parser allow-list (line 103):

```bash
case "$key" in
    HAS_BATTERY_SENSOR|HAS_PIR_SENSOR|HAS_POWER_MGMT)
        export "$key=$value"
        ;;
esac
```

### 3.4 `install.sh` — systemd + auto-detect + legacy scrub

Replace interactive hardware prompts (lines 133–165) with auto-detection:

```bash
HAS_BATTERY_SENSOR=0
HAS_PIR_SENSOR=0
HAS_POWER_MGMT=0

ls /sys/class/power_supply/*/capacity >/dev/null 2>&1 && HAS_BATTERY_SENSOR=1
command -v cgpmgr >/dev/null 2>&1 && HAS_POWER_MGMT=1
command -v cgsensor >/dev/null 2>&1 && HAS_PIR_SENSOR=1

info "Auto-detected: BATTERY=${HAS_BATTERY_SENSOR} PIR=${HAS_PIR_SENSOR} PMGMT=${HAS_POWER_MGMT}"

cat > "${LITCROP_DIR}/hardware.conf" <<EOF
HAS_BATTERY_SENSOR=${HAS_BATTERY_SENSOR}
HAS_PIR_SENSOR=${HAS_PIR_SENSOR}
HAS_POWER_MGMT=${HAS_POWER_MGMT}
EOF
chmod 600 "${LITCROP_DIR}/hardware.conf"
```

Add `--non-interactive` flag handling (near top):

```bash
INTERACTIVE=1
for arg in "$@"; do
    [ "$arg" = "--non-interactive" ] && INTERACTIVE=0
done
[ ! -t 0 ] && INTERACTIVE=0
```

Replace cron setup (lines 109–131) with systemd install:

```bash
install_systemd_units() {
    local home_dir="$HOME"
    local user_name="${USER:-$(id -un)}"
    local tmpl_dir="${SCRIPT_DIR}/systemd"
    [ ! -d "$tmpl_dir" ] && { warn "No templates — falling back to cron"; return 1; }

    for tmpl in "$tmpl_dir"/*.tmpl; do
        local name; name=$(basename "${tmpl%.tmpl}")
        sed -e "s|__LITCROP_HOME__|${home_dir}|g" \
            -e "s|__LITCROP_USER__|${user_name}|g" \
            "$tmpl" | sudo tee "/etc/systemd/system/${name}" >/dev/null
    done
    sudo cp "${tmpl_dir}/litcrop-capture.timer" /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable --now litcrop-capture.timer
    info "Systemd timer installed"

    if crontab -l 2>/dev/null | grep -qF "capture.sh"; then
        crontab -l 2>/dev/null | grep -vF "capture.sh" | crontab -
        info "Removed legacy cron entry"
    fi
}
```

Scrub legacy `TRIGGER=` from `.env`:

```bash
if [ -f "${LITCROP_DIR}/.env" ]; then
    sed -i.bak '/^export TRIGGER=/d; /^TRIGGER=/d' "${LITCROP_DIR}/.env" || true
    rm -f "${LITCROP_DIR}/.env.bak"
fi
```

Update capture.sh TRIGGER default (line 91):

```bash
TRIGGER="${LITCROP_TRIGGER:-${TRIGGER:-scheduled}}"
```

### 3.5 Systemd unit files

**`/workspace/scripts/camera-node/systemd/litcrop-capture.service.tmpl`**:

```ini
[Unit]
Description=LitCrop scheduled image capture
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=__LITCROP_USER__
ExecStart=__LITCROP_HOME__/litcrop/capture.sh
Environment=LITCROP_TRIGGER=scheduled
TimeoutStartSec=120
# Intentionally no [Install] — triggered by .timer, never enabled directly
```

**`/workspace/scripts/camera-node/systemd/litcrop-capture.timer`** (not a template):

```ini
[Unit]
Description=LitCrop capture schedule

[Timer]
OnCalendar=*-*-* 05..20:00/30:00
Persistent=true
RandomizedDelaySec=30

[Install]
WantedBy=timers.target
```

### 3.6 DynamoDB normalization migration (pre-Phase-0 gate)

**`/workspace/scripts/migrate-device-resolution.ts`** — scan `DEVICE#*`, rewrite any `resolution` not matching `/^\d+x\d+$/` to `'1920x1080'`. `DRY_RUN=1` default. Modeled on `/workspace/scripts/migrate-roles.ts`.

---

## 4. Error handling policy

| Failure | Script behavior | Log tag |
|---------|----------------|---------|
| `cgpmgr` missing | `maybe_sleep` returns 0 | `[POWER]` |
| `cgpmgr -set` non-zero | Log, skip `-shutdown`, return 0 | `[POWER]` |
| sysfs capacity empty | Treat as 100% (safe high — no sleep) | (none) |
| jq missing | `poll_config` uses defaults | `[CONFIG]` |
| `resolution` malformed | Regex fails, vars unchanged | `[CONFIG]` |
| `capture_interval` non-numeric | Regex fails, var unchanged | `[CONFIG]` |
| Outside active window | Heartbeat, return 0 | `[SKIP]` |
| API returns 401 | Refresh token (existing) | `[CONFIG]/[AUTH]` |
| 3 consecutive refresh failures | exit 2 (existing Beta-11) | `[AUTH]` |

---

## 5. Backward compatibility matrix

| Pi | API | Result |
|----|-----|--------|
| Beta-11 | Phase 0 | No change — old script never read these fields |
| Phase 0 | Beta-11 | Zod default prevents 5xx; regex guards every field |
| Phase 1 | Phase 0 | Missing new fields → `SLEEP_ENABLED` unset → `maybe_sleep` early-exits |
| Phase 1 | Phase 1 | Full round-trip |

---

## 6. Testing hooks

- **Unit (TS)** — `src/api/src/__tests__/routes/devices.test.ts`: add cases for four new PATCH fields
- **Schema contract** — `contracts-beta5.test.ts`: assert 12-field config fixture
- **Shell** — new `scripts/camera-node/__tests__/test-poll-config.sh` (mock curl, feed fixture JSON)
- **Manual on Pi** — See PLANS-395 acceptance criteria

---

## 7. Security

- `hardware.conf` remains `0600`
- `Environment=LITCROP_TRIGGER=scheduled` is not a secret
- No new network endpoints, no new auth surface
- `cgpmgr` / `cgsensor` require no sudo

---

## 8. Performance

- `maybe_sleep` runs strictly after all network I/O; no race with uploads
- jq parse cost negligible (<10ms on Pi Zero 2 W)
- `RandomizedDelaySec=30` spreads fleet API load

---

## 9. Rollback per phase

**Phase 0**: `cp capture.sh.bak capture.sh`

**Phase 1**:
```bash
systemctl disable --now litcrop-capture.timer
(crontab -l; echo "*/30 5-20 * * * $HOME/litcrop/capture.sh") | crontab -
```
