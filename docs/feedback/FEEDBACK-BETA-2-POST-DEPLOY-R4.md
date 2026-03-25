# Beta-2 Post-Deploy Feedback Round 4 (v0.28)

> Date: 2026-03-25
> Source: Live testing on deployed site

---

## F-07 (continued): Settings still leaking between accounts

**Severity**: HIGH
**Status**: STILL OCCURRING after deploy. The clearTokens() fix may not be sufficient, or the deploy didn't include the latest build.

**Additional investigation needed**:
- Verify the deployed JS bundle contains the clearTokens() changes
- Check if there's a CloudFront cache serving stale JS
- Consider: does the theme also get applied via CSS `data-theme` attribute which persists on `<html>` across Astro page navigations (SPA-like behavior)?

---

## F-09: Observer onboarding — no farm selection during registration

**Severity**: HIGH
**Symptoms**: Observer creates account → lands on Profile → sees "Add Farm" wizard fields → no option to browse/join existing farms
**Expected**: Observer should see FarmDiscovery component with discoverable farms to request joining
**Root cause**: The FarmDiscovery component is rendered when `farms.length === 0`, but:
1. The observer may see the "New Farm" wizard button which is irrelevant for observers
2. The FarmDiscovery component requires the observer to already be logged in and on the Profile page
3. The registration flow doesn't guide observers toward farm discovery — it just dumps them on Profile

**Additional finding (mobile)**: On mobile, observer DID see "Request to Join" buttons for listed farms in Profile, but clicking them did nothing — no toast, no network request, no error. The button appears non-functional.

**Possible causes for non-functional button**:
1. API endpoint `POST /farms/:farmId/join` may not be deployed yet (new route added in this session)
2. The button's onClick handler may be swallowed by a parent click handler (same click propagation issue seen in Wave 0)
3. CORS may be blocking the POST request (new endpoint, check API Gateway CORS config)
4. The `requestToJoinFarm()` API call may be silently failing and the `.catch()` isn't showing a toast

**Fix needed**:
- Debug the join button: check browser console on mobile for errors
- Verify POST /farms/:farmId/join is registered and deployed
- Hide "New Farm" button for observers (preferred_role === 'observer')
- Ensure FarmDiscovery is prominently shown for observers with no farms
- Consider: show FarmDiscovery ABOVE the "no farms" message, not below
- Future: integrate farm selection into the registration wizard itself (F4 feedback from Beta-1)

---

## F-10: Crop data fields accept nonsensical dates

**Severity**: MEDIUM
**Symptoms**:
- "Start date" (planted_at) accepts future dates (e.g., 2030) — makes no sense for an already-planted crop
- "Harvest date" accepts past dates before the start date
- Date display doesn't show the year — ambiguous for multi-year tracking

**Fix needed**:
- Client-side validation: planted_at <= today, expected_harvest >= planted_at
- Date display: include year (e.g., "Mar 25, 2026" not "Mar 25")
- Consider: server-side validation for date range sanity

---

## F-11: Device page needs camera node association controls

**Severity**: MEDIUM
**Page**: /manage/ (Device tab)
**Symptoms**: Device page shows a node ("phone camera") but there's no UI to:
- Associate a camera node with a specific bed
- Remove a camera node association
- Add a new camera node

**Current state**: Camera nodes appear automatically when they upload images. The `target_bed` column shows which bed the last upload targeted. But there's no way to change this mapping.

**Fix needed (Beta scope)**:
- Add "Associate" button per node → dropdown to select a bed
- Add "Remove" button per node → confirm dialog
- API: PATCH endpoint to update camera node → bed mapping
- This requires a camera-node entity or at minimum a bed-level `camera_node_id` field

**Future scope**:
- Camera node registration flow (QR code or manual ID entry)
- Multiple nodes per bed
- Node health monitoring (last upload time, battery, connectivity)

---

## F-12: Observer sees "Add New Farm" button in Profile

**Severity**: MEDIUM
**Symptoms**: Observer account shows "Add New Farm" / wizard button on Profile page
**Expected**: Observers should NOT see farm creation controls — they join farms, not create them
**Fix needed**: Hide the "New Farm" / wizard button when `preferred_role === 'observer'`

---

## Priority

| # | Issue | Severity | Scope |
|---|-------|----------|-------|
| F-07 | Settings leak (still) | HIGH | Debug deploy / cache |
| F-09 | Observer can't join farms | HIGH | Beta-2 hotfix |
| F-10 | Date validation + display | MEDIUM | Beta-2 or PROD |
| F-11 | Device node association | MEDIUM | PROD (needs design) |
| F-12 | Observer sees "Add New Farm" | MEDIUM | Beta-2 hotfix |

---

*Collected: 2026-03-25 | v0.28 post-deploy round 4*
