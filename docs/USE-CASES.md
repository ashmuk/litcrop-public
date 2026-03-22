# USE-CASES.md — LitCrop Personas & Daily Operations

> Date: 2026-03-21
> Scope: MVP+ (v1.0) — 5 users on 1 shared farm
> Location: Nagano Prefecture, Japan (36.0, 138.3, ~760m)
> Season: April 2026 — early spring planting season (last frost ~mid-April)

---

## 1. Farm Context

### The Farm

| Attribute | Value |
|-----------|-------|
| Name | Tanaka Farm (田中農園) |
| Location | Nagano Prefecture, Japan |
| Elevation | ~760m |
| Climate | Humid continental (Dfa/Dfb), USDA Zone 7a |
| Size | 3 fields, 8 beds, ~20 plots |
| Crops (spring) | Lettuce, spinach, daikon, tomato seedlings, cucumber seedlings |
| Connectivity | LTE (SORACOM IoT SIM) + home Wi-Fi |
| Camera nodes | 1-2 Raspberry Pi Zero 2 W (periodic + motion-triggered) |

### MVP+ User Model

For the April field evaluation, **5 users share 1 farm**. Each user has their own account (Cognito) but all access the same farm via the existing single-farm model. Multi-farm (N1) is deferred to PRODUCTION-1.

> **Note**: The current data model ties a farm to a single `user_id`. For MVP+ shared access, either: (a) all 5 users share the same Cognito credentials, or (b) the ownership middleware is relaxed to allow read access for a set of approved users. Decision needed — see Section 5.

---

## 2. Personas

### Persona Template

```markdown
### P-XX: [Name] — [Role]

| Attribute | Description |
|-----------|-------------|
| **Who** | [Background, relationship to farm] |
| **Age / Tech** | [Age range, device, technical comfort] |
| **Language** | [Primary language, bilingual?] |
| **Goal** | [What they want from LitCrop] |
| **Frequency** | [How often they check, when] |
| **Context** | [Where they use it, conditions] |
| **Pain point** | [What problem LitCrop solves for them] |
| **Success metric** | [How they judge "this works"] |
```

---

### P-01: Tanaka Kenji (田中健二) — Farm Owner

| Attribute | Description |
|-----------|-------------|
| **Who** | 58, owns and operates Tanaka Farm. Lives 5 min drive from fields. Grows vegetables for local direct sales (michi-no-eki) and family consumption. |
| **Age / Tech** | Late 50s. Uses iPhone 13 daily. Comfortable with LINE, weather apps, Google Maps. Not a power user. |
| **Language** | Japanese primary. Can read basic English UI labels. |
| **Goal** | Check crop status remotely before deciding which fields to visit today. Reduce unnecessary trips to the farm during busy season. |
| **Frequency** | 2-3x daily: morning (6am, with coffee), midday (quick glance), evening (review). |
| **Context** | Morning: kitchen table (Wi-Fi). Midday: in the field, phone in one hand, dirty hands (LTE). Evening: home (Wi-Fi). |
| **Pain point** | Currently drives to all 3 fields every morning to check conditions. 45 min round trip. Some days nothing has changed. |
| **Success metric** | "I skipped a trip because the app showed everything was fine — and it actually was fine." |

---

### P-02: Tanaka Yuki (田中優希) — Farm Owner's Daughter

| Attribute | Description |
|-----------|-------------|
| **Who** | 28, helps on weekends. Lives in Matsumoto (30 min away). Works as an office employee during the week. Interested in eventually taking over the farm. |
| **Age / Tech** | Late 20s. iPhone 15, very comfortable with apps. Uses Instagram, note-taking apps. |
| **Language** | Japanese and English (bilingual). Switches LitCrop to English sometimes. |
| **Goal** | Stay informed about the farm remotely during workdays. Learn which crops need attention so she can help efficiently on weekends. |
| **Frequency** | 1x daily on weekdays (evening, 5 min). 3-4x on weekends when at the farm. |
| **Context** | Weekday: phone on train or at home (Wi-Fi/LTE). Weekend: at the farm, outdoors, bright sun. |
| **Pain point** | Arrives on Saturday not knowing what happened during the week. Wastes time asking dad "what needs doing?" instead of jumping into tasks. |
| **Success metric** | "By Friday evening I already know Saturday's task list from looking at the app." |

---

