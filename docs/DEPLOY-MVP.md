# DEPLOY-MVP.md — LitCrop MVP Deployment Guide

> Created: 2026-03-21
> Scope: MVP (replaces PoC DEPLOY-PLAN.md approach)
> Target: AWS ap-northeast-1 (Tokyo)
> Account: <AWS_ACCOUNT_ID> (litcrop-poc-admin)
> Strategy: AWS CDK (Infrastructure as Code)

---

## What Changed from PoC

The PoC used **manual AWS CLI commands** and shell scripts to create resources one by one. The MVP uses **AWS CDK** — a framework that defines all infrastructure in TypeScript code, then deploys it as a single unit.

| Aspect | PoC (DEPLOY-PLAN.md) | MVP (this guide) |
|--------|---------------------|-------------------|
| Infrastructure | Manual `aws` CLI commands | CDK TypeScript (`infra/lib/litcrop-stack.ts`) |
| Resources | DynamoDB + 2 S3 buckets + Lambda | DynamoDB + 3 S3 buckets + 2 Lambdas + Cognito + CloudFront + API Gateway |
| Auth | None (public API) | Cognito User Pool + API Gateway JWT Authorizer |
| Deploy command | 7+ manual scripts | `npx cdk deploy` (single command) |
| Rollback | Manual `--teardown` scripts | `npx cdk destroy` (reverses everything) |
| Drift detection | None | CDK diff shows changes before deploy |
| Cost | ~$0.68/month | ~$0.73-1.18/month |

---

## What is AWS CDK?

**AWS Cloud Development Kit (CDK)** is an Infrastructure as Code (IaC) framework. Instead of writing CloudFormation YAML or running CLI commands, you define AWS resources in a programming language (TypeScript in our case).

### How CDK Works

```
 You write this:                    CDK generates this:           AWS creates this:
 ────────────────                   ──────────────────            ──────────────────
 TypeScript code                    CloudFormation template       Actual AWS resources
 (infra/lib/litcrop-stack.ts)       (JSON/YAML)                   (DynamoDB, S3, Lambda...)
         │                                  │                              │
         ▼                                  ▼                              ▼
    npx cdk synth              CloudFormation template          Running infrastructure
         │                                  │                              │
         └──────────────────────────────────┘                              │
                    npx cdk deploy ─────────────────────────────────────────┘
```

### Key CDK Concepts

| Concept | What It Is | Example in Our Stack |
|---------|-----------|---------------------|
| **Stack** | A group of AWS resources deployed together | `LitCropStack` — all our MVP resources |
| **Construct** | A building block (L1=raw, L2=opinionated, L3=pattern) | `new dynamodb.Table(...)` is an L2 construct |
| **App** | The entry point that creates stacks | `infra/bin/litcrop.ts` |
| **Synth** | Generate CloudFormation from code (no deploy) | `npx cdk synth` |
| **Deploy** | Apply the generated template to AWS | `npx cdk deploy` |
| **Diff** | Compare current stack vs. what would change | `npx cdk diff` |
| **Destroy** | Remove all resources created by the stack | `npx cdk destroy` |
| **Bootstrap** | One-time setup per account/region | Creates CDK staging bucket + roles |

### Our CDK Stack Creates

```
 LitCropStack (infra/lib/litcrop-stack.ts)
 │
 ├── Cognito User Pool (litcrop-mvp-users)
 │   └── App Client (litcrop-mvp-web) — no secret, SPA-friendly
 │
 ├── DynamoDB Table (litcrop-mvp)
 │   ├── GSI1: entity lookup (Plot, Image by ID)
 │   ├── GSI2: farm → plots queries
 │   └── TTL enabled (conversation auto-cleanup)
 │
 ├── S3 Buckets
 │   ├── litcrop-mvp-images — encrypted, lifecycle (Standard→IA→Glacier)
 │   ├── litcrop-mvp-static — encrypted, serves frontend via CloudFront
 │   └── litcrop-mvp-thumbnails — encrypted, 300x300 center-crop images
 │
 ├── CloudFront Distribution
 │   └── HTTPS only, SPA fallback, serves from static bucket
 │
 ├── Lambda Functions
 │   ├── litcrop-api — Hono REST API (512MB, 30s timeout, ARM64)
 │   └── litcrop-thumb — thumbnail generator (1024MB, 60s, sharp)
 │
 ├── API Gateway v2 (HTTP API)
 │   ├── JWT Authorizer (Cognito)
 │   ├── Public: /health, /api/v1/health, /api/v1
 │   └── Protected: /{proxy+} (everything else)
 │
 └── SSM Parameter
     └── /litcrop/llm-api-key (SecureString — for Anthropic API key)
```

