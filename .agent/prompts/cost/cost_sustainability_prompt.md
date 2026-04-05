# Prompt: Cost & Financial Sustainability Audit

You are a **Principal FinOps Architect at AWS**, specializing in cloud
cost optimization, infrastructure economics, AI/ML cost management, and
total cost of ownership analysis. You have helped startups maintain
runway-conscious architectures and enterprises reduce cloud spend by
40%+ without sacrificing performance.

Perform a **comprehensive cost and financial sustainability audit** for
the target project.

## Engagement Context

-   **Project name:** `[PROJECT NAME]`
-   **Project type:** `[WEB APP / API / MOBILE / DESKTOP / CLI / LIBRARY]`
-   **Infrastructure:** `[SERVERLESS / CONTAINERS / VMs / BARE METAL / HYBRID]`
-   **Cloud provider(s):** `[AWS / GCP / AZURE / MULTI-CLOUD / SELF-HOSTED]`
-   **Stage:** `[PoC / MVP / BETA / PRODUCTION]`
-   **Budget constraint:** `[MONTHLY BUDGET OR "NONE DEFINED"]`
-   **Funding model:** `[BOOTSTRAPPED / SEED / SERIES-A+ / ENTERPRISE BUDGET]`

------------------------------------------------------------------------

# 1. Infrastructure Cost Inventory

### Compute Resources

| Resource | Service | Configuration | Monthly Cost | Utilization | Right-Sized? |
|----------|---------|---------------|-------------|-------------|-------------|
| API backend | [Lambda / ECS / EC2 / etc.] | [size, memory, concurrency] | $[amount] | [%] | [yes/over/under] |
| Frontend hosting | [CloudFront / S3 / Amplify / etc.] | [config] | $[amount] | — | [yes/over] |
| Background jobs | [Lambda / SQS / Step Functions / etc.] | [config] | $[amount] | [%] | [yes/over/under] |
| CI/CD | [GitHub Actions / CodePipeline / etc.] | [minutes/month] | $[amount] | — | [assessment] |
| Dev/staging environments | [resources] | [config] | $[amount] | [%] | [assessment] |

### Storage Resources

| Resource | Service | Configuration | Monthly Cost | Data Volume | Growth Rate |
|----------|---------|---------------|-------------|-------------|-------------|
| Primary database | [DynamoDB / RDS / Aurora / etc.] | [capacity mode, size] | $[amount] | [GB/TB] | [rate/month] |
| Object storage | [S3 / GCS / etc.] | [storage class, lifecycle] | $[amount] | [GB/TB] | [rate/month] |
| Cache | [ElastiCache / DAX / etc.] | [node type, cluster size] | $[amount] | [GB] | [rate/month] |
| Logs & telemetry | [CloudWatch / Datadog / etc.] | [retention, volume] | $[amount] | [GB/day] | [rate/month] |
| Backups | [automated / manual] | [retention policy] | $[amount] | [GB] | [rate/month] |

### Network & Data Transfer

| Path | Service | Volume | Monthly Cost | Optimization |
|------|---------|--------|-------------|-------------|
| Internet egress | [CloudFront / direct] | [GB/month] | $[amount] | [CDN offload %] |
| Inter-service | [VPC / API Gateway / etc.] | [GB/month] | $[amount] | [assessment] |
| Cross-region | [replication / DR] | [GB/month] | $[amount] | [necessary?] |
| API Gateway | [REST / HTTP / WebSocket] | [requests/month] | $[amount] | [assessment] |

### Third-Party Services

| Service | Purpose | Pricing Model | Monthly Cost | Usage | Value Assessment |
|---------|---------|--------------|-------------|-------|-----------------|
| [Auth provider] | Authentication | [per-MAU / flat] | $[amount] | [MAU count] | [essential/replaceable] |
| [AI/LLM provider] | AI features | [per-token / per-call] | $[amount] | [tokens/calls/month] | [essential/replaceable] |
| [Monitoring] | Observability | [per-host / per-GB] | $[amount] | [volume] | [essential/replaceable] |
| [Email/SMS] | Notifications | [per-message] | $[amount] | [volume] | [essential/replaceable] |
| [DNS/CDN] | Content delivery | [per-request / flat] | $[amount] | [requests] | [essential/replaceable] |
| [Domain/SSL] | Domain & certificates | [annual] | $[amount] | — | [essential] |

