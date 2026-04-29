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
├── k6-baseline.js             — the scenarios (auth cold-path, farm hot-path, admin stats, me-activity fan-out, multi-crop fan-out)
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
#         COGNITO_CLIENT_ID, COGNITO_REGION
# (COGNITO_CLIENT_ID is the same value the frontend reads as
#  PUBLIC_COGNITO_CLIENT_ID — just drop the PUBLIC_ prefix.)

# Load env vars from .env into the shell, then run k6.
# k6 has no built-in --env-file flag; the set -a / source / set +a
# envelope auto-exports every assignment so k6 reads them via __ENV.
set -a; source .env; set +a

# Full baseline run (all five scenarios, ~5 min)
k6 run --summary-export=baseline-$(date +%Y%m%d).json k6-baseline.js

# Single scenario (faster iteration during tuning)
k6 run --tag scenario=hot-path k6-baseline.js
k6 run --tag scenario=multi-crop k6-baseline.js
```

> Quick smoke test before the full run: `k6 run --vus 1 --duration 5s
> k6-baseline.js` exits in ~5 seconds. If sign-in fails (missing var,
> wrong password), you see it immediately rather than after 90s.

## Target characteristics

- **Total runtime: under 10 minutes** for a full baseline run (five scenarios run in parallel, per R-010 acceptance).
- **Concurrency**: 3–10 virtual users per scenario for 60–120s — models "pilot + modest growth".
- **Thresholds** (encoded in the script as k6 `thresholds` — a run fails if any are breached):
  - p95 under 1s for hot-path reads (farm list, detail, beds).
  - p99 under 3s for cold-path auth (SignIn → /me/profile).
  - p95 under 5s for `/admin/stats` (scale-cliff target; #383 optimization will tighten this).
  - p95 under 1.5s for `/me/activity` (R5 fan-out regression watch, per `docs/TEST-STRATEGY-462.md` §6).
  - p95 under 1.5s for multi-crop reads (`/beds/:id/crops` listings; Wave E2 soak-window watch — see `docs/ops/RUNBOOK-WAVE-E-PROMOTE-LEGACY-CROPS.md`).
  - Request failure rate under 5%.

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
