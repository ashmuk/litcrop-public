# BETA5-READINESS.md — Beta-5 Sprint Planning (Device Management + Personalization)

> Date: 2026-04-01 | Status: **PLANNED** (blocked on Beta-4 completion)
> Prerequisite: v0.31 (Beta-4 — account lifecycle + admin complete)
> Target: v0.32 (Beta-5 release)
> Theme: **Device management, user personalization, and resource cleanup**

---

## Purpose

Beta-5 makes LitCrop **operationally complete for field use**. Camera nodes become configurable through the web UI (no more SSH-only setup), users get visual identity with profile pictures, and accumulated data becomes manageable with resource deletion.

This sprint delivers the **core product capability** — connecting a camera node to a bed and getting images flowing through AWS into the dashboard.

---

## 1. Prerequisite State (Beta-4 complete)

| Item | Value |
|------|-------|
| Tag | v0.31 (Beta-4) on develop |
| Features | Change password, delete account, email notifications, activity log |
| Tests | 400+ (target from Beta-4) |
| Open Feature Issues | #160, #210, R-01, R-02 |

---

## 2. Design Decisions (from user interview, 2026-04-01)

| Decision | Beta-5 (now) | Future |
|----------|-------------|--------|
| **Registration** | Option B — Web UI shows BED_ID + device key, user copies to Pi config | Option C — QR code pairing |
| **Credentials** | Option A — User JWT + refresh token (current approach) | Option C — Cognito M2M client credentials |
| **Config model** | Option A — Pi polls `GET /devices/{deviceId}/config` each capture cycle | Push via IoT Core |
| **Cameras per bed** | Single camera per bed | Multi-camera per bed |
| **Triggers** | Scheduled only | Motion detection (Beta-6+) |
| **Web-configurable** | All: interval, resolution, quality, time window, name, bed | — |
| **Health signals** | All: last image, online/offline, battery, WiFi, storage | — |
| **Test shot** | Yes — image quality preview from web UI | — |

---

## 3. Beta-5 Scope (4 items)

### Device Management (#210 — refined)

| Sub-item | Title | Size |
|----------|-------|------|
| D-REG | Device registration — web UI shows credentials + setup instructions | S |
| D-CFG | Device config API — Pi polls config, web UI edits settings | M |
| D-HEALTH | Device health dashboard — status, battery, WiFi, storage | M |
| D-PREVIEW | Image quality preview — trigger test shot from web UI | S |
| D-SETUP | In-app setup guide — step-by-step camera node connection walkthrough | S |

### User Personalization

| # | Title | Size |
|---|-------|------|
| #160 | Profile picture support | M |

### Resource Management

| ID | Title | Size |
|----|-------|------|
| R-01 | DELETE /beds/:bedId endpoint | S |
| R-02 | DELETE /images/:imageId endpoint | S |

### Deferred to Beta-6+

| Item | Target |
|------|--------|
| Multi-camera per bed | Beta-6 |
| Motion detection configuration | Beta-6 |
| QR code device pairing | Future |
| Cognito M2M credentials | Future |
| #168 Soft delete | PENDING |
| #183 AI chat on all pages | PENDING |

---

## 4. Implementation Waves

### Wave 0 — Resource Deletion (~2 hrs)

Quick wins — unblock users who need to clean up data.

| Step | What to Do |
|------|------------|
| 0.1 | **API**: Add `DELETE /beds/:bedId` — remove bed record + all child images + S3 objects + tags |
| 0.2 | **API**: Add `DELETE /images/:imageId` — remove image record + S3 object (original + thumbnail) + tags |
| 0.3 | **Frontend (BedDetail)**: Add delete button with confirmation dialog |
| 0.4 | **Frontend (ImageViewer)**: Add delete button with confirmation dialog |
| 0.5 | **Tests**: Cascade deletion tests (verify no orphaned records) |

### Wave 1 — Profile Picture (~4 hrs)

