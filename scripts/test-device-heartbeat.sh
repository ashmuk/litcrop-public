#!/bin/bash
# ──────────────────────────────────────────────────────
# Test Device Heartbeat — simulate a Pi sending health data
#
# Usage:
#   1. Register a device from the web UI
#   2. Copy the Device ID and API Key
#   3. Get a valid JWT access token (from browser DevTools → Application → localStorage → litcrop-access-token)
#   4. Run: ./scripts/test-device-heartbeat.sh
# ──────────────────────────────────────────────────────

API_BASE="https://jpg5gd81uc.execute-api.ap-northeast-1.amazonaws.com"

# ── Configuration (edit these) ────────────────────────
DEVICE_ID="${LITCROP_DEVICE_ID:-dev-CHANGEME}"
API_KEY="${LITCROP_API_KEY:-dk_CHANGEME}"
ACCESS_TOKEN="${LITCROP_ACCESS_TOKEN:-CHANGEME}"

echo "=== LitCrop Device Heartbeat Test ==="
echo "Device:  $DEVICE_ID"
echo "API URL: $API_BASE"
echo ""

# ── Step 1: Config Poll ──────────────────────────────
echo "1. Polling device config..."
CONFIG_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Device-Key: $API_KEY" \
  "$API_BASE/api/v1/devices/$DEVICE_ID/config")

HTTP_CODE=$(echo "$CONFIG_RESPONSE" | tail -1)
BODY=$(echo "$CONFIG_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ Config received (HTTP $HTTP_CODE)"
  echo "   $BODY" | python3 -m json.tool 2>/dev/null || echo "   $BODY"
else
  echo "   ❌ Config poll failed (HTTP $HTTP_CODE)"
  echo "   $BODY"
  echo ""
  echo "Troubleshooting:"
  echo "  - Is ACCESS_TOKEN valid? (expires after 1 hour)"
  echo "  - Is DEVICE_ID correct?"
  echo "  - Is API_KEY correct?"
  exit 1
fi

echo ""

# ── Step 2: Send Heartbeat ───────────────────────────
echo "2. Sending heartbeat..."
HEARTBEAT_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Device-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "battery_level": 72,
    "wifi_signal_dbm": -45,
    "storage_status": "ok",
    "capabilities": {
      "resolutions": ["1920x1080", "1280x720"],
      "has_battery_sensor": true,
      "has_pir_sensor": false
    }
  }' \
  "$API_BASE/api/v1/devices/$DEVICE_ID/heartbeat")

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
echo "=== Done! Check the Device page — status should show Online ==="
