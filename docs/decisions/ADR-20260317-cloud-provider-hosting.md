# ADR-20260317: Cloud Provider and Hosting Strategy

## Status
Accepted

## Context
LitCrop needs a cloud platform for hosting the web frontend, API backend, image storage, and database. The deployment target is Nagano, Japan, requiring low-latency access from the Tokyo metro area. The PoC has a strict cost constraint of under $5/month at idle to light usage.

Vision.md states: "Assuming hosting on AWS, but other recommendations are welcome (e.g. Vercel)."

### Decision Drivers
- Cost: Must stay under $5/month for PoC idle + light usage
- Latency: Closest region to Nagano (36.0N, 138.3E) for both upload and browsing
- Simplicity: Minimal operational overhead for a single developer
- Reversibility: Avoid deep lock-in that prevents future migration
- Breadth: Must support object storage, serverless compute, database, and CDN

## Options Considered

### Option A: AWS (ap-northeast-1, Tokyo)
- **Description**: Use AWS services exclusively: S3, Lambda, API Gateway, DynamoDB/RDS, CloudFront
- **Pros**:
  - Full-service platform with every capability needed now and for future growth (IoT Core, SageMaker, etc.)
  - ap-northeast-1 is the closest major region to Nagano (~150km)
  - Free tier covers significant PoC usage (Lambda 1M requests, S3 5GB, DynamoDB 25GB, CloudFront 1TB)
  - Future IoT integration (AWS IoT Core) native
  - Team has existing AWS familiarity (Vision.md mentions AWS)
- **Cons**:
  - Higher operational complexity than managed platforms
  - Many services to configure (API Gateway, Lambda, S3, CloudFront, IAM)
  - No free tier for API Gateway REST after 12 months (HTTP API has better free tier)
- **Effort**: Medium

### Option B: Vercel + AWS S3
- **Description**: Use Vercel for frontend hosting and serverless API routes; AWS S3 for image storage only
- **Pros**:
  - Extremely simple deployment (git push)
  - Generous free tier (100GB bandwidth, serverless functions included)
  - Optimized for Next.js/SvelteKit/Astro frameworks
  - CDN built-in with edge network
- **Cons**:
  - Split infrastructure: Vercel for compute, AWS for storage
  - Vercel serverless functions have 10s timeout on free tier (sufficient but limiting)
  - No path to IoT integration; would still need AWS for production
  - Vercel edge network may route through US/EU before reaching Tokyo
  - Two vendor relationships to manage
- **Effort**: Low

### Option C: AWS + Vercel Frontend Only
- **Description**: Host frontend on Vercel, all backend on AWS
- **Pros**: Best of both for DX (Vercel frontend) and capability (AWS backend)
- **Cons**: Most complex split; CORS configuration required; two deployment targets
- **Effort**: High

## Decision
We choose **Option A: AWS (ap-northeast-1)** as the sole cloud provider.

## Consequences

### Positive
- Single vendor, single billing account, single IAM model
- Direct path from PoC to Production without re-platforming
- Future IoT services (IoT Core, Greengrass) available natively
- AWS Free Tier covers 12 months of PoC usage generously
- Lowest latency for Nagano deployment (Tokyo region)

### Negative / Risks
- Higher initial configuration effort compared to Vercel
- Must manage IAM, S3 policies, API Gateway configuration manually
- AWS console can be overwhelming for infrequent users

### Mitigations
- Use AWS CLI and scripts (not console) for reproducible setup
- Document all setup steps in PREREQUISITES.md
- Architecture designed so frontend could be moved to Vercel later if desired (static build output)

### Rollback Plan
- Frontend is a static site that can deploy anywhere (Vercel, Netlify, CloudFlare Pages)
- API routes can be ported to any Node.js serverless platform
- S3 data can be migrated with standard tools (aws s3 sync)
- DynamoDB data can be exported to JSON and imported elsewhere

## References
- [AWS Free Tier](https://aws.amazon.com/free/)
- [AWS ap-northeast-1 Region](https://docs.aws.amazon.com/general/latest/gr/rande.html)
- Vision.md: "Assuming hosting on AWS"
- PLANS.md: Cost constraint < $5/month
