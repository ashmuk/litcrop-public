#!/usr/bin/env bash
# sync-cursor-rules.sh - Sync .agent/ content to Cursor IDE rules
#
# Creates symlink structure in .cursor/rules/ for:
# - Project rules from RULES.md
# - Subagents as rule files
# - Skills as rule files
#
# Usage: ./scripts/boilerplate/sync-cursor-rules.sh
# Integrated into: make sync
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

SRC_AGENT="${PROJECT_ROOT}/.agent"
SRC_RULES="${PROJECT_ROOT}/RULES.md"
DST_CURSOR="${PROJECT_ROOT}/.cursor/rules"

echo "[cursor] root=${PROJECT_ROOT}"

# Ensure base destination exists
mkdir -p "${DST_CURSOR}"

# 1) Project rules from RULES.md -> .cursor/rules/project/RULE.md
mkdir -p "${DST_CURSOR}/project"
rm -f "${DST_CURSOR}/project/RULE.md" 2>/dev/null || true

if [[ -f "${SRC_RULES}" ]]; then
  # Relative path from .cursor/rules/project/ to RULES.md
  ln -sf "../../../RULES.md" "${DST_CURSOR}/project/RULE.md"
  echo "[cursor]   project/RULE.md -> ../../../RULES.md"
else
  echo "[cursor]   project/RULE.md: RULES.md not found (skip)"
fi

# 2) Subagents as rules -> .cursor/rules/agents/<name>/RULE.md
if [[ -d "${SRC_AGENT}/subagents" ]]; then
  echo "[cursor] Agents: ${SRC_AGENT}/subagents -> ${DST_CURSOR}/agents"

  # Clean and recreate agents directory
  rm -rf "${DST_CURSOR}/agents" 2>/dev/null || true
  mkdir -p "${DST_CURSOR}/agents"

  agent_count=0
  for agent_file in "${SRC_AGENT}/subagents/"*.md; do
    if [[ -f "$agent_file" ]]; then
      agent_basename="$(basename "$agent_file")"
      agent_name="${agent_basename%.md}"

      # Create agent subdirectory
      mkdir -p "${DST_CURSOR}/agents/${agent_name}"

      # Relative path from .cursor/rules/agents/<name>/ to .agent/subagents/<name>.md
      ln -sf "../../../../.agent/subagents/${agent_basename}" \
             "${DST_CURSOR}/agents/${agent_name}/RULE.md"
      echo "[cursor]   agents/${agent_name}/RULE.md -> ../../../../.agent/subagents/${agent_basename}"

      agent_count=$((agent_count + 1))
    fi
  done

  echo "[cursor] Agents: OK (${agent_count} agents synced)"
else
  echo "[cursor] Agents: no ${SRC_AGENT}/subagents (skip)"
fi

# 3) Skills as rules -> .cursor/rules/skills/<name>/RULE.md
if [[ -d "${SRC_AGENT}/skills" ]]; then
  echo "[cursor] Skills: ${SRC_AGENT}/skills -> ${DST_CURSOR}/skills"

  # Clean and recreate skills directory
  rm -rf "${DST_CURSOR}/skills" 2>/dev/null || true
  mkdir -p "${DST_CURSOR}/skills"

  skill_count=0
  for skill_file in "${SRC_AGENT}/skills/"*.md; do
    if [[ -f "$skill_file" ]]; then
      skill_basename="$(basename "$skill_file")"
      skill_name="${skill_basename%.md}"

      # Create skill subdirectory
      mkdir -p "${DST_CURSOR}/skills/${skill_name}"

      # Relative path from .cursor/rules/skills/<name>/ to .agent/skills/<name>.md
      ln -sf "../../../../.agent/skills/${skill_basename}" \
             "${DST_CURSOR}/skills/${skill_name}/RULE.md"
      echo "[cursor]   skills/${skill_name}/RULE.md -> ../../../../.agent/skills/${skill_basename}"

      skill_count=$((skill_count + 1))
    fi
  done

  echo "[cursor] Skills: OK (${skill_count} skills synced)"
else
  echo "[cursor] Skills: no ${SRC_AGENT}/skills (skip)"
fi

# Note: Commands are NOT synced - Cursor IDE doesn't support slash commands

echo "[cursor] done"