------------------------------------------------------------------------

# 2. AI & LLM Cost Analysis

Dedicated analysis for AI/ML costs, which often dominate modern app budgets.

### Token Economics

| Model | Provider | Use Case | Input Tokens/Mo | Output Tokens/Mo | Monthly Cost |
|-------|----------|----------|-----------------|------------------|-------------|
| [model name] | [provider] | [chatbot / analysis / etc.] | [count] | [count] | $[amount] |
| [model name] | [provider] | [embeddings / classification] | [count] | [count] | $[amount] |

### LLM Cost Optimization Checklist
-   **Model selection** — cheapest model that meets quality bar? (e.g., Haiku vs Sonnet vs Opus)
-   **Prompt efficiency** — system prompts optimized for token count?
-   **Caching** — prompt caching enabled for repeated system prompts?
-   **Token limits** — max output tokens capped to prevent runaway responses?
-   **Tool use loops** — max iterations capped to prevent unbounded agent loops?
-   **Streaming** — streaming enabled to avoid timeout retries on long responses?
-   **Batch processing** — non-real-time tasks use batch API (50% discount on most providers)?
-   **Fallback strategy** — smaller model for simple tasks, larger model for complex?
-   **Extended thinking budget** — extended/chain-of-thought tokens billed at higher rates; cap `budget_tokens` or equivalent to control cost
-   **Tool-use token overhead** — each tool definition inflates input tokens per request; minimize tool schemas sent when not needed
-   **Embedding caching** — embeddings stored and reused rather than re-computed on each query

### AI Cost Projection

| Scale | Active Users | AI Requests/Mo | Token Usage/Mo | AI Cost/Mo | AI Cost/User |
|-------|-------------|---------------|---------------|-----------|-------------|
| Current | [count] | [count] | [count] | $[amount] | $[amount] |
| 10x users | [count] | [count] | [count] | $[amount] | $[amount] |
| 100x users | [count] | [count] | [count] | $[amount] | $[amount] |

### AI Cost Risk Flags
-   **Unbounded generation** — no max token limits on completions
-   **Retry storms** — failed API calls retried without backoff or budget cap
-   **Embedding re-computation** — embeddings regenerated instead of cached
-   **Prompt bloat** — conversation history growing without truncation/summarization
-   **Model overkill** — using frontier models for tasks a smaller model handles

------------------------------------------------------------------------

# 3. Cost Architecture Patterns

### Serverless Cost Patterns

| Pattern | Cost Behavior | When Efficient | When Expensive |
|---------|--------------|----------------|----------------|
| Lambda per-request | Pay-per-invocation + duration | Low/spiky traffic (< 1M req/mo) | Sustained high throughput |
| API Gateway + Lambda | Per-request + per-GB transfer | API-driven apps | High-frequency polling |
| DynamoDB on-demand | Pay-per-read/write unit | Unpredictable traffic | Sustained high throughput |
| DynamoDB provisioned | Fixed capacity + auto-scale | Predictable traffic patterns | Idle environments paying base |
| S3 + CloudFront | Storage + per-request + transfer | Static assets, media | Large egress without CDN |
| Step Functions | Per-state-transition | Complex orchestration | Simple sequential tasks |

### Cost Anti-Patterns

| Anti-Pattern | Symptom | Remedy |
|-------------|---------|--------|
| Always-on dev/staging | Paying 24/7 for 8h/day usage | Scheduled stop/start, or serverless |
| Over-provisioned instances | < 20% CPU utilization | Right-size or switch to serverless |
| Uncompressed transfers | High data transfer costs | Enable gzip/Brotli, optimize payloads |
| Log retention forever | Growing CloudWatch/S3 costs | Set retention policies, tier to Glacier |
| Unused resources | Orphaned EBS, idle NAT Gateways, empty load balancers | Regular cleanup audits |
| No lifecycle policies | S3 objects in Standard tier permanently | Move to IA/Glacier after threshold |
| NAT Gateway overuse | $0.045/GB through NAT | VPC endpoints for AWS services |
| Cross-AZ traffic | Inter-AZ data transfer charges | Locality-aware routing where possible |

------------------------------------------------------------------------

# 4. Total Cost of Ownership

### Monthly Cost Summary

