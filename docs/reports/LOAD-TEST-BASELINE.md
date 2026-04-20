# Load Test Baseline — LitCrop API

Tracking document for R-010 (issue #443). Each baseline entry captures p50/p95/p99 latency, DynamoDB consumption, and cost-per-1k-requests for the three scenarios in `tools/load-test/k6-baseline.js`.

**Status:** Harness scaffolded 2026-04-20 (#443); **no empirical baseline captured yet**. First run scheduled against staging after next deploy.

## How to update this file

After each baseline run:

```bash
cd tools/load-test
k6 run --env-file .env --summary-export=baseline-$(date +%Y%m%d).json k6-baseline.js
```

Then paste the summary stats into a new section below following the template.

## Template (copy this for each run)

```markdown
## Baseline — YYYY-MM-DD — vX.YY.Z @ <git-sha>

- **Duration**: <total minutes>
- **Concurrency**: cold-path 5 VUs / hot-path 10 VUs / admin-stats 3 VUs
- **Commit under test**: `<sha>` (`<branch>`)

### Latency

| Scenario     | p50 | p95 | p99 | Fail % |
|--------------|-----|-----|-----|--------|
| Cold-path    |     |     |     |        |
| Hot-path     |     |     |     |        |
| Admin stats  |     |     |     |        |

### DynamoDB consumption (from CloudWatch, peak 1-minute)

| Table         | Peak RCU | Peak WCU | Throttles |
|---------------|----------|----------|-----------|
| litcrop-main  |          |          |           |

### Cost slice (from Cost Explorer, the hour of the run)

| Service       | Cost (USD) | Notes |
|---------------|------------|-------|
| Lambda        |            |       |
| API Gateway   |            |       |
| DynamoDB      |            |       |
| Cognito       |            |       |
| **Total**     |            | per 1000 requests → $___ |

### Observations

- <e.g. getStats p95 = 3.2s, consistent with #383 scale-cliff hypothesis>
- <e.g. cold-path p99 dominated by Cognito SignIn: 2.1s of 3.0s>
- <e.g. hot-path CPU-bound in Lambda; bumping memory from 256MB to 512MB improved p95 by 40%>

### Next actions triggered

- <ticket reference if this run triggered an optimization issue>
```

---

## Baselines

<!-- Insert completed baseline sections above this comment, newest first. -->

_No baseline runs captured yet. First run after R-010 PR merges and staging deploy completes._

## Trend tracking

Once 3+ baselines exist, plot:
- p95 of each scenario over time (sparkline per scenario)
- Cost per 1000 requests over time
- Peak RCU/WCU over time

A Grafana dashboard may be appropriate here once the data volume justifies it.
