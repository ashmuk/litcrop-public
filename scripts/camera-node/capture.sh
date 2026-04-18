#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# LitCrop Camera Node — Capture & Upload Script
#
# Full cycle: poll config → capture photo → upload → heartbeat.
# Designed for Raspberry Pi Zero 2 W with Camera Module 3.
#
# Usage:
#   ~/litcrop/capture.sh              # Single cycle
#   ~/litcrop/capture.sh --loop       # Continuous (for cron/systemd)
#
# Configuration: ~/litcrop/.env (downloaded from web UI)
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

LITCROP_DIR="${HOME}/litcrop"
ENV_FILE="${LITCROP_DIR}/.env"
HARDWARE_CONF="${LITCROP_DIR}/hardware.conf"
AUTH_TOKEN_FILE="${LITCROP_DIR}/.auth-token"         # sidecar — refreshed JWT (#341)
REFRESH_FAIL_FILE="${LITCROP_DIR}/.refresh-failures" # sidecar — counter (#341)
LAST_CAPTURE_FILE="${LITCROP_DIR}/.last-capture"     # sidecar — interval gate (#454)
MAX_REFRESH_FAILURES=3
IMAGES_DIR="${LITCROP_DIR}/images"
LOG_DIR="${LITCROP_DIR}/logs"
LOG_FILE="${LOG_DIR}/capture.log"
MAX_LOG_SIZE=1048576  # 1 MB — rotate when exceeded

# ── Load .env ───────────────────────────────────────────────────

if [ ! -f "$ENV_FILE" ]; then
    echo "[ERROR] Missing ${ENV_FILE}. Download from LitCrop web UI → Devices → Setup." >&2
    exit 1
fi

# Safe key=value parser — only accepts known keys, no arbitrary code execution.
# Accepts LITCROP_*-prefixed keys (from the web UI download) and maps them to
# the internal unprefixed variable names capture.sh uses. Also accepts the
# unprefixed names directly for backward-compat with hand-edited configs. (#341)
while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
    # Strip 'export ' prefix if present
    key="${key#export }"
    key="${key// /}"
    # Strip surrounding quotes
    value="${value%\"}"
    value="${value#\"}"
    case "$key" in
        LITCROP_DEVICE_ID)         export DEVICE_ID="$value" ;;
        LITCROP_BED_ID)            export BED_ID="$value" ;;
        LITCROP_API_BASE_URL)      export API_BASE_URL="$value" ;;
        LITCROP_API_KEY)           export DEVICE_API_KEY="$value" ;;
        LITCROP_REFRESH_TOKEN)     export REFRESH_TOKEN="$value" ;;
        LITCROP_COGNITO_CLIENT_ID) export COGNITO_CLIENT_ID="$value" ;;
        LITCROP_COGNITO_REGION)    export AWS_REGION="$value" ;;
        LITCROP_CONFIG_URL)        ;;  # intentionally ignored — capture.sh builds URLs from API_BASE_URL
        # Backward-compat: accept legacy unprefixed keys
        DEVICE_ID|BED_ID|API_BASE_URL|DEVICE_API_KEY|AUTH_TOKEN|\
        NODE_ID|TRIGGER|CAPTURE_WIDTH|CAPTURE_HEIGHT|JPEG_QUALITY|\
        INTERVAL_SECONDS|MAX_RETRY|REFRESH_TOKEN|COGNITO_CLIENT_ID|AWS_REGION)
            export "$key=$value"
            ;;
    esac
done < "$ENV_FILE"

# ── Load cached AUTH_TOKEN from sidecar (if present) ────────────

if [ -f "$AUTH_TOKEN_FILE" ]; then
    AUTH_TOKEN=$(cat "$AUTH_TOKEN_FILE")
    export AUTH_TOKEN
fi

