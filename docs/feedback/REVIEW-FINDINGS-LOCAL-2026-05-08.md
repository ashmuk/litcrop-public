# Review Findings — Current Local Changes (2026-05-08)

**Scope:** Two unstaged modifications on `develop`:
- `.claude/settings.json` — significant slim-down (deletions across env / permissions / hooks / statusLine / enabledPlugins / outputStyle)
- `TASKS.md` — auto-generated `cc-issue-sync` refresh

**Reviewer:** my-reviewer policy (read-only)
**Status:** Accepted with one **CONFIRM-INTENT** finding before commit

---

## Summary

| Severity | Count |
|---|---|
| MUST-FIX | 0 |
| SHOULD-FIX | 0 |
| CONFIRM-INTENT | 1 |
| SUGGESTION | 3 |
| NOTE (verified safe) | 4 |

The `.claude/settings.json` change demotes a large swath of behavior to user-global (`~/.claude/settings.json` → `~/dotfiles/...`) and to local (`.claude/settings.local.json`, gitignored). Verification below confirms hooks, env, allow/ask/deny lists, and statusLine all still resolve at the global level — so functionality is preserved for *this* user. The one substantive question is whether the `enabledPlugins` block was deliberately dropped (those five plugins are NOT enabled in the global file, so they're effectively off in this project after the change).

`TASKS.md` is mechanical and matches the GitHub state plus recent commits.

---

## CONFIRM-INTENT

### CI-1 — `enabledPlugins` block deletion drops 5 project-level plugins
**File:** `.claude/settings.json` (deleted lines)
**Removed:**
```json
"enabledPlugins": {
  "code-review@claude-plugins-official": true,
  "github@claude-plugins-official": true,
  "security-guidance@claude-plugins-official": true,
  "code-simplifier@claude-plugins-official": true,
  "claude-md-management@claude-plugins-official": true
}
```
**What's in user-global** (`~/.claude/settings.json`):
```json
"enabledPlugins": {
  "frontend-design", "feature-dev", "playwright", "ralph-loop",
  "figma", "playground", "aws-serverless", "chrome-devtools-mcp",
  "deploy-on-aws"
}
```
**Zero overlap.** After this change the five plugins are *no longer enabled in any settings file Claude reads for this project*. Notably:
- `code-simplifier` — referenced by the `/simplify` workflow and the feedback memory `feedback_simplify_agent.md` ("Use code-simplifier agent for /simplify").
- `claude-md-management` — provides the `revise-claude-md` and `claude-md-improver` skills that this repo's CLAUDE.md hygiene depends on.
- `code-review` — adjacent to `/cc-review` (this very skill), not a strict dependency since `cc-review` is repo-defined, but the official plugin's `/code-review` and `/security-review` slash commands disappear.

**Verification:** the skill list rendered for this turn still shows `claude-md-management:*`, `code-review:code-review`, `security-review`, `simplify` — those entries flow from the **plugin marketplace cache** declared in `~/.claude.json`, not from `enabledPlugins` in `settings.json`. So the skills *currently* still resolve in this session, but on the next clean session start (or for a teammate without the global enable), losing the project-level enable means losing access.

**Question for the user:** Did you intend to drop `enabledPlugins` from the project file? Three plausible reads:
1. **Promote to user-global** — add the five entries to `~/.claude/settings.json` so they're enabled everywhere; project file stays empty. (Cleanest if these are useful in every repo.)
2. **Demote to local** — move them to `.claude/settings.local.json` so they're litcrop-only but not committed. (Right if you want them only here, only for you.)
3. **Genuine removal** — accept that these plugins are no longer enabled and tooling that depends on them stops working in this project.

**Recommendation:** Pick one before committing. Path 3 should be a deliberate decision, not a side effect of "trimming the config."

---

## SUGGESTIONS

### S-1 — Tighten the new `.devcontainer/.env` deny with a recursive pattern
**File:** `.claude/settings.json:20`
**Current:**
```json
"Read(./.env)",
"Read(./.env.*)",
"Read(./.devcontainer/.env)",
```
The `.env.*` pattern matches `.env.local`, `.env.production` etc. *only at repo root*; it doesn't catch nested `.env` files. The new `.devcontainer/.env` line is a one-off plug for one such gap.

**Suggestion:** add `"Read(./**/.env)"` and `"Read(./**/.env.*)"` to deny ANY-depth `.env` files in one rule. Then drop the `.devcontainer` line as redundant.

(Not a MUST-FIX because the secret-name globs `Read(./**/*secret*)`, `*password*`, `*token*` already provide a defense-in-depth layer for typical contents.)

### S-2 — Confirm permission inheritance is additive (not overriding)
The deletions assume Claude Code merges user + project + local permissions additively (deny-takes-precedence). If that's the case (which matches documented behavior as of v2.1.x), the project-level deletions of `Bash(curl:*)`, `Bash(wget:*)`, `Bash(rm -rf /)`, `Bash(nc:*)`, etc. are safe because the user-global file still denies them.

If you want guaranteed protection regardless of inheritance subtleties, the deny list in the project file should still carry the destructive-bash entries. They're cheap to keep.

**Suggestion:** keep at minimum `Bash(rm -rf /)`, `Bash(curl:*)`, `Bash(wget:*)` in the project deny — these are project-anchored safety lines, not personal preference.

### S-3 — Drop the obfuscated base64 deny entry — no replacement needed
The deleted line `"OgkoKSB7IDp8OiYgfTs6"` decodes to `:(){ :|:& };:` (classic fork bomb). A literal-string deny doesn't actually block a fork bomb — Claude can't run that pattern under any sensible matcher anyway. Removing it is correct. Just noting that this entry, in any form, was theatre; **don't add it back**.

---

## NOTES (verified safe — included so the rationale is recorded)

### N-1 — Hooks deletion is safe
All seven removed hook entries (SessionStart, PostToolUse Write|Edit, PreToolUse Bash, PreToolUse Write|Edit, Stop, UserPromptSubmit, Notification) reference scripts at `~/.claude/hooks/*.sh`. Verified:
```
~/.claude/hooks/{auto-format,file-guard,load-project-env,maybe-simplify,
                 notify-attention,notify-completion,play-sound,
                 security-guard,trigger-simplifier}.sh
```
…all exist as symlinks into `~/dotfiles/config/claude/hooks/`. **And** the user's global `~/.claude/settings.json` will reference the same hooks (the dotfiles repo is the source). So hooks continue to fire — just from one source of truth instead of two. (Confirmed: SessionStart hook fired in *this* session — see the `SessionStart:startup hook success: OK` reminder at the top.)

### N-2 — `env` block deletion is safe
All eight deleted env vars (`CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR`, timeout knobs, MCP knobs, workspace path, history size, retry attempts) are present in user-global. Confirmed by reading `~/.claude/settings.json` lines 4–14.

### N-3 — `permissions.allow` and `permissions.ask` deletions are safe
All entries from the project file are mirrored in user-global, plus more in `.claude/settings.local.json` (gitignored). The project file no longer has an `allow` array at all, which is fine — permissions stack from user → project → local.

### N-4 — `statusLine` and `outputStyle` deletions are intentional
- `statusLine` referenced `~/.claude/statusline.sh` — same script user-global uses.
- `outputStyle: "Explanatory"` was overriding user-global `"default"` — removing it returns to the user's preferred style. Likely intentional.

---

## TASKS.md review

Mechanical, auto-generated update. Three changes:
1. Sync timestamp `2026-04-29 21:15 UTC` → `2026-05-03 12:25 UTC` ✓
2. **Removed from open Production milestone:** `#478` (delete-picture).
3. **Added to Recently Closed:**
   - `#482` — image.deleted/bulk_deleted audit-log gap (closed 2026-05-03) — matches commits `51dcfdb`, `a6037f4`, `198363f`.
   - `#478` — delete-picture (closed 2026-05-01) — matches commit `2c85927`.

Cross-checked against `git log --oneline -10`: consistent. **No issues.**

---

## Verdict

- TASKS.md: **accept as-is.**
- `.claude/settings.json`: **resolve CI-1 first** (decide what happens to the five dropped plugins), then accept. SHOULD-FIX list is empty; suggestions are optional.

After CI-1 is resolved, this is a clean two-file commit. Suggested split per the [`feedback_audit_event_three_places`](no, wrong feedback) — actually the relevant memory here is normal: two separate commits, since the changes are unrelated (`chore(claude): trim project settings — defer to user-global` and `chore(tasks): sync TASKS.md — #478/#482 closed`).
