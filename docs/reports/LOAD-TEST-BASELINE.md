# Load Test Baseline — LitCrop API

Tracking document for R-010 (issue #443). Each baseline entry captures p50/p95/p99 latency, DynamoDB consumption, and cost-per-1k-requests for the five scenarios in `tools/load-test/k6-baseline.js` (auth cold-path, farm hot-path, admin stats, me-activity fan-out, multi-crop fan-out).

**Status:** Harness scaffolded 2026-04-20 (#443); **no empirical baseline captured yet**. First run scheduled against staging after next deploy.

## Pre-run checklist

Before running the harness against staging, confirm:

- [ ] `k6` binary is installed locally (`brew install k6` / `apt install k6`).
- [ ] `tools/load-test/.env` is filled in from `.env.example` (staging API URL, Cognito client ID, region, and a pre-created test user).
- [ ] The staging deploy under test is live and healthy (check CloudWatch alarm state and the staging deploy's last-good commit SHA).
- [ ] The test user has at least one farm with beds + images so the hot-path and me-activity scenarios return non-empty data. Ideally at least one bed has `active_crops_count > 0` (e.g. a real BedCrop or a legacy single-crop bed promoted by the Wave E1 migration on 2026-04-29) so the multi-crop fan-out scenario returns non-empty data.
- [ ] You are OK with ~10 minutes of sustained synthetic load against staging (see scenario concurrency below).
- [ ] (Optional) `ADMIN_ID_TOKEN` is exported if you want the admin-stats scenario to run against a real admin user; otherwise it falls back to the test user and will 403, which is still a valid latency sample.

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
- **Concurrency**: cold-path 5 VUs / hot-path 10 VUs / admin-stats 3 VUs / me-activity 5 VUs
- **Commit under test**: `<sha>` (`<branch>`)

### Latency

| Scenario     | p50 | p95 | p99 | Fail % | SLO                                |
|--------------|-----|-----|-----|--------|------------------------------------|
| Cold-path    |     |     |     |        | p99 < 3000 ms                      |
| Hot-path     |     |     |     |        | p95 < 1000 ms                      |
| Admin stats  |     |     |     |        | p95 < 5000 ms                      |
| Me-activity  |     |     |     |        | p95 < 1500 ms (R5)                 |
| Multi-crop   |     |     |     |        | p95 < 1500 ms (Wave E2 soak watch) |

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
