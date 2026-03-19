# AWS Infrastructure — LitCrop PoC

> **This is the ops reference** — it describes what's deployed and how to manage it.
> For the design rationale, see [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).
> For deployment history, see [docs/SESSION-REPORT-v0.6.md](../docs/SESSION-REPORT-v0.6.md).

## Infrastructure Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AWS ap-northeast-1 (Tokyo)                       │
│                        Account: <AWS_ACCOUNT_ID>                            │
│                                                                         │
│  ┌──────────────────────────────────────────────┐                       │
│  │          CloudFront (HTTPS CDN)              │    ┌────────────────┐ │
│  │  ID: EXXXXXXXXXXXXX                           │    │  Open-Meteo    │ │
│  │  Domain: <distribution-id>.cloudfront.net       │    │  (weather API) │ │
│  │  OAC: litcrop-poc-oac                        │    │  free, no key  │ │
│  │  Function: litcrop-poc-url-rewrite           │    └───────▲────────┘ │
│  │  (rewrites /path/ → /path/index.html)        │            │          │
│  └──────────────┬───────────────────────────────┘            │          │
│                 │ OAC signed requests                        │          │
│                 ▼                                            │          │
│  ┌──────────────────────┐                                    │          │
│  │  S3: litcrop-poc-    │                                    │          │
│  │      static          │                                    │          │
│  │  (30 files, 171 KB)  │                                    │          │
│  │  Astro SSG build     │                                    │          │
│  │  7 HTML pages +      │                                    │          │
│  │  22 JS + 1 CSS       │                                    │          │
│  └──────────────────────┘                                    │          │
│                                                              │          │
│  ┌──────────────────────────────────────────────┐            │          │
│  │          API Gateway HTTP API (v2)           │            │          │
│  │  ID: aew41rc5ob                              │            │          │
│  │  URL: https://aew41rc5ob.execute-api.        │            │          │
│  │       ap-northeast-1.amazonaws.com           │            │          │
│  │  Route: ANY /{proxy+} → Lambda               │            │          │
│  └──────────────┬───────────────────────────────┘            │          │
│                 │ AWS_PROXY integration                       │          │
│                 ▼                                             │          │
│  ┌──────────────────────────────────────────────┐            │          │
│  │          Lambda: litcrop-poc-api             │            │          │
│  │  Runtime: Node.js 22  │  Memory: 256 MB     │            │          │
│  │  Handler: handler.handler  │  Timeout: 30s  │────────────┘          │
│  │  Bundle: 84 KB (Hono router, 11 endpoints)  │                       │
│  │  Role: litcrop-poc-lambda                    │  ┌────────────────┐  │
│  │                                              │  │  LLM API       │  │
│  │  Env vars:                                   │──│  (AI chat)     │  │
│  │    TABLE_NAME=litcrop-poc                    │  │  stub mode     │  │
│  │    IMAGE_BUCKET=litcrop-poc-images           │  │  (no key set)  │  │
│  │    CLOUDFRONT_ORIGIN=https://d21mr1u1y3...   │  └────────────────┘  │
│  └─────┬──────────────────────┬─────────────────┘                       │
│        │                      │                                         │
│        ▼                      ▼                                         │
│  ┌────────────────┐  ┌────────────────────┐                             │
│  │  DynamoDB:     │  │  S3: litcrop-poc-  │                             │
│  │  litcrop-poc   │  │      images        │                             │
│  │                │  │                    │                             │
│  │  PK/SK + GSI1  │  │  JPEG uploads     │                             │
│  │  + GSI2        │  │  from simulator    │                             │
│  │  On-demand     │  │  Key pattern:      │                             │
│  │  billing       │  │  images/{farmId}/  │                             │
│  │                │  │  {plotId}/{date}/  │                             │
│  │  Seed data:    │  │  {imageId}.jpg    │                             │
│  │  1 farm        │  │                    │                             │
│  │  2 fields      │  │  Private (no      │                             │
│  │  3 beds        │  │  public access)   │                             │
│  │  6 plots       │  │  Presigned URLs   │                             │
│  │  2 images      │  │  for read access  │                             │
│  └────────────────┘  └────────────────────┘                             │
│                                                                         │
│  ┌──────────────────────────────────────────────┐                       │
│  │          IAM Role: litcrop-poc-lambda        │                       │
│  │  Trust: lambda.amazonaws.com                 │                       │
│  │  Policies:                                   │                       │
│  │    - AWSLambdaBasicExecutionRole (managed)   │                       │
│  │    - litcrop-poc-lambda-policy (inline):      │                       │
│  │      · DynamoDB: Get/Put/Update/Query/Delete │                       │
│  │        on table/litcrop-poc*                  │                       │
│  │      · S3: Put/Get/Delete on litcrop-poc-*   │                       │
│  └──────────────────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────┘

