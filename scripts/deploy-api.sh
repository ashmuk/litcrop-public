#!/usr/bin/env bash
# deploy-api.sh — T-SCRIPT-04
# Build, package, and deploy the LitCrop API handler to AWS Lambda.
#
# Usage:
#   ./scripts/deploy-api.sh [--skip-build]
#
# Environment variables:
#   LAMBDA_FUNCTION   Lambda function name (default: litcrop-poc-api)
#   API_GW_ID         API Gateway ID (optional — used to print the invoke URL)
#   AWS_REGION        AWS region (default: ap-northeast-1)
#   AWS_PROFILE       Override the default 'litcrop' profile

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────
API_DIR="src/api"
DIST_DIR="${API_DIR}/dist"
ZIP_PATH="${DIST_DIR}/api.zip"
LAMBDA_FUNCTION="${LAMBDA_FUNCTION:-litcrop-poc-api}"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"
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
      echo "  LAMBDA_FUNCTION  Lambda function name (default: litcrop-poc-api)"
      echo "  API_GW_ID        API Gateway ID for printing the invoke URL"
      echo "  AWS_REGION       AWS region (default: ap-northeast-1)"
      echo "  AWS_PROFILE      AWS profile name (default: litcrop)"
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
  echo "▶ Building API…"
  (cd "${API_DIR}" && npm run build)
  echo "✓ Build complete"
else
  echo "⏭  Skipping build (--skip-build)"
fi

# ── Verify handler exists ─────────────────────────────────────────
HANDLER="${DIST_DIR}/handler.js"
if [ ! -f "${HANDLER}" ]; then
  echo "✗ ${HANDLER} not found" >&2
  echo "  Run without --skip-build first." >&2
  exit 1
fi

# ── Package as zip ────────────────────────────────────────────────
echo "▶ Packaging dist/handler.js → ${ZIP_PATH}…"
# Include all files in dist/ (handler + any chunks produced by the bundler)
(cd "${DIST_DIR}" && zip -r "$(basename "${ZIP_PATH}")" . --exclude "*.zip")
echo "✓ Package ready ($(du -sh "${ZIP_PATH}" | cut -f1))"

# ── Deploy to Lambda ──────────────────────────────────────────────
echo "▶ Updating Lambda function code: ${LAMBDA_FUNCTION}…"
aws lambda update-function-code \
  --function-name "${LAMBDA_FUNCTION}" \
  --zip-file "fileb://${ZIP_PATH}" \
  --profile "${AWS_PROFILE}" \
  --region "${AWS_REGION}"
echo "✓ Code upload submitted"

# ── Wait for active ───────────────────────────────────────────────
echo "▶ Waiting for function to become active…"
aws lambda wait function-active-v2 \
  --function-name "${LAMBDA_FUNCTION}" \
  --profile "${AWS_PROFILE}" \
  --region "${AWS_REGION}"
echo "✓ Function is active"

# ── Print URL ─────────────────────────────────────────────────────
echo ""
if [ -n "${API_GW_ID:-}" ]; then
  echo "🚀 API URL: https://${API_GW_ID}.execute-api.${AWS_REGION}.amazonaws.com"
else
  echo "🚀 Lambda function '${LAMBDA_FUNCTION}' is live in ${AWS_REGION}"
  echo "   (Set API_GW_ID to print the full API Gateway URL)"
fi
