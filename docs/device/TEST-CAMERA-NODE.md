● ★ Insight ─────────────────────────────────────
Why "staging" matters for this verification: T-395-05 needs to prove that a UI change in the web app propagates through the API → DynamoDB → Pi config-poll → camera capture. Pointing the
 Pi at the staging environment (not prod) means you can iterate quickly without affecting real users — and it's the same code path that prod will run after develop→main promotion.

Why fresh registration vs. re-using an existing device: the install.sh download bakes the device's API key + JWT refresh token into `.env`. If you re-use a Pi that's already registered,
you're testing yesterday's `.env` against today's capture.sh — and any bug in the `.env` parser regression-tests as a working system because the legacy values happen to match.
─────────────────────────────────────────────────

Here's the T-395-05 runbook — copy-paste-ready, ~30 minutes end-to-end.

> **URLs — read this before you start.**
> - **Staging** (target for Phase 0 verification): `https://dpj8a3mk3tzkq.cloudfront.net/` — currently v0.98.
> - **Production**: `https://litcrop.com/` — currently v0.93 (pre-promotion). **Do not use for T-395-05**; v0.93 `install.sh` has no `--branch` flag and v0.93 `capture.sh` does not emit the `window=` / `interval=` fields the EC checks depend on.

## 0. Prerequisites (verify before touching the Pi)

```bash
# On your Mac/dev box — confirm staging is on v0.98
# (CloudFront doesn't emit a version header; check the SPA instead)
curl -fsSL https://dpj8a3mk3tzkq.cloudfront.net/ | grep -oE 'v0\.[0-9]+' | head -1
# Or open the staging URL in a browser → log in → Profile → Legal → What's New
# — the top entry should be the v0.98 block (#397 + #404 + #405).
```

If staging is not on v0.98 yet, your CI on `develop` push should have triggered the deploy — confirm in GitHub Actions before continuing.

## 1. On the Pi (fresh OS recommended, not strictly required)

**Register + download `.env` in the UI first** (see §2), then on your laptop:

```bash
# From laptop — copy the freshly-downloaded .env onto the Pi
ssh pi@pi.local 'mkdir -p ~/litcrop'
scp ~/Downloads/litcrop-dev-*.env pi@pi.local:~/litcrop/.env
```

Now SSH to the Pi and run `install.sh` against **staging** with `--branch=develop`:

```bash
ssh pi@pi.local

# Confirm hardware: Camera HQ visible
rpicam-hello --list-cameras

# Run install.sh from staging, pulling capture.sh from develop branch
# --branch=develop is REQUIRED for T-395-05: without it, capture.sh comes
# from main (v0.93) and will not emit window= / interval= fields.
curl -fsSL https://dpj8a3mk3tzkq.cloudfront.net/install.sh | bash -s -- --branch=develop
```

