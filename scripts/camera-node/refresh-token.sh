#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# LitCrop Camera Node — Token Refresh Script
#
# Refreshes the Cognito access token using a stored refresh token.
# Run via cron every 50 minutes (tokens expire after 60 minutes).
#
# Requires: aws CLI installed on the Pi
#   sudo apt install -y awscli
#   aws configure (set region to ap-northeast-1)
#
# Usage:
#   ./refresh-token.sh
#   # Or via cron: */50 * * * * /opt/litcrop/refresh-token.sh
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

CONFIG_FILE="${LITCROP_CONFIG:-/etc/litcrop/node.conf}"
LOG_FILE="${LOG_FILE:-/var/log/litcrop-node.log}"

# Load config
if [ -f "$CONFIG_FILE" ]; then
    # shellcheck source=/dev/null
    source "$CONFIG_FILE"
fi

REFRESH_TOKEN="${REFRESH_TOKEN:-}"
COGNITO_CLIENT_ID="${COGNITO_CLIENT_ID:-}"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"

if [ -z "$REFRESH_TOKEN" ] || [ -z "$COGNITO_CLIENT_ID" ]; then
    echo "[$(date -Iseconds)] [TOKEN] SKIP — REFRESH_TOKEN or COGNITO_CLIENT_ID not set" >> "$LOG_FILE"
    exit 0
fi

TOKEN=$(aws cognito-idp initiate-auth \
    --client-id "$COGNITO_CLIENT_ID" \
    --auth-flow REFRESH_TOKEN_AUTH \
    --auth-parameters "REFRESH_TOKEN=${REFRESH_TOKEN}" \
    --region "$AWS_REGION" \
    --query 'AuthenticationResult.AccessToken' \
    --output text 2>/dev/null || echo "")

if [ -n "$TOKEN" ] && [ "$TOKEN" != "None" ]; then
    sed -i "s|AUTH_TOKEN=.*|AUTH_TOKEN=\"${TOKEN}\"|" "$CONFIG_FILE"
    echo "[$(date -Iseconds)] [TOKEN] Refreshed OK" >> "$LOG_FILE"
else
    echo "[$(date -Iseconds)] [TOKEN] FAILED — could not refresh token" >> "$LOG_FILE"
    exit 1
fi