| Step | What to Do |
|------|------------|
| 1.1 | **API**: Add `POST /api/v1/me/avatar` — upload to S3 (`avatars/{userId}.jpg`), 500KB limit |
| 1.2 | **API**: Add `DELETE /api/v1/me/avatar` — remove avatar from S3 |
| 1.3 | **API**: Add `avatar_url` field to profile response (signed S3 URL, 1hr expiry) |
| 1.4 | **Frontend (ProfilePage)**: Avatar upload widget with preview, crop, and remove |
| 1.5 | **Frontend**: Display avatars in farm member lists, admin users list, join request cards |
| 1.6 | **i18n**: EN/JA translations for avatar UI |
| 1.7 | **Tests**: Upload validation (content-type, size), signed URL generation |

### Wave 2 — Device Data Model + API (~5 hrs)

The foundation — DynamoDB entity and CRUD endpoints.

| Step | What to Do |
|------|------------|
| 2.1 | **ADR**: Device data model — DEVICE# entity design |
| 2.2 | **DynamoDB**: `DEVICE#` entity schema: |

```
PK: FARM#{farmId}
SK: DEVICE#{deviceId}
Attributes:
  device_id: string (UUID)
  node_id: string (human-readable, e.g. "field-01-cam-01")
  bed_id: string (assigned bed UUID)
  owner_id: string (user who registered)
  status: "active" | "inactive"
  config:
    capture_interval: number (seconds, default 600)
    resolution_width: number (default 1920)
    resolution_height: number (default 1080)
    jpeg_quality: number (default 75)
    active_hours_start: number (0-23, default 5)
    active_hours_end: number (0-23, default 20)
    trigger: "scheduled" (only option for Beta-5)
  health:
    last_image_at: ISO timestamp (derived from latest image)
    battery_pct: number | null (reported by device)
    wifi_rssi: number | null (reported by device)
    spool_count: number | null (queued images)
  created_at: ISO timestamp
  updated_at: ISO timestamp
```

| Step | What to Do |
|------|------------|
| 2.3 | **API**: `GET /farms/:farmId/devices` — list devices with health |
| 2.4 | **API**: `POST /farms/:farmId/devices` — register device (node_id, bed_id) |
| 2.5 | **API**: `GET /devices/:deviceId/config` — Pi polls this each cycle (returns config block) |
| 2.6 | **API**: `PATCH /devices/:deviceId` — update config from web UI |
| 2.7 | **API**: `DELETE /devices/:deviceId` — deregister |
| 2.8 | **API**: `POST /devices/:deviceId/health` — device reports battery, WiFi, spool (called by capture.sh) |
| 2.9 | **Tests**: Device CRUD, config fetch, health report |

### Wave 3 — Device Management UI (~5 hrs)

The web interface for managing camera nodes.

| Step | What to Do |
|------|------------|
| 3.1 | **Frontend (ManagePage)**: Device list — cards showing node name, bed, status badge, last image time |
| 3.2 | **Frontend**: "Register Device" form — node ID input, bed picker dropdown |
| 3.3 | **Frontend**: After registration → show credentials panel: |

```
┌─────────────────────────────────────────────┐
│  ✅ Device Registered                        │
│                                              │
│  Copy these to your Pi's /etc/litcrop/node.conf: │
│                                              │
│  NODE_ID="field-01-cam-01"                   │
│  BED_ID="abc123-def456-..."                  │
│  API_BASE_URL="https://xxx.execute-api..."   │
│  DEVICE_ID="dev-789..."                      │
│                                              │
│  [Copy All to Clipboard]                     │
│                                              │
│  Then run: sudo /opt/litcrop/capture.sh      │
│  to verify the connection.                   │
└─────────────────────────────────────────────┘
```

| Step | What to Do |
|------|------------|
| 3.4 | **Frontend**: Device config panel — sliders/inputs for interval, resolution, quality, active hours |
| 3.5 | **Frontend**: Health indicators — colored dot (green/yellow/red), battery bar, WiFi signal icon, spool count |
| 3.6 | **Frontend**: Online/offline derivation: green if last image < 2× interval, yellow if < 5× interval, red otherwise |
| 3.7 | **i18n**: EN/JA translations for all device UI |

### Wave 4 — Test Shot Preview + Setup Guide (~3 hrs)

