# Review Findings — Current Local Changes (2026-05-11)

**Scope:** 15 unstaged modifications on `develop`, all introduced by `make fetch-from-upstream`:

```
 .agent/README.md
 .agent/commands/cc-preview.md
 .agent/skills/cc-deploy.md
 .agent/skills/cc-implement.md
 .agent/skills/cc-remediate.md
 .agent/skills/cc-review.md
 .agent/skills/cc-test.md
 .claude/settings.json
 .devcontainer/Dockerfile
 .devcontainer/compose.yml
 .devcontainer/devcontainer.json
 .devcontainer/post-create.sh
 .devcontainer/post-start.sh
 .gitignore
 CLAUDE.md
```

**Reviewer:** my-reviewer policy (read-only)
**Status:** **One MUST-FIX + two CONFIRM-INTENT** to resolve before staging.

---

## Summary

| Severity | Count |
|---|---|
| MUST-FIX | 1 |
| SHOULD-FIX | 2 |
| CONFIRM-INTENT | 2 |
| SUGGESTION | 3 |
| NOTE (verified safe) | 6 |

---

## Summary

The upstream fetch ships three substantive shifts:

1. **DevContainer architecture refactor** — the host ↔ container memory bind mount is gone, replaced by a clean `projects` symlink into the named volume `project-claude-state-${devcontainerId}`. Side effects: all the Layer 0 chown / mkdir defensive logic the user had been carrying (and the matching CLAUDE.md docs section) become stale. Memory now survives container *restart* but no longer bridges to the host's macOS Claude.
2. **`.claude/settings.json` re-bloated** — net +198/-19 lines effectively *reverts* the 2026-05-08 trim (commit `141d246`). All previously-deferred settings (env block, model, hooks, statusLine, enabledPlugins, outputStyle, permission lists) are back at project level.
3. **Pipeline filename normalization** + skill polish — SCREAMING_SNAKE → kebab-case for pipeline artifacts; skills generalized away from litcrop-specific examples; `cc-preview` gets presence checks; new `cc-implement` "Issue Sections — Roadmap" table.

Plus one **genuine regression** in `.gitignore`: re-enabling `lib/` will silently ignore any new files in `src/frontend/src/lib/` (the comment from the previous version explicitly called this out).

---

## MUST-FIX

### M-1 — `lib/` in `.gitignore` will silently ignore new files under `src/frontend/src/lib/`
**File:** `.gitignore:134`
**Before:**
```
# lib/  — disabled: conflicts with src/frontend/src/lib/ source directory
```
**After:**
```
lib/
```
**Verification:**
```
$ git check-ignore -v src/frontend/src/lib/__test_ignore_check.ts
.gitignore:134:lib/      src/frontend/src/lib/__test_ignore_check.ts
```
Existing tracked files in `src/frontend/src/lib/` (api.ts, auth.ts, etc.) are unaffected because gitignore doesn't apply to already-tracked paths — **but any new file added there will be invisible to `git add`** (you'd have to `git add -f`). Given how active this directory is (api.ts last modified May 1, the frontend imports from here heavily), this WILL bite.

