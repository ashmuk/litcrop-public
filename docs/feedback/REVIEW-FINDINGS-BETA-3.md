# Review Findings — Beta-3 Infrastructure Hardening

> Date: 2026-04-01 | Reviewer: my-reviewer (code-reviewer agent)
> Scope: All Beta-3 changes (Waves 0–4) — 11 files, +2804/-832 lines
> Tests: 355/355 passing | Lint: 0 errors, 8 warnings | CDK: synth OK

---

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 2 |
| SHOULD-FIX | 4 |
| SUGGESTION | 3 |

**Status: NEEDS REMEDIATION** (2 MUST-FIX items block deployment)

---

## MUST-FIX (Blocks Deployment)

### MF-1: CSP `connect-src` blocks Cognito auth and external API calls

**File:** `infra/lib/litcrop-stack.ts:189`

Current `connect-src` is `'self' https://*.execute-api.*.amazonaws.com` but the frontend directly calls:
- `https://cognito-idp.{REGION}.amazonaws.com/` — all auth operations (auth.ts:21)
- `https://api.open-meteo.com/v1/elevation` — GPS elevation (MapPicker.tsx:30)
- `https://nominatim.openstreetmap.org/reverse` — reverse geocoding (WeatherView.tsx:99)

**Impact:** Auth sign-in, map elevation, and weather location will silently fail in production.

**Fix:** Expand `connect-src`:
```
connect-src 'self' https://*.execute-api.*.amazonaws.com https://cognito-idp.*.amazonaws.com https://api.open-meteo.com https://nominatim.openstreetmap.org
```

### MF-2: CSP `style-src` blocks Leaflet CDN CSS

**File:** `infra/lib/litcrop-stack.ts:185`

MapPicker.tsx:84 dynamically injects a `<link>` tag pointing to `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`. Current `style-src 'self' 'unsafe-inline'` does not cover external stylesheets.

**Impact:** Map component will render without styles — broken layout.

**Fix:** Add `https://unpkg.com` to `style-src`.

---

## SHOULD-FIX (Address Before Finalizing)

### SF-1: Lambda error alarm description says "rate" but measures absolute count

**File:** `infra/lib/litcrop-stack.ts:464,469`

Description says "error rate exceeds 1%" but the alarm fires on `Sum >= 1` — any single error triggers it. This is fine for MVP but the description is misleading.

**Fix:** Update description to match implementation:
```typescript
alarmDescription: 'API Lambda recorded at least 1 error in 5 minutes',
```

### SF-2: `ADMIN_EMAILS` baked at synth time with no warning

**File:** `infra/lib/litcrop-stack.ts:286`

`process.env['ADMIN_EMAILS'] ?? ''` is evaluated at CDK synth time. If not set in the deploy environment, admin access silently disables. Same pattern for `ALARM_EMAIL` (line 449) but that one has a conditional guard.

**Fix:** Add a synth-time warning:
```typescript
if (!process.env['ADMIN_EMAILS']) {
  console.warn('[CDK] ADMIN_EMAILS not set — admin bypass will be disabled');
}
```

### SF-3: Admin delete test missing negative path

**File:** `src/api/src/__tests__/routes/farms.test.ts:621`

Tests only the happy path (admin can delete). Missing: non-admin user attempting to delete a farm they don't own should get 404.

**Fix:** Add companion test for non-admin rejection.

### SF-4: ESLint lint script uses shell-only single-quote glob

**File:** `package.json` (lint script)

```
"lint": "eslint 'src/api/src/**/*.ts' 'packages/shared/src/**/*.ts'"
```

Single-quoted globs work on Linux/macOS but fail on Windows cmd.exe. CI runs ubuntu-latest so this is not a blocker, but cross-platform dev may break.

**Fix:** Use double quotes or `--ext .ts` flag instead.

---

## SUGGESTIONS

### SG-1: API Gateway 5xx metric name may need verification

**File:** `infra/lib/litcrop-stack.ts:483`

The metric name `5xx` is used. HTTP API v2 and REST API v1 use different metric names. AWS docs indicate HTTP API v2 uses `5xx` (lowercase), but this should be verified in CloudWatch after first deploy to ensure the alarm receives data.

### SG-2: HSTS missing `preload` directive

**File:** `infra/lib/litcrop-stack.ts:203`

For production with a custom domain, adding `preload: true` would enable browser HSTS preload list eligibility. Not needed for CloudFront domain.

### SG-3: timezone.ts signature change is safe

**File:** `packages/shared/src/timezone.ts`

Removed `_lat` parameter confirmed safe — zero callers in entire codebase. No version bump needed since package is workspace-internal.

---

## Verification Needed Post-Deploy

- [ ] Auth login works with CSP active (Cognito calls not blocked)
- [ ] Map picker renders with Leaflet styles
- [ ] CloudWatch alarm for 5xx receives metric data (not perpetual INSUFFICIENT_DATA)
- [ ] SNS email subscription confirmed (check inbox for subscription confirmation)
- [ ] `ADMIN_EMAILS` is set correctly in deploy environment

---

## Positives

- PITR, Cognito RETAIN, and PriceClass changes are correct and minimal
- CSP structure is well-organized (array join pattern is readable)
- `attachAlarmActions` helper is clean DRY
- Admin delete test follows existing test patterns
- API-CONTRACTS.md expansion is thorough (11 → 35 endpoints)
- i18n terminology cleanup is consistent across EN/JA

---

*Next: Invoke cc-remediate for MUST-FIX items MF-1 and MF-2, then SHOULD-FIX items SF-1 through SF-3.*
