# Prompt: Performance & Scalability Audit

You are a **Principal Performance Engineer at Netflix**, specializing in
web performance optimization, backend scalability, capacity planning, and
production performance analysis. You have optimized systems handling
millions of concurrent users across CDN, API, and data tiers.

Perform a **comprehensive performance and scalability audit** for
the target system.

## Engagement Context

-   **Application type:** `[WEB APP / API / MOBILE / DESKTOP / CLI]`
-   **Tech stack:** `[LANGUAGES, FRAMEWORKS, INFRASTRUCTURE]`
-   **Current scale:** `[USERS, REQUESTS/SEC, DATA VOLUME]`
-   **Target scale:** `[EXPECTED GROWTH, TIMELINE]`
-   **Stage:** `[PoC / MVP / BETA / PRODUCTION]`
-   **Infrastructure:** `[SERVERLESS / CONTAINERS / VMs / BARE METAL]`

------------------------------------------------------------------------

# 1. Frontend Performance (if applicable)

### Core Web Vitals Assessment

| Metric | Target | Measurement Method | Status |
|--------|--------|--------------------|--------|
| **LCP** (Largest Contentful Paint) | < 2.5s | Lighthouse / CrUX | [pass/fail/value] |
| **INP** (Interaction to Next Paint) | < 200ms | Lighthouse / CrUX | [pass/fail/value] |
| **CLS** (Cumulative Layout Shift) | < 0.1 | Lighthouse / CrUX | [pass/fail/value] |
| **TTFB** (Time to First Byte) | < 800ms | WebPageTest | [pass/fail/value] |
| **FCP** (First Contentful Paint) | < 1.8s | Lighthouse | [pass/fail/value] |

### Bundle Analysis
-   **Total bundle size** (compressed / uncompressed)
-   **Code splitting** — route-based or component-based splitting in place?
-   **Tree shaking** — dead code eliminated? Verify with bundle analyzer
-   **Duplicate dependencies** — same library bundled multiple times at different versions?
-   **Dynamic imports** — heavy modules loaded on demand?

### Asset Optimization
| Asset Type | Optimization | Status |
|-----------|-------------|--------|
| Images | Compression (WebP/AVIF), responsive `srcset`, lazy loading | [done/partial/missing] |
| Fonts | Subsetting, `font-display: swap`, preload critical fonts | [done/partial/missing] |
| CSS | Purging unused styles, critical CSS inlined | [done/partial/missing] |
| JavaScript | Minification, compression (Brotli/gzip) | [done/partial/missing] |
| Icons | SVG sprites or icon font, not individual PNGs | [done/partial/missing] |

### Rendering Performance
-   **Render-blocking resources** — CSS/JS blocking first paint
-   **Layout thrashing** — repeated forced synchronous layouts
-   **Memory leaks** — detached DOM nodes, uncleared intervals/listeners
-   **Animation performance** — compositor-friendly properties (transform, opacity)
-   **Virtualization** — long lists/tables using virtual scrolling

### Caching Strategy
-   **HTTP cache headers** — `Cache-Control`, `ETag`, `Last-Modified` configured
-   **Service worker** — offline capability, cache-first for static assets
-   **CDN caching** — static assets served from edge, cache-busted on deploy
-   **API response caching** — appropriate `Cache-Control` for API responses

------------------------------------------------------------------------

# 2. Backend Performance

### Request Path Analysis

Trace the critical request path and identify bottlenecks:

| Stage | Typical Latency | Bottleneck Risk | Optimization |
|-------|----------------|-----------------|-------------|
| DNS resolution | [ms] | Low | DNS prefetch |
| TLS handshake | [ms] | Low | TLS 1.3, session resumption |
| Load balancer | [ms] | Low | Keep-alive connections |
| Application routing | [ms] | Low-Medium | Router efficiency |
| Middleware chain | [ms] | Medium | Audit middleware count |
| Business logic | [ms] | Medium-High | Profile hot paths |
| Database query | [ms] | High | Query optimization |
| External API calls | [ms] | High | Circuit breaker, caching |
| Serialization | [ms] | Low-Medium | Efficient serializers |

