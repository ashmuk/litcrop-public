# ADR-20260413: Capacity Analysis and Scalability Review (#334)

## Status
Accepted (2026-04-13) — design review, informs production readiness

## Context

LitCrop is entering Pre-PROD (v0.93). This document analyzes capacity at current scale and projects growth to 10x, 100x, and 1000x to identify bottlenecks before GA. Tier limits are defined in ADR-20260413-monetization-strategy.

## Current Architecture Snapshot

| Component | Configuration | Cost Impact |
|-----------|--------------|-------------|
| DynamoDB | On-Demand (PAY_PER_REQUEST), PITR enabled, 2 GSIs | ~$0.10/mo |
| S3 (4 buckets) | Images versioned, IA→Glacier lifecycle, 30d log expiry | ~$0.05/mo |
| Lambda API | 512MB, 30s timeout, ARM64, no reserved concurrency | ~$0.10/mo |
| Lambda Thumbnail | 1024MB, 60s timeout, ARM64, S3 trigger | ~$0.02/mo |
| API Gateway | HTTP API v2, 100 req/s rate, 200 req/s burst | ~$0.01/mo |
| CloudFront | CACHING_OPTIMIZED, PRICE_CLASS_200, TLS 1.2+ | ~$0.05/mo |
| Cognito | User pool + JWT authorizer | Free tier |
| SES | Sandbox, admin-only | Free tier |
| **Total** | | **~$0.47/mo** |

## Scale Projections

### Data Volume Estimates

| Metric | 10 users | 100 users | 1,000 users |
|--------|---------|----------|------------|
| Farms | 10-15 | 80-150 | 500-1,500 |
| Beds | 100-300 | 1K-5K | 10K-50K |
| Images | 500/mo | 5K/mo | 50K/mo |
| Diary entries | 200/mo | 2K/mo | 20K/mo |
| DynamoDB items | ~5K | ~50K | ~500K |
| S3 storage | 2 GB | 20 GB | 200 GB |
| AI chat requests | 50/day | 500/day | 5K/day |

### Cost Projections (per ADR-20260413-monetization)

| Scale | DynamoDB | S3 | Lambda | API GW | CloudFront | AI (Haiku) | **Total** |
|-------|---------|------|--------|--------|-----------|-----------|----------|
| 10 users | $0.10 | $0.05 | $0.12 | $0.01 | $0.05 | $0.14 | **$0.47** |
| 100 users | $0.50 | $0.50 | $0.80 | $0.10 | $0.20 | $1.50 | **$3.60** |
| 100 users + BYOK | $0.50 | $0.50 | $0.50 | $0.10 | $0.20 | $0.00 | **$1.80** |
| 1K users | $5.00 | $5.00 | $5.00 | $1.00 | $2.00 | $15.00 | **$33.00** |
| 1K users + BYOK | $5.00 | $5.00 | $3.00 | $1.00 | $2.00 | $0.00 | **$16.00** |

