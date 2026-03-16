# ADR-20260317: Backend Platform and Compute Model

## Status
Accepted

## Context
LitCrop needs a backend to serve 7 REST API endpoints for the web dashboard and receive image uploads from simulated camera nodes. The PoC is single-user with light traffic (a few requests per day for browsing, plus one image upload every 10 minutes per simulated node).

The backend must:
- Handle multipart image uploads (max 2MB JPEG)
- Generate S3 signed URLs for image access
- Query and return farm/plot/image metadata
- Support adding tags to images
- Be deployable to AWS ap-northeast-1
- Cost effectively nothing at PoC scale

### Decision Drivers
- Cost: Pay-per-use; zero cost at idle
- Simplicity: Minimal infrastructure to manage
- Compatibility: Must integrate with S3 and the chosen database
- Auth-ready: Middleware layer where auth can be inserted later (NFR-6.4)
- Upload handling: Must support multipart/form-data up to 2MB

## Options Considered

### Option A: AWS Lambda + API Gateway (HTTP API)
- **Description**: Individual Lambda functions behind API Gateway HTTP API (v2). Each endpoint is a separate or grouped Lambda function.
- **Pros**:
  - True pay-per-use: zero cost at idle
  - HTTP API is cheaper than REST API ($1.00/million vs $3.50/million requests)
  - Free tier: 1M Lambda requests/month, 1M HTTP API requests/month
  - Native S3 and DynamoDB SDK access
  - Can use middleware pattern (Lambda layers or handler wrappers) for future auth
  - Supports multipart uploads up to 10MB (configurable)
- **Cons**:
  - Cold starts add 200-500ms latency (acceptable for PoC)
  - Local development requires SAM or similar tooling
  - Deployment is multi-step (package, upload, configure)
  - API Gateway HTTP API has fewer features than REST API (no request validation, no usage plans)
- **Effort**: Medium

### Option B: AWS Lambda + Function URLs (no API Gateway)
- **Description**: Skip API Gateway entirely; expose Lambda functions directly via Function URLs.
- **Pros**:
  - Even simpler: no API Gateway configuration
  - No additional cost (Function URLs are free)
  - Lower latency (no API Gateway hop)
- **Cons**:
  - No built-in routing; each function gets its own URL
  - No request throttling or rate limiting
  - No path-based routing (would need CloudFront or client-side URL mapping)
  - Harder to add auth middleware consistently
  - Not a standard REST API pattern
- **Effort**: Low

### Option C: Single Lambda with Express/Hono Router
- **Description**: One Lambda function running a lightweight HTTP framework (Hono or Express) behind API Gateway, handling all routes.
- **Pros**:
  - Standard web framework patterns; familiar to most developers
  - Single deployment unit
  - Middleware support built into the framework (auth, logging, CORS)
  - Local development works with standard `node` runtime
  - Hono is ultra-lightweight (~14KB) and designed for edge/serverless
- **Cons**:
  - Single Lambda means all routes share cold start and memory allocation
  - Slightly larger deployment package than individual functions
  - All-or-nothing scaling (less relevant at PoC scale)
- **Effort**: Low-Medium

## Decision
We choose **Option C: Single Lambda with Hono router** behind API Gateway HTTP API.

Specifically:
- **Hono** as the HTTP framework (lightweight, TypeScript-native, middleware-first)
- **Single Lambda function** handling all 7 API routes
- **API Gateway HTTP API (v2)** for routing, CORS, and future auth integration
- **TypeScript** throughout
- **aws-sdk v3** for S3 and DynamoDB access

## Consequences

### Positive
- Single codebase, single deployment unit for all API logic
- Hono's middleware pattern directly supports inserting auth later (NFR-6.4)
- Local development with standard Node.js (`node` or `wrangler` for testing)
- Familiar request/response patterns for any web developer
- Total cost at PoC scale: $0 (well within free tier)

### Negative / Risks
- Cold start affects all routes equally (~300ms for Node.js Lambda)
- Single function is a scaling bottleneck (irrelevant at PoC scale)
- Hono is newer and less widely adopted than Express (but growing rapidly)

### Mitigations
- Cold starts are acceptable for PoC (< 30s end-to-end requirement is easily met)
- Can split into individual functions at MVP if scaling demands it
- Hono has excellent documentation and TypeScript support; migration to Express is trivial if needed

### Rollback Plan
- Hono routes can be converted to Express routes with minimal syntax changes
- Can split single Lambda into per-route Lambdas by extracting handler functions
- API Gateway HTTP API routes remain the same regardless of backend implementation

## References
- [Hono](https://hono.dev/) — Lightweight web framework for serverless
- [AWS API Gateway HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api.html)
- [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- REQUIREMENTS.md: 7 API endpoints, multipart upload
