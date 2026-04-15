# Session Report — v0.98

> **Date:** 2026-04-15
> **Session:** pre-prod-097-2 (continued)
> **Branch:** develop
> **Tag:** v0.98
> **Prior version:** v0.97 — see `SESSION-REPORT-395-phase-0.md` and
> `SESSION-REPORT-v0.94-v0.96.md`

---

## Executive Summary

Closes the install-hardening and IAM-least-privilege threads that were
opened but not completed during the v0.97 device-integration refinement.
Four commits spanning two independent PRs-by-scope:

- **#404 + #405** install-hardening mini-PR — `install.sh` now accepts
  `--branch` so staging-served installs stay in sync, and auto-detects
  hardware via sysfs + `command -v cgsensor` so scp-workaround installs
  correctly classify Class-2/3 devices instead of defaulting to Class-1.
- **#397** IAM post-provisioning tightening — API Gateway narrowed from
  `/*` to `/restapis*` + `/apis*`, CloudFront reduced to read-only + cache
  invalidation, `iam:CreateRole` removed, all with a new vitest regression
  suite.

Two MUST-FIX security bugs were caught by `/cc-review` during the session
(path-traversal RCE via `--branch`, override prompt silently downgrading
hardware flags) and remediated before any external exposure.

---

## Issues Closed: 3

| Issue | Title | Type |
|-------|-------|------|
| #404  | `chore(device-install): branch-aware capture.sh download in install.sh` | feature |
| #405  | `bug(device-install): non-interactive install.sh silently defaults to Class-1 even on Class-2/3 hardware` | bug |
| #397  | `chore(security): post-provisioning IAM tightening per ADR-20260317` | security |

---

## Commits: 4

```
e1628af fix(iam): positive-action guards + domainnames doc (#397 review)
5ec1d8c chore(security): post-provisioning IAM tightening per ADR-20260317 (#397)
190255d fix(device-install): MUST-FIX RCE in --branch, preserve override default (#404/#405 review)
e394add chore(device-install): branch-aware download + hardware auto-detect (#404 #405)
```

---

## Pipeline Discipline

Both mini-PRs ran the full pipeline: implement → `/cc-review` → remediate.

| PR | Review outcome | Remediation commit |
|----|---------------|--------------------|
| #404 + #405 | **2 MUST-FIX** (RCE via path-traversal `--branch` injection; silent hardware-flag downgrade when user hits Enter at override prompts) + 3 SHOULD-FIX | 190255d (+8 regression tests) |
| #397 | 0 MUST-FIX, 5 SHOULD-FIX (missing positive-action asserts, missing destructive-wildcard guard, `cloudformation:*` escape, `/domainnames` limitation not documented, `deploy-frontend.sh` comment stale) | e1628af (+2 regression tests) |

### Critical finding — #404 --branch RCE

The initial `--branch=<name>` flag interpolated unvalidated user input
into the `raw.githubusercontent.com` URL. A path-traversal value like
`../../mallory/evil-repo/main` would — after curl's client-side path
normalization — resolve to a different GitHub owner and repo. The
returned `capture.sh` would then be `chmod 700` and cron'd as the Pi
user: full remote code execution with cron persistence.

Fix: whitelist validation `case "$BRANCH" in *..*|/*|*/|*[!a-zA-Z0-9._/-]*) exit 2 ;; esac`
plus an explicit catch-all in the flag-parse loop so that unknown args
like `--branche=develop` (typo) exit 2 instead of silently falling back
to `main`. Legitimate `feature/xyz` branch names still accepted.

5 bats regression tests cover: parent-dir traversal, absolute-path
(`/etc/passwd`), shell-metachar injection, empty value, and the typo
silent-fallback case.

---

## Tests

| Suite | v0.97 | v0.98 | Delta |
|-------|-------|-------|-------|
| vitest  | 865 | 883 | +18 |
| bats    | 30 (+1 skip) | 45 (+1 skip) | +15 |
| Astro build | clean | clean | — |

New test files:
- `src/api/src/__tests__/iam-policy.test.ts` — 13 cases covering wildcard
  rejection, destructive-action absence, positive-assertion set for
  retained actions, and scoping invariants across both POC and prod-least
  policies.
- `scripts/camera-node/__tests__/install-hardening.bats` — 15 cases
  covering `--branch` validation, hardware auto-detection, override
  semantics, `crontab`-missing path, and the final-banner scheduler-status
  warning.

---

## ADR Updated

`docs/decisions/ADR-20260317-iam-least-privilege.md` — added `Applied
Changelog` section documenting the three post-provisioning items applied
by #397, including the `/domainnames` scoping limitation (does not affect
#238 custom-domain work since that runs under the CDK deploy principal).

---

## Open Items Carried to v0.99+

- **T-395-05 EC-2 / EC-4 / Test-Shot** — blocked on physical Pi access.
  EC-1 (resolution) and EC-3 (interval) confirmed on staging during v0.97;
  the remaining three need on-Pi verification before #395 Phase 0 can be
  declared fully closed.
- **#395 Phase 1** (T-395-N1-01 through T-395-N1-08) — systemd timers,
  maybe_sleep, full install.sh rewrite. Blocked on Phase 0 being Pi-verified.
- **develop → main promotion** — production still on v0.93. Four tags
  (v0.94, v0.95, v0.96, v0.97 plus v0.98 now) sit on develop. Promotion
  blocked on Phase 0 Pi verification since v0.97 shipped Phase 0.

---

## Operational Notes

- v0.97 tag was force-pushed **4 times** during the parent session as the
  scope grew (Phase 0 → +cc-test gaps → +#406 → +What's New bump).
  v0.98 is a clean single-move tag with no force-push pressure.
- Production still trails by 5 tags. Consider a grouped develop→main PR
  once T-395-05 completes.
- AWS cost: unchanged from v0.97 (no infra edits in this session).

---

## Related

- `SESSION-REPORT-395-phase-0.md` — parent (v0.97, T-395-05 partial)
- `SESSION-REPORT-v0.94-v0.96.md` — consolidated backfill before v0.97
- `ADR-20260317-iam-least-privilege.md` — updated by #397
- `docs/DESIGNS-395.md` — still the source of truth for Phase 1 when Pi access returns