External Clients:
┌────────────────────┐     ┌────────────────────┐
│  Mobile Browser    │────▶│  CloudFront        │  (frontend)
│  (375px viewport)  │     │  HTTPS             │
│  Preact islands    │────▶│  API Gateway       │  (API calls)
└────────────────────┘     └────────────────────┘

┌────────────────────┐
│  Camera Simulator  │────▶  API Gateway  ────▶  Lambda  ────▶  S3 + DynamoDB
│  (CLI script)      │     POST /plots/{id}/images
│  src/simulator/    │     (multipart JPEG upload)
└────────────────────┘
```

## Resource Inventory

| Resource | Identifier | Region | Cost Tier |
|----------|-----------|--------|-----------|
| DynamoDB table | `litcrop-poc` | ap-northeast-1 | Free tier (25 RCU/WCU perpetual) |
| S3 bucket (images) | `litcrop-poc-images` | ap-northeast-1 | Free tier (5 GB) |
| S3 bucket (static) | `litcrop-poc-static` | ap-northeast-1 | Free tier (5 GB) |
| Lambda function | `litcrop-poc-api` | ap-northeast-1 | Free tier (1M requests/month) |
| API Gateway | `aew41rc5ob` (HTTP API v2) | ap-northeast-1 | Free tier (1M calls/month) |
| CloudFront | `EXXXXXXXXXXXXX` | Global | Free tier (1 TB/month) |
| CloudFront OAC | `litcrop-poc-oac` | Global | No cost |
| CloudFront Function | `litcrop-poc-url-rewrite` | Global | No cost (< 2M invocations/month) |
| IAM role | `litcrop-poc-lambda` | Global | No cost |

**Estimated monthly cost**: ~$0.68 (all within free tier for PoC usage)

## Live URLs

| Endpoint | URL |
|----------|-----|
| **Frontend** | `https://<distribution-id>.cloudfront.net` |
| **API** | `https://aew41rc5ob.execute-api.ap-northeast-1.amazonaws.com` |
| **Health check** | `https://aew41rc5ob.execute-api.ap-northeast-1.amazonaws.com/api/v1/health` |

## DynamoDB Schema

```
Table: litcrop-poc (PK: String, SK: String)

Entity       PK                     SK                                    GSIs
─────────── ────────────────────── ───────────────────────────────────── ──────────────
Farm         FARM#{farmId}          #META                                 —
Field        FARM#{farmId}          FIELD#{position}#{fieldId}            —
Bed          FIELD#{fieldId}        BED#{position}#{bedId}                —
Plot         BED#{bedId}            PLOT#{plotId}                         GSI1, GSI2
Image        PLOT#{plotId}          IMG#{capturedAt}#{imageId}            GSI1
Tag          IMG#{imageId}          TAG#{createdAt}#{tagId}               —

GSI1: GSI1PK / GSI1SK  → Direct lookup (Plot by ID, Image by ID)
GSI2: GSI2PK / GSI2SK  → All plots for a farm (Farm Overview)
```

## Lambda Environment Variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `TABLE_NAME` | `litcrop-poc` | DynamoDB table name |
| `IMAGE_BUCKET` | `litcrop-poc-images` | S3 bucket for JPEG uploads |
| `CLOUDFRONT_ORIGIN` | `https://<distribution-id>.cloudfront.net` | CORS allowed origin |
| `LLM_API_KEY` | (not set) | Chat uses stub mode without key |
| `LLM_API_PROVIDER` | (not set, defaults to `anthropic`) | Anthropic or OpenAI |

## Scripts Reference

### Provisioning (first-time setup)

| Order | Script | What It Creates | Teardown |
|-------|--------|----------------|----------|
| 1 | `setup-aws.sh` | DynamoDB table + 2 S3 buckets | `setup-aws.sh --teardown` |
| 2 | `setup-iam-role.sh` | Lambda execution role | `setup-iam-role.sh --teardown` |
| 3 | `seed-data.ts` | Farm/Field/Bed/Plot data | Re-run (idempotent) |
| 4 | `setup-lambda.sh` | Lambda function + API Gateway | `setup-lambda.sh --teardown` |
| 5 | `setup-cloudfront.md` | CloudFront + OAC + Function | Manual via Console |