During the run, `install.sh` will:
- Prompt to `apt-get install jq` if missing (v0.97+: jq is REQUIRED — accept the prompt)
- Auto-detect hardware class (#405: Pi Zero WH + Camera HQ + cgpmgr → Class-2/3). Press **Enter** at the override prompts to keep detected values (do NOT type `n` — that would answer "No" to "has battery HAT").
- Write `~/litcrop/hardware.conf` (hardware flags) and the cron entry for 30-min captures 05:00–20:00.
- Check for `~/litcrop/.env` (which you scp'd in the previous step) and warn if missing.

## 2. Register the device in the UI (web)

Do this BEFORE §1's scp step:

1. Browser → `https://dpj8a3mk3tzkq.cloudfront.net/` → log in
2. Devices → Register New Device → name it `t395-05-pi-01` (or any unique name) → choose your bed
3. Click **Download .env** → a signed, short-lived file downloads (not a URL — an actual `.env` file)
4. Move it to `~/Downloads/litcrop-dev-*.env` on your laptop (default browser location)
5. Continue with §1's `scp` + `install.sh` steps

## 3. Run a single capture cycle to bootstrap auth

```bash
~/litcrop/capture.sh
```

Expect log lines (order is typical; `[AUTH]` only appears when the access token needs refresh — often absent on first run after fresh `.env`):

```
[CONFIG] Applied: 1920x1080 q85 window=05:00-20:00 interval=unset
[CAPTURE] 1920x1080 q85 → t395-05-pi-01_<ts>.jpg
[CAPTURE] OK — <bytes> bytes
[UPLOAD] OK — HTTP 201
[HEARTBEAT] OK
[DONE]
```

If `[CONFIG] Applied:` shows all three new fields (`window=`, `interval=`), Phase 0 round-trip is proven for a default config. Confirm in the UI: Devices → `t395-05-pi-01` → **Last Seen** updates to ~now, and the v0.98 applied-config badge (from #406) shows "Applied" for resolution/interval.

## 4. The four exit-criterion tests (DESIGNS-395 §2.3)

Run these one at a time, ~5 min each. Cron cadence is 30 min; you can manually invoke `capture.sh` to skip the wait.

### EC-1: Resolution change propagates

```
UI:   Devices → t395-05-pi-01 → Edit → Resolution: 1280x720 → Save
Pi:   ~/litcrop/capture.sh
Pass: log shows  [CONFIG] Applied: 1280x720 q85 ...
                 [CAPTURE] 1280x720 q85 → ...
      Image in UI shows native 1280x720 dimensions
      #406 badge flips to "Applied: 1280x720"
```

### EC-2: Active-window SKIP

```
UI:   Devices → t395-05-pi-01 → Edit → Active Window End: <current_HH:MM minus 1 minute> → Save
      (i.e., set the window to "already over")
Pi:   ~/litcrop/capture.sh
Pass: log shows  [CONFIG] Applied: ... window=05:00-<HH:MM>
                 [SKIP] Outside active window 05:00-<HH:MM>
                 [HEARTBEAT] OK
                 (no [CAPTURE] line, no [UPLOAD])
      UI Last Seen still updates → confirms heartbeat fired
      Exactly one [HEARTBEAT] per cycle (no double-fire — regression check)
```

### EC-3: Interval logged (advisory under cron)

```
UI:   Devices → t395-05-pi-01 → Edit → Capture Interval: 600 → Save
Pi:   ~/litcrop/capture.sh
Pass: log shows  [CONFIG] Applied: ... interval=600
      (Cron cadence does NOT change under v0.98 — that's documented
       advisory behavior. Phase 1 ships systemd timer regen, which will
       reconcile cadence to `interval`.)
```

### EC-4: Restore window, capture resumes

```
UI:   Set Active Window End back to 20:00, save
Pi:   ~/litcrop/capture.sh
Pass: [CONFIG] Applied: ... window=05:00-20:00
      [CAPTURE] ... → ...
      [HEARTBEAT] OK
      Exactly one heartbeat per cycle
```

## 5. Capture the evidence

```bash
# On the Pi, copy the relevant log slice off
tail -200 ~/litcrop/logs/capture.log > /tmp/t395-05-evidence.log
# scp it back to your laptop, or just paste into the session report
```

## 6. Append to the existing session report

A partial report already exists at `/workspace/docs/session-reports/SESSION-REPORT-395-phase-0.md` (EC-1 + EC-3 PASS from session `pre-prod-097-2`). **Append** new sections — do not overwrite — so the Pi-access-gap history is preserved:

```markdown
## Resumed verification — <YYYY-MM-DD> (session <name>)

**Staging tag**: v0.98
**Pi**: <hostname / serial / OS version>
**Camera**: <Camera HQ / lens>
**capture.sh branch**: develop (via `install.sh --branch=develop`)

### EC-2: Active-window SKIP — PASS / FAIL
<paste log excerpt>

### EC-4: Window restored — PASS / FAIL
<paste log excerpt>

### Test Shot bypass — PASS / FAIL
<paste log excerpt>

### Anomalies / observations
<anything unexpected — even if EC passes>
```

## What "done" looks like

- EC-2, EC-4, and Test Shot marked PASS in the appended section
- Report committed to `develop`
- `#395` Phase 0 closed (EC-1 + EC-3 + EC-2 + EC-4 + Test Shot all green)
- Ready to start Phase 1 (T-395-N1-01 schema additions)
- develop → main grouped promotion PR unblocked (closes ~15 shipped-but-open issues)

## Watch-outs (the cc-test analyst flagged these)

| If you see…                                       | Likely cause                                                          | Where to look                                 |
|---------------------------------------------------|-----------------------------------------------------------------------|-----------------------------------------------|
| `[CONFIG] Poll failed (HTTP 401)` repeatedly      | refresh-token expiry, NOT a Phase 0 bug                               | `~/litcrop/.refresh-failures` counter         |
| `[CONFIG] Applied:` missing `window=` or `interval=` | `capture.sh` came from `main` (v0.93) — forgot `--branch=develop`  | `head -1 ~/litcrop/capture.sh` — look for v0.97+ marker; re-run `install.sh` with `--branch=develop` |
| `[CONFIG] jq not installed — using defaults`      | jq prompt was declined or apt-get failed during install               | `command -v jq; sudo apt-get install -y jq`   |
| Capture runs even though `[SKIP]` logged          | `set -u` aborted between SKIP log and return 0                        | `bash -x ~/litcrop/capture.sh`                |
| Two `[HEARTBEAT]` per cycle                       | `run_once` gate let through to capture+heartbeat AND skip+heartbeat   | bug — open new issue, don't ship              |
| #406 badge stuck on "Pending" after EC-1          | API didn't persist applied-config echo (regression)                   | API Lambda logs → `recordConfigPoll` path     |
| Hardware flags reset to Class-1 after install     | typed `n` instead of Enter at #405 override prompts                   | `cat ~/litcrop/hardware.conf`; re-run `install.sh --non-interactive` |

When you're back with the report, paste the three log excerpts (EC-2, EC-4, Test Shot) here and I'll either green-light Phase 1 or open a remediation ticket.