| Step | What to Do |
|------|------------|
| 4.1 | **API**: `POST /devices/:deviceId/test` — returns a flag that capture.sh checks on next poll, triggers immediate capture |
| 4.2 | **Frontend**: "Take Test Shot" button on device config panel |
| 4.3 | **Frontend**: Poll for new image from assigned bed, display preview when received |
| 4.4 | **Frontend**: In-app setup guide — collapsible step-by-step walkthrough: |

```
Step 1: Hardware Setup
  → Link to CAMERA-NODE-SETUP.md essentials (flash, enable camera)

Step 2: Install LitCrop on Pi
  → Show scp + install.sh commands (pre-filled with user's API URL)

Step 3: Register Device (you just did this ↑)

Step 4: Configure Pi
  → Show the node.conf values to copy (from registration panel)

Step 5: Test Connection
  → "Take Test Shot" button
  → Wait for image... ✅ "Connection verified! First image received."

Step 6: Set Schedule
  → Show cron/systemd commands (pre-filled with configured interval)
```

| Step | What to Do |
|------|------------|
| 4.5 | **Tests**: Test shot request, guide content rendering |

### Wave 5 — Device-Side Updates (~2 hrs)

Update `capture.sh` to participate in the new system.

| Step | What to Do |
|------|------------|
| 5.1 | **capture.sh**: Add `GET /devices/{deviceId}/config` poll before each capture — apply interval, resolution, quality, active hours from API response |
| 5.2 | **capture.sh**: Add `POST /devices/{deviceId}/health` call after each capture — report battery (if available), WiFi RSSI, spool count |
| 5.3 | **capture.sh**: Check for test-shot flag in config response — if set, capture immediately regardless of schedule |
| 5.4 | **node.conf**: Add `DEVICE_ID` field (set during registration) |
| 5.5 | **Tests**: Shell script tests (mock curl responses) |

---

## 5. End-to-End Flow (after Beta-5)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Web UI       │     │  AWS Cloud    │     │  Camera Node  │
│  (browser)    │     │              │     │  (Pi Zero)    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                     │                     │
       │  1. Register Device │                     │
       │────────────────────►│  DEVICE# created    │
       │  ◄─ credentials     │                     │
       │                     │                     │
       │  2. User copies     │                     │
       │     node.conf ──────┼────────────────────►│
       │                     │                     │
       │  3. Test Shot       │                     │
       │────────────────────►│  set test flag      │
       │                     │                     │
       │                     │  4. Pi polls config  │
       │                     │◄────────────────────│
       │                     │  → returns config    │
       │                     │    + test flag       │
       │                     │────────────────────►│
       │                     │                     │
       │                     │  5. Pi captures      │
       │                     │     + uploads image  │
       │                     │◄────────────────────│
       │                     │  S3 + DynamoDB       │
       │                     │                     │
       │                     │  6. Pi reports health│
       │                     │◄────────────────────│
       │                     │  DEVICE# updated     │
       │                     │                     │
       │  7. Image appears   │                     │
       │◄────────────────────│                     │
       │  + health updates   │                     │
       │                     │                     │
       │  8. Adjust config   │                     │
       │────────────────────►│  DEVICE# updated    │
       │                     │                     │
       │                     │  9. Next poll picks  │
       │                     │     up new config    │
       │                     │◄────────────────────│
