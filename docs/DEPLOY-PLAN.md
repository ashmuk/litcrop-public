# DEPLOY-PLAN.md — LitCrop PoC

> Generated: 2026-03-18
> Scope Level: PoC
> Target: AWS ap-northeast-1 (Tokyo)
> Account: <AWS_ACCOUNT_ID> (litcrop-poc-admin)

---

## Pre-flight Checklist

- [x] AWS CLI v2 installed (v2.34.11)
- [x] Profile `litcrop` configured and authenticated
- [x] IAM user: `litcrop-poc-admin`
- [x] Region: `ap-northeast-1`
- [ ] IAM Lambda execution role exists (`litcrop-poc-lambda`)
- [ ] LLM API key available (optional — chat works in stub mode without it)

---

## Deployment Steps

### Step 1: Provision Infrastructure (`setup-aws.sh`)

**Creates**: DynamoDB table + 2 S3 buckets
**Command**: `./scripts/setup-aws.sh`
**Rollback**: `./scripts/setup-aws.sh --teardown`

| Resource | Name | Cost |
|----------|------|------|
| DynamoDB table | `litcrop-poc` (PK/SK + GSI1 + GSI2, on-demand) | Free tier (25 RCU/WCU perpetual) |
| S3 bucket | `litcrop-poc-images` (block public access) | Free tier (5GB) |
| S3 bucket | `litcrop-poc-static` (block public access) | Free tier (5GB) |

### Step 2: Create IAM Lambda Role

**Creates**: IAM role for Lambda execution
**Commands** (requires IAM permissions):
```bash
# Create trust policy file
cat > /tmp/trust-policy.json << 'TRUST'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
TRUST

# Create role
aws iam create-role \
  --role-name litcrop-poc-lambda \
  --assume-role-policy-document file:///tmp/trust-policy.json \
  --profile litcrop

# Attach basic Lambda execution (CloudWatch logs)
aws iam attach-role-policy \
  --role-name litcrop-poc-lambda \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole \
  --profile litcrop

# Attach inline policy for DynamoDB + S3 access
aws iam put-role-policy \
  --role-name litcrop-poc-lambda \
  --policy-name litcrop-poc-lambda-policy \
  --policy-document file://scripts/iam-policy.json \
  --profile litcrop
```
**Rollback**: `aws iam delete-role --role-name litcrop-poc-lambda --profile litcrop` (must detach policies first)

### Step 3: Seed DynamoDB

**Populates**: 1 farm, 2 fields, 3 beds, 6 plots
**Command**: `npx tsx scripts/seed-data.ts`
**Rollback**: Re-run (idempotent — overwrites existing data)

### Step 4: Create Lambda Function

**Creates**: Lambda function running the Hono API
**Commands**:
```bash
# Build API
cd src/api && npm run build && cd ../..

# Package
cd src/api/dist && zip -r api.zip . && cd ../../..

# Create function
aws lambda create-function \
  --function-name litcrop-poc-api \
  --runtime nodejs20.x \
  --handler handler.handler \
  --role arn:aws:iam::<AWS_ACCOUNT_ID>:role/litcrop-poc-lambda \
  --zip-file fileb://src/api/dist/api.zip \
  --memory-size 256 \
  --timeout 30 \
  --environment "Variables={TABLE_NAME=litcrop-poc,IMAGE_BUCKET=litcrop-poc-images,AWS_REGION_OVERRIDE=ap-northeast-1}" \
  --profile litcrop \
  --region ap-northeast-1
```
**Rollback**: `aws lambda delete-function --function-name litcrop-poc-api --profile litcrop --region ap-northeast-1`

### Step 5: Create API Gateway (HTTP API v2)

**Creates**: HTTP API routing all requests to Lambda
**Commands**:
```bash
# Create HTTP API with Lambda integration
aws apigatewayv2 create-api \
  --name litcrop-poc-api \
  --protocol-type HTTP \
  --profile litcrop \
  --region ap-northeast-1

# (Capture API_ID from output, then create integration + routes)
# Integration: Lambda proxy
# Route: ANY /{proxy+} → Lambda
# Stage: $default (auto-deploy)
```
**Rollback**: `aws apigatewayv2 delete-api --api-id <API_ID> --profile litcrop --region ap-northeast-1`

### Step 6: Deploy Frontend to S3

**Deploys**: Astro SSG build to S3 static bucket
**Command**: `./scripts/deploy-frontend.sh`
**Rollback**: `aws s3 rm s3://litcrop-poc-static --recursive --profile litcrop`

### Step 7: Create CloudFront Distribution (optional for PoC)

**Creates**: HTTPS CDN for the static frontend
**Note**: For PoC, the S3 bucket + API Gateway URLs are sufficient. CloudFront adds HTTPS and caching but takes 10-15 min to deploy.
**Rollback**: `aws cloudfront delete-distribution --id <DIST_ID> --profile litcrop` (must disable first)

---

## Blast Radius

| Resource | Reversible? | Cost Risk |
|----------|-------------|-----------|
| DynamoDB table | Yes (teardown script) | Free tier |
| S3 buckets (2) | Yes (teardown script) | Free tier |
| IAM role | Yes (delete) | No cost |
| Lambda function | Yes (delete) | Free tier (1M requests/month) |
| API Gateway | Yes (delete) | Free tier (1M calls/month) |
| CloudFront | Yes (disable + delete) | Free tier (1TB/month) |

**Total estimated monthly cost**: ~$0.68 (well under $5 PoC budget)
**All resources are deletable** via `./scripts/setup-aws.sh --teardown` + manual Lambda/APIGW/CloudFront cleanup.

---

## Health Checks (Post-Deploy)

1. `GET <API_URL>/api/v1/health` → 200 OK
2. `GET <API_URL>/api/v1/farms/<farmId>` → farm metadata (after seed)
3. Frontend loads at S3/CloudFront URL
4. Simulator upload: `npx tsx src/simulator/src/index.ts --once --plot <plotId> --api-url <API_URL>`
