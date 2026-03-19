#!/usr/bin/env bash
# scripts/setup-aws.sh
# Creates (or tears down) all AWS resources for the LitCrop PoC.
#
# Usage:
#   ./scripts/setup-aws.sh             # Create resources
#   ./scripts/setup-aws.sh --teardown  # Delete resources

set -euo pipefail

PROFILE="litcrop"
REGION="ap-northeast-1"
TABLE_NAME="litcrop-poc"
IMAGE_BUCKET="litcrop-poc-images"
STATIC_BUCKET="litcrop-poc-static"
AWS="aws --profile ${PROFILE} --region ${REGION}"

# ── Parse args ───────────────────────────────────────────────────

TEARDOWN=false
for arg in "$@"; do
  [[ "$arg" == "--teardown" ]] && TEARDOWN=true
done

# ── Teardown ─────────────────────────────────────────────────────

if [[ "$TEARDOWN" == "true" ]]; then
  echo "[teardown] Deleting DynamoDB table: ${TABLE_NAME}"
  ${AWS} dynamodb delete-table \
    --table-name "${TABLE_NAME}" || echo "[warn] Table not found or already deleted."

  echo "[teardown] Deleting S3 bucket: ${IMAGE_BUCKET}"
  ${AWS} s3 rb "s3://${IMAGE_BUCKET}" --force || echo "[warn] Bucket not found or already deleted."

  echo "[teardown] Deleting S3 bucket: ${STATIC_BUCKET}"
  ${AWS} s3 rb "s3://${STATIC_BUCKET}" --force || echo "[warn] Bucket not found or already deleted."

  echo "[teardown] Done. IAM role must be deleted manually via the AWS Console."
  exit 0
fi

# ── Create DynamoDB table ─────────────────────────────────────────
# Provisioning order per ARCHITECTURE.md:
# 1. DynamoDB table with GSI1 and GSI2
# 2. S3 buckets
# 3. IAM role (commented — create via console)

echo "[setup] Creating DynamoDB table: ${TABLE_NAME}"

${AWS} dynamodb create-table \
  --table-name "${TABLE_NAME}" \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=GSI1PK,AttributeType=S \
    AttributeName=GSI1SK,AttributeType=S \
    AttributeName=GSI2PK,AttributeType=S \
    AttributeName=GSI2SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "GSI1",
        "KeySchema": [
          {"AttributeName":"GSI1PK","KeyType":"HASH"},
          {"AttributeName":"GSI1SK","KeyType":"RANGE"}
        ],
        "Projection": {"ProjectionType":"ALL"}
      },
      {
        "IndexName": "GSI2",
        "KeySchema": [
          {"AttributeName":"GSI2PK","KeyType":"HASH"},
          {"AttributeName":"GSI2SK","KeyType":"RANGE"}
        ],
        "Projection": {"ProjectionType":"ALL"}
      }
    ]' \
  --billing-mode PAY_PER_REQUEST \
  --no-cli-pager \
  && echo "[setup] Table created." \
  || echo "[warn] Table may already exist."

echo "[setup] Waiting for table to become active..."
${AWS} dynamodb wait table-exists --table-name "${TABLE_NAME}"
echo "[setup] Table is active."

# ── Create S3 buckets ─────────────────────────────────────────────

echo "[setup] Creating S3 bucket: ${IMAGE_BUCKET}"
if [[ "${REGION}" == "us-east-1" ]]; then
  ${AWS} s3api create-bucket \
    --bucket "${IMAGE_BUCKET}" \
    && echo "[setup] Bucket created." || echo "[warn] Bucket may already exist."
else
  ${AWS} s3api create-bucket \
    --bucket "${IMAGE_BUCKET}" \
    --create-bucket-configuration LocationConstraint="${REGION}" \
    && echo "[setup] Bucket created." || echo "[warn] Bucket may already exist."
fi

echo "[setup] Blocking public access on ${IMAGE_BUCKET}"
${AWS} s3api put-public-access-block \
  --bucket "${IMAGE_BUCKET}" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo "[setup] Creating S3 bucket: ${STATIC_BUCKET}"
if [[ "${REGION}" == "us-east-1" ]]; then
  ${AWS} s3api create-bucket \
    --bucket "${STATIC_BUCKET}" \
    && echo "[setup] Bucket created." || echo "[warn] Bucket may already exist."
else
  ${AWS} s3api create-bucket \
    --bucket "${STATIC_BUCKET}" \
    --create-bucket-configuration LocationConstraint="${REGION}" \
    && echo "[setup] Bucket created." || echo "[warn] Bucket may already exist."
fi

echo "[setup] Blocking public access on ${STATIC_BUCKET}"
${AWS} s3api put-public-access-block \
  --bucket "${STATIC_BUCKET}" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# ── IAM role (manual — create via AWS Console) ───────────────────
#
# The Lambda execution role must be created manually via the AWS Console
# to avoid storing sensitive IAM policy documents in version control.
#
# Role name: litcrop-poc-lambda
# Trust policy: Lambda service (lambda.amazonaws.com)
# Attach policies:
#   1. AWSLambdaBasicExecutionRole (managed)
#   2. Custom inline policy (see scripts/iam-policy.json):
#      - dynamodb:GetItem, PutItem, UpdateItem, Query on arn:aws:dynamodb:${REGION}:*:table/${TABLE_NAME}
#      - dynamodb:Query on arn:aws:dynamodb:${REGION}:*:table/${TABLE_NAME}/index/*
#      - s3:PutObject, GetObject, DeleteObject on arn:aws:s3:::${IMAGE_BUCKET}/*
#      - s3:GetObject on arn:aws:s3:::${STATIC_BUCKET}/*
#
# Example CLI commands (requires IAM permissions — run manually):
#
# aws iam create-role \
#   --role-name litcrop-poc-lambda \
#   --assume-role-policy-document file://scripts/iam-trust-policy.json \
#   --profile "${PROFILE}"
#
# aws iam put-role-policy \
#   --role-name litcrop-poc-lambda \
#   --policy-name litcrop-poc-lambda-policy \
#   --policy-document file://scripts/iam-policy.json \
#   --profile "${PROFILE}"
#
# aws iam attach-role-policy \
#   --role-name litcrop-poc-lambda \
#   --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole \
#   --profile "${PROFILE}"

echo ""
echo "[setup] ============================================="
echo "[setup] Resource creation complete!"
echo "[setup] ============================================="
echo "[setup] DynamoDB table : ${TABLE_NAME}"
echo "[setup] Image bucket   : s3://${IMAGE_BUCKET}"
echo "[setup] Static bucket  : s3://${STATIC_BUCKET}"
echo ""
echo "[setup] NEXT STEPS:"
echo "  1. Create IAM role 'litcrop-poc-lambda' via AWS Console"
echo "     (see commented instructions in this script)"
echo "  2. Run seed data: npx tsx scripts/seed-data.ts"
echo "  3. Deploy Lambda: npm run build && aws lambda update-function-code ..."
echo "[setup] ============================================="
