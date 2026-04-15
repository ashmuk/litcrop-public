# ADR-20260415: Staging Access Model — Application-Layer Gate Only

## Status
Accepted (2026-04-15)

## Context

LitCrop staging is hosted at `https://dpj8a3mk3tzkq.cloudfront.net/` and auto-deploys from every push to `develop`. The distribution is env-separated from production per `#239` and `#372` — separate CDK stack, DynamoDB tables, S3 buckets, API Gateway, and IAM role set. No staging data reaches production systems.

Current access controls at staging:

| Layer | Gate |
|---|---|
| CloudFront (edge) | None — distribution is publicly reachable |
| SPA registration | Client-side invitation code `LITCROP2026` (`#398`) |
| SPA account creation | SES email verification + free plan cap = 2 farms (`#399`) |
| SPA login | Cognito + session cookie |
| Device registration | Requires logged-in account |
| Staging API | Device JWT issued only to registered devices |
| Staging data | Env-separated from prod — zero cross-env blast radius |

### Question

Should staging add an additional access control at the CloudFront / edge layer — e.g., HTTP Basic Auth, signed URLs, OIDC via Lambda@Edge, WAF IP allow-list — to restrict staging to the operator only?

### Decision Drivers

- **Usage pattern**: single operator (admin@example.com) runs multi-account test flows (owner / staff / admin role matrix) across multiple browser profiles, incognito windows, and occasional mobile responsive testing.
- **Budget**: AWS monthly cost ~$1.18 against a $5 hard cap. WAF baseline (~$5/mo for a WebACL) exceeds the cap on its own.
- **Threat model**: staging serves essentially the same static SPA as prod; any information disclosed from staging is already disclosable from prod or the public repo.
- **UX sensitivity**: multi-account testing under shared-credential Basic Auth re-prompts per incognito window and complicates CI fixtures.

## Options Considered

### Option A: Status Quo — application-layer gates only (Recommended)
- **Pros**: $0 infra cost delta, no UX friction for multi-account testing, no new code paths, env separation already enforces data-level isolation.
- **Cons**: Client-side invitation code is bypassable by anyone who finds the staging URL and reads the frontend bundle. URL is opaque but enumerable via CT logs.

### Option B: CloudFront Function + HTTP Basic Auth (site-wide)
- **Pros**: ~$0/mo (CF Functions bill at $0.10 per 1M invocations), simple to implement (~20 LOC CDK).
- **Cons**: Every new Chrome profile / Safari container / incognito window re-prompts for the credential. Cypress / Playwright fixtures need the credential baked in (leak risk in CI logs). Disproportionately taxes the primary usage pattern (multi-account testing).

### Option C: CloudFront Function + HTTP Basic Auth (artifact paths only, e.g. `/install.sh`)
- **Pros**: Preserves SPA UX; gates the install flow only.
- **Cons**: The install flow is already available by reading the repo (`scripts/camera-node/install.sh`). Gating the CloudFront-hosted copy adds ~no new protection.

### Option D: Signed CloudFront URLs / cookies
- **Pros**: Fine-grained, time-limited, zero infra cost.
- **Cons**: Requires a signing step before each access. Breaks casual browser navigation.

### Option E: Lambda@Edge + OIDC (Google / Cognito)
- **Pros**: Strong single-user auth, revocable per-session.
- **Cons**: ~$1–3/mo (eats half the budget headroom), high implementation complexity (viewer-request Lambda@Edge functions, token refresh, CORS), overkill for a single operator.

### Option F: WAF IP allow-list
- **Pros**: Strong network-level gate.
- **Cons**: ~$5–7/mo (WebACL baseline alone violates the $5 hard cap); fragile against ISP IP rotation on the operator's dev machine.

## Decision

**Option A — status quo at the CloudFront layer.** No edge-level authentication is added. The existing application-layer gates (invitation code + email verification + free plan cap + session cookie + device JWT + env separation) are sufficient for the operator's single-user, multi-account pilot usage pattern.

### Accepted passive hardenings (zero UX cost, tracked separately)

The following zero-UX-cost improvements are endorsed and will be tracked as a follow-up `chore(security): staging discoverability hardening` issue (size XS):

1. Add `X-Robots-Tag: noindex, nofollow` response header and a `/robots.txt` that blocks all bots on the staging distribution.
2. Audit outbound artifacts (SES email templates, error pages, session reports) to ensure staging URL does not leak into anything indexable or forwardable.
3. Add a CloudWatch alarm on "new registrations per hour on staging" with an SNS email to the operator; threshold e.g. 5/hour.
4. Treat the client-side invitation code as rotatable: rotate if it appears in a public commit, PR description, or shared screenshot.

## Consequences

### Positive
- Zero UX friction for the primary usage pattern (multi-account role-matrix testing).
- $0 infra cost delta — stays within the $1.18/mo operating baseline.
- No new code paths to maintain, test, review, or secure.
- The real gates (email verification, free plan cap, device JWT, env separation) are identical to what prod enforces — staging and prod threat models stay aligned.

### Negative
- The client-side invitation code remains the thinnest publicly-facing gate. A motivated attacker who discovers the staging URL and reads the frontend bundle can bypass it and attempt account registration — bounded by SES verification and the 2-farm cap.
- The staging URL, while opaque, is enumerable via Certificate Transparency logs and AWS domain-rotation patterns; "security by obscurity" is acknowledged and not relied upon.

### Rollback plan
If an incident indicates staging is being abused (registration spam, unexpected API traffic, cost anomaly), escalate in this order:

1. **Reactive, <1 hour**: Add CloudFront Function + HTTP Basic Auth site-wide (Option B). ~20 LOC CDK change, deployed via existing `make deploy-staging`. Single shared credential stored in the operator's password manager.
2. **If abuse persists**: Move to Option C + D hybrid (artifact Basic Auth + signed SPA cookies after a one-time handshake).
3. **If state-actor-grade abuse ever materializes**: re-evaluate with a fresh ADR; Option F (WAF) may become budget-worthy if traffic volume justifies moving off the free tier anyway.

## Related

- `#239` — Production-labeled AWS resources (env separation)
- `#372` — Dev/staging environment separation in CDK
- `#398` — Invitation code gate (registration access control)
- `#399` — Free plan farm membership limit = 2
- ADR-20260414-privilege-model-farm-promotion — pilot promo code is the sole gate for farm creation
- ADR-20260413-monetization-strategy — pilot tier structure
- Memory: `feedback_budget_constraint` ($1.18/mo baseline, $5 hard cap)
- Session: pre-prod-post098-to099 (2026-04-15) — discussion and decision context
