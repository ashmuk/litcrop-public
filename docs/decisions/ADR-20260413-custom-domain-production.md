# ADR-023: Custom Domain for Production Site (#238)

## Status
Accepted (2026-04-13)

## Context

LitCrop production is accessible via a CloudFront-generated domain (`<distribution-id-prod>.cloudfront.net`). This is functional but:

1. **Not user-friendly** — the random CloudFront domain is hard to remember and looks unprofessional
2. **Blocks install.sh** — the device setup guide (#240) needs a stable URL for `curl | bash`
3. **No branding** — the URL doesn't identify the application

### Decision Drivers
- **Low profile**: The domain should not attract attention. No SEO, no public marketing.
- **Auth-gated**: All app content requires Cognito login. Only the login page is publicly visible.
- **Budget**: Must stay within $5/mo ceiling. Domain adds ~$1.50/mo.
- **Production only**: Staging keeps its CloudFront URL (no custom domain needed).
- **Privacy**: WHOIS data must be hidden.

### Current State
- Production: `https://<distribution-id-prod>.cloudfront.net` (CloudFront)
- Production API: `https://8um4tksmcl.execute-api.ap-northeast-1.amazonaws.com/api/v1`
- Staging: `https://dpj8a3mk3tzkq.cloudfront.net` (unchanged)

## Decision

### Domain Structure

| Component | URL | Service |
|-----------|-----|---------|
| Frontend (production) | `https://<domain>.com` | CloudFront → S3 |
| API (production) | `https://8um4tksmcl.execute-api.ap-northeast-1.amazonaws.com/api/v1` | API Gateway (keep default) |
| Staging (no change) | `https://dpj8a3mk3tzkq.cloudfront.net` | CloudFront → S3 |

API keeps the default API Gateway domain — custom API domain is deferred (adds complexity for minimal user-facing benefit; the API URL is only used in code, not typed by users).

### Architecture

```
  User → https://<domain>.com
    → Route 53 (ALIAS record)
    → CloudFront (alternate domain + ACM cert)
    → S3 litcrop-prod-static
```

### AWS Resources Required

| Resource | Region | Details |
|----------|--------|---------|
| Route 53 Hosted Zone | Global | DNS for custom domain |
| ACM Certificate | **us-east-1** | Required by CloudFront. DNS-validated via Route 53. |
| CloudFront Alternate Domain | ap-northeast-1 | Add `domainNames` to existing distribution |
| Route 53 A Record (ALIAS) | Global | Apex domain → CloudFront |
| Route 53 AAAA Record (ALIAS) | Global | IPv6 apex → CloudFront |

### Privacy & Discoverability Controls

1. **WHOIS privacy**: Route 53 enables automatically for .com/.net/.org
2. **Search engine blocking**: Add `X-Robots-Tag: noindex, nofollow` to CloudFront response headers
3. **No staging domain**: Staging stays on CloudFront URL — one fewer discoverable endpoint
4. **Auth-gated**: Cognito login required for all app content

### CDK Changes (production only)

The custom domain applies **only when `envName === 'prod'`**. Staging stack is unaffected.

1. **New CDK construct**: ACM certificate in us-east-1 (cross-region)
   - Uses `DnsValidatedCertificate` or `Certificate` with Route 53 validation
   - Condition: `envName === 'prod'` only

2. **CloudFront distribution update**: Add `domainNames: [domainName]` and `certificate`
   - Condition: only when domain + cert are provided

3. **Route 53 records**: A + AAAA alias to CloudFront distribution
   - Condition: `envName === 'prod'` only

4. **Response headers update**: Add `X-Robots-Tag: noindex, nofollow` to `litcrop-prod-security-headers`
   - Condition: `envName === 'prod'` only (staging can be indexed if desired)

5. **CORS update**: Add `https://<domain>.com` to API Gateway CORS allowOrigins
   - Condition: `envName === 'prod'` only

6. **CSP update**: Add `https://<domain>.com` to CloudFront CSP `connect-src`

### Implementation Approach

The domain name is passed via CDK context: `-c domain=<domain>.com`

```typescript
// bin/litcrop.ts
const domainName = app.node.tryGetContext('domain'); // undefined for staging

// lib/litcrop-stack.ts — only for prod when domain is provided
if (envName === 'prod' && domainName) {
  // Create ACM cert, update CloudFront, create Route 53 records
}
```

This means:
- `cdk deploy LitCropStack -c env=stg` → no domain changes (staging)
- `cdk deploy LitCropProd -c env=prod` → no domain changes (prod without domain)
- `cdk deploy LitCropProd -c env=prod -c domain=litcrop.com` → adds custom domain

## Cost Impact

| Item | Monthly | Annual |
|------|---------|--------|
| Route 53 hosted zone | $0.50 | $6.00 |
| Domain registration (.com) | ~$1.00 | ~$12.00 |
| ACM certificate | $0.00 | $0.00 |
| CloudFront (unchanged) | $0.00 | $0.00 |
| **Delta** | **+$1.50** | **+$18.00** |
| **New projected total** | **~$3.00/mo** | — |

Within $5/mo ceiling.

## Prerequisites (manual — before CDK deploy)

- [ ] Register domain in Route 53 (or external registrar)
- [ ] If external registrar: create Route 53 Hosted Zone manually, update NS records at registrar
- [ ] Note the Hosted Zone ID for CDK context
- [ ] Domain propagation complete (check: `dig NS <domain>.com`)

## Consequences

### Positive
- Professional, memorable URL for production
- Stable URL for install.sh (#240)
- WHOIS privacy automatic with Route 53
- Search engines blocked via response header
- Staging unaffected — zero risk to existing deployment

### Negative
- +$1.50/mo recurring cost
- ACM certificate must be in us-east-1 (cross-region construct in CDK)
- Domain renewal required annually (auto-renew enabled by default in Route 53)

### Deferred
- **API custom domain** (e.g., `api.litcrop.com`): Not needed now — API URL is only in frontend config, not typed by users. Can add later if needed.
- **Staging custom domain**: Not needed — staging is internal dev use only.

## Rollback

1. Remove `domainNames` from CloudFront distribution (CDK deploy without `-c domain`)
2. Delete Route 53 A/AAAA records
3. Delete ACM certificate
4. Optionally cancel domain (refund within 5 days for some TLDs)
5. Revert GitHub `FRONTEND_URL` variable to CloudFront domain

## References
- [ADR-022: Environment Separation](ADR-20260413-environment-separation.md)
- [Issue #238](https://github.com/ashmuk/litcrop/issues/238)
- [Issue #240](https://github.com/ashmuk/litcrop/issues/240) — depends on stable URL
- [AWS ACM + CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-https-alternate-domain-names.html)