---

## Prerequisites

### Required

| Prerequisite | How to Verify | How to Fix |
|-------------|--------------|-----------|
| AWS CLI v2 | `aws --version` | [Install guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) |
| AWS credentials | `aws sts get-caller-identity` | `aws configure` with access key + secret |
| Node.js 22+ | `node --version` | [nodejs.org](https://nodejs.org) |
| npm dependencies | `ls node_modules` | `npm ci` from repo root |
| Region set | `echo $AWS_DEFAULT_REGION` | `export AWS_DEFAULT_REGION=ap-northeast-1` |

### Optional (for full chat functionality)

| Prerequisite | Purpose | Without It |
|-------------|---------|-----------|
| Anthropic API key | Real AI chat responses | Chat returns stub responses (fully functional otherwise) |
| SSM permissions | Store API key securely | Set `LLM_API_KEY` directly in Lambda env vars (less secure) |

---

## Deployment Steps

### Step 1: CDK Bootstrap (one-time only)

CDK bootstrap creates a staging S3 bucket and IAM roles in your AWS account. This is required once per account/region combination. It's safe and idempotent (running it again does nothing).

```bash
# From repo root
cd infra
npx cdk bootstrap aws://<AWS_ACCOUNT_ID>/ap-northeast-1
```

**What it creates:**
- CloudFormation stack: `CDKToolkit`
- S3 bucket: `cdk-xxxxxxxx-assets-<AWS_ACCOUNT_ID>-ap-northeast-1` (staging)
- IAM roles for CDK deploy operations

**How to verify:**
```bash
aws cloudformation describe-stacks --stack-name CDKToolkit --region ap-northeast-1 \
  --query 'Stacks[0].StackStatus'
# Expected: "CREATE_COMPLETE" or "UPDATE_COMPLETE"
```

### Step 2: (Optional) Set LLM API Key in SSM

If you have an Anthropic API key and want real chat responses:

```bash
# Store the key as a SecureString in SSM Parameter Store
aws ssm put-parameter \
  --name "/litcrop/llm-api-key" \
  --type "SecureString" \
  --value "sk-ant-your-key-here" \
  --region ap-northeast-1

# Verify (shows metadata, not the actual key value)
aws ssm describe-parameters \
  --filters "Key=Name,Values=/litcrop/llm-api-key" \
  --region ap-northeast-1
```

**Note:** Your IAM user needs `ssm:PutParameter` permission. If you get `AccessDeniedException`, add this inline policy to your IAM user:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ssm:PutParameter", "ssm:GetParameter", "ssm:DeleteParameter"],
    "Resource": "arn:aws:ssm:ap-northeast-1:<AWS_ACCOUNT_ID>:parameter/litcrop/*"
  }]
}
```

**Skip this step** if you don't have an API key — chat will work in stub mode.

### Step 3: Preview Changes (CDK Diff)

Before deploying, preview what CDK will create:

```bash
cd infra

# Synthesize CloudFormation template (validates code, no deploy)
npx cdk synth

# Compare current state vs. what would be deployed
npx cdk diff
```

**First deploy:** `cdk diff` will show all resources as `[+]` (additions).
**Subsequent deploys:** Shows only what changed since last deploy.

**Review the diff carefully** — look for any `[-]` (deletions) or `[~]` (modifications) on data stores (DynamoDB, S3) that could cause data loss.

### Step 4: Deploy Infrastructure

```bash
cd infra