### Deployment (code updates)

| Script | Purpose | Usage |
|--------|---------|-------|
| `deploy-api.sh` | Build + deploy Lambda code | `./scripts/deploy-api.sh` |
| `deploy-frontend.sh` | Build + deploy static frontend | `./scripts/deploy-frontend.sh` |

### Build-Time Environment Variables

When building the frontend, these must be set:

```bash
PUBLIC_API_BASE_URL="https://aew41rc5ob.execute-api.ap-northeast-1.amazonaws.com/api/v1"
PUBLIC_FARM_ID="00000000-0000-0000-0000-000000000001"
```

Example:
```bash
cd src/frontend
PUBLIC_API_BASE_URL="https://aew41rc5ob.execute-api.ap-northeast-1.amazonaws.com/api/v1" \
PUBLIC_FARM_ID="00000000-0000-0000-0000-000000000001" \
npm run build
```

### Reference Files

| File | Purpose |
|------|---------|
| `iam-policy.json` | IAM policy for `litcrop-poc-admin` user |
| `iam-trust-policy.json` | Lambda service trust policy |
| `s3-bucket-policy-static.json` | CloudFront → S3 read access policy |
| `cloudfront-function-url-rewrite.js` | URL rewrite for Astro SSG routes |

## Full Provisioning Sequence (from scratch)

```bash
# 1. Configure AWS CLI
aws configure --profile litcrop
# Region: ap-northeast-1, Output: json

# 2. Create DynamoDB + S3
./scripts/setup-aws.sh

# 3. Create IAM role (may need Console for inline policy)
./scripts/setup-iam-role.sh

# 4. Seed database
AWS_PROFILE=litcrop AWS_REGION=ap-northeast-1 npx tsx scripts/seed-data.ts

# 5. Create Lambda + API Gateway
./scripts/setup-lambda.sh

# 6. Set up CloudFront (follow scripts/setup-cloudfront.md)

# 7. Update Lambda with CloudFront origin
aws lambda update-function-configuration \
  --function-name litcrop-poc-api \
  --environment "Variables={TABLE_NAME=litcrop-poc,IMAGE_BUCKET=litcrop-poc-images,CLOUDFRONT_ORIGIN=https://<cf-domain>}" \
  --profile litcrop --region ap-northeast-1

# 8. Build + deploy frontend
cd src/frontend
PUBLIC_API_BASE_URL="https://<api-id>.execute-api.ap-northeast-1.amazonaws.com/api/v1" \
PUBLIC_FARM_ID="00000000-0000-0000-0000-000000000001" \
npm run build
cd ../..
./scripts/deploy-frontend.sh --skip-build

# 9. Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id <DIST_ID> --paths "/*" --profile litcrop
```

## Full Teardown Sequence

```bash
# 1. Delete Lambda + API Gateway
./scripts/setup-lambda.sh --teardown

# 2. Delete CloudFront (must disable first — see setup-cloudfront.md)
# Manual via Console: disable → wait → delete distribution, function, OAC

# 3. Delete IAM role
./scripts/setup-iam-role.sh --teardown

# 4. Delete DynamoDB + S3
./scripts/setup-aws.sh --teardown
```

## IAM Permissions Summary

The `litcrop-poc-admin` IAM user has these permissions:

| Service | Actions | Scope |
|---------|---------|-------|
| DynamoDB | CreateTable, DescribeTable, CRUD items | `litcrop-poc*` tables |
| S3 | CreateBucket, CRUD objects, bucket policy | `litcrop-poc-*` buckets |
| Lambda | Create/Update/Get/Invoke, AddPermission | `litcrop-poc-*` functions |
| API Gateway | Full CRUD | ap-northeast-1 |
| CloudFront | Create/Get/Update distribution, invalidation | All (but missing OAC/Function perms) |
| IAM | CreateRole, AttachRolePolicy, PassRole, GetRole | `litcrop-poc-*` roles |
| CloudWatch Logs | CreateLogGroup, PutLogEvents | `/aws/lambda/litcrop-poc-*` |

**Known permission gaps** (require Console):
- `cloudfront:CreateOriginAccessControl` — OAC creation
- `cloudfront:CreateFunction` — CloudFront Functions
- `s3:PutBucketPublicAccessBlock` — explicit public access block
- `iam:PutRolePolicy` — intentionally excluded (privilege escalation risk)
