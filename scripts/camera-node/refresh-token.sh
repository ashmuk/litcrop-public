#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# LitCrop Camera Node — Token Refresh Script
#
# Refreshes the Cognito ID token and updates /etc/litcrop/node.conf.
# Run every 50 minutes via cron (before the 60-minute expiry).
#
# Cron entry (on the Pi):
#   sudo crontab -e
#   */50 * * * * /opt/litcrop/refresh-token.sh
#
# Note: Uses IdToken (not AccessToken). The API Gateway JWT authorizer
# requires the `aud` claim which is only present in Cognito ID tokens.
#
# Configuration: set REFRESH_TOKEN and COGNITO_CLIENT_ID in
#   /etc/litcrop/node.conf — do not hardcode them in this script.
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

CONFIG_FILE="${LITCROP_CONFIG:-/etc/litcrop/node.conf}"

# Load config file (safe key=value parser — no arbitrary code execution)
if [ -f "$CONFIG_FILE" ]; then
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
        # Strip surrounding quotes
        value="${value%\"}"
        value="${value#\"}"
        # Only set known config keys
        case "$key" in
            NODE_ID|BED_ID|API_BASE_URL|AUTH_TOKEN|TRIGGER|\
            CAPTURE_WIDTH|CAPTURE_HEIGHT|JPEG_QUALITY|INTERVAL_SECONDS|\
            SPOOL_DIR|MAX_RETRY|LOG_FILE|REFRESH_TOKEN|COGNITO_CLIENT_ID|AWS_REGION)
                export "$key=$value"
                ;;
        esac
    done < "$CONFIG_FILE"
fi

REFRESH_TOKEN="${REFRESH_TOKEN:-}"
COGNITO_CLIENT_ID="${COGNITO_CLIENT_ID:-}"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"
LOG_FILE="${LOG_FILE:-/var/log/litcrop-node.log}"

if [ -z "$REFRESH_TOKEN" ] || [ -z "$COGNITO_CLIENT_ID" ]; then
    echo "[$(date -Iseconds)] [ERROR] REFRESH_TOKEN and COGNITO_CLIENT_ID must be set in $CONFIG_FILE" \
        >> "$LOG_FILE"
    exit 1
fi

TOKEN=$(aws cognito-idp initiate-auth \
  --client-id "$COGNITO_CLIENT_ID" \
  --auth-flow REFRESH_TOKEN_AUTH \
  --auth-parameters REFRESH_TOKEN="$REFRESH_TOKEN" \
  --region "$AWS_REGION" \
  --query 'AuthenticationResult.IdToken' \
  --output text 2>/dev/null)

if [ -n "$TOKEN" ] && [ "$TOKEN" != "None" ]; then
    # Update AUTH_TOKEN in config using awk (avoids sed delimiter conflicts with token chars)
    awk -v token="$TOKEN" '{
        if ($0 ~ /^AUTH_TOKEN=/) print "AUTH_TOKEN=\"" token "\""
        else print
    }' "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
    chmod 600 "$CONFIG_FILE"
    echo "[$(date -Iseconds)] Token refreshed" >> "$LOG_FILE"
else
    echo "[$(date -Iseconds)] [ERROR] Token refresh failed — AWS CLI returned no token" \
        >> "$LOG_FILE"
    exit 1
fi
