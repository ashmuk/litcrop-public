#!/usr/bin/env bash
# scripts/setup-lambda.sh
# Creates the Lambda function, API Gateway HTTP API, and wires them together.
# Assumes setup-aws.sh has already run (DynamoDB + S3 exist).
#
# Prerequisites:
#   - IAM role litcrop-poc-lambda exists (created via Console or setup-iam-role.sh)
#   - src/api built: npm run build (produces dist/handler.js)
#
# Usage:
#   ./scripts/setup-lambda.sh             # Create Lambda + API Gateway
#   ./scripts/setup-lambda.sh --teardown  # Delete Lambda + API Gateway

set -euo pipefail

PROFILE="litcrop"
REGION="ap-northeast-1"
ACCOUNT_ID="<AWS_ACCOUNT_ID>"
FUNCTION_NAME="litcrop-poc-api"
API_NAME="litcrop-poc-api"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/litcrop-poc-lambda"
API_DIR="src/api"
DIST_DIR="${API_DIR}/dist"
ZIP_PATH="${DIST_DIR}/api.zip"
AWS="aws --profile ${PROFILE} --region ${REGION}"

# ── Parse args ───────────────────────────────────────────────────

TEARDOWN=false
for arg in "$@"; do
  [[ "$arg" == "--teardown" ]] && TEARDOWN=true
done

# ── Teardown ─────────────────────────────────────────────────────

if [[ "$TEARDOWN" == "true" ]]; then
  echo "[teardown] Deleting Lambda function: ${FUNCTION_NAME}"
  ${AWS} lambda delete-function \
    --function-name "${FUNCTION_NAME}" 2>/dev/null \
    || echo "[warn] Function not found or already deleted."

  # Find and delete API Gateway
  API_ID=$(${AWS} apigatewayv2 get-apis \
    --query "Items[?Name=='${API_NAME}'].ApiId" \
    --output text 2>/dev/null || echo "")
  if [[ -n "$API_ID" && "$API_ID" != "None" ]]; then
    echo "[teardown] Deleting API Gateway: ${API_ID}"
    ${AWS} apigatewayv2 delete-api --api-id "${API_ID}" \
      || echo "[warn] API Gateway not found or already deleted."
  else
    echo "[teardown] No API Gateway found with name: ${API_NAME}"
  fi

  echo "[teardown] Done."
  exit 0
fi

# ── Build + Package ──────────────────────────────────────────────

echo "[setup] Building API..."
(cd "${API_DIR}" && npm run build)

echo "[setup] Packaging dist/ → ${ZIP_PATH}"
(cd "${DIST_DIR}" && zip -r "$(basename "${ZIP_PATH}")" . --exclude "*.zip")
echo "[setup] Package ready: $(du -sh "${ZIP_PATH}" | cut -f1)"

# ── Create Lambda Function ───────────────────────────────────────

echo "[setup] Creating Lambda function: ${FUNCTION_NAME}"
${AWS} lambda create-function \
  --function-name "${FUNCTION_NAME}" \
  --runtime nodejs22.x \
  --handler handler.handler \
  --role "${ROLE_ARN}" \
  --zip-file "fileb://${ZIP_PATH}" \
  --memory-size 256 \
  --timeout 30 \
  --environment "Variables={TABLE_NAME=litcrop-poc,IMAGE_BUCKET=litcrop-poc-images}" \
  --no-cli-pager \
  && echo "[setup] Function created." \
  || echo "[warn] Function may already exist. Use deploy-api.sh to update code."

echo "[setup] Waiting for function to become active..."
${AWS} lambda wait function-active-v2 --function-name "${FUNCTION_NAME}"
echo "[setup] Function is active."

# ── Create API Gateway HTTP API ──────────────────────────────────

LAMBDA_ARN=$(${AWS} lambda get-function \
  --function-name "${FUNCTION_NAME}" \
  --query 'Configuration.FunctionArn' \
  --output text)

echo "[setup] Creating HTTP API: ${API_NAME}"
API_RESULT=$(${AWS} apigatewayv2 create-api \
  --name "${API_NAME}" \
  --protocol-type HTTP \
  --target "${LAMBDA_ARN}")

API_ID=$(echo "${API_RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin)['ApiId'])")
API_ENDPOINT=$(echo "${API_RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin)['ApiEndpoint'])")

echo "[setup] API Gateway created: ${API_ID}"
echo "[setup] Endpoint: ${API_ENDPOINT}"

# ── Grant API Gateway → Lambda Permission ────────────────────────

echo "[setup] Adding Lambda invoke permission for API Gateway..."
${AWS} lambda add-permission \
  --function-name "${FUNCTION_NAME}" \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*" \
  --no-cli-pager \
  && echo "[setup] Permission added." \
  || echo "[warn] Permission may already exist."

# ── Summary ──────────────────────────────────────────────────────

echo ""
echo "[setup] ============================================="
echo "[setup] Lambda + API Gateway creation complete!"
echo "[setup] ============================================="
echo "[setup] Function    : ${FUNCTION_NAME}"
echo "[setup] API Gateway : ${API_ID}"
echo "[setup] API URL     : ${API_ENDPOINT}"
echo ""
echo "[setup] NEXT STEPS:"
echo "  1. Add CLOUDFRONT_ORIGIN env var after CloudFront is created:"
echo "     aws lambda update-function-configuration \\"
echo "       --function-name ${FUNCTION_NAME} \\"
echo "       --environment \"Variables={TABLE_NAME=litcrop-poc,IMAGE_BUCKET=litcrop-poc-images,CLOUDFRONT_ORIGIN=https://<cf-domain>}\" \\"
echo "       --profile ${PROFILE} --region ${REGION}"
echo "  2. Deploy frontend: ./scripts/deploy-frontend.sh"
echo "  3. Set up CloudFront (via Console — see scripts/setup-cloudfront.md)"
echo "[setup] ============================================="