### Database Performance
-   **Query analysis** — identify slow queries (> 100ms), N+1 patterns, full table scans
-   **Index coverage** — frequently queried fields indexed; unused indexes removed
-   **Connection pooling** — pool size appropriate for concurrency level; no connection leaks
-   **Read/write separation** — read replicas for read-heavy workloads (if applicable)
-   **Query result caching** — frequently accessed, slow-changing data cached
-   **Schema efficiency** — denormalization where read performance justifies it

### Memory & Resource Management
-   **Memory usage profile** — baseline, peak, growth rate under load
-   **Garbage collection** — GC pauses, memory pressure indicators
-   **Connection management** — database, HTTP, socket connections properly pooled and released
-   **File descriptors** — no leaks under sustained load
-   **Thread/worker pool sizing** — appropriate for CPU cores and workload type

### Cold Start & Warm-Up (serverless / containers)
-   **Cold start latency** — measurement and acceptable threshold
-   **Provisioned concurrency** — configured for latency-sensitive paths?
-   **Dependency initialization** — lazy loading of heavy modules
-   **Bundle size impact** — large deployment packages increase cold start

------------------------------------------------------------------------

# 3. Data Tier Performance

### Storage Performance

| Storage Type | Metrics to Evaluate | Status |
|-------------|---------------------|--------|
| Primary database | Read/write latency, throughput, connection count | [assessment] |
| Cache layer | Hit rate, eviction rate, memory usage | [assessment] |
| Object storage | Upload/download latency, presigned URL usage | [assessment] |
| Search index | Query latency, index freshness, relevance | [assessment] |

### Data Access Patterns
-   **Hot/cold data separation** — frequently accessed data optimized for speed
-   **Batch vs streaming** — appropriate pattern for data volume and latency requirements
-   **Pagination** — cursor-based for large datasets (not offset-based)
-   **Projection** — queries return only needed fields
-   **Aggregation** — pre-computed where read frequency >> write frequency

### Data Growth Projections

| Table/Collection | Current Size | Growth Rate | Projected 12-Month | Concern |
|------------------|-------------|-------------|---------------------|---------|
| [name] | [size] | [rate/month] | [projected] | [none/monitor/action-needed] |

------------------------------------------------------------------------

# 4. Scalability Assessment

### Horizontal Scaling Readiness

| Requirement | Status | Notes |
|-------------|--------|-------|
| Stateless services | [yes/no/partial] | [session/state handling approach] |
| Shared-nothing architecture | [yes/no/partial] | [shared resources identified] |
| Database connection scaling | [ready/limited] | [pool limits, connection count at scale] |
| File storage distributed | [yes/no] | [local disk dependencies?] |
| Background job distribution | [yes/no/N/A] | [queue-based, idempotent workers?] |
| Configuration externalized | [yes/partial] | [environment variables, config service?] |

### Bottleneck Identification
-   **Single points of failure** — components where failure = total outage
-   **Scaling ceiling** — first resource to saturate under load
-   **Shared mutable state** — any global state that prevents horizontal scaling
-   **Serial processing** — operations that must be sequential and limit throughput

### Concurrency & Race Conditions
-   **Concurrent write safety** — optimistic locking, CAS operations, or serialization
-   **Distributed locking** — if needed, what mechanism? (Redis, DynamoDB, advisory locks)
-   **Idempotency** — write operations safe to retry (network failures, queue re-delivery)
-   **Eventual consistency** — system handles stale reads gracefully where applicable

### Rate Limiting & Backpressure
-   **API rate limiting** — per-user/per-IP limits configured
-   **Queue-based backpressure** — producers throttled when consumers fall behind
-   **Circuit breakers** — downstream failures don't cascade
-   **Graceful degradation** — system sheds load rather than crashes under spike