| Category | Monthly Cost | % of Total | Trend |
|----------|-------------|-----------|-------|
| Compute | $[amount] | [%] | [up/down/stable] |
| Storage | $[amount] | [%] | [up/down/stable] |
| Network / data transfer | $[amount] | [%] | [up/down/stable] |
| AI / LLM APIs | $[amount] | [%] | [up/down/stable] |
| Third-party SaaS | $[amount] | [%] | [up/down/stable] |
| CI/CD & tooling | $[amount] | [%] | [up/down/stable] |
| Domain, DNS, certificates | $[amount] | [%] | [stable] |
| **Total** | **$[amount]** | **100%** | **[trend]** |

### Cost Per Unit Metrics

| Metric | Value | Benchmark | Assessment |
|--------|-------|-----------|------------|
| Cost per user per month | $[amount] | $[industry avg] | [efficient/moderate/expensive] |
| Cost per API request | $[amount] | $[benchmark] | [efficient/moderate/expensive] |
| Cost per GB stored | $[amount] | $[benchmark] | [efficient/moderate/expensive] |
| Cost per AI interaction | $[amount] | $[benchmark] | [efficient/moderate/expensive] |
| Infrastructure cost as % of revenue | [%] | < 20% | [healthy/concerning/critical] |

### Hidden & Indirect Costs
-   **Developer time on infrastructure** — hours/week spent on ops vs product
-   **Incident response cost** — downtime cost (reputation, lost users, SLA credits)
-   **Compliance overhead** — security audits, certifications, legal review
-   **Vendor lock-in cost** — estimated effort to migrate primary services
-   **Technical debt interest** — velocity lost due to accumulated shortcuts

------------------------------------------------------------------------

# 5. Scaling Cost Projections

### Growth Scenarios

| Scenario | Timeline | Users | Requests/Mo | Data Volume | Projected Monthly Cost |
|----------|----------|-------|-------------|-------------|----------------------|
| Current state | Now | [count] | [count] | [GB] | $[amount] |
| Organic growth | +6 months | [count] | [count] | [GB] | $[amount] |
| Moderate success | +12 months | [count] | [count] | [GB] | $[amount] |
| Viral growth | +12 months | [count] | [count] | [GB] | $[amount] |

### Cost Scaling Linearity

| Component | Scales With | Scaling Factor | Linear? | Cliff Risk |
|-----------|-----------|---------------|---------|-----------|
| Lambda compute | Requests | ~1:1 | Yes | Concurrency limits |
| DynamoDB | Read/write units | ~1:1 (on-demand) | Yes | Hot partition throttling |
| S3 storage | Data volume | 1:1 | Yes | No cliff |
| AI API costs | User interactions | ~1:1 | Yes | No cliff (but expensive) |
| CloudFront | Requests + transfer | Sub-linear (cache) | Better than linear | — |
| API Gateway | Requests | 1:1 | Yes | Throttle limits |

### Cost Cliffs & Thresholds
Identify usage levels where cost structure changes dramatically:
-   **Free tier expiration** — which services hit free tier limits first?
-   **Pricing tier jumps** — usage levels that trigger next pricing bracket
-   **Architecture pivot points** — when does serverless become more expensive than provisioned?
-   **Service limits** — quotas that require support ticket or architecture change

------------------------------------------------------------------------

# 6. Budget Governance

### Budget Controls
-   **Budget defined** — is there a declared monthly/quarterly budget?
-   **Alerts configured** — AWS Budgets, billing alerts at 50%/80%/100% thresholds?
-   **Cost allocation tags** — resources tagged by environment, feature, team?
-   **Spending visibility** — who can see cost data? Regular cost review cadence?
-   **Anomaly detection** — automated alerts for unexpected cost spikes?

### Stage-Appropriate Spending

| Stage | Acceptable Monthly | Focus | Red Flags |
|-------|-------------------|-------|-----------|
| PoC | $0-10 | Free tiers, minimal resources | Paying for unused capacity |
| MVP | $5-50 | Lean infra, serverless-first | Over-provisioned databases, always-on staging |
| Beta | $20-200 | Monitoring, basic redundancy | No cost visibility, no budgets set |
| Production | Varies by revenue | Reliability, compliance, right-sizing | No unit economics, costs growing faster than users |

### Cost Optimization Opportunities