**Fix:** restore the previous, anchored or commented-out form:
```
# lib/  — disabled: conflicts with src/frontend/src/lib/ source directory
```
Or, if you want to keep the upstream rule for other projects' sake, anchor it to root:
```
/lib/
```
(Anchored `/lib/` matches only top-level `lib/`, which the litcrop repo doesn't have.)

This will need to be re-applied after every future `make fetch-from-upstream` until you push the fix upstream — the comment is in the litcrop-customized form, not upstream-template form. Worth opening a dotfiles PR.

---

## SHOULD-FIX

### SF-1 — `devcontainer.json` removed the memory bridge mount; CLAUDE.md still documents it
**Files:**
- `.devcontainer/devcontainer.json` (removed) — `source=${localEnv:HOME}/.claude/projects/-workspace/memory,...` mount and the explanatory comment.
- `.devcontainer/post-create.sh` (removed) — "Claude memory bridge: N file(s) visible from host" reporting block.
- `.devcontainer/post-start.sh` (removed) — Layer 0 sudo-chown of `projects/` (no longer needed because `projects/` is now a clean symlink into the volume, no bind-mount parent fabrication).
- `.devcontainer/Dockerfile` (removed) — pre-creation of `/home/${USERNAME}/.claude/projects/-workspace` and the explanatory comment block.
- `CLAUDE.md:175-220` **(unchanged — now stale)** — still claims "binds **only** the memory subdirectory", "Host / container parity — running `claude` on the host macOS or inside the container sees the same memory files", "Survives rebuilds — memory is on the host filesystem".

**What's true after the upstream change:**
- Memory lives in the named Docker volume `project-claude-state-${devcontainerId}`.
- Memory survives container *restart* (volume persists).
- Memory will NOT survive a hard rebuild that destroys the volume (e.g. `docker volume rm`) or a path change to the workspace (which generates a new devcontainerId).
- Memory does NOT bridge to host-side Claude. Host macOS Claude and container Claude now have **independent** memory stores.

**Impact on user's workflow:** the user has been actively relying on host-side Claude memory parity (per `MEMORY.md` entries on incident patterns, post-MVP roadmap, etc.). After accepting this change, those memories ONLY exist in the container's volume — until the next rebuild that wipes it.

**Recommended action:**
- **Pick a path** (see CI-2 below) — restore the bind mount, or accept the architectural shift.
- **If accepting:** rewrite `CLAUDE.md:175-220` to describe the volume-backed setup instead of the bind mount. Mention that memory persists across restarts but a hard volume reset wipes it. Drop the "seed on first rebuild" procedure (no longer applicable).
- **If restoring:** re-apply the mount + initializeCommand mkdir + Dockerfile pre-creation + post-start Layer 0 chown. Better: open a dotfiles PR to push the fix upstream rather than carrying it as a local patch (per the user's MEMORY.md upstream-fix pattern).

### SF-2 — `docs/TEST_PLAN.md` still uses old SCREAMING_SNAKE_CASE name
**Files:**
- `docs/TEST_PLAN.md` (exists, old name)
- `.agent/skills/cc-test.md:11` now references `docs/TEST-PLAN.md` (new name)
- `.agent/README.md:327-329` (new) provides the migration commands

The repo already migrated `TEST_STRATEGY.md` and `TASK_BREAKDOWN.md` to kebab-case but missed `TEST_PLAN.md`. The `cc-test` skill will now look in the wrong place.

**Cross-reference detected:** `docs/feedback/REMEDIATION.md:73` links to `docs/TEST_PLAN.md` (with underscore). Will need updating after the rename.

**Fix:**
```bash
git mv docs/TEST_PLAN.md docs/TEST-PLAN.md
# Then update the one cross-reference:
# docs/feedback/REMEDIATION.md:73 — TEST_PLAN.md → TEST-PLAN.md
```

---

## CONFIRM-INTENT

### CI-1 — Upstream `.claude/settings.json` reverts the 2026-05-08 trim
**File:** `.claude/settings.json` (+183 net lines)
**What came back:**
- `env` block (8 vars)
- `model: "claude-opus-4-7"`, `effortLevel: "xhigh"`, `alwaysThinkingEnabled`, `autoUpdatesChannel`, `attribution`, `includeGitInstructions`
- `permissions.allow` (24 entries — read-only file globs, common test/build/git Bash patterns)
- `permissions.ask` (25 entries — install/publish/destructive Bash patterns)
- `permissions.deny` regrows from 10 → 19 entries (adds build/dist/node_modules/.git reads, curl/wget/nc/netcat/telnet/fork bombs)
- All 7 hooks blocks (SessionStart, PostToolUse, PreToolUse Bash + Write|Edit, Stop, UserPromptSubmit, Notification)
- `statusLine`, `outputStyle: "Explanatory"`, `editorMode: "vim"`
- `enabledPlugins` (the 5 plugins from CI-1 of the 05-08 review)

**What's NEW vs the pre-trim state:**
- `Bash(policy-guard.sh)` added under PreToolUse Bash — references `~/.claude/hooks/policy-guard.sh` (verified exists).
- `permissions.deny` grew with `Read(./build/**)`, `Read(./dist/**)`, `Read(./target/**)`, `Read(./node_modules/**)`, `Read(./.git/objects/**)`.
- The `Read(./.devcontainer/.env)` entry the user had added is gone (covered by `Read(./.env.*)` only at root, not nested — see S-1 in the 05-08 review).

**Verification of duplication vs user-global:**
Read `~/.claude/settings.json`. Confirmed: identical `model`, `effortLevel`, `enabledPlugins`, `outputStyle`, `editorMode`, `alwaysThinkingEnabled` at user-global. The project file would be re-establishing the same values one tier down — additive, not behavior-changing in isolation.

**Question for the user:** Three plausible reads:
1. **Accept revert** — let the upstream template own these settings. The 05-08 trim was an experiment; if upstream's policy is "these belong at project level", roll with it. Cost: every project gets the same hooks and permission lists, duplicated across global+project.
2. **Re-apply the trim** — discard the upstream `.claude/settings.json` changes locally, restore the slim 12-line file from commit `141d246`. Cost: have to repeat this after every `make fetch-from-upstream` until upstream changes its mind.
3. **Cherry-pick** — keep useful additions (policy-guard hook, `node_modules/**` deny, `.devcontainer/.env` deny), re-trim the duplication of env/model/effort/plugins. Cost: third path requires manual merge each fetch.

**Recommendation:** Pick one consciously. If the answer is path 2 or 3, push the trim upstream too so future fetches converge.

### CI-2 — Was the memory-bridge removal an intended upstream policy shift?
**Context:** This is the architectural decision behind SF-1. Did upstream drop the host-memory bind mount because:
- (a) Container-side memory parity caused incidents elsewhere (race conditions, lockfile fights — the "Concurrent-access caveat" in CLAUDE.md was a known risk).
- (b) The Dockerfile/post-start defensive logic to make it work (Layer 0 chown, pre-creating projects/-workspace, defensive symlink skip) became a maintenance burden.
- (c) Other dotfiles consumers don't have macOS host-side Claude installed, so the bridge was litcrop-specific anyway.
- (d) Accidental — got bundled with the unrelated `aws-cli` / `uv` install hardening and slipped through review.

**Question for the user:** Is host-side Claude memory parity load-bearing for your workflow? If so, restore the mount (SF-1, option "If restoring"). If not, accept it and update CLAUDE.md (SF-1, option "If accepting").

---

## SUGGESTIONS

### S-1 — Update `claude-hard` references in CLAUDE.md and AGENTS.md
**Files:**
- `CLAUDE.md:134` — "Dangerous operations: `claude-hard` alias requires explicit user approval..."
- `AGENTS.md:115` — "`claude-hard` alias (dangerous mode) is only available inside DevContainer"

The Dockerfile no longer creates a `claude-hard` alias. It now ships `cld-*` family:
```
cld, cld-plan, cld-god, cld-god-prev, cld-fast, cld-teams-hard, cld-teams-auto
```
The "dangerous mode" equivalent is `cld-teams-hard`. Worth a one-line doc update so future readers don't grep in vain.

### S-2 — Sunset stale MEMORY.md upstream-fix notes
The following entries in `/home/developer/.claude/projects/-workspace/memory/MEMORY.md` are now fixed by this fetch and can be removed (or marked as resolved):

- **"DevContainer dc-rebuild failure: .claude-state volume permissions"** — Dockerfile now `mkdir`s `/home/${USERNAME}/.claude-state` and chowns it. Resolved.
- **"DevContainer: /resume + /rename broken — projects/-workspace owned by root"** — moot after the architectural shift (projects/ is now a symlink into the volume, not a bind-mount target). Resolved by design, not by the documented fix.

The third upstream-fix entry **"DevContainer: ~/.claude.json not carried into container"** is NOT addressed by this fetch — `post-start.sh:67-128` Layer 2 still copies only `settings.json`, `plugins`, `hooks`, `sounds`, but not `~/.claude.json` (HOME-root file). That note stays valid.

### S-3 — Confirm the new `policy-guard.sh` PreToolUse hook is what you want
**File:** `.claude/settings.json` (new entry under `hooks.PreToolUse[matcher=Bash]`)
Adds a second hook script (in addition to `security-guard.sh`) that fires on every Bash invocation. `~/.claude/hooks/policy-guard.sh` exists locally (1712 bytes). Worth reading once to confirm:
- It doesn't false-positive on litcrop's frequent `make`, `gh`, `git`, `npm` patterns.
- Its denylist matches your intent (the policy plumbed here was likely the upstream dotfiles' choice; verify it's the litcrop policy too).

If you don't want it active, drop it from the hook config. If you want it but with a project-specific policy file, route it through the env var `CLAUDE_POLICY_GUARD_RULES=...` or similar (read the script to find the knob).

---

## NOTES (verified safe — recorded so the rationale is preserved)

### N-1 — AWS CLI version pinning is an improvement
`.devcontainer/Dockerfile` + `.devcontainer/compose.yml` add `AWS_CLI_VERSION=2.27.22` and pin the install URL. Previously the build pulled `awscli-exe-linux-${AWS_ARCH}.zip` (latest), making rebuilds non-deterministic. **Good.**

### N-2 — `uv` install hardened: `curl | sh` → tarball
`.devcontainer/Dockerfile:84-89` replaces:
```dockerfile
RUN curl -LsSf https://astral.sh/uv/${UV_VERSION}/install.sh | UV_INSTALL_DIR=/usr/local/bin sh
```
with a direct tarball download from `github.com/astral-sh/uv/releases`. Eliminates one `curl|sh` supply-chain attack surface. **Good.**

### N-3 — `.gitignore` additions for `**/*.tsbuildinfo`, `**/.astro/`, `**/cdk.out/` are correct
Previously these were unanchored (`*.tsbuildinfo`, `src/frontend/.astro/`, `cdk.out/`) — the new `**/` glob is more robust and matches existing paths:
- `./src/frontend/.astro` ✓ (matches `**/.astro/`)
- `./infra/cdk.out` ✓ (matches `**/cdk.out/`)
- `.tsbuildinfo` files at any depth ✓

### N-4 — `docs/feedback/REVIEW-FINDINGS.md` + `REMEDIATION.md` added to `.gitignore`
New comment block at `.gitignore:108-111` explains: canonical per-cycle scratch files are gitignored, date-stamped historical records (like this very file) remain committable. Matches the user's prior pattern of writing `REVIEW-FINDINGS-LOCAL-2026-05-08.md` instead of overwriting `REVIEW-FINDINGS.md`. **Good convention to formalize.**

### N-5 — `.agent/` skill updates are generalization, not behavior change
- `cc-preview.md` — presence checks before running test/git/gh commands (works on bare directories now).
- `cc-deploy.md` — verification checklist genericized (e.g. "per locale: EN, JA" → "per locale the project supports"; "Mobile (375px)" → "Smallest supported viewport"; weather/farm-specific lines removed). Drops the `ADR-20260319` litcrop-specific references and replaces them with abstract guidance.
- `cc-implement.md` — same generalization. Adds new "Issue Sections — Roadmap" table clarifying three issue-handling sections.
- `cc-remediate.md`, `cc-review.md`, `cc-test.md` — one-line updates to "create the `docs/feedback/` directory first if it does not exist" + filename kebab-case migration.
- `.agent/README.md` — adds prompts/ library docs + migration notes for kebab-case rename.

None of these change behavior for litcrop in a way that breaks current usage. The migration of `TEST_PLAN.md` → `TEST-PLAN.md` is the only operational follow-up (SF-2).

### N-6 — Dockerfile alias swap is personal-preference, mechanically clean
`claude-hard` / `claude-teams-hard` removed, replaced with `cld`, `cld-plan`, `cld-god`, `cld-god-prev`, `cld-fast`, `cld-teams-hard`, `cld-teams-auto`. The dangerous-mode equivalent (`--dangerously-skip-permissions`) is preserved as `cld-teams-hard`. The CLAUDE.md/AGENTS.md doc references are the only loose ends (S-1).

---

## TASKS.md review

Not in this changeset. Last `cc-issue-sync` was committed in `e6e5f28` (2026-05-11). No drift expected since.

---

## Verdict

**This fetch is NOT a clean accept.** Two things to resolve first:

| # | What | Action |
|---|---|---|
| **M-1** | `lib/` in `.gitignore` regression | Revert that one line locally; ideally push the fix upstream. |
| **CI-1** | settings.json revert | Decide: accept upstream / re-trim / cherry-pick. |
| **CI-2** | memory-bridge removal | Decide: restore mount / accept architectural shift. |
| **SF-1** | CLAUDE.md docs drift | Follow from CI-2 — rewrite or restore. |
| **SF-2** | `docs/TEST_PLAN.md` rename | `git mv` + update one cross-reference. |

The suggestions (S-1 through S-3) are housekeeping after the main decisions are made.

The fetch CAN be staged in pieces — `.agent/` updates and Dockerfile hardening (N-1, N-2) are uncontroversial and could be committed separately while CI-1 and CI-2 are decided. Suggested commit split:

1. `chore(devcontainer): pin AWS CLI version + harden uv install` — Dockerfile + compose.yml AWS_CLI_VERSION/UV install changes only.
2. `chore(.agent): sync from upstream — kebab-case + presence checks + prompts/ docs` — all `.agent/` files + CLAUDE.md `/cc-preview` line.
3. `chore(gitignore): canonical review/remediate scratch + tsbuildinfo/astro/cdk globs` — minus the `lib/` regression.
4. *(pending decision on CI-1)* — settings.json
5. *(pending decision on CI-2)* — devcontainer.json + post-create.sh + post-start.sh + Dockerfile memory-bridge changes + CLAUDE.md docs update.
6. *(if doing the rename now)* `docs(test): rename TEST_PLAN.md → TEST-PLAN.md` — SF-2.
