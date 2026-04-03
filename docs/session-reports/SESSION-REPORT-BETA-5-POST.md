# Session Report: Beta-5 Post-Implementation Testing & Polish

> **Session**: beta5 (continued)
> **Date**: 2026-04-02 — 2026-04-03
> **Baseline**: v0.33 (511 tests, Beta-5 implementation complete)
> **Final**: develop in sync with origin, 511 tests, device connection validated
> **Context used**: ~780k / 1M (78%)

---

## Summary

Extended testing and polish session following Beta-5 implementation. Focused on live testing, UX refinement from user feedback, and validating the first real hardware connection (Raspberry Pi → AWS → web dashboard). The session uncovered 8 bugs, delivered 10 UX improvements, validated the core product promise (device-to-cloud connectivity), and defined the Diary feature roadmap for Beta-7/8. Sprint order decided: Beta-6 → Beta-7 → Beta-8 → Infra Sprint.

---

## Metrics

| Metric | Value |
|--------|-------|
| PRs merged to main | ~20 |
| Issues created | 15 (#223, #226–#227, #230, #232–#233, #238–#242, #245–#248, #250) |
| Issues closed | 8 (#223, #226, #227, #230, #241 + auto-closed) |
| Bug fixes (live testing) | 8 |
| UX improvements | 10 |
| Scripts created | 2 (test-device-heartbeat.sh, test-camera-focus.sh) |
| Mockups created | 1 (device-flow-animation.html) |
| DynamoDB records updated | 2 (role migration for h34muk) |
| i18n terminology change | 40 occurrences (農場→農園) |

---

## Live Testing Bugs Fixed

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Profile picture upload 400 | FormData field `file` instead of `image` | PR #222 |
| Profile picture upload 500 | sharp arm64 binaries missing in Lambda | PR #224 (CDK commandHooks) |
| Profile picture not displaying | DynamoDB keys never saved/read | PR #225 |
| Device config labels raw keys | Missing i18n keys for DeviceConfigForm | PR #235 |
| Leaflet map tile misalignment | CSS not loaded, no marker icon fix | PR #229 |
| Weather map gap | min-height: 100vh on grid + 80px padding | PR #252, #253 |
| .env source not exported | Missing `export` prefix in downloaded config | Inline fix |
| Camera not detected | Script checked libcamera-jpeg, not rpicam-still | Script fix |

## UX Improvements Delivered

| Feature | Issue | PR |
|---------|-------|-----|
| Member avatars in farm profile | #226 | #228 |
| Farm location map (profile + weather) | #227 | #228, #237 |
| Role labels: Admin/Owner/Staff | #230 | #231 |
| Crop impact empty state message | — | #254 |
| Downloadable .env config file | — | #236 |
| Refresh token display on registration | — | #236 |
| Setup guide simplified to 3 steps | #241 | #243, #255 |
| Observer device controls hidden | — | #249 |
| 農場→農園 terminology | — | #244 |
| Weather map full-width layout | — | #251 |

## Device Connection Validated

### What was tested
1. **Heartbeat**: Mac terminal → `test-device-heartbeat.sh` → AWS API → DynamoDB → web dashboard shows Online
2. **Config poll**: Script retrieves device settings (interval, resolution, bed_id)
3. **Token refresh**: Script auto-obtains access token from Cognito refresh token
4. **Camera detection**: `rpicam-still` detected on Bookworm OS

### What remains to test
- Camera capture + upload via `test-camera-focus.sh`
- Timelapse playback with accumulated images
- Periodic capture over extended period

## New Feature Concepts

### Farm Diary (Beta-7/8)
- **Work Log** (#246): daily entries with categories, bed references, cost tracking
- **Calendar** (#247): monthly view + crop lifecycle Gantt chart
- **ROI Dashboard** (#248): cost analysis, harvest yields, season comparison
- New nav tab: 📓 Diary (5th tab)

### Manager Promote (#250)
- Managers can promote observers to owner role via member list button

## Sprint Order Decision

```
Beta-6 → Beta-7 → Beta-8 → Infra Sprint
```

Rationale: Build all features on mvp stack, test thoroughly, then one clean infrastructure transition to production.

| Sprint | Focus | Key Issues |
|--------|-------|------------|
| Beta-6 | Pi setup + refinements | #233, #232, #216, #242, #250 |
| Beta-7 | Farm Diary | #245, #246, #247 |
| Beta-8 | ROI + backlog | #248, #183, #168 |
| Infra | Production launch | #238, #239, #240 |

## Production Readiness Status

| Item | Status |
|------|--------|
| Device heartbeat | ✅ Validated |
| Camera capture + upload | ⬜ Script ready, needs Pi test |
| Profile picture | ✅ Working (upload, display, remove) |
| Role system | ✅ Display done, internal rename #232 |
| Observer permissions | ✅ Device controls hidden |
| Farm location maps | ✅ Profile + Weather pages |
| i18n (EN + JA) | ⚠️ Needs full audit |
| Custom domain | ⬜ #238 |
| Production resources | ⬜ #239 |
| Pi setup automation | ⬜ #233 |

## Scripts Delivered

| Script | Purpose |
|--------|---------|
| `scripts/test-device-heartbeat.sh` | Auto-token-refresh + config poll + heartbeat |
| `scripts/test-camera-focus.sh` | Rapid capture + upload loop for focus testing |

## Open Issues Summary (13)

| Category | Issues |
|----------|--------|
| Infra | #238, #239, #240 |
| Refinements | #232, #250, #242 |
| Pi/Device | #233 |
| Features | #216, #245–#248 |
| Backlog | #183, #168 |
