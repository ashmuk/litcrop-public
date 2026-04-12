# Operational Runbooks — LitCrop

> Created: 2026-04-12 | Audit finding: F-09 (#371)
> Region: ap-northeast-1 | Resources: litcrop-mvp-* (staging), litcrop-prod-* (production, TBD)

---

## 1. Lambda Error Alarm

**Trigger:** SNS alert `litcrop-api-lambda-errors` — at least 1 error in 5 minutes.

### Investigate

```bash
# Recent errors in Lambda logs (last 30 minutes)
aws logs filter-log-events \
  --log-group-name "/aws/lambda/litcrop-api" \
  --start-time $(date -d '30 minutes ago' +%s000) \
  --filter-pattern '"level\":\"error"' \
  --region ap-northeast-1

# Or via CloudWatch Logs Insights
aws logs start-query \
  --log-group-name "/aws/lambda/litcrop-api" \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'filter @message like /error/ | sort @timestamp desc | limit 20'
```

### Common Causes

| Pattern | Likely Cause | Fix |
|---------|-------------|-----|
| `DynamoDB timeout` | Table throttling or region issue | Check DynamoDB throttle alarm |
| `LLM error` with `status: 429` | Anthropic rate limit | Wait; daily budget resets at midnight UTC |
| `SES send failed` | SES sandbox / email not verified | Verify recipient in SES console |
| `Cannot find module` | Bad deploy (esbuild bundle) | Rollback Lambda (see Runbook 5) |

### Escalation
If errors persist >15 minutes and affect user-facing features, execute Runbook 5 (rollback).

---

## 2. API Gateway 5xx Alarm

**Trigger:** SNS alert `litcrop-api-5xx` — more than 5 errors in 5 minutes.

### Investigate

```bash
# API Gateway access logs (structured JSON)
aws logs start-query \
  --log-group-name "/litcrop/api-gateway-access" \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'filter status >= 500 | sort requestTime desc | limit 20'
```

### Common Causes

| Pattern | Likely Cause | Fix |
|---------|-------------|-----|
| All routes 502 | Lambda crash / timeout | Check Lambda error logs (Runbook 1) |
| Single route 500 | Application bug in that handler | Check Lambda logs filtered by routeKey |
| Intermittent 503 | Lambda cold start + timeout | Increase Lambda timeout or memory |

---

## 3. DynamoDB Throttle Alarm

**Trigger:** SNS alert `litcrop-dynamo-throttle` — any throttled request detected.

### Investigate

```bash
# Check consumed capacity
aws dynamodb describe-table --table-name litcrop-mvp \
  --query 'Table.{Status:TableStatus,ItemCount:ItemCount,Size:TableSizeBytes}' \
  --region ap-northeast-1

# Check if getStats() scan is the cause (admin dashboard load)
aws logs filter-log-events \
  --log-group-name "/aws/lambda/litcrop-api" \
  --start-time $(date -d '10 minutes ago' +%s000) \
  --filter-pattern '"getStats"' \
  --region ap-northeast-1
```

### Response
DynamoDB PAY_PER_REQUEST auto-scales, but sudden spikes can cause brief throttling. If persistent:
- Check if getStats() cache is working (should cache for 5 minutes)
- Check for scan-heavy operations in admin routes
- Consider adding DynamoDB auto-scaling alarms for read/write capacity

---

## 4. Chat AI Budget Exceeded

**Trigger:** User receives 429 response from `POST /api/v1/chat` with `Daily token budget exceeded`.

### Check Current Usage

```bash
# Query the budget DynamoDB item
aws dynamodb get-item \
  --table-name litcrop-mvp \
  --key '{"PK":{"S":"USAGE#GLOBAL"},"SK":{"S":"DAY#'$(date -u +%Y-%m-%d)'"}}' \
  --region ap-northeast-1

# Per-user usage (replace USER_ID)
aws dynamodb get-item \
  --table-name litcrop-mvp \
  --key '{"PK":{"S":"USAGE#USER_ID"},"SK":{"S":"DAY#'$(date -u +%Y-%m-%d)'"}}' \
  --region ap-northeast-1
```

### Limits

| Scope | Input Tokens | Output Tokens | Reset |
|-------|-------------|---------------|-------|
| Per user/day | 50,000 | 10,000 | Midnight UTC |
| Global/day | 500,000 | 100,000 | Midnight UTC |

### Response
- **Normal:** Budget resets at midnight UTC. No action needed.
- **If limits too low:** Update `CHAT_DAILY_*` env vars in CDK stack and redeploy.
- **If abuse suspected:** Check per-user usage records to identify heavy consumers.

---

## 5. Deployment Rollback (Lambda Alias)

**When:** Bad deploy breaks API functionality. Smoke test fails or users report errors.

### Instant Rollback (30 seconds)

```bash
# List recent Lambda versions
aws lambda list-versions-by-function \
  --function-name litcrop-api \
  --region ap-northeast-1 \
  --query 'Versions[-5:].{Version:Version,Description:Description,Modified:LastModified}' \
  --output table

# Get current alias target
aws lambda get-alias \
  --function-name litcrop-api \
  --name live \
  --region ap-northeast-1

# Repoint alias to previous version (replace N with version number)
aws lambda update-alias \
  --function-name litcrop-api \
  --name live \
  --function-version N \
  --region ap-northeast-1
```

### Verify Rollback

```bash
curl -s https://YOUR_API_URL/health | jq .
```

### After Rollback
1. Investigate the failing version's Lambda logs
2. Fix the issue on develop branch
3. Deploy again through normal PR flow

---

## 6. CloudFront Cache Invalidation

**When:** Frontend deploy shows stale content, or security patch requires immediate propagation.

```bash
# Invalidate everything (costs $0.005 per path after first 1000/month)
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*" \
  --region us-east-1

# Check invalidation status
aws cloudfront list-invalidations \
  --distribution-id YOUR_DIST_ID \
  --query 'InvalidationList.Items[0].{Id:Id,Status:Status}' \
  --region us-east-1
```

Invalidation typically completes in 1-5 minutes globally.

---

## 7. S3 Image Upload Failure

**Symptoms:** User uploads image but it doesn't appear, or thumbnail is missing.

### Investigate

```bash
# Check if image landed in S3
aws s3 ls s3://litcrop-mvp-images/images/FARM_ID/BED_ID/ \
  --region ap-northeast-1

# Check thumbnail Lambda logs
aws logs filter-log-events \
  --log-group-name "/aws/lambda/litcrop-thumb" \
  --start-time $(date -d '1 hour ago' +%s000) \
  --filter-pattern 'ERROR' \
  --region ap-northeast-1

# Check if thumbnail was generated
aws s3 ls s3://litcrop-mvp-thumbnails/thumbnails/FARM_ID/BED_ID/ \
  --region ap-northeast-1
```

### Common Causes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Image in S3 but no thumbnail | Thumbnail Lambda failed | Check thumb Lambda logs |
| No image in S3 | Upload failed (413 or timeout) | Check API Lambda logs |
| Thumbnail exists but not shown | Signed URL expired (15min) | Refresh the page |

---

## 8. Cognito User Issues

### User Can't Log In

```bash
# Check user status
aws cognito-idp admin-get-user \
  --user-pool-id YOUR_POOL_ID \
  --username USER_EMAIL \
  --region ap-northeast-1
```

| Status | Meaning | Action |
|--------|---------|--------|
| CONFIRMED | Account active | Check password / client-side |
| UNCONFIRMED | Email not verified | Resend confirmation |
| FORCE_CHANGE_PASSWORD | Admin-created | User must set password |

### Reset User Password (admin)

```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id YOUR_POOL_ID \
  --username USER_EMAIL \
  --password "TempPass123" \
  --permanent \
  --region ap-northeast-1
```

---

## Resource Quick Reference

| Resource | Name | Console Link |
|----------|------|-------------|
| Lambda (API) | `litcrop-api` | CloudWatch > Log groups > `/aws/lambda/litcrop-api` |
| Lambda (Thumb) | `litcrop-thumb` | CloudWatch > Log groups > `/aws/lambda/litcrop-thumb` |
| API Gateway | `litcrop-mvp-api` | API Gateway > APIs |
| API GW Logs | `/litcrop/api-gateway-access` | CloudWatch > Log groups |
| DynamoDB | `litcrop-mvp` | DynamoDB > Tables |
| S3 Images | `litcrop-mvp-images` | S3 > Buckets |
| S3 Logs | `litcrop-mvp-logs` | S3 > Buckets |
| CloudFront | (auto-generated) | CloudFront > Distributions |
| Alarms | `litcrop-api-*`, `litcrop-dynamo-*` | CloudWatch > Alarms |
| SNS | `litcrop-alarms` | SNS > Topics |
| Budget | `litcrop-monthly-cost` | AWS Budgets |