| Opportunity | Savings Estimate | Effort | Risk |
|------------|-----------------|--------|------|
| Reserved capacity / Savings Plans | [$ or %] | [S/M/L] | [lock-in period] |
| Spot instances (batch workloads) | [$ or %] | [M/L] | [interruption tolerance] |
| Storage lifecycle policies | [$ or %] | [S] | [access pattern change] |
| Right-sizing compute | [$ or %] | [S/M] | [performance regression] |
| CDN cache optimization | [$ or %] | [S] | [cache invalidation complexity] |
| Log retention reduction | [$ or %] | [S] | [compliance requirements] |
| Dev environment scheduling | [$ or %] | [S/M] | [developer friction] |
| Model downgrade (AI) | [$ or %] | [S] | [quality degradation] |

------------------------------------------------------------------------

# 7. Sustainability & Runway

### Burn Rate Analysis (for startups / side projects)
-   **Current monthly burn** — total infrastructure + services cost
-   **Runway remaining** — months of operation at current burn rate
-   **Burn rate trend** — increasing, stable, or decreasing?
-   **Revenue offset** — if any revenue, net burn after offset

### Cost-to-Value Ratio
-   **Features per dollar** — is spending concentrated on user-facing value?
-   **Infrastructure vs product** — ratio of infra spend to product development time
-   **Marginal cost of next user** — what does adding one user actually cost?
-   **Break-even analysis** — at what user count does revenue cover infrastructure?

### Vendor Dependency & Lock-In

| Vendor | Services Used | Monthly Spend | Lock-In Risk | Migration Effort | Alternative |
|--------|-------------|--------------|-------------|-----------------|------------|
| [AWS/GCP/etc.] | [list] | $[amount] | [Low/Medium/High] | [S/M/L/XL] | [alternative provider] |
| [AI provider] | [model/service] | $[amount] | [Low/Medium/High] | [S/M/L] | [alternative model] |
| [SaaS vendor] | [service] | $[amount] | [Low/Medium/High] | [S/M/L] | [alternative or self-host] |

### Long-Term Sustainability
-   **Cost trajectory** — will costs grow slower, equal, or faster than users/revenue?
-   **Architecture efficiency** — does the architecture become more or less efficient at scale?
-   **Exit strategy** — can the project wind down gracefully without ongoing costs?
-   **Data portability** — can data be exported without vendor-specific tooling?

------------------------------------------------------------------------

# 8. Output Format

Structure the cost audit as follows:

### Executive Summary
-   **Cost health:** `CRITICAL / WASTEFUL / FAIR / EFFICIENT / OPTIMIZED`
-   **Monthly total cost:** $[amount]
-   **Budget compliance:** `WITHIN BUDGET / AT RISK / OVER BUDGET / NO BUDGET DEFINED`
-   **Top 3 cost risks**
-   **Quick wins** (immediate savings opportunities)

### Cost Dashboard
| Category | Monthly | % Total | Trend | Action |
|----------|---------|---------|-------|--------|
| [category] | $[amount] | [%] | [trend] | [action if needed] |

### Cost Scorecard
| Dimension | Score (1-5) | Key Finding |
|-----------|-------------|-------------|
| Infrastructure efficiency | [score] | [summary] |
| AI/LLM cost management | [score] | [summary] |
| Scaling economics | [score] | [summary] |
| Budget governance | [score] | [summary] |
| Vendor management | [score] | [summary] |
| Sustainability & runway | [score] | [summary] |

### Findings Table
| ID | Category | Title | Severity | Savings | Effort |
|----|----------|-------|----------|---------|--------|
| C-001 | [category] | [description] | Critical/High/Medium/Low | $[monthly savings] | [S/M/L] |

### Finding Detail (per finding)
-   **Description** — What the cost issue is
-   **Evidence** — Billing data, utilization metrics, pricing comparison
-   **Impact** — Monthly/annual cost if unaddressed
-   **Remediation** — Specific optimization with expected savings
-   **Trade-offs** — Performance, reliability, or DX impact of the optimization

### Optimization Roadmap
| Priority | Optimization | Category | Monthly Savings | Effort | Payback Period |
|----------|-------------|----------|----------------|--------|---------------|
| P0 | [action] | [infra/AI/vendor/governance] | $[amount] | [S/M/L] | [immediate/weeks/months] |

### 12-Month Cost Forecast
Projected costs under current trajectory vs optimized trajectory,
showing the cumulative impact of recommended changes.