### P-03: Suzuki Hiroshi (鈴木宏) — Neighbor Farmer

| Attribute | Description |
|-----------|-------------|
| **Who** | 63, neighboring farmer. Grows rice (main) and some vegetables. Curious about technology but cautious. Tanaka invited him to try LitCrop. |
| **Age / Tech** | Early 60s. Android phone (Pixel 7a). Uses it for calls, LINE, and weather. Rarely downloads new apps. |
| **Language** | Japanese only. |
| **Goal** | See if remote monitoring is worth the effort. Compare his approach with Tanaka's. Wants to learn without committing too much. |
| **Frequency** | 1x daily, maybe. Will drop off if it's confusing. |
| **Context** | Home, evening, after dinner. Wi-Fi. Will not use it in the field (too busy with hands-on work). |
| **Pain point** | Skeptical. His pain point is curiosity — "Will this actually help, or is it just a gadget?" |
| **Success metric** | "I kept using it for 2 weeks without getting frustrated. I learned something I didn't know about my crops." |

---

### P-04: Watanabe Mika (渡辺美香) — Local Agricultural Advisor

| Attribute | Description |
|-----------|-------------|
| **Who** | 42, works at the local JA (agricultural cooperative). Advises ~20 small farms in the region. Tanaka asked if she'd look at his LitCrop data. |
| **Age / Tech** | Early 40s. iPad and iPhone. Uses Excel, LINE, and the JA's internal system. Tech-comfortable for her role. |
| **Language** | Japanese primary. Reads English technical terms. |
| **Goal** | Review Tanaka's crop images and weather data to give better advice remotely. Currently she visits farms for visual inspection. |
| **Frequency** | 2-3x per week, 5-10 min per check. Deeper review before scheduled farm visits. |
| **Context** | Office (desktop, Wi-Fi) or in her car between farm visits (iPad, LTE). |
| **Pain point** | Visits 20 farms and can only spend 30 min at each. If she could pre-screen remotely, she'd focus her time on farms that actually need help. |
| **Success metric** | "I spotted an issue on the app before my scheduled visit, so I brought the right treatment." |

---

### P-05: Tanaka Akira (田中明) — Farm Owner's Son (University Student)

| Attribute | Description |
|-----------|-------------|
| **Who** | 20, studying agriculture at university in Tokyo. Comes home during breaks. Interested in smart farming. Set up the Raspberry Pi camera for dad. |
| **Age / Tech** | 20. MacBook + iPhone 16. Technically savvy — has done some coding. Set up the camera node. |
| **Language** | Japanese and English (fluent in both). Prefers English UI. |
| **Goal** | Monitor the camera node he set up. Experiment with time-lapse. Show his professor the system as a case study. |
| **Frequency** | 1-2x daily from Tokyo. More during university breaks. |
| **Context** | University dorm or library (Wi-Fi). Phone on train. |
| **Pain point** | 300km from the farm. Can only visit during breaks. Wants to contribute remotely and prove smart farming works. |
| **Success metric** | "The time-lapse clearly shows my tomato seedlings growing over 2 weeks. I used it in my agriculture tech presentation." |

---

## 3. Daily Operations — Use Cases

### UC Template

```markdown
### UC-XX: [Title]

| Field | Value |
|-------|-------|
| **Actor** | [Persona ID(s)] |
| **Trigger** | [What starts this use case] |
| **Frequency** | [How often] |
| **Duration** | [How long] |
| **Preconditions** | [What must be true] |
| **Feature deps** | [Which features are needed] |
| **Scope** | [MVP+ / PROD-1 / PROD-2] |

**Steps:**
1. ...
2. ...

**Success:** [Expected outcome]
**Failure:** [What goes wrong, how system handles it]
```

---

### UC-01: Morning Crop Check

| Field | Value |
|-------|-------|
| **Actor** | P-01 (Tanaka Kenji), P-02 (Yuki, weekdays) |
| **Trigger** | Wake up, first thing with coffee |
| **Frequency** | Daily, 6-7am |
| **Duration** | 2-3 minutes |
| **Preconditions** | Logged in, farm exists, camera has uploaded overnight images |
| **Feature deps** | Farm Overview, weather strip, plot status, image timeline |
| **Scope** | MVP (existing) |

