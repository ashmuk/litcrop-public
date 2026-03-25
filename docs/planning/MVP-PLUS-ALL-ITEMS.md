# MVP-PLUS-ALL-ITEMS.md — Consolidated Scope Inventory

> Date: 2026-03-21
> Purpose: Single source of truth for ALL remaining work — v0.9, v1.0, Production, Vision
> Sources: MVP-POST-PLAN.md, REVIEW-FINDINGS.md, REPORT_POC.md, FEEDBACK_POC_POST_DEPLOY.md, PLANS.md, Vision.md
> Status: Review document — prioritization pending

---

## How to Read This Document

- **Status**: Done / Committed / Planned / Omitted (was not in any phase plan)
- **Scope**: v0.9 / v1.0 / Production / Vision
- **Source**: Where the item was originally identified
- **GH**: GitHub issue number (if exists)
- **Effort**: S (<30m), M (30m-2h), L (2h-4h), XL (4h+)

---

## v0.9 — COMPLETED (deployed 2026-03-21)

### Batches 1-5: Security, Bugs, Robustness, UX, Tests


| #   | ID  | Description                                           | Commit  | GH   | Status |
| --- | --- | ----------------------------------------------------- | ------- | ---- | ------ |
| 1   | C6  | Hide chat model name from /usage response             | 1cae495 | #104 | Done   |
| 2   | S11 | Strip storage_key from image API responses            | 1cae495 | #105 | Done   |
| 3   | S7  | Sanitize LLM error body in CloudWatch logs            | 1cae495 | #106 | Done   |
| 4   | S8  | Thumbnail Lambda least-privilege IAM                  | 1cae495 | #107 | Done   |
| 5   | N3  | Weather i18n hydration timing fix                     | d6b019d | #108 | Done   |
| 6   | Q7  | JSON parse errors return 400 not 500                  | d6b019d | #109 | Done   |
| 7   | Q4  | Bound weather cache Map to 100 entries                | 8116e68 | #110 | Done   |
| 8   | Q9  | JPEG magic bytes < 3 bytes guard                      | 8116e68 | #111 | Done   |
| 9   | Q10 | Align all env fallbacks to litcrop-dev                | 8116e68 | #112 | Done   |
| 10  | Q5  | Non-null assertions on budget records (verified safe) | 8116e68 | —    | Done   |
| 11  | N5  | Verify upload works on PlotDetail (verified correct)  | 8116e68 | —    | Done   |
| 12  | Q8  | Wind direction degrees to cardinal                    | ec4dc2b | #113 | Done   |
| 13  | S5  | Document in-memory rate limiter Lambda caveat         | ec4dc2b | #114 | Done   |
| 14  | T3  | Auth middleware edge-case tests (+2)                  | 307296a | #115 | Done   |
| 15  | T4  | Farm ownership edge-case tests (+2)                   | 307296a | #115 | Done   |
| 16  | T5  | Budget enforcement edge-case tests (+2)               | 307296a | #115 | Done   |
| 17  | T6  | Plot creation edge-case tests (+2)                    | 307296a | #115 | Done   |


**Totals**: 17 items, 5 commits, 12 GH issues closed, 288 tests passing

### Phase 1 (Core UX — completed prior to batches)


| #   | ID  | Description                                    | Status |
| --- | --- | ---------------------------------------------- | ------ |
| 18  | A1  | GET /api/v1/farms + auto-fetch on login        | Done   |
| 19  | A2  | Plot creation wizard with climate suggestions  | Done   |
| 20  | A3  | Weather i18n key lookup verification           | Done   |
| 21  | A4  | Localize chat stub response                    | Done   |
| 22  | A5  | Farm name timing in page titles                | Done   |
| 23  | A6  | Remove "camera node" wording from empty states | Done   |
| 24  | A7  | Phone camera image upload on PlotDetail        | Done   |
| 25  | A8  | Simple admin stats page                        | Done   |


---

## v0.9 — REMAINING

### Batch 6: CI/CD Pipeline


