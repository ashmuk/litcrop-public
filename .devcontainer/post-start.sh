#!/bin/bash
# post-start.sh - DevContainer post-start setup script
# Called by postStartCommand in devcontainer.json
#
# Reconstructs ~/.claude/ from three sources:
#   1. Writable container state (volume at ~/.claude-state/)
#   2. Host personal settings (read-only bind mount at ~/.claude-host/)
#   3. Project-level overrides (/workspace/.claude/)

set -e
shopt -s nullglob

CLAUDE_DIR="$HOME/.claude"
HOST_DIR="$HOME/.claude-host"
STATE_DIR="$HOME/.claude-state"

# ── Create ~/.claude directory ──────────────────────────────────────────
mkdir -p "$CLAUDE_DIR"

# ── Layer 0: Reclaim bind-mount target parents from root ───────────────
# Docker materializes the ~/.claude/projects/-workspace/memory bind mount
# (defined in devcontainer.json) BEFORE this script runs. As a side effect,
# the kernel creates the missing parent dirs (~/.claude/projects and
# ~/.claude/projects/-workspace) as root:root, since mount-target creation
# happens in the kernel's mount namespace, not the user's shell. Without
# this fix, Claude Code (running as `developer`) silently fails to write
# per-session transcripts at ~/.claude/projects/-workspace/<id>.jsonl,
# which breaks /resume and /rename even though no setting disables them.
#
# Non-recursive chown — DO NOT add -R. The memory/ subdir is itself a
# bind mount onto the host filesystem; its contents are owned and managed
# host-side, and recursing into it can fight macOS ACLs.
if [ -d "$CLAUDE_DIR/projects" ]; then
    sudo chown developer:developer \
        "$CLAUDE_DIR/projects" \
        "$CLAUDE_DIR/projects/-workspace" 2>/dev/null || \
        echo "[post-start] WARN: could not reclaim ownership of $CLAUDE_DIR/projects — /resume and /rename may not persist transcripts"
fi

# ── Layer 1: Writable state (persisted in volume) ──────────────────────
# These directories/files need write access during Claude Code operation.
#
# NOTE: `projects` is intentionally omitted from STATE_DIRS — it cannot be
# symlinked to ~/.claude-state/projects/ because the bind-mount target above
# pre-creates ~/.claude/projects as a real directory. Layer 0 (above) makes
# that directory writable so per-session transcripts (.jsonl) land in the
# container layer; per-project memory for `-workspace` lives on the host via
# the bind mount; transcripts are ephemeral across container rebuilds. To
# also persist transcripts across rebuilds, a deeper refactor is needed
# (move the bind-mount target onto ~/.claude-state and symlink projects/).
STATE_DIRS=(
    "backups"
    "cache"
    "debug"
    "downloads"
    "file-history"
    "ide"
    "logs"
    "paste-cache"
    "plans"
    "session-env"
    "shell-snapshots"
    "statsig"
    "tasks"
    "teams"
    "telemetry"
    "todos"
    "usage-data"
)

for dir in "${STATE_DIRS[@]}"; do
    mkdir -p "$STATE_DIR/$dir"
    target="$CLAUDE_DIR/$dir"
    # Defensive: if the target slot is already a real directory (e.g. created
    # by Docker as the parent of a bind mount), `ln -sfn` would create the
    # symlink *inside* it ($target/$dir) rather than replacing it. Skip in
    # that case so the script can proceed to Layers 2 and 3.
    if [ -d "$target" ] && [ ! -L "$target" ]; then
        echo "[post-start] Skipping symlink for '$dir' (slot is a real directory, likely bind-mounted)"
        continue
    fi
    ln -sfn "$STATE_DIR/$dir" "$target"
done

# Writable state files (create in volume if not present, symlink into ~/.claude)
STATE_FILES=(
    "history.jsonl"
    "stats-cache.json"
    "mcp-needs-auth-cache.json"
    "credentials.json"
    ".credentials.json"
)

for file in "${STATE_FILES[@]}"; do
    if [ ! -f "$STATE_DIR/$file" ]; then
        case "$file" in
            *.json) echo '{}' > "$STATE_DIR/$file" ;;
            *)      touch "$STATE_DIR/$file" ;;
        esac
    fi
    ln -sf "$STATE_DIR/$file" "$CLAUDE_DIR/$file"
done