**Steps:**
1. Open LitCrop on phone
2. Farm Overview loads — scan weather strip (temperature, condition, rain overnight)
3. Scan plot tiles — all green (Healthy)? Any amber/red (Issue)?
4. If issue spotted: tap plot tile, view latest image
5. Decide: visit field today or skip

**Success:** Kenji decides in 2 minutes whether to drive to the farm.
**Failure:** Images didn't upload (camera offline) — sees "No recent images" warning. Decides to visit anyway.

---

### UC-02: Growth Review via Time-Lapse

| Field | Value |
|-------|-------|
| **Actor** | P-01, P-02, P-05 (Akira from Tokyo) |
| **Trigger** | Wants to review crop progress over the past week |
| **Frequency** | 2-3x per week |
| **Duration** | 3-5 minutes |
| **Preconditions** | Plot has 7+ days of images |
| **Feature deps** | **F-14 (time-lapse)**, image timeline, plot detail |
| **Scope** | **MVP+** (NEW) |

**Steps:**
1. Navigate to Plot Detail for tomato seedlings
2. Tap "Play" on image history → time-lapse starts
3. Watch 7 days of growth in 15 seconds (adjustable speed)
4. Notice growth stalled around day 4 (after heavy rain)
5. Pause, zoom into that image
6. Tag as "Slow Growth", add note: "possible waterlogging"

**Success:** User visually confirms growth trend without comparing images one by one.
**Failure:** Only 2 images in 7 days (camera was down) — time-lapse is too short to be useful. System shows "Not enough images for playback."

---

### UC-03: AI-Assisted Decision Making

| Field | Value |
|-------|-------|
| **Actor** | P-01, P-04 (Watanabe, advisor) |
| **Trigger** | Sees an issue in images, wants advice |
| **Frequency** | 2-3x per week |
| **Duration** | 3-5 minutes |
| **Preconditions** | Chat available (stub or live), farm data exists |
| **Feature deps** | AI Chat, tool use (farm data + weather), **SF-4 (Markdown rendering)** |
| **Scope** | MVP+ (SF-4 is new; chat itself exists) |

**Steps:**
1. From Plot Detail, tap "Ask AI" (or navigate to chat)
2. Ask: "My tomatoes look like they stopped growing. What could be wrong?"
3. Chat queries farm data (crop type, planting date) + weather (last 7 days)
4. Response appears with **formatted Markdown** — bold headers, bulleted list of possible causes
5. User reads suggestions, decides next action

**Success:** AI provides actionable, location-specific advice formatted clearly.
**Failure:** Chat returns stub response (no API key) — still provides seasonal tips, just not personalized.

---

### UC-04: Remote Monitoring from Distance

| Field | Value |
|-------|-------|
| **Actor** | P-02 (Yuki from Matsumoto), P-05 (Akira from Tokyo) |
| **Trigger** | Wants to stay connected to the farm while away |
| **Frequency** | Daily (weekdays) |
| **Duration** | 3-5 minutes |
| **Preconditions** | Logged in, LTE/Wi-Fi, farm has recent data |
| **Feature deps** | All existing MVP features + time-lapse (F-14) |
| **Scope** | MVP+ |

**Steps:**
1. Open app on phone (train commute or evening)
2. Check Farm Overview — weather looks good, all plots healthy
3. Tap into lettuce plot — scroll through today's images
4. Play time-lapse for the week — growth looks strong
5. Send screenshot to family LINE group: "Lettuce looking great!"

**Success:** Remote user feels connected and informed without being physically present.
**Failure:** Images are from 3 days ago (camera offline) — user can't tell current state. Needs notification system (future).

---

### UC-05: Weather-Based Planning

| Field | Value |
|-------|-------|
| **Actor** | P-01, P-03 (Suzuki, neighbor) |
| **Trigger** | Forecast shows rain/frost/heat |
| **Frequency** | When weather changes |
| **Duration** | 2 minutes |
| **Preconditions** | Weather data loading, farm location set |
| **Feature deps** | Weather page, crop impact cards, 7-day forecast |
| **Scope** | MVP (existing) |

**Steps:**
1. Open Weather page
2. See 7-day forecast — frost warning for Thursday night
3. Crop impact card: "Frost risk: Tomato seedlings (C2, C3) are frost-sensitive"
4. Decide to cover seedlings Wednesday evening
5. Wind direction shows "N 8 km/h" — knows cold air comes from the north side

