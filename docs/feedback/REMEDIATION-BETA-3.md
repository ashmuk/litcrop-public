# Remediation Report — Beta-3

> Date: 2026-04-01
> Review source: docs/feedback/REVIEW-FINDINGS-BETA-3.md
> Iterations: 1 of 3 max
> Status: **RESOLVED**

---

## Findings Resolution

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| MF-1 | CSP `connect-src` blocks Cognito, open-meteo, nominatim | MUST-FIX | FIXED | Added `cognito-idp.*.amazonaws.com`, `api.open-meteo.com`, `nominatim.openstreetmap.org` to connect-src |
| MF-2 | CSP `style-src` blocks Leaflet CDN CSS | MUST-FIX | FIXED | Added `https://unpkg.com` to style-src |
| SF-1 | Lambda error alarm description says "rate" but is count | SHOULD-FIX | FIXED | Updated to "recorded at least 1 error in 5 minutes" |
| SF-2 | `ADMIN_EMAILS` baked at synth time with no warning | SHOULD-FIX | FIXED | Added console.warn at synth time when env var missing |
| SF-3 | Admin delete test missing negative path | SHOULD-FIX | FIXED | Added test: non-admin user gets 404, deleteFarm not called |
| SF-4 | ESLint glob uses shell-only quoting | SHOULD-FIX | FIXED | Changed to `--ext .ts` flag pattern |
| SG-1 | 5xx metric name verification | SUGGESTION | DEFERRED | Verify in CloudWatch post-deploy |
| SG-2 | HSTS preload for production domain | SUGGESTION | DEFERRED | Not needed for CloudFront domain; revisit with custom domain |
| SG-3 | timezone.ts signature change | SUGGESTION | N/A | Confirmed safe — zero callers |

---

## Iteration Log

### Iteration 1
- **Findings addressed:** MF-1, MF-2, SF-1, SF-2, SF-3, SF-4
- **Outcome:** All MUST-FIX and SHOULD-FIX resolved
- **Verification:**
  - CDK synth: passes, CSP verified in synthesized template
  - Tests: 356/356 (was 355, +1 negative-path test)
  - Lint: 0 errors, 8 warnings (unchanged)
  - CSP connect-src: `'self' https://*.execute-api.*.amazonaws.com https://cognito-idp.*.amazonaws.com https://api.open-meteo.com https://nominatim.openstreetmap.org`
  - CSP style-src: `'self' 'unsafe-inline' https://unpkg.com`

## Escalations

None. All findings resolved in iteration 1.

---

*Remediation complete. Ready for commit and deploy.*
