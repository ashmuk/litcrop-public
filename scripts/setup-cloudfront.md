# CloudFront Setup Guide (Manual via AWS Console)

> CloudFront operations (CreateOriginAccessControl, CreateFunction) require permissions
> not included in the litcrop-poc-admin IAM policy. These steps are performed via the
> AWS Console using your account's admin credentials.

## Resources Created

| Resource | Identifier | Purpose |
|----------|-----------|---------|
| OAC | `litcrop-poc-oac` | Authenticates CloudFront → S3 requests |
| Distribution | `EXXXXXXXXXXXXX` | HTTPS CDN for static frontend |
| CloudFront Function | `litcrop-poc-url-rewrite` | Rewrites `/path/` → `/path/index.html` |
| S3 Bucket Policy | On `litcrop-poc-static` | Allows CloudFront to read S3 objects |

## Step 1: Create Origin Access Control (OAC)

1. **CloudFront → Origin access → Create control setting**
2. Settings:
   - Name: `litcrop-poc-oac`
   - Description: OAC for litcrop-poc-static S3 bucket
   - Origin type: **S3**
   - Signing behavior: **Sign requests (recommended)**
3. Click **Create**

## Step 2: Create CloudFront Distribution

Via CLI (this part works with litcrop-poc-admin permissions):

```bash
aws cloudfront create-distribution \
  --distribution-config '{
    "CallerReference": "litcrop-poc-'$(date +%s)'",
    "Comment": "LitCrop PoC frontend",
    "Enabled": true,
    "DefaultRootObject": "index.html",
    "Origins": {
      "Quantity": 1,
      "Items": [{
        "Id": "litcrop-poc-static-origin",
        "DomainName": "litcrop-poc-static.s3.ap-northeast-1.amazonaws.com",
        "S3OriginConfig": {
          "OriginAccessIdentity": ""
        }
      }]
    },
    "DefaultCacheBehavior": {
      "TargetOriginId": "litcrop-poc-static-origin",
      "ViewerProtocolPolicy": "redirect-to-https",
      "AllowedMethods": {
        "Quantity": 2,
        "Items": ["HEAD", "GET"],
        "CachedMethods": {"Quantity": 2, "Items": ["HEAD", "GET"]}
      },
      "ForwardedValues": {
        "QueryString": true,
        "Cookies": {"Forward": "none"}
      },
      "MinTTL": 0,
      "DefaultTTL": 86400,
      "MaxTTL": 31536000,
      "Compress": true
    },
    "CustomErrorResponses": {
      "Quantity": 1,
      "Items": [{
        "ErrorCode": 403,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 10
      }]
    },
    "PriceClass": "PriceClass_200",
    "ViewerCertificate": {
      "CloudFrontDefaultCertificate": true
    }
  }' \
  --profile litcrop
```

Note the Distribution ID and Domain Name from the output.

## Step 3: Associate OAC with Distribution

1. **CloudFront → Distributions → [your distribution] → Origins tab**
2. Select `litcrop-poc-static-origin` → **Edit**
3. Under "Origin access":
   - Select **Origin access control settings**
   - Choose `litcrop-poc-oac`
4. Click **Save changes**
5. CloudFront shows **"Copy policy"** prompt → Click it

## Step 4: Apply S3 Bucket Policy

1. Go to **S3 → litcrop-poc-static → Permissions → Bucket policy**
2. Paste the policy from Step 3 (or use `scripts/s3-bucket-policy-static.json`):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontServicePrincipal",
    "Effect": "Allow",
    "Principal": {"Service": "cloudfront.amazonaws.com"},
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::litcrop-poc-static/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::<AWS_ACCOUNT_ID>:distribution/<DISTRIBUTION_ID>"
      }
    }
  }]
}
```

Replace `<DISTRIBUTION_ID>` with your actual distribution ID.

## Step 5: Create CloudFront Function (URL Rewrite)

1. **CloudFront → Functions → Create function**
   - Name: `litcrop-poc-url-rewrite`
   - Runtime: `cloudfront-js-2.0`
2. Paste the code from `scripts/cloudfront-function-url-rewrite.js`:

```javascript
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri += 'index.html';
  } else if (!uri.includes('.')) {
    request.uri += '/index.html';
  }
  return request;
}
```

3. Click **Save changes**
4. Go to **Publish** tab → Click **Publish function**

## Step 6: Associate Function with Distribution

1. **CloudFront → Distributions → [your distribution] → Behaviors → Default → Edit**
2. Under **Function associations → Viewer request**:
   - Function type: **CloudFront Functions**
   - Function: `litcrop-poc-url-rewrite`
3. Click **Save changes**

## Step 7: Update Lambda CORS

After CloudFront is deployed, add the origin to Lambda environment:

```bash
CF_DOMAIN="<your-cloudfront-domain>.cloudfront.net"

aws lambda update-function-configuration \
  --function-name litcrop-poc-api \
  --environment "Variables={TABLE_NAME=litcrop-poc,IMAGE_BUCKET=litcrop-poc-images,CLOUDFRONT_ORIGIN=https://${CF_DOMAIN}}" \
  --profile litcrop \
  --region ap-northeast-1
```

## Step 8: Rebuild Frontend with API URL

```bash
cd src/frontend
PUBLIC_API_BASE_URL="https://<api-gw-id>.execute-api.ap-northeast-1.amazonaws.com/api/v1" \
PUBLIC_FARM_ID="00000000-0000-0000-0000-000000000001" \
npm run build

aws s3 sync dist/ s3://litcrop-poc-static/ --delete --profile litcrop
aws cloudfront create-invalidation --distribution-id <DISTRIBUTION_ID> --paths "/*" --profile litcrop
```

## Current Deployment Values

| Resource | Value |
|----------|-------|
| Distribution ID | `EXXXXXXXXXXXXX` |
| CloudFront Domain | `<distribution-id>.cloudfront.net` |
| API Gateway ID | `aew41rc5ob` |
| API Endpoint | `https://aew41rc5ob.execute-api.ap-northeast-1.amazonaws.com` |
| Farm ID (seed) | `00000000-0000-0000-0000-000000000001` |
| Account ID | `<AWS_ACCOUNT_ID>` |
| Region | `ap-northeast-1` |

## Teardown

CloudFront resources must be deleted manually:

```bash
# 1. Disable distribution
# Go to Console → CloudFront → Distributions → EXXXXXXXXXXXXX → Disable
# Wait for status to change to "Deployed"

# 2. Delete distribution
# Console → CloudFront → Distributions → EXXXXXXXXXXXXX → Delete

# 3. Delete function
# Console → CloudFront → Functions → litcrop-poc-url-rewrite → Delete

# 4. Delete OAC
# Console → CloudFront → Origin access → litcrop-poc-oac → Delete
```