# Deploy everything (will prompt for approval on security-related changes)
npx cdk deploy
```

**What happens:**
1. CDK bundles the API Lambda via esbuild (compiles TypeScript → JavaScript)
2. CDK bundles the Thumbnail Lambda with sharp native binaries
3. CDK uploads assets to the staging S3 bucket
4. CloudFormation creates/updates all resources
5. CDK prints output values (URLs, IDs)

**Expected duration:** 3-8 minutes (first deploy is slower due to CloudFront distribution creation, which takes ~5 min).

**Save the outputs** — you'll need them:

```
Outputs:
LitCropStack.ApiUrl = https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com
LitCropStack.CloudFrontUrl = https://dxxxxxxxxxx.cloudfront.net
LitCropStack.UserPoolId = ap-northeast-1_xxxxxxxxx
LitCropStack.UserPoolClientId = xxxxxxxxxxxxxxxxxxxxxxxxxx
LitCropStack.DynamoTableName = litcrop-mvp
LitCropStack.ImagesBucketName = litcrop-mvp-images
LitCropStack.ThumbnailsBucketName = litcrop-mvp-thumbnails
```

### Step 5: Build and Deploy Frontend

CDK creates the S3 bucket and CloudFront, but doesn't upload the frontend files. Do this manually:

```bash
# 1. Create the frontend .env file with CDK outputs
cat > src/frontend/.env << EOF
PUBLIC_API_URL=<ApiUrl from Step 4>
PUBLIC_COGNITO_USER_POOL_ID=<UserPoolId from Step 4>
PUBLIC_COGNITO_CLIENT_ID=<UserPoolClientId from Step 4>
PUBLIC_COGNITO_REGION=ap-northeast-1
EOF

# 2. Build the Astro frontend (SSG — static files)
cd src/frontend
npm run build

# 3. Sync build output to S3
aws s3 sync dist/ s3://litcrop-mvp-static/ \
  --delete \
  --region ap-northeast-1

# 4. Invalidate CloudFront cache (so visitors get the new files)
# Get the distribution ID from the CloudFront URL
DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='LitCrop static frontend — Astro SSG'].Id" \
  --output text --region ap-northeast-1)

aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/*" \
  --region ap-northeast-1
```

### Step 6: Verify Deployment

```bash
# 1. API health check
API_URL="<ApiUrl from Step 4>"
curl -s "$API_URL/health" | python3 -m json.tool
# Expected: {"status": "ok", ...}

curl -s "$API_URL/api/v1/health" | python3 -m json.tool
# Expected: {"status": "ok", ...}

# 2. Frontend loads
CF_URL="<CloudFrontUrl from Step 4>"
curl -s -o /dev/null -w "%{http_code}" "$CF_URL"
# Expected: 200

# 3. Auth works (register a test user)
# Open the CloudFront URL in a browser and try:
#   - Register with email
#   - Check email for verification code
#   - Login
#   - Create a farm

# 4. Chat endpoint works (with or without API key)
# After logging in, navigate to the chat screen and send a message
# With API key: real AI response
# Without API key: stub response with crop tips
```

---

## Post-Deploy Configuration

### Frontend Environment Variables

The frontend needs these values from CDK outputs in its `.env` file:

| Variable | Source |
|----------|--------|
| `PUBLIC_API_URL` | `LitCropStack.ApiUrl` |
| `PUBLIC_COGNITO_USER_POOL_ID` | `LitCropStack.UserPoolId` |
| `PUBLIC_COGNITO_CLIENT_ID` | `LitCropStack.UserPoolClientId` |
| `PUBLIC_COGNITO_REGION` | `ap-northeast-1` (hardcoded) |

### CORS

CORS is configured in both API Gateway and Hono middleware to allow:
- `http://localhost:4321` (local Astro dev server)
- `http://localhost:3000` (alternate local dev)
- `https://<CloudFront domain>` (production)

No manual CORS configuration needed — CDK handles it.

---

## Updating After Code Changes

After making code changes and pushing to `develop`:

```bash
# 1. Re-deploy infrastructure + API Lambda (CDK rebundles automatically)
cd infra
npx cdk diff    # Review changes
npx cdk deploy  # Apply changes

# 2. Re-deploy frontend (if frontend code changed)
cd src/frontend
npm run build
aws s3 sync dist/ s3://litcrop-mvp-static/ --delete --region ap-northeast-1
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*"
```

**CDK is smart about updates:** It only changes resources that differ from the last deploy. Unchanged resources are left alone.

---

## Rollback

### Full Teardown (removes ALL resources and data)

```bash
cd infra
npx cdk destroy
```

**Warning:** This deletes:
- DynamoDB table (all user data)
- S3 buckets (all images)
- Cognito User Pool (all user accounts)
- Lambda functions, API Gateway, CloudFront

The stack has `removalPolicy: DESTROY` on all resources (MVP setting). In production, this would be changed to `RETAIN` for data stores.

### Partial Rollback (revert a specific change)

```bash
# Revert code to previous state
git revert <commit-hash>

# Re-deploy (CDK reverts AWS resources to match the code)
cd infra
npx cdk deploy
```

---

## Troubleshooting

### CDK Bootstrap Fails

```
Error: This stack uses assets, so the toolkit stack must be deployed
```
**Fix:** Run `npx cdk bootstrap aws://<AWS_ACCOUNT_ID>/ap-northeast-1`

### SSM Parameter Not Found

```
Error: SSM parameter /litcrop/llm-api-key not found
```
**Fix:** Either create the parameter (Step 2) or remove the SSM reference from the CDK stack. Chat works in stub mode without it.

**Quick workaround** (if you want to deploy without SSM):
The CDK stack references the SSM parameter at synth time. If the parameter doesn't exist, synth will fail. To skip it temporarily, you can set a dummy value:
```bash
aws ssm put-parameter --name "/litcrop/llm-api-key" --type "SecureString" --value "not-set" --region ap-northeast-1
```

### CloudFront Takes Too Long

CloudFront distribution creation takes 5-15 minutes on first deploy. This is normal — AWS provisions edge locations globally. Subsequent deploys that don't change CloudFront settings are faster.

### Lambda Bundling Fails (sharp)

The thumbnail Lambda uses `sharp` (native image processing). If bundling fails:
```bash
# Ensure you're on a compatible platform (Linux ARM64 or Docker available)
cd infra
npx cdk deploy --context sharp-platform=linux-arm64
```

CDK uses Docker to build native modules for Lambda's Linux ARM64 runtime. Make sure Docker is running.

### CORS Errors in Browser

If you see CORS errors after deploy:
1. Check that `PUBLIC_API_URL` in frontend `.env` matches the actual API Gateway URL
2. Verify CloudFront domain is in the CORS allowed origins (CDK sets this automatically)
3. Clear browser cache and retry

### 401 Unauthorized on API Calls

1. **Token expired:** Cognito access tokens expire after 1 hour. The frontend refreshes automatically.
2. **Wrong User Pool:** Verify `PUBLIC_COGNITO_USER_POOL_ID` and `PUBLIC_COGNITO_CLIENT_ID` match the CDK outputs.
3. **API Gateway authorizer:** Check CloudWatch logs for the API Lambda.

---

## Cost Estimate

| Resource | Monthly Cost | Notes |
|----------|-------------|-------|
| DynamoDB | $0.00 | On-demand, free tier (25 RCU/WCU perpetual) |
| S3 (3 buckets) | $0.01-0.05 | Minimal storage for MVP |
| Lambda (2 functions) | $0.00 | Free tier (1M requests/month) |
| API Gateway v2 | $0.00-0.10 | Free tier (1M requests/month) |
| CloudFront | $0.00-0.50 | Free tier (1TB transfer/month) |
| Cognito | $0.00 | Free tier (50K MAU) |
| CloudWatch Logs | $0.00-0.50 | 1-month retention |
| **Total** | **~$0.01-1.18** | Well under $5/month target |

---

## File Reference

| File | Purpose |
|------|---------|
| `infra/bin/litcrop.ts` | CDK app entry point — creates the stack |
| `infra/lib/litcrop-stack.ts` | Stack definition — all AWS resources (466 lines) |
| `infra/package.json` | CDK dependencies (`aws-cdk-lib`, `cdk-nag`, etc.) |
| `infra/cdk.json` | CDK configuration (context, feature flags) |
| `src/api/src/handler.ts` | Lambda entry point — exports Hono handler |
| `src/thumbnail/handler.ts` | Thumbnail Lambda — S3 event trigger |
| `src/frontend/astro.config.mjs` | Astro build config (SSG output) |
| `scripts/deploy-frontend.sh` | Manual frontend deploy script (legacy) |
| `scripts/deploy-api.sh` | Manual API deploy script (legacy — CDK replaces this) |

---

## Next: CI/CD Automation

After validating a successful manual deploy, the next step is to automate via GitHub Actions:

1. **PR checks** (`pr-checks.yml`): build + test + type-check + `cdk synth` on every PR
2. **Deploy** (`deploy.yml`): `cdk deploy` + S3 sync on push to `main`
3. **GitHub Environment**: `production` with required approval before deploy

This is documented separately in a future CI/CD setup guide.

---

> **Generated by Claude Opus 4.6** | MVP Deploy Guide | 2026-03-21
