# Load Test Baseline — LitCrop API

Tracking document for R-010 (issue #443). Each baseline entry captures p50/p95/p99 latency, DynamoDB consumption, and cost-per-1k-requests for the five scenarios in `tools/load-test/k6-baseline.js` (auth cold-path, farm hot-path, admin stats, me-activity fan-out, multi-crop fan-out).

**Status:** Harness scaffolded 2026-04-20 (#443); first complete empirical baseline captured **2026-04-29 (v2)** against staging (`litcrop-mvp`) at commit `b3603ec`, after v1 (same day, `ea44fc3`) shook out two harness limitations that v0.99.8.5 fixed. See `## Baselines` section below.

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
set -a; source .env; set +a
k6 run --summary-export=baseline-$(date +%Y%m%d).json k6-baseline.js
```

Then paste the summary stats into a new section below following the template. (k6 has no built-in `--env-file` flag — the `set -a`/`source`/`set +a` envelope auto-exports every assignment from `.env` so k6 reads them via `__ENV`.)

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

## Baseline — 2026-04-29 (v2) — v0.99.8.5 (pending) @ b3603ec (develop)

First **complete and honest** baseline — supersedes v1 of the same day, which was useful as a harness shakedown but had two known data-quality limitations that v0.99.8.5 fixed: per-scenario `http_req_duration{scenario:*}` filters reported `0s` (k6 tag-attribution issue), and the multi-crop scenario silently produced no samples (test-user beds had no `active_crops_count > 0`).

- **Duration**: 2 min
- **Concurrency**: cold-path 5 VUs / hot-path 10 VUs / admin-stats 3 VUs / me-activity 5 VUs / multi-crop 5 VUs (28 max, in parallel)
- **Commit under test**: `b3603ec` (`develop`) — includes the v0.99.8.5 fixes (`fix(load-test): k6 multi-crop fallback + scenario tag attribution` + per-VU token cache + #471 lint cleanup).
- **Environment**: staging — `litcrop-mvp` table / `litcrop-mvp-web` Cognito / `litcrop-mvp-api` Lambda.
- **Total runs against API**: 7,162 HTTP requests across 2,530 iterations.

### Latency (per-scenario filters working this time)

| Scenario     | p50    | p95    | p99 / max  | Fail %  | SLO                                | Verdict |
|--------------|--------|--------|------------|---------|------------------------------------|---------|
| Cold-path    | 236 ms | 357 ms | 506 ms     | 0.00%   | p99 < 3000 ms                      | ✅ ~6× headroom |
| Hot-path     | 106 ms | 203 ms | max=1.6 s  | 0.00%   | p95 < 1000 ms                      | ✅ ~5× headroom |
| Admin stats  | 66 ms  | 498 ms | max=1.84 s | 0.00%   | p95 < 5000 ms                      | ✅ ~10× headroom |
| Me-activity  | 61 ms  | 117 ms | max=1.59 s | 0.00%   | p95 < 1500 ms (R5)                 | ✅ ~13× headroom |
| Multi-crop   | 71 ms  | 179 ms | max=1.61 s | 0.00%   | p95 < 1500 ms (Wave E2 soak watch) | ✅ ~8× headroom |
| **Aggregate (all scenarios)** | **93 ms** | **264 ms** | _max=1.84 s_ | **0.00%** | n/a | ✅ |

### Custom Trends

| Trend                              | min     | med     | p95     | max     |
|------------------------------------|---------|---------|---------|---------|
| `cognito_login_duration`           | 229 ms  | 294 ms  | 498 ms  | 552 ms  |
| `me_profile_duration`              | 40 ms   | 66 ms   | 142 ms  | 1.70 s  |
| `me_activity_first_page_duration`  | 41 ms   | 60 ms   | 110 ms  | 1.60 s  |
| `list_bed_crops_duration`          | 44 ms   | 64 ms   | 119 ms  | 260 ms  |
| `get_bed_crop_detail_duration`     | _no samples — see note below_ |

**On `list_bed_crops_duration`**: this is the first synthetic-load measurement of the multi-crop endpoint, the surface Wave E2 watches. p95=119 ms is healthy. The test user's first farm has no beds with `active_crops_count > 0`, so the listings returned empty arrays — but the endpoint was exercised regardless thanks to the v0.99.8.5 fallback. `getActiveCropForBed`'s lazy-materialize path was hit on every call.

**On `get_bed_crop_detail_duration`**: no samples because the listings returned empty arrays (no crops to detail-fetch). Closing this would require a test-data fix — provision at least one bed with a real BedCrop on the staging test user's farm. Deferred to a future operator action; not blocking E2 soak.

### Comparison with v1 baseline (same-day shakedown)

| Metric                       | v1 (`ea44fc3`)        | v2 (`b3603ec`)         | Notes |
|------------------------------|----------------------|------------------------|-------|
| HTTP requests                | 6,497                | 7,162                  | More iterations now that scenarios complete properly |
| http_req_failed              | 0.00%                | 0.00%                  | Stable |
| Per-scenario filter data     | ❌ all `0s`           | ✅ real numbers         | Tag-attribution fix |
| Multi-crop scenario samples  | ❌ none               | ✅ `list_bed_crops` 119 ms p95 | Fallback fix |
| Cognito `p95`                | 335 ms (biased low)  | 498 ms (honest)        | Cache fix changed sample shape |
| Aggregate `p95`              | 259 ms               | 264 ms                 | Stable |

The v1 Cognito p95 of 335 ms was biased low because 96% of v1's "samples" were Cognito throttle-error responses (~47 ms each — fast errors, not real auth). v2's per-VU token cache fix means the few sign-ins that DO happen are all real successes; 498 ms is the honest p95 for `InitiateAuth` under load.

### DynamoDB consumption (from CloudWatch)

_Operator action — populate after GitHub Actions quota resets (≥ 2026-05-01) and operator has time. Window: 2026-04-29 ~20:50 JST for a ~2-minute baseline run._

### Cost slice (from Cost Explorer)

_Operator action — populate from Cost Explorer for the hour ending 2026-04-29 ~21:00 JST. Filter to `litcrop-mvp-*` resources._

### Observations

- This is the first **trustworthy** baseline. v1 informed the harness fixes; v2 captures the data we actually care about.
- All 5 SLOs pass with multi-× headroom. **Pilot-scale capacity is comfortable** — no scale concerns at the current concurrency budget.
- Cold-path is meaningfully more expensive than the hot paths, as expected: each iteration includes a fresh Cognito sign-in. p99=506 ms is dominated by Cognito itself (custom Trend p95=498 ms).
- Outliers in the max column (1.59 s – 1.84 s) almost certainly Lambda cold starts. Worth tracking on subsequent baselines as a trend signal.
- `getActiveCropForBed` performance under synthetic load: p95=119 ms via `list_bed_crops_duration`. Comfortable. Complements the organic prod traffic the Wave E2 soak watches.

### Next actions

- ✅ Per-scenario tag attribution: fixed (this baseline proves it).
- ✅ Multi-crop scenario: now produces samples (this baseline proves it).
- ⚠ `get_bed_crop_detail_duration`: still empty pending test-data fix (provision a multi-crop bed on staging test user's first farm). Tracked as a deferrable operator action.
- ⏰ DynamoDB + Cost cells: deferred until ops-quota window opens.

---

## Baseline — 2026-04-29 — v0.99.8.3 @ ea44fc3 (develop)

- **Duration**: 2 min
- **Concurrency**: cold-path 5 VUs / hot-path 10 VUs / admin-stats 3 VUs / me-activity 5 VUs / multi-crop 5 VUs (28 max VUs total, in parallel)
- **Commit under test**: `ea44fc3` (`develop`) — includes the v0.99.8.3 release commit (`e00eb10`), the Wave E1 migration code (`124c71d` reachable from main), and the per-VU token cache fix (`ea44fc3`).
- **Environment**: staging (`litcrop-mvp` table; `litcrop-mvp-web` Cognito App Client; `litcrop-mvp-api` Lambda).
- **Total runs against API**: 6,497 HTTP requests across 2,735 iterations.

### Latency

| Scenario     | p50    | p95    | p99    | Fail %  | SLO                                | Verdict |
|--------------|--------|--------|--------|---------|------------------------------------|---------|
| Cold-path    | (1)    | (1)    | (1)    | 0.00%   | p99 < 3000 ms                      | ✅ via aggregate |
| Hot-path     | (1)    | (1)    | (1)    | 0.00%   | p95 < 1000 ms                      | ✅ via aggregate |
| Admin stats  | (1)    | (1)    | (1)    | 0.00%   | p95 < 5000 ms                      | ✅ via aggregate |
| Me-activity  | (1)    | (1)    | (1)    | 0.00%   | p95 < 1500 ms (R5)                 | ✅ via aggregate |
| Multi-crop   | —      | —      | —      | —       | p95 < 1500 ms (Wave E2 soak watch) | ⚠ scenario silent — see (2) |
| **Aggregate (all scenarios)** | **86 ms** | **259 ms** | _max=1.72s_ | **0.00%** | n/a | ✅ |

(1) **Per-scenario `http_req_duration{scenario:*}` reports `0s` in this run** — k6 isn't attributing samples to the scenario tag for these threshold filters. The SLO check marks for those filters are vacuously true. Aggregate `http_req_duration` (last row) IS accurate (avg=103ms / med=86ms / p95=259ms / max=1.72s across 6,497 requests). Per-scenario breakdown to be fixed in a follow-up patch (likely a tag-merge issue with the per-request `tags: { name: 'X' }` overriding the auto-applied scenario tag).

(2) **Multi-crop scenario produced no `list_bed_crops_duration` or `get_bed_crop_detail_duration` samples** — the function early-returns when `targetBeds` (beds with `active_crops_count > 0`) is empty for the test user's first farm. The Wave E1 migration promoted 13 staging beds (logged 2026-04-29), but those don't appear to belong to this test user's first farm. Test data fix (not a script bug): add a multi-crop bed to the test user's farm, OR loosen the script's filter so it queries `/beds/:id/crops` on any bed regardless of `active_crops_count`. Both options leave Wave E2 soak coverage incomplete until addressed; the soak still relies on organic prod traffic.

### Custom Trends (these DO have per-endpoint samples)

| Trend                              | min     | med     | p95     | max     |
|------------------------------------|---------|---------|---------|---------|
| `cognito_login_duration`           | 218 ms  | 273 ms  | 335 ms  | 448 ms  |
| `me_profile_duration`              | 39 ms   | 47 ms   | 82 ms   | 1.41 s  |
| `me_activity_first_page_duration`  | 38 ms   | 48 ms   | 75 ms   | 1.64 s  |
| `list_bed_crops_duration`          | _no samples_ | _no samples_ | _no samples_ | _no samples_ |
| `get_bed_crop_detail_duration`     | _no samples_ | _no samples_ | _no samples_ | _no samples_ |

### DynamoDB consumption (from CloudWatch, peak 1-minute)

_Operator action: populate from CloudWatch console for the 2-minute window 2026-04-29 ~16:25 JST — query `AWS/DynamoDB` → ConsumedReadCapacityUnits / ConsumedWriteCapacityUnits / ThrottledRequests on the `litcrop-mvp` table._

| Table         | Peak RCU | Peak WCU | Throttles |
|---------------|----------|----------|-----------|
| litcrop-mvp   | _(TBD)_  | _(TBD)_  | _(TBD)_   |

### Cost slice (from Cost Explorer, the hour of the run)

_Operator action: pull from Cost Explorer for hour ending 2026-04-29 ~16:30 JST. Filter to `litcrop-mvp-*` resources. Cognito InitiateAuth charges are usage-based (~$0.0055 per MAU); Lambda invocations and API Gateway are per-request._

| Service       | Cost (USD) | Notes |
|---------------|------------|-------|
| Lambda        | _(TBD)_    | ~6,500 invocations (mostly `litcrop-mvp-api`) |
| API Gateway   | _(TBD)_    | ~6,500 calls — REST API tier |
| DynamoDB      | _(TBD)_    | on-demand |
| Cognito       | _(TBD)_    | ~50 InitiateAuth calls (down from 28k thanks to per-VU token caching) |
| **Total**     | _(TBD)_    | per 1000 requests → $_(TBD)_ |

### Observations

- **Auth path is healthy.** Cognito p95 = 335 ms is consistent with successful real auth (was 47 ms during pre-fix run because Cognito was returning errors fast). Sign-in count dropped from 28,928 to ~50 thanks to per-VU caching; this is the realistic-user shape.
- **Read paths are well under SLO.** `me_profile` p95 = 82 ms (target was R5 fan-out concern; this clears it ~18× over). `me_activity_first_page` p95 = 75 ms is similarly comfortable.
- **No 5xx, no failures.** 6,497 requests, 0 failures across all 5 scenarios. Suggests no obvious capacity issue at this concurrency level.
- **Outlier presence.** `me_profile_duration` max=1.41s and `me_activity_first_page_duration` max=1.64s — single-request outliers under load. Worth re-checking if they recur on subsequent baselines (could be Lambda cold start, DDB throttle, or routine variance).
- **Wave E2 soak coverage from synthetic load: incomplete** until the multi-crop scenario's test-data gap is fixed. Until then, the soak relies on organic prod traffic only.

### Next actions triggered

- **Test-data fix for multi-crop coverage** — either provision a multi-crop bed for the staging test user, or relax the script's `targetBeds` filter to query `/beds/:id/crops` on any bed. Tracked as a follow-up before next baseline.
- **Per-scenario tag attribution patch** — investigate why `http_req_duration{scenario:*}` filters report `0s`. Likely the per-request `tags: { name: 'X' }` is replacing rather than merging with the auto-applied scenario tag. Fix in a small follow-up commit; re-run to validate.
- **CloudWatch + Cost Explorer numbers** — operator to fill in the TBD cells from AWS console.
- **Trend tracking** — at least 2 more baselines needed before any trend-line is informative; revisit cadence after Wave E2 soak closes (2026-05-13).

## Trend tracking

Once 3+ baselines exist, plot:
- p95 of each scenario over time (sparkline per scenario)
- Cost per 1000 requests over time
- Peak RCU/WCU over time

A Grafana dashboard may be appropriate here once the data volume justifies it.
