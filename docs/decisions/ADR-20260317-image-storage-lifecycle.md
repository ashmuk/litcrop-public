# ADR-20260317: Image Storage and Lifecycle Strategy

## Status
Accepted

## Context
LitCrop captures periodic crop images (max 2MB JPEG, every 1 hour per node) and must store, serve, and eventually age-out these images. For PoC, a single simulated node generates approximately:
- 24 images/day (every 1 hour)
- ~24 MB/day (at ~1MB average)
- ~720 images/month (~720 MB/month)

Images must be:
- Uploaded via the API (multipart form data)
- Stored durably with metadata association
- Served to the mobile dashboard via signed URLs (NFR-6.1)
- Organized by plot and time for efficient retrieval

### Decision Drivers
- Cost: S3 storage and transfer costs must fit within $5/month budget
- Security: No public access; signed URLs only
- Organization: Images must be retrievable by plot and time
- Lifecycle: Old images should be moved to cheaper storage or deleted
- Simplicity: Minimal configuration for PoC

## Options Considered

### Option A: S3 Standard with lifecycle policies
- **Description**: Store images in S3 Standard; use lifecycle rules to transition to Glacier or delete after retention period.
- **Pros**:
  - S3 free tier: 5GB storage, 20,000 GET, 2,000 PUT (12 months)
  - Signed URL generation is built-in
  - Lifecycle policies automate cost management
  - CloudFront integration for cached delivery
  - Extremely durable (99.999999999%)
- **Cons**:
  - Free tier is 12-month limited (except for always-free services)
  - Beyond free tier: ~$0.025/GB/month for S3 Standard in ap-northeast-1
  - Need to configure bucket policy, CORS, and lifecycle rules
- **Effort**: Low

### Option B: S3 One Zone-IA from the start
- **Description**: Store directly in S3 One Zone-Infrequent Access for lower cost.
- **Pros**:
  - ~40% cheaper than S3 Standard ($0.01/GB/month vs $0.025/GB)
  - Same API and signed URL support
- **Cons**:
  - Lower durability (99.999999999% but single AZ)
  - 30-day minimum storage charge per object
  - Retrieval fees add up if images are viewed frequently
  - Not covered by free tier
- **Effort**: Low

### Option C: S3 Standard + CloudFront caching
- **Description**: S3 Standard for storage, CloudFront distribution for serving with signed URLs.
- **Pros**:
  - CloudFront caches frequently viewed images at edge
  - Reduces S3 GET request costs
  - Lower latency for repeat views
  - CloudFront free tier: 1TB transfer, 10M requests/month (perpetual)
- **Cons**:
  - Additional configuration (CloudFront distribution, OAC)
  - Signed URL complexity moves from S3 to CloudFront (different signing mechanism)
  - May be over-engineering for PoC single-user traffic
- **Effort**: Medium

## Decision
We choose **Option A: S3 Standard with lifecycle policies** for PoC, with CloudFront deferred to MVP.

### Storage Key Convention
```
images/{farmId}/{plotId}/{YYYY}/{MM}/{DD}/{imageId}.jpg
```

Example: `images/farm-001/plot-a1/2026/03/17/img-abc123.jpg`

This convention:
- Groups images by farm and plot for access pattern alignment
- Date partitioning enables lifecycle rules by prefix
- Image ID ensures uniqueness within a time slot

### Lifecycle Policy (PoC)
| Rule | Action | After |
|------|--------|-------|
| Transition to S3-IA | Move to Infrequent Access | 30 days |
| Transition to Glacier | Move to Glacier Instant Retrieval | 90 days |
| Delete | Remove permanently | 365 days |

### Upload Flow
1. Client sends `POST /api/v1/plots/{plotId}/images` with multipart form data
2. Lambda validates content type (JPEG) and size (max 2MB)
3. Lambda generates storage key using convention above
4. Lambda uploads to S3 via `PutObject`
5. Lambda writes Image record to DynamoDB with storage_key
6. Lambda returns 201 with image ID and metadata

### Serving Flow
1. Client requests `GET /api/v1/images/{imageId}`
2. Lambda looks up Image record in DynamoDB
3. Lambda generates S3 presigned URL (15-minute expiry)
4. Client receives metadata + signed URL
5. Browser fetches image directly from S3 using signed URL

## Consequences

### Positive
- Zero cost within free tier for first 12 months (5GB, 2000 PUTs, 20000 GETs)
- Even beyond free tier, cost is minimal (~$0.10-0.25/month for 10GB storage)
- Lifecycle policies automatically manage long-term costs
- Signed URLs ensure images are never publicly accessible
- Key convention supports efficient prefix-based queries and lifecycle rules

### Negative / Risks
- S3 free tier is 12-month limited; storage costs begin after that
- Presigned URLs expire; cached/bookmarked image links break
- No CDN caching means every image view hits S3 directly

### Mitigations
- At PoC scale (< 10GB), post-free-tier cost is under $0.25/month
- 15-minute URL expiry is sufficient for dashboard browsing sessions
- CloudFront can be added at MVP without changing the storage layer

### Rollback Plan
- S3 data can be migrated to any other object storage (GCS, Azure Blob, R2)
- Storage key convention is cloud-agnostic
- Application code only interacts with S3 through a thin service layer in the API

## References
- [S3 Pricing ap-northeast-1](https://aws.amazon.com/s3/pricing/)
- [S3 Presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [S3 Lifecycle Rules](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html)
- REQUIREMENTS.md: FR-2.x (upload), NFR-6.1 (signed URLs)