**Success:** User takes preventive action before weather event.
**Failure:** Weather data stale (API timeout) — shows cached data with timestamp. User sees "Last updated: 2 hours ago."

---

### UC-06: Image Upload from Phone

| Field | Value |
|-------|-------|
| **Actor** | P-01, P-02 (at the farm on weekends) |
| **Trigger** | Notices something while in the field, wants to document it |
| **Frequency** | 2-5x per field visit |
| **Duration** | 30 seconds per photo |
| **Preconditions** | At the farm, phone in hand, on the Plot Detail page |
| **Feature deps** | Phone camera upload (A7), PlotDetail |
| **Scope** | MVP (existing) |

**Steps:**
1. Standing next to tomato plot, notices leaf discoloration
2. Opens Plot Detail for that plot
3. Taps camera icon → phone camera opens
4. Takes photo → auto-uploads
5. Tags as "Possible Issue"
6. Later, reviews with advisor (UC-07)

**Success:** Photo uploaded, tagged, visible in timeline within 30 seconds.
**Failure:** File too large (>2MB) — toast shows "Image too large. Please try again."

---

### UC-07: Advisor Remote Review

| Field | Value |
|-------|-------|
| **Actor** | P-04 (Watanabe, agricultural advisor) |
| **Trigger** | Scheduled weekly review of client farms |
| **Frequency** | 2-3x per week |
| **Duration** | 5-10 minutes per farm |
| **Preconditions** | Has access to Tanaka's farm data, desktop browser |
| **Feature deps** | Desktop layout, image timeline, weather history, **F-14 (time-lapse)** |
| **Scope** | MVP+ |

**Steps:**
1. Opens LitCrop on iPad (desktop layout)
2. Reviews Farm Overview — 2 plots show "Possible Issue"
3. Opens first plot — views time-lapse of last 7 days
4. Notices yellowing leaves progressing from day 3
5. Checks weather — 3 consecutive rainy days before yellowing started
6. Opens chat: "What causes yellowing in spinach after heavy rain?"
7. AI suggests nitrogen leaching from waterlogged soil
8. Sends Tanaka a LINE message: "Add nitrogen-rich fertilizer to spinach plot. I'll check on my next visit Thursday."

**Success:** Advisor diagnoses remotely, saving a dedicated visit.
**Failure:** Can't see enough detail in thumbnails — needs **FR-3.5 (lightbox)** to zoom.

---

### UC-08: Farm Setup (New User Onboarding)

| Field | Value |
|-------|-------|
| **Actor** | P-03 (Suzuki, new user) |
| **Trigger** | First time using LitCrop |
| **Frequency** | Once |
| **Duration** | 5-10 minutes |
| **Preconditions** | Has the app URL, email address |
| **Feature deps** | Auth (register/login), farm setup, **F-09 (map picker)**, **F-10 (elevation)** |
| **Scope** | MVP+ (F-09, F-10 are new) |

**Steps:**
1. Opens LitCrop URL on phone
2. Taps "Register" — enters email, creates password
3. Receives verification code via email — enters it
4. Redirected to farm setup
5. Types farm name: "鈴木農園"
6. **Taps map to pin farm location** (NEW: F-09 — currently must type coordinates)
7. **Elevation auto-fills**: 745m (NEW: F-10)
8. Climate profile auto-detected: Zone 7a, last frost mid-April
9. Farm created — redirected to empty Farm Overview
10. Sees CTA: "Add your first crop plot" → follows wizard

**Success:** New user has a working farm in under 5 minutes, without knowing GPS coordinates.
**Failure:** Map picker doesn't load (JS error) — falls back to manual lat/lng input (existing).

---

### UC-09: Skeptic's First Week

| Field | Value |
|-------|-------|
| **Actor** | P-03 (Suzuki, cautious adopter) |
| **Trigger** | Tanaka showed him the app, he's trying it for a week |
| **Frequency** | Once daily, evening |
| **Duration** | 1-2 minutes |
| **Preconditions** | Account set up (UC-08), 1-2 plots added, camera uploading |
| **Feature deps** | Farm Overview, simple navigation, Japanese UI |
| **Scope** | MVP (existing) |

**Steps:**
1. Opens app after dinner
2. Sees Farm Overview — 2 plots, both "Healthy"
3. Checks weather for tomorrow — sunny, 18C
4. Taps into daikon plot — sees today's image, looks normal
5. Closes app — done

