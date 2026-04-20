# Load Testing — LitCrop API

Baseline and regression harness for LitCrop's API surface, per R-010 audit finding.

## Why

4 pilot users don't exercise scale — the first sign of a perf or cost regression is the AWS bill.  This harness exists so that:

1. Every perf-targeting change (e.g. #383 getStats optimization) has a **before/after baseline** it can point at.
2. Scaling incidents have a **repeatable reproduction** — run the script and read the numbers.
3. CI (future) can run a lightweight subset on PRs to flag regressions earlier than production monitoring.

## What's in here

```
tools/load-test/
├── README.md                  — this file
├── k6-baseline.js             — the scenarios (auth cold-path, farm hot-path, admin stats)
└── .env.example               — environment variables the script reads
```

## Prerequisites

- [k6](https://k6.io/) installed locally (`brew install k6` on macOS, `apt install k6` on Debian-based)
- A test user account on staging with a known-good password
- The staging API base URL
- For the admin-stats scenario: an admin account (or the same account with `custom:admin` claim)

## Running against staging

```bash
cd tools/load-test
cp .env.example .env
# Fill in: STAGING_API_BASE_URL, TEST_USER_EMAIL, TEST_USER_PASSWORD,
#         COGNITO_CLIENT_ID, COGNITO_USER_POOL_ID

# Full baseline run (all three scenarios, ~5 min)
k6 run --env-file .env k6-baseline.js

# Single scenario (faster iteration during tuning)
k6 run --env-file .env --tag scenario=hot-path k6-baseline.js
```

## Target characteristics

- **Total runtime: under 5 minutes** for a full baseline run (per R-010 acceptance).
- **Concurrency**: 10 virtual users sustained for 2 minutes per scenario — models "pilot + modest growth".
- **Thresholds**:
  - p95 latency under 1s for hot-path reads (farm list, bed listing).
  - p99 under 3s for cold-path auth (SignUp → SignIn → /me/profile).
  - p95 under 5s for getStats (scale-cliff target; #383 optimization will tighten this).

## Baseline snapshots

Recorded baseline runs live in [`docs/reports/LOAD-TEST-BASELINE.md`](../../docs/reports/LOAD-TEST-BASELINE.md).  Each baseline captures:

- Date of the run
- Version/commit against which the run was taken
- p50/p95/p99 latencies per scenario
- DynamoDB RCU/WCU peak consumption (from CloudWatch)
- Cost per 1000 requests (derived from the Cost Explorer slice of the hour)

When to cut a new baseline:
- Before and after any endpoint tagged `type:refactor` touching the data access layer.
- Before and after any `area:infra` change that affects Lambda memory / provisioned concurrency / DynamoDB capacity.
- Monthly, regardless, to track drift.

## Pairs with

- [#383 (R-009)](https://github.com/ashmuk/litcrop/issues/383) — getStats optimization; uses this harness for the before/after quantification.
- [#384 (F-27)](https://github.com/ashmuk/litcrop/issues/384) — DynamoDB DAX / materialized aggregation; same.
- [#381 (F-25)](https://github.com/ashmuk/litcrop/issues/381) — per-user rate limiting; this harness validates the limit doesn't misfire under pilot load.