```

---

## 6. AWS Cost Impact Analysis

**Constraint**: Monthly cost must not exceed ~$1.18/month ($5/month ceiling). Hard-stop review required for any increase.

| Item | Service | Cost Impact | Notes |
|------|---------|-------------|-------|
| R-01/R-02 Delete endpoints | DynamoDB + S3 | $0.00 | Delete ops reduce storage |
| #160 Avatar S3 storage | S3 | +$0.00–$0.01/month | ~500KB × 10 users = 5MB |
| #210 Device entity storage | DynamoDB | +$0.00/month | ~500 bytes × 20 devices = 10KB |
| #210 Config poll reads | DynamoDB | +$0.00–$0.01/month | 24 reads/day × 20 devices = 480/month (free tier: 25 RCU) |
| #210 Health report writes | DynamoDB | +$0.00–$0.01/month | Same frequency as config polls |
| #210 Test shot flag | DynamoDB | $0.00 | Piggybacks on config poll |
| **Total** | | **~$0.00–$0.03/month** | Well within $5 ceiling |

---

## 7. Design Documentation (required before implementation)

### Wave 0 — Resource Deletion
- [ ] API contract: `DELETE /beds/:bedId` and `DELETE /images/:imageId`
- [ ] Cascade diagram: bed → images → S3 → tags

### Wave 1 — Profile Picture
- [ ] API contract: `POST /me/avatar`, `DELETE /me/avatar`
- [ ] UX wireframe: avatar widget in ProfilePage

### Wave 2 — Device Data Model + API
- [ ] **ADR**: Device data model (DEVICE# entity, PK/SK, access patterns, future multi-camera path)
- [ ] Data model diagram with relationship to FARM# and BED#
- [ ] API contracts: all 6 device endpoints (list, register, config, update, delete, health)
- [ ] Config response schema (what capture.sh receives)

### Wave 3 — Device Management UI
- [ ] UX wireframes: device list, registration form, credentials panel, config panel, health indicators
- [ ] Status derivation logic: green/yellow/red thresholds

### Wave 4 — Test Shot + Setup Guide
- [ ] UX wireframe: test shot flow (button → polling → preview)
- [ ] Setup guide content outline (6 steps with pre-filled commands)
- [ ] Sequence diagram: test shot request → Pi poll → capture → upload → display

### Wave 5 — Device-Side Updates
- [ ] capture.sh modification spec (config poll, health report, test flag)
- [ ] node.conf schema update (DEVICE_ID field)

All design docs stored under `docs/designs/BETA5-*.md`.

---

## 8. Estimated Effort

| Wave | Items | Estimate |
|------|-------|----------|
| Wave 0 | R-01, R-02 (resource deletion) | ~2 hrs |
| Wave 1 | #160 (profile picture) | ~4 hrs |
| Wave 2 | #210 device data model + API | ~5 hrs |
| Wave 3 | #210 device management UI | ~5 hrs |
| Wave 4 | #210 test shot + setup guide | ~3 hrs |
| Wave 5 | capture.sh device-side updates | ~2 hrs |
| **Total** | | **~21 hrs** |

---

## 9. Exit Criteria

- [ ] Users can delete beds and images they own
- [ ] Users can upload, display, and remove profile pictures
- [ ] Admins/managers can register camera nodes from web UI
- [ ] Registration shows copyable credentials for Pi config
- [ ] All device settings configurable from web UI (interval, resolution, quality, hours, bed)
- [ ] Pi polls config API and applies changes on next capture cycle
- [ ] Device health visible on Manage page (last image, online/offline, battery, WiFi, spool)
- [ ] "Take Test Shot" triggers immediate capture and displays preview
- [ ] In-app setup guide walks user through camera node connection
- [ ] capture.sh updated to poll config + report health + handle test shots
- [ ] No MUST-FIX findings from cc-review
- [ ] All tests pass + new coverage (target: 430+)
- [ ] Deployed and manually verified with real Pi camera node
- [ ] Tagged as v0.32 on develop

---

## 10. Post Beta-5 → Production

After Beta-5, the platform covers the complete user journey:

```
Register → Create Farm → Add Beds → Connect Camera → Configure Schedule
    → Monitor Crops → Tag Observations → Chat with AI Advisor
    → Manage Account → Admin Dashboard → Activity Log → Notifications
```

**Remaining for Production (v1.0)**:
- MFA support
- Custom domain
- Social login (Google/LINE)
- Offline/service-worker for field use
- Performance optimization (admin Scan → GSI)
- Frontend test suite + E2E tests
- Multi-camera per bed (Beta-6)
- Motion detection config (Beta-6)
- QR code device pairing (future)
- Cognito M2M device credentials (future)
- #168 Soft delete (if promoted from PENDING)
- #183 AI chat everywhere (if promoted from PENDING)

---

*Created: 2026-04-01 | Updated with user interview results | Prerequisite: Beta-4 (v0.31)*
