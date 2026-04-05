# ADR-20260405: Static-First Crop Library for Species Metadata

**Status:** Accepted
**Date:** 2026-04-05
**Deciders:** Project owner + Claude Code
**Issue:** #274 (M2 Crop Library Integration)

## Context

Beta-8 M2 (#274) requires adding species metadata (days_to_harvest, expected_yield, growing_season, companion_plants) to the crop library. The existing foundation is a 100-crop static JSON file (`src/frontend/src/data/crops.json`) with id, emoji, category, and bilingual names (EN/JA).

**Key constraints:**
- AWS budget ceiling: ~$1.18/mo (hard stop at $5)
- No tolerance for external runtime dependencies that could cause app failures
- Security: minimize attack surface (no untrusted external API calls at runtime)
- Current crop list covers common small/medium farm crops adequately

## Options Considered

### Option A: Static Bundle (selected)
Curate a JSON file with ~100-200 crops + growing metadata, sourced one-time from USDA bulk data and OpenFarm (CC0 licensed). Ship as part of the build.

| Pros | Cons |
|------|------|
| Zero API cost | Manual maintenance |
| Zero latency | Limited to curated set |
| Works offline | No community updates |
| No external dependency | |
| No security surface | |

### Option B: Dynamic API (runtime)
Call OpenFarm/USDA/Trefle API when user selects a crop.

| Pros | Cons |
|------|------|
| Larger dataset | API dependency (no SLA) |
| Community-maintained | Latency per lookup |
| Always current | Rate limits (Trefle: 120/day) |
| | Cost risk |
| | CSP/CORS complexity |
| | Trust/security surface |

### Option C: Hybrid (static + API fallback)
Static JSON for common crops, API fallback for exotic/unlisted.

| Pros | Cons |
|------|------|
| Best coverage | More complex |
| Graceful degradation | Still has external dependency |
| | Cache management needed |

## Decision

**Option A: Static-first.** Enhance the existing `crops.json` with growing metadata fields curated from authoritative sources (USDA Plants Database, OpenFarm CC0 data) at development time — not at runtime.

The data will be:
1. Moved to `packages/shared/src/data/crop-library.json` (shared between API and frontend)
2. Extended with: `days_to_harvest_min`, `days_to_harvest_max`, `season` (spring/summer/fall/winter), `companions[]`
3. Exposed via `GET /api/v1/crop-library/:cropId` (reads from static data, no external calls)
4. Consumed by M3 smart defaults to auto-fill harvest dates

**Future dynamic API integration** is tracked as a separate issue (#284) scoped to Pre-Production or later.

## Consequences

### Positive
- Zero additional AWS cost
- No runtime failure modes from external services
- No security review needed for external API trust
- Deterministic behavior — same input always produces same output
- OpenFarm data is CC0 licensed — legal to include in bundle

### Negative
- Growing metadata limited to curated crops (~100-200)
- Free-text crops entered by users won't have metadata (graceful: shows "no data available")
- Manual updates required when adding new crops or correcting data

### Risks
- Data accuracy: USDA/OpenFarm data may not match all climate zones. Mitigation: show ranges (min/max days_to_harvest), not single values.
- Stale data: unlikely for well-known crops. Can be refreshed at any release cycle.

## Rollback Plan

If static data proves insufficient:
1. Implement Option C (hybrid) per #284
2. The static JSON remains the primary source
3. API fallback only fires for crops not in the bundle
4. Cache API responses in DynamoDB to minimize calls

## References
- #274 — feat(crops): integrate public crop library for species metadata (M2)
- #284 — feat(crops): dynamic crop API integration (future, Pre-Production+)
- OpenFarm API: CC0 licensed, community-maintained
- USDA Plants Database: government data, public domain
