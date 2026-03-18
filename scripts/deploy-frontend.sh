#!/usr/bin/env bash
# deploy-frontend.sh — T-SCRIPT-03
# Build and deploy the LitCrop frontend to S3 (litcrop-poc-static).
# Optionally invalidates the CloudFront distribution.
#
# Usage:
#   ./scripts/deploy-frontend.sh [--skip-build]
#
# Environment variables:
#   CF_DIST_ID   CloudFront distribution ID (optional — skips invalidation if unset)
#   AWS_PROFILE  Override the default 'litcrop' profile

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────
S3_BUCKET="litcrop-poc-static"
FRONTEND_DIR="src/frontend"
DIST_DIR="${FRONTEND_DIR}/dist"
AWS_PROFILE="${AWS_PROFILE:-litcrop}"
SKIP_BUILD=false

# ── Argument parsing ──────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --skip-build)
      SKIP_BUILD=true
      ;;
    --help|-h)
      echo "Usage: $0 [--skip-build]"
      echo ""
      echo "Options:"
      echo "  --skip-build   Skip npm run build (use existing dist/)"
      echo ""
      echo "Environment:"
      echo "  CF_DIST_ID     CloudFront distribution ID for cache invalidation"
      echo "  AWS_PROFILE    AWS profile name (default: litcrop)"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

# ── Build ─────────────────────────────────────────────────────────
if [ "$SKIP_BUILD" = false ]; then
  echo "▶ Building frontend…"
  (cd "${FRONTEND_DIR}" && npm run build)
  echo "✓ Build complete"
else
  echo "⏭  Skipping build (--skip-build)"
fi

# ── Verify dist exists ────────────────────────────────────────────
if [ ! -d "${DIST_DIR}" ]; then
  echo "✗ dist/ directory not found at ${DIST_DIR}" >&2
  echo "  Run without --skip-build first." >&2
  exit 1
fi

# ── Sync to S3 ────────────────────────────────────────────────────
echo "▶ Syncing ${DIST_DIR} → s3://${S3_BUCKET}/ …"
aws s3 sync "${DIST_DIR}/" "s3://${S3_BUCKET}/" \
  --delete \
  --profile "${AWS_PROFILE}"
echo "✓ S3 sync complete"

# ── CloudFront invalidation (optional) ───────────────────────────
if [ -n "${CF_DIST_ID:-}" ]; then
  echo "▶ Creating CloudFront invalidation for distribution ${CF_DIST_ID}…"
  aws cloudfront create-invalidation \
    --distribution-id "${CF_DIST_ID}" \
    --paths "/*" \
    --profile "${AWS_PROFILE}"
  echo "✓ CloudFront invalidation submitted"
else
  echo "ℹ  CF_DIST_ID not set — skipping CloudFront invalidation"
fi

# ── Print URL ─────────────────────────────────────────────────────
echo ""
if [ -n "${CF_DIST_ID:-}" ]; then
  CF_DOMAIN=$(aws cloudfront get-distribution \
    --id "${CF_DIST_ID}" \
    --profile "${AWS_PROFILE}" \
    --query 'Distribution.DomainName' \
    --output text 2>/dev/null || echo "")
  if [ -n "$CF_DOMAIN" ]; then
    echo "🌐 Frontend URL: https://${CF_DOMAIN}"
  else
    echo "🌐 Frontend S3 bucket: s3://${S3_BUCKET}/"
  fi
else
  echo "🌐 Frontend S3 bucket: s3://${S3_BUCKET}/"
  echo "   (Set CF_DIST_ID to get the CloudFront URL)"
fi
