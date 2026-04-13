# ADR-20260413: Free vs Paid Tier Concept — Monetization Strategy (#281)

## Status
Accepted (2026-04-13) — design ADR, no implementation required yet

## Context

LitCrop is approaching production readiness (v0.93, Pre-PROD phase). Before GA, we need a monetization concept to:
1. Define what the **free tier** includes (the majority of current features)
2. Identify **paid features** that justify a subscription
3. Establish **limits** that encourage organic growth without frustrating small farmers
4. Keep infrastructure costs under control ($5/month ceiling for the operator)

### Current State
- **AWS cost**: ~$1.18/month at 10 users — well within free tier eligibility
- **Existing limits**: `FREE_PLAN_MAX_OWNED_FARMS = 2`, `FREE_PLAN_MAX_MEMBERSHIPS = 3`
- **AI features**: Claude Haiku chat (operator-funded, rate-limited)
- **No payment infrastructure** exists — no Stripe, no billing system
- **SES in sandbox** — email only to verified addresses
- **Target users**: Small-scale farmers, hobbyists, agricultural students

### Forces
- **Budget constraint**: Operator cost must stay under $5/month ceiling
- **AI cost dominance**: At 100+ users, Anthropic API costs dominate (~$0.003/request)
- **User trust**: Small farmers need confidence the platform won't paywall essential features
- **Solo operator**: No capacity to build/maintain a billing system in MVP
- **BYOK concept** (#333): Planned as the scaling strategy for AI costs

## Decision

### Tier Structure: "Free Forever" + "Pro" (future)

**Free Tier** — Available at GA, no payment required:

| Feature | Limit |
|---------|-------|
| Owned farms | 2 |
| Farm memberships (total) | 3 |
| Bed grid size | 8x8 (64 beds) max |
| Image uploads | 500/month per farm |
| Diary entries | Unlimited |
| Weather data | Unlimited |
| Device connections | 2 per farm |
| AI chat | 20 messages/day (operator-funded) |
| Data retention | Unlimited while account active |
| Export | Manual (future: CSV/JSON) |

**Pro Tier** — Future (post-MVP, when demand validates):

| Feature | Limit |
|---------|-------|
| Owned farms | 10 |
| Farm memberships | 10 |
| Bed grid size | 20x20 (400 beds) |
| Image uploads | 5,000/month per farm |
| AI chat | Unlimited (BYOK — user's own API key) |
| Device connections | 10 per farm |
| Priority support | Email support |
| Advanced analytics | ROI dashboard, seasonal reports |
| Data export | Automated CSV/JSON/PDF |

### Pricing Model: BYOK-First

Rather than charging a subscription fee (which requires payment infrastructure), the monetization strategy is:

1. **Free tier** covers 95% of small-farm use cases
2. **Pro features** gate on **BYOK (Bring Your Own Key)** (#333) — users who want unlimited AI provide their own Anthropic API key
3. **No server-side billing** needed — BYOK shifts AI costs to the user
4. **Future**: If user base grows, add Stripe subscription ($5-10/month) for Pro tier

### Implementation Approach

**Phase 1 (v0.93 — current)**:
- Document tier structure in this ADR
- Add `FREE_PLAN_MAX_GRID_SIZE = 8`, `FREE_PLAN_MAX_IMAGES_PER_MONTH = 500`, `FREE_PLAN_MAX_DEVICES = 2`, `FREE_PLAN_MAX_AI_MESSAGES_PER_DAY = 20` to shared constants
- Enforce grid size limit in `createFarm` and `updateFarm` (soft — show warning, don't block)
- Keep existing farm and membership limits (`MAX_OWNED_FARMS = 2`, `MAX_MEMBERSHIPS = 3`)

**Phase 2 (Post-MVP)**:
- Implement BYOK (#333) — user enters their Anthropic API key in settings
- When BYOK key is present, lift AI rate limits
- Add image upload counting (per-farm monthly counter in DynamoDB)

**Phase 3 (When demand validates)**:
- Add Stripe integration for Pro subscription
- Payment gates additional farm/device/grid limits
- Keep free tier generous — never paywall core farm management

## Alternatives Considered

### A. Freemium with Stripe from Day 1
**Pros**: Revenue from launch.
**Cons**: Requires billing infrastructure, payment UI, webhook handling, refund logic. Solo operator overhead is prohibitive. No user base to validate pricing.
**Verdict**: Rejected — premature for MVP.

### B. Usage-Based Pricing (pay-per-API-call)
**Pros**: Aligns cost with usage.
**Cons**: Complex metering, unpredictable bills for farmers, trust barrier.
**Verdict**: Rejected — bad UX for target audience.

### C. Donation/Tip Model
**Pros**: Zero friction, goodwill.
**Cons**: Unreliable revenue, doesn't scale.
**Verdict**: Rejected — doesn't cover infrastructure costs at scale.

### D. BYOK Only (chosen)
**Pros**: Zero billing infrastructure, shifts AI costs to power users, free tier stays generous.
**Cons**: Revenue comes later (subscription phase). Pro features limited to API key users.
**Verdict**: Accepted — best fit for solo operator, MVP stage, and small-farm audience.

## Consequences

### Positive
- Free tier covers all current features — no paywall surprise for existing users
- No payment infrastructure needed for MVP
- BYOK naturally segments power users from casual users
- Cost stays under $5/month ceiling (AI costs shift to BYOK users)

### Negative
- No revenue until subscription phase (Phase 3)
- Must monitor AI costs carefully — 20 messages/day × N users adds up
- Grid size limit (8x8) may frustrate larger operations

### Risks
- At 100+ users, operator AI cost could reach $12-15/month (exceeds $5 ceiling)
  - **Mitigation**: Implement BYOK before scaling past ~50 active AI users
- Image storage grows linearly — 500 images/month × 100 users = 50K images
  - **Mitigation**: Thumbnail compression, S3 lifecycle rules, storage monitoring

## Cost Projections

| Scale | Users | Monthly Cost (no BYOK) | With BYOK |
|-------|-------|----------------------|-----------|
| Current | 10 | $0.47 | $0.47 |
| 10x | 100 | $12-15 | $2-3 (AI shifted) |
| 100x | 1,000 | $100+ | $10-15 (AI shifted) |

## Implementation Constants

```typescript
// packages/shared/src/constants.ts
export const FREE_PLAN_MAX_OWNED_FARMS = 2;        // existing
export const FREE_PLAN_MAX_MEMBERSHIPS = 3;         // existing
export const FREE_PLAN_MAX_GRID_SIZE = 8;           // new — 8x8 max
export const FREE_PLAN_MAX_IMAGES_PER_MONTH = 500;  // new — per farm
export const FREE_PLAN_MAX_DEVICES = 2;             // new — per farm
export const FREE_PLAN_AI_MESSAGES_PER_DAY = 20;    // new — per user
```

## Related
- #333 — BYOK (Bring Your Own Key) for AI
- #334 — Capacity analysis (depends on tier decisions)
- #381 — Per-user API rate limiting (F-25)
- ADR-20260412 — AI context pipeline
