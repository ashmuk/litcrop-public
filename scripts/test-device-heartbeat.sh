#!/bin/bash
# ──────────────────────────────────────────────────────
# Test Device Heartbeat — one-command connection test
#
# Usage:
#   1. Register a device from the web UI
#   2. Download the .env config file
#   3. Run: source ~/.litcrop.env && ./scripts/test-device-heartbeat.sh
#
# Or set variables inline:
#   LITCROP_DEVICE_ID=dev-xxx \
#   LITCROP_API_KEY=dk_xxx \
#   LITCROP_REFRESH_TOKEN=eyJ... \
#   LITCROP_COGNITO_CLIENT_ID=5bm4tnbd4kuhjcour2p0n4aldq \
#   ./scripts/test-device-heartbeat.sh
# ──────────────────────────────────────────────────────

set -e

DEVICE_ID="${LITCROP_DEVICE_ID:?Set LITCROP_DEVICE_ID}"
API_KEY="${LITCROP_API_KEY:?Set LITCROP_API_KEY}"
REFRESH_TOKEN="${LITCROP_REFRESH_TOKEN:?Set LITCROP_REFRESH_TOKEN}"
CLIENT_ID="${LITCROP_COGNITO_CLIENT_ID:-5bm4tnbd4kuhjcour2p0n4aldq}"
REGION="${LITCROP_COGNITO_REGION:-ap-northeast-1}"
CONFIG_URL="${LITCROP_CONFIG_URL:-https://jpg5gd81uc.execute-api.ap-northeast-1.amazonaws.com/api/v1/devices/${DEVICE_ID}/config}"

# Derive API base from config URL
API_BASE=$(echo "$CONFIG_URL" | sed "s|/api/v1/devices/.*||")

echo "=== LitCrop Device Connection Test ==="
echo "Device:  $DEVICE_ID"
echo ""

# ── Step 1: Get fresh access token ────────────────────
echo "1. Getting fresh access token from Cognito..."
TOKEN_RESPONSE=$(curl -s -X POST \
  "https://cognito-idp.${REGION}.amazonaws.com/" \
  -H "Content-Type: application/x-amz-json-1.1" \
  -H "X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth" \
  -d "{
    \"AuthFlow\": \"REFRESH_TOKEN_AUTH\",
    \"ClientId\": \"${CLIENT_ID}\",
    \"AuthParameters\": {
      \"REFRESH_TOKEN\": \"${REFRESH_TOKEN}\"
    }
  }")

# Extract access token
ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['AuthenticationResult']['AccessToken'])" 2>/dev/null)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "   ❌ Failed to get access token"
  echo "   Response: $TOKEN_RESPONSE"
  echo ""
  echo "   Possible causes:"
  echo "   - Refresh token expired (valid for 30 days)"
  echo "   - Wrong COGNITO_CLIENT_ID"
  echo "   - Re-register the device to get a new refresh token"
  exit 1
fi

echo "   ✅ Access token obtained (expires in 1 hour)"
echo ""

# ── Step 2: Config poll ───────────────────────────────
echo "2. Polling device config..."
CONFIG_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Device-Key: $API_KEY" \
  "$CONFIG_URL")

HTTP_CODE=$(echo "$CONFIG_RESPONSE" | tail -1)
BODY=$(echo "$CONFIG_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ Config received (HTTP $HTTP_CODE)"
  echo "$BODY" | python3 -m json.tool 2>/dev/null | sed 's/^/   /' || echo "   $BODY"
else
  echo "   ❌ Config poll failed (HTTP $HTTP_CODE)"
  echo "   $BODY"
  exit 1
fi

echo ""

# ── Step 3: Send heartbeat ────────────────────────────
echo "3. Sending heartbeat..."
HEARTBEAT_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Device-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "battery_level": 85,
    "wifi_signal_dbm": -45,
    "storage_status": "ok",
    "capabilities": {
      "resolutions": ["1920x1080", "1280x720"],
      "has_battery_sensor": true,
      "has_pir_sensor": false
    }
  }' \
  "${API_BASE}/api/v1/devices/${DEVICE_ID}/heartbeat")

HTTP_CODE=$(echo "$HEARTBEAT_RESPONSE" | tail -1)
BODY=$(echo "$HEARTBEAT_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ Heartbeat acknowledged (HTTP $HTTP_CODE)"
  echo "   $BODY"
else
  echo "   ❌ Heartbeat failed (HTTP $HTTP_CODE)"
  echo "   $BODY"
  exit 1
fi

echo ""
echo "=== Success! Check the Device page — status should show Online ==="
echo "=== Battery: 85% | WiFi: -45 dBm | Storage: OK ==="
