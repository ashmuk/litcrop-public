#!/usr/bin/env bash
# scripts/setup-iam-role.sh
# Creates the Lambda execution IAM role with DynamoDB + S3 access.
#
# NOTE: This script requires iam:CreateRole and iam:AttachRolePolicy permissions.
# The litcrop-poc-admin user may not have iam:PutRolePolicy (intentionally excluded
# per ADR-007 to prevent privilege escalation). If so, create the role via AWS Console.
#
# Usage:
#   ./scripts/setup-iam-role.sh             # Create role
#   ./scripts/setup-iam-role.sh --teardown  # Delete role

set -euo pipefail

PROFILE="litcrop"
ROLE_NAME="litcrop-poc-lambda"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AWS="aws --profile ${PROFILE}"

# ── Parse args ───────────────────────────────────────────────────

TEARDOWN=false
for arg in "$@"; do
  [[ "$arg" == "--teardown" ]] && TEARDOWN=true
done

# ── Teardown ─────────────────────────────────────────────────────

if [[ "$TEARDOWN" == "true" ]]; then
  echo "[teardown] Detaching managed policies..."
  ${AWS} iam detach-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole \
    2>/dev/null || echo "[warn] Policy not attached."

  echo "[teardown] Deleting inline policy..."
  ${AWS} iam delete-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-name litcrop-poc-lambda-policy \
    2>/dev/null || echo "[warn] Inline policy not found."

  echo "[teardown] Deleting role: ${ROLE_NAME}"
  ${AWS} iam delete-role --role-name "${ROLE_NAME}" \
    2>/dev/null || echo "[warn] Role not found or already deleted."

  echo "[teardown] Done."
  exit 0
fi

# ── Create Role ──────────────────────────────────────────────────

echo "[setup] Creating IAM role: ${ROLE_NAME}"
${AWS} iam create-role \
  --role-name "${ROLE_NAME}" \
  --assume-role-policy-document "file://${SCRIPT_DIR}/iam-trust-policy.json" \
  --no-cli-pager \
  && echo "[setup] Role created." \
  || echo "[warn] Role may already exist."

# ── Attach Managed Policy (CloudWatch Logs) ──────────────────────

echo "[setup] Attaching AWSLambdaBasicExecutionRole..."
${AWS} iam attach-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole \
  && echo "[setup] Managed policy attached." \
  || echo "[warn] Policy may already be attached."

# ── Attach Inline Policy (DynamoDB + S3) ─────────────────────────
# NOTE: Requires iam:PutRolePolicy — may fail if not in user's permissions.
# If it fails, attach the policy manually via AWS Console using iam-policy.json.

echo "[setup] Attaching inline policy (DynamoDB + S3 access)..."
${AWS} iam put-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-name litcrop-poc-lambda-policy \
  --policy-document "file://${SCRIPT_DIR}/iam-policy.json" \
  && echo "[setup] Inline policy attached." \
  || echo "[WARN] iam:PutRolePolicy denied — attach the policy manually via AWS Console."

echo ""
echo "[setup] ============================================="
echo "[setup] IAM role setup complete: ${ROLE_NAME}"
echo "[setup] ============================================="
echo "[setup] If the inline policy attachment failed, go to:"
echo "  AWS Console → IAM → Roles → ${ROLE_NAME} → Add permissions → Create inline policy"
echo "  Paste the contents of scripts/iam-policy.json"
echo "[setup] ============================================="
