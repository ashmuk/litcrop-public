# PLANS — #395 Device Capture Production Hardening

> **Status**: Step 7 (cc-design — Planning) — STOP gate — 2026-04-15
> **Source**: `docs/TASK-BREAKDOWN-395.md`, `docs/DESIGNS-395.md`, ADR-20260414
> **Scope**: Phase 0 (round-trip fix) → Phase 1 (power + new fields) → Production (motion, deferred)

---

## 1. Phase Overview

### Phase 0 — Fix broken round-trip (MUST LAND FIRST)

- **Goal**: Three existing UI fields (`resolution`, `active_window`, `capture_interval`) actually reach and govern the Pi.
- **Branch**: `feature/395-capture-roundtrip-phase-0`
- **Tasks**: T-395-01 through T-395-05
- **Effort**: 1–1.5 days
- **Blocker for**: Phase 1

### Phase 1 — Power management + schema expansion

- **Goal**: Add four new config fields; wire `maybe_sleep`; systemd-ize install.
- **Branch**: `feature/395-power-mgmt-phase-1`
- **Tasks**: T-395-N1-01 through T-395-N1-07
- **Effort**: 2–3 days
- **Blocker for**: Production (motion) phase in a later sprint

### Production — Motion support

- **Out of scope this sprint.** Entry criterion: Phase 1 sleep/wake validated on 2+ devices for 7+ days.

---

## 2. Execution Sequence

### Phase 0 — day 1

```
morning (0.5 day)
├── T-395-00  [S]  bats-core bootstrap              →  30 min (BLOCKS 02/03)
├── T-395-01  [M]  migrate-device-resolution.ts    →  1.5 h  ← parallel with 00
└── T-395-04  [S]  API/contract tests               →  30 min ← parallel

midday
├── T-395-02  [M]  poll_config parses 3 fields     →  1.5 h  (needs 00)
└── T-395-03  [S]  in_active_window gate            →  30 min (needs 00, 02)

afternoon (0.5 day)
└── T-395-05  [M]  on-Pi verification + PR + merge →  2 h
```

**Parallelizable batches**:
- Batch 1: T-395-00, T-395-01, T-395-04 (zero overlap)
- Batch 2: T-395-02 (needs bats from 00)
- Batch 3: T-395-03 (needs 00 + 02)
- Batch 4: T-395-05 (needs all above)

### Phase 1 — days 2–4

```
day 2 morning
├── T-395-N1-01  [M]  schema (6 layers, one commit)    →  2 h
└── T-395-N1-04  [S]  systemd unit files (new)          →  30 min ← parallel

day 2 afternoon
├── T-395-N1-02  [M]  frontend + i18n                   →  2 h
└── T-395-N1-03  [M]  capture.sh maybe_sleep + parse    →  2 h    ← parallel

day 3 morning
├── T-395-N1-05  [L]  install.sh rewrite                →  3 h
└── T-395-N1-06  [M]  integration tests                 →  2 h    ← parallel

day 3 afternoon → day 4
└── T-395-N1-07  [L]  on-Pi verification (3 cycles)     →  1 day
```

**Parallelizable batches**:
- Batch 1: T-395-N1-01, T-395-N1-04 (no file overlap)
- Batch 2 (after 01): T-395-N1-02, T-395-N1-03 (no file overlap)
- Batch 3 (after 04): T-395-N1-05, T-395-N1-06 (no file overlap)
- Batch 4: T-395-N1-07 (all above merged)

---

## 3. Acceptance Criteria

### Phase 0 exit gate

- [ ] `migrate-device-resolution.ts` dry-run shows 0 fixes against prod (or list applied)
- [ ] UI "resolution = 1280x720" visible in Pi log within one poll cycle (≤30 min)
- [ ] UI "active_window.end = 12:00" causes `[SKIP]` log after 12:00 local
- [ ] `[HEARTBEAT]` logged during skip **and** during normal run (exactly once per cycle, not twice)
- [ ] Pi log shows `[CONFIG] Applied: ... interval=<seconds>` — confirms `capture_interval` parsed as advisory under systemd
- [ ] All existing vitest + contract tests green
- [ ] No Pi reports "offline" in UI due to the change

### Phase 1 exit gate

- [ ] Four new fields round-trip through PATCH → GET `/config`
- [ ] Form disabled states: cooldown/max/hr grayed without PIR; sleep_enabled grayed without battery; threshold grayed when !sleepEnabled
- [ ] Install.sh runs end-to-end non-interactively
- [ ] Systemd timer active, cron entry removed
- [ ] `.env` does not contain `TRIGGER=` after install
- [ ] One Class-2 Pi completes 3 consecutive wake→capture→upload→sleep cycles
- [ ] EN + JA i18n keys added
- [ ] ≥90% coverage on new fields

---