| #   | ID   | Description                                            | Pri | Effort | Source        | GH  | Status  |
| --- | ---- | ------------------------------------------------------ | --- | ------ | ------------- | --- | ------- |
| 26  | CI-1 | `pr-checks.yml` (build + test + tsc + cdk synth on PR) | P0  | S      | MVP-POST-PLAN | —   | Planned |
| 27  | CI-2 | `deploy.yml` (cdk deploy + S3 sync on push to main)    | P0  | S      | MVP-POST-PLAN | —   | Planned |
| 28  | CI-3 | GitHub Secrets (AWS credentials)                       | P0  | S      | MVP-POST-PLAN | —   | Planned |
| 29  | CI-4 | GitHub Environment `production` with approval gate     | P0  | S      | MVP-POST-PLAN | —   | Planned |


---

## v1.0 — Phase 4: Multi-Farm Architecture


| #   | ID     | Description                                       | Pri | Effort | Source        | GH  | Status  |
| --- | ------ | ------------------------------------------------- | --- | ------ | ------------- | --- | ------- |
| 30  | N1-ADR | Create ADR for multi-farm support                 | P0  | S      | MVP-POST-PLAN | —   | Planned |
| 31  | N1-BE  | DynamoDB schema: `SK=#FARM` to `SK=FARM#<farmId>` | P0  | M      | MVP-POST-PLAN | —   | Planned |
| 32  | N1-API | `GET /farms` returns `Farm[]` array               | P0  | S      | MVP-POST-PLAN | —   | Planned |
| 33  | N1-FE  | Farm selector + farm context provider             | P0  | M      | MVP-POST-PLAN | —   | Planned |
| 34  | N1-MIG | Dual SK format support (no data migration)        | P0  | S      | MVP-POST-PLAN | —   | Planned |


---

## v1.0 — Phase 5: Features + Optimization (from MVP-POST-PLAN)


| #   | ID    | Description                                      | Pri | Effort | Source        | GH  | Status  |
| --- | ----- | ------------------------------------------------ | --- | ------ | ------------- | --- | ------- |
| 35  | #90   | Settings cross-device sync (PATCH/GET /settings) | P1  | M      | MVP-POST-PLAN | #90 | Planned |
| 36  | S9    | httpOnly cookies for refresh token               | P1  | S      | MVP-POST-PLAN | —   | Planned |
| 37  | S10   | RemovalPolicy RETAIN for prod DynamoDB + S3      | P1  | S      | MVP-POST-PLAN | —   | Planned |
| 38  | N2    | IoT service/guide page at `/services/`           | P2  | M      | MVP-POST-PLAN | —   | Planned |
| 39  | Q11   | Batch DynamoDB for farm detail (fix N+1)         | P2  | S      | MVP-POST-PLAN | —   | Planned |
| 40  | Q12   | Dynamic timezone from farm lat/lon               | P2  | S      | MVP-POST-PLAN | —   | Planned |
| 41  | Q13   | Atomic tag + plot status update (TransactWrite)  | P2  | S      | MVP-POST-PLAN | —   | Planned |
| 42  | T8-T9 | Standalone Zod schema tests                      | P2  | S      | MVP-POST-PLAN | —   | Planned |


---

## v1.0 — Omitted Items (not in any phase — need slotting)

### Security SHOULD-FIX (from REVIEW-FINDINGS.md)


| #   | ID  | Description                                                      | Pri | Effort | Source          | Status  |
| --- | --- | ---------------------------------------------------------------- | --- | ------ | --------------- | ------- |
| 43  | S3  | Auth middleware missing on `/plots` and `/images` root paths     | P1  | S      | REVIEW-FINDINGS | Omitted |
| 44  | S4  | Pagination cursor DynamoDB injection — validate decoded PK       | P1  | S      | REVIEW-FINDINGS | Omitted |
| 45  | S6  | User input reflected unsanitized in chat stub (XSS via Markdown) | P1  | S      | REVIEW-FINDINGS | Omitted |


### Code Quality (from REVIEW-FINDINGS.md, REPORT_POC.md)


| #   | ID   | Description                                                         | Pri | Effort | Source          | Status  |
| --- | ---- | ------------------------------------------------------------------- | --- | ------ | --------------- | ------- |
| 46  | Q6   | `assertImageOwnership` swallows NotFoundError → returns 503 not 404 | P2  | S      | REVIEW-FINDINGS | Omitted |
| 47  | SG-3 | `updateFarm` ExpressionAttributeNames leak (unused attributes sent) | P2  | S      | REPORT_POC      | Omitted |


### User-Facing Features (from FEEDBACK, Vision.md)


