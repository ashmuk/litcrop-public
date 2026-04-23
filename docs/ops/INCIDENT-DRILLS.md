# Incident Tabletop Drills — LitCrop

> Created: 2026-04-23 | Audit finding: R-011 (#448)
> Cadence: Quarterly | Participants: 2–4 | Duration: 60–90 min

---

## Purpose

Tabletop drills rehearse incident response *before* a real incident forces the rehearsal. Each drill picks one runbook from [`../RUNBOOKS.md`](../RUNBOOKS.md), walks through it verbally, and surfaces gaps — stale commands, missing credentials, ambiguous ownership, broken dashboards.

The drill does **not** produce a real outage. It produces a **drill log** (template below) recording gaps found and fixes scheduled.

---

## Cadence

One drill per calendar quarter:

| Quarter | Target window                      | Scenario source     |
|---------|------------------------------------|---------------------|
| Q1      | Jan–Mar, within 1st week of Feb   | Rotate from catalog |
| Q2      | Apr–Jun, within 1st week of May   | Rotate from catalog |
| Q3      | Jul–Sep, within 1st week of Aug   | Rotate from catalog |
| Q4      | Oct–Dec, within 1st week of Nov   | Rotate from catalog |

Schedule the next drill at the end of the current one — close the loop before the calendar slips.

---

## Roles

| Role         | Count | Responsibility                                                     |
|--------------|-------|--------------------------------------------------------------------|
| Facilitator  | 1     | Drives the scenario, injects new facts, enforces timebox           |
| Scribe       | 1     | Records decisions, timings, and gaps into the drill log            |
| Responder(s) | 1–2   | Executes the runbook steps verbally (no real commands are run)     |
| Observer     | 0–1   | Silent; checks that the runbook is being followed as written       |

If the team is only 2 people, the scribe also observes.

---

## Scenario Catalog

Each scenario maps to an existing runbook in [`../RUNBOOKS.md`](../RUNBOOKS.md). Rotate so every runbook sees a drill at least once every 24 months.

| Scenario                                      | Runbook                                                                   | Facilitator injection                                     |
|-----------------------------------------------|---------------------------------------------------------------------------|-----------------------------------------------------------|
| API Lambda errors spike to 10/min             | [Runbook 1](../RUNBOOKS.md#1-lambda-error-alarm)                          | `Cannot find module` after a deploy                       |
| API Gateway 5xx on all routes                 | [Runbook 2](../RUNBOOKS.md#2-api-gateway-5xx-alarm)                       | 502 storm starting 10 min after a merge                   |
| DynamoDB throttle during admin report         | [Runbook 3](../RUNBOOKS.md#3-dynamodb-throttle-alarm)                     | `getStats` scan hit at morning traffic peak               |
| Chat AI global budget exhausted 2 h early     | [Runbook 4](../RUNBOOKS.md#4-chat-ai-budget-exceeded)                     | Single user suspected of scripted queries                 |
| Bad Lambda deploy needs rollback              | [Runbook 5](../RUNBOOKS.md#5-deployment-rollback-lambda-alias)            | Smoke test fails; pilot user reports outage               |
| CloudFront serves stale `index.html`          | [Runbook 6](../RUNBOOKS.md#6-cloudfront-cache-invalidation)               | Users see pre-patch version after CVE deploy              |
| Uploaded image yields no thumbnail            | [Runbook 7](../RUNBOOKS.md#7-s3-image-upload-failure)                     | Thumb Lambda OOM on a 12 MP capture                       |
| Pilot user locked out of Cognito              | [Runbook 8](../RUNBOOKS.md#8-cognito-user-issues)                         | `FORCE_CHANGE_PASSWORD` state from an admin reset         |

**Stretch scenario (every 4th drill):** Cascading failure — DynamoDB throttle → Lambda timeout → API 5xx. Exercises Runbooks 1 + 2 + 3 together.

---

## Pre-Drill Checklist

- [ ] Scenario picked from the rotation catalog
- [ ] Facilitator has re-read the target runbook within the last 24 h
- [ ] Meeting scheduled on calendar; title includes **"TABLETOP — no real impact"**
- [ ] `RUNBOOKS.md` opened in a tab, not printed (commands may have drifted)
- [ ] Scribe has the drill-log template (below) ready in a fresh doc
- [ ] AWS consoles accessible in read-only mode (optional; helps validate commands)

---

## Post-Drill Checklist

- [ ] Drill log written and committed under `docs/ops/drill-logs/YYYY-QN-<slug>.md`
- [ ] Gaps triaged — each becomes a GitHub issue or is explicitly deferred with a reason
- [ ] If any runbook command was wrong, a PR updating `RUNBOOKS.md` is opened that same week
- [ ] Next quarter's drill scheduled on the calendar with its scenario picked
- [ ] Retrospective captured: one thing that worked, one thing to change next time

---

## Drill Log Template

Copy into a new file at `docs/ops/drill-logs/YYYY-QN-<slug>.md`:

```markdown
# Tabletop Drill — YYYY QN — <scenario slug>

> Date: YYYY-MM-DD | Facilitator: <name> | Scribe: <name>
> Runbook: Runbook N — <name> | Duration: NN min

## Scenario

<1–2 sentences on what the facilitator injected>

## Timeline

| Time (mm:ss) | Event                                |
|--------------|--------------------------------------|
| 00:00        | Alarm fires; responder paged         |
| ...          | ...                                  |

## Gaps Found

| # | Gap | Severity    | Proposed fix | Tracked as        |
|---|-----|-------------|--------------|-------------------|
| 1 | ... | low/med/high| ...          | #NNN or deferred  |

## What Worked

- ...

## What to Change Next Time

- ...

## Next Drill

- Quarter: YYYY QN+1
- Scenario: ...
- Scheduled: YYYY-MM-DD
```

---

## Related

- [`../RUNBOOKS.md`](../RUNBOOKS.md) — source of truth for runbook procedures exercised here
- [`SES-PRODUCTION-ACCESS.md`](SES-PRODUCTION-ACCESS.md) — adjacent ops doc
- Audit origin: R-011 in the v0.99.6 pre-production audit (issue #448)