# ── Layer 2: Host personal settings (from read-only bind mount) ────────
if [ -d "$HOST_DIR" ] && [ -n "$(ls -A "$HOST_DIR" 2>/dev/null)" ]; then
    # Personal CLAUDE.md (symlink — read-only is fine)
    if [ -e "$HOST_DIR/CLAUDE.md" ]; then
        ln -sf "$HOST_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
    fi

    # User settings.json — copy so `claude config set` works in container
    if [ -e "$HOST_DIR/settings.json" ]; then
        cp -f "$HOST_DIR/settings.json" "$CLAUDE_DIR/settings.json"
    fi

    # Plugins directory — copy so plugin install/updates work in container
    if [ -d "$HOST_DIR/plugins" ]; then
        cp -rf "$HOST_DIR/plugins" "$CLAUDE_DIR/plugins"
    fi

    # Hooks — copy scripts (symlinks already resolved by initializeCommand)
    if [ -d "$HOST_DIR/hooks" ]; then
        mkdir -p "$CLAUDE_DIR/hooks"
        for hook in "$HOST_DIR/hooks"/*; do
            [ -f "$hook" ] || continue
            cp -f "$hook" "$CLAUDE_DIR/hooks/$(basename "$hook")"
            chmod +x "$CLAUDE_DIR/hooks/$(basename "$hook")"
        done
    fi

    # Custom sounds — copy from host
    if [ -d "$HOST_DIR/sounds" ]; then
        mkdir -p "$CLAUDE_DIR/sounds"
        for sound in "$HOST_DIR/sounds"/*; do
            [ -f "$sound" ] || continue
            cp -f "$sound" "$CLAUDE_DIR/sounds/$(basename "$sound")"
        done
    fi

    # Rewrite host plugin paths to container paths (handles macOS and Linux hosts)
    if [ -f "$CLAUDE_DIR/plugins/installed_plugins.json" ]; then
        _escaped_home=$(printf '%s' "$HOME" | sed 's/[&\\/]/\\&/g')
        sed -i "s|/Users/[^/]*/\.claude/|${_escaped_home}/.claude/|g; s|/home/[^/]*/\.claude/|${_escaped_home}/.claude/|g" \
            "$CLAUDE_DIR/plugins/installed_plugins.json"
    fi

    # Rewrite host paths in marketplace registry
    if [ -f "$CLAUDE_DIR/plugins/known_marketplaces.json" ]; then
        _escaped_home=${_escaped_home:-$(printf '%s' "$HOME" | sed 's/[&\\/]/\\&/g')}
        sed -i "s|/Users/[^/]*/\.claude/|${_escaped_home}/.claude/|g; s|/home/[^/]*/\.claude/|${_escaped_home}/.claude/|g" \
            "$CLAUDE_DIR/plugins/known_marketplaces.json"
    fi

    # Platform compatibility: replace macOS afplay hooks with terminal bell on Linux
    # Claude Code merges settings.local.json over settings.json
    if [ "$(uname)" != "Darwin" ]; then
        cat > "$CLAUDE_DIR/settings.local.json" <<'SETTINGS_LOCAL'
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command", "command": "printf '\\a\\a'" }] }],
    "Notification": [{ "hooks": [{ "type": "command", "command": "printf '\\a'" }] }]
  }
}
SETTINGS_LOCAL
    fi
else
    # No host mount available — fall back to project-level configs
    if [ -f "/workspace/CLAUDE_global.md" ]; then
        if [ -L "$CLAUDE_DIR/CLAUDE.md" ] || [ ! -f "$CLAUDE_DIR/CLAUDE.md" ]; then
            ln -sf /workspace/CLAUDE_global.md "$CLAUDE_DIR/CLAUDE.md"
        fi
    fi

    if [ -f "/workspace/.claude/settings.json" ]; then
        ln -sf /workspace/.claude/settings.json "$CLAUDE_DIR/settings.json"
    fi
fi

# ── Layer 3: Project-level overrides ──────────────────────────────────
# Project statusline always takes precedence
if [ -f "/workspace/.claude/statusline.sh" ]; then
    ln -sf /workspace/.claude/statusline.sh "$CLAUDE_DIR/statusline.sh"
fi

# ── Codex global config ──────────────────────────────────────────────
mkdir -p "$HOME/.codex"
if [ -f "/workspace/AGENTS_global.md" ]; then
    if [ -L "$HOME/.codex/AGENTS.md" ] || [ ! -f "$HOME/.codex/AGENTS.md" ]; then
        ln -sf /workspace/AGENTS_global.md "$HOME/.codex/AGENTS.md"
    fi
fi

# ── Load project .env into shell environment ─────────────────────────
# devcontainer exec does not inherit compose env_file vars,
# so we export them via shell profile for interactive sessions and Claude Code.
ENV_EXPORTS="$HOME/.env_exports"
if [ -f /workspace/.env ]; then
    grep -E '^[A-Za-z_][A-Za-z0-9_]*=' /workspace/.env \
        | grep -v '^#' \
        | sed 's/^/export /' > "$ENV_EXPORTS"
    chmod 600 "$ENV_EXPORTS"
else
    : > "$ENV_EXPORTS"
fi
