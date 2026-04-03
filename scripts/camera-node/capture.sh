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
IMAGES_DIR="${LITCROP_DIR}/images"
LOG_DIR="${LITCROP_DIR}/logs"
LOG_FILE="${LOG_DIR}/capture.log"
MAX_LOG_SIZE=1048576  # 1 MB — rotate when exceeded

# ── Load .env ───────────────────────────────────────────────────

if [ ! -f "$ENV_FILE" ]; then
    echo "[ERROR] Missing ${ENV_FILE}. Download from LitCrop web UI → Devices → Setup." >&2
    exit 1
fi

# Source .env (expects export KEY=VALUE format from web UI download)
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

# ── Validate required vars ──────────────────────────────────────

for var in DEVICE_ID BED_ID API_BASE_URL AUTH_TOKEN; do
    if [ -z "${!var:-}" ]; then
        echo "[ERROR] ${var} is required. Check ${ENV_FILE}" >&2
        exit 1
    fi
done

# Defaults for optional vars
CAPTURE_WIDTH="${CAPTURE_WIDTH:-1920}"
CAPTURE_HEIGHT="${CAPTURE_HEIGHT:-1080}"
JPEG_QUALITY="${JPEG_QUALITY:-75}"
NODE_ID="${NODE_ID:-${DEVICE_ID}}"
TRIGGER="${TRIGGER:-scheduled}"
MAX_RETRY="${MAX_RETRY:-3}"

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

refresh_token() {
    if [ -z "${REFRESH_TOKEN:-}" ] || [ -z "${COGNITO_CLIENT_ID:-}" ]; then
        return 0  # No refresh config — skip silently
    fi

    local region="${AWS_REGION:-ap-northeast-1}"
    local endpoint="https://cognito-idp.${region}.amazonaws.com/"

    local response
    response=$(curl -s -X POST "$endpoint" \
        -H "Content-Type: application/x-amz-json-1.1" \
        -H "X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth" \
        -d "{
            \"AuthFlow\": \"REFRESH_TOKEN_AUTH\",
            \"ClientId\": \"${COGNITO_CLIENT_ID}\",
            \"AuthParameters\": {
                \"REFRESH_TOKEN\": \"${REFRESH_TOKEN}\"
            }
        }" --connect-timeout 10 --max-time 15 2>/dev/null) || return 1

    local new_token
    new_token=$(echo "$response" | grep -o '"AccessToken":"[^"]*"' | cut -d'"' -f4)

    if [ -n "$new_token" ]; then
        AUTH_TOKEN="$new_token"
        # Update .env file with new token
        sed -i "s|^export AUTH_TOKEN=.*|export AUTH_TOKEN=\"${new_token}\"|" "$ENV_FILE"
        log "[AUTH] Token refreshed"
    else
        log "[AUTH] Token refresh failed"
        return 1
    fi
}

# ── Config polling ──────────────────────────────────────────────

poll_config() {
    local config_url="${API_BASE_URL}/api/v1/devices/${DEVICE_ID}/config"

    local response
    response=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer ${AUTH_TOKEN}" \
        "$config_url" --connect-timeout 10 --max-time 15 2>/dev/null) || return 1

    local http_code body
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ] && [ -n "$body" ]; then
        # Parse config JSON with jq if available
        if command -v jq &>/dev/null; then
            local w h q
            w=$(echo "$body" | jq -r '.resolution_width // empty' 2>/dev/null)
            h=$(echo "$body" | jq -r '.resolution_height // empty' 2>/dev/null)
            q=$(echo "$body" | jq -r '.jpeg_quality // empty' 2>/dev/null)

            [ -n "$w" ] && CAPTURE_WIDTH="$w"
            [ -n "$h" ] && CAPTURE_HEIGHT="$h"
            [ -n "$q" ] && JPEG_QUALITY="$q"

            # Check for test shot request
            local test_shot
            test_shot=$(echo "$body" | jq -r '.test_shot_requested // false' 2>/dev/null)
            if [ "$test_shot" = "true" ]; then
                TRIGGER="test_shot"
                log "[CONFIG] Test shot requested"
            fi

            log "[CONFIG] Applied: ${CAPTURE_WIDTH}x${CAPTURE_HEIGHT} q${JPEG_QUALITY}"
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
    local wifi_dbm="null"
    if command -v iwconfig &>/dev/null; then
        wifi_dbm=$(iwconfig wlan0 2>/dev/null | grep -oP '(?<=Signal level=)-?\d+' || echo "null")
    fi

    # Storage status
    local storage="ok"
    local usage_pct
    usage_pct=$(df -h / | awk 'NR==2 {print $5+0}')
    if [ "$usage_pct" -gt 90 ]; then
        storage="full"
    elif [ "$usage_pct" -gt 80 ]; then
        storage="low"
    fi

    # Battery (UPS HAT if connected)
    local battery="null"
    battery=$(cat /sys/class/power_supply/*/capacity 2>/dev/null | head -1 || echo "null")

    local payload="{\"wifi_dbm\":${wifi_dbm},\"storage\":\"${storage}\",\"battery_pct\":${battery}}"

    curl -s -o /dev/null \
        -H "Authorization: Bearer ${AUTH_TOKEN}" \
        -H "Content-Type: application/json" \
        -X POST "$heartbeat_url" \
        -d "$payload" \
        --connect-timeout 10 \
        --max-time 15 \
        2>/dev/null && log "[HEARTBEAT] OK" || log "[HEARTBEAT] Failed (non-critical)"
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

run_once() {
    rotate_log
    log "[START] device=${DEVICE_ID} bed=${BED_ID} trigger=${TRIGGER}"

    # 1. Refresh token if needed
    refresh_token || true

    # 2. Poll config for latest settings
    poll_config || true

    # 3. Upload any queued files
    upload_spool

    # 4. Capture new image
    local filepath
    filepath=$(capture) || { send_heartbeat; return 1; }

    # 5. Upload
    upload "$filepath" || true

    # 6. Heartbeat
    send_heartbeat

    log "[DONE]"
}

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
