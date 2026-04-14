# ADR-20260414: Privilege Model — Farm-Level Promotion Does Not Grant Global Owner (#400)

## Status
Accepted (2026-04-14)

## Context

When a staff user is promoted to owner within a specific farm (via `PATCH /farms/:farmId/members/:userId`), it is unclear whether this should also grant global "owner" capability — specifically, the ability to create new farms.

### Current Behavior
- `UserProfile.preferred_role` is set at registration time: `'staff'` by default, `'owner'` if promo code entered
- Farm creation (`POST /api/v1/farms`) checks `preferred_role` — staff accounts are blocked
- Farm-level promotion changes `FarmMember.role` only — `preferred_role` is untouched
- A staff user promoted to owner in Farm A still cannot create Farm B

### Question
Should promotion to farm owner also set `preferred_role: 'owner'`, unlocking global farm creation?

## Decision

**No. Farm-level roles remain scoped to the farm. `preferred_role` is unchanged by promotion.**

### Rationale
1. **Separation of concerns**: Farm-level role = "what you can do in this farm." Global role = "what you can do on the platform." These are distinct capabilities.
2. **Pilot control**: During pilot, the promo code (`LITCROP2026`) gates farm creation. Promotion bypassing this would break the invitation-based access model.
3. **Least surprise**: A farm owner promoting a helper to co-manage their farm likely doesn't intend to let them spin up independent farms.
4. **Reversibility**: If we later decide promotion should unlock farm creation, it's a one-line change in `farm-members.ts`. The reverse (revoking accidentally-granted capability) is harder.

### What "Owner" Means in Each Context

| Context | Role: Owner | Can create farms? |
|---------|-------------|-------------------|
| `UserProfile.preferred_role` | Registered with promo code | Yes |
| `FarmMember.role` | Promoted within a farm | No (manages that farm only) |

## Consequences

### Positive
- Clean privilege boundary — no accidental capability escalation
- Pilot promo code remains the sole gate for farm creation
- Simple to explain to users: "ask the admin for a promo code to create your own farm"

### Negative
- A user promoted to owner in Farm A who wants to create Farm B must know the promo code
- No self-service path from "promoted staff" to "farm creator" without the code

### Future
- Post-pilot: Consider a "request owner upgrade" flow (admin approval)
- Or: Allow farm owners to generate invitation codes for their promoted members
- The `preferred_role` field can be updated via admin dashboard if needed

## Related
- #398 — Invitation code gate (registration access control)
- #399 — Farm membership limit (2 max)
- ADR-20260413 — Monetization strategy (tier structure)
