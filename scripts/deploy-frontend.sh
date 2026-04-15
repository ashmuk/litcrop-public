#!/usr/bin/env bash
# deploy-frontend.sh — T-SCRIPT-03
# Build and deploy the LitCrop frontend to S3 (litcrop-poc-static).
# Optionally invalidates the CloudFront distribution.
#
# Usage:
#   ./scripts/deploy-frontend.sh [--skip-build]
#
# Environment variables:
#   CF_DIST_ID       CloudFront distribution ID (optional — skips invalidation if unset)
#   CF_FUNCTION_NAME CloudFront Function name (optional — updates URL-rewrite function if set)
#   AWS_PROFILE      Override the default 'litcrop' profile

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
      echo "  CF_DIST_ID         CloudFront distribution ID for cache invalidation"
      echo "  CF_FUNCTION_NAME   CloudFront Function name to update after deploy"
      echo "  AWS_PROFILE        AWS profile name (default: litcrop)"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

# ── Pre-flight: verify .env exists ────────────────────────────────
# PUBLIC_API_BASE_URL must be set at build time so the frontend calls
# the API Gateway directly (not relative /api/v1 on CloudFront).
# See: src/frontend/.env.example
ENV_FILE="${FRONTEND_DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
  echo "✗ ${ENV_FILE} not found" >&2
  echo "  Copy .env.example → .env and set PUBLIC_API_BASE_URL" >&2
  echo "  Without it, API calls will silently fail on CloudFront." >&2
  exit 1
fi
if ! grep -q "PUBLIC_API_BASE_URL" "${ENV_FILE}"; then
  echo "⚠  PUBLIC_API_BASE_URL not found in ${ENV_FILE}" >&2
  echo "  API calls will fall back to /api/v1 (broken on CloudFront)." >&2
  exit 1
fi
echo "✓ .env verified (PUBLIC_API_BASE_URL set)"

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

# ── CloudFront Function update (optional) ────────────────────────
# If CF_FUNCTION_NAME is set, update the CloudFront Function code from
# scripts/cloudfront-function-url-rewrite.js.
# Requires cloudfront:DescribeFunction + cloudfront:UpdateFunction permissions.
# Note (#397): the POC principal (scripts/iam-policy.json) intentionally
# does NOT grant these actions — the CDK deploy principal does. When this
# script runs under the POC user, the graceful-fallback below prints a
# manual step instead. The CDK-owned prod-least principal has full access.
if [ -n "${CF_FUNCTION_NAME:-}" ]; then
  CF_FUNCTION_JS="scripts/cloudfront-function-url-rewrite.js"
  if [ ! -f "${CF_FUNCTION_JS}" ]; then
    echo "⚠  ${CF_FUNCTION_JS} not found — skipping CloudFront Function update" >&2
  else
    echo "▶ Updating CloudFront Function '${CF_FUNCTION_NAME}'…"
    # Get the current ETag (required for UpdateFunction)
    CF_ETAG=$(aws cloudfront describe-function \
      --name "${CF_FUNCTION_NAME}" \
      --profile "${AWS_PROFILE}" \
      --query 'ETag' \
      --output text 2>/dev/null || echo "")
    if [ -z "${CF_ETAG}" ]; then
      echo "⚠  Could not retrieve ETag for CloudFront Function '${CF_FUNCTION_NAME}'"
      echo "   Manual step: aws cloudfront update-function --name ${CF_FUNCTION_NAME} \\"
      echo "     --if-match <etag> --function-config Comment=url-rewrite,Runtime=cloudfront-js-2.0 \\"
      echo "     --function-code fileb://${CF_FUNCTION_JS}"
    else
      aws cloudfront update-function \
        --name "${CF_FUNCTION_NAME}" \
        --if-match "${CF_ETAG}" \
        --function-config "Comment=url-rewrite,Runtime=cloudfront-js-2.0" \
        --function-code "fileb://${CF_FUNCTION_JS}" \
        --profile "${AWS_PROFILE}" 2>/dev/null \
        && echo "✓ CloudFront Function updated" \
        || {
          echo "⚠  cloudfront:UpdateFunction permission denied."
          echo "   Manual step: aws cloudfront update-function --name ${CF_FUNCTION_NAME} \\"
          echo "     --if-match ${CF_ETAG} --function-config Comment=url-rewrite,Runtime=cloudfront-js-2.0 \\"
          echo "     --function-code fileb://${CF_FUNCTION_JS} --profile ${AWS_PROFILE}"
        }
    fi
  fi
else
  echo "ℹ  CF_FUNCTION_NAME not set — skipping CloudFront Function update"
fi

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
