# Review Findings: P0 Observability Fixes (#256)

> Reviewed: 2026-04-12 | Reviewer: my-reviewer agent | Scope: F-01, F-02, F-03, F-38, M-04

## Verdict: APPROVED (0 MUST-FIX)

| Severity | Count |
|----------|-------|
| MUST-FIX | 0 |
| SHOULD-FIX | 2 (both resolved inline) |
| SUGGESTION | 3 |

## SHOULD-FIX (Resolved)

1. **CDK-Nag APIG1 suppression verification** — Confirmed via `cdk synth`: suppression active, no warnings.
2. **Production migration documentation** — Added to `docs/PRE-PROD-AUDIT.md` and commented on #239.

## SUGGESTIONS (Deferred)

1. **Logs bucket DESTROY policy** — Acceptable for MVP; flag for production graduation (change to RETAIN).
2. **Hardcoded bucket names** — Pre-existing pattern across all resources. Parameterization tracked in #239.
3. **API GW log group DESTROY policy** — Same as S1; acceptable for MVP.

## Simplification Applied

- Removed empty `caller`/`user` IAM-auth fields from API GW log format (HTTP API v2 always returns empty)
- Renamed `resourcePath` to `routeKey` (correct HTTP API v2 terminology)

## Security

- No new attack surface. Logs are telemetry only.
- No auth tokens or request bodies in log formats.
- `errorMessage` field may contain internal errors — acceptable for MVP debugging.