## 4. Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|------|-----------|--------|-----------|-------|
| 1 | Phase 0 surfaces latent misconfig — Pi captures at 720p unexpectedly | Medium | Medium | T-395-01 migration runs BEFORE ship; release note | Implementer |
| 2 | Active-window gate blocks intended captures | Medium | Low | Defaults 05:00–20:00 on missing fields; test bypass | QA |
| 3 | `cgpmgr` not in PATH for systemd user | Medium | Low | `command -v` + runtime re-check; logs + exits 0 | Implementer |
| 4 | Battery sysfs returns non-numeric | Low | Medium | Regex guard sets `batt=100` (safe high) | Implementer |
| 5 | Systemd template renders wrong `$HOME` for multi-user Pi | Low | Medium | sed at install time; `systemctl cat` inspection | Implementer |
| 6 | Legacy `.env` has `TRIGGER=motion` hand-edited | Low | Low | install.sh scrubs; document `LITCROP_TRIGGER=` | Implementer |
| 7 | Old capture.sh + new API schema mismatch | Low | Low | `.default()` prevents 5xx | Architect |
| 8 | `cgpmgr -shutdown` races with in-flight heartbeat | Low | High | `maybe_sleep` is strictly last step; upload_spool first | Implementer |
| 9 | On-Pi test window exceeds budget | Medium | Low | 1 day allocated; parallelize review | Scheduler |
| 10 | AWS cost from `[SKIP]` heartbeats | Low | Low | Same cadence as existing heartbeat — no delta | Architect |
| 11 | `capture_interval` UI change appears to work but is silently advisory under systemd | Medium | Low | Release note explicit: "Interval stored but cadence driven by systemd timer until future ADR reconciles." UI to add disabled hint in follow-up | Architect |
| 12 | No bash test framework in repo → shell unit tests silently skipped | Medium | High | T-395-00 bootstraps bats-core FIRST; dep chain enforced | Implementer |
| 13 | Midnight-crossing `active_window` (22:00→04:00) breaks string comparison | Low | Medium | T-395-03 fallback log + revert to 05:00–20:00 defaults; documented in release note | Implementer |
| 14 | `install.sh` re-run creates duplicate systemd/cron entries | Low | Medium | T-395-N1-08 idempotency test; grep-before-append pattern in install.sh | Implementer |

---

## 5. Rollback per phase

### Phase 0 rollback

```bash
# On device:
cd ~/litcrop && cp capture.sh.bak capture.sh && chmod 700 capture.sh
```

API side: **no rollback needed** — schema/routes unchanged in Phase 0.

### Phase 1 rollback

```bash
# On device:
sudo systemctl disable --now litcrop-capture.timer
sudo rm /etc/systemd/system/litcrop-capture.{service,timer}
sudo systemctl daemon-reload
(crontab -l 2>/dev/null; echo "*/30 5-20 * * * $HOME/litcrop/capture.sh >> $HOME/litcrop/logs/capture.log 2>&1") | crontab -
```

API / schema revert: `.default()`s mean revert doesn't break deployed Pis.

### Production (motion) rollback

Out of scope this sprint.

---

## 6. Sign-off

- **Pre-Phase-0 announce**: Release note: "Devices will begin honoring resolution + active_window from UI on <date>. Check your stored values."
- **Phase 0 sign-off**: User confirms Pi-log evidence before Phase 1 begins
- **Phase 1 sign-off**: On-Pi 3-cycle log in session report; AWS cost delta check

---

## 7. Out of scope this sprint

- Motion watcher (`motion-watch.sh` + `litcrop-motion.service.tmpl`)
- Dynamic systemd timer reload from `capture_interval` push
- Fleet-wide upgrade orchestration (manual per-Pi re-install acceptable)
- CSP / security header changes
- UI tier-class visualization changes (already shipped Beta-11)

---

## Iteration Log

### Iteration 1 — 2026-04-15
- **Trigger**: First design pass for #395
- **Entry point**: Step 2 (Architecture)
- **What changed**: Original ADR v1 proposed Option B (modal scripts + systemd). Review revealed 8 findings, most critical: existing config round-trip broken for 3 of 5 fields (resolution, active_window, capture_interval).
- **What preserved**: Hardware context from user (Pi Zero WH + Camera HQ + RPZ boards + rpicam/cgpmgr/cgsensor commands).

### Iteration 2 — 2026-04-15
- **Trigger**: /cc-review findings on ADR v1
- **Entry point**: Step 2 (Rearchitect)
- **What changed**: ADR v2 adds MVP Phase 0 (fix broken round-trip FIRST). Systemd `%i` bug fixed via sed templates. Full 6-layer schema change enumerated. `LITCROP_TRIGGER` namespace. Battery numeric guard. `[Install]`-on-timer-only. 3-phase scope instead of 2.
- **What preserved**: Option B decision, hardware context, mermaid diagram (rescoped).