**Success:** Used it 7 days in a row without confusion. Tells Tanaka "it's not bad."
**Failure:** Gets lost in navigation, can't find his plots, gives up on day 3. Critical: Japanese UI must be complete, no English-only labels.

---

### UC-10: Student's Case Study

| Field | Value |
|-------|-------|
| **Actor** | P-05 (Akira, university student) |
| **Trigger** | Agriculture tech course assignment: "Present a smart farming case study" |
| **Frequency** | Weekly data collection, one presentation |
| **Duration** | 15-20 minutes per data collection session |
| **Preconditions** | Farm has 2+ weeks of image data, time-lapse working |
| **Feature deps** | **F-14 (time-lapse)**, image timeline, weather page, desktop layout, **FR-3.6 (side-by-side)** |
| **Scope** | MVP+ |

**Steps:**
1. Opens LitCrop on MacBook (desktop layout)
2. Selects tomato seedling plot
3. Plays time-lapse of 14 days — records screen for presentation
4. Uses side-by-side comparison (FR-3.6): day 1 vs day 14
5. Exports weather data view as screenshot
6. Includes in PowerPoint: "Remote crop monitoring using IoT cameras and AI advisory"
7. Professor asks: "Can it detect diseases automatically?" — Akira: "That's in the roadmap."

**Success:** Compelling visual demonstration of crop growth monitoring.
**Failure:** Time-lapse only has every-other-day images (camera uptime issues) — still works but less smooth.

---

## 4. Feature-to-Use-Case Mapping

| Feature | UC-01 | UC-02 | UC-03 | UC-04 | UC-05 | UC-06 | UC-07 | UC-08 | UC-09 | UC-10 |
|---------|-------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
| Farm Overview | X | | | X | X | | X | | X | |
| Plot Detail | X | X | | X | | X | X | | X | X |
| Weather | X | | X | | X | | X | | X | X |
| Image Timeline | | X | | X | | | X | | | X |
| Manual Tagging | | X | | | | X | | | | |
| AI Chat | | | X | | | | X | | | |
| Phone Upload | | | | | | X | | | | |
| Auth/Register | | | | | | | | X | | |
| **F-14 Time-lapse** | | **X** | | **X** | | | **X** | | | **X** |
| **F-09 Map picker** | | | | | | | | **X** | | |
| **F-10 Elevation** | | | | | | | | **X** | | |
| **SF-4 Markdown chat** | | | **X** | | | | **X** | | | |
| **FR-3.5 Lightbox** | | | | | | | **X** | | | X |
| **FR-3.6 Side-by-side** | | | | | | | | | | **X** |
| Desktop layout | | | | | | | X | | | X |

**Key insight**: F-14 (time-lapse) is used in 4 of 10 use cases — the highest of any MVP+ new feature. This validates its P0 priority.

---

## 5. Open Questions for MVP+ Shared Farm Access

The current data model enforces single-owner farms (`user_id` on Farm record). For 5 users sharing 1 farm, we need a decision:

| Option | Approach | Effort | Trade-off |
|--------|----------|--------|-----------|
| A | Shared credentials (all 5 use same login) | Zero | No individual tracking, poor security |
| B | Read-only access list (new `FARM_MEMBER#` DynamoDB records) | M | Preserves ownership, adds read access |
| C | Full multi-farm (N1 from PROD-1, pulled forward) | L | Over-engineering for field eval |
| **D** | **Owner creates farm + adds plots; others get read-only via shared `farmId` in URL** | **S** | **Pragmatic: skip ownership check for GET routes, keep POST protected** |

**Recommendation**: Option D for MVP+ field evaluation. The farm owner (P-01) creates and manages. Others bookmark the farm URL. GET routes allow any authenticated user to read; POST/PATCH/DELETE remain owner-only. This is ~30 min of work (relax ownership middleware for read paths) and avoids pulling N1 forward.

---

## 6. Adding New Personas & Use Cases

To add a new persona, copy the template from Section 2 and fill in the attributes. Assign a sequential ID (P-06, P-07, etc.).

To add a new use case, copy the template from Section 3. Link it to existing or new personas. Update the feature mapping table in Section 4.