**Key finding**: AI cost dominates at 100+ users. BYOK (#333) is essential before scaling past ~50 active chat users.

## Bottleneck Analysis

### 1. DynamoDB — LOW RISK

| Concern | Assessment |
|---------|-----------|
| Partition hot keys | Low — keys are well-distributed (FARM#, USER#, BED#, IMG#) |
| USAGE# counters | Medium — atomic ADD on global counter could throttle under extreme chat load |
| Scan operations | Low — `getAllFarms()` and `getStats()` are admin-only, cached 5 min |
| On-demand scaling | Handles burst automatically; no capacity planning needed |
| Item size | Low — largest items are ~2KB (farm metadata); well under 400KB limit |

**Action**: Monitor `ThrottledRequests` metric. At 1K users, consider dedicated stats aggregation (DynamoDB Streams → counter table) to eliminate scans entirely.

### 2. S3 Storage — LOW RISK

| Concern | Assessment |
|---------|-----------|
| Image growth | 500 images/month/farm × 100 farms = 50K images/month (~25GB) |
| Lifecycle | IA at 30d, Glacier at 90d — cost-optimized |
| Versioning | Images bucket only — noncurrent versions expire at 30d |
| Thumbnail regeneration | Not needed — thumbnails are cheap to regenerate from originals |

**Action**: Add S3 Storage Lens dashboard at 100+ users. Consider image compression (WebP/AVIF, #385) to reduce storage 40-60%.

### 3. Lambda Concurrency — MEDIUM RISK

| Concern | Assessment |
|---------|-----------|
| No reserved concurrency | Both Lambdas share the 1000 default per region |
| Cold starts | ARM64 + Node.js 20 = ~300ms cold start; acceptable |
| Thumbnail Lambda | S3 trigger can burst during bulk uploads |
| Chat requests | 30s timeout accommodates Claude API latency |

**Action at 100+ users**:
- Set reserved concurrency: API Lambda = 100, Thumbnail Lambda = 50
- Add provisioned concurrency (1-2 instances) for API Lambda to eliminate cold starts
- Cost: ~$3/month for 2 provisioned instances

### 4. API Gateway — LOW RISK

| Concern | Assessment |
|---------|-----------|
| Rate limit 100 req/s | Sufficient for 1K users (avg ~1 req/s per active user) |
| Burst 200 req/s | Handles page load bursts (5-10 concurrent API calls per page) |
| WebSocket | Not used — polling-based; acceptable for MVP |

**Action at 1K users**: Increase rate limit to 500 req/s, burst to 1000.

### 5. CloudFront — LOW RISK

| Concern | Assessment |
|---------|-----------|
| Static asset caching | Excellent — Astro SSG, versioned filenames |
| Image serving | Via signed URLs (bypasses CloudFront); no CDN benefit for images |
| PRICE_CLASS_200 | Covers Asia + North America; appropriate for target audience |

**Action**: Consider CloudFront for image serving (with signed cookies) at 1K+ users to reduce S3 request costs.

### 6. AI Chat — HIGH RISK (cost)

| Concern | Assessment |
|---------|-----------|
| Claude Haiku cost | ~$0.003/request (avg 2K input + 500 output tokens) |
| Per-user daily limit | 50K input tokens / 10K output tokens → ~20 conversations/day |
| Global daily limit | 500K input / 100K output → ~100 conversations/day total |
| Cost at 100 users | If 50% use chat daily: 50 × 20 × $0.003 = $3/day = $90/month |

**Action (critical)**:
1. Implement BYOK (#333) before reaching 50 active chat users
2. Reduce free tier to `FREE_PLAN_AI_MESSAGES_PER_DAY = 20` (done in monetization ADR)
3. Monitor daily AI spend via budget alerts (F-35, already implemented)

### 7. Cognito — LOW RISK

| Concern | Assessment |
|---------|-----------|
| MAU pricing | Free for first 50K MAUs |
| JWT validation | At API Gateway level (no Lambda cost) |
| Rate limits | 40 auth requests/sec default; sufficient |

**No action needed** until 50K MAUs.

## Durability Assessment

| Data Type | Storage | Backup | Recovery |
|-----------|---------|--------|----------|
| Farm/User/Bed data | DynamoDB | PITR (35 days) | Point-in-time restore |
| Images | S3 (versioned) | 30d noncurrent versions | S3 versioning restore |
| Thumbnails | S3 (unversioned) | Regenerable from originals | Re-trigger Lambda |
| Static frontend | S3 + git | Git repo is source of truth | Redeploy from git |
| Logs | CloudWatch (30d) + S3 (30d) | Not backed up | Acceptable loss |
| Chat history | DynamoDB (TTL expiry) | PITR while active | Design: ephemeral |

**Assessment**: Durability is adequate for MVP. All critical data has at least one recovery path.

## Recommendations Summary

### Before GA (v1.0)
1. **Reserve Lambda concurrency**: API=100, Thumb=50 ($0/month, just configuration)
2. **Monitor USAGE# throttling**: CloudWatch alarm on `ThrottledRequests`
3. **Set S3 request monitoring**: CloudWatch alarm if S3 GET/PUT exceeds 100K/day

### At 100 Users
4. **Implement BYOK** (#333) — shifts AI cost to power users
5. **Add provisioned concurrency** (2 instances) — eliminate cold starts ($3/month)
6. **Consider WebP/AVIF** (#385) — reduce image storage 40-60%

### At 1,000 Users
7. **DynamoDB Streams for stats** — replace scan-based getStats() entirely
8. **API Gateway rate increase** — 500 req/s sustained
9. **CloudFront image serving** — reduce S3 direct request costs
10. **Consider DAX** (#384) — if read latency becomes an issue

## Decision

The current architecture supports **100 users without changes** (cost ~$3.60/month, under $5 ceiling with BYOK). At 1,000 users, cost requires BYOK and modest infrastructure investment (~$16/month with BYOK). No architectural changes needed — the serverless stack scales horizontally.

**Production-ready**: Yes, with reserved concurrency and monitoring (items 1-3 above).

## Related
- ADR-20260413-monetization-strategy — Free/paid tier definitions
- #381 — Per-user API rate limiting (F-25)
- #384 — DynamoDB DAX (F-27)
- #385 — WebP/AVIF support (F-29)
- #333 — BYOK for AI
