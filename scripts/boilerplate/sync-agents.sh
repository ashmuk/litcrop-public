#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

SRC_AGENT="${PROJECT_ROOT}/.agent"
DST_CLAUDE="${PROJECT_ROOT}/.claude/agents"
DST_SKILLS="${PROJECT_ROOT}/.claude/skills"

echo "[sync] root=${PROJECT_ROOT}"

# Ensure destination dirs exist
mkdir -p "${DST_CLAUDE}" "${DST_SKILLS}"

# 1) Claude subagents -> .claude/agents
# Symlinks work for agents (ensure source files have 644 permissions and valid frontmatter)
if [[ -d "${SRC_AGENT}/subagents" ]]; then
  echo "[sync] Claude: ${SRC_AGENT}/subagents -> ${DST_CLAUDE}"
  rm -f "${DST_CLAUDE}/"*.md 2>/dev/null || true

  agent_count=0
  for agent_file in "${SRC_AGENT}/subagents/"*.md; do
    if [[ -f "$agent_file" ]]; then
      agent_name="$(basename "$agent_file")"
      # Create relative symlink
      ln -sf "../../.agent/subagents/${agent_name}" "${DST_CLAUDE}/${agent_name}"
      echo "[sync]   ${agent_name} -> ../../.agent/subagents/${agent_name}"
      agent_count=$((agent_count + 1))
    fi
  done

  echo "[sync] Agents: OK (${agent_count} agents synced)"
else
  echo "[sync] Claude: no ${SRC_AGENT}/subagents (skip)"
fi

# 2) Cursor rules
# Note: Cursor rules are generated directly to .cursor/rules by gen_cursor_rules.py
# No sync needed from .agent/cursor/rules

# 3) Skills -> .claude/skills/<skill-name>/SKILL.md
# Claude Code expects skills in subdirectories with SKILL.md filename
if [[ -d "${SRC_AGENT}/skills" ]]; then
  echo "[sync] Skills: ${SRC_AGENT}/skills -> ${DST_SKILLS}"

  # Cleanup: Remove old skill directories
  if [[ -d "${DST_SKILLS}" ]]; then
    rm -rf "${DST_SKILLS}/"* 2>/dev/null || true
  fi
  mkdir -p "${DST_SKILLS}"

  skill_count=0
  for skill_file in "${SRC_AGENT}/skills/"*.md; do
    if [[ -f "$skill_file" ]]; then
      # Extract skill name from filename (strip .md extension)
      skill_basename="$(basename "$skill_file")"
      skill_name="${skill_basename%.md}"

      # Create skill subdirectory
      skill_dir="${DST_SKILLS}/${skill_name}"
      mkdir -p "${skill_dir}"

      # Create relative symlink
      ln -sf "../../../.agent/skills/${skill_basename}" "${skill_dir}/SKILL.md"
      echo "[sync]   ${skill_name}/SKILL.md -> ../../../.agent/skills/${skill_basename}"

      skill_count=$((skill_count + 1))
    fi
  done

  echo "[sync] Skills: OK (${skill_count} skills synced)"
else
  echo "[sync] Skills: no ${SRC_AGENT}/skills (skip)"
fi

# 4) Commands -> .claude/commands/*.md
# Claude Code expects commands as flat files (like agents, not like skills)
if [[ -d "${SRC_AGENT}/commands" ]]; then
  DST_COMMANDS="${PROJECT_ROOT}/.claude/commands"
  echo "[sync] Commands: ${SRC_AGENT}/commands -> ${DST_COMMANDS}"

  # Cleanup: Remove old command files
  mkdir -p "${DST_COMMANDS}"
  rm -f "${DST_COMMANDS}/"*.md 2>/dev/null || true

  cmd_count=0
  for cmd_file in "${SRC_AGENT}/commands/"*.md; do
    if [[ -f "$cmd_file" ]]; then
      cmd_basename="$(basename "$cmd_file")"

      # Create relative symlink (flat structure)
      ln -sf "../../.agent/commands/${cmd_basename}" "${DST_COMMANDS}/${cmd_basename}"
      echo "[sync]   ${cmd_basename} -> ../../.agent/commands/${cmd_basename}"

      cmd_count=$((cmd_count + 1))
    fi
  done

  echo "[sync] Commands: OK (${cmd_count} commands synced)"
else
  echo "[sync] Commands: no ${SRC_AGENT}/commands (skip)"
fi

echo "[sync] done"
