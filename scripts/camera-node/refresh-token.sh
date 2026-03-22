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
# ──────────────────────────────────────────────────────────────────

REFRESH_TOKEN="<your-refresh-token>"
CLIENT_ID="<cognito-client-id>"

TOKEN=$(aws cognito-idp initiate-auth \
  --client-id "$CLIENT_ID" \
  --auth-flow REFRESH_TOKEN_AUTH \
  --auth-parameters REFRESH_TOKEN="$REFRESH_TOKEN" \
  --region ap-northeast-1 \
  --query 'AuthenticationResult.IdToken' \
  --output text 2>/dev/null)

if [ -n "$TOKEN" ]; then
    sed -i "s|AUTH_TOKEN=.*|AUTH_TOKEN=\"${TOKEN}\"|" /etc/litcrop/node.conf
    echo "[$(date -Iseconds)] Token refreshed" >> /var/log/litcrop-node.log
fi