| #   | ID   | Description                                                     | Pri | Effort | Source            | GH  | Status  |
| --- | ---- | --------------------------------------------------------------- | --- | ------ | ----------------- | --- | ------- |
| 48  | F-09 | Map picker for farm location (visual pin instead of lat/lng)    | P1  | M      | FEEDBACK          | #55 | Omitted |
| 49  | F-10 | Elevation auto-fetch from Open-Meteo Elevation API              | P2  | S      | FEEDBACK          | #56 | Omitted |
| 50  | F-14 | Time-lapse playback — weekly compilation, 30fps, 0.5x/1x/2x    | P1  | M      | FEEDBACK / Vision | #59 | **Done** (v0.12) |
| 51  | SF-4 | Chat Markdown rendering (marked + DOMPurify)                    | P2  | S      | REPORT_POC        | #119 | **Done** (v0.12) |


---

## Production Scope

### Infrastructure & Security


| #   | ID          | Description                                                      | Pri | Effort | Source        | Status  |
| --- | ----------- | ---------------------------------------------------------------- | --- | ------ | ------------- | ------- |
| 52  | IAM-scope   | Replace AdministratorAccess with least-privilege CDK deploy role | P1  | M      | MVP-POST-PLAN | Planned |
| 53  | Domain      | Custom domain + TLS (ACM cert, Route53, CloudFront)              | P1  | M      | MVP-POST-PLAN | Planned |
| 54  | SSM-runtime | Runtime SSM fetch for LLM API key (enable real AI chat)          | P1  | S      | MVP-POST-PLAN | Planned |


### Features


| #   | ID             | Description                                                              | Pri | Effort | Source         | GH  | Status  |
| --- | -------------- | ------------------------------------------------------------------------ | --- | ------ | -------------- | --- | ------- |
| 55  | F-07           | IoT management — camera pairing, device status, firmware OTA             | P1  | XL     | MVP-POST-PLAN  | —   | Planned |
| 56  | F-09:Admin     | Full admin dashboard — user mgmt, farm browsing, audit logs              | P2  | XL     | MVP-POST-PLAN  | —   | Planned |
| 57  | F-13           | Soil pH monitoring via IoT sensor (needs MQTT ADR)                       | P2  | L      | FEEDBACK       | #58 | Planned |
| 58  | SSE            | Streaming chat responses (`client.messages.stream()`)                    | P2  | M      | PLANS          | —   | Planned |
| 59  | Social-login   | Google/LINE social login                                                 | P2  | M      | PLANS          | —   | Planned |
| 60  | Layout-editor  | Interactive visual layout editor (currently read-only)                   | P2  | L      | PLANS          | —   | Planned |
| 61  | Map-view       | Interactive farm map with plot locations                                 | P2  | L      | FEEDBACK       | —   | Planned |
| 62  | Desktop-polish | Full desktop layout optimization (remaining gaps)                        | P2  | M      | FEEDBACK       | —   | Planned |
| 63  | CV-AI          | Computer vision — disease detection, growth estimation, yield prediction | P3  | XL     | PLANS / Vision | —   | Planned |
| 64  | Live-stream    | Realtime camera streaming (WebRTC/HLS, Pi 4+ hardware)                   | P3  | XL     | PLANS / Vision | —   | Planned |
| 65  | Sprinkler      | Actuator control — periodic or on-demand watering                        | P3  | XL     | PLANS / Vision | —   | Planned |


---

## Vision Scope (V-01 through V-07)

> These are product roadmap categories from FEEDBACK_POC_POST_DEPLOY.md. No execution plan exists. They inform future `/cc-define` and `/cc-design` sessions.


| #   | ID   | Category              | Key Items                                                                 | Dependencies            |
| --- | ---- | --------------------- | ------------------------------------------------------------------------- | ----------------------- |
| 66  | V-01 | User Management       | Multi-farm membership, farm selector, remember last farm, global switcher | Auth (done), Phase 4 N1 |
| 67  | V-02 | Farm Management       | Join request workflow, farm profile page, device limits (5 per farm)      | V-01                    |
| 68  | V-03 | IoT Device Management | Device type registry, status dashboard, provisioning flow                 | F-07 IoT mgmt           |
| 69  | V-04 | Plans & Subscriptions | Plan-based limits, feature flags, billing system, pricing model TBD       | V-01, V-03              |
| 70  | V-05 | Admin Menu Structure  | Menu restructure for 10+ management screens                               | V-01 through V-04       |
| 71  | V-06 | Mobile App            | iOS/Android native apps, push notifications, offline sync, API readiness  | All Production features |
| 72  | V-07 | Service Landing Page  | Marketing site, feature tiers, pricing table, plan sync                   | V-04                    |