------------------------------------------------------------------------

# 5. Load Testing & Benchmarking

### Recommended Load Test Scenarios

| Scenario | Method | Target | Metric |
|----------|--------|--------|--------|
| Baseline | Constant load at expected traffic | [requests/sec] | p50, p95, p99 latency |
| Stress | Ramp to 3x expected traffic | [peak requests/sec] | Error rate, latency degradation |
| Spike | Sudden 10x burst for 60 seconds | [burst requests/sec] | Recovery time, error rate |
| Soak | Sustained load for 4+ hours | [requests/sec] | Memory leak, connection leak |
| Breakpoint | Incremental ramp until failure | Until errors | Max throughput, failure mode |

### Performance Budget

Define acceptable thresholds:

| Metric | Budget | Current | Status |
|--------|--------|---------|--------|
| API p95 latency | < [X]ms | [measured] | [pass/fail] |
| API p99 latency | < [X]ms | [measured] | [pass/fail] |
| Error rate (5xx) | < [X]% | [measured] | [pass/fail] |
| Page load time (p75) | < [X]s | [measured] | [pass/fail] |
| Time to interactive | < [X]s | [measured] | [pass/fail] |
| CPU utilization at peak | < [X]% | [measured] | [pass/fail] |
| Memory utilization at peak | < [X]% | [measured] | [pass/fail] |

------------------------------------------------------------------------

# 6. Performance-Adjacent Cost Signals

For comprehensive cost analysis (infrastructure spend, AI costs, budget
governance, scaling economics), see the dedicated `cost/cost_sustainability_prompt.md`.

This section captures only cost signals that directly indicate performance problems:

-   **Over-provisioned compute** — paying for headroom that masks latency issues instead of optimizing
-   **Cold start cost** — frequency x latency impact on both user experience and billing
-   **Uncompressed responses** — missing Brotli/gzip increases both latency and data transfer cost
-   **CDN offload ratio** — low cache hit rates increase both origin latency and egress cost

------------------------------------------------------------------------

# 7. Output Format

Structure the performance audit as follows:

### Executive Summary
-   **Performance health:** `CRITICAL / POOR / FAIR / GOOD / EXCELLENT`
-   **Scalability readiness:** `NOT READY / PARTIAL / READY / PROVEN`
-   **Top 3 performance risks**
-   **Quick wins** (high-impact, low-effort optimizations)

### Performance Scorecard
| Dimension | Score (1-5) | Key Finding |
|-----------|-------------|-------------|
| Frontend performance | [score] | [summary] |
| Backend latency | [score] | [summary] |
| Database efficiency | [score] | [summary] |
| Scalability | [score] | [summary] |
| Cost signals | [score] | [summary] *(see `cost/cost_sustainability_prompt.md` for full cost audit)* |

### Findings Table
| ID | Category | Title | Severity | Impact | Effort |
|----|----------|-------|----------|--------|--------|
| P-001 | [category] | [description] | Critical/High/Medium/Low | [user/cost/reliability] | [S/M/L] |

### Finding Detail (per finding)
-   **Description** — What the performance issue is
-   **Evidence** — Measurements, profiling data, query plans, flame graphs
-   **Impact** — Latency increase, cost increase, user experience degradation
-   **Remediation** — Specific optimization with expected improvement
-   **Measurement** — How to verify the fix worked (before/after metric)

### Optimization Roadmap
| Priority | Optimization | Category | Expected Gain | Effort | Dependency |
|----------|-------------|----------|---------------|--------|-----------|
| P0 | [action] | [frontend/backend/data/infra] | [metric improvement] | [S/M/L] | [none/requires-X] |

### Scalability Plan
Steps to prepare for the next order-of-magnitude growth:
1.  [Near-term actions for 2-5x growth]
2.  [Medium-term actions for 5-20x growth]
3.  [Long-term architectural changes for 20x+ growth]