**Suggested future personas** (for PRODUCTION-1+):
- P-06: Part-time farmer (weekend only, primary job elsewhere)
- P-07: Farm-to-table restaurant owner (wants to verify supplier's crop quality)
- P-08: Agricultural researcher (wants data export, historical analysis)
- P-09: JA cooperative manager (oversees multiple advisor accounts)

---

---

## 7. MVP+ Field Evaluation Scenario (2026-03-22)

> Source: `docs/MVP-PLUS-SCENARIO.md` — concrete 3-user evaluation scenario
> Status: APPROVED — scope decisions confirmed
> Relationship: Complements Sections 2-4 above. Original personas (P-01..P-05) represent the Nagano farm story. This section defines the **actual evaluation personas and walkthrough** for the April field test.

### 7.1 Evaluation Personas

| ID | Name | Role | Description |
|----|------|------|-------------|
| **A** | Muk | Site Admin | Operates and supports the MVP+ LitCrop prototype. Creates demo data, onboards B and C, monitors system stats via admin-only views. |
| **B** | Kiku | Farm Manager | Creates and manages his own farm. Full read/write access. Sets up crops, installs camera nodes, adds observers. |
| **C** | Yama | Farm Observer | Read-only user. Cannot create farms. Joins B's farm when added by A or B. Views crops, watches time-lapse. |

#### Role Capability Matrix

| Capability | A (Admin) | B (Manager) | C (Observer) |
|------------|:---------:|:-----------:|:------------:|
| Create farm | Yes (demo seed) | Yes | No |
| Edit farm / crops | Yes (demo) | Yes (own farm) | No |
| View farm data | All farms | Own farms | Joined farms |
| Install camera node | — | Yes | No |
| Add members to farm | Yes | Yes (own farm) | No |
| Access admin stats | Yes | No | No |
| Use AI assistant | Yes | Yes | Yes |
| Switch between farms | Yes | Yes | Yes |

#### Mapping to Original Personas

| Eval Persona | Closest Original | Key Difference |
|-------------|-----------------|----------------|
| A (Muk) — Admin | P-05 (Akira, tech-savvy) | Admin role, system operator |
| B (Kiku) — Manager | P-01 (Tanaka Kenji, farm owner) | Creates farm from scratch, manages IoT |
| C (Yama) — Observer | P-03 (Suzuki, cautious neighbor) | Read-only, joins existing farm |

### 7.2 Scenario Overview

**Setup**: 3 end-users, 2 farms
- **Demo farm** — pre-seeded by A with sample data (beds, crops, images) for onboarding
- **B's farm** — created by B through the farm creation wizard

### 7.3 Scenario Walkthrough

#### Step 1: Onboarding

| Actor | Action |
|-------|--------|
| **A** | Creates demo farm with pre-seeded data (beds, crops, sample images) so new users can explore without creating a farm first. |
| **A** | Onboards B and C to the LitCrop prototype (account creation via Cognito). |
| **A** | Monitors onboarding progress via admin-only stats view. |
| **B** | Logs in for the first time. Sees the Demo farm. Explores the app. Optionally uses AI assistant to learn how things work. |
| **C** | Logs in for the first time. Sees the Demo farm. Browses as a reader. Optionally uses AI assistant for guidance. |
| **B, C** | Both are now onboarded and familiar with the app through the Demo farm. |

**Feature deps**: Auth (existing), Demo farm seed (new), AI assistant (existing stub), Admin stats (existing)

#### Step 2: New Farm Creation (B)

1. B optionally asks the AI assistant: *"How do I create a farm?"* — it answers with guidance.
2. B enters the **[Profile]** menu. It shows two sections: **"Farm"** and **"You"**.
3. The **"Farm"** section lists farms B belongs to — currently only **"Demo"**.
4. B taps the **[+]** button in the Farm section to start the farm creation wizard.
5. Wizard steps:
   - **Name** — B chooses a name for the farm.
   - **Description** — B writes a short description.
   - **Location** — B picks the location on an embedded map. The selected point auto-fills latitude and longitude fields as a preview.
6. B saves the farm. The wizard detects B is currently on the Demo farm and asks: *"Switch to the new farm?"*
7. B chooses **"Yes"**. The wizard closes. The entire LitCrop app now shows B's newly created farm.
8. The farm profile is visible in **[Profile]** as read-only, including a members list (currently only B).
9. B can use a **[Switch Farm]** button to toggle between "Demo" and the new farm. B stays on the new farm for now.

**Feature deps**: Multi-farm N1 (pulled into MVP+), Farm creation wizard, Map picker (F-09), Farm switching, Profile page redesign

#### Step 3: New Crops (B)

1. B enters the **[Crops]** menu. Two view modes are available: **"List"** and **"Layout"** (toggle buttons).
2. In **Layout** mode, B creates a bed layout for the farm:
   - Specifies **rows** and **columns** (MVP+ limit: 5 max each, up to 25 beds).
3. B taps a bed cell — a prompt asks: *"What crop do you plant here?"*
4. B selects a crop and saves. (MVP+ constraint: one crop per bed. Crop is tied to the bed.)
5. Repeats for other beds as desired.

**Feature deps**: Bed-grid layout (new — replaces freeform plot wizard), Crop-per-bed model (new), List/Layout view toggle

#### Step 4: Camera Node Setup (B)

1. B has a physical camera (Raspberry Pi) to install at the farm. For MVP+: **one camera per bed**.
2. Camera configuration is done locally (physical setup + CLI/config file).
3. Images begin uploading automatically. B sees pictures appearing in the targeted bed's data view, rendered in the app.

> **Note**: Web UI for IoT device configuration (the [Manage] page described in the original sketch) is deferred to PROD-1. For MVP+, camera setup is handled locally by the technical user (A or B).

**Feature deps**: Image upload pipeline (existing), Bed-to-camera association (new — data model), Camera simulator (existing)

#### Step 5: Sharing & Monitoring Together

1. **MVP+ approach**: A or B adds C as a member of B's farm (admin-managed — creates a `FARM_MEMBER` record).
2. C now has B's farm in addition to "Demo" in the **[Profile] → Farm** section.
3. C switches to B's farm. Now **all three (A, B, C)** can view and monitor the farm.
4. C enters **[Crops]** menu, taps a bed/crop, and sees the **"Time-lapse"** option (available when the bed has enough images).
5. C taps it and enjoys the time-lapse replay — automatically generated by LitCrop from uploaded camera images.

> **Note**: Self-service invite/apply-to-join workflow (with approval queue and notifications) is deferred to PROD-1. For MVP+, membership is managed by admin or farm owner directly.

**Feature deps**: Farm membership records (new), Multi-farm profile (N1), Time-lapse playback (F-14), Farm switching

### 7.4 Scope Decisions (confirmed 2026-03-22)

| # | Item | MVP+ Scope | Deferred To |
|---|------|-----------|-------------|
| 1 | Multi-farm foundation (N1) | **Yes** — schema, API, farm list, farm switcher | — |
| 2a | Membership: admin-managed | **Yes** — A/B adds C via FARM_MEMBER record | — |
| 2b | Membership: invite/apply workflow | — | PROD-1 |
| 3 | Bed-grid layout (rows × cols, 5 max) | **Yes** — replaces freeform plot wizard | — |
| 4a | IoT data pipeline (images → bed) | **Yes** — existing simulator + bed association | — |
| 4b | IoT device web config UI ([Manage] page) | — | PROD-1 |
| 5 | Demo farm seed data | **Yes** — pre-seeded by admin for onboarding | — |
| 6 | Role model (Admin / Manager / Observer) | **Yes** — via farm membership with role field | — |
| 7 | Profile page redesign (farm list + switch) | **Yes** — required for multi-farm UX | — |

### 7.5 Feature-to-Step Mapping

| Feature | Step 1 | Step 2 | Step 3 | Step 4 | Step 5 |
|---------|:------:|:------:|:------:|:------:|:------:|
| Auth (existing) | X | | | | |
| Demo farm seed (new) | X | | | | |
| AI assistant (existing) | X | X | | | |
| Admin stats (existing) | X | | | | |
| Multi-farm N1 | | X | | | X |
| Farm creation wizard | | X | | | |
| Map picker F-09 | | X | | | |
| Farm switching | | X | | | X |
| Profile redesign | | X | | | X |
| Bed-grid layout (new) | | | X | | |
| Crop-per-bed model (new) | | | X | | |
| Image pipeline (existing) | | | | X | |
| Bed-camera association (new) | | | | X | |
| Farm membership (new) | | | | | X |
| Time-lapse F-14 | | | | | X |

---

> Updated 2026-03-22 | 8 personas (5 original + 3 evaluation), 10 original use cases + 5-step evaluation scenario, scope decisions confirmed