# ── Validate required vars ──────────────────────────────────────
# AUTH_TOKEN is NOT required here — it's fetched on-demand via refresh_token()
# on first run. DEVICE_API_KEY is required: the heartbeat/config-poll endpoints
# use dual-auth (JWT + X-Device-Key) and the latter is the device-scoped secret.

for var in DEVICE_ID BED_ID API_BASE_URL DEVICE_API_KEY REFRESH_TOKEN; do
    if [ -z "${!var:-}" ]; then
        echo "[ERROR] ${var} is required." >&2
        echo "[HINT]  Re-download your .env from the LitCrop web UI → Devices → Setup." >&2
        echo "[HINT]  Or for legacy manual configs, add: export LITCROP_${var}=..." >&2
        exit 1
    fi
done

## Defaults for optional vars
CAPTURE_WIDTH="${CAPTURE_WIDTH:-1920}"
CAPTURE_HEIGHT="${CAPTURE_HEIGHT:-1080}"
JPEG_QUALITY="${JPEG_QUALITY:-75}"
NODE_ID="${NODE_ID:-${DEVICE_ID}}"
TRIGGER="${TRIGGER:-scheduled}"
MAX_RETRY="${MAX_RETRY:-3}"

# ── Load hardware.conf (device tier flags — #337) ───────────────

HAS_BATTERY_SENSOR=0
HAS_PIR_SENSOR=0
if [ -f "$HARDWARE_CONF" ]; then
    while IFS='=' read -r key value; do
        [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
        key="${key// /}"
        case "$key" in
            HAS_BATTERY_SENSOR|HAS_PIR_SENSOR)
                export "$key=$value"
                ;;
        esac
    done < "$HARDWARE_CONF"
fi

# ── Logging ─────────────────────────────────────────────────────

mkdir -p "$IMAGES_DIR" "$LOG_DIR"

log() {
    local msg="[$(date -Iseconds)] $1"
    echo "$msg" | tee -a "$LOG_FILE"
}

rotate_log() {
    if [ -f "$LOG_FILE" ] && [ "$(stat -c%s "$LOG_FILE" 2>/dev/null || stat -f%z "$LOG_FILE" 2>/dev/null || echo 0)" -gt "$MAX_LOG_SIZE" ]; then
        mv "$LOG_FILE" "${LOG_FILE}.1"
        log "[LOG] Rotated log file"
    fi
}

# ── Token refresh ───────────────────────────────────────────────
#
# Writes refreshed JWT to $AUTH_TOKEN_FILE (sidecar), not the .env — keeps
# the downloaded .env immutable and avoids fragile awk rewrites. (#341)
#
# Tracks consecutive failures in $REFRESH_FAIL_FILE. After $MAX_REFRESH_FAILURES
# consecutive failures (typically: REFRESH_TOKEN expired past 30-day window),
# exits with code 2 and asks the user to re-register. Prevents an infinite
# cron-driven refresh loop against Cognito.

refresh_token() {
    if [ -z "${REFRESH_TOKEN:-}" ] || [ -z "${COGNITO_CLIENT_ID:-}" ]; then
        return 0  # No refresh config — skip silently
    fi

    local region="${AWS_REGION:-ap-northeast-1}"
    local endpoint="https://cognito-idp.${region}.amazonaws.com/"

    # Pipe request body via stdin to keep tokens out of process list
    local response
    response=$(printf '{"AuthFlow":"REFRESH_TOKEN_AUTH","ClientId":"%s","AuthParameters":{"REFRESH_TOKEN":"%s"}}' \
        "$COGNITO_CLIENT_ID" "$REFRESH_TOKEN" | \
        curl -s -X POST "$endpoint" \
        -H "Content-Type: application/x-amz-json-1.1" \
        -H "X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth" \
        --data-binary @- --connect-timeout 10 --max-time 15 2>/dev/null) || {
            _record_refresh_failure
            return 1
        }

    # Use IdToken (not AccessToken) — API Gateway JWT authorizer checks the
    # `aud` claim which only exists in Cognito ID tokens.
    local new_token
    new_token=$(echo "$response" | grep -o '"IdToken":"[^"]*"' | cut -d'"' -f4)

    if [ -n "$new_token" ]; then
        AUTH_TOKEN="$new_token"
        export AUTH_TOKEN
        # Write to sidecar atomically, tight mode
        (umask 077; printf '%s' "$new_token" > "${AUTH_TOKEN_FILE}.tmp")
        mv "${AUTH_TOKEN_FILE}.tmp" "$AUTH_TOKEN_FILE"
        chmod 600 "$AUTH_TOKEN_FILE"
        # Reset failure counter on success
        rm -f "$REFRESH_FAIL_FILE"
        log "[AUTH] Token refreshed"
    else
        _record_refresh_failure
        return 1
    fi
}

