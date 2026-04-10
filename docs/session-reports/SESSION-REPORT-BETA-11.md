# Session Report: Beta-11 (v0.47)

> Date: 2026-04-08
> Session: beta-11
> Tag: v0.46 → v0.47
> Tests: 771 → 773 (+2)
> Commits: 11

## Summary

Two major workstreams completed: **#329 seed-to-harvest tracking** and **#313 auth matrix review**. Also fixed a stale role cache bug and created 5 new issues for future sprints.

## Completed Work

### #329 — Seed-to-Harvest Tracking (Beta-10-post)

Added nursery duration data to the crop library so the seed/seedling toggle produces meaningfully different harvest estimates.

| Commit | Description |
|--------|-------------|
| `02db9a1` | Add `days_seed_to_seedling_min/max` for 37 crops — sourced from Takii, Sakata, JA, prefectural agricultural guides |
| `f26904a` | `estimateHarvestDate` accepts optional `PlantMethod` param — seed mode adds nursery days |
| `7c15172` | Extract `PlantMethod` type to shared domain, deduplicate radio handlers |
| `0d499fb` | Review remediation: `isNaN` date validation, consistent auto-fill |

**Impact:** Tomato from seed = 155 days (was 85). The 70-day nursery period is now accounted for.

### #331 — Smart-Default Harvest Fix

| Commit | Description |
|--------|-------------|
| `38aede4` | Remove `!expected_harvest` guard — changing crop now always recalculates |

**Root cause:** The guard prevented recalculation when editing a bed with an existing harvest date.

### #313 — Auth Matrix Review (Pre-PROD)

Full audit of every API endpoint and frontend component for role-based access control. Found 7 gaps, implemented 7 FRs.

| Commit | Description |
|--------|-------------|
| `7f06b66` | Requirements doc with full auth matrix |
| `a26b4e2` | Task breakdown: 5-batch implementation plan |
| `a3b9e46` | RBAC section added to ARCHITECTURE.md |
| `59a77ff` | Block admin role in POST /members |
| `afeb598` | Staff can upload images + tag health status |
| `491049c` | BedDetail split: `isCropReadOnly` vs media (all members) |
| `35061dd` | Role cache refresh for DiaryPage + DeviceListPage |
| `8ec8608` | Document diary-to-bed bridge auth bypass |
| `914a907` | Extract `isWriteRole()` + `refreshFarmRoleCache()` helpers |
| `1ae9d6b` | Graceful degradation: initialize from cached role |

**Key changes:**
- Staff can now upload images and tag bed health status (was restricted to admin/owner)
- POST `/members` blocks `admin` role assignment (system-assigned only)
- Role cache refresh on all 3 major pages (was only BedDetail)
- `isWriteRole()` centralizes the admin/owner check (was inline in 6+ places)

### Stale Role Cache Fix

| Commit | Description |
|--------|-------------|
| `a19f22c` | BedDetail refreshes farm role cache on mount — prevents stale read-only |

**Root cause:** `getLocalFarmRole()` read from localStorage which could be stale after role changes, migrations, or re-registration.

## Issues Created

| Issue | Title | Scope |
|-------|-------|-------|
| #331 | Smart-default harvest not recalculating | Closed (fixed) |
| #333 | BYOK approach for AI assistant enablement | Beta-12 |
| #334 | Capacity analysis and scalability review | Pre-PROD |
| #335 | Login page redesign with mascot pet animation | RC/GA |
| #337 | Tiered device classes (Class 1/2/3) | Beta-11 |

## Issues Closed

| Issue | Title |
|-------|-------|
| #329 | Seed-to-harvest tracking (Option 2) |
| #331 | Smart-default harvest fix |
| #313 | Auth matrix review |

## PRs Merged

| PR | Title | Base |
|----|-------|------|
| #332 | Seed-to-harvest tracking + smart-default fix | main |
| #336 | Refresh farm role cache on BedDetail load | main |

## Architecture Artifacts

| File | What |
|------|------|
| `docs/ARCHITECTURE-CROP-LIBRARY.md` | Section 7: data sources, nursery duration rationale |
| `docs/ARCHITECTURE.md` | Section 5: RBAC authorization matrix + design constraints |
| `docs/REQUIREMENTS-313.md` | Full auth audit with current/target permission matrix |
| `docs/TASK-BREAKDOWN-313.md` | 5-batch implementation plan for #313 |

## Test Health

```
  Metric      Start    End      Delta
──────────────────────────────────────
  Suites      36       36       —
  Tests       763      773      +10
  Pass rate   100%     100%     —
```

New tests: seed mode estimation (4), data validation (3), invalid date (1), staff upload (1), staff tag (1).

## Pipeline Discipline

Each workstream followed the full pipeline:
- `/cc-implement` → `/simplify` → `/cc-review` → `/cc-remediate`

Review findings addressed:
- #329: 3 SHOULD-FIX (date validation, consistent auto-fill, stale docs)
- #313: 2 SHOULD-FIX (graceful degradation for canWrite/canEdit)
- /simplify: 2 ISSUE (role cache dedup, isWriteRole helper)

## What's Next

| Priority | Item | Scope |
|----------|------|-------|
| 1 | Deploy v0.47 to staging | ops |
| 2 | #337 Device tier design | Beta-11 |
| 3 | #240 install.sh URL | Beta-11 |
| 4 | #281 + #334 Pricing + capacity | Pre-PROD |
