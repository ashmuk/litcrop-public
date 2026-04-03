#!/bin/bash
# ──────────────────────────────────────────────────────
# Camera Focus Test — rapid capture + upload loop
#
# Takes photos on the Pi and uploads them to LitCrop.
# View results immediately on the Crops page (bed timeline).
#
# Usage:
#   source ~/litcrop/.env
#   ./test-camera-focus.sh [count] [interval_seconds]
#
# Examples:
#   ./test-camera-focus.sh              # 5 shots, 10 sec apart
#   ./test-camera-focus.sh 3            # 3 shots, 10 sec apart
#   ./test-camera-focus.sh 10 5         # 10 shots, 5 sec apart
# ──────────────────────────────────────────────────────

set -e

DEVICE_ID="${LITCROP_DEVICE_ID:?Set LITCROP_DEVICE_ID (source your .env file)}"
API_KEY="${LITCROP_API_KEY:?Set LITCROP_API_KEY}"
REFRESH_TOKEN="${LITCROP_REFRESH_TOKEN:?Set LITCROP_REFRESH_TOKEN}"
CLIENT_ID="${LITCROP_COGNITO_CLIENT_ID:-5bm4tnbd4kuhjcour2p0n4aldq}"
REGION="${LITCROP_COGNITO_REGION:-ap-northeast-1}"
CONFIG_URL="${LITCROP_CONFIG_URL}"

SHOT_COUNT=${1:-5}
INTERVAL=${2:-10}

# Derive API base
API_BASE=$(echo "$CONFIG_URL" | sed "s|/api/v1/devices/.*||")

echo "=== LitCrop Camera Focus Test ==="
echo "Device:   $DEVICE_ID"
echo "Shots:    $SHOT_COUNT"
echo "Interval: ${INTERVAL}s"
echo ""

# ── Get access token ──────────────────────────────────
echo "Getting access token..."
ACCESS_TOKEN=$(curl -s -X POST \
  "https://cognito-idp.${REGION}.amazonaws.com/" \
  -H "Content-Type: application/x-amz-json-1.1" \
  -H "X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth" \
  -d "{
    \"AuthFlow\": \"REFRESH_TOKEN_AUTH\",
    \"ClientId\": \"${CLIENT_ID}\",
    \"AuthParameters\": {
      \"REFRESH_TOKEN\": \"${REFRESH_TOKEN}\"
    }
  }" | python3 -c "import sys,json; print(json.load(sys.stdin)['AuthenticationResult']['AccessToken'])" 2>/dev/null)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ Failed to get access token. Check your refresh token."
  exit 1
fi
echo "✅ Token obtained"
echo ""

# ── Get device config (to find bed_id) ────────────────
echo "Getting device config..."
CONFIG=$(curl -s \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Device-Key: $API_KEY" \
  "$CONFIG_URL")

BED_ID=$(echo "$CONFIG" | python3 -c "import sys,json; print(json.load(sys.stdin)['bed_id'])" 2>/dev/null)
RESOLUTION=$(echo "$CONFIG" | python3 -c "import sys,json; print(json.load(sys.stdin)['resolution'])" 2>/dev/null)
QUALITY=$(echo "$CONFIG" | python3 -c "import sys,json; print(json.load(sys.stdin)['jpeg_quality'])" 2>/dev/null)

if [ -z "$BED_ID" ]; then
  echo "❌ Failed to get config. Check device key."
  exit 1
fi

# Parse resolution
WIDTH=$(echo "$RESOLUTION" | cut -d'x' -f1)
HEIGHT=$(echo "$RESOLUTION" | cut -d'x' -f2)

echo "✅ Bed: $BED_ID | Resolution: ${WIDTH}x${HEIGHT} | Quality: ${QUALITY}"
echo ""

# ── Capture + Upload loop ─────────────────────────────
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

for i in $(seq 1 "$SHOT_COUNT"); do
  TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  FILENAME="$TMPDIR/shot_${i}.jpg"

  echo "--- Shot $i of $SHOT_COUNT ($TIMESTAMP) ---"

  # Capture (try libcamera first, fall back to raspistill)
  echo "  📸 Capturing..."
  if command -v libcamera-jpeg &>/dev/null; then
    libcamera-jpeg -o "$FILENAME" --width "$WIDTH" --height "$HEIGHT" -q "$QUALITY" --nopreview -t 1000 2>/dev/null
  elif command -v raspistill &>/dev/null; then
    raspistill -o "$FILENAME" -w "$WIDTH" -h "$HEIGHT" -q "$QUALITY" -t 1000 2>/dev/null
  else
    # Not on a Pi — create a placeholder for testing from Mac
    echo "  ⚠️  No camera found — creating test JPEG placeholder"
    python3 -c "
import struct, zlib
# Minimal valid JPEG (1x1 pixel, gray)
data = bytes([0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01,0x01,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0xFF,0xDB,0x00,0x43,0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,0x07,0x07,0x07,0x09,0x09,0x08,0x0A,0x0C,0x14,0x0D,0x0C,0x0B,0x0B,0x0C,0x19,0x12,0x13,0x0F,0x14,0x1D,0x1A,0x1F,0x1E,0x1D,0x1A,0x1C,0x1C,0x20,0x24,0x2E,0x27,0x20,0x22,0x2C,0x23,0x1C,0x1C,0x28,0x37,0x29,0x2C,0x30,0x31,0x34,0x34,0x34,0x1F,0x27,0x39,0x3D,0x38,0x32,0x3C,0x2E,0x33,0x34,0x32,0xFF,0xC0,0x00,0x0B,0x08,0x00,0x01,0x00,0x01,0x01,0x01,0x11,0x00,0xFF,0xC4,0x00,0x1F,0x00,0x00,0x01,0x05,0x01,0x01,0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0A,0x0B,0xFF,0xDA,0x00,0x08,0x01,0x01,0x00,0x00,0x3F,0x00,0x7B,0x40,0x1B,0xFF,0xD9])
open('$FILENAME','wb').write(data)
"
  fi

  if [ ! -f "$FILENAME" ]; then
    echo "  ❌ Capture failed"
    continue
  fi

  FILE_SIZE=$(wc -c < "$FILENAME" | tr -d ' ')
  echo "  ✅ Captured (${FILE_SIZE} bytes)"

  # Upload
  echo "  ⬆️  Uploading..."
  UPLOAD_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -F "image=@$FILENAME;type=image/jpeg" \
    -F "captured_at=$TIMESTAMP" \
    -F "node_id=$DEVICE_ID" \
    -F "trigger=scheduled" \
    "${API_BASE}/api/v1/beds/${BED_ID}/images")

  HTTP_CODE=$(echo "$UPLOAD_RESPONSE" | tail -1)

  if [ "$HTTP_CODE" = "201" ]; then
    echo "  ✅ Uploaded (HTTP $HTTP_CODE)"
  else
    BODY=$(echo "$UPLOAD_RESPONSE" | sed '$d')
    echo "  ❌ Upload failed (HTTP $HTTP_CODE): $BODY"
  fi

  # Wait between shots (except last)
  if [ "$i" -lt "$SHOT_COUNT" ]; then
    echo "  ⏳ Waiting ${INTERVAL}s..."
    sleep "$INTERVAL"
  fi

  echo ""
done

echo "=== Done! Check the Crops page → select bed $BED_ID → view timeline ==="
echo "=== If images look focused, your camera is ready for production ==="