_record_refresh_failure() {
    local fail_count=0
    [ -f "$REFRESH_FAIL_FILE" ] && fail_count=$(cat "$REFRESH_FAIL_FILE" 2>/dev/null || echo 0)
    fail_count=$((fail_count + 1))
    echo "$fail_count" > "$REFRESH_FAIL_FILE"

    if [ "$fail_count" -ge "$MAX_REFRESH_FAILURES" ]; then
        log "[AUTH] Refresh failed ${fail_count}x — device needs re-registration"
        log "[AUTH] Fix: re-register device in LitCrop web UI, download fresh .env,"
        log "[AUTH]      then run: rm $REFRESH_FAIL_FILE $AUTH_TOKEN_FILE"
        exit 2
    fi
    log "[AUTH] Token refresh failed (${fail_count}/${MAX_REFRESH_FAILURES})"
}

# ── Config polling ──────────────────────────────────────────────

poll_config() {
    local config_url="${API_BASE_URL}/api/v1/devices/${DEVICE_ID}/config"

    # Device endpoints use dual-auth: JWT (for user scope) + X-Device-Key
    # (for device scope). Both headers required. (#341)
    local curl_cfg
    curl_cfg=$(mktemp); chmod 600 "$curl_cfg"
    printf 'header = "Authorization: Bearer %s"\nheader = "X-Device-Key: %s"\n' \
        "$AUTH_TOKEN" "$DEVICE_API_KEY" > "$curl_cfg"

    local response
    response=$(curl -s -w "\n%{http_code}" \
        -K "$curl_cfg" \
        "$config_url" --connect-timeout 10 --max-time 15 2>/dev/null) || { rm -f "$curl_cfg"; return 1; }
    rm -f "$curl_cfg"

    local http_code body
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ] && [ -n "$body" ]; then
        if command -v jq &>/dev/null; then
            # Parse all fields in a single jq pass — cheaper on Pi Zero 2 W than
            # five separate pipe-spawns. One field per line, empty string when
            # absent. Regex guards below reject any malformed values so the
            # device keeps its previous (or default) settings.
            local fields
            mapfile -t fields < <(echo "$body" | jq -r '
                .resolution           // "",
                .jpeg_quality         // "",
                .capture_interval     // "",
                (.active_window.start // "05:00"),
                (.active_window.end   // "20:00"),
                (.test_shot_requested // false)
            ' 2>/dev/null)

            # resolution — API returns "WIDTHxHEIGHT" as a single string
            if [[ "${fields[0]:-}" =~ ^([0-9]+)x([0-9]+)$ ]]; then
                CAPTURE_WIDTH="${BASH_REMATCH[1]}"
                CAPTURE_HEIGHT="${BASH_REMATCH[2]}"
            fi

            # jpeg_quality — integer (API-side Zod already bounds to 50..100)
            [[ "${fields[1]:-}" =~ ^[0-9]+$ ]] && JPEG_QUALITY="${fields[1]}"

            # capture_interval — advisory under systemd, honored by --loop mode
            [[ "${fields[2]:-}" =~ ^[0-9]+$ ]] && export INTERVAL_SECONDS="${fields[2]}"

            # active_window — {start, end} as HH:MM in 24-hour format. Regex
            # guard rejects malformed values (e.g. "25:99" which Zod's old
            # /^\d{2}:\d{2}$/ accepted) — without this, a bad stored value
            # silently extends the window via lexicographic string compare.
            local hm_re='^([01][0-9]|2[0-3]):[0-5][0-9]$'
            [[ "${fields[3]:-}" =~ $hm_re ]] && export ACTIVE_WINDOW_START="${fields[3]}"
            [[ "${fields[4]:-}" =~ $hm_re ]] && export ACTIVE_WINDOW_END="${fields[4]}"
            : "${ACTIVE_WINDOW_START:=05:00}" "${ACTIVE_WINDOW_END:=20:00}"
            export ACTIVE_WINDOW_START ACTIVE_WINDOW_END

            # test_shot_requested — use LITCROP_TRIGGER namespace per ADR to
            # avoid collision with the .env parser's legacy TRIGGER key
            if [ "${fields[5]:-}" = "true" ]; then
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
}

# ── Capture ─────────────────────────────────────────────────────

capture() {
    local timestamp
    timestamp=$(date -Iseconds)
    local filename="${NODE_ID}_${timestamp//[:]/-}.jpg"
    local filepath="${IMAGES_DIR}/${filename}"

    log "[CAPTURE] ${CAPTURE_WIDTH}x${CAPTURE_HEIGHT} q${JPEG_QUALITY} → ${filename}"

    rpicam-still \
        --output "$filepath" \
        --width "$CAPTURE_WIDTH" \
        --height "$CAPTURE_HEIGHT" \
        --quality "$JPEG_QUALITY" \
        --nopreview \
        --immediate \
        --timeout 3000 \
        2>> "$LOG_FILE"

    if [ ! -f "$filepath" ]; then
        log "[ERROR] Capture failed — file not created"
        return 1
    fi

    local size
    size=$(stat -c%s "$filepath" 2>/dev/null || stat -f%z "$filepath" 2>/dev/null)
    log "[CAPTURE] OK — ${size} bytes"

    echo "$filepath"
}

# ── Upload ──────────────────────────────────────────────────────

upload() {
    local filepath="$1"
    local captured_at
    captured_at=$(date -Iseconds)
    local attempt=0
    local delay=1
    local upload_url="${API_BASE_URL}/api/v1/beds/${BED_ID}/images"

    local curl_config response_file
    curl_config=$(mktemp)
    chmod 600 "$curl_config"
    printf 'header = "Authorization: Bearer %s"\n' "$AUTH_TOKEN" > "$curl_config"
    response_file=$(mktemp)

    while [ $attempt -lt "$MAX_RETRY" ]; do
        attempt=$((attempt + 1))
        log "[UPLOAD] Attempt ${attempt}/${MAX_RETRY}"

        local http_code
        http_code=$(curl -s -o "$response_file" -w "%{http_code}" \
            -K "$curl_config" \
            -X POST "$upload_url" \
            -F "image=@${filepath}" \
            -F "captured_at=${captured_at}" \
            -F "node_id=${NODE_ID}" \
            -F "trigger=${TRIGGER}" \
            --connect-timeout 10 \
            --max-time 60 \
            2>> "$LOG_FILE")

        if [ "$http_code" = "201" ]; then
            log "[UPLOAD] OK — HTTP 201"
            rm -f "$curl_config" "$response_file" "$filepath"
            return 0
        elif [ "$http_code" = "401" ]; then
            log "[UPLOAD] Auth expired — refreshing"
            refresh_token
            printf 'header = "Authorization: Bearer %s"\n' "$AUTH_TOKEN" > "$curl_config"
        else
            log "[UPLOAD] FAILED — HTTP ${http_code}"
        fi

        if [ $attempt -lt "$MAX_RETRY" ]; then
            sleep "$delay"
            delay=$((delay * 2))
        fi
    done

    rm -f "$curl_config" "$response_file"
    log "[UPLOAD] FAILED after ${MAX_RETRY} attempts — kept in spool: ${filepath}"
    return 1
}

# ── Heartbeat ───────────────────────────────────────────────────

send_heartbeat() {
    local heartbeat_url="${API_BASE_URL}/api/v1/devices/${DEVICE_ID}/heartbeat"

    # WiFi signal strength
    local wifi_signal_dbm="null"
    if command -v iwconfig &>/dev/null; then
        wifi_signal_dbm=$(iwconfig wlan0 2>/dev/null | grep -oP '(?<=Signal level=)-?\d+' || echo "null")
    fi

    # Storage — qualitative status (ok/low/full) + quantitative fields
    # (#457). Single `df -B1 /` call emits total(bytes) free(bytes) use%,
    # which df itself computes; we strip the "%" so the integer is ready
    # for JSON. Each numeric field defaults to "null" (unquoted in JSON)
    # on parse failure, so the API's nullable schema still accepts the
    # payload — the UI then falls back to the qualitative status string.
    local storage_status="ok"
    local storage_used_pct="null"
    local storage_free_bytes="null"
    local storage_total_bytes="null"
    local _df_line
    _df_line=$(df -B1 / 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $2, $4, $5}')
    if [[ "$_df_line" =~ ^[0-9]+\ [0-9]+\ [0-9]+$ ]]; then
        storage_total_bytes="${_df_line%% *}"
        storage_used_pct="${_df_line##* }"
        # free is the middle field: strip leading total + trailing pct.
        local _rest="${_df_line#* }"
        storage_free_bytes="${_rest% *}"
        if [ "$storage_used_pct" -gt 90 ]; then
            storage_status="full"
        elif [ "$storage_used_pct" -gt 80 ]; then
            storage_status="low"
        fi
    fi
    unset _df_line

    # Battery (UPS HAT if connected) — validate numeric.
    # #455: gate the sysfs read on HAS_BATTERY_SENSOR=1 from hardware.conf.
    # Some power_supply drivers expose a Battery-typed entry with
    # present=0 even when no battery is wired; install.sh now rejects
    # those at detection time, but if one slips through (e.g., a kernel
    # quirk that flips present=1 transiently) we still don't want the
    # heartbeat to emit a battery_level claiming a HAT exists. UI keys
    # off capabilities.has_battery_sensor anyway, so a null here is the
    # honest report for a Class-1 Pi.
    local battery_level="null"
    if [ "${HAS_BATTERY_SENSOR:-0}" = "1" ]; then
        local raw_battery
        raw_battery=$(cat /sys/class/power_supply/*/capacity 2>/dev/null | head -1 || echo "")
        [[ "$raw_battery" =~ ^[0-9]+$ ]] && battery_level="$raw_battery"
    fi

    # Validate wifi_signal_dbm is numeric
    [[ ! "$wifi_signal_dbm" =~ ^-?[0-9]+$ ]] && wifi_signal_dbm="null"

    # Tier capabilities — derived from hardware.conf (#337)
    local has_battery_sensor="false"
    local has_pir_sensor="false"
    [ "$HAS_BATTERY_SENSOR" = "1" ] && has_battery_sensor="true"
    [ "$HAS_PIR_SENSOR" = "1" ] && has_pir_sensor="true"

    # #406: echo the Pi's current runtime config so the UI can show drift
    # between saved and effective state. capture_interval is emitted as
    # JSON null (unquoted) when INTERVAL_SECONDS is unset — advisory under
    # systemd per DESIGNS-395 §2.3.1.
    local eff_interval="null"
    [[ "${INTERVAL_SECONDS:-}" =~ ^[0-9]+$ ]] && eff_interval="$INTERVAL_SECONDS"

    # Heartbeat payload — keys match DeviceHeartbeatRequestSchema
    # (Beta-5 had a typo bug: battery_pct/wifi_dbm/storage — silently dropped. Fixed in #337.)
    local payload
    payload=$(cat <<JSON
{
  "battery_level": ${battery_level},
  "wifi_signal_dbm": ${wifi_signal_dbm},
  "storage_status": "${storage_status}",
  "storage_used_pct": ${storage_used_pct},
  "storage_free_bytes": ${storage_free_bytes},
  "storage_total_bytes": ${storage_total_bytes},
  "capabilities": {
    "has_battery_sensor": ${has_battery_sensor},
    "has_pir_sensor": ${has_pir_sensor},
    "resolutions": ["1920x1080", "1280x720"]
  },
  "effective_config": {
    "resolution": "${CAPTURE_WIDTH}x${CAPTURE_HEIGHT}",
    "jpeg_quality": ${JPEG_QUALITY},
    "capture_interval": ${eff_interval},
    "active_window": {
      "start": "${ACTIVE_WINDOW_START:-05:00}",
      "end": "${ACTIVE_WINDOW_END:-20:00}"
    }
  }
}
JSON
)

    # Dual-auth: JWT + X-Device-Key (#341). Use -K config file to keep
    # secrets out of the process list.
    local hb_cfg
    hb_cfg=$(mktemp); chmod 600 "$hb_cfg"
    printf 'header = "Authorization: Bearer %s"\nheader = "X-Device-Key: %s"\nheader = "Content-Type: application/json"\n' \
        "$AUTH_TOKEN" "$DEVICE_API_KEY" > "$hb_cfg"

    echo "$payload" | curl -s -o /dev/null \
        -K "$hb_cfg" \
        -X POST "$heartbeat_url" \
        --data-binary @- \
        --connect-timeout 10 \
        --max-time 15 \
        2>/dev/null && log "[HEARTBEAT] OK" || log "[HEARTBEAT] Failed (non-critical)"
    rm -f "$hb_cfg"
}

# ── Upload spool (retry queued files) ───────────────────────────

upload_spool() {
    local count=0
    for file in "$IMAGES_DIR"/*.jpg; do
        [ -f "$file" ] || continue
        count=$((count + 1))
        upload "$file" || true
    done
    [ $count -gt 0 ] && log "[SPOOL] Processed ${count} queued file(s)"
}

# ── Main ────────────────────────────────────────────────────────

# Return 0 iff the current HH:MM falls inside [ACTIVE_WINDOW_START, ACTIVE_WINDOW_END).
# String comparison is safe only for same-day windows (start < end). A cross-
# midnight window (e.g. 22:00 → 04:00) would compare as "empty" under string
# ordering, so we detect it and fall back to the defaults with a warning.
in_active_window() {
    local start="${ACTIVE_WINDOW_START:-05:00}"
    local end="${ACTIVE_WINDOW_END:-20:00}"
    if [[ ! "$start" < "$end" ]]; then
        log "[CONFIG] Warning: cross-midnight window ${start}-${end} not supported, using 05:00-20:00"
        start="05:00"; end="20:00"
    fi
    local now_hm; now_hm=$(date +%H:%M)
    [[ "$now_hm" > "$start" || "$now_hm" == "$start" ]] && [[ "$now_hm" < "$end" ]]
}

# #454 interval gate. The cron schedule (v2 tick every 5 min) fires
# capture.sh 6x more often than the old `*/30` line, but user-configured
# INTERVAL_SECONDS controls how often we ACTUALLY capture. Heartbeat
# still fires on the skip path — that's the freshness win that makes
# the fast-tick cron worthwhile (UI sees 5-min-fresh device status
# regardless of capture cadence).
#
# Bypass order, applied in run_once():
#   - test_shot:        bypasses both active-window and interval gates
#   - outside window:   interval gate not reached
#   - legacy mode:      INTERVAL_SECONDS unset → always capture (preserves
#                       behavior for pre-config-poll devices)
#   - first run:        LAST_CAPTURE_FILE missing → always capture
should_capture_now() {
    # Legacy: no interval configured → always capture
    [[ ! "${INTERVAL_SECONDS:-}" =~ ^[0-9]+$ ]] && return 0
    # First run: no sidecar yet → always capture
    [ ! -f "$LAST_CAPTURE_FILE" ] && return 0
    # Within interval → skip.
    # Use bash's EPOCHSECONDS builtin (bash ≥5.0) rather than `date +%s`.
    # The run_once test harness mocks `date` to fix the wall-clock for
    # active-window gating; a shadowed `date +%s` would return non-numeric
    # "HH:MM" and break arithmetic. EPOCHSECONDS is a builtin and can't
    # be shadowed by a function definition. Fall back to `date +%s` only
    # on shells where EPOCHSECONDS is unset (bash <5, non-bash sourcing).
    local last_mtime now_sec elapsed
    last_mtime=$(stat -c%Y "$LAST_CAPTURE_FILE" 2>/dev/null \
                 || stat -f%m "$LAST_CAPTURE_FILE" 2>/dev/null \
                 || echo 0)
    now_sec="${EPOCHSECONDS:-$(date +%s)}"
    elapsed=$((now_sec - last_mtime))
    if [ "$elapsed" -lt "$INTERVAL_SECONDS" ]; then
        log "[SKIP] Interval not elapsed (last=${elapsed}s ago, need ${INTERVAL_SECONDS}s)"
        return 1
    fi
    return 0
}

run_once() {
    rotate_log
    log "[START] device=${DEVICE_ID} bed=${BED_ID} trigger=${TRIGGER}"

    # 1. Refresh token if needed
    refresh_token || true

    # 2. Poll config for latest settings (may update INTERVAL_SECONDS, ACTIVE_WINDOW_*)
    poll_config || true

    # 3. Active-window gate — test_shot bypasses. Outside-window path sends
    #    exactly one heartbeat so the UI still registers the device as alive.
    if [ "$TRIGGER" != "test_shot" ] && ! in_active_window; then
        log "[SKIP] Outside active window ${ACTIVE_WINDOW_START:-05:00}-${ACTIVE_WINDOW_END:-20:00}"
        send_heartbeat
        return 0
    fi

    # 4. Interval gate (#454) — test_shot bypasses. Heartbeat still fires
    #    on the skip path so the UI sees fresh device status even when
    #    capture is throttled by interval.
    if [ "$TRIGGER" != "test_shot" ] && ! should_capture_now; then
        send_heartbeat
        return 0
    fi

    # 5. Capture new image (prioritize timely shot over spool drain)
    local filepath
    filepath=$(capture) || { send_heartbeat; return 1; }

    # 6. Mark this capture's timestamp for the next interval check.
    #    Best-effort — a touch failure shouldn't abort the upload path,
    #    but silent failure would cause runaway captures at every 5-min
    #    cron tick (the gate would see a missing sidecar and allow each
    #    time). Log loud when touch fails so the operator has ground
    #    truth instead of mystery 6× capture storms.
    touch "$LAST_CAPTURE_FILE" 2>/dev/null \
        || log "[WARN] touch ${LAST_CAPTURE_FILE} failed — interval gate will not throttle this cycle"

    # 7. Upload
    upload "$filepath" || true

    # 8. Heartbeat (inside-window + captured path — exactly once per cycle)
    send_heartbeat

    # 9. Drain any queued files from previous failed uploads
    upload_spool

    log "[DONE]"
}

# Only run when executed directly; allow `source capture.sh` from bats tests.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [ "${1:-}" = "--loop" ]; then
        INTERVAL="${INTERVAL_SECONDS:-600}"
        log "[LOOP] Starting continuous capture every ${INTERVAL}s"
        while true; do
            run_once || true
            sleep "$INTERVAL"
        done
    else
        run_once
    fi
fi