---

## Summary Statistics


| Scope                        | Total   | Done   | Remaining |
| ---------------------------- | ------- | ------ | --------- |
| v0.9                         | 29      | 29     | 0         |
| v1.0 Phases A–F              | 28      | 28     | 0         |
| Post-deploy R1–R6 (F/R items)| 34      | 34     | 0         |
| Post-deploy R7 (D items)     | 6       | 0      | 6 (2 quick, 4 BETA) |
| #90 Settings sync            | 1       | 0.5    | 0.5 (temp_unit, theme) |
| Production (original)        | 14      | 0      | 14        |
| Vision                       | 7       | 0      | 7         |
| **Total**                    | **119** | **91.5** | **27.5** |


### By Priority (remaining only)


| Priority | Count | Items                                                                                        |
| -------- | ----- | -------------------------------------------------------------------------------------------- |
| P0       | 9     | CI-1..4, N1 (5 sub-items)                                                                    |
| P1       | 13    | #90, S9, S10, S3, S4, S6, F-09, F-14, IAM, Domain, SSM, F-07, Desktop                        |
| P2       | 14    | N2, Q6, Q11, Q12, Q13, T8-T9, F-10, SF-4, SG-3, F-09:Admin, F-13, SSE, Social, Layout-editor |
| P3       | 4     | CV-AI, Live-stream, Sprinkler, Map-view                                                      |
| Vision   | 7     | V-01..V-07                                                                                   |


### By Effort (remaining only)


| Size                 | Count | Est. Hours |
| -------------------- | ----- | ---------- |
| S (<30m)             | 18    | ~6h        |
| M (30m-2h)           | 14    | ~16h       |
| L (2h-4h)            | 4     | ~12h       |
| XL (4h+)             | 4     | ~20h+      |
| Vision (unestimated) | 7     | TBD        |


### Open GitHub Issues


| #   | Title                               | Labels      | Scope      | Status |
| --- | ----------------------------------- | ----------- | ---------- | ------ |
| #55 | Map picker for farm location (F-09) | —           | v1.0       | Open (Phase D) |
| #56 | Elevation auto-fetch (F-10)         | —           | v1.0       | Open (Phase D) |
| #58 | Soil pH monitoring (F-13)           | —           | Production | Open |
| #59 | Time-lapse playback (F-14)          | —           | v1.0       | **Closed** (v0.12) |
| #90 | Settings cross-device sync          | enhancement | v1.0       | Open (BETA) |
| #119 | Image lightbox + chat markdown     | —           | v1.0       | **Closed** (v0.12) |
| #120 | Bed-grid + crop + profile          | —           | v1.0       | Open (Phase D) |
| #121 | Security hardening (S3/S4/S6/S10)  | —           | v1.0       | Open (Phase E) |
| #122 | Quality fixes (Q6/SG-3/Q12/T8-T9) | —           | v1.0       | Open (Phase F) |


---

## Cross-Reference: Source Documents


| Document                    | Items Sourced                      | Items Omitted from Plan                                         |
| --------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| MVP-POST-PLAN.md            | 29 (v0.9) + 13 (v1.0)              | 0 (by definition)                                               |
| REVIEW-FINDINGS.md          | S5, S7, S8, Q4-Q10, T3-T6, C6, S11 | S3, S4, S6, Q6                                                  |
| FEEDBACK_POC_POST_DEPLOY.md | F-08/N3                            | F-09, F-10, F-14, V-01..V-07                                    |
| REPORT_POC.md               | —                                  | SF-4, SG-3                                                      |
| PLANS.md                    | Scope exclusions                   | SSE, Social-login, Layout-editor, CV-AI, Live-stream, Sprinkler |
| Vision.md                   | —                                  | Time-lapse (F-14), all Vision categories                        |


---

> Generated 2026-03-21 | Updated 2026-03-22 (Phase C items marked done, issues updated)
> Consolidated from 6 source documents | 72 total items tracked

