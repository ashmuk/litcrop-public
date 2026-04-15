# ADR-20260317: IAM Least-Privilege Policy for litcrop-poc-admin

## Status
Accepted

## Context
The `litcrop-poc-admin` IAM user (AWS profile `litcrop`) was initially provisioned with wildcard actions (`s3:*`, `dynamodb:*`, `lambda:*`, `cloudfront:*`, `apigateway:*`, `logs:*`) scoped to `litcrop-poc-*` resource ARNs. While resource scoping is good, wildcard actions grant permissions far beyond what the PoC requires -- including destructive operations like `s3:DeleteBucket`, `dynamodb:DeleteTable`, and `lambda:DeleteFunction`.

### Decision Drivers
- **Security**: Follow AWS Well-Architected Framework principle of least privilege
- **Blast radius**: Limit accidental damage from CLI mistakes or credential compromise
- **Auditability**: The user cannot inspect its own IAM policies (`iam:Get*`/`iam:List*` denied), making it hard to verify the current state
- **PoC scope**: Only specific CRUD operations are needed, not full service administration

### Audit Findings (2026-03-17)
Probing the `litcrop` profile revealed:

| Service | Wildcard in Policy | Actually Needed |
|---------|-------------------|-----------------|
| S3 | `s3:*` (~100 actions) | 9 actions (bucket + object CRUD, CORS, lifecycle) |
| DynamoDB | `dynamodb:*` (~40 actions) | 8 actions (table create/describe, item CRUD) |
| Lambda | `lambda:*` (~30 actions) | 8 actions (function CRUD, invoke, URL config) |
| API Gateway | `apigateway:*` | 5 HTTP verbs (scoped to region) |
| CloudFront | `cloudfront:*` (~30 actions) | 5 actions (distribution CRUD, invalidation) |
| CloudWatch Logs | `logs:*` (~20 actions) | 4 actions (log group/stream create, put events, describe) |
| IAM | 4 actions (already tight) | Add self-inspection (4 actions) |

**Missing capabilities identified**:
- No `iam:GetUser`/`iam:ListUserPolicies` -- cannot self-audit
- CloudWatch Logs and IAM statements exist but were not verified as functional

## Options Considered

### Option A: Keep Wildcard Actions (Status Quo)
- **Pros**: No work required; flexible for experimentation during PoC
- **Cons**: Grants ~250 unnecessary permissions; destructive actions available; violates least-privilege; credential compromise has maximum blast radius

### Option B: Tighten to Exact Actions Needed (Recommended)
- **Pros**: Reduces permissions from ~250 to ~43 specific actions; eliminates destructive operations; adds self-inspection; documented and auditable
- **Cons**: May need occasional additions if new operations are required (e.g., S3 replication); slightly more maintenance
- **Mitigation**: Keep the baseline policy in git history for easy rollback

### Option C: Use AWS Managed Policies
- **Pros**: AWS-maintained; auto-updated
- **Cons**: Managed policies like `AmazonS3FullAccess` are even broader than current wildcards; no resource scoping; worse than status quo for least privilege

## Decision
**Option B** -- Replace wildcard actions with explicitly enumerated actions matching PoC requirements.

### Changes Applied

| Statement | Before | After |
|-----------|--------|-------|
| S3Buckets | `s3:*` | 9 specific actions (CreateBucket, PutObject, GetObject, DeleteObject, ListBucket, PutBucketPolicy, GetBucketPolicy, PutLifecycleConfiguration, PutBucketCors) |
| DynamoDB | `dynamodb:*` | 8 actions (CreateTable, DescribeTable, PutItem, GetItem, Query, UpdateItem, DeleteItem, BatchWriteItem) |
| Lambda | `lambda:*` | 8 actions (CreateFunction, UpdateFunctionCode, UpdateFunctionConfiguration, GetFunction, InvokeFunction, AddPermission, CreateFunctionUrlConfig, GetFunctionUrlConfig) |
| APIGateway | `apigateway:*` | 5 HTTP verb actions (POST, GET, PUT, PATCH, DELETE) |
| CloudFront | `cloudfront:*` | 5 actions (CreateDistribution, GetDistribution, UpdateDistribution, CreateInvalidation, ListDistributions) |
| CloudWatchLogs | `logs:*` | 4 actions (CreateLogGroup, CreateLogStream, PutLogEvents, DescribeLogGroups) |
| IAMForLambdaRole | (unchanged) | (unchanged -- already 4 specific actions) |
| **IAMSelfInspect** | (new) | 4 actions on own user ARN (GetUser, ListAttachedUserPolicies, ListUserPolicies, GetUserPolicy) |
| **STSIdentity** | (new) | sts:GetCallerIdentity (already implicitly allowed, now explicit) |

## Consequences

### Positive
- Attack surface reduced by ~85% (from ~250 to ~43 actions)
- Destructive operations eliminated (no DeleteBucket, DeleteTable, DeleteFunction)
- Self-inspection enabled for future audits
- Policy is version-controlled in `scripts/iam-policy.json`

### Negative
- If new AWS operations are needed during PoC (e.g., S3 versioning, DynamoDB Streams), the policy must be updated manually
- Two-step update process: edit `scripts/iam-policy.json`, then apply via AWS Console or CLI

### Post-Provisioning Tightening (Recommended)
After initial resource creation:
1. Scope API Gateway to specific API ID ARN
2. Scope CloudFront to specific distribution ARN
3. Consider removing `iam:CreateRole` (only needed once for Lambda role creation)

## Rollback Plan
Revert to the baseline policy preserved in git commit `28da934` (`scripts/iam-policy.json` before tightening).

## Applied Changelog

### 2026-04-15 — #397 post-provisioning tightening
All three "Post-Provisioning Tightening (Recommended)" items applied to
`scripts/iam-policy.json`:
1. **API Gateway scoping**: `arn:aws:apigateway:ap-northeast-1::/*` →
   `arn:aws:apigateway:ap-northeast-1::/restapis/*` and `/apis/*`. Tighter
   than `/*` without needing specific API IDs (which would couple the
   policy to a specific deployment).

   **Known limitation**: this scope blocks `/domainnames/*`, so the POC
   principal can no longer run `aws apigateway create-domain-name` or
   `update-domain-name`. The custom-domain work tracked in #238 uses the
   CDK deploy principal (prod-least) which still has `/*`, so that path
   is unaffected. If a future ops task needs CLI-driven domain ops from
   the POC user, restore `/domainnames*` temporarily.
2. **CloudFront action tightening**: dropped `CreateDistribution` and
   `UpdateDistribution` from the POC user — CDK owns those paths. Kept
   `GetDistribution`, `CreateInvalidation`, and `ListDistributions` for
   cache busting via `deploy-frontend.sh`. Note: `DescribeFunction` /
   `UpdateFunction` were never in the POC policy; `deploy-frontend.sh`
   gracefully falls through to a manual-step log when those are denied.
3. **iam:CreateRole removed**: `IAMForLambdaRole` now only permits
   `AttachRolePolicy`, `PassRole`, and `GetRole`. Lambda roles exist from
   bootstrap; restore `CreateRole` temporarily if a new Lambda type needs
   a new role.

Regression test added at `src/api/src/__tests__/iam-policy.test.ts` —
asserts no wildcard actions, no destructive S3/DDB/Lambda on POC policy,
no `iam:CreateRole`, and API Gateway scoping invariant. Both POC and
prod-least policies covered.

`iam-policy-prod-least.json` intentionally NOT tightened — it's used by
the CDK deploy principal which legitimately needs DeleteBucket, DeleteTable,
and DeleteFunction during stack replacements.
