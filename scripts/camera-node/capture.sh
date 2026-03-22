#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# LitCrop Camera Node — Capture & Upload Script
#
# Captures a JPEG image using rpicam-still, then uploads it to the
# LitCrop API. Designed for Raspberry Pi Zero 2 W with Camera Module 3.
#
# Usage:
#   ./capture.sh                    # Single capture + upload
#   ./capture.sh --loop             # Continuous loop (use with systemd/cron)
#
# Configuration: /etc/litcrop/node.conf (or env vars)
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────

CONFIG_FILE="${LITCROP_CONFIG:-/etc/litcrop/node.conf}"

# Defaults (overridden by config file or env vars)
NODE_ID="${NODE_ID:-field-01-camera-01}"
BED_ID="${BED_ID:-}"
API_BASE_URL="${API_BASE_URL:-}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
TRIGGER="${TRIGGER:-scheduled}"
CAPTURE_WIDTH="${CAPTURE_WIDTH:-1920}"
CAPTURE_HEIGHT="${CAPTURE_HEIGHT:-1080}"
JPEG_QUALITY="${JPEG_QUALITY:-75}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-600}"
SPOOL_DIR="${SPOOL_DIR:-/var/spool/litcrop}"
MAX_RETRY="${MAX_RETRY:-3}"
LOG_FILE="${LOG_FILE:-/var/log/litcrop-node.log}"

# Load config file if it exists
if [ -f "$CONFIG_FILE" ]; then
    # shellcheck source=/dev/null
    source "$CONFIG_FILE"
fi

# ── Validation ───────────────────────────────────────────────────

if [ -z "$BED_ID" ]; then
    echo "[ERROR] BED_ID is required. Set in $CONFIG_FILE or as env var." >&2
    exit 1
fi

if [ -z "$API_BASE_URL" ]; then
    echo "[ERROR] API_BASE_URL is required. Set in $CONFIG_FILE or as env var." >&2
    exit 1
fi

if [ -z "$AUTH_TOKEN" ]; then
    echo "[ERROR] AUTH_TOKEN is required. Set in $CONFIG_FILE or as env var." >&2
    exit 1
fi

# ── Setup ────────────────────────────────────────────────────────

mkdir -p "$SPOOL_DIR"
UPLOAD_URL="${API_BASE_URL}/api/v1/beds/${BED_ID}/images"

log() {
    local msg="[$(date -Iseconds)] $1"
    echo "$msg" | tee -a "$LOG_FILE"
}

# ── Capture ──────────────────────────────────────────────────────

capture() {
    local timestamp
    timestamp=$(date -Iseconds)
    local filename="${NODE_ID}_${timestamp//[:]/-}.jpg"
    local filepath="${SPOOL_DIR}/${filename}"

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

# ── Upload ───────────────────────────────────────────────────────

upload() {
    local filepath="$1"
    local captured_at="$2"
    local attempt=0
    local delay=1

    while [ $attempt -lt "$MAX_RETRY" ]; do
        attempt=$((attempt + 1))
        log "[UPLOAD] Attempt ${attempt}/${MAX_RETRY} → ${UPLOAD_URL}"

        local http_code
        http_code=$(curl -s -o /tmp/litcrop-upload-response.json -w "%{http_code}" \
            -X POST "$UPLOAD_URL" \
            -H "Authorization: Bearer ${AUTH_TOKEN}" \
            -F "image=@${filepath}" \
            -F "captured_at=${captured_at}" \
            -F "node_id=${NODE_ID}" \
            -F "trigger=${TRIGGER}" \
            --connect-timeout 10 \
            --max-time 30 \
            2>> "$LOG_FILE")

        if [ "$http_code" = "201" ]; then
            log "[UPLOAD] OK — HTTP 201"
            rm -f "$filepath"
            return 0
        else
            log "[UPLOAD] FAILED — HTTP ${http_code}"
            if [ -f /tmp/litcrop-upload-response.json ]; then
                cat /tmp/litcrop-upload-response.json >> "$LOG_FILE"
                echo "" >> "$LOG_FILE"
            fi

            if [ $attempt -lt "$MAX_RETRY" ]; then
                log "[UPLOAD] Retrying in ${delay}s..."
                sleep "$delay"
                delay=$((delay * 2))
            fi
        fi
    done

    log "[UPLOAD] FAILED after ${MAX_RETRY} attempts — file kept in spool: ${filepath}"
    return 1
}

# ── Upload Spool (retry queued files) ────────────────────────────

upload_spool() {
    local count=0
    for file in "$SPOOL_DIR"/*.jpg; do
        [ -f "$file" ] || continue
        count=$((count + 1))

        # Extract timestamp from filename: NODE_ID_YYYY-MM-DDTHH-MM-SS+HH-MM.jpg
        local basename
        basename=$(basename "$file" .jpg)
        # Reconstruct ISO timestamp from filename (replace - with : in time portion)
        local ts_part="${basename#*_}"
        local captured_at
        captured_at=$(echo "$ts_part" | sed 's/\([0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}T[0-9]\{2\}\)-\([0-9]\{2\}\)-\([0-9]\{2\}\)/\1:\2:\3/')

        upload "$file" "$captured_at" || true
    done

    if [ $count -gt 0 ]; then
        log "[SPOOL] Processed ${count} queued file(s)"
    fi
}

# ── Main ─────────────────────────────────────────────────────────

run_once() {
    log "[START] node=${NODE_ID} bed=${BED_ID} trigger=${TRIGGER}"

    # First, try to upload any queued files from previous failed attempts
    upload_spool

    # Capture new image
    local filepath
    filepath=$(capture) || return 1

    local captured_at
    captured_at=$(date -Iseconds)

    # Upload
    upload "$filepath" "$captured_at"
}

if [ "${1:-}" = "--loop" ]; then
    log "[LOOP] Starting continuous capture every ${INTERVAL_SECONDS}s"
    while true; do
        run_once || true
        log "[LOOP] Sleeping ${INTERVAL_SECONDS}s..."
        sleep "$INTERVAL_SECONDS"
    done
else
    run_once
fi
